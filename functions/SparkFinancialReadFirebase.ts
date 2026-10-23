import { getAuth } from 'firebase/auth';
import { collection, documentId, getDocsFromServer, limit, orderBy, query, startAfter, type Firestore, type QueryDocumentSnapshot } from 'firebase/firestore';
import { getSparkContextFirebase } from './SparkContextFirebase';
import { buildSparkFinancialReadEvents, type SparkReadRecord } from '../utils/sparkFinancialReadModel';

/** [[Integração Financeira Spark]]: páginas completas; mudança nas cabeças invalida a fotografia financeira. */
export async function readSparkFinancialEventsFirebase(firestore: Firestore, actorId: string, groupId: string) {
  const current = () => { if (getAuth(firestore.app).currentUser?.uid !== actorId) throw new Error('A sessão autenticada mudou.'); };
  const context = await getSparkContextFirebase(firestore, actorId);
  if (!context || context.groupId !== groupId) throw new Error('Grupo Spark indisponível.');
  const read = async (name: 'sparkPositions' | 'sparkOperations' | 'sparkImportedIdentities') => {
    const rows: SparkReadRecord[] = []; let cursor: QueryDocumentSnapshot | undefined;
    do {
      current();
      const page = await getDocsFromServer(query(collection(firestore, 'financialGroups', groupId, name), orderBy(documentId()), ...(cursor ? [startAfter(cursor)] : []), limit(200)));
      rows.push(...page.docs.map(document => ({ id: document.id, data: document.data() })));
      if (page.size < 200) break; cursor = page.docs.at(-1);
    } while (cursor);
    return rows;
  };
  const heads = (rows: SparkReadRecord[]) => JSON.stringify(rows.map(({ id, data }) => [id, data.revision, data.lastOperationId, data.balanceInCents, data.active,
    data.nextActivationAt?.seconds ?? null, data.nextActivationAt?.nanoseconds ?? null]));
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const before = await read('sparkPositions');
    const [operations, identities] = await Promise.all([read('sparkOperations'), read('sparkImportedIdentities')]);
    const after = await read('sparkPositions');
    if (heads(before) !== heads(after)) continue;
    const events = buildSparkFinancialReadEvents(groupId, operations, identities), accounts = new Set(after.map(row => row.id));
    if (events.some(event => !accounts.has(event.accountId))) throw new Error('Histórico financeiro aponta para conta ausente.');
    if ((await getSparkContextFirebase(firestore, actorId))?.groupId !== groupId) throw new Error('O acesso financeiro mudou.');
    current(); return events;
  }
  throw new Error('O grupo recebeu novas movimentações durante a consulta. Atualize o histórico.');
}
