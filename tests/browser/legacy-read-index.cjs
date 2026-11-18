// Synthetic data only; the indexer and both SDKs are pinned to the local emulators.
const { chromium } = require('playwright');
const { initializeApp, deleteApp } = require('firebase/app');
const { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } = require('firebase/auth');
const { getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, serverTimestamp, Timestamp } = require('firebase/firestore');
const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');
const { prepareLegacyReadIndex } = require('../../script/legacy-read-index.ts');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

(async () => {
	const app = initializeApp({ apiKey: 'demo-api-key', projectId: 'demo-lumus-foundation' }, `index-browser-${Date.now()}`);
	const auth = getAuth(app), db = getFirestore(app);
	connectAuthEmulator(auth, 'http://127.0.0.1:9098', { disableWarnings: true });
	connectFirestoreEmulator(db, '127.0.0.1', 8089);
	const email = `index-browser-${randomUUID()}@lumus.test`, password = 'Lumus-local-2026!';
	const { user } = await createUserWithEmailAndPassword(auth, email, password);
	await setDoc(doc(db, 'users', user.uid), { name: 'Pessoa Teste', email, adminUser: false, createdAt: serverTimestamp() });
	const bank = randomUUID().replace(/-/g, '').slice(0, 20), tag = `tag${randomUUID()}`, movement = `move${randomUUID()}`;
	const fixture = await initializeTestEnvironment({ projectId: 'demo-lumus-foundation', firestore: { host: '127.0.0.1', port: 8089 } });
	await fixture.withSecurityRulesDisabled(async c => {
		const store = c.firestore();
		await setDoc(doc(store, 'banks', bank), { personId: user.uid, name: 'Conta indexada', valueInCents: 77700 });
		await setDoc(doc(store, 'tags', tag), { personId: user.uid, name: 'Categoria indexada', usageType: 'expense' });
		await setDoc(doc(store, 'expenses', movement), { personId: user.uid, bankId: bank, tagId: tag, name: 'Despesa indexada', valueInCents: 1234, date: Timestamp.now() });
	});
	const prepared = await prepareLegacyReadIndex(fixture, user.uid);
	assert.equal(prepared.created, 3);
	const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ['--no-sandbox'] });
	try {
		const page = await browser.newPage({ viewport: { width: Number(process.env.LUMUS_TEST_WIDTH || 1440), height: Number(process.env.LUMUS_TEST_HEIGHT || 1000) } });
		await page.goto('http://127.0.0.1:4173/web');
		await page.getByLabel('Email', { exact: true }).last().fill(email);
		await page.getByLabel('Senha', { exact: true }).last().fill(password);
		await page.getByRole('button', { name: 'Entrar', exact: true }).click();
		await page.waitForURL('**/web/home**');
		await page.getByText('Conta indexada', { exact: true }).filter({ visible: true }).first().waitFor({ timeout: 30000 });
		await page.getByText('Despesa indexada', { exact: true }).filter({ visible: true }).first().waitFor({ timeout: 30000 });
		await page.goto(`http://127.0.0.1:4173/web/bank-movements?bankId=${bank}&bankSource=legacy&bankName=Conta%20indexada`);
		await page.getByText('Despesa indexada', { exact: true }).first().waitFor({ timeout: 30000 });
		await page.goto('http://127.0.0.1:4173/web/home?tab=2');
		await page.getByText('Categorias', { exact: true }).first().click();
		await page.getByText('Categoria indexada', { exact: true }).first().waitFor({ timeout: 30000 });
		assert.equal((await getDoc(doc(db, 'banks', bank))).data()?.valueInCents, 77700);
		console.log('Banco, categoria e movimento legados indexados apareceram na interface; saldo original preservado.');
	} finally { await browser.close(); await fixture.cleanup(); await deleteApp(app); }
})().catch(error => { console.error(error); process.exitCode = 1; });
