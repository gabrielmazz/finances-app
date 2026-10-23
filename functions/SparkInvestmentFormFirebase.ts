import { getAuth } from 'firebase/auth';
import { doc, getDocFromServer, type Firestore } from 'firebase/firestore';
import { getSparkContextFirebase } from './SparkContextFirebase';
import { readSparkAccountFirebase } from './SparkAccountReadFirebase';
import { openDatedFundedSparkInvestmentFirebase, type SparkDatedInvestmentOpeningInput } from './SparkInvestmentOpeningFirebase';
import { updateSparkInvestmentPrincipalFirebase, type SparkInvestmentPrincipalInput } from './SparkInvestmentPrincipalFirebase';
import { changeSparkInvestmentFundingFirebase, type SparkInvestmentFundingInput } from './SparkInvestmentFundingFirebase';
import { prepareSparkInvestmentSyncFirebase, synchronizeSparkInvestmentFirebase, type SparkInvestmentSyncInput } from './SparkInvestmentFirebase';
import { transferSparkDatedFundsFirebase, type SparkDatedTransferInput } from './SparkTransferFirebase';
import { setSparkAccountLifecycleFirebase, type SparkAccountLifecycleInput } from './SparkAccountLifecycleFirebase';
import { saveSparkAccountCatalogFirebase, type SparkAccountCatalogInput } from './SparkAccountCatalogFirebase';
import { sparkFormEffectiveAt } from './SparkMovementFormFirebase';
import { validateSparkAccountCatalog, type SparkAccountCatalog } from '../utils/sparkAccountCatalog';
import { serializeAssistantRecord } from '../utils/assistantRecordFingerprint';
import { toFinancialCivilDate } from '../utils/financialCivilDate';
import type { InvestmentAssetType, InvestmentValuationMethod } from '../utils/investmentPortfolio';
import { prepareSparkInvestmentValuationReversalFirebase, reverseSparkInvestmentValuationFirebase, type SparkInvestmentValuationReversalInput } from './SparkInvestmentValuationReversalFirebase';

type Description = { name: string; bankId: string; cdiPercentageInBasisPoints: number; assetType: InvestmentAssetType;
  valuationMethod: InvestmentValuationMethod; redemptionTerm: string; description: string | null };
export type SparkInvestmentFormDraft = { actorId: string } & (
  | ({ action: 'create'; principalInCents: number; observedValueInCents: number; selectedDate: Date } & Description)
  | ({ action: 'edit'; accountId: string; principalInCents: number; observedValueInCents?: number } & Omit<Description, 'assetType' | 'valuationMethod'> & Partial<Pick<Description, 'assetType' | 'valuationMethod'>>)
  | { action: 'sync'; accountId: string; observedValueInCents: number; selectedDate: Date; reason: 'manual' | 'deposit' | 'withdrawal' }
  | { action: 'move'; accountId: string; bankId: string; amountInCents: number; selectedDate: Date; movement: 'deposit' | 'redemption'; expectedCurrentValueInCents?: number }
  | { action: 'archive' | 'restore'; accountId: string }
  | { action: 'undo-valuation'; accountId: string; reason: string; originalOperationId: string; expectedRevision: number }
);
type Command = { kind: 'create'; input: SparkDatedInvestmentOpeningInput } | { kind: 'principal'; input: SparkInvestmentPrincipalInput }
  | { kind: 'funding'; input: SparkInvestmentFundingInput } | { kind: 'sync'; input: SparkInvestmentSyncInput }
  | { kind: 'move'; input: SparkDatedTransferInput } | { kind: 'lifecycle'; input: SparkAccountLifecycleInput }
  | { kind: 'undo-valuation'; input: SparkInvestmentValuationReversalInput };
export type SparkInvestmentFormState = { intent?: { key: string; actorId: string; groupId: string; accountId: string; command: Command | null;
  catalog: SparkAccountCatalogInput | null; financialConfirmed: boolean; status: 'prepared' | 'uncertain' | 'confirmed' } };
const catalogFor = (draft: Description, previous?: SparkAccountCatalog | null) => validateSparkAccountCatalog('investment', {
  name: draft.name.trim(), colorHex: previous?.colorHex ?? null, iconKey: previous?.iconKey ?? null, bankAccountId: draft.bankId,
  assetType: draft.assetType, valuationMethod: draft.valuationMethod, cdiPercentageInBasisPoints: draft.cdiPercentageInBasisPoints,
  redemptionTerm: draft.redemptionTerm, description: draft.description,
});

