import { createSparkCivilMonthCalendar, type SparkImportedEntry } from '../../../utils/sparkFinancialReconciliation';
import { decodeSparkFinancialValue, prepareSparkBootstrap } from './sparkBootstrapPreflight';
import { canonical, dataDigest, digest, LocalFirestore, LocalSnapshotError, validateDocumentSet, type Fields, type LocalSnapshot, type SnapshotDocument } from './sparkLocalSnapshot';
import { prepareSparkRecurringImport } from './sparkRecurringImport';

/** [[Importação Financeira Local Spark]]: projeção de ensaio, sem ativação nem perda do bruto. */
export const LOCAL_SPARK_IMPORT_VERSION = 'ledger-stage-v4';
export const LOCAL_SPARK_IMPORT_PROTOCOL = 'financial-proof-v17';
export const sparkImportedIdentityId = (groupId: string, transactionId: string) => 'imported_' + digest({ groupId, transactionId });
function fail(message: string): never { throw new LocalSnapshotError(message); }
export function financialFields(value: Record<string, any>): Fields {
  const encode = (item: any): Fields[string] => {
    if (item === null) return { nullValue: null };
    if (item instanceof Date && Number.isFinite(item.valueOf())) return { timestampValue: item.toISOString().replace(/\.000Z$/, 'Z') };
    if (typeof item === 'string') return { stringValue: item };
    if (typeof item === 'boolean') return { booleanValue: item };
    if (typeof item === 'number' && Number.isSafeInteger(item)) return { integerValue: String(item) };
    if (Array.isArray(item)) return { arrayValue: item.length ? { values: item.map(encode) } : {} };
    if (item && typeof item === 'object') {
      const fields = financialFields(item); return { mapValue: Object.keys(fields).length ? { fields } : {} };
    }
    return fail('Campo financeiro não representável sem perda.');
  };
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key, encode(item)]));
}
function safeId(id: string) { if (!id || id.length > 160 || id.includes('/') || ['.', '..'].includes(id)) fail('Identidade incompatível com o protocolo Spark.'); }

/** Confere todas as fronteiras com BigInt, sem confiar apenas no saldo final encoberto por contagem. */
function verifyTemporalHistory(entries: SparkImportedEntry[], kind: string) {
  const times = new Map<number, { delta: bigint; checkpoint?: SparkImportedEntry }>();
  let absolute = 0n;
  for (const entry of entries) {
    if (!Number.isSafeInteger(entry.amountInCents) || Math.abs(entry.amountInCents) > 1e12) fail('Termo histórico fora do limite financeiro.');
    const time = entry.effectiveAt.valueOf(), row = times.get(time) ?? { delta: 0n };
    if (entry.kind === 'checkpoint') {
      if (row.checkpoint) fail('Checkpoints ambíguos no mesmo instante.'); row.checkpoint = entry;
    } else { row.delta += BigInt(entry.amountInCents); absolute += BigInt(Math.abs(entry.amountInCents)); }
    times.set(time, row);
  }
  if (absolute + 2_000_000_000_000n > BigInt(Number.MAX_SAFE_INTEGER)) fail('Envelope do histórico excede a precisão segura da projeção.');
  let balance = 0n;
  for (const [, row] of [...times].sort(([a], [b]) => a - b)) {
    balance = row.checkpoint ? BigInt(row.checkpoint.amountInCents) + (row.checkpoint.includesBoundary ? row.delta : 0n) : balance + row.delta;
    if (balance > 1_000_000_000_000n || balance < -1_000_000_000_000n || kind !== 'bank' && balance < 0n) fail('Histórico contém posição inválida em uma fronteira temporal.');
  }
  return Number(balance);
}

