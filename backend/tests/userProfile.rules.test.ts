import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';

async function run() {
	const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
	const environment = await initializeTestEnvironment({
		projectId: 'demo-lumus-profile-tests',
		firestore: { rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8'), host, port: Number(port) },
	});
	try {
		await environment.withSecurityRulesDisabled(async context => {
			await setDoc(doc(context.firestore(), 'users', 'owner'), { name: 'Maria', email: 'maria@example.com', adminUser: false, relatedIdUsers: ['related'] });
		});
		const owner = environment.authenticatedContext('owner').firestore();
		const userRef = doc(owner, 'users', 'owner');
		await assertSucceeds(updateDoc(userRef, { name: 'Maria Silva', updatedAt: serverTimestamp() }));
		const saved = (await getDoc(userRef)).data();
		assert.equal(saved?.name, 'Maria Silva');
		assert.equal(saved?.email, 'maria@example.com');
		assert.equal(saved?.adminUser, false);
		assert.deepEqual(saved?.relatedIdUsers, ['related']);
		await assertFails(updateDoc(doc(environment.authenticatedContext('other').firestore(), 'users', 'owner'), { name: 'Outra pessoa' }));
		await assertFails(updateDoc(doc(environment.unauthenticatedContext().firestore(), 'users', 'owner'), { name: 'Anônimo' }));
		await assertFails(updateDoc(userRef, { name: 'Maria', relatedIdUsers: ['other'] }));
		await assertFails(updateDoc(userRef, { name: 'Maria', financialGroupRole: 'admin' }));
		console.log('User profile rules: passed (own update, preserved fields, denied foreign/anonymous/authorization writes).');
	} finally {
		await environment.clearFirestore();
		await environment.cleanup();
	}
}
void run().catch(error => { console.error(error); process.exitCode = 1; });
