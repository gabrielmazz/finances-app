import { getAuth } from 'firebase/auth';
import { doc, getDocFromServer, type Firestore } from 'firebase/firestore';
import { assertSparkDocumentId, SPARK_TRANSFER_PROOF_PROTOCOL } from './sparkFinancialProtocol';

/** [[Integração Financeira Spark]]: ausência de suporte não autoriza retorno ao armazenamento legado. */
export async function getSparkContextFirebase(firestore: Firestore, actorId: string) {
  assertSparkDocumentId(actorId);
  const current = () => { if (getAuth(firestore.app).currentUser?.uid !== actorId) throw new Error('A sessão autenticada mudou.'); };
  current();
  const profile = (await getDocFromServer(doc(firestore, 'users', actorId))).data();
  current();
  if (!profile?.financialGroupId) {
    if (profile?.financialLegacyCutoverAt) throw new Error('O grupo financeiro precisa ser recuperado antes de continuar.');
    return null;
  }
  assertSparkDocumentId(profile.financialGroupId);
  const group = (await getDocFromServer(doc(firestore, 'financialGroups', profile.financialGroupId))).data();
  current();
  if (!group || !['admin', 'member'].includes(group.members?.[actorId])) throw new Error('Acesso financeiro revogado.');
  if (group.status !== 'active') throw new Error('A preparação financeira deste grupo ainda não foi concluída.');
  if (group.sparkProtocol == null) return null;
  if (group.sparkProtocol !== SPARK_TRANSFER_PROOF_PROTOCOL) throw new Error('O protocolo financeiro do grupo precisa ser atualizado.');
  return { groupId: profile.financialGroupId as string, actorId, role: group.members[actorId] as 'admin' | 'member' };
}
