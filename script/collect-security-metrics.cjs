// Existing Google-managed metrics only; never enable APIs, billing or logging.
const fs=require('node:fs');
const {readonlyClient}=require('./production-readiness.cjs');
const METRICS=[
 'firestore.googleapis.com/document/read_count','firestore.googleapis.com/document/write_count','firestore.googleapis.com/document/delete_count',
 'firestore.googleapis.com/rules/evaluation_count','firestore.googleapis.com/api/request_count',
 'serviceruntime.googleapis.com/api/request_count',
];
async function collectMetrics(token,start,end){
 const read=readonlyClient(token),results=[];
 for(const metric of METRICS){
  const authServices=metric.startsWith('serviceruntime.')?' AND (resource.labels.service = "identitytoolkit.googleapis.com" OR resource.labels.service = "securetoken.googleapis.com")':'';
  let next;const series=[];let status='available';
  try{
   do{
    const parameters=new URLSearchParams({filter:`metric.type = "${metric}"${authServices}`,'interval.startTime':start,'interval.endTime':end,'aggregation.alignmentPeriod':'60s','aggregation.perSeriesAligner':'ALIGN_SUM',pageSize:'1000',...(next?{pageToken:next}:{})});
    const response=await read('https://monitoring.googleapis.com/v3/projects/finances-app-e8685/timeSeries?'+parameters);
    for(const item of response.timeSeries||[]){
     const labels=Object.fromEntries(Object.entries(item.metric?.labels||{}).filter(([name])=>['api_method','response_code','grpc_status_code','request_method','result','type','op','response_code_class'].includes(name)));
     const points=(item.points||[]).map(point=>({start:point.interval?.startTime,end:point.interval?.endTime,value:Number(point.value?.int64Value??point.value?.doubleValue??0)}));
     series.push({resourceType:item.resource?.type||'unknown',labels,service:item.resource?.labels?.service||null,points,total:points.reduce((sum,point)=>sum+point.value,0)});
    }
    next=response.nextPageToken;if(series.length>1000)throw Error('Metric series budget exceeded');
   }while(next);
   if(!series.length)status='no-series-not-assumed-zero';
  }catch{status='unavailable-with-current-service-or-permissions';}
  const resourceTypes=[...new Set(series.map(item=>item.resourceType))];
  const selectedResourceType=resourceTypes.includes('firestore.googleapis.com/Database')?'firestore.googleapis.com/Database':resourceTypes[0]||null;
  results.push({metric,status,series,selectedResourceType,resourceTypes,total:status==='available'&&series.length?series.filter(item=>item.resourceType===selectedResourceType).reduce((sum,item)=>sum+item.total,0):null,resourceDuplicatesNotSummed:resourceTypes.length>1});
 }
 return {projectId:'finances-app-e8685',start,end,durationSeconds:(Date.parse(end)-Date.parse(start))/1000,metrics:results,includesOurExpectedAnonymousDenialProbes:true,authenticationFailuresByIndividualUserUnavailable:true,profileCollectionSpecificErrorsUnavailable:true,financialWritesPerformedByCollector:0};
}
module.exports={collectMetrics};
if(require.main===module)(async()=>{
 const auth=require('firebase-tools/lib/auth'),api=require('firebase-tools/lib/apiv2');auth.setActiveAccount({project:'finances-app-e8685'},auth.getGlobalDefaultAccount());
 const published=JSON.parse(fs.readFileSync('artifacts/security-publication-20261109/deploy-result.json'));
 const start=published.finishedAt,end=new Date(Date.parse(start)+3600000).toISOString();
 if(Date.now()<Date.parse(end)+300000)throw Error('Wait for complete publication hour and metric ingestion delay');
 const token=await api.getAccessToken();const after=await collectMetrics(token,start,end);
 const before=await collectMetrics(token,new Date(Date.parse(start)-3600000).toISOString(),start);
 const directory='artifacts/stage03-final';fs.writeFileSync(directory+'/metrics-publication-hour.json',JSON.stringify({collectedAt:new Date().toISOString(),before,after,limitations:['Missing series are not proof of zero traffic or zero errors.','Aggregate denials cannot identify whether a caller is an attacker or a legitimate old client.','Current client versions used unbounded queries/financial writes intentionally suspended; those denials are compatibility impact, not automatically a Rules vulnerability.','No paid service or Data Access logging was enabled.']},null,2)+'\n');
 console.log(JSON.stringify(after.metrics.map(({metric,status,total})=>({metric,status,total}))));
})().catch(error=>{console.error(error.message);process.exitCode=1});
