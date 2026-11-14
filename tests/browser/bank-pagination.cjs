// Synthetic browser regression; the Firestore and Auth SDKs use only local emulators.
const { chromium } = require('playwright');
const { initializeApp, deleteApp } = require('firebase/app');
const { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } = require('firebase/auth');
const { getFirestore, connectFirestoreEmulator, doc, setDoc, serverTimestamp } = require('firebase/firestore');
const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');

(async () => {
  const app = initializeApp({ projectId: 'demo-lumus-foundation', apiKey: 'demo-api-key' }, `sparse-banks-${Date.now()}`);
  const auth = getAuth(app); connectAuthEmulator(auth, 'http://127.0.0.1:9098', { disableWarnings: true });
  const db = getFirestore(app); connectFirestoreEmulator(db, '127.0.0.1', 8089);
  const email = `sparse-banks-${Date.now()}@lumus.test`, password = 'Lumus-local-2026!';
  const { user } = await createUserWithEmailAndPassword(auth, email, password);
  await setDoc(doc(db, 'users', user.uid), { name: 'Pessoa Teste', email, adminUser: false, createdAt: serverTimestamp() });
  const env = await initializeTestEnvironment({ projectId: 'demo-lumus-foundation', firestore: { host: '127.0.0.1', port: 8089 } });
  await env.withSecurityRulesDisabled(async context => {
    const store = context.firestore();
    const base = { personId: user.uid, groupId: null, financialGroupId: null, ledgerGroupId: null };
    for (let index = 0; index < 20; index++)
      await setDoc(doc(store, 'banks', `archived-${String(index).padStart(2, '0')}`), { ...base, name: `Arquivada ${index}`, archived: true });
    await setDoc(doc(store, 'banks', 'zz-synthetic-active'), { ...base, name: 'Conta após página vazia' });
  });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ['--no-sandbox'] });
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.route('**/*', route => {
        const url = new URL(route.request().url());
        return ['http:', 'https:'].includes(url.protocol) && url.hostname !== '127.0.0.1' ? route.abort() : route.continue();
      });
      await page.goto('http://127.0.0.1:4173/web');
      await page.getByLabel('Email', { exact: true }).last().fill(email);
      await page.getByLabel('Senha', { exact: true }).last().fill(password);
      await page.getByRole('button', { name: 'Entrar', exact: true }).click();
      await page.waitForURL('**/web/home**');
      await page.goto('http://127.0.0.1:4173/web/home?tab=2');
      await page.getByText('Bancos', { exact: true }).first().click();
      await page.getByText('Nenhum banco nesta parte da lista.', { exact: true }).waitFor();
      await page.getByRole('button', { name: '2', exact: true }).last().click();
      await page.getByText('Conta após página vazia', { exact: true }).first().waitFor();
      await page.close();
      console.log(`Paginação de bancos após página vazia: ${width}px aprovada.`);
    }
  } finally {
    await browser.close(); await env.cleanup(); await deleteApp(app);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