export function buildSparkLedgerImport(snapshot: LocalSnapshot, groupId: string, asOf: Date) {
  const preflight = prepareSparkBootstrap(snapshot, groupId, asOf);
  if (!preflight.canReviewInitialization || !preflight.reconciliation) fail('Preparação possui pendências; execute prepare e revise o relatório antes de importar.');
  safeId(groupId);
  const prefix = `financialGroups/${groupId}`;
  if (snapshot.documents.some(row => row.path.startsWith(prefix + '/spark'))) fail('Namespace Spark já ocupado; não reinicializar ou mesclar importações.');
  const group = snapshot.documents.find(row => row.path === prefix)!;
  const reversed = new Set<string>();
  const transactionsById = new Map(preflight.normalized.transactions.map(event => [event.id, event]));
  for (const event of preflight.normalized.transactions) {
    if (typeof event.actorId !== 'string') fail('Autoria histórica deve ser UID textual válido.'); safeId(event.actorId);
    if ((event.kind === 'reversal') !== !!event.reversesTransactionId) fail('Identidade do estorno incompleta ou incompatível.');
    if (!event.reversesTransactionId) continue;
    const original = transactionsById.get(event.reversesTransactionId);
    if (!original || original.kind === 'reversal' || reversed.has(original.id)) fail('Original de estorno ausente, já resolvido ou sem contrato suportado.');
    reversed.add(original.id);
    if (event.legs.length !== original.legs.length || event.legs.some(leg => !original.legs.some(source => source.accountId === leg.accountId && source.deltaInCents === -leg.deltaInCents))) fail('Estorno não corresponde ao inverso exato das pernas originais.');
  }
  for (const uid of Object.keys((group.fields.members.mapValue as { fields: Fields }).fields)) safeId(uid);
  const basis = { version: LOCAL_SPARK_IMPORT_VERSION, targetProtocol: LOCAL_SPARK_IMPORT_PROTOCOL, sourceSha256: snapshot.sha256, groupId, asOf };
  const importId = 'import_' + digest(basis);
  const additions: SnapshotDocument[] = [];
  const add = (path: string, value: Record<string, unknown>) => additions.push({ path, fields: financialFields(value) });
  const mappings: Array<{ sourceAccountId: string; accountId: string; balanceInCents: number; revision: number }> = [];
  const allEntries = preflight.reconciliation.accounts.flatMap(account => account.entries);
  const recurring = prepareSparkRecurringImport({ snapshot, groupId, asOf, importId, members: Object.keys((group.fields.members.mapValue as { fields: Fields }).fields),
    transactions: preflight.normalized.transactions, mappings: preflight.reconciliation.accounts.map(row => ({ sourceAccountId: row.sourceAccountId, accountId: row.accountId })) });
  const plans = recurring.documents.filter(row => row.path.split('/').length === 4 && row.path.includes('/sparkRecurringPlans/'));
  const firstYear = Math.max(1970, plans.reduce((year, row) => Math.min(year, Number(row.value.startCycle.slice(0, 4))),
    allEntries.reduce((year, entry) => Math.min(year, entry.effectiveAt.getUTCFullYear()), asOf.getUTCFullYear())));
  const lastYear = plans.reduce((year, row) => Math.max(year, Number((row.value.endCycle ?? row.value.startCycle).slice(0, 4))), asOf.getUTCFullYear());
  if (lastYear > 2100 || firstYear > lastYear) fail('Corte fora do calendário Spark suportado.');
  const calendar = createSparkCivilMonthCalendar(firstYear, lastYear);
  const sourcePaths = new Map(snapshot.documents.map(row => [row.path, row]));
  const nodes = new Map<string, Array<{ accountId: string; operationId: string }>>();
  for (const month of calendar) {
    const path = `sparkCivilMonths/${month.cycle}`, fields = financialFields(month);
    if (sourcePaths.has(path)) {
      if (canonical(sourcePaths.get(path)!.fields) !== canonical(fields)) fail('Calendário existente diverge do calendário IANA.');
    } else additions.push({ path, fields });
  }
  for (const account of preflight.reconciliation.accounts) {
    safeId(account.accountId);
    const sourceAccount = sourcePaths.get(`financialAccounts/${account.sourceAccountId}`)!;
    if (sourceAccount.fields.isActive?.booleanValue === false || sourceAccount.fields.archivedAt && sourceAccount.fields.archivedAt.nullValue !== null) {
      fail('Conta arquivada/inativa exige suporte de ciclo de vida antes da importação.');
    }
    if (sourceAccount.fields.isActive && typeof sourceAccount.fields.isActive.booleanValue !== 'boolean') fail('Estado de conta inválido.');
    if (verifyTemporalHistory(account.entries, account.kind) !== account.sourceBalanceInCents) fail('Posição exata diverge do saldo independente.');
    const rootId = 'root_' + digest({ importId, accountId: account.accountId });
    add(`${prefix}/sparkOperations/${rootId}`, { schemaVersion: 1, kind: 'account_opening', actorId: null, accountId: account.accountId,
      accountKind: account.kind, openingBalanceInCents: 0, createdAt: new Date(0), sourceSnapshotSha256: snapshot.sha256, importId });
    let previous = rootId, revision = 0;
    let checkpoint: { operationId: string; effectiveAt: Date; countedBalanceInCents: number; includesBoundary: boolean } | null = null;
    // Ordenação determinística não alega recuperar a ordem real de commits empatados.
    const entries = [...account.entries].sort((a, b) => a.effectiveAt.valueOf() - b.effectiveAt.valueOf() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    for (const entry of entries) {
      const id = 'node_' + digest({ importId, accountId: account.accountId, source: entry.source, entryId: entry.id });
      const path = `${entry.source.collection}/${entry.source.id}`, original = sourcePaths.get(path);
      if (!original) fail('Documento original de entrada histórica ausente.');
      if (entry.source.collection === 'ledgerTransactions') {
        const links = nodes.get(entry.source.id) ?? []; links.push({ accountId: account.accountId, operationId: id }); nodes.set(entry.source.id, links);
      }
      add(`${prefix}/sparkOperations/${id}`, { schemaVersion: 1, kind: entry.kind === 'checkpoint' ? 'imported_checkpoint' : 'imported_movement',
        accountId: account.accountId, actorId: entry.actorId ?? null, expectedRevision: revision, previousOperationId: previous,
        effectiveAt: entry.effectiveAt, createdAt: asOf, differenceInCents: entry.kind === 'movement' ? entry.amountInCents : 0,
        targetBalanceInCents: entry.kind === 'checkpoint' ? entry.amountInCents : 0, includesBoundary: entry.includesBoundary,
        sourcePath: path, sourceDocumentSha256: digest(original.fields), sourceReferences: entry.sourceReferences ?? [], importId });
      revision++; previous = id;
      if (entry.kind === 'checkpoint') {
        checkpoint = { operationId: id, effectiveAt: entry.effectiveAt, countedBalanceInCents: entry.amountInCents, includesBoundary: entry.includesBoundary };
        if (entry.includesBoundary) {
          const month = calendar.find(row => row.startAt.valueOf() === entry.effectiveAt.valueOf());
          if (!month || account.kind !== 'bank') fail('Abertura mensal não corresponde ao calendário bancário canônico.');
          add(`${prefix}/sparkMonthlyOpenings/${account.accountId}/cycles/${month.cycle}`, {
            operationId: id, effectiveAt: entry.effectiveAt, countedBalanceInCents: entry.amountInCents });
        }
      }
    }
    if (checkpoint) add(`${prefix}/sparkCheckpoints/${account.accountId}`, checkpoint);
    add(`${prefix}/sparkPositions/${account.accountId}`, { schemaVersion: 1, kind: account.kind, active: true,
      balanceInCents: account.sourceBalanceInCents, revision, lastOperationId: previous, nextActivationAt: null, updatedAt: asOf });
    const mapping = { sourceAccountId: account.sourceAccountId, accountId: account.accountId, balanceInCents: account.sourceBalanceInCents, revision };
    mappings.push(mapping);
    add(`${prefix}/sparkImportAccounts/${digest(account.sourceAccountId)}`, { ...mapping, importId, sourceDocumentSha256: digest(sourceAccount.fields) });
  }
  // Identidades não entram novamente na cadeia: as pernas já estão nos nós importados.
  const transactions = preflight.normalized.transactions;
  const mappingsBySource = new Map(mappings.map(mapping => [mapping.sourceAccountId, mapping]));
  const reconciledBySource = new Map(preflight.reconciliation.accounts.map(account => [account.sourceAccountId, account]));
  const correctionLinks = new Map<string, string>();
  const replacements = new Set<string>();
  const correctionReversals = new Set<string>();
  const correctionReceipts = snapshot.documents.filter(row => row.path.startsWith(`${prefix}/operations/`) && row.path.split('/').length === 4
    && row.fields.operation?.stringValue === 'correctMovement');
  for (const row of correctionReceipts.filter(row => row.fields.result)) {
    let result: any;
    try { result = decodeSparkFinancialValue(row.fields.result); } catch { fail('Recibo de edição possui resultado incompatível.'); }
    const reversal = transactionsById.get(result?.reversalTransactionId);
    const replacement = transactionsById.get(result?.transactionId);
    const original = reversal?.reversesTransactionId ? transactionsById.get(reversal.reversesTransactionId) : undefined;
    if (!reversal || reversal.kind !== 'reversal' || !replacement || !original
      || !['income', 'expense'].includes(original.kind) || replacement.kind !== original.kind
      || reversal.effectiveAt.valueOf() !== replacement.effectiveAt.valueOf()
      || reversal.actorId !== replacement.actorId || row.fields.actorId?.stringValue !== replacement.actorId
      || correctionLinks.has(original.id) || replacements.has(replacement.id)
      || original.id === replacement.id) fail('Vínculo de edição ausente, duplicado ou incompatível.');
    correctionLinks.set(original.id, replacement.id); replacements.add(replacement.id); correctionReversals.add(reversal.id);
  }
  for (const row of correctionReceipts.filter(row => !row.fields.result)) {
    if (!correctionReversals.has(row.fields.transactionId?.stringValue as string)) fail('Recibo de edição sem vínculo completo com estorno e substituto.');
  }
  for (const originalId of correctionLinks.keys()) {
    const visited = new Set<string>(); let cursor: string | undefined = originalId;
    while (cursor !== undefined) {
      if (visited.has(cursor)) fail('Ciclo entre originais e substitutos de edição.');
      visited.add(cursor); cursor = correctionLinks.get(cursor);
    }
  }
  for (const event of transactions) {
    const legs = event.legs.filter(leg => leg.accountId !== null);
    const mapped = (id: string) => mappingsBySource.get(id)?.accountId ?? fail('Conta da identidade ausente.');
    const ordinary = ['income', 'expense'].includes(event.kind) && legs.length === 1 && event.legs.length === 2
      && legs[0].deltaInCents * (event.kind === 'income' ? 1 : -1) > 0;
    const pair = ['transfer', 'investment_deposit', 'investment_redemption'].includes(event.kind) && legs.length === 2
      && event.legs.length === 2 && legs.some(leg => leg.deltaInCents < 0) && legs.some(leg => leg.deltaInCents > 0);
    if (['income', 'expense'].includes(event.kind) && !ordinary || ['transfer', 'investment_deposit', 'investment_redemption'].includes(event.kind) && !pair) fail('Pernas incompatíveis com a identidade financeira.');
    if (pair) {
      const from = reconciledBySource.get(legs.find(leg => leg.deltaInCents < 0)!.accountId!)!.kind;
      const to = reconciledBySource.get(legs.find(leg => leg.deltaInCents > 0)!.accountId!)!.kind;
      if (!(event.kind === 'transfer' ? from !== 'investment' && to !== 'investment'
        : event.kind === 'investment_deposit' ? from !== 'investment' && to === 'investment' : from === 'investment' && to !== 'investment')) fail('Tipo de investimento incompatível com as contas da identidade.');
    }
    const id = sparkImportedIdentityId(groupId, event.id), source = sourcePaths.get(`ledgerTransactions/${event.id}`)!;
    add(`${prefix}/sparkImportedIdentities/${id}`, { schemaVersion: 1, kind: event.kind, actorId: event.actorId,
      effectiveAt: event.effectiveAt, categoryId: event.categoryId ?? null, note: event.note ?? null,
      ordinaryResolutionAllowed: ordinary && !(event.sourceReferences?.length)
        && reconciledBySource.get(legs[0].accountId!)!.kind !== 'investment',
      pairResolutionAllowed: pair && !(event.sourceReferences?.length),
      ...(ordinary ? { accountId: mapped(legs[0].accountId!), amountInCents: Math.abs(legs[0].deltaInCents) } : {}),
      ...(pair ? { fromAccountId: mapped(legs.find(leg => leg.deltaInCents < 0)!.accountId!),
        toAccountId: mapped(legs.find(leg => leg.deltaInCents > 0)!.accountId!), amountInCents: legs.find(leg => leg.deltaInCents > 0)!.deltaInCents } : {}),
      sourcePath: source.path, sourceDocumentSha256: digest(source.fields), sourceReferences: event.sourceReferences ?? [],
      readModel: { schemaVersion: 1, groupId, kind: event.kind, actorId: event.actorId, effectiveAt: event.effectiveAt,
        categoryId: event.categoryId ?? null, note: event.note ?? null, sourceReferences: event.sourceReferences ?? [],
        legs: event.legs.map(leg => ({ accountId: leg.accountId === null ? null : mapped(leg.accountId), deltaInCents: leg.deltaInCents })),
        reversesIdentityId: event.reversesTransactionId ? sparkImportedIdentityId(groupId, event.reversesTransactionId) : null },
      historyNodes: nodes.get(event.id) ?? [], importId });
    if (event.reversesTransactionId) add(`${prefix}/sparkImportedClaims/${sparkImportedIdentityId(groupId, event.reversesTransactionId)}`, {
      schemaVersion: 1, actorId: event.actorId, reversalOperationId: id, createdAt: event.effectiveAt, importId,
      resolution: correctionLinks.has(event.reversesTransactionId) ? 'correction' : 'reversal',
      replacementIdentityId: correctionLinks.has(event.reversesTransactionId) ? sparkImportedIdentityId(groupId, correctionLinks.get(event.reversesTransactionId)!) : null,
      sourcePath: source.path, sourceDocumentSha256: digest(source.fields) });
  }
  const manifestPath = `${prefix}/migrationRuns/${importId}`;
  for (const row of recurring.documents) add(row.path, row.value);
  const manifestFields = financialFields({ schemaVersion: 1, ...basis, status: 'staged-locked', activationAllowed: false,
    accountCount: mappings.length, generatedDocumentsSha256: dataDigest(additions),
    recurringImport: recurring.report,
    limitations: ['special-source-resolution-requires-adapter', 'no-old-writer-cutover', 'no-live-activation'] });
  manifestFields.originalGroupFields = { mapValue: { fields: group.fields } };
  additions.push({ path: manifestPath, fields: manifestFields });
  const lockedGroup: SnapshotDocument = { ...group, fields: { ...group.fields, status: { stringValue: 'spark_importing' }, sparkImportId: { stringValue: importId } } };
  const documents: SnapshotDocument[] = [...snapshot.documents.map(row => row.path === prefix ? lockedGroup : row), ...additions];
  validateDocumentSet(documents);
  const plan = { format: 'lumus-spark-ledger-import-plan', schemaVersion: 1, ...basis, importId, manifestPath,
    activationAllowed: false, mappings, recurringImport: recurring.report, generatedDocuments: additions, stagedDataSha256: dataDigest(documents) };
  return { ...plan, planSha256: digest(plan), documents };
}

export async function importSparkLedgerLocal(client: LocalFirestore, snapshot: LocalSnapshot, groupId: string, asOf: Date, expectedPlanSha256: string,
  onProgress?: (completed: number, total: number) => void) {
  const plan = buildSparkLedgerImport(snapshot, groupId, asOf);
  if (client.projectId !== snapshot.projectId) fail('Importação exige o mesmo projeto demo-* do snapshot.');
  if (plan.planSha256 !== expectedPlanSha256) fail('Plano mudou; revise o candidato reconstruído antes de importar.');
  const receiptPath = `financialGroups/${groupId}/sparkImportReceipts/${plan.importId}`;
  await client.assertIsolatedEmulator();
  const existing = await client.scan();
  const priorReceipt = existing.find(row => row.path === receiptPath);
  if (priorReceipt) {
    const fields = priorReceipt.fields;
    const keys = ['schemaVersion', 'sourceSha256', 'planSha256', 'stagedDataSha256', 'status', 'activationAllowed', 'verifiedAt'];
    if (Object.keys(fields).length !== keys.length || keys.some(key => !Object.hasOwn(fields, key))
      || fields.schemaVersion?.integerValue !== '1' || typeof fields.verifiedAt?.timestampValue !== 'string'
      || !Number.isFinite(Date.parse(fields.verifiedAt.timestampValue))
      || fields.sourceSha256?.stringValue !== snapshot.sha256 || fields.planSha256?.stringValue !== plan.planSha256
      || fields.stagedDataSha256?.stringValue !== plan.stagedDataSha256 || fields.status?.stringValue !== 'verified-locked'
      || fields.activationAllowed?.booleanValue !== false || dataDigest(existing.filter(row => row.path !== receiptPath)) !== plan.stagedDataSha256)
      fail('Recibo ou destino diverge do plano; retomada bloqueada.');
    return { schemaVersion: 1, sourceSha256: snapshot.sha256, planSha256: plan.planSha256,
      stagedDataSha256: plan.stagedDataSha256, status: 'verified-locked', activationAllowed: false,
      importId: plan.importId, groupId, documents: existing.length, accounts: plan.mappings.length, readyForCutover: false,
      originalDocumentsPreservedExceptGroupLock: true, groupStatusChangedToLock: true, idempotent: true };
  }
  const restore = await client.resumeDocumentSet(plan.documents, onProgress);
  if (restore.dataSha256 !== plan.stagedDataSha256) fail('Dados gravados não correspondem ao plano vinculado; mantenha o grupo bloqueado.');
  const receipt = { schemaVersion: 1, sourceSha256: snapshot.sha256, planSha256: plan.planSha256,
    stagedDataSha256: restore.dataSha256, status: 'verified-locked', activationAllowed: false, verifiedAt: new Date() };
  await client.assertIsolatedEmulator();
  await client.call(':commit', 'POST', { writes: [{ update: {
    name: `projects/${client.projectId}/databases/(default)/documents/${receiptPath}`, fields: financialFields(receipt),
  }, currentDocument: { exists: false } }] });
  const final = await client.scan();
  if (dataDigest(final) !== dataDigest([...plan.documents, { path: receiptPath, fields: financialFields(receipt) }])) fail('Conferência final divergiu; mantenha o grupo bloqueado e isole o destino.');
  return { ...receipt, importId: plan.importId, groupId, documents: final.length, accounts: plan.mappings.length, readyForCutover: false,
    originalDocumentsPreservedExceptGroupLock: true, groupStatusChangedToLock: true, idempotent: false };
}
