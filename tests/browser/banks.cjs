// Real UI + Firebase Emulator only. No memory repository and no production endpoints.
const { chromium } = require('playwright');
const { initializeApp, deleteApp } = require('firebase/app');
const { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } = require('firebase/auth');
const {
	getFirestore,
	connectFirestoreEmulator,
	doc,
	setDoc,
	serverTimestamp,
	collection,
	getDocs,
	terminate,
} = require('firebase/firestore');
const fs = require('node:fs'),
	assert = require('node:assert/strict');
const base = 'http://127.0.0.1:4173',
	directory = 'artifacts/banks-stage04',
	results = { synthetic: true, productionWrites: 0, flows: [], errors: [], externalOrigins: [] };
let browser, activePage;
const apps = [];
async function run() {
	fs.mkdirSync(directory, { recursive: true });
	browser = await chromium.launch({
		headless: true,
		executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
		args: ['--no-sandbox'],
	});
	for (const [viewport, width, height] of [
		['desktop', 1440, 1000],
		['narrow', 390, 844],
	]) {
		const app = initializeApp(
			{ apiKey: 'demo-api-key', projectId: 'demo-lumus-foundation' },
			'e2e-' + viewport + Date.now(),
		);
		apps.push(app);
		const auth = getAuth(app);
		connectAuthEmulator(auth, 'http://127.0.0.1:9098', { disableWarnings: true });
		const db = getFirestore(app);
		connectFirestoreEmulator(db, '127.0.0.1', 8089);
		const email = `banks-${viewport}-${Date.now()}@lumus.test`,
			password = 'Lumus-local-2026!';
		const { user } = await createUserWithEmailAndPassword(auth, email, password);
		await setDoc(doc(db, 'users', user.uid), {
			name: 'Pessoa Bancos ' + viewport,
			email,
			adminUser: false,
			createdAt: serverTimestamp(),
		});
		const context = await browser.newContext({ viewport: { width, height } });
		await context.route('**/*', (route) => {
			const url = new URL(route.request().url());
			if (['http:', 'https:'].includes(url.protocol) && url.hostname !== '127.0.0.1') {
				results.externalOrigins.push(url.origin);
				return route.abort();
			}
			return route.continue();
		});
		const page = await context.newPage();
		activePage = page;
		page.on('pageerror', (error) => results.errors.push(error.message));
		const panel = () => page.getByTestId('bank-accounts-panel').last();
		const shot = async (name) => {
			await page.screenshot({ path: `${directory}/${viewport}-${name}.png`, fullPage: true });
		};

		await page.goto(base + '/web');
		await page.getByLabel('Email', { exact: true }).last().fill(email);
		await page.getByLabel('Senha', { exact: true }).last().fill(password);
		await page.getByRole('button', { name: 'Entrar', exact: true }).click();
		await page.waitForURL('**/web/home**');
		await panel().getByText('Saldo total das contas ativas: R$ 0,00', { exact: true }).waitFor();
		await panel().getByRole('button', { name: 'Cadastrar conta', exact: true }).click();
		await page
			.getByLabel('Nome da conta', { exact: true })
			.last()
			.fill('Conta 1500 ' + viewport);
		await page.getByLabel('Instituição financeira', { exact: true }).last().fill('Instituição sintética');
		await page.getByLabel('Saldo inicial disponível', { exact: true }).last().fill('1.500,00');
		await shot('create');
		let peer;
		if(viewport==='desktop'){
		 peer=await context.newPage();await peer.goto(base+'/web/add-register-bank');
		 await peer.getByLabel('Nome da conta',{exact:true}).last().fill('Conta 1500 '+viewport);
		 await peer.getByLabel('Instituição financeira',{exact:true}).last().fill('Instituição sintética');
		 await peer.getByLabel('Saldo inicial disponível',{exact:true}).last().fill('1.500,00');
		}
		await Promise.all([page.getByRole('button', { name: 'Registrar banco', exact: true }).dblclick(),...(peer?[peer.getByRole('button',{name:'Registrar banco',exact:true}).click()]:[])]);
		if(peer){try{await peer.waitForURL('**/web/home**');}catch(error){results.peerText=(await peer.locator('body').innerText()).slice(-5000);throw error;}await peer.close();}

		await page.waitForURL('**/web/home**');
		await panel().getByText('Saldo total das contas ativas: R$ 1.500,00', { exact: true }).waitFor();
		const bankCollection = () => collection(db, 'financialContexts', 'personal:' + user.uid, 'bankAccounts');
		const { query, limit, getDocFromServer } = require('firebase/firestore');
		const read = () => getDocs(query(bankCollection(), limit(20)));
		let records = await read();
		assert.equal(records.size, 1);
		const id = records.docs[0].id;
		assert.equal(records.docs[0].data().initialBalanceCents, 150000);
		assert.equal(
			(
				await getDocFromServer(doc(db, 'financialContexts', 'personal:' + user.uid, 'accountOpenings', id))
			).data().amountCents,
			150000,
		);
		await page.reload();
		await panel().getByText('Saldo total das contas ativas: R$ 1.500,00', { exact: true }).waitFor();
		// Close and reopen the browser page using its actual persisted Auth/local intent storage.
		const storage = await context.storageState({ indexedDB: true });
		await context.close();
		const reopened = await browser.newContext({ storageState: storage, viewport: { width, height } });
		await reopened.route('**/*', (route) => {
			const url = new URL(route.request().url());
			return ['http:', 'https:'].includes(url.protocol) && url.hostname !== '127.0.0.1'
				? route.abort()
				: route.continue();
		});
		const next = await reopened.newPage();
		activePage = next;
		next.on('pageerror', (error) => results.errors.push(error.message));
		await next.goto(base + '/web/add-register-bank');
		await next.getByText(/Conta Conta 1500 .* salva com abertura de R\$\s1\.500,00/).waitFor();
		assert.equal((await read()).size, 1);
		await next.getByRole('button', { name: 'Ver conta salva', exact: true }).click();
		const details = next.getByTestId('bank-account-details').last();
		await details.getByText('Saldo atual: R$ 1.500,00', { exact: true }).waitFor();
		assert(await details.getByRole('button', { name: 'Arquivar conta', exact: true }).isDisabled());
		await details.getByRole('button', { name: 'Editar conta', exact: true }).click();
		await next
			.getByLabel('Nome da conta', { exact: true })
			.last()
			.fill('Conta editada ' + viewport);
		await next.getByRole('button', { name: 'Atualizar banco', exact: true }).click();
		await next.waitForURL('**/web/home**');
		await next
			.getByTestId('bank-accounts-panel')
			.last()
			.getByRole('button', { name: 'Consultar conta Conta editada ' + viewport, exact: true })
			.waitFor();
		assert.equal((await read()).docs.find((item) => item.id === id).data().initialBalanceCents, 150000);
		await next.goto(base + '/web/add-register-bank');
		const stale=await reopened.newPage();await stale.goto(base+'/web/add-register-bank');
		await stale.getByRole('button',{name:'Cadastrar outra conta',exact:true}).waitFor();
		await Promise.all([next.getByRole('button',{name:'Cadastrar outra conta',exact:true}).click(),stale.getByRole('button',{name:'Cadastrar outra conta',exact:true}).click()]);
		await next.getByLabel('Saldo inicial disponível',{exact:true}).last().waitFor();
		await stale.getByLabel('Saldo inicial disponível',{exact:true}).last().waitFor();
		const intentKey='lumus:bank-opening:v1:'+user.uid+':personal:'+user.uid;
		const pendingId=await next.evaluate(key=>localStorage.getItem(key),intentKey);
		assert(pendingId&&pendingId!==id);assert.equal(await stale.evaluate(key=>localStorage.getItem(key),intentKey),pendingId);
		await stale.close();

		await next
			.getByLabel('Nome da conta', { exact: true })
			.last()
			.fill('Conta zero ' + viewport);
		await next.getByLabel('Instituição financeira', { exact: true }).last().fill('Instituição sintética');
		await next.getByRole('button', { name: 'Registrar banco', exact: true }).click();
		await next.waitForURL('**/web/home**');
		await next
			.getByTestId('bank-accounts-panel')
			.last()
			.getByRole('button', { name: 'Consultar conta Conta zero ' + viewport, exact: true })
			.click();
		await next
			.getByTestId('bank-account-details')
			.last()
			.getByRole('button', { name: 'Arquivar conta', exact: true })
			.click();
		await next.getByRole('button', { name: 'Confirmar arquivamento', exact: true }).click();
		await next
			.getByTestId('bank-account-details')
			.last()
			.getByText('Instituição sintética · Arquivada', { exact: true })
			.waitFor();
		await next.goto(base + '/web/home');
		const finalPanel = next.getByTestId('bank-accounts-panel').last();
		await finalPanel.getByText('Saldo total das contas ativas: R$ 1.500,00', { exact: true }).waitFor();
		assert.equal(
			await finalPanel
				.getByRole('button', { name: 'Consultar conta Conta zero ' + viewport, exact: true })
				.count(),
			0,
		);
		await finalPanel.getByRole('button', { name: 'Ver contas arquivadas', exact: true }).click();
		await finalPanel
			.getByRole('button', { name: 'Consultar conta Conta zero ' + viewport, exact: true })
			.waitFor();
		await finalPanel
			.getByRole('button', { name: 'Consultar conta Conta zero ' + viewport, exact: true })
			.scrollIntoViewIfNeeded();
		await next.screenshot({ path: `${directory}/${viewport}-archived.png`, fullPage: true });
		const final = await read();
		assert.equal(final.size, 2);
		assert.equal(final.docs.filter((item) => item.data().status === 'archived').length, 1);
		assert.equal(
			final.docs.reduce((total, item) => total + item.data().initialBalanceCents, 0),
			150000,
		);
		assert(
			!(await next.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2)),
			'horizontal overflow ' + viewport,
		);
		results.flows.push({
			viewport,
			login: true,
			create150000: true,
			doubleClickOnePair: true,
            parallelTabsOnePair: viewport==='desktop',
            staleTabRotationPreserved: true,
			reload: true,
			reopen: true,
			editPreservedOpening: true,
			archiveZero: true,
			positiveArchiveBlocked: true,
			homeTotal150000: true,
			accounts: 2,
			openings: 2,
		});
		await reopened.close();
	}
	assert.equal(results.errors.length, 0);
	assert.equal(results.externalOrigins.length, 0);
}
run()
	.catch(async (error) => {
		results.failure = error.message;
		process.exitCode = 1;
		if (activePage && !activePage.isClosed()) {
			await activePage.screenshot({ path: directory + '/failure.png', fullPage: true });
			results.visibleText = (await activePage.locator('body').innerText()).slice(0, 12000);
		}
	})
	.finally(async () => {
		if (browser) await browser.close();
		for (const app of apps) {
			await terminate(getFirestore(app));
			await deleteApp(app);
		}
		fs.writeFileSync(directory + '/browser.json', JSON.stringify(results, null, 2) + '\n');
		console.log(JSON.stringify(results));
	});
