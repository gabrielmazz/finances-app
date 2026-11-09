const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const base = 'http://127.0.0.1:4173';
const runId = Date.now();
const directory = 'artifacts/security-stage03';
const inventory = require('../../docs/backend-removal-manifest.json');
const routes = inventory.preservedRoutes
	.filter((file) => file.startsWith('app/web/') && !/\.(web|native)\.tsx$/.test(file))
	.map((file) => '/web' + (file.endsWith('/index.tsx') ? '' : '/' + path.basename(file, '.tsx')));
const result = {
	routes: [],
	flows: [],
	errors: [],
	consoleErrors: [],
	expectedHttpErrors: [],
	externalOrigins: [],
	screenshots: [],
};
let browser;
async function run() {
	fs.mkdirSync(directory, { recursive: true });
	browser = await chromium.launch({
		headless: true,
		...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
			? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
			: {}),
		args: ['--no-sandbox'],
	});
	for (const [viewport, width, height] of [
		['desktop', 1440, 1000],
		['narrow', 390, 844],
	]) {
		const context = await browser.newContext({ viewport: { width, height } });
		await context.route('**/*', (route) => {
			const url = new URL(route.request().url());
			if (['http:', 'https:'].includes(url.protocol) && url.hostname !== '127.0.0.1') {
				result.externalOrigins.push(url.origin);
				return route.abort();
			}
			return route.continue();
		});
		const page = await context.newPage();
		page.on('pageerror', (error) => result.errors.push(error.message));
		page.on('console', (message) => {
			if (message.type() === 'error') {
				if (/Failed to load resource: the server responded with a status of 400/.test(message.text()))
					result.expectedHttpErrors.push('Auth invalid-credential HTTP 400');
				else result.consoleErrors.push(message.text().slice(0, 400));
			}
		});
		async function shot(name) {
			const file = `${viewport}-${name}.png`;
			await page.screenshot({ path: path.join(directory, file), fullPage: true });
			result.screenshots.push(file);
		}
		async function login(email, password = 'Lumus-local-2026!') {
			await page.getByLabel('Email', { exact: true }).fill(email);
			await page.getByLabel('Senha', { exact: true }).fill(password);
			await page.getByRole('button', { name: 'Entrar', exact: true }).click();
		}
		async function logout() {
			if (!(await page.getByRole('button', { name: /sair/i }).count())) {
				await page.getByRole('button', { name: 'Config', exact: true }).click();
			}
			await page.getByRole('button', { name: /sair/i }).first().click();
			await page.getByTestId('logout-confirmation').getByRole('button', { name: 'Sair', exact: true }).click();
			await page.waitForURL('**/web');
			await page.getByRole('button', { name: 'Entrar', exact: true }).waitFor();
		}
		await page.goto(base + '/web/profile');
		await page.getByRole('button', { name: 'Entrar', exact: true }).waitFor();
		assert.equal(new URL(page.url()).pathname, '/web');
		assert(await page.getByRole('button', { name: 'Entre para acessar as telas' }).isDisabled());
		await login('legacy@lumus.test', 'incorrect-password');
		await page
			.getByText('Não foi possível entrar. Confira seu email e sua senha.', { exact: true })
			.waitFor();
		await login('legacy@lumus.test');
		await page.waitForURL('**/web/home**');
		await page.goto(base + '/web/profile');
		await page.getByLabel('Nome', { exact: true }).waitFor();
		assert.equal(await page.getByLabel('Nome', { exact: true }).inputValue(), 'Pessoa Legada');
		await shot('profile');
		await page.getByLabel('Nome', { exact: true }).fill('Rascunho preservado');
		await page.getByRole('button', { name: 'Atualizar perfil', exact: true }).click();
		await page.getByLabel('Nome', { exact: true }).waitFor();
		assert.equal(await page.getByLabel('Nome', { exact: true }).inputValue(), 'Rascunho preservado');
		await page.getByRole('button', { name: 'Descartar alterações', exact: true }).click();
		assert.equal(await page.getByLabel('Nome', { exact: true }).inputValue(), 'Pessoa Legada');
		const updatedName = 'Pessoa Legada ' + viewport;
		await page.getByLabel('Nome', { exact: true }).fill(updatedName);
		await page.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
		await page.getByText('Perfil salvo.', { exact: true }).waitFor();
		await page.reload();
		await page.getByLabel('Nome', { exact: true }).waitFor();
		assert.equal(await page.getByLabel('Nome', { exact: true }).inputValue(), updatedName);
		// Restore the synthetic fixture for the next viewport, using the real UI transaction.
		await page.getByLabel('Nome', { exact: true }).fill('Pessoa Legada');
		await page.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
		await page.getByText('Perfil salvo.', { exact: true }).waitFor();
		result.flows.push({
			viewport,
			action: 'guest guard, invalid login, existing UID, save profile, reload persisted session',
			passed: true,
		});
		for (const route of routes) {
			await page.goto(base + route);
			if (route === '/web') await page.getByRole('button', { name: 'Continuar no workspace' }).waitFor();
			else
				await page
					.getByText('Módulo financeiro temporariamente indisponível.', { exact: false })
					.first()
					.waitFor();
			await page.waitForTimeout(100);
			const text = await page.locator('body').innerText();
			assert(!/Unmatched Route|Something went wrong|Cannot read propert/.test(text));
			const resolvedPath = new URL(page.url()).pathname;
			assert.equal(resolvedPath, route === '/web/bank-summary' ? '/web/home' : route);
			const horizontalOverflow = await page.evaluate(
				() => document.documentElement.scrollWidth > innerWidth + 2,
			);
			assert(!horizontalOverflow, route + ' overflows ' + viewport);
			result.routes.push({ viewport, path: route, resolvedPath, rendered: true, horizontalOverflow });
			if (['/web', '/web/home', '/web/add-register-expenses'].includes(route))
				await shot(route.split('/').pop() || 'login');
		}
		await logout();
		await page.goto(base + '/web/profile');
		await page.getByRole('button', { name: 'Entrar', exact: true }).waitFor();
		await page.getByRole('button', { name: 'Esqueci minha senha', exact: true }).click();
		await page.getByLabel('Email', { exact: true }).fill('legacy@lumus.test');
		await page.getByRole('button', { name: 'Enviar link de recuperação', exact: true }).click();
		await page
			.getByText('Se houver uma conta com este email, você receberá um link para redefinir a senha.', {
				exact: true,
			})
			.waitFor();
		await shot('reset');
		await page.getByRole('button', { name: 'Voltar para entrar', exact: true }).click();
		await page.getByRole('button', { name: 'Criar conta', exact: true }).click();
		await page.getByLabel('Nome', { exact: true }).fill('Pessoa Nova ' + viewport);
		await page.getByLabel('Email', { exact: true }).fill(`browser-${viewport}-${runId}@lumus.test`);
		await page.getByLabel('Senha', { exact: true }).fill('Lumus-local-2026!');
		await page.getByRole('button', { name: 'Criar conta', exact: true }).click();
		await page.waitForURL('**/web/home**');
		await page.goto(base + '/web/profile');
		await page.getByLabel('Nome', { exact: true }).waitFor();
		assert.equal(await page.getByLabel('Nome', { exact: true }).inputValue(), 'Pessoa Nova ' + viewport);
		result.flows.push({
			viewport,
			action: 'logout blocks deep links, password reset and new account/profile through UI',
			passed: true,
		});
		await context.close();
		console.log(`${viewport}: ${routes.length} routes and auth/profile flows passed`);
	}
	// A persistent profile verifies session recovery across real Chromium process restarts.
	const userDataDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'lumus-browser-restart-'));
	let persistent;
	let admin;
	let revokedUid;
	const options={headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{}),args:['--no-sandbox'],viewport:{width:1440,height:1000}};
	async function openPersistent(){
		persistent=await chromium.launchPersistentContext(userDataDir,options);
		await persistent.route('**/*',route=>{const url=new URL(route.request().url());if(['http:','https:'].includes(url.protocol)&&url.hostname!=='127.0.0.1'){result.externalOrigins.push(url.origin);return route.abort();}return route.continue();});
		const page=await persistent.newPage();page.on('pageerror',error=>result.errors.push(error.message));return page;
	}
	async function enter(page,email){await page.goto(base+'/web');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Senha',{exact:true}).fill('Lumus-local-2026!');await page.getByRole('button',{name:'Entrar',exact:true}).click();await page.waitForURL('**/web/home**');await page.goto(base+'/web/profile');await page.getByLabel('Nome',{exact:true}).waitFor();}
	try{
		let page=await openPersistent();await enter(page,'legacy@lumus.test');
		const uid=await page.locator('#profile-id').inputValue();assert(uid);
		await persistent.close();page=await openPersistent();
		await page.goto(base+'/web/profile');await page.getByLabel('Nome',{exact:true}).waitFor();
		assert.equal(await page.locator('#profile-id').inputValue(),uid);
		await page.getByRole('button',{name:'Sair',exact:true}).first().click();
		await page.getByTestId('logout-confirmation').getByRole('button',{name:'Sair',exact:true}).click();await page.waitForURL('**/web');
		await persistent.close();page=await openPersistent();await page.goto(base+'/web/profile');await page.getByRole('button',{name:'Entrar',exact:true}).waitFor();
		assert.equal(new URL(page.url()).pathname,'/web');
		await enter(page,'incomplete@lumus.test');revokedUid=await page.locator('#profile-id').inputValue();
		const {initializeTestEnvironment}=require('@firebase/rules-unit-testing');
		admin=await initializeTestEnvironment({projectId:'demo-lumus-foundation',firestore:{host:'127.0.0.1',port:8089}});
		await admin.withSecurityRulesDisabled(async c=>c.firestore().doc('_authorizations/'+revokedUid).update({enabled:false}));
		await page.reload();await page.getByText('Você não tem permissão para acessar este recurso.',{exact:true}).first().waitFor();
		assert(await page.getByLabel('Nome',{exact:true}).isVisible());
		result.flows.push({action:'Chromium restart preserves UID/session; logout survives restart; revoked group shows permission error while private profile stays usable',passed:true});
		fs.writeFileSync(path.join(directory,'session-restart.json'),JSON.stringify({browserProcessRestarted:true,uidPreserved:true,logoutPersisted:true,revokedContextVisible:true,privateProfileAvailable:true,synthetic:true},null,2)+'\n');
	}finally{
		if(admin&&revokedUid)await admin.withSecurityRulesDisabled(async c=>c.firestore().doc('_authorizations/'+revokedUid).update({enabled:true}));
		await admin?.cleanup();await persistent?.close();fs.rmSync(userDataDir,{recursive:true,force:true});
	}
	assert.equal(result.errors.length, 0);
	assert.equal(result.consoleErrors.length, 0);
	assert.equal(result.externalOrigins.length, 0);
}
run()
	.catch((error) => {
		result.errors.push(error.message);
		console.error(error.message);
		process.exitCode = 1;
	})
	.finally(async () => {
		await browser?.close();
		fs.writeFileSync(path.join(directory, 'browser-validation.json'), JSON.stringify(result, null, 2) + '\n');
	});
