// Read-only continuous observation. No deploy, account update or document write.
const fs = require('node:fs');
const path = require('node:path');
const {inspectProduction} = require('./production-readiness.cjs');
const expectedHash = JSON.parse(fs.readFileSync(path.join(__dirname,'../firebase/production-readiness.json'),'utf8')).rulesSHA256;
function analyseCoverage(samples, elapsedSeconds) {
	const gaps=samples.slice(1).map((sample,index)=>sample.elapsedSeconds-samples[index].elapsedSeconds);
	return {elapsedSeconds,attempts:samples.length,maxGapSeconds:gaps.length?Math.max(...gaps):null,
		continuousHour:elapsedSeconds>=3600 && samples.length>=61 && samples.every(sample=>sample.verified) && gaps.every(gap=>gap<=90) && samples[0].elapsedSeconds<=10 && elapsedSeconds-samples.at(-1).elapsedSeconds<=90};
}
module.exports={analyseCoverage};
if(require.main===module)(async()=>{
	const dir=path.resolve(__dirname,'../artifacts/stage03-final');fs.mkdirSync(dir,{recursive:true});
	const file=path.join(dir,'observation-samples.jsonl');if(fs.existsSync(file))throw Error('Existing observation must not be overwritten');
	const auth=require('firebase-tools/lib/auth'),api=require('firebase-tools/lib/apiv2');
	auth.setActiveAccount({project:'finances-app-e8685'},auth.getGlobalDefaultAccount());
	const start=process.hrtime.bigint(),startedAt=new Date().toISOString(),samples=[];
	console.log('Starting 60-minute read-only observation; evidence contains only metadata.');
	for(let index=0;index<=60;index++){
		const due=index*60000-Number(process.hrtime.bigint()-start)/1e6;
		if(due>0)await new Promise(resolve=>setTimeout(resolve,due));
		let sample;
		try{
			const {inspection}=await inspectProduction(await api.getAccessToken(),{includeCounts:false});
			const response=await fetch('https://firestore.googleapis.com/v1/projects/finances-app-e8685/databases/(default)/documents/banks?pageSize=1&mask.fieldPaths=lumusAuditProjection987DoNotWrite',{signal:AbortSignal.timeout(15000)});
			const status=response.status;await response.body?.cancel();
			sample={checkedAt:new Date().toISOString(),elapsedSeconds:Number(process.hrtime.bigint()-start)/1e9,rulesSHA256:inspection.publishedRules.sha256,ruleset:inspection.publishedRules.name,billingEnabled:inspection.billingEnabled,freeTier:inspection.database.freeTier,anonymousPrivateListStatus:status,
				verified:inspection.publishedRules.sha256===expectedHash&&inspection.billingEnabled===false&&inspection.database.freeTier===true&&inspection.auth.emailPasswordEnabled&&[401,403].includes(status)};
		}catch{sample={checkedAt:new Date().toISOString(),elapsedSeconds:Number(process.hrtime.bigint()-start)/1e9,verified:false,error:'Metadata/probe unavailable; not evidence of zero errors'};}
		samples.push(sample);fs.appendFileSync(file,JSON.stringify(sample)+'\n',{mode:0o600});
	}
	const endedAt=new Date().toISOString(),coverage=analyseCoverage(samples,Number(process.hrtime.bigint()-start)/1e9);
	const wallClockSeconds=(Date.parse(endedAt)-Date.parse(startedAt))/1000;
	fs.writeFileSync(path.join(dir,'observation-hour.json'),JSON.stringify({projectId:'finances-app-e8685',startedAt,endedAt,expectedHash,...coverage,wallClockSeconds,wallClockAdjustmentSeconds:wallClockSeconds-coverage.elapsedSeconds,durationClock:'process.hrtime.bigint (monotonic)',financialWrites:0,probesAreExpectedDenials:true,authenticatedUserFlowsObserved:false},null,2)+'\n');
	console.log(JSON.stringify(coverage));if(!coverage.continuousHour)process.exitCode=1;
})().catch(()=>{console.error('Observation failed; inspect sanitized evidence.');process.exitCode=1;});
