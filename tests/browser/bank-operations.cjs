const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { chromium } = require('playwright');
const { initializeApp, deleteApp } = require('firebase/app');
const { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } = require('firebase/auth');
const { getFirestore, connectFirestoreEmulator, doc, setDoc, serverTimestamp, Timestamp } = require('firebase/firestore');
const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');
const { createBank, prepareLegacyReference, readBank } = require('../../firebase/banks.ts');
const { createCategory } = require('../../firebase/categories.ts');
const { financialDateKey, financialDayStart } = require('../../utils/financialCivilDate.ts');

async function run() {
  const staging = process.env.LUMUS_BROWSER_FIREBASE === 'staging';
  const canonicalEmulator = process.env.LUMUS_BROWSER_FIREBASE === 'canonical-emulator';
  const app = initializeApp(staging ? require('../../firebase/staging-sdk.json') : { apiKey: 'demo-api-key', projectId: 'demo-lumus-foundation' });
  let browser;
  try {
    const auth = getAuth(app);
    const db = getFirestore(app);
    if (!staging) {
      connectAuthEmulator(auth, 'http://127.0.0.1:9098', { disableWarnings: true });
      connectFirestoreEmulator(db, '127.0.0.1', 8089);
    }
    const email = `bank-operations-${randomUUID()}@lumus.test`, password = `A1-${randomUUID()}`;
    const { user } = await createUserWithEmailAndPassword(auth, email, password);
    const scope = { kind: 'personal', id: user.uid, uid: user.uid }, client = { db, auth };
    await setDoc(doc(db, 'users', user.uid), { name: 'Pessoa Teste', email, adminUser: false, createdAt: serverTimestamp() });
    // The SDK connections are already pinned to the emulator. Select the
    // canonical adapter in this process, as in the canonical integration tests.
    if (canonicalEmulator) db.app.options.projectId = require('../../firebase/staging-sdk.json').projectId;

    const bankA = 'browserOpsBankA00001', bankB = 'browserOpsBankB00001';
    const bank = { institutionKey: 'outro-banco', institutionName: 'Banco', accountType: 'checking', colorHex: null, openingDate: '2025-01-01', reason: '' };
    await createBank(client, scope, bankA, { ...bank, name: 'Banco de teste A', initialBalanceCents: 100000 });
    await createBank(client, scope, bankB, { ...bank, name: 'Banco de teste B', initialBalanceCents: 50000 });
    const referenceBank = 'browserReference0001';
    if (canonicalEmulator) {
      const fixtures = await initializeTestEnvironment({ projectId: 'demo-lumus-foundation', firestore: { host: '127.0.0.1', port: 8089 } });
      try {
        const referenceAt = financialDayStart(new Date(financialDateKey(new Date())));
        const stamp = Timestamp.fromDate(referenceAt);
        await fixtures.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), 'financialContexts', `personal:${user.uid}`, 'bankAccounts', referenceBank), {
          schemaVersion: 1, scopeKind: 'personal', scopeId: user.uid, name: 'Banco com referência', status: 'active', revision: 0,
          institutionKey: bank.institutionKey, institutionName: bank.institutionName, accountType: bank.accountType, colorHex: null,
          historicalSourcePath: `banks/${referenceBank}`, referenceNotBefore: stamp,
          createdAt: stamp, updatedAt: stamp, createdBy: user.uid, updatedBy: user.uid,
        }));
        await prepareLegacyReference(client, scope, referenceBank, { ...bank, name: 'Banco com referência',
          initialBalanceCents: 1000, referenceAt, confirmed: true, pendingReviewed: true });
      } finally { await fixtures.cleanup(); }
    }
    const category = { showInBothLists: true, iconFamily: null, iconName: null, iconStyle: null };
    await createCategory(client, scope, 'browserOpsGain000001', { ...category, name: 'Renda de teste', usageType: 'gain', isMandatoryGain: true, isMandatoryExpense: false });
    await createCategory(client, scope, 'browserOpsCost000001', { ...category, name: 'Conta de teste', usageType: 'expense', isMandatoryGain: false, isMandatoryExpense: true });

    browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
    const origin = process.env.LUMUS_BROWSER_ORIGIN || (staging ? 'http://127.0.0.1:4175' : 'http://127.0.0.1:4173');
    assert.match(origin, /^http:\/\/127\.0\.0\.1:\d+$/);
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, timezoneId: 'UTC' });
    page.setDefaultTimeout(30000);
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    const go = (path = '') => page.goto(origin + '/web' + path);
    const button = name => page.getByRole('button', { name, exact: true }).last();
    const text = name => page.getByText(name, { exact: true }).last();
    const select = async (label, option) => {
      await page.getByLabel(label, { exact: true }).last().click();
      await text(option).click();
    };
    const balance = async (id, cents) => assert.equal((await readBank(client, scope, { id, source: 'new' })).balanceInCents, cents);

    await go();
    await page.getByLabel('Email', { exact: true }).last().fill(email);
    await page.getByLabel('Senha', { exact: true }).last().fill(password);
    await button('Entrar').click();
    await page.waitForURL('**/web/home**');

    async function post(type, name, cents, tag, expected) {
      const gain = type === 'gain';
      const label = gain ? 'ganho' : 'despesa';
      await go(gain ? '/add-register-gain' : '/add-register-expenses');
      await page.getByLabel(`Nome ${gain ? 'do' : 'da'} ${label}`, { exact: true }).last().fill(name);
      await page.getByLabel(`Valor ${gain ? 'do' : 'da'} ${label}`, { exact: true }).last().fill(String(cents));
      assert.equal(await page.getByLabel('Horário em São Paulo', { exact: true }).count(), 0);
      if (gain) await text('Renda variável').click();
      await select(`Selecionar banco ${gain ? 'do' : 'da'} ${label}`, 'Banco de teste A');
      await select(`Escolher categoria de ${label}`, tag);
      await button(`Registrar ${label}`).click();
      await text(gain ? 'Receita cadastrada.' : 'Despesa cadastrada.').waitFor();
      await balance(bankA, expected);
    }

    await post('gain', 'Receita de teste', 20000, 'Renda de teste', 120000);
    await post('expense', 'Despesa de teste', 8000, 'Conta de teste', 112000);
    await post('expense', 'Gasto obrigatório de teste', 5000, 'Conta de teste (gasto obrigatório)', 107000);
    await post('gain', 'Ganho obrigatório de teste', 10000, 'Renda de teste (ganho obrigatório)', 117000);

    await go('/transfer-screen');
    await select('Selecionar banco de origem da transferência', 'Banco de teste A');
    await select('Selecionar banco de destino da transferência', 'Banco de teste B');
    await page.getByPlaceholder('R$ 0,00', { exact: true }).last().fill('30000');
    await button('Confirmar transferência').click();
    await text('Transferência registrada.').waitFor();
    await balance(bankA, 87000);
    await balance(bankB, 80000);

    await go('/add-rescue');
    await select('Selecionar banco de origem do saque', 'Banco de teste A');
    await page.getByPlaceholder('Ex: R$ 150,00', { exact: true }).last().fill('7000');
    await button('Registrar saque').click();
    await text('Saque registrado.').waitFor();
    await balance(bankA, 80000);
    await balance(bankB, 80000);

    const statement = id => `/bank-movements?bankId=${id}&bankSource=new`;
    const detail = name => page.getByLabel(`Expandir detalhes de ${name}`, { exact: true }).last();
    await go(statement(bankA));
    await detail('Gasto obrigatório de teste').waitFor();
    await detail('Ganho obrigatório de teste').waitFor();
    await detail('Saque em dinheiro').waitFor();
    await detail('Transferência entre bancos').click();
    await text('Transferência enviada para Banco de teste B.').waitFor();
    await go(statement(bankB));
    await page.reload();
    await detail('Transferência entre bancos').click();
    await text('Transferência recebida de Banco de teste A.').waitFor();
    await go('/home');
    await page.getByText(/R\$\s*800,00/).first().waitFor();
    if (staging) {
      await page.getByText('Total ganho', { exact: true }).locator('..').getByText(/R\$\s*300,00/).waitFor();
      await page.getByText('Total gasto', { exact: true }).locator('..').getByText(/R\$\s*130,00/).waitFor();
    }
    await go(statement(bankB));
    await detail('Transferência entre bancos').click();
    await page.getByLabel('Estornar Transferência entre bancos', { exact: true }).click();
    await button('Estornar').click();
    await text('Estorno confirmado.').waitFor();
    await balance(bankA, 110000);
    await balance(bankB, 50000);
    await go(statement(bankA));
    await detail('Saque em dinheiro').click();
    await page.getByLabel('Estornar saque de Saque em dinheiro', { exact: true }).click();
    await button('Estornar saque').click();
    await text('Estorno confirmado.').waitFor();
    await balance(bankA, 117000);

    if (canonicalEmulator) {
      await go('/add-register-expenses');
      await page.getByLabel('Nome da despesa', { exact: true }).last().fill('Já conciliada');
      await page.getByLabel('Valor da despesa', { exact: true }).last().fill('1200');
      await select('Selecionar banco da despesa', 'Banco com referência');
      await select('Escolher categoria de despesa', 'Conta de teste');
      await button('Registrar despesa').click();
      await text('Já estava no saldo de referência?').waitFor();
      await button('Voltar').click();
      assert.equal(await page.getByLabel('Nome da despesa', { exact: true }).last().inputValue(), 'Já conciliada');
      await balance(referenceBank, 1000);
      await button('Registrar despesa').click();
      await button('Já estava incluída').click();
      await text('Despesa cadastrada.').waitFor();
      await balance(referenceBank, 1000);

      await go('/add-rescue');
      await select('Selecionar banco de origem do saque', 'Banco com referência');
      await page.getByPlaceholder('Ex: R$ 150,00', { exact: true }).last().fill('100');
      await button('Registrar saque').click();
      await button('Movimentar o saldo').click();
      await text('Saque registrado.').waitFor();
      await balance(referenceBank, 900);
    }

    const savedSession = await page.context().storageState();
    await page.context().close();
    const reopened = await browser.newContext({ storageState: savedSession, viewport: { width: 390, height: 844 } });
    const mobile = await reopened.newPage();
    await mobile.goto(origin + '/web/profile');
    await mobile.locator('#profile-id').waitFor();
    assert.equal(await mobile.locator('#profile-id').inputValue(), user.uid);
    await mobile.setViewportSize({ width: 1440, height: 1000 });
    await mobile.getByRole('button', { name: 'Sair', exact: true }).first().click();
    await mobile.getByTestId('logout-confirmation').getByRole('button', { name: 'Sair', exact: true }).click();
    await mobile.waitForURL('**/web');
    await mobile.goto(origin + '/web/profile');
    await mobile.getByRole('button', { name: 'Entrar', exact: true }).waitFor();
    assert.equal(new URL(mobile.url()).pathname, '/web');
    assert.deepEqual(pageErrors, []);
    console.log(`Web em ${staging ? 'Spark de homologação' : 'emulador'}: login, reabertura, logout, Home, extrato e operações verificados. Saldos após estornos: 117000 / 50000 centavos.`);
  } finally {
    if (browser) await browser.close();
    await deleteApp(app);
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
