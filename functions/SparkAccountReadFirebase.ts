import { getAuth } from 'firebase/auth';
import { collection, doc, documentId, getDocFromServer, getDocsFromServer, limit, orderBy, query, runTransaction, startAfter, Timestamp, type Firestore, type QueryDocumentSnapshot } from 'firebase/firestore';
import { getSparkContextFirebase } from './SparkContextFirebase';
import { assertSparkDocumentId, parseSparkStoredPosition, SPARK_MAX_CENTS, type SparkStoredPosition } from './sparkFinancialProtocol';
import { validateSparkAccountCatalog, type SparkAccountCatalog } from '../utils/sparkAccountCatalog';

export type SparkAccountReadModel = {
  accountId: string; groupId: string; position: SparkStoredPosition; positionStatus: 'current' | 'retained';
  catalog: SparkAccountCatalog | null; catalogRevision: number | null; catalogActorId: string | null;
  lifecycle: { isActive: boolean; archived: boolean; archivedAt: Timestamp | null; revision: number | null };
  principal: { initialValueInCents: number; fundingAccountId: string; revision: number; lastOperationId: string; openingOperationId: string } | null;
  reference: { operationId: string; countedBalanceInCents: number; effectiveAt: Timestamp; includesBoundary: boolean } | null;
};

export async function readSparkMonthlyOpeningFirebase(firestore: Firestore, actorId: string, groupId: string, accountId: string, cycle: string) {
  [actorId, groupId, accountId].forEach(assertSparkDocumentId);
  if (!/^(19[7-9]\d|20\d\d|2100)-(0[1-9]|1[0-2])$/.test(cycle)) throw new Error('Ciclo inválido.');
  const current = () => { if (getAuth(firestore.app).currentUser?.uid !== actorId) throw new Error('A sessão autenticada mudou.'); };
  current();
  const data = (await getDocFromServer(doc(firestore, 'financialGroups', groupId, 'sparkMonthlyOpenings', accountId, 'cycles', cycle))).data();
  current(); if (!data) return null;
  if (!Number.isSafeInteger(data.countedBalanceInCents) || Math.abs(data.countedBalanceInCents) > SPARK_MAX_CENTS
    || !(data.effectiveAt instanceof Timestamp) || typeof data.operationId !== 'string') throw new Error('Abertura mensal inválida.');
  return { valueInCents: data.countedBalanceInCents as number, effectiveAt: data.effectiveAt, operationId: data.operationId as string };
}

