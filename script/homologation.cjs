// Local-only homologation, same Firebase project; never deploy or create accounts.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {spawn} = require('node:child_process');
const repo=path.resolve(__dirname,'..');
const directory=path.join(os.homedir(),'.config/lumus-homologation');
const output=path.join(os.homedir(),'.cache/lumus-homologation/web');
(async()=>{
	const action=process.argv[2];
	if(action==='prepare'){
		const auth=require('firebase-tools/lib/auth'),api=require('firebase-tools/lib/apiv2');
		auth.setActiveAccount({project:'finances-app-e8685'},auth.getGlobalDefaultAccount());
		const {inspection,sdk}=await require('./production-readiness.cjs').inspectProduction(await api.getAccessToken(),{includeCounts:false});
		const readiness=require('../firebase/production-readiness.json');
		if(inspection.publishedRules.sha256!==readiness.rulesSHA256||inspection.billingEnabled||!inspection.database.freeTier)throw Error('Production security/Spark state changed');
		fs.mkdirSync(directory,{recursive:true,mode:0o700});
		if(fs.statSync(directory).mode&0o077)throw Error('Private local configuration directory required');
		fs.writeFileSync(path.join(directory,'firebase.json'),JSON.stringify({apiKey:sdk.apiKey,projectId:sdk.projectId,appId:sdk.appId,rulesSHA256:readiness.rulesSHA256},null,2)+'\n',{mode:0o600});
		console.log('Local homologation configuration prepared; no administrative credentials or remote changes.');return;
	}
	const config=JSON.parse(fs.readFileSync(path.join(directory,'firebase.json'),'utf8'));
	if(config.projectId!=='finances-app-e8685'||config.appId!==require('../firebase/production-readiness.json').appId||config.rulesSHA256!==require('../firebase/production-readiness.json').rulesSHA256)throw Error('Homologation project/app/Rules mismatch');
	const env={...process.env,EXPO_NO_DOTENV:'1',EXPO_PUBLIC_FIREBASE_MODE:'production',EXPO_PUBLIC_FIREBASE_API_KEY:config.apiKey,LUMUS_HOMOLOGATION:'1'};
	if(action==='serve-web'){
		require('./serve_web.cjs').createWebServer(output).listen(4174,'127.0.0.1',()=>console.log('Homologation UI: http://127.0.0.1:4174/web (real Firebase; no Hosting deployment)'));return;
	}
	const cli=path.join(repo,'node_modules/expo/bin/cli');
	const args=action==='export-web'?['export','--platform','web','--output-dir',output]:action==='native'?['start','--go','--localhost','--port','8088']:action==='web'?['start','--web','--host','localhost','--port','8088']:null;
	if(!args)throw Error('Use prepare, web, export-web, serve-web or native');
	const child=spawn(process.execPath,[cli,...args],{cwd:repo,env,stdio:'inherit'});for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>child.kill(signal));child.on('exit',code=>{process.exitCode=code??1;});
})().catch(()=>{console.error('Homologation preparation/launch failed; check local configuration and verified Rules.');process.exitCode=1;});
