import { buildLegacyLedgerCandidate } from './sparkLegacyLedgerCandidate';
import { buildSparkLedgerImport, financialFields } from './sparkLedgerImport';
import { decodeSparkFinancialValue } from './sparkBootstrapPreflight';
import { digest, LocalSnapshotError, sealSnapshot, validateDocumentSet, type LocalSnapshot, type SnapshotDocument } from './sparkLocalSnapshot';
import { validateSparkAccountCatalog } from '../../../utils/sparkAccountCatalog';
import { sparkCategoryFromRecord, type SparkCategory } from '../../../utils/sparkCategory';

/** Ensaio em memória, restrito a snapshots demo. Não é um writer ou uma autorização de corte. */
export function previewLegacySpark(snapshot: LocalSnapshot, scope: unknown) {
  const candidate = buildLegacyLedgerCandidate(snapshot, scope);
  if (candidate.accounts.some(account => account.kind === 'investment')) {
    throw new LocalSnapshotError('Investimentos legados ainda exigem conversão de capital e metadados antes da prévia Spark.');
  }
  const members = new Set(candidate.memberIds);
  const unsupported = new Set(['mandatoryExpenses', 'mandatoryGains', 'cards', 'investmentCdiRates']);
  for (const row of snapshot.documents) {
    const parts = row.path.split('/');
    if (parts.length !== 2 || !unsupported.has(parts[0])) continue;
    const owner = row.fields.personId?.stringValue;
    const alias = row.fields.userId?.stringValue;
    if (typeof owner !== 'string' || members.has(owner)
      || Object.hasOwn(row.fields, 'userId') && (typeof alias !== 'string' || members.has(alias))) {
      throw new LocalSnapshotError('O escopo contém metadados legados que ainda não são convertidos nesta prévia.');
    }
  }
  const groupId = candidate.groupId, adminId = candidate.memberIds[0];
  const byPath = new Map(snapshot.documents.map(row => [row.path, row]));
  const categoryIds = new Set<string>();
  for (const row of snapshot.documents) if (/^tags\/[^/]+$/.test(row.path)) {
    const owner = row.fields.personId?.stringValue, alias = row.fields.userId?.stringValue;
    if (typeof owner !== 'string' || (row.fields.userId && (typeof alias !== 'string' || alias !== owner))) {
      if (typeof owner !== 'string' || members.has(owner) || typeof alias !== 'string' || members.has(alias)) throw new LocalSnapshotError('Categorias: metadados com titularidade ambígua.');
    } else if (members.has(owner)) categoryIds.add(row.path.slice(5));
  }
  for (const event of candidate.transactions) if (event.categoryId) categoryIds.add(event.categoryId);
  for (const row of snapshot.documents) {
    if (!/^(expenses|gains|mandatoryExpenses|mandatoryGains)\/[^/]+$/.test(row.path)) continue;
    const categoryId = row.fields.tagId?.stringValue;
    if (typeof categoryId !== 'string' || !categoryIds.has(categoryId)) continue;
    const owner = row.fields.personId?.stringValue, alias = row.fields.userId?.stringValue;
    if (typeof owner !== 'string' || !members.has(owner) || row.fields.userId && alias !== owner)
      throw new LocalSnapshotError('Categorias: referência de titular externo ou ambíguo exige revisão.');
  }
  const categoryDocuments: SnapshotDocument[] = [];
  for (const id of categoryIds) {
    if (!id || id.length > 160 || id.includes('/') || id === '.' || id === '..') throw new LocalSnapshotError('Categorias: identidade inválida.');
    const original = byPath.get(`tags/${id}`);
    if (!original) throw new LocalSnapshotError(`Categoria ${id} ausente na origem.`);
    const f = original.fields, owner = f.personId?.stringValue;
    if (typeof owner !== 'string' || !members.has(owner) || f.userId && f.userId.stringValue !== owner
      || f.groupId && f.groupId.stringValue !== groupId || f.schemaVersion || f.deleted && f.deleted.booleanValue !== false)
      throw new LocalSnapshotError('Categorias: titular, grupo ou estado incompatível.');
    let category: SparkCategory;
    try {
      const fields = ['name', 'usageType', 'isMandatoryExpense', 'isMandatoryGain', 'showInBothLists', 'iconFamily', 'iconName', 'iconStyle'];
      const data = Object.fromEntries(fields.filter(key => f[key] !== undefined).map(key => [key, decodeSparkFinancialValue(f[key])]));
      category = sparkCategoryFromRecord(data);
      if (fields.some(key => data[key] != null && data[key] !== (category as any)[key])) throw new Error();
    } catch { throw new LocalSnapshotError('Categorias: campos incompatíveis exigem revisão.'); }
    for (const event of candidate.transactions.filter(event => event.categoryId === id)) {
      if (!['income', 'expense'].includes(event.kind) || !['both', event.kind === 'income' ? 'gain' : 'expense'].includes(category.usageType))
        throw new LocalSnapshotError('Categorias: tipo incompatível com movimento histórico.');
    }
    const created = f.createdAt ? decodeSparkFinancialValue(f.createdAt) : candidate.cutoff;
    if (!(created instanceof Date) || !Number.isFinite(created.valueOf()) || created > candidate.cutoff) throw new LocalSnapshotError('Categorias: data de criação inválida.');
    const operationId = 'import_category_' + digest({ groupId, id, source: f });
    const originPath = `financialGroups/${groupId}/sparkMetadataOrigins/category_${id}`;
    const markerPath = `sparkCategoryReferences/${id}`;
    if (byPath.has(originPath) || byPath.has(markerPath)) throw new LocalSnapshotError('Categorias: origem ou marcador já existente exige revisão.');
    categoryDocuments.push({ path: `tags/${id}`, fields: financialFields({ schemaVersion: 1, personId: owner, groupId, ...category,
      historyKnown: false, deleted: false, revision: 0, lastOperationId: operationId, createdAt: created, updatedAt: candidate.cutoff }) });
    categoryDocuments.push({ path: originPath, fields: { ...financialFields({ schemaVersion: 1, domain: 'category', recordId: id, operationId, createdAt: candidate.cutoff }), source: { mapValue: { fields: f } } } });
    if (candidate.transactions.some(event => event.categoryId === id)) categoryDocuments.push({ path: markerPath, fields: financialFields({ schemaVersion: 1, groupId, categoryId: id, operationId, createdAt: candidate.cutoff }) });
  }
  const additions: SnapshotDocument[] = [];
  const additionPaths = new Set<string>();
  const add = (path: string, data: Record<string, unknown>) => {
    if (byPath.has(path) || additionPaths.has(path)) throw new LocalSnapshotError('Destino sintético colide com documento existente.');
    additionPaths.add(path);
    additions.push({ path, fields: financialFields(data) });
  };
  add(`financialGroups/${groupId}`, { status: 'active', members: Object.fromEntries(candidate.memberIds.map(uid => [uid, uid === adminId ? 'admin' : 'member'])),
    syntheticLegacySourceSha256: snapshot.sha256, syntheticCandidateSha256: candidate.candidateSha256 });
  const profiles = snapshot.documents.map(row => {
    const uid = row.path.startsWith('users/') && row.path.split('/').length === 2 ? row.path.slice(6) : '';
    if (!members.has(uid)) return row;
    add(`financialCutovers/${uid}`, { groupId, synthetic: true });
    return { ...row, fields: { ...row.fields, ...financialFields({ financialGroupId: groupId, financialGroupRole: uid === adminId ? 'admin' : 'member' }) } };
  });
  for (const account of candidate.accounts) add(`financialAccounts/${account.id}`, account);
  for (const event of candidate.transactions) add(`ledgerTransactions/${event.id}`, event);
  for (const opening of candidate.reconciliations) add(`accountReconciliations/${opening.id}`, opening);
  const { sha256: _sourceHash, ...base } = snapshot;
  const virtual = sealSnapshot({ ...base, documents: [...profiles, ...additions] });
  const plan = buildSparkLedgerImport(virtual, groupId, candidate.cutoff);
  const group = plan.documents.find(row => row.path === `financialGroups/${groupId}`);
  if (!group || group.fields.status?.stringValue !== 'spark_importing') throw new LocalSnapshotError('Grupo de prévia não permaneceu bloqueado.');
  const catalogs: SnapshotDocument[] = [];
  const mappingsBySource = new Map(plan.mappings.map(item => [item.sourceAccountId, item]));
  const rootsByAccount = new Map(plan.generatedDocuments.filter(row => row.fields.kind?.stringValue === 'account_opening').map(row => [row.fields.accountId?.stringValue, row]));
  const generatedPaths = new Set(plan.generatedDocuments.map(row => row.path));
  for (const account of candidate.accounts.filter(item => item.kind === 'bank')) {
    const original = byPath.get(`banks/${account.legacyBankId}`), mapping = mappingsBySource.get(account.id);
    if (!original || !mapping) throw new LocalSnapshotError('Banco original ou mapeamento ausente.');
    const value = (name: string) => {
      try { return original.fields[name] === undefined ? null : decodeSparkFinancialValue(original.fields[name]); }
      catch { throw new LocalSnapshotError('Metadado bancário não pode ser convertido sem perda.'); }
    };
    const active = original.fields.isActive === undefined ? true : value('isActive');
    const archivedAt = value('archivedAt');
    if (active !== true || archivedAt !== null) throw new LocalSnapshotError('Banco inativo ou arquivado exige conversão de ciclo de vida.');
    let catalog;
    try {
      catalog = validateSparkAccountCatalog('bank', { name: account.name, colorHex: value('colorHex'), iconKey: value('iconKey'),
        bankAccountId: null, assetType: null, valuationMethod: null, cdiPercentageInBasisPoints: null, redemptionTerm: null, description: null });
    } catch { throw new LocalSnapshotError('Nome, cor ou ícone do banco exige revisão antes da conversão.'); }
    const root = rootsByAccount.get(mapping.accountId);
    const actorId = original.fields.personId?.stringValue;
    if (!root || typeof actorId !== 'string') throw new LocalSnapshotError('Abertura ou titular do cadastro bancário não comprovados.');
    const path = `financialGroups/${groupId}/sparkAccountCatalog/${mapping.accountId}`;
    if (generatedPaths.has(path)) throw new LocalSnapshotError('Cadastro bancário duplicado na prévia.');
    generatedPaths.add(path);
    catalogs.push({ path, fields: financialFields({
      schemaVersion: 1, actorId, accountKind: 'bank', ...catalog, revision: 0, lastOperationId: root.path.split('/').at(-1), updatedAt: candidate.cutoff,
    }) });
  }
  const generatedDocuments = [...plan.generatedDocuments, ...catalogs, ...categoryDocuments];
  validateDocumentSet(generatedDocuments);
  const result = { format: 'lumus-legacy-spark-preview', schemaVersion: 1, sourceSnapshotSha256: snapshot.sha256,
    candidateSha256: candidate.candidateSha256, virtualSnapshotSha256: virtual.sha256, sparkPlanSha256: plan.planSha256,
    groupId, assumedAdminId: adminId, cutoff: candidate.cutoff, mappings: plan.mappings, sourceRecords: candidate.sources,
    generatedDocuments, groupPreview: group,
    canApply: false, readyForCutover: false,
    limitations: ['synthetic-admin-and-cutover', 'unknown-history-before-opening', 'additional-bank-metadata-not-converted',
      'no-auth-inventory-or-consent', 'no-live-writer-cutover', 'no-production-import-or-activation'] };
  return { ...result, previewSha256: digest(result) };
}
