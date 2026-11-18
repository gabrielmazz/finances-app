const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { chromium } = require('playwright');
const { initializeApp, deleteApp } = require('firebase/app');
const { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } = require('firebase/auth');
const { getFirestore, connectFirestoreEmulator, doc, setDoc, serverTimestamp } = require('firebase/firestore');
const { createBank, readBank } = require('../../firebase/banks.ts');
const { createCategory } = require('../../firebase/categories.ts');

async function run() {
  const app = initializeApp({ apiKey: 'demo-api-key', projectId: 'demo-lumus-foundation' });
  let browser;
  try {
    const auth = getAuth(app);
    const db = getFirestore(app);
    connectAuthEmulator(auth, 'http://127.0.0.1:9098', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8089);
    const email = `bank-operations-${randomUUID()}@lumus.test`, password = 'Demo-only123!';
    const { user } = await createUserWithEmailAndPassword(auth, email, password);
    const scope = { kind: 'personal', id: user.uid, uid: user.uid }, client = { db, auth };
    await setDoc(doc(db, 'users', user.uid), { name: 'Pessoa Teste', email, adminUser: false, createdAt: serverTimestamp() });

    const bankA = 'browserOpsBankA00001', bankB = 'browserOpsBankB00001';
    const bank = { institutionKey: 'outro-banco', institutionName: 'Banco', accountType: 'checking', colorHex: null, openingDate: '2025-01-01', reason: '' };
    await createBank(client, scope, bankA, { ...bank, name: 'Banco de teste A', initialBalanceCents: 100000 });
    await createBank(client, scope, bankB, { ...bank, name: 'Banco de teste B', initialBalanceCents: 50000 });
    const category = { showInBothLists: true, iconFamily: null, iconName: null, iconStyle: null };
    await createCategory(client, scope, 'browserOpsGain000001', { ...category, name: 'Renda de teste', usageType: 'gain', isMandatoryGain: true, isMandatoryExpense: false });
    await createCategory(client, scope, 'browserOpsCost000001', { ...category, name: 'Conta de teste', usageType: 'expense', isMandatoryGain: false, isMandatoryExpense: true });

    browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(30000);
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    const go = (path = '') => page.goto('http://127.0.0.1:4173/web' + path);
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
    assert.deepEqual(pageErrors, []);
    console.log('Login persistente, Home, extratos, receita, despesa, obrigatórios avulsos, transferência e saque verificados com Firestore Emulator. Saldos finais: 80000 / 80000 centavos.');
  } finally {
    if (browser) await browser.close();
    await deleteApp(app);
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
