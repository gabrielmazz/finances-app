const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { chromium } = require('playwright');
const { initializeApp, deleteApp } = require('firebase/app');
const { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } = require('firebase/auth');
const { getFirestore, connectFirestoreEmulator, doc, setDoc, serverTimestamp } = require('firebase/firestore');
const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');
const { createBank, readBank } = require('../../firebase/banks.ts');
const { createCategory } = require('../../firebase/categories.ts');
const { readMandatoryPage } = require('../../firebase/mandatory.ts');

async function run() {
  const staging = process.env.LUMUS_BROWSER_FIREBASE === 'staging';
  const app = initializeApp(staging ? require('../../firebase/staging-sdk.json') : { apiKey: 'demo-api-key', projectId: 'demo-lumus-foundation' });
  let browser, fixtures;
  try {
    const auth = getAuth(app), db = getFirestore(app);
    if (!staging) {
      connectAuthEmulator(auth, 'http://127.0.0.1:9098', { disableWarnings: true });
      connectFirestoreEmulator(db, '127.0.0.1', 8089);
    }
    const email = `cycles-${randomUUID()}@lumus.test`, password = `A1-${randomUUID()}`;
    const { user: { uid } } = await createUserWithEmailAndPassword(auth, email, password);
    const scope = { kind: 'personal', id: uid, uid }, client = { db, auth };
    const bankId = 'browserCycleBank0001';
    const [legacyBank, legacyCategory, foreignBank] = Array.from({ length: 3 }, () => randomUUID().replace(/-/g, '').slice(0, 20));
    if (!staging) {
      fixtures = await initializeTestEnvironment({ projectId: 'demo-lumus-foundation', firestore: { host: '127.0.0.1', port: 8089 } });
      await fixtures.withSecurityRulesDisabled(async context => {
        const store = context.firestore();
        await setDoc(doc(store, 'banks', legacyBank), { personId: uid, name: 'Conta histórica por ID', institutionName: 'Banco', bankIconKey: 'outro-banco', accountType: 'checking' });
        await setDoc(doc(store, 'tags', legacyCategory), { personId: uid, name: 'Categoria histórica por ID' });
        await setDoc(doc(store, 'banks', foreignBank), { personId: 'outro-titular', name: 'Outra conta sintética' });
      });
    }
    await setDoc(doc(db, 'users', uid), { name: 'Pessoa Teste', email, adminUser: false, createdAt: serverTimestamp() });
    await createBank(client, scope, bankId, { name: 'Banco de ciclos', institutionKey: 'outro-banco', institutionName: 'Banco', accountType: 'checking', colorHex: null, initialBalanceCents: 10000, openingDate: '2025-01-01', reason: '' });
    const category = { showInBothLists: false, iconFamily: null, iconName: null, iconStyle: null };
    await createCategory(client, scope, 'browserCycleExpense1', { ...category, usageType: 'expense', name: 'Curso', isMandatoryExpense: true, isMandatoryGain: false });
    await createCategory(client, scope, 'browserCycleGain0001', { ...category, usageType: 'gain', name: 'Bolsa', isMandatoryExpense: false, isMandatoryGain: true });
    browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(25000);
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    const origin = process.env.LUMUS_BROWSER_ORIGIN || (staging ? 'http://127.0.0.1:4175' : 'http://127.0.0.1:4173');
    assert.match(origin, /^http:\/\/127\.0\.0\.1:\d+$/);
    const url = path => origin + '/web' + path;
    const button = name => page.getByRole('button', { name, exact: true }).last();
    const label = name => page.getByLabel(name, { exact: true }).last();
    const text = value => page.getByText(value, { exact: true }).last();
    const balance = async cents => assert.equal((await readBank(client, scope, { source: 'new', id: bankId })).balanceInCents, cents);
    const waitForLedger = async (cents, type, confirmed) => {
      for (let retry = 0; retry < 30; retry++) {
        const [bank, page] = await Promise.all([readBank(client, scope, { source: 'new', id: bankId }), readMandatoryPage(client, scope, type)]);
        if (bank.balanceInCents === cents && !!page.items[0]?.lastMovementDate === confirmed) return;
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      throw Error('Expected cycle and balance were not persisted');
    };
    try {
      await page.goto(url(''));
      await label('Email').fill(email);
      await label('Senha').fill(password);
      await button('Entrar').click();
      await page.waitForURL('**/web/home**');
      for (const [type, plural, name, tag, cents] of [['expense','expenses','Curso mensal','Curso',2500], ['gain','gains','Bolsa mensal','Bolsa',6000]]) {
        const gain = type === 'gain', kind = gain ? 'ganho' : 'despesa';
        await page.goto(url('/add-mandatory-' + plural));
        await label(gain ? 'Nome do ganho' : 'Nome da despesa').fill(name);
        await label('Valor mensal').fill(String(cents));
        await label(gain ? 'Dia do recebimento' : 'Dia do vencimento').fill('1');
        await label('Escolher categoria obrigatória de ' + kind).click();
        await text(tag).click();
        await button(gain ? 'Registrar ganho' : 'Registrar gasto').click();
        await text(gain ? 'Ganho obrigatório salvo.' : 'Gasto obrigatório salvo.').waitFor();
        assert.equal((await readMandatoryPage(client, scope, type)).items[0].name, name);
      }
      await balance(10000);
      if (staging) {
        await page.goto(url('/home'));
        await text('Curso mensal').waitFor();
        await text('Bolsa mensal').waitFor();
      }
      for (const [type, plural, name, cents] of [['expense','expenses','Curso mensal',7500], ['gain','gains','Bolsa mensal',13500]]) {
        const gain = type === 'gain';
        await page.goto(url('/mandatory-' + plural));
        await label(`Expandir detalhes de ${name}`).click();
        await label(`Registrar ${gain ? 'recebimento' : 'pagamento'} de ${name}`).click();
        await button('Registrar').click();
        await page.waitForURL(gain ? '**/add-register-gain?**' : '**/add-register-expenses?**');
        await label(gain ? 'Selecionar banco do ganho' : 'Selecionar banco da despesa').click();
        await text('Banco de ciclos').click();
        await button(gain ? 'Registrar ganho' : 'Registrar despesa').click();
        await waitForLedger(cents, type, true);
      }
      await page.goto(url('/home'));
      await page.getByRole('img', { name: /Gastos por dia nos últimos três meses/ }).waitFor();
      await page.getByText(/2 ações registradas em/).waitFor();
      await page.goto(url('/mandatory-expenses'));
      await label('Expandir detalhes de Curso mensal').click();
      await label('Desfazer pagamento de Curso mensal').click();
      await page.getByRole('button', { name: /^(Desfazer pagamento|Reivindicar)$/ }).last().click();
      await waitForLedger(16000, 'expense', false);
      if (staging) {
        assert.deepEqual(pageErrors, []);
        console.log('Web no Spark de homologação: compromissos na Home, dois modelos, confirmação de ciclos e estorno.');
        return;
      }
      await page.goto(url('/home?tab=2'));
      await text('Bancos').click();
      await label('ID do banco antigo').fill(foreignBank);
      await button('Consultar pelo ID').click();
      await text('Registro indisponível no contexto atual. Confira o ID.').waitFor();
      await label('ID do banco antigo').fill(legacyBank);
      await button('Consultar pelo ID').click();
      await page.waitForURL('**/add-register-bank?**');
      await page.waitForFunction(() => document.querySelector('input[aria-label="Nome da conta"]')?.value === 'Conta histórica por ID');
      await page.goto(url('/home?tab=2'));
      await text('Categorias').click();
      await label('ID da categoria antiga').fill(legacyCategory);
      await button('Consultar pelo ID').click();
      await page.waitForURL('**/add-register-tag?**');
      assert.deepEqual(pageErrors, []);
      console.log('Ciclos pelos formulários existentes, saldos persistidos e consulta autorizada por ID no emulador.');
    } catch (error) {
      console.error((await page.locator('body').innerText()).slice(0, 2500));
      throw error;
    }
  } finally {
    if (browser) await browser.close();
    if (fixtures) await fixtures.cleanup();
    await deleteApp(app);
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
