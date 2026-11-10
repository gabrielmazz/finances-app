import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { serverTimestamp, Timestamp, deleteField, setLogLevel } from 'firebase/firestore';

const generation = 'synthetic-security-stage03';
const collections = ['banks','bankTransfers','cashRescues','expenses','financeInvestmentSyncs','financeInvestments','gains','investmentCdiRates','mandatoryExpenses','mandatoryGains','monthlyBalances','tags'];
const environments: Record<string, RulesTestEnvironment> = {};
const matrix: Record<string, unknown>[] = [];
let containmentPassed = false;
const date = Timestamp.fromDate(new Date('2025-01-01T00:00:00Z'));
const oldRules = readFileSync('artifacts/security-stage03/published-rules.txt','utf8');

type Scenario = { id: string; flow: string; collection: string; permission: string; actor?: string; claim?: string; allowed: boolean; operation(db: ReturnType<ReturnType<RulesTestEnvironment['authenticatedContext']>['firestore']>): Promise<unknown>; adjustment?: string };
const scenarios: Scenario[] = [];
function scenario(value: Scenario) { scenarios.push(value); }
for (const collection of collections) {
	scenario({id:`${collection}.own`,flow:'Documento legado próprio',collection,permission:'get own personId',actor:'owner',allowed:true,operation:db=>db.doc(`${collection}/own`).get()});
	scenario({id:`${collection}.foreign`,flow:'Tentativa de leitura de terceiro',collection,permission:'get foreign personId',actor:'outsider',allowed:false,operation:db=>db.doc(`${collection}/own`).get()});
	scenario({id:`${collection}.shared`,flow:'Compartilhamento verificado',collection,permission:'get shared owner',actor:'reader',claim:generation,allowed:true,operation:db=>db.doc(`${collection}/own`).get()});
}
scenario({id:'guest',flow:'Não autenticado',collection:'banks',permission:'get',allowed:false,operation:db=>db.doc('banks/own').get()});
scenario({id:'legacy.unbounded-banks',flow:'Web publicada 2.3.3 getBanksByPersonFirebase',collection:'banks',permission:'list personId == uid, sem limit',actor:'owner',allowed:false,operation:db=>db.collection('banks').where('personId','==','owner').get(),adjustment:'Cliente precisa acrescentar paginação/limit; não liberar consulta ilimitada.'});
scenario({id:'legacy.global-banks',flow:'Cliente legado com enumeração global',collection:'banks',permission:'list all',actor:'owner',allowed:false,operation:db=>db.collection('banks').get(),adjustment:'Remover enumeração global; owner/adminUser não autoriza terceiros.'});
scenario({id:'query.own',flow:'Fundação atual',collection:'banks',permission:'list personId==uid limit20',actor:'owner',allowed:true,operation:db=>db.collection('banks').where('personId','==','owner').limit(20).get()});
scenario({id:'query.foreign',flow:'Consulta de terceiro',collection:'banks',permission:'list foreign limit20',actor:'outsider',allowed:false,operation:db=>db.collection('banks').where('personId','==','owner').limit(20).get()});
scenario({id:'query.mixed',flow:'Consulta mista não autorizada',collection:'banks',permission:'personId in own+foreign',actor:'outsider',allowed:false,operation:db=>db.collection('banks').where('personId','in',['outsider','owner']).limit(20).get()});
scenario({id:'query.shared',flow:'Consulta compartilhada verificada',collection:'expenses',permission:'personId in authorized owners, date, limit',actor:'reader',claim:generation,allowed:true,operation:db=>db.collection('expenses').where('personId','in',['owner','reader']).where('date','>=',date).limit(20).get()});
scenario({id:'query.limit',flow:'Acima do limite',collection:'banks',permission:'limit21',actor:'owner',allowed:false,operation:db=>db.collection('banks').where('personId','==','owner').limit(21).get()});
scenario({id:'history',flow:'Histórico próprio legado',collection:'monthlyBalances',permission:'year/month filters',actor:'owner',allowed:true,operation:db=>db.collection('monthlyBalances').where('personId','==','owner').where('year','==',2025).where('month','==',1).limit(20).get()});
scenario({id:'profile.own',flow:'Perfil antigo',collection:'users',permission:'get own uid',actor:'owner',allowed:true,operation:db=>db.doc('users/owner').get()});
scenario({id:'profile.foreign',flow:'Web publicada getRelatedUsers: PII de conta vinculada',collection:'users',permission:'get foreign uid',actor:'reader',claim:generation,allowed:false,operation:db=>db.doc('users/owner').get(),adjustment:'Compartilhar finanças não compartilha perfil privado/email; futura projeção pública separada.'});
scenario({id:'profile.enumeration',flow:'Enumeração de perfis',collection:'users',permission:'list',actor:'owner',allowed:false,operation:db=>db.collection('users').limit(20).get()});
scenario({id:'profile.missing',flow:'Perfil ausente',collection:'users',permission:'get own missing',actor:'missing',allowed:true,operation:db=>db.doc('users/missing').get()});
scenario({id:'profile.create',flow:'Cadastro atual',collection:'users',permission:'create own minimal',actor:'new',allowed:true,operation:db=>db.doc('users/new').set({name:'Pessoa',email:'new@lumus.test',adminUser:false,createdAt:serverTimestamp()})});
scenario({id:'profile.legacy-create',flow:'Web publicada cadastro inclui sparkFirstUseRequested',collection:'users',permission:'create with old control field',actor:'new',allowed:false,operation:db=>db.doc('users/new').set({name:'Pessoa',email:'new@lumus.test',adminUser:false,createdAt:serverTimestamp(),sparkFirstUseRequested:true}),adjustment:'Atualizar cliente; não aceitar inicialização/migração financeira antiga.'});
scenario({id:'profile.foreign-create',flow:'Criar perfil de terceiro',collection:'users',permission:'create foreign',actor:'new',allowed:false,operation:db=>db.doc('users/victim').set({name:'Pessoa',email:'new@lumus.test',adminUser:false,createdAt:serverTimestamp()})});
scenario({id:'profile.incomplete',flow:'Completar perfil incompleto',collection:'users',permission:'update own name, preserve legacy',actor:'incomplete',allowed:true,operation:db=>db.doc('users/incomplete').update({name:'Nome recuperado',updatedAt:serverTimestamp()})});
scenario({id:'profile.update',flow:'Web publicada updateUserProfileFirebase',collection:'users',permission:'update own name+updatedAt',actor:'owner',allowed:true,operation:db=>db.doc('users/owner').update({name:'Nome atualizado',updatedAt:serverTimestamp()})});
for (const [id, change] of Object.entries({role:{adminUser:true},links:{relatedIdUsers:['outsider']},group:{financialGroupId:'foreign-group'},owner:{uid:'owner'},email:{email:'other@lumus.test'},created:{createdAt:new Date(0)},long:{name:'x'.repeat(101)},type:{name:123},missing:{name:deleteField()},control:{name:'bad\tname'},pollution:{unexpected:1},time:{updatedAt:new Date(0)}})) {
	scenario({id:`profile.attack.${id}`,flow:'Manipulação de campo sensível/schema',collection:'users',permission:'update own',actor:'reader',allowed:false,operation:db=>db.doc('users/reader').update({updatedAt:serverTimestamp(),...change})});
}
scenario({id:'profile.foreign-update',flow:'Modificar perfil de terceiro',collection:'users',permission:'update foreign',actor:'reader',allowed:false,operation:db=>db.doc('users/owner').update({name:'Ataque',updatedAt:serverTimestamp()})});
scenario({id:'profile.delete',flow:'Exclusão de perfil fora do escopo',collection:'users',permission:'delete own',actor:'owner',allowed:false,operation:db=>db.doc('users/owner').delete(),adjustment:'Exclusão de conta/perfil não implementada; negar explicitamente.'});
for(const operation of ['create','update','delete']) for(const actor of ['owner','outsider']) scenario({id:`finance.${operation}.${actor}`,flow:'Operação financeira antiga suspensa',collection:'banks',permission:`${operation} ${actor==='owner'?'own':'foreign'}`,actor,allowed:false,operation:db=>operation==='create'?db.doc('banks/new').set({name:'Banco',personId:actor,valueInCents:1}):operation==='update'?db.doc('banks/own').update({personId:actor,valueInCents:999}):db.doc('banks/own').delete(),adjustment:'Nenhum módulo financeiro de escrita nesta etapa. Cliente antigo precisará atualizar; publicação de contenção interrompe gravações.'});
scenario({id:'group.verified',flow:'Membro com autoridade verificada',collection:'financialGroups',permission:'get',actor:'reader',claim:generation,allowed:true,operation:db=>db.doc('financialGroups/group').get()});
scenario({id:'group.forged-members',flow:'Membro/admin legado forjado sem claim',collection:'financialGroups',permission:'get',actor:'outsider',allowed:false,operation:db=>db.doc('financialGroups/group').get()});
scenario({id:'group.self-join',flow:'Autoassociação a grupo',collection:'financialGroups',permission:'update members',actor:'outsider',allowed:false,operation:db=>db.doc('financialGroups/group').update({'members.outsider':'admin'})});
scenario({id:'group.create',flow:'Criar grupo pelo cliente',collection:'financialGroups',permission:'create',actor:'owner',claim:generation,allowed:false,operation:db=>db.doc('financialGroups/new').set({status:'active',members:{owner:'admin'}})});
scenario({id:'group.history',flow:'Histórico de grupo autorizado',collection:'financialGroups/group/movements',permission:'list limit20',actor:'reader',claim:generation,allowed:true,operation:db=>db.collection('financialGroups/group/movements').limit(20).get()});
scenario({id:'group.foreign-history',flow:'Histórico de grupo sem autorização',collection:'financialGroups/group/movements',permission:'get',actor:'outsider',allowed:false,operation:db=>db.doc('financialGroups/group/movements/history').get()});
scenario({id:'group.orphan',flow:'Subcoleção sem grupo existente',collection:'financialGroups/missing/movements',permission:'get',actor:'reader',claim:generation,allowed:false,operation:db=>db.doc('financialGroups/missing/movements/history').get()});
scenario({id:'group.unknown',flow:'Subcoleção desconhecida',collection:'financialGroups/group/secret',permission:'get',actor:'reader',claim:generation,allowed:false,operation:db=>db.doc('financialGroups/group/secret/private').get()});
scenario({id:'authority.own',flow:'Consultar autorização própria verificada',collection:'_authorizations',permission:'get',actor:'reader',claim:generation,allowed:true,operation:db=>db.doc('_authorizations/reader').get()});
scenario({id:'authority.no-claim',flow:'Autorização pré-plantada sem claim confiável',collection:'_authorizations',permission:'get',actor:'outsider',allowed:false,operation:db=>db.doc('_authorizations/outsider').get()});
scenario({id:'authority.stale-claim',flow:'Claim antiga após revogação',collection:'expenses',permission:'get shared',actor:'reader',claim:'old-generation-stage03',allowed:false,operation:db=>db.doc('expenses/own').get()});
scenario({id:'authority.mutate',flow:'Elevar permissões próprias',collection:'_authorizations',permission:'update',actor:'reader',claim:generation,allowed:false,operation:db=>db.doc('_authorizations/reader').update({readOwners:['victim']})});
scenario({id:'unknown',flow:'Coleção não autorizada',collection:'unknown',permission:'get',actor:'owner',allowed:false,operation:db=>db.doc('unknown/private').get()});
scenario({id:'push.foreign',flow:'Token privado de dispositivo de terceiro',collection:'users/owner/pushDevices',permission:'get',actor:'reader',claim:generation,allowed:false,operation:db=>db.doc('users/owner/pushDevices/device').get()});
scenario({id:'batch.allowed',flow:'Lote de perfil autorizado',collection:'users',permission:'batch update own',actor:'owner',allowed:true,operation:async db=>{const batch=db.batch();batch.update(db.doc('users/owner'),{name:'Lote válido',updatedAt:serverTimestamp()});await batch.commit();}});
scenario({id:'batch.atomic-denial',flow:'Lote misto deve falhar inteiro',collection:'users+banks',permission:'batch own profile+financial',actor:'owner',allowed:false,operation:async db=>{const batch=db.batch();batch.update(db.doc('users/owner'),{name:'Não deve persistir',updatedAt:serverTimestamp()});batch.update(db.doc('banks/own'),{valueInCents:123});await batch.commit();}});

