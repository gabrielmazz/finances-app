// Read-only production verification. This module has no deployment or account-update method.
const fs = require('node:fs');
const {createHash} = require('node:crypto');
const projectId = 'finances-app-e8685';
const hash = text=>createHash('sha256').update(text).digest('hex');
function readonlyClient(token) {
	if(!token)throw Error('Provide a short-lived OAuth token through GOOGLE_OAUTH_ACCESS_TOKEN');
	/** @param {string} url @param {Record<string, unknown> | undefined} [body] */
	return async (url,body = undefined) => {
		const parsed=new URL(url);
		const origins=['cloudbilling.googleapis.com','firestore.googleapis.com','firebase.googleapis.com','identitytoolkit.googleapis.com','firebaserules.googleapis.com','firebasehosting.googleapis.com','monitoring.googleapis.com'];
		if(parsed.protocol!=='https:'||!origins.includes(parsed.hostname)||!/^\/(?:v1|v1beta1|v3|admin\/v2)\/projects\/finances-app-e8685(?:\/|$)/.test(parsed.pathname))throw Error('Unexpected production endpoint');
		if(body&&!(/:listCollectionIds$|:runAggregationQuery$|\/accounts:lookup$/.test(parsed.pathname)))throw Error('Production writes are forbidden');
		const result=await fetch(parsed,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});
		if(!result.ok)throw Error('Read-only API returned HTTP '+result.status);
		return result.json();
	};
}
async function inspectProduction(token,{includeCounts=true}={}) {
	const read=readonlyClient(token);
	const database=await read(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)`);
	const billing=await read(`https://cloudbilling.googleapis.com/v1/projects/${projectId}/billingInfo`);
	const release=await read(`https://firebaserules.googleapis.com/v1/projects/${projectId}/releases/cloud.firestore`);
	const rules=await read('https://firebaserules.googleapis.com/v1/'+release.rulesetName);
	const auth=await read(`https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config?fields=subtype,signIn.email`);
	const apps=await read(`https://firebase.googleapis.com/v1beta1/projects/${projectId}/webApps`);
	const app=apps.apps?.find(app=>app.appId==='1:909478123750:web:bfe59f4e4d9682d20a4327');
	if(!app)throw Error('Existing Firebase web app not found; no app will be created');
	const sdk=await read(`https://firebase.googleapis.com/v1beta1/projects/${projectId}/webApps/${app.appId}/config`);
	if(sdk.projectId!==projectId||sdk.appId!==app.appId)throw Error('SDK project/app mismatch');
	const result={checkedAt:new Date().toISOString(),projectId,database:{edition:database.databaseEdition,freeTier:database.freeTier},billingEnabled:billing.billingEnabled,
		publishedRules:{name:release.rulesetName,updatedAt:release.updateTime,sha256:hash(rules.source.files[0].content),source:rules.source.files[0].content},
		auth:{subtype:auth.subtype,emailPasswordEnabled:auth.signIn?.email?.enabled&&auth.signIn?.email?.passwordRequired},
		sdk:{projectMatches:true,appId:sdk.appId,authDomain:sdk.authDomain,apiKeyPresent:!!sdk.apiKey},productionWrites:0};
	if(includeCounts){
		const root=`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
		const collections=await read(root+':listCollectionIds',{pageSize:100});
		if(collections.nextPageToken)throw Error('Collection inventory incomplete');
		result.counts={};
		for(const collection of collections.collectionIds||[]){const rows=await read(root+':runAggregationQuery',{structuredAggregationQuery:{structuredQuery:{from:[{collectionId:collection}]},aggregations:[{alias:'documents',count:{}}]}});result.counts[collection]=Number(rows[0]?.result?.aggregateFields?.documents?.integerValue||0);}
		const users=await read(root+'/users?pageSize=20&mask.fieldPaths=createdAt&mask.fieldPaths=financialGroupId&mask.fieldPaths=relatedIdUsers');
		if(users.nextPageToken)result.authCompatibility={complete:false,reason:'Profile sample limit reached'};
		else {
			const uids=(users.documents||[]).map(user=>user.name.split('/').at(-1));
			const accounts=await read(`https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:lookup?fields=users(localId,disabled,providerUserInfo(providerId))`,{localId:uids});
			result.authCompatibility={complete:true,profilesChecked:uids.length,matchingUids:(accounts.users||[]).filter(user=>uids.includes(user.localId)).length,passwordProviders:(accounts.users||[]).filter(user=>user.providerUserInfo?.some(provider=>provider.providerId==='password')).length,disabledAccounts:(accounts.users||[]).filter(user=>user.disabled).length};
		}
	}
	return {inspection:result,sdk};
}
function releaseManifest(inspection) {
	const candidate=fs.readFileSync('firestore.rules','utf8');
	const containment=fs.readFileSync('security/containment.rules','utf8');
	const candidateHash=hash(candidate);
	const verified=inspection.publishedRules.sha256===candidateHash&&inspection.billingEnabled===false&&inspection.database.edition==='STANDARD'&&inspection.database.freeTier===true&&inspection.auth.emailPasswordEnabled;
	return {status:verified?'published-verified':'awaiting-publication',projectId,appId:inspection.sdk.appId,authDomain:inspection.sdk.authDomain,rulesSHA256:candidateHash,containmentSHA256:hash(containment),previousRulesSHA256:inspection.publishedRules.sha256,verifiedAt:verified?inspection.checkedAt:null,
		deployCommand:`npx -y firebase-tools@15.35.0 deploy --only firestore:rules --config firebase.production.json --project ${projectId}`,
		containmentCommand:`npx -y firebase-tools@15.35.0 deploy --only firestore:rules --config firebase.containment.json --project ${projectId}`,
		financialWritesEnabled:false,published:verified,requiresSpecificApproval:true};
}
function verifyLocalEvidence() {
	const evidence=JSON.parse(fs.readFileSync('artifacts/security-stage03/rules-test-evidence.json','utf8'));
	if(evidence.rulesSHA256!==hash(fs.readFileSync('firestore.rules'))||evidence.failed!==0||evidence.tested<80||!evidence.containmentPassed||evidence.containmentSHA256!==hash(fs.readFileSync('security/containment.rules')))throw Error('Current Rules need matching passing emulator evidence');
	const restore=JSON.parse(fs.readFileSync('artifacts/security-stage03/restoration-proof.json','utf8'));
	if(!restore.equal||!restore.uidPreserved||!restore.internalReferenceResolvedLocally)throw Error('Isolated application recovery must pass');
	const checks=JSON.parse(fs.readFileSync('artifacts/security-stage03/validation-summary.json','utf8'));
	if(checks.rulesSHA256!==evidence.rulesSHA256||checks.integration.failed||checks.unit.failed||checks.browser.failed)throw Error('Current local validation must pass before preparing publication');
	return evidence;
}
module.exports={inspectProduction,releaseManifest,readonlyClient,verifyLocalEvidence};
if(require.main===module)(async()=>{
	verifyLocalEvidence();
	const {inspection,sdk}=await inspectProduction(process.env.GOOGLE_OAUTH_ACCESS_TOKEN,{includeCounts:process.argv[2]!=='verify'});
	const manifest=releaseManifest(inspection);
	fs.mkdirSync('artifacts/security-stage03',{recursive:true});
	fs.writeFileSync('artifacts/security-stage03/production-readonly.json',JSON.stringify(inspection,null,2)+'\n');
	fs.writeFileSync('artifacts/security-stage03/release-manifest.json',JSON.stringify(manifest,null,2)+'\n');
	if(process.argv[2]==='prepare-client-env')fs.writeFileSync('.env.production.local',`EXPO_PUBLIC_FIREBASE_MODE=production\nEXPO_PUBLIC_FIREBASE_API_KEY=${sdk.apiKey}\n`,{flag:'wx',mode:0o600});
	if(process.argv[2]==='verify'){
		if(!manifest.published)throw Error('Published Rules do not match the tested candidate; production client stays blocked');
		fs.writeFileSync('firebase/production-readiness.json',JSON.stringify(manifest,null,2)+'\n');
	}
	console.log(JSON.stringify({status:manifest.status,published:manifest.published,productionWrites:0,rulesSHA256:manifest.rulesSHA256}));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
