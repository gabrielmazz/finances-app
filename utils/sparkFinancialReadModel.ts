import type { LedgerSourceReference } from './financialLedger';
import { validateSparkMovementDetails, type SparkMovementDetails } from './sparkMovementDetails';

export type SparkReadRecord = { id: string; data: Record<string, any> };
export type SparkReadKind = 'income' | 'expense' | 'transfer' | 'investment_deposit' | 'investment_redemption' | 'principal_change' | 'funding_change' | 'adjustment' | 'valuation' | 'opening';
export type SparkFinancialReadEvent = {
  id: string; operationId: string; accountId: string; component: string; kind: SparkReadKind;
  counterpartyAccountId: string | null;
  economicKind: 'income' | 'expense' | null; effectiveAt: Date; deltaInCents: number; referenceBalanceInCents: number | null;
  term: 'delta' | 'reference';
  actorId: string | null; categoryId: string | null; note: string | null; sourceReferences: LedgerSourceReference[];
  details: SparkMovementDetails | null;
  recurringPlanId?: string | null;
  operationKind?: string;
  accountRevision?: number;
  originalSource: 'live' | 'imported'; originalOperationId: string; resolvesOperationId: string | null;
  resolvesOriginalSource: 'live' | 'imported' | null;
  executionReference: { source: 'live' | 'imported'; operationId: string; family: 'ordinary' | 'pair' } | null;
};
export type SparkExecutionReference = NonNullable<SparkFinancialReadEvent['executionReference']>;
const resolutionKey = (source: 'live' | 'imported', operationId: string) => JSON.stringify([source, operationId]);

/** O ID visual do journal nunca identifica o alvo de uma escrita. As duas fontes têm claims independentes. */
export function getSparkMovementResolutionIndex(events: SparkFinancialReadEvent[], asOfDate?: Date) {
  if (asOfDate && !Number.isFinite(asOfDate.getTime())) throw new Error('Data de consulta inválida.');
  const resolutions = new Map<string, string>();
  for (const event of events) {
    if (asOfDate && event.effectiveAt > asOfDate || !event.resolvesOperationId || !event.resolvesOriginalSource) continue;
    const key = resolutionKey(event.resolvesOriginalSource, event.resolvesOperationId);
    const resolver = event.originalOperationId, previous = resolutions.get(key);
    if (previous && previous !== resolver) throw new Error('Lançamento financeiro possui mais de uma resolução.');
    resolutions.set(key, resolver);
  }
  return { resolvedBy: (reference: SparkExecutionReference) => resolutions.get(resolutionKey(reference.source, reference.operationId)) ?? null };
}

export function getSparkCurrentOrdinaryMovements(events: SparkFinancialReadEvent[], asOfDate?: Date) {
  const resolutions = getSparkMovementResolutionIndex(events, asOfDate);
  return events.filter(event => (!asOfDate || event.effectiveAt <= asOfDate)
    && event.executionReference?.family === 'ordinary' && resolutions.resolvedBy(event.executionReference) === null);
}
const metadata = new Set(['account_opening', 'account_catalog_update', 'account_lifecycle_update', 'investment_cdi_update', 'category_save', 'category_delete',
  'recurring_plan_create', 'recurring_plan_update', 'recurring_replan', 'recurring_replan_reversal', 'recurring_metadata_update', 'monthly_activation', 'imported_recurring_settlement']);
const pairKinds = new Set(['transfer', 'investment_deposit', 'investment_redemption']);
const date = (value: any): Date => {
  const parsed = value instanceof Date ? value : value && typeof value.toDate === 'function' ? value.toDate() : null;
  if (!(parsed instanceof Date) || !Number.isFinite(parsed.getTime())) throw new Error('Evento financeiro sem data válida.'); return parsed;
};
const cents = (value: unknown): number => {
  if (!Number.isSafeInteger(value) || Math.abs(value as number) > 1e12) throw new Error('Termo financeiro inválido.'); return value as number;
};
const account = (value: unknown): string => {
  if (typeof value !== 'string' || !value || value.includes('/')) throw new Error('Conta do evento inválida.'); return value;
};