/** [[Integração Financeira Spark]]: catálogo, saldo, referência e principal conservam identidades e revisões distintas. */
export async function readSparkAccountFirebase(firestore: Firestore, actorId: string, groupId: string, accountId: string, options: { requireCurrent?: boolean } = {}): Promise<SparkAccountReadModel> {
  [actorId, groupId, accountId].forEach(assertSparkDocumentId);
  const current = () => { if (getAuth(firestore.app).currentUser?.uid !== actorId) throw new Error('A sessão autenticada mudou.'); };
  current();
  return runTransaction(firestore, async transaction => {
    current(); const group = doc(firestore, 'financialGroups', groupId);
    const position = parseSparkStoredPosition((await transaction.get(doc(group, 'sparkPositions', accountId))).data() ?? {});
    const catalogData = (await transaction.get(doc(group, 'sparkAccountCatalog', accountId))).data();
    const state = (await transaction.get(doc(group, 'sparkAccountStates', accountId))).data();
    const validRevision = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= SPARK_MAX_CENTS;
    const lifecycle = state ? { isActive: state.isActive, archived: state.archived, archivedAt: state.archivedAt, revision: state.revision }
      : { isActive: true, archived: false, archivedAt: null, revision: null };
    if (state && (state.schemaVersion !== 1 || state.accountId !== accountId || typeof state.isActive !== 'boolean' || typeof state.archived !== 'boolean'
      || !(state.archived ? state.archivedAt instanceof Timestamp : state.archivedAt === null) || !validRevision(state.revision))
      || position.active !== (lifecycle.isActive && !lifecycle.archived)) throw new Error('Estado da conta precisa de reconciliação.');
    let catalog: SparkAccountCatalog | null = null;
    if (catalogData) {
      if (catalogData.schemaVersion !== 1 || catalogData.accountKind !== position.kind || !validRevision(catalogData.revision) || typeof catalogData.actorId !== 'string') throw new Error('Cadastro da conta inválido.');
      const { schemaVersion: _, accountKind: __, revision: ___, actorId: ____, lastOperationId: _____, updatedAt: ______, ...fields } = catalogData;
      catalog = validateSparkAccountCatalog(position.kind, fields as SparkAccountCatalog);
    }
    // Uma posição arquivada é saldo retido, nunca promessa de atualidade com aberturas futuras vencidas.
    if (position.active && options.requireCurrent !== false) await transaction.get(doc(group, 'sparkCurrentPositions', accountId));
    const capital = position.kind === 'investment' ? (await transaction.get(doc(group, 'sparkInvestmentCapital', accountId))).data() : undefined;
    const checkpoint = (await transaction.get(doc(group, 'sparkCheckpoints', accountId))).data();
    if (capital && (capital.schemaVersion !== 1 || !validRevision(capital.revision) || !validRevision(capital.initialValueInCents)
      || typeof capital.fundingAccountId !== 'string' || typeof capital.lastOperationId !== 'string' || typeof capital.openingOperationId !== 'string')) throw new Error('Principal do investimento inválido.');
    if (checkpoint && (!(checkpoint.effectiveAt instanceof Timestamp) || !Number.isSafeInteger(checkpoint.countedBalanceInCents)
      || Math.abs(checkpoint.countedBalanceInCents) > SPARK_MAX_CENTS || position.kind !== 'bank' && checkpoint.countedBalanceInCents < 0
      || typeof checkpoint.operationId !== 'string' || typeof checkpoint.includesBoundary !== 'boolean')) throw new Error('Referência da conta inválida.');
    current();
    return { accountId, groupId, position, positionStatus: position.active && options.requireCurrent !== false ? 'current' : 'retained', catalog,
      catalogRevision: catalogData?.revision ?? null, catalogActorId: catalogData?.actorId ?? null, lifecycle,
      principal: capital ? { initialValueInCents: capital.initialValueInCents, fundingAccountId: capital.fundingAccountId,
        revision: capital.revision, lastOperationId: capital.lastOperationId, openingOperationId: capital.openingOperationId } : null,
      reference: checkpoint ? { operationId: checkpoint.operationId, countedBalanceInCents: checkpoint.countedBalanceInCents,
        effectiveAt: checkpoint.effectiveAt, includesBoundary: checkpoint.includesBoundary } : null };
  });
}

export async function readSparkAccountsFirebase(firestore: Firestore, actorId: string, groupId: string, options: { requireCurrent?: boolean } = {}): Promise<SparkAccountReadModel[]> {
  const context = await getSparkContextFirebase(firestore, actorId);
  if (!context || context.groupId !== groupId) throw new Error('Grupo Spark indisponível.');
  const result: SparkAccountReadModel[] = []; let cursor: QueryDocumentSnapshot | undefined;
  do {
    const page = await getDocsFromServer(query(collection(firestore, 'financialGroups', groupId, 'sparkPositions'), orderBy(documentId()), ...(cursor ? [startAfter(cursor)] : []), limit(200)));
    for (let offset = 0; offset < page.docs.length; offset += 10) result.push(...await Promise.all(page.docs.slice(offset, offset + 10).map(document => readSparkAccountFirebase(firestore, actorId, groupId, document.id, options))));
    if (page.size < 200) break; cursor = page.docs.at(-1);
  } while (cursor);
  if ((await getSparkContextFirebase(firestore, actorId))?.groupId !== groupId) throw new Error('O acesso ao grupo financeiro mudou.');
  return result;
}
