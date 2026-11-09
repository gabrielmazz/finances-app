// Read-only post-publication checks; never deploy, create accounts or alter data.
const fs = require('node:fs');
const path = require('node:path');
const directory = path.resolve(__dirname,'../artifacts/security-publication-20261109');
const {inspectProduction} = require('./production-readiness.cjs');
const label = process.argv[2];
if (!['immediate','15m','1h'].includes(label)) throw Error('Use immediate, 15m or 1h');
(async()=>{
	const auth = require('firebase-tools/lib/auth');
	const api = require('firebase-tools/lib/apiv2');
	auth.setActiveAccount({project:'finances-app-e8685'},auth.getGlobalDefaultAccount());
	const {inspection} = await inspectProduction(await api.getAccessToken(),{includeCounts:false});
	const expected = JSON.parse(fs.readFileSync(path.join(directory,'published-verification.json'),'utf8'));
	const response = await fetch('https://firestore.googleapis.com/v1/projects/finances-app-e8685/databases/(default)/documents/banks?pageSize=1&mask.fieldPaths=lumusAuditProjection987DoNotWrite',{signal:AbortSignal.timeout(15000)});
	const guestStatus = response.status;await response.body?.cancel();
	const verified = inspection.publishedRules.sha256===expected.rulesSHA256 && inspection.billingEnabled===false && inspection.database.freeTier===true && inspection.auth.emailPasswordEnabled && [401,403].includes(guestStatus);
	const report = {checkedAt:inspection.checkedAt,label,verified,publishedRulesSHA256:inspection.publishedRules.sha256,ruleset:inspection.publishedRules.name,billingEnabled:inspection.billingEnabled,freeTier:inspection.database.freeTier,emailPasswordEnabled:inspection.auth.emailPasswordEnabled,unauthenticatedPrivateListStatus:guestStatus,financialDataWrites:0,authAccountChanges:0,authenticatedProductionUserTested:false};
	fs.writeFileSync(path.join(directory,'monitor-'+label+'.json'),JSON.stringify(report,null,2)+'\n');
	console.log(JSON.stringify(report));if(!verified)process.exitCode=1;
})().catch(()=>{
	fs.writeFileSync(path.join(directory,'monitor-'+label+'.json'),JSON.stringify({checkedAt:new Date().toISOString(),label,verified:false,error:'Read-only verification could not complete; operator review required',productionWrites:0},null,2)+'\n');
	console.error('Read-only publication check failed; review the local monitoring artifact.');process.exitCode=1;
});
