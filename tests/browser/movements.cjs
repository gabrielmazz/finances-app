const { chromium } = require('playwright');
const { initializeApp, deleteApp } = require('firebase/app');
const { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } = require('firebase/auth');
const { getFirestore, connectFirestoreEmulator, doc, setDoc, getDoc, serverTimestamp, Timestamp } = require('firebase/firestore');
const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');
const assert = require('node:assert/strict');

(async () => {
  const app = initializeApp({ apiKey: 'demo-api-key', projectId: 'demo-lumus-foundation' }, `movements-${Date.now()}`);
  const auth = getAuth(app); connectAuthEmulator(auth, 'http://127.0.0.1:9098', { disableWarnings: true });
  const db = getFirestore(app); connectFirestoreEmulator(db, '127.0.0.1', 8089);
  const email = `movements-${Date.now()}@lumus.test`, password = 'Lumus-local-2026!';
  const { user } = await createUserWithEmailAndPassword(auth, email, password);
  await setDoc(doc(db, 'users', user.uid), { name: 'Pessoa Teste', email, adminUser: false, createdAt: serverTimestamp() });
  const bank = 'browserMovementBank1', zeroBank = 'browserArchiveBank01', sparseBank = 'legacySparseBank0001', gain = 'browserGainCategory1', expense = 'browserCostCategory1';
  const key = `personal:${user.uid}`;
  const fixtures = await initializeTestEnvironment({ projectId: 'demo-lumus-foundation', firestore: { host: '127.0.0.1', port: 8089 } });
  await fixtures.withSecurityRulesDisabled(async context => {
    const store = context.firestore(), now = Timestamp.now(), opening = Timestamp.fromDate(new Date('2025-01-01T00:00:00Z'));
    const meta = { schemaVersion: 1, scopeKind: 'personal', scopeId: user.uid, status: 'active', revision: 0, createdBy: user.uid, updatedBy: user.uid, createdAt: now, updatedAt: now };
    await setDoc(doc(store, 'financialContexts', key, 'bankAccounts', bank), { ...meta, name: 'Banco Teste', institutionKey: 'outro-banco', institutionName: 'Banco', accountType: 'checking', colorHex: null, initialBalanceCents: 100000, openingDate: opening });
    await setDoc(doc(store, 'financialContexts', key, 'accountOpenings', bank), { schemaVersion: 1, scopeKind: 'personal', scopeId: user.uid, accountId: bank, type: 'opening', amountCents: 100000, date: opening, reason: '', createdBy: user.uid, createdAt: now });
    await setDoc(doc(store, 'financialContexts', key, 'bankAccounts', zeroBank), { ...meta, name: 'Conta para arquivar', institutionKey: 'outro-banco', institutionName: 'Banco', accountType: 'checking', colorHex: null, initialBalanceCents: 0, openingDate: opening });
    await setDoc(doc(store, 'financialContexts', key, 'accountOpenings', zeroBank), { schemaVersion: 1, scopeKind: 'personal', scopeId: user.uid, accountId: zeroBank, type: 'opening', amountCents: 0, date: opening, reason: '', createdBy: user.uid, createdAt: now });
    await setDoc(doc(store, '_categoryScopes', 'browserLegacyTag0001'), { scopeKind: 'personal', scopeId: user.uid });
    await setDoc(doc(store, 'tags', 'browserLegacyTag0001'), { personId: user.uid, name: 'Categoria histórica', usageType: 'expense', status: 'archived' });
    await setDoc(doc(store, 'banks', sparseBank), { personId: user.uid, groupId: null, financialGroupId: null, ledgerGroupId: null, name: 'Conta antiga', valueInCents: 98765, isActive: true });
    for (let i = 0; i < 20; i++) await setDoc(doc(store, 'expenses', `sparse-unverified-${String(i).padStart(2, '0')}`), {
      personId: user.uid, bankId: sparseBank, tagId: 'unverified-category', groupId: null, financialGroupId: null, ledgerGroupId: null,
      name: `Sem categoria ${i}`, valueInCents: 100, date: Timestamp.fromDate(new Date(Date.now() - i * 1000)),
    });
    await setDoc(doc(store, 'expenses', 'sparse-verified'), {
      personId: user.uid, bankId: sparseBank, tagId: 'browserLegacyTag0001', groupId: null, financialGroupId: null, ledgerGroupId: null,
      name: 'Histórico após página vazia', valueInCents: 100, date: Timestamp.fromDate(new Date(Date.now() - 120000)),
    });
    for (let i = 0; i < 22; i++) await setDoc(doc(store, 'expenses', `browser-history-${String(i).padStart(2, '0')}`), {
      personId: user.uid, bankId: bank, tagId: 'browserLegacyTag0001', groupId: null, financialGroupId: null, ledgerGroupId: null,
      name: `Histórico ${String(i).padStart(2, '0')}`, valueInCents: 100 + i, date: Timestamp.fromDate(new Date(Date.now() - i * 60 * 1000)),
    });
    const category = { ...meta, isMandatoryExpense: false, isMandatoryGain: false, showInBothLists: false, iconFamily: null, iconName: null, iconStyle: null };
    await setDoc(doc(store, 'financialContexts', key, 'categories', gain), { ...category, name: 'Salário Teste', usageType: 'gain' });
    await setDoc(doc(store, 'financialContexts', key, 'categories', expense), { ...category, name: 'Mercado Teste', usageType: 'expense' });
  });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: Number(process.env.LUMUS_TEST_WIDTH || 1440), height: Number(process.env.LUMUS_TEST_HEIGHT || 1000) } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  async function loadStatementItem(label) {
    for (let i = 0; i < 8 && !(await page.getByText(label, { exact: true }).count()); i++) {
      await page.mouse.move(350, 600); await page.mouse.wheel(0, 10000); await page.waitForTimeout(500);
    }
    await page.getByText(label, { exact: true }).first().waitFor({ timeout: 30000 });
  }
  try {
    await page.goto('http://127.0.0.1:4173/web', { timeout: 90000 });
    await page.getByLabel('Email', { exact: true }).last().fill(email);
    await page.getByLabel('Senha', { exact: true }).last().fill(password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await page.waitForURL('**/web/home**', { timeout: 30000 });
    await page.goto(`http://127.0.0.1:4173/web/bank-movements?bankId=${sparseBank}&bankSource=legacy&bankName=Conta%20antiga`);
    const recovered = page.getByText('Histórico após página vazia', { exact: true }).first();
    try { await page.getByRole('button', { name: 'Carregar mais', exact: true }).click({ timeout: 5000 }); }
    catch (error) { if (!(await recovered.count())) throw error; }
    await recovered.waitFor({ timeout: 30000 });
    assert.equal((await getDoc(doc(db, 'banks', sparseBank))).data().valueInCents, 98765);
    await page.goto('http://127.0.0.1:4173/web/add-register-gain');
    await page.getByLabel('Nome do ganho').last().fill('Receita Teste');
    await page.getByLabel('Valor do ganho').last().fill('50000');
    await page.getByText('Renda variável', { exact: true }).last().click();
    await page.getByLabel('Selecionar banco do ganho').last().click();
    await page.getByText('Banco Teste', { exact: true }).last().click();
    await page.getByLabel('Escolher categoria de ganho').last().click();
    await page.getByText('Salário Teste', { exact: true }).last().click();
    await page.screenshot({ path: '/tmp/lumus06-gain.png', fullPage: true });
    await page.getByRole('button', { name: 'Registrar ganho', exact: true }).click();
    await page.getByText('Receita cadastrada.', { exact: true }).waitFor({ timeout: 30000 });
    assert.equal((await getDoc(doc(db, 'financialContexts', key, 'bankAccounts', bank))).data().balanceCents, 150000);
    await page.goto('http://127.0.0.1:4173/web/add-register-expenses');
    await page.getByLabel('Nome da despesa').last().fill('Despesa Teste');
    await page.getByLabel('Valor da despesa').last().fill('20000');
    await page.getByLabel('Selecionar banco da despesa').last().click();
    await page.getByText('Banco Teste', { exact: true }).last().click();
    await page.getByLabel('Escolher categoria de despesa').last().click();
    await page.getByText('Mercado Teste', { exact: true }).last().click();
    await page.screenshot({ path: '/tmp/lumus06-expense.png', fullPage: true });
    await page.getByRole('button', { name: 'Registrar despesa', exact: true }).click();
    await page.getByText('Despesa cadastrada.', { exact: true }).waitFor({ timeout: 30000 });
    assert.equal((await getDoc(doc(db, 'financialContexts', key, 'bankAccounts', bank))).data().balanceCents, 130000);
    await page.goto(`http://127.0.0.1:4173/web/bank-movements?bankId=${bank}&bankSource=new&bankName=Banco%20Teste`);
    await page.getByText('Histórico 00', { exact: true }).first().waitFor({ timeout: 30000 });
    assert.equal(await page.getByText('Dados da conta', { exact: true }).count(), 0);
    await loadStatementItem('Histórico 21');
    await loadStatementItem('Receita Teste');
    await loadStatementItem('Despesa Teste');
    assert.equal((await getDoc(doc(db, 'financialContexts', key, 'bankAccounts', bank))).data().balanceCents, 130000);
    await page.reload();
    await page.getByText('Histórico 00', { exact: true }).first().waitFor({ timeout: 30000 });
    await loadStatementItem('Receita Teste');
    await page.screenshot({ path: '/tmp/lumus06-list.png', fullPage: true });
    await page.getByLabel('Expandir detalhes de Despesa Teste').click();
    await page.getByLabel('Editar Despesa Teste').click();
    await page.getByRole('button', { name: 'Editar', exact: true }).last().click();
    const expenseValue = page.getByLabel('Valor da despesa').last();
    await expenseValue.waitFor();
    await page.waitForFunction(() => document.querySelector('input[aria-label="Nome da despesa"]')?.value === 'Despesa Teste');
    await expenseValue.fill('30000');
    await page.getByRole('button', { name: 'Atualizar despesa', exact: true }).click();
    await page.getByText('Despesa atualizada.', { exact: true }).waitFor({ timeout: 30000 });
    assert.equal((await getDoc(doc(db, 'financialContexts', key, 'bankAccounts', bank))).data().balanceCents, 120000);
    await page.goto(`http://127.0.0.1:4173/web/bank-movements?bankId=${bank}&bankSource=new&bankName=Banco%20Teste`);
    await loadStatementItem('Receita Teste');
    await page.getByLabel('Expandir detalhes de Receita Teste').click();
    await page.getByLabel('Excluir Receita Teste').click();
    await page.getByRole('button', { name: 'Excluir', exact: true }).last().click();
    await page.getByText('Movimentação removida.', { exact: true }).waitFor({ timeout: 30000 });
    assert.equal((await getDoc(doc(db, 'financialContexts', key, 'bankAccounts', bank))).data().balanceCents, 70000);
    await page.reload();
    await page.getByText('Histórico 00', { exact: true }).first().waitFor({ timeout: 30000 });
    await loadStatementItem('Despesa Teste');
    assert.equal(await page.getByLabel('Expandir detalhes de Receita Teste').count(), 0);
    await page.getByText('Histórico 00', { exact: true }).first().waitFor({ timeout: 30000 });
    await page.goto('http://127.0.0.1:4173/web/home?tab=2');
    await page.getByText('Bancos', { exact: true }).first().click();
    await page.getByLabel('Editar banco Conta para arquivar').first().click();
    await page.getByRole('button', { name: 'Editar', exact: true }).last().click();
    const bankName = page.getByLabel('Nome da conta').last();
    await bankName.waitFor();
    await page.waitForFunction(() => document.querySelector('input[aria-label="Nome da conta"]')?.value === 'Conta para arquivar');
    await bankName.fill('Conta editada');
    await page.getByRole('button', { name: 'Atualizar banco', exact: true }).click();
    await page.getByText('Cadastro atualizado. Os saldos e o histórico não foram alterados.', { exact: true }).waitFor({ timeout: 30000 });
    await page.goto('http://127.0.0.1:4173/web/home?tab=2');
    await page.getByText('Bancos', { exact: true }).first().click();
    await page.getByLabel('Excluir banco Conta editada').first().click();
    await page.getByRole('button', { name: 'Excluir', exact: true }).last().click();
    await page.getByText('Banco arquivado.', { exact: true }).waitFor({ timeout: 30000 });
    assert.equal((await getDoc(doc(db, 'financialContexts', key, 'bankAccounts', zeroBank))).data().status, 'archived');
    assert.equal(errors.length, 0, errors.join('\n'));
    console.log('Receitas, despesas, histórico paginado, saldos e ações originais de bancos verificados no navegador.');
  } catch (error) {
    await page.screenshot({ path: '/tmp/lumus06-failure.png', fullPage: true });
    console.error('Texto visível:', (await page.locator('body').innerText()).slice(0, 5000));
    throw error;
  } finally { await browser.close(); await fixtures.cleanup(); await deleteApp(app); }
})().catch(error => { console.error(error); process.exitCode = 1; });
