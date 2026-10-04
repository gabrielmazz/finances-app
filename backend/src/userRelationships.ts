import { createHash } from 'node:crypto';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { assertClientActionId } from '../../utils/financialLedger';

const fingerprint = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const relationships = (value: unknown) => Array.isArray(value)
	? Array.from(new Set(value.filter((item): item is string => typeof item === 'string' && Boolean(item)))).sort()
	: [];

// [[Gerenciamento de Usuários]]: vínculo explícito por ID, bidirecional e sem alterar papéis/grupos.
export const userRelationship = onCall({ region: 'southamerica-east1' }, async request => {
	const uid = request.auth?.uid;
	if (!uid) throw new HttpsError('unauthenticated', 'Entre na sua conta para alterar um vínculo.');
	const data = request.data as Record<string, unknown> | null;
	const action = data?.action;
	const relatedUserId = text(data?.relatedUserId);
	if (!['preview', 'link', 'unlink'].includes(String(action)) || !relatedUserId || relatedUserId.includes('/') || relatedUserId === uid) {
		throw new HttpsError('invalid-argument', 'Informe o ID válido de outra conta e a operação desejada.');
	}
	const clientActionId = text(data?.clientActionId);
	if (action !== 'preview') {
		try { assertClientActionId(clientActionId); }
		catch { throw new HttpsError('invalid-argument', 'Identificador do pedido inválido.'); }
		if (!/^[a-f0-9]{64}$/.test(text(data?.expectedFingerprint))) throw new HttpsError('invalid-argument', 'Confira o vínculo antes de confirmar.');
	}
	const db = getFirestore();
	const ownerRef = db.doc(`users/${uid}`);
	const targetRef = db.doc(`users/${relatedUserId}`);
	const operationId = fingerprint([uid, clientActionId]);
	const operationRef = db.doc(`userRelationshipOperations/${operationId}`);
	const requestFingerprint = fingerprint([uid, action, relatedUserId]);
	return db.runTransaction(async transaction => {
		const [owner, target, receipt] = await Promise.all([
			transaction.get(ownerRef), transaction.get(targetRef),
			action !== 'preview' ? transaction.get(operationRef) : Promise.resolve(null),
		]);
		if (!owner.exists) throw new HttpsError('permission-denied', 'A conta atual não tem perfil válido.');
		if (!target.exists) throw new HttpsError('not-found', 'Conta não encontrada. Confira o ID informado.');
		if (receipt?.exists) {
			if (receipt.data()?.requestFingerprint !== requestFingerprint) throw new HttpsError('failed-precondition', 'Este identificador já foi usado por outro pedido.');
			return { ...receipt.data()!.result, idempotent: true };
		}
		const ownerLinks = relationships(owner.data()?.relatedIdUsers);
		const targetLinks = relationships(target.data()?.relatedIdUsers);
		const isLinked = ownerLinks.includes(relatedUserId) && targetLinks.includes(uid);
		const relatedUserName = text(target.data()?.name) || 'Conta sem nome';
		// A autorização trata o par exibido; outro vínculo no mesmo lote não altera esse efeito.
		const currentFingerprint = fingerprint([uid, relatedUserId, ownerLinks.includes(relatedUserId), targetLinks.includes(uid), relatedUserName]);
		if (action === 'preview') return { relatedUserName, isLinked, fingerprint: currentFingerprint };
		if (data?.expectedFingerprint !== currentFingerprint) throw new HttpsError('failed-precondition', 'Os vínculos mudaram. Confira o efeito e confirme novamente.');
		const linking = action === 'link';
		const changed = linking ? !isLinked : ownerLinks.includes(relatedUserId) || targetLinks.includes(uid);
		if (changed) {
			transaction.update(ownerRef, { relatedIdUsers: linking ? FieldValue.arrayUnion(relatedUserId) : FieldValue.arrayRemove(relatedUserId) });
			transaction.update(targetRef, { relatedIdUsers: linking ? FieldValue.arrayUnion(uid) : FieldValue.arrayRemove(uid) });
		}
		const result = { action, relatedUserName, changed, idempotent: false };
		transaction.set(operationRef, { uid, relatedUserId, requestFingerprint, result, createdAt: FieldValue.serverTimestamp() });
		transaction.set(db.doc(`userRelationshipAuditEvents/${operationId}`), { actorId: uid, relatedUserId, action, changed, createdAt: FieldValue.serverTimestamp() });
		return result;
	});
});