/** [[Integração Financeira Spark]]: referências, capital e termos econômicos não são somados como se fossem o mesmo tipo de movimento. */
export function buildSparkFinancialReadEvents(groupId: string, records: SparkReadRecord[], identities: SparkReadRecord[] = []): SparkFinancialReadEvent[] {
  const operations = new Map(records.map(row => [row.id, row.data])), imported = new Map(identities.map(row => [row.id, row.data]));
  if (operations.size !== records.length || imported.size !== identities.length) throw new Error('Identidade financeira duplicada.');
  const importedNodes = new Map<string, { identity: SparkReadRecord; accountId: string }>();
  for (const identity of identities) for (const node of identity.data.historyNodes ?? []) {
    if (importedNodes.has(node.operationId)) throw new Error('Nó importado associado a mais de uma identidade.');
    importedNodes.set(node.operationId, { identity, accountId: node.accountId });
  }
  const events: SparkFinancialReadEvent[] = [];
  for (const { id, data: op } of records) {
    if (metadata.has(op.kind)) continue;
    const at = date(op.effectiveAt ?? op.createdAt);
    let categoryId = typeof op.categoryId === 'string' ? op.categoryId : null;
    let sourceReferences: LedgerSourceReference[] = op.sourceReferences ?? [];
    let origin: 'live' | 'imported' = 'live', originalOperationId = id;
    let importedLegs: Array<{ accountId: string | null }> | null = null;
    let actorId = typeof op.actorId === 'string' ? op.actorId : null, note = typeof op.note === 'string' ? op.note : null;
    let details = op.hasDetails === true ? validateSparkMovementDetails(op.details) : null;
    const append = (component: string, accountId: unknown, kind: SparkReadKind, delta: unknown, options: {
      at?: Date; reference?: number; resolves?: string; executable?: 'ordinary' | 'pair';
    } = {}) => {
      const value = cents(delta); if (!value && options.reference === undefined) return;
      const economicKind = kind === 'income' || kind === 'expense' ? kind : null;
      const target = account(accountId);
      const previousRevision = target === op.fromAccountId ? op.fromRevision : target === op.toAccountId ? op.toRevision : target === op.refundAccountId ? op.refundRevision : op.expectedRevision;
      const accountRevision = op.kind === 'investment_opening' && target === op.toAccountId ? 0
        : Number.isSafeInteger(previousRevision) ? previousRevision + 1 : undefined;
      const counterpartyAccountId = importedLegs ? importedLegs.find(leg => leg.accountId !== null && leg.accountId !== target)?.accountId ?? null
        : op.fromAccountId === target ? op.toAccountId ?? null : op.toAccountId === target ? op.fromAccountId ?? null : null;
      events.push({ id: `${id}:${component}`, operationId: id, accountId: target, counterpartyAccountId, component, kind, economicKind,
        recurringPlanId: typeof op.planId === 'string' ? op.planId : null,
        operationKind: op.kind, ...(accountRevision === undefined ? {} : { accountRevision }),
        effectiveAt: options.at ?? at, deltaInCents: value, referenceBalanceInCents: options.reference === undefined ? null : cents(options.reference), term: options.reference === undefined ? 'delta' : 'reference',
        actorId, categoryId, note, sourceReferences, details, originalSource: origin, originalOperationId,
        resolvesOperationId: options.resolves ?? null,
        resolvesOriginalSource: options.resolves ? origin === 'imported' || op.originalSource === 'imported' ? 'imported' : 'live' : null,
        executionReference: options.executable ? { source: origin, operationId: originalOperationId, family: options.executable } : null });
    };
    if (op.kind === 'imported_movement') {
      const link = importedNodes.get(id), identity = link?.identity;
      const source = identity?.data.readModel;
      if (!identity || link!.accountId !== op.accountId || !source || source.schemaVersion !== 1 || source.groupId !== groupId || identity.data.sourcePath !== op.sourcePath
        || !op.sourcePath.startsWith('ledgerTransactions/')) throw new Error('Origem importada precisa de preparação antes da leitura financeira.');
      if (source.kind !== identity.data.kind || !Array.isArray(source.legs) || date(source.effectiveAt).getTime() !== at.getTime()
        || source.legs.filter((leg: any) => leg.accountId === op.accountId).reduce((total: number, leg: any) => total + cents(leg.deltaInCents), 0) !== cents(op.differenceInCents)) throw new Error('Perna importada diverge da projeção imutável.');
      origin = 'imported'; originalOperationId = identity.id;
      importedLegs = source.legs;
      const original = source.reversesIdentityId ? imported.get(source.reversesIdentityId)?.readModel : undefined;
      if (source.kind === 'reversal' && (!original || original.groupId !== groupId)) throw new Error('Origem do estorno importado ausente.');
      const kind = original?.kind ?? source.kind;
      if (!['income', 'expense', 'transfer', 'investment_deposit', 'investment_redemption', 'reconciliation_adjustment', 'migration'].includes(kind)) throw new Error('Tipo de origem importada sem adaptador.');
      categoryId = source.categoryId ?? original?.categoryId ?? null; actorId = source.actorId ?? null; note = source.note ?? null; sourceReferences = source.sourceReferences ?? [];
      details = source.details ? validateSparkMovementDetails(source.details) : null;
      const readKind: SparkReadKind = kind === 'income' || kind === 'expense' || pairKinds.has(kind) ? kind : 'adjustment';
      const resolves = source.reversesIdentityId ?? undefined;
      if (source.kind === 'reversal' && !resolves) throw new Error('Identidade do original importado ausente.');
      append('imported', op.accountId, readKind, op.differenceInCents, { resolves, executable: source.kind === 'reversal' ? undefined
        : identity.data.ordinaryResolutionAllowed ? 'ordinary' : identity.data.pairResolutionAllowed ? 'pair' : undefined });
    } else if (op.kind === 'income' || op.kind === 'expense') {
      append('movement', op.accountId, op.kind, op.differenceInCents, { executable: 'ordinary' });
    } else if (op.kind === 'movement_correction') {
      const original = op.originalSource === 'imported' ? imported.get(op.originalOperationId) : operations.get(op.originalOperationId);
      if (!original) throw new Error('Origem da correção financeira ausente.');
      const replacementCategory = categoryId, replacementDetails = details, replacementNote = note; categoryId = original.categoryId ?? null;
      details = original.hasDetails ? validateSparkMovementDetails(original.details) : original.readModel?.details ? validateSparkMovementDetails(original.readModel.details) : null;
      note = original.note ?? null;
      append('inverse', op.fromAccountId, op.movementKind, -cents(op.originalDeltaInCents), { resolves: op.originalOperationId });
      categoryId = replacementCategory;
      details = replacementDetails; note = replacementNote;
      append('replacement', op.toAccountId, op.movementKind, op.differenceInCents, { executable: 'ordinary' });
    } else if (op.kind === 'movement_reversal') {
      const original = op.originalSource === 'imported' ? imported.get(op.originalOperationId) : operations.get(op.originalOperationId);
      if (!original) throw new Error('Origem do estorno financeiro ausente.'); categoryId = original.categoryId ?? null;
      details = original.hasDetails ? validateSparkMovementDetails(original.details) : original.readModel?.details ? validateSparkMovementDetails(original.readModel.details) : null;
      append('inverse', op.accountId, op.movementKind, op.differenceInCents, { resolves: op.originalOperationId });
    } else if (pairKinds.has(op.kind) || op.kind === 'transfer_reversal') {
      let kind = op.kind;
      if (op.kind === 'transfer_reversal') {
        const original = op.originalSource === 'imported' ? imported.get(op.reversesOperationId) : operations.get(op.reversesOperationId);
        if (!original || !pairKinds.has(original.kind)) throw new Error('Origem do par estornado ausente.'); kind = original.kind;
      }
      const options = op.kind === 'transfer_reversal' ? { resolves: op.reversesOperationId } : { executable: 'pair' as const };
      append('from', op.fromAccountId, kind, -cents(op.amountInCents), options); append('to', op.toAccountId, kind, op.amountInCents, options);
    } else if (op.kind === 'recurring_settlement' || op.kind === 'recurring_reversal') {
      if (op.kind === 'recurring_reversal') {
        const original = operations.get(op.settlementOperationId); if (!original) throw new Error('Efetivação recorrente original ausente.'); categoryId = original.categoryId ?? null;
      }
      append('recurring', op.accountId, op.recurringType === 'gain' ? 'income' : 'expense', op.differenceInCents,
        op.kind === 'recurring_reversal' ? { resolves: op.settlementOperationId } : {});
    } else if (op.kind === 'investment_opening') {
      append('funding', op.fromAccountId, 'investment_deposit', -cents(op.amountInCents));
      append('principal', op.toAccountId, 'investment_deposit', op.amountInCents);
      append('reference', op.toAccountId, 'valuation', op.valuationDifferenceInCents, { reference: op.openingBalanceInCents });
    } else if (op.kind === 'investment_principal_update' || op.kind === 'investment_funding_change') {
      const funding = op.kind === 'investment_funding_change';
      if (funding) append('refund', op.refundAccountId, 'funding_change', op.previousPrincipalInCents);
      const difference = funding ? op.differenceInCents : op.amountInCents;
      append('from', op.fromAccountId, funding ? 'funding_change' : 'principal_change', funding ? -cents(op.principalInCents) : -cents(difference));
      append('to', op.toAccountId, funding ? 'funding_change' : 'principal_change', difference);
    } else if (op.kind === 'adjustment_replacement') {
      append('inverse', op.accountId, 'adjustment', -cents(op.originalDifferenceInCents), { at: date(op.originalEffectiveAt), resolves: op.replacesOperationId });
      append('replacement', op.accountId, 'adjustment', op.differenceInCents);
    } else if (['balance_adjustment', 'dated_adjustment', 'adjustment_reversal'].includes(op.kind)) {
      append('adjustment', op.accountId, 'adjustment', op.differenceInCents, op.kind === 'adjustment_reversal' ? { resolves: op.reversesOperationId } : {});
    } else if (['bank_opening', 'account_bootstrap', 'account_count', 'dated_reconciliation', 'investment_sync', 'investment_edit_valuation', 'investment_valuation_reversal', 'monthly_opening', 'imported_checkpoint'].includes(op.kind)) {
      const opening = op.kind === 'bank_opening' || op.kind === 'account_bootstrap', target = opening ? op.openingBalanceInCents : op.targetBalanceInCents;
      append('reference', op.accountId, opening ? 'opening' : ['investment_sync', 'investment_edit_valuation', 'investment_valuation_reversal'].includes(op.kind) ? 'valuation' : 'adjustment', opening ? target : op.differenceInCents ?? 0,
        { reference: target, ...(op.kind === 'investment_valuation_reversal' ? { resolves: op.reversesOperationId } : {}) });
    } else throw new Error(`Tipo de evento Spark sem adaptador de leitura: ${String(op.kind)}`);
  }
  return events.sort((left, right) => left.effectiveAt.getTime() - right.effectiveAt.getTime() || left.id.localeCompare(right.id));
}
