import { secureOnCall } from './secureCallable';
import { createHash } from 'node:crypto';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { assertClientActionId } from '../../utils/financialLedger';
import { enforceCallableRateLimit } from './callableRateLimit';

const fingerprint = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const relationships = (value: unknown) => Array.isArray(value)
	? Array.from(new Set(value.filter((item): item is string => typeof item === 'string' && Boolean(item)))).sort()
	: [];

// [[Gerenciamento de Usuários]]: vínculo explícito por ID, bidirecional e sem alterar papéis/grupos.
export const userRelationship = secureOnCall( async request => {
	const uid = request.auth?.uid;
	if (!uid) throw new HttpsError('unauthenticated', 'Entre na sua conta para alterar um vínculo.');
	const data = request.data as Record<string, unknown> | null;
	const action = data?.action;
	if (!['preview', 'link', 'unlink', 'list-invites'].includes(String(action))) {
		throw new HttpsError('invalid-argument', 'Operação inválida.');
	}
	await enforceCallableRateLimit(uid, `relationship-${String(action)}`, action === 'preview' || action === 'list-invites' ? 20 : 10);
	const db = getFirestore();
	if (action === 'list-invites') {
		const invites = await db.collection(`userRelationshipInvites/${uid}/incoming`).orderBy('createdAt', 'desc').limit(20).get();
		const senders = await Promise.all(invites.docs.map(async invite => {
			const sender = await db.doc(`users/${invite.id}`).get();
			const createdAt = invite.data().createdAt;
			return sender.exists && invite.data().senderId === invite.id
				&& createdAt instanceof Timestamp && createdAt.toMillis() > Date.now() - 7 * 24 * 60 * 60 * 1000
				? { id: invite.id, name: text(sender.data()?.name) || 'Conta sem nome' } : null;
		}));
		return { invites: senders.filter((sender): sender is { id: string; name: string } => sender !== null) };
	}
	const relatedUserId = text(data?.relatedUserId);
	if (!relatedUserId || relatedUserId.includes('/') || relatedUserId === uid) {
		throw new HttpsError('invalid-argument', 'Informe o ID válido de outra conta e a operação desejada.');
	}
	const clientActionId = text(data?.clientActionId);
	if (action !== 'preview') {
		try { assertClientActionId(clientActionId); }
		catch { throw new HttpsError('invalid-argument', 'Identificador do pedido inválido.'); }
		if (!/^[a-f0-9]{64}$/.test(text(data?.expectedFingerprint))) throw new HttpsError('invalid-argument', 'Confira o vínculo antes de confirmar.');
	}
	const ownerRef = db.doc(`users/${uid}`);
	const targetRef = db.doc(`users/${relatedUserId}`);
	const incomingInviteRef = db.doc(`userRelationshipInvites/${uid}/incoming/${relatedUserId}`);
	const outgoingInviteRef = db.doc(`userRelationshipInvites/${relatedUserId}/incoming/${uid}`);
	const ownerGrantRef = db.doc(`userRelationshipGrants/${uid}/related/${relatedUserId}`);
	const targetGrantRef = db.doc(`userRelationshipGrants/${relatedUserId}/related/${uid}`);
	const operationId = fingerprint([uid, clientActionId]);
	const operationRef = db.doc(`userRelationshipOperations/${operationId}`);
	const requestFingerprint = fingerprint([uid, action, relatedUserId]);
	return db.runTransaction(async transaction => {
        const [first, second] = [uid, relatedUserId].sort();
        const nativePair = await transaction.get(db.doc(`sparkUserRelationships/${first}/sparkRelationshipPairs/${second}`));
        if (nativePair.exists) throw new HttpsError('failed-precondition', 'Este vínculo usa o aplicativo atualizado. Confira o pedido nele.');
		const [owner, target, receipt, incomingInvite, outgoingInvite, ownerGrant, targetGrant] = await Promise.all([
			transaction.get(ownerRef), transaction.get(targetRef),
			action !== 'preview' ? transaction.get(operationRef) : Promise.resolve(null),
			transaction.get(incomingInviteRef), transaction.get(outgoingInviteRef),
			transaction.get(ownerGrantRef), transaction.get(targetGrantRef),
		]);
		if (!owner.exists) throw new HttpsError('permission-denied', 'A conta atual não tem perfil válido.');
		if (!target.exists) throw new HttpsError('not-found', 'Conta não encontrada. Confira o ID informado.');
		if (receipt?.exists) {
			if (receipt.data()?.requestFingerprint !== requestFingerprint) throw new HttpsError('failed-precondition', 'Este identificador já foi usado por outro pedido.');
			return { ...receipt.data()!.result, idempotent: true };
		}
		const ownerLinks = relationships(owner.data()?.relatedIdUsers);
		const targetLinks = relationships(target.data()?.relatedIdUsers);
		const isLinked = ownerGrant.exists && targetGrant.exists && ownerLinks.includes(relatedUserId) && targetLinks.includes(uid);
		const incomingCreatedAt = incomingInvite.data()?.createdAt;
		const hasIncomingInvite = incomingInvite.exists && incomingInvite.data()?.senderId === relatedUserId
			&& incomingCreatedAt instanceof Timestamp
			&& incomingCreatedAt.toMillis() > Date.now() - 7 * 24 * 60 * 60 * 1000;
		const outgoingCreatedAt = outgoingInvite.data()?.createdAt;
		const hasActiveOutgoingInvite = outgoingInvite.exists && outgoingInvite.data()?.senderId === uid
			&& outgoingCreatedAt instanceof Timestamp
			&& outgoingCreatedAt.toMillis() > Date.now() - 7 * 24 * 60 * 60 * 1000;
		const relatedUserName = isLinked || hasIncomingInvite ? text(target.data()?.name) || 'Conta sem nome' : 'Conta informada';
		// A autorização trata o par exibido; outro vínculo no mesmo lote não altera esse efeito.
		const currentFingerprint = fingerprint([uid, relatedUserId, isLinked, hasIncomingInvite, hasActiveOutgoingInvite, relatedUserName]);
		if (action === 'preview') return { relatedUserName, isLinked, hasIncomingInvite, fingerprint: currentFingerprint };
		if (data?.expectedFingerprint !== currentFingerprint) throw new HttpsError('failed-precondition', 'Os vínculos mudaram. Confira o efeito e confirme novamente.');
		let changed = false;
		let status: 'invited' | 'linked' | 'unlinked' = 'unlinked';
		if (action === 'link' && !isLinked && hasIncomingInvite) {
			transaction.update(ownerRef, { relatedIdUsers: FieldValue.arrayUnion(relatedUserId) });
			transaction.update(targetRef, { relatedIdUsers: FieldValue.arrayUnion(uid) });
			transaction.set(ownerGrantRef, { acceptedAt: FieldValue.serverTimestamp() });
			transaction.set(targetGrantRef, { acceptedAt: FieldValue.serverTimestamp() });
			transaction.delete(incomingInviteRef);
			transaction.delete(outgoingInviteRef);
			changed = true;
			status = 'linked';
		} else if (action === 'link') {
			status = isLinked ? 'linked' : 'invited';
			if (!isLinked && !hasActiveOutgoingInvite) {
				transaction.set(outgoingInviteRef, { senderId: uid, createdAt: FieldValue.serverTimestamp() });
				changed = true;
			}
		} else {
			changed = isLinked || incomingInvite.exists || outgoingInvite.exists || ownerLinks.includes(relatedUserId) || targetLinks.includes(uid);
			transaction.update(ownerRef, { relatedIdUsers: FieldValue.arrayRemove(relatedUserId) });
			transaction.update(targetRef, { relatedIdUsers: FieldValue.arrayRemove(uid) });
			transaction.delete(ownerGrantRef);
			transaction.delete(targetGrantRef);
			transaction.delete(incomingInviteRef);
			transaction.delete(outgoingInviteRef);
		}
		const result = { action, status, relatedUserName, changed, idempotent: false };
		transaction.set(operationRef, { uid, relatedUserId, requestFingerprint, result, createdAt: FieldValue.serverTimestamp() });
		transaction.set(db.doc(`userRelationshipAuditEvents/${operationId}`), { actorId: uid, relatedUserId, action, changed, createdAt: FieldValue.serverTimestamp() });
		return result;
	});
});
