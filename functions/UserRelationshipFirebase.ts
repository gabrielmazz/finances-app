import { auth, db } from '@/FirebaseConfig';
import { loadSparkUserRelationshipsFirebase, runSparkUserRelationshipFirebase, type UserRelationshipCommand } from './SparkUserRelationshipFirebase';
export type { UserRelationshipCommand, UserRelationshipResult } from './SparkUserRelationshipFirebase';

export async function loadUserRelationshipsFirebase(uid: string) {
  if (!uid || auth.currentUser?.uid !== uid) throw new Error('A conta mudou.');
  return loadSparkUserRelationshipsFirebase(db, uid);
}
export async function listIncomingRelationshipInvitesFirebase(uid: string) {
  return (await loadUserRelationshipsFirebase(uid)).incoming;
}
export async function runUserRelationshipFirebase(uid: string, command: UserRelationshipCommand) {
  if (!uid || auth.currentUser?.uid !== uid) throw new Error('A conta mudou. Confira o pedido novamente.');
  return runSparkUserRelationshipFirebase(db, uid, command);
}
