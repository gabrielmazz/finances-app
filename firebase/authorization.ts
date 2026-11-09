import { doc, getDocFromServer } from 'firebase/firestore';
import type { AccountClient } from './profiles';
import { authorizationGeneration, parseAuthorization } from '../domain/authorization';
import { measureRead } from './diagnostics';

export async function loadAuthorization(client: AccountClient, uid: string) {
	const user = client.auth.currentUser;
	if (user?.uid !== uid) throw new Error('session/changed');
	const token = await user.getIdTokenResult();
	if (client.auth.currentUser?.uid !== uid) throw new Error('session/changed');
	const generation = authorizationGeneration(token.claims.lumusAccess);
	if (!generation) return null;
	const result = await measureRead('authorization.get', () => getDocFromServer(doc(client.db, '_authorizations', uid)), () => 1);
	if (client.auth.currentUser?.uid !== uid) throw new Error('session/changed');
	if (!result.exists()) throw new Error('context/access-denied');
	return parseAuthorization(result.data(), generation);
}
