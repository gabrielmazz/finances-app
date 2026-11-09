// Authorized real-account UI checks. No screenshots, traces, raw identities or tokens in evidence.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const assert=require('node:assert/strict');
require('../../script/firestore-recovery-run.cjs').protectedProcess(false);
const {chromium}=require('playwright');
const {verifyAccessProbe,verifyBrowserProtection}=require('../../script/browser-protection.cjs');
const account=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.config/lumus-homologation/authorized-account.json'),'utf8'));
const directory=fs.mkdtempSync('/dev/shm/lumus-auth-homologation-');fs.chmodSync(directory,0o700);
const report={projectId:'finances-app-e8685',startedAt:new Date().toISOString(),status:'awaiting-manual-login',steps:[],screenshotsTaken:false,rawIdentityRecorded:false,financialWrites:0};
const evidence=path.resolve(__dirname,'../../artifacts/stage03-final/auth-web.json');
const persist=()=>fs.writeFileSync(evidence,JSON.stringify(report,null,2)+'\n');
let context,phase='launch',signinRequests=0,blockedMutations=0;
const options={headless:false,env:{...process.env,LD_PRELOAD:path.join(process.env.LUMUS_OPERATOR_PROTECTION_DIR,'browser-no-core.so')},executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||path.join(os.homedir(),'.cache/ms-playwright/chromium-1228/chrome-linux64/chrome'),ignoreDefaultArgs:['--disable-dev-shm-usage'],args:['--no-sandbox','--disable-breakpad','--disable-crash-reporter','--disable-save-password-bubble'],viewport:{width:1280,height:950}};
async function open(){
	context=await chromium.launchPersistentContext(directory,options);
	await verifyBrowserProtection(context);
	await context.route('**/*',async route=>{
		const request=route.request(),url=new URL(request.url());
		if(url.hostname==='firestore.googleapis.com'&&/Write|Commit/i.test(url.pathname)){blockedMutations++;return route.abort();}
		if(url.hostname==='identitytoolkit.googleapis.com'&&/accounts:(signUp|update|delete|sendOobCode|resetPassword)/.test(url.pathname)){blockedMutations++;return route.abort();}
		if(url.pathname.endsWith('accounts:signInWithPassword')){
			const body=request.postDataJSON();if(body.email?.toLowerCase()!==account.email.toLowerCase())return route.abort();signinRequests++;
		}
		if(['http:','https:'].includes(url.protocol)&&!['127.0.0.1','identitytoolkit.googleapis.com','securetoken.googleapis.com','firestore.googleapis.com','www.googleapis.com','www.gstatic.com','finances-app-e8685.firebaseapp.com'].includes(url.hostname))return route.abort();
		return route.continue();
	});
	return context.pages()[0]||await context.newPage();
}
async function manualLogin(page){
	await page.goto('http://127.0.0.1:4174/web');
	await page.getByLabel('Email',{exact:true}).fill(account.email);
	console.log('MANUAL LOGIN: enter your password in the opened Lumus window and click Entrar.');
	report.status='awaiting-manual-login';persist();
	await page.waitForURL('**/web/home**',{timeout:30*60*1000});
}
async function profile(page){
	await page.goto('http://127.0.0.1:4174/web/profile');await page.getByLabel('Nome',{exact:true}).waitFor();
	assert.equal(await page.locator('#profile-id').inputValue(),account.uid);
	return page.getByLabel('Nome',{exact:true}).inputValue();
}
function passed(name){report.steps.push({name,passed:true});persist();}
(async()=>{
	await verifyAccessProbe();persist();let page=await open();phase='valid-login';await manualLogin(page);
	const name=await profile(page);passed('authorized-login-and-existing-profile-uid');
	phase='reload-session';const calls=signinRequests;await page.reload();await page.getByLabel('Nome',{exact:true}).waitFor();assert.equal(await page.locator('#profile-id').inputValue(),account.uid);assert.equal(await page.getByLabel('Nome',{exact:true}).inputValue(),name);assert.equal(signinRequests,calls);passed('reload-preserves-session-without-another-signin');
	phase='browser-restart';await context.close();page=await open();assert.equal(await profile(page),name);assert.equal(signinRequests,calls);passed('browser-process-restart-preserves-uid-and-profile');
	phase='connection-loss';await context.setOffline(true);await page.getByRole('button',{name:'Atualizar perfil',exact:true}).click();await page.getByText('Sem conexão com o serviço. Confira a conexão e tente novamente.',{exact:true}).first().waitFor({timeout:45000});passed('offline-profile-error-is-explicit');phase='connection-recovery';await context.setOffline(false);await page.reload();await page.getByLabel('Nome',{exact:true}).waitFor();assert.equal(await page.locator('#profile-id').inputValue(),account.uid);assert.equal(signinRequests,calls);passed('connection-loss-keeps-identity-and-recovers');
	phase='logout';await page.getByRole('button',{name:'Sair',exact:true}).first().click();await page.getByTestId('logout-confirmation').getByRole('button',{name:'Sair',exact:true}).click();await page.waitForURL('**/web');await page.goto('http://127.0.0.1:4174/web/profile');await page.getByRole('button',{name:'Entrar',exact:true}).waitFor();assert.equal(new URL(page.url()).pathname,'/web');passed('logout-clears-session-and-protects-deep-link');
	phase='invalid-password';await page.getByLabel('Email',{exact:true}).fill(account.email);await page.getByLabel('Senha',{exact:true}).fill('invalid-homologation-'+Date.now());await page.getByRole('button',{name:'Entrar',exact:true}).click();await page.getByText('Não foi possível entrar. Confira seu email e sua senha.',{exact:true}).waitFor();passed('invalid-password-denied');
	phase='second-manual-login';await page.getByLabel('Senha',{exact:true}).fill('');await manualLogin(page);await profile(page);
	phase='invalid-local-session';
	await page.evaluate(()=>{for(const key of Object.keys(localStorage))if(key.startsWith('firebase:authUser:')){const value=JSON.parse(localStorage.getItem(key));value.stsTokenManager.expirationTime=0;value.stsTokenManager.refreshToken='invalid-homologation-refresh-token';value.stsTokenManager.accessToken='invalid-homologation-access-token';localStorage.setItem(key,JSON.stringify(value));}});
	await context.close();page=await open();await page.goto('http://127.0.0.1:4174/web/profile');await page.getByRole('button',{name:'Entrar',exact:true}).waitFor({timeout:45000});assert.equal(new URL(page.url()).pathname,'/web');passed('invalid-local-session-returns-to-login-without-account-revocation');
	assert.equal(blockedMutations,0);report.status='passed';report.uidUnchanged=true;report.authenticatedProfileLoaded=true;report.financialWrites=0;report.signinRequests=signinRequests;
})().catch(error=>{report.status='failed';report.failurePhase=phase;report.failureType=error.name;process.exitCode=1;console.error('Homologation did not pass; only sanitized phase recorded.');}).finally(async()=>{
	await context?.close();fs.rmSync(directory,{recursive:true,force:true});report.finishedAt=new Date().toISOString();persist();
});