/** [[Investimentos]]: abertura/aportes/resgates nunca viram resultado econômico; intenção conserva data e revisão. */
export async function submitSparkInvestmentFormFirebase(firestore: Firestore, state: SparkInvestmentFormState, draft: SparkInvestmentFormDraft, newId: () => string, now = new Date()) {
  draft = 'selectedDate' in draft ? { ...draft, selectedDate: new Date(draft.selectedDate) } : { ...draft }; now = new Date(now);
  const context = await getSparkContextFirebase(firestore, draft.actorId);
  if (!context) { if (state.intent) throw new Error('O contexto financeiro mudou.'); return null; }
  const material = { ...draft, groupId: context.groupId,
    ...('selectedDate' in draft ? { selectedDate: [draft.selectedDate.getFullYear(), draft.selectedDate.getMonth(), draft.selectedDate.getDate()] } : {}) };
  const key = serializeAssistantRecord(material);
  if (state.intent?.key !== key) {
    if (state.intent?.status === 'uncertain' || state.intent?.financialConfirmed && state.intent.status !== 'confirmed') throw new Error('Reenvie os mesmos dados para confirmar o resultado anterior.');
    const identity = { actorId: draft.actorId, groupId: context.groupId, clientActionId: newId() };
    let command: Command | null = null, catalog: SparkAccountCatalogInput | null = null;
    const accountId = draft.action === 'create' ? newId() : draft.accountId;
    if (draft.action === 'create') {
      const bank = await readSparkAccountFirebase(firestore, draft.actorId, context.groupId, draft.bankId);
      command = { kind: 'create', input: { ...identity, accountId, fundingAccountId: draft.bankId, expectedFundingRevision: bank.position.revision,
        principalInCents: draft.principalInCents, observedValueInCents: draft.observedValueInCents, catalog: catalogFor(draft),
        effectiveAt: sparkFormEffectiveAt(draft.selectedDate, now) } };
    } else {
      const account = await readSparkAccountFirebase(firestore, draft.actorId, context.groupId, accountId, { requireCurrent: !['archive', 'restore'].includes(draft.action) });
      if (account.position.kind !== 'investment') throw new Error('Conta de investimento indisponível.');
      if (draft.action === 'edit') {
        if (!account.principal || !account.catalog) throw new Error('Reconcilie o principal e o cadastro antes de editar.');
        const valuation = draft.observedValueInCents !== undefined && draft.observedValueInCents !== account.position.balanceInCents
          ? { operationId: newId(), observedValueInCents: draft.observedValueInCents } : undefined;
        const principal = account.principal, originalBank = await readSparkAccountFirebase(firestore, draft.actorId, context.groupId, principal.fundingAccountId);
        const input: SparkInvestmentPrincipalInput = { ...identity, accountId, fundingAccountId: principal.fundingAccountId, openingOperationId: principal.openingOperationId,
          expectedFundingRevision: originalBank.position.revision, expectedInvestmentRevision: account.position.revision,
          expectedCapitalRevision: principal.revision, expectedCapitalOperationId: principal.lastOperationId, principalInCents: draft.principalInCents,
          ...(valuation ? { valuation } : {}) };
        if (draft.bankId !== principal.fundingAccountId) {
          const bank = await readSparkAccountFirebase(firestore, draft.actorId, context.groupId, draft.bankId);
          command = { kind: 'funding', input: { ...input, newFundingAccountId: draft.bankId, expectedNewFundingRevision: bank.position.revision } };
        } else if (draft.principalInCents !== principal.initialValueInCents || valuation) command = { kind: 'principal', input };
        catalog = { ...identity, clientActionId: newId(), accountId, accountKind: 'investment', expectedCatalogRevision: account.catalogRevision,
          catalog: catalogFor({ ...draft, assetType: draft.assetType ?? account.catalog.assetType!, valuationMethod: draft.valuationMethod ?? account.catalog.valuationMethod! }, account.catalog) };
      } else if (draft.action === 'undo-valuation') {
        if (!account.reference) throw new Error('Não existe avaliação vigente para desfazer.');
        if (account.reference.operationId !== draft.originalOperationId || account.position.revision !== draft.expectedRevision) throw new Error('A avaliação mudou desde a apresentação. Atualize a carteira antes de confirmar.');
        command = { kind: 'undo-valuation', input: { ...identity, accountId, expectedRevision: account.position.revision,
          originalOperationId: draft.originalOperationId, reason: draft.reason } };
      } else if (draft.action === 'sync') {
        let observedAt = sparkFormEffectiveAt(draft.selectedDate, now);
        const reference = account.reference?.effectiveAt, today = toFinancialCivilDate(now);
        const sameDay = (left: Date, right: Date) => left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
        // Hoje usa ao menos a referência já confirmada nesse dia, inclusive seus nanossegundos.
        if (reference && sameDay(draft.selectedDate, today) && sameDay(toFinancialCivilDate(reference.toDate()), draft.selectedDate)
          && (reference.seconds > observedAt.seconds || reference.seconds === observedAt.seconds && reference.nanoseconds > observedAt.nanoseconds)) observedAt = reference;
        command = { kind: 'sync', input: { ...identity, accountId, expectedRevision: account.position.revision,
          observedAt, observedValueInCents: draft.observedValueInCents,
          note: draft.reason === 'deposit' ? 'Sincronização antes do aporte' : draft.reason === 'withdrawal' ? 'Sincronização antes do resgate' : 'Sincronização manual' } };
      }
      else if (draft.action === 'move') {
        if (draft.expectedCurrentValueInCents !== undefined && account.position.balanceInCents !== draft.expectedCurrentValueInCents) throw new Error('O investimento mudou após a conferência. Atualize os valores.');
        command = { kind: 'move', input: { ...identity, fromAccountId: draft.movement === 'deposit' ? draft.bankId : accountId,
          toAccountId: draft.movement === 'deposit' ? accountId : draft.bankId, kind: draft.movement === 'deposit' ? 'investment_deposit' : 'investment_redemption',
          amountInCents: draft.amountInCents, effectiveAt: sparkFormEffectiveAt(draft.selectedDate, now),
          ...(draft.movement === 'deposit' ? { expectedToRevision: account.position.revision } : { expectedFromRevision: account.position.revision }) } };
      } else command = { kind: 'lifecycle', input: { ...identity, accountId, expectedPositionRevision: account.position.revision,
        expectedLifecycleRevision: account.lifecycle.revision, isActive: account.lifecycle.isActive, archived: draft.action === 'archive' } };
    }
    state.intent = { key, actorId: draft.actorId, groupId: context.groupId, accountId, command, catalog, financialConfirmed: false, status: 'prepared' };
  }
  const intent = state.intent!;
  try {
    if (intent.status !== 'confirmed') {
      if (!intent.financialConfirmed && intent.command) {
        const command = intent.command;
        if (command.kind === 'create') await openDatedFundedSparkInvestmentFirebase(firestore, command.input);
        else if (command.kind === 'principal') await updateSparkInvestmentPrincipalFirebase(firestore, command.input);
        else if (command.kind === 'funding') await changeSparkInvestmentFundingFirebase(firestore, command.input);
        else if (command.kind === 'move') await transferSparkDatedFundsFirebase(firestore, command.input);
        else if (command.kind === 'lifecycle') await setSparkAccountLifecycleFirebase(firestore, command.input);
        else {
          // Se a resposta anterior se perdeu, o serviço confere primeiro o receipt sem invalidar sua própria prova pela nova revisão.
          const receipt = await getDocFromServer(doc(firestore, 'financialGroups', intent.groupId, 'sparkOperations', command.input.clientActionId));
          if (!receipt.exists()) {
            const proof = command.kind === 'sync' ? await prepareSparkInvestmentSyncFirebase(firestore, command.input, 20)
              : await prepareSparkInvestmentValuationReversalFirebase(firestore, command.input, 20);
            if (proof.phase !== 'done') return { success: false as const, preparing: true, error: 'Histórico em preparação. Continue a conferência com os mesmos dados.' };
          }
          if (command.kind === 'sync') await synchronizeSparkInvestmentFirebase(firestore, command.input);
          else await reverseSparkInvestmentValuationFirebase(firestore, command.input);
        }
        intent.financialConfirmed = true;
      }
      if (intent.catalog) await saveSparkAccountCatalogFirebase(firestore, intent.catalog);
      intent.status = 'confirmed';
    }
    if (getAuth(firestore.app).currentUser?.uid !== draft.actorId) throw new Error('A sessão autenticada mudou.');
    const current = await readSparkAccountFirebase(firestore, draft.actorId, context.groupId, intent.accountId, { requireCurrent: !['archive', 'restore'].includes(draft.action) });
    return { success: true as const, investmentId: intent.accountId, currentValueInCents: current.position.balanceInCents };
  } catch (error) {
    if ((error as { sparkIntentCancelled?: boolean })?.sparkIntentCancelled) {
      if (intent.financialConfirmed && intent.catalog) { intent.catalog = { ...intent.catalog, clientActionId: newId() }; intent.status = 'uncertain'; }
      else state.intent = undefined;
    } else if (intent.financialConfirmed || ['unavailable', 'deadline-exceeded', 'unknown', 'aborted', 'permission-denied', 'unauthenticated'].includes((error as { code?: string })?.code ?? '')) intent.status = 'uncertain';
    throw error;
  }
}
