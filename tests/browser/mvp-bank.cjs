// Synthetic account and data only; both SDK endpoints are pinned to the emulator.
const { chromium } = require('playwright');
const { initializeApp, deleteApp } = require('firebase/app');
const { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } = require('firebase/auth');
const { getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, serverTimestamp, collection, getDocs, query, where, limit } = require('firebase/firestore');
const assert = require('node:assert/strict');

(async () => {
	const app = initializeApp({ apiKey: 'demo-api-key', projectId: 'demo-lumus-foundation' }, `mvp-bank-${Date.now()}`);
	const auth = getAuth(app), db = getFirestore(app);
	connectAuthEmulator(auth, 'http://127.0.0.1:9098', { disableWarnings: true });
	connectFirestoreEmulator(db, '127.0.0.1', 8089);
	const email = `mvp-bank-${Date.now()}@lumus.test`, password = 'Lumus-local-2026!';
	const { user } = await createUserWithEmailAndPassword(auth, email, password);
	await setDoc(doc(db, 'users', user.uid), { name: 'Pessoa Teste', email, adminUser: false, createdAt: serverTimestamp() });
	const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ['--no-sandbox'] });
	try {
		const page = await browser.newPage({ viewport: { width: Number(process.env.LUMUS_TEST_WIDTH || 1440), height: Number(process.env.LUMUS_TEST_HEIGHT || 1000) } });
		await page.goto('http://127.0.0.1:4173/web');
		await page.getByLabel('Email', { exact: true }).last().fill(email);
		await page.getByLabel('Senha', { exact: true }).last().fill(password);
		await page.getByRole('button', { name: 'Entrar', exact: true }).click();
		await page.waitForURL('**/web/home**');
		await page.goto('http://127.0.0.1:4173/web/add-register-bank');
		await page.getByLabel('Nome da conta', { exact: true }).last().fill('Conta MVP');
		await page.getByLabel('Instituição financeira', { exact: true }).last().fill('Banco Teste');
		await page.getByLabel('Saldo inicial disponível', { exact: true }).last().fill('1.000,00');
		await page.getByRole('button', { name: 'Registrar banco', exact: true }).click();
		await page.waitForURL('**/web/home**', { timeout: 30000 });
		const records = await getDocs(query(collection(db, 'financialContexts', `personal:${user.uid}`, 'accountOpenings'), where('type', '==', 'opening'), limit(20)));
		assert.equal(records.size, 1);
		const account = await getDoc(doc(db, 'financialContexts', `personal:${user.uid}`, 'bankAccounts', records.docs[0].id));
		assert.equal(account.data().initialBalanceCents, 100000);
		await page.reload();
		await page.getByText('Conta MVP', { exact: true }).first().waitFor({ timeout: 30000 });
		await page.goto('http://127.0.0.1:4173/web/profile');
		if (Number(process.env.LUMUS_TEST_WIDTH || 1440) < 768) await page.getByRole('button', { name: 'Config', exact: true }).click();
		await page.getByRole('button', { name: 'Sair', exact: true }).first().click();
		await page.getByTestId('logout-confirmation').getByRole('button', { name: 'Sair', exact: true }).click();
		await page.waitForURL('**/web');
		await page.goto('http://127.0.0.1:4173/web/profile');
		await page.getByRole('button', { name: 'Entrar', exact: true }).waitFor();
		console.log('Login, conta com saldo inicial, persistência e logout verificados na interface.');
	} finally { await browser.close(); await deleteApp(app); }
})().catch(error => { console.error(error); process.exitCode = 1; });
