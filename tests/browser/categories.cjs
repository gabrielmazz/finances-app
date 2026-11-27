const { chromium } = require('playwright');
const { initializeApp, deleteApp } = require('firebase/app');
const { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } = require('firebase/auth');
const { getFirestore, connectFirestoreEmulator, doc, setDoc, serverTimestamp, writeBatch } = require('firebase/firestore');
const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');
const assert = require('node:assert/strict');
const fs = require('node:fs');

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ['--no-sandbox'] });
  const directory = '/tmp/lumus-stage05-screens';
  fs.mkdirSync(directory, { recursive: true });
  let activeApp;
  let activePage;
  try {
    for (const [label, width, height] of [['desktop', 1440, 1000], ['narrow', 390, 844]]) {
      const app = activeApp = initializeApp({ apiKey: 'demo-api-key', projectId: 'demo-lumus-foundation' }, `categories-${label}-${Date.now()}`);
      const auth = getAuth(app); connectAuthEmulator(auth, 'http://127.0.0.1:9098', { disableWarnings: true });
      const db = getFirestore(app); connectFirestoreEmulator(db, '127.0.0.1', 8089);
      const email = `categories-${label}-${Date.now()}@lumus.test`, password = 'Lumus-local-2026!';
      const { user } = await createUserWithEmailAndPassword(auth, email, password);
      await setDoc(doc(db, 'users', user.uid), { name: 'Pessoa Teste', email, adminUser: false, createdAt: serverTimestamp() });
      const page = activePage = await browser.newPage({ viewport: { width, height } });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
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
      await page.getByText('Categorias', { exact: true }).first().click();
      await page.getByRole('button', { name: 'Adicionar Categoria', exact: true }).click();
      await page.getByText('Despesas do dia a dia - (Despesas comuns)', { exact: true }).last().click();
      const nameInput = page.getByLabel('Nome da categoria', { exact: true }).last();
      await nameInput.fill('a'.repeat(101));
      await page.getByRole('button', { name: 'Salvar categoria', exact: true }).click();
      await page.getByText('Informe um nome de categoria com até 100 caracteres.', { exact: true }).waitFor();
      assert.equal(await nameInput.inputValue(), 'a'.repeat(101));
      await nameInput.fill('Categoria Teste');
      await page.getByRole('button', { name: 'Escolher ícone da categoria', exact: true }).click();
      await page.getByText('Mercado', { exact: true }).last().click();
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${directory}/${label}-form.png`, fullPage: true });
      await page.getByRole('button', { name: 'Salvar categoria', exact: true }).click();
      await page.getByText('Categoria cadastrada.', { exact: true }).waitFor({ timeout: 30000 });
      await page.goto('http://127.0.0.1:4173/web/home?tab=2');
      await page.getByText('Categorias', { exact: true }).first().click();
      await page.getByRole('button', { name: 'Editar categoria Categoria Teste', exact: true }).waitFor({ timeout: 30000 });
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${directory}/${label}-list.png`, fullPage: true });
      await page.getByRole('button', { name: 'Editar categoria Categoria Teste', exact: true }).click();
      const name = page.getByLabel('Nome da categoria', { exact: true }).last();
      await name.waitFor(); await page.waitForFunction(() => document.querySelector('input[aria-label="Nome da categoria"]')?.value === 'Categoria Teste');
      await name.fill('Categoria Editada');
      await page.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
      await page.getByText('Categoria atualizada.', { exact: true }).waitFor({ timeout: 30000 });
      await page.goto('http://127.0.0.1:4173/web/home?tab=2');
      await page.getByText('Categorias', { exact: true }).first().click();
      await page.getByRole('button', { name: 'Arquivar categoria Categoria Editada', exact: true }).waitFor({ timeout: 30000 });
      await page.reload();
      await page.getByText('Categorias', { exact: true }).first().click();
      await page.getByRole('button', { name: 'Arquivar categoria Categoria Editada', exact: true }).waitFor({ timeout: 30000 });
      await page.getByRole('button', { name: 'Arquivar categoria Categoria Editada', exact: true }).click();
      await page.getByRole('button', { name: 'Arquivar', exact: true }).last().click();
      await page.getByText('Categoria arquivada.', { exact: true }).waitFor({ timeout: 30000 });
      await page.reload();
      await page.getByText('Categorias', { exact: true }).first().click();
      await page.getByText('Categoria Editada', { exact: true }).waitFor({ state: 'hidden' });
      const fixtures = await initializeTestEnvironment({ projectId: 'demo-lumus-foundation', firestore: { host: '127.0.0.1', port: 8089 } });
      await fixtures.withSecurityRulesDisabled(async context => {
        const fixtureDb = context.firestore(), batch = writeBatch(fixtureDb);
        for (let index = 0; index < 7; index++) batch.set(doc(fixtureDb, 'financialContexts', `personal:${user.uid}`, 'categories', `page${index}`), {
          name: `Página categoria ${index}`, scopeKind: 'personal', scopeId: user.uid, usageType: 'expense', status: 'active',
        });
        await batch.commit();
      });
      await fixtures.cleanup();
      await page.reload();
      await page.getByText('Categorias', { exact: true }).first().click();
      await page.getByText('Página categoria 0', { exact: true }).waitFor({ timeout: 30000 });
      await page.getByRole('button', { name: '2', exact: true }).click();
      await page.getByText('Página categoria 5', { exact: true }).waitFor({ timeout: 30000 });
      await page.getByLabel('Buscar categoria por nome').fill('pagina categoria 6');
      await page.getByRole('button', { name: 'Pesquisar categorias' }).click();
      await page.getByText('Página categoria 6', { exact: true }).waitFor();
      assert.equal(await page.getByText('Página categoria 0', { exact: true }).count(), 0);
      await page.getByLabel('Buscar categoria por nome').fill('');
      await page.getByRole('button', { name: 'Pesquisar categorias' }).click();
      await page.getByRole('button', { name: 'Arquivadas', exact: true }).click();
      await page.getByText('Categoria Editada (arquivada)', { exact: true }).waitFor();

      await page.goto('http://127.0.0.1:4173/web/add-mandatory-expenses');
      await page.getByLabel('Nome da despesa', { exact: true }).fill('Rascunho em andamento');
      await page.getByLabel('Valor mensal', { exact: true }).fill('12500');
      await page.getByLabel('Dia do vencimento', { exact: true }).fill('10');
      await page.getByRole('button', { name: 'Escolher categoria obrigatória de despesa' }).click();
      await page.getByRole('button', { name: 'Adicionar categoria obrigatória de despesa' }).click();
      await page.getByLabel('Nome da categoria', { exact: true }).fill('Categoria inline');
      await page.getByRole('button', { name: 'Salvar categoria', exact: true }).click();
      await page.waitForURL('**/web/add-mandatory-expenses');
      assert.equal(await page.getByLabel('Nome da despesa', { exact: true }).inputValue(), 'Rascunho em andamento');
      await page.getByText('Categoria inline', { exact: true }).first().waitFor();
      assert.equal(await page.getByLabel('Dia do vencimento', { exact: true }).inputValue(), '10');
      await page.getByRole('button', { name: 'Registrar gasto', exact: true }).click();
      await page.getByText('Gasto obrigatório salvo.', { exact: true }).waitFor();
      await page.goto('http://127.0.0.1:4173/web/screen-settings');
      if (label === 'desktop') {
        await page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
        await page.getByRole('link', { name: 'Configurações', exact: true }).click();
        await page.waitForURL('**/web/home?tab=2');
      } else {
        await page.getByRole('navigation', { name: 'Navegação principal' }).waitFor();
      }

      assert.equal(errors.length, 0, errors.join('\n'));
      console.log(`${label}: cadastro, edição, recarga, remoção e segunda página verificados`);
      await page.close(); await deleteApp(app);
      activeApp = undefined; activePage = undefined;
    }
  } catch (error) {
    if (activePage && !activePage.isClosed()) {
      await activePage.screenshot({ path: directory + '/failure.png', fullPage: true });
      console.error('UI:', (await activePage.locator('body').innerText()).slice(0, 2100));
    }
    throw error;
  } finally {
    if (activeApp) await deleteApp(activeApp);
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