async function seed(environment: RulesTestEnvironment) {
	await environment.withSecurityRulesDisabled(async context=>{
		const db=context.firestore();const batch=db.batch();
		for(const uid of ['owner','reader','outsider'])batch.set(db.doc(`users/${uid}`),{name:'Pessoa',email:`${uid}@lumus.test`,adminUser:uid==='outsider',relatedIdUsers:['owner'],financialGroupId:'group',createdAt:date});
		batch.set(db.doc('users/incomplete'),{createdAt:'2024-01-01',legacyUntouched:true});
		for(const name of collections)batch.set(db.doc(`${name}/own`),{personId:'owner',name:'Histórico sintético',valueInCents:12345,date,year:2025,month:1,bankId:'own'});
		for(const uid of ['owner','reader','outsider'])batch.set(db.doc(`_authorizations/${uid}`),{generation,enabled:true,readOwners:uid==='owner'?[]:['owner'],groups:{group:uid==='owner'?'admin':'member'}});
		batch.set(db.doc('financialGroups/group'),{status:'active',members:{owner:'admin',reader:'member',outsider:'admin'}});
		batch.set(db.doc('financialGroups/group/movements/history'),{valueInCents:12345});
		batch.set(db.doc('financialGroups/missing/movements/history'),{valueInCents:999});
		batch.set(db.doc('financialGroups/group/secret/private'),{private:true});
		batch.set(db.doc('unknown/private'),{private:true});
		batch.set(db.doc('users/owner/pushDevices/device'),{token:'synthetic-token'});
		await batch.commit();
	});
}
before(async()=>{
	assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8089');setLogLevel('silent');
	for(const [name,rules] of Object.entries({published:oldRules,proposed:readFileSync('firestore.rules','utf8')}))environments[name]=await initializeTestEnvironment({projectId:`demo-lumus-security-${name}`,firestore:{host:'127.0.0.1',port:8089,rules}});
});
after(async()=>{
	const evidenceDirectory='artifacts/banks-stage04';mkdirSync(evidenceDirectory,{recursive:true});writeFileSync(evidenceDirectory+'/compatibility-matrix.json',JSON.stringify(matrix,null,2)+'\n');
	writeFileSync(evidenceDirectory+'/rules-test-evidence.json',JSON.stringify({rulesSHA256:createHash('sha256').update(readFileSync('firestore.rules')).digest('hex'),containmentSHA256:createHash('sha256').update(readFileSync('security/containment.rules')).digest('hex'),tested:matrix.length,failed:matrix.filter(row=>!row.verified).length+(containmentPassed?0:1),containmentPassed,checkedAt:new Date().toISOString()},null,2)+'\n');
	for(const environment of Object.values(environments))await environment.cleanup();
});
test('security: emergency containment preserves own private reads and never reopens writes/sharing',async()=>{
	const environment=await initializeTestEnvironment({projectId:'demo-lumus-containment',firestore:{host:'127.0.0.1',port:8089,rules:readFileSync('security/containment.rules','utf8')}});
	try{
		await seed(environment);
		const owner=environment.authenticatedContext('owner').firestore();
		const reader=environment.authenticatedContext('reader',{lumusAccess:generation}).firestore();
		assert.equal((await owner.doc('banks/own').get()).data()?.valueInCents,12345);
		await assert.rejects(reader.doc('banks/own').get());
		await assert.rejects(owner.doc('users/owner').update({name:'Mutation'}));
		await assert.rejects(owner.doc('banks/own').delete());
		await assert.rejects(reader.doc('financialGroups/group').get());
		containmentPassed=true;
	}finally{await environment.cleanup();}
});
for(const item of scenarios)test(`security/compatibility: ${item.id}`,async()=>{
	const outcome:Record<string,boolean>={};
	for(const [name,environment] of Object.entries(environments)){
		await seed(environment);
		const db=item.actor?environment.authenticatedContext(item.actor,{email:`${item.actor}@lumus.test`,...(item.claim?{lumusAccess:item.claim}:{})}).firestore():environment.unauthenticatedContext().firestore();
		try{await item.operation(db);outcome[name]=true;}catch(error){assert.match(String((error as {code?:string}).code),/permission-denied/);outcome[name]=false;}
		if(name==='proposed'&&item.id==='batch.atomic-denial')await environment.withSecurityRulesDisabled(async c=>assert.equal((await c.firestore().doc('users/owner').get()).data()?.name,'Pessoa'));
	}
	matrix.push({id:item.id,flow:item.flow,collection:item.collection,permission:item.permission,published:outcome.published?'allowed':'denied',expected:item.allowed?'allowed':'denied',proposed:outcome.proposed?'allowed':'denied',verified:outcome.proposed===item.allowed,adjustment:item.adjustment??(item.allowed?'Compatível com o fluxo restrito; versão mobile instalada não comprovada.':'Acesso negado por menor privilégio.')});
	assert.equal(outcome.published,!!item.actor,'Published Rules baseline changed');assert.equal(outcome.proposed,item.allowed,item.id);
});
