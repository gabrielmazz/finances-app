import React from 'react';
import { useFocusEffect } from 'expo-router';
import { auth } from '@/FirebaseConfig';
import { useBankMovementsRequest } from './useBankMovementsRequest';
import { loadUserRelationshipsFirebase, runUserRelationshipFirebase, type UserRelationshipResult } from '@/functions/UserRelationshipFirebase';

type Overview = Awaited<ReturnType<typeof loadUserRelationshipsFirebase>>;
type Prepared = { uid: string; target: string; action: 'link' | 'unlink'; preview: UserRelationshipResult; clientActionId: string; attempted: boolean };
const empty: Overview = { linked: [], incoming: [], outgoing: [] };
const definitive = (error: unknown) => {
  const code = (error as { code?: string })?.code?.replace('firestore/', '');
  return ['permission-denied', 'unauthenticated', 'invalid-argument', 'failed-precondition', 'not-found', 'resource-exhausted'].includes(code ?? '')
    || (error instanceof Error && /Os vínculos mudaram|Este código já pertence|conta ou a tela mudou/.test(error.message));
};
export function useUserRelationships() {
  const { personId: uid, beginRequest, cancelRequest } = useBankMovementsRequest('user-relationships');
  const [stateUid, setStateUid] = React.useState(uid);
  const uidRef = React.useRef(uid); uidRef.current = uid;
  const [overview, setOverview] = React.useState(empty);
  const [name, setName] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState('');
  const [feedback, setFeedback] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [prepared, setPrepared] = React.useState<Prepared | null>(null);
  const pending = React.useRef<Prepared | null>(null);
  const lock = React.useRef<object | null>(null);
  const readReady = React.useRef(false);
  const lastUid = React.useRef(uid), focusedUid = React.useRef<string | null | undefined>(undefined);
  const [retry, setRetry] = React.useState(0);
  const reload = React.useCallback(() => {
    if (lock.current || pending.current?.attempted || uidRef.current !== uid || auth.currentUser?.uid !== uid) return;
    readReady.current = false; pending.current = null; setPrepared(null); setRetry(value => value + 1);
  }, [uid]);
  useFocusEffect(React.useCallback(() => {
    lock.current = null; setBusy(false);
    if (focusedUid.current !== uid) focusedUid.current = uid;
    else reload();
    return cancelRequest;
  }, [uid, reload, cancelRequest]));
  React.useEffect(() => {
    const isCurrent = beginRequest();
    if (lastUid.current !== uid) {
      lastUid.current = uid; setName(''); setFeedback(''); setBusy(false);
      pending.current = null; setPrepared(null); lock.current = null;
    }
    setStateUid(uid); readReady.current = false; setLoading(true); setLoadError(''); setOverview(empty);
    if (!uid) { setLoading(false); setLoadError('Entre novamente para consultar seus vínculos.'); return; }
    void loadUserRelationshipsFirebase(uid).then(result => { if (isCurrent()) { setOverview(result); readReady.current = true; } })
      .catch(() => { if (isCurrent()) setLoadError('Não foi possível carregar seus vínculos. Tente novamente.'); })
      .finally(() => { if (isCurrent()) setLoading(false); });
  }, [uid, retry, beginRequest]);
  const sameSession = stateUid === uid && (auth.currentUser?.uid ?? null) === uid;
  const changeName = (value: string) => { if (!lock.current && !pending.current && uidRef.current === uid && auth.currentUser?.uid === uid) { setName(value); setFeedback(''); } };
  const cancel = () => { if (lock.current || pending.current?.attempted) return; pending.current = null; setPrepared(null); setFeedback(''); };
  const reset = () => { if (lock.current || pending.current?.attempted) return; pending.current = null; setPrepared(null); setName(''); };
  const prepare = async (action: 'link' | 'unlink', target = name) => {
    if (!uid || !sameSession || auth.currentUser?.uid !== uid || uidRef.current !== uid || lock.current || pending.current?.attempted || !readReady.current || loading || loadError) return;
    const trimmed = target.trim();
    if (!trimmed || trimmed === uid) { setFeedback(trimmed ? 'Você não pode vincular sua própria conta.' : 'Informe o ID da outra conta.'); return; }
    const token = {}; lock.current = token; setBusy(true); setFeedback('');
    const isCurrent = beginRequest();
    try {
      const preview = await runUserRelationshipFirebase(uid, { action: 'preview', relatedUserId: trimmed, isCurrent });
      if (!isCurrent()) return;
      if (!preview.fingerprint) throw new Error('Prévia incompleta.');
      const material: Prepared = { uid, target: trimmed, action, preview, clientActionId: `relationship_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`, attempted: false };
      pending.current = material; setPrepared(material); setName(trimmed);
    } catch { if (isCurrent()) setFeedback('Não foi possível conferir essa conta. Verifique o ID e tente novamente.'); }
    finally { if (lock.current === token) { lock.current = null; if (isCurrent()) setBusy(false); } }
  };
  const confirm = async () => {
    const material = pending.current;
    if (!uid || uidRef.current !== uid || auth.currentUser?.uid !== uid || !sameSession || !material || material.uid !== uid || lock.current) return null;
    const token = {}; lock.current = token; setBusy(true); setFeedback('');
    const attempt = { ...material, attempted: true }; pending.current = attempt; setPrepared(attempt);
    const isCurrent = beginRequest();
    try {
      const result = await runUserRelationshipFirebase(uid, { action: material.action, relatedUserId: material.target, clientActionId: material.clientActionId, expectedFingerprint: material.preview.fingerprint, isCurrent });
      if (!isCurrent()) return null;
      pending.current = null; setPrepared(null); setRetry(value => value + 1);
      return { ...result, action: material.action };
    } catch (error) {
      if (isCurrent()) {
        if (definitive(error)) { pending.current = null; setPrepared(null); setFeedback((error as { code?: string })?.code === 'resource-exhausted' && error instanceof Error ? error.message : 'O pedido não pôde ser confirmado. Atualize os vínculos e confira o efeito novamente.'); }
        else setFeedback('Não foi possível confirmar o resultado. Confirme a mesma operação antes de iniciar outra.');
      }
      return null;
    } finally { if (lock.current === token) { lock.current = null; if (isCurrent()) setBusy(false); } }
  };
  return { name: sameSession ? name : '', changeName, overview: sameSession ? overview : empty,
    loading: !sameSession || loading, loadError: sameSession ? loadError : '', busy: sameSession && busy,
    prepared: sameSession ? prepared : null, feedback: sameSession ? feedback : '', reload, prepare, confirm, cancel, reset };
}
