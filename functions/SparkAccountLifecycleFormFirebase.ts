import { getAuth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import { getSparkContextFirebase } from './SparkContextFirebase';
import { readSparkAccountFirebase } from './SparkAccountReadFirebase';
import { setSparkAccountLifecycleFirebase, type SparkAccountLifecycleInput } from './SparkAccountLifecycleFirebase';

export type SparkAccountLifecycleDraft = { actorId: string; accountId: string } & ({ action: 'archive' | 'restore' } | { action: 'set-active'; isActive: boolean });
export type SparkAccountLifecycleFormState = { intent?: { key: string; input: SparkAccountLifecycleInput; status: 'prepared' | 'uncertain' | 'confirmed' } };

/** Arquivamento e atividade são independentes; a interface não remove a conta nem seus vínculos. */
export async function submitSparkAccountLifecycleFormFirebase(firestore: Firestore, state: SparkAccountLifecycleFormState, draft: SparkAccountLifecycleDraft, newId: () => string) {
  const context = await getSparkContextFirebase(firestore, draft.actorId);
  if (!context) { if (state.intent) throw new Error('O contexto financeiro mudou.'); return null; }
  const key = JSON.stringify({ ...draft, groupId: context.groupId });
  if (state.intent?.key !== key) {
    if (state.intent?.status === 'uncertain') throw new Error('Confirme o resultado anterior com a mesma ação antes de alterar a conta.');
    const account = await readSparkAccountFirebase(firestore, draft.actorId, context.groupId, draft.accountId, { requireCurrent: false });
    state.intent = { key, status: 'prepared', input: { actorId: draft.actorId, groupId: context.groupId, clientActionId: newId(), accountId: draft.accountId,
      expectedPositionRevision: account.position.revision, expectedLifecycleRevision: account.lifecycle.revision,
      isActive: draft.action === 'set-active' ? draft.isActive : account.lifecycle.isActive,
      archived: draft.action === 'archive' ? true : draft.action === 'restore' ? false : account.lifecycle.archived } };
  }
  const intent = state.intent!;
  try {
    if (intent.status !== 'confirmed') { await setSparkAccountLifecycleFirebase(firestore, intent.input); intent.status = 'confirmed'; }
    if (getAuth(firestore.app).currentUser?.uid !== draft.actorId) throw new Error('A sessão autenticada mudou.');
    return { success: true as const, archived: intent.input.archived, isActive: intent.input.isActive };
  } catch (error) {
    if ((error as { sparkIntentCancelled?: boolean })?.sparkIntentCancelled) state.intent = undefined;
    else if (['unavailable', 'deadline-exceeded', 'unknown', 'aborted', 'permission-denied', 'unauthenticated'].includes((error as { code?: string })?.code ?? '')) intent.status = 'uncertain';
    throw error;
  }
}
