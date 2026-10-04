// Opt-in evidence: real Auth/Firestore, shared conversation/executor/readers; model and notifications are seams.
import { initializeApp, deleteApp } from 'firebase/app';
import { connectAuthEmulator, deleteUser, getAuth, signInAnonymously, type Auth } from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions, type Functions } from 'firebase/functions';
import { collection, connectFirestoreEmulator, doc, getDocs, getFirestore, query, setDoc, terminate, where, writeBatch, type Firestore } from 'firebase/firestore';
let mockDb: Firestore;
let mockAuth: Auth;
let mockFunctions: Functions;
const mockCalls = {getDoc:0,getDocs:0,transactions:0,transactionReads:0,transactionWrites:0};
jest.mock('firebase/firestore', () => {
	const actual = jest.requireActual('firebase/firestore');
	return {...actual,
		getDoc:(...args: unknown[])=>{mockCalls.getDoc++;return actual.getDoc(...args);},
		getDocs:(...args: unknown[])=>{mockCalls.getDocs++;return actual.getDocs(...args);},
		runTransaction:(db: unknown,callback: (transaction: unknown)=>unknown,...args: unknown[])=>actual.runTransaction(db,(transaction: any)=>{
			mockCalls.transactions++;
			return callback(new Proxy(transaction,{get(target,property){
				if(property==='get')return (...values: unknown[])=>{mockCalls.transactionReads++;return target.get(...values);};
				if(['set','update','delete'].includes(String(property)))return (...values: unknown[])=>{mockCalls.transactionWrites++;return target[property](...values);};
				const value=target[property];return typeof value==='function'?value.bind(target):value;
			}}));
		},...args),
	};
});
jest.mock('@/FirebaseConfig',()=>({get db(){return mockDb;},get auth(){return mockAuth;},get firebaseFunctions(){return mockFunctions;}}));
jest.mock('@/functions/FinancialLedgerFirebase',()=>({getFinancialLedgerContextFirebase:async()=>null,getFinancialLedgerAccountsFirebase:async()=>[]}));
jest.mock('@/utils/mandatoryExpenseNotifications',()=>({scheduleMandatoryExpenseNotification:async()=>undefined,cancelMandatoryExpenseNotification:async()=>undefined,suppressMandatoryExpenseNotificationCycle:async()=>undefined}));
jest.mock('@/utils/mandatoryGainNotifications',()=>({scheduleMandatoryGainNotification:async()=>undefined,cancelMandatoryGainNotification:async()=>undefined,suppressMandatoryGainNotificationCycle:async()=>undefined}));
import {createAssistantConversation} from '@/services/lumusAssistant/assistantConversationService';
import {financeCommandService} from '@/services/lumusAssistant/financeCommandService';
import {assistantReportService} from '@/services/lumusAssistant/assistantReportService';
import {formatCycleKey,formatIsoDate,parseIsoDateAtLocalNoon} from '@/utils/lumusAssistant';
import type {AssistantAiConversationResponse} from '@/types/lumusAssistant';

const suite=process.env.RUN_ASSISTANT_EMULATOR_CONVERSATION==='1' ? describe : describe.skip;
suite('conversation with persisted synthetic finance and local latency evidence',()=>{
	let app: ReturnType<typeof initializeApp>;
	let uid: string;
	let date: string;
	let bankId: string;
	let tagId: string;
	const ownedCollections=['expenses','gains','banks','tags','monthlyBalances','assistantOperationReceipts'];
	beforeAll(async()=>{
		app=initializeApp({projectId:'demo-lumus-financas',apiKey:'test-key'},'conversation-evidence-'+Date.now());
		mockAuth=getAuth(app);connectAuthEmulator(mockAuth,'http://127.0.0.1:9099',{disableWarnings:true});
		mockDb=getFirestore(app);connectFirestoreEmulator(mockDb,'127.0.0.1',8080);
		mockFunctions=getFunctions(app,'southamerica-east1');connectFunctionsEmulator(mockFunctions,'127.0.0.1',5001);
		uid=(await signInAnonymously(mockAuth)).user.uid;bankId=uid+'-bank';tagId=uid+'-tag';date=formatIsoDate(new Date());
		const response=await fetch(`http://127.0.0.1:8080/v1/projects/demo-lumus-financas/databases/(default)/documents/users/${uid}`,{method:'PATCH',headers:{Authorization:'Bearer owner','Content-Type':'application/json'},body:JSON.stringify({fields:{relatedIdUsers:{arrayValue:{values:[]}}}})});
		if(!response.ok)throw new Error('Isolated demo user seed failed.');
		const [year,month]=formatCycleKey(new Date()).split('-').map(Number);
		await setDoc(doc(mockDb,'banks',bankId),{personId:uid,name:'Nubank',isActive:true});
		await setDoc(doc(mockDb,'tags',tagId),{personId:uid,name:'Alimentação',usageType:'both'});
		await setDoc(doc(mockDb,'monthlyBalances',uid+'-opening'),{personId:uid,bankId,year,month,valueInCents:10_000_000});
		// Three pages: precision and latency are measured with a catalogue larger than Home/model limits.
		for(let offset=0;offset<501;offset+=200){const batch=writeBatch(mockDb);for(let index=offset;index<Math.min(501,offset+200);index++)batch.set(doc(mockDb,'expenses',uid+'-seed-'+index),{personId:uid,bankId,tagId,name:'Histórico '+index,valueInCents:1,date:parseIsoDateAtLocalNoon(date)});await batch.commit();}
	},30_000);
	afterAll(async()=>{
		for(const name of ownedCollections){const records=await getDocs(query(collection(mockDb,name),where('personId','==',uid)));for(let offset=0;offset<records.docs.length;offset+=200){const response=await fetch('http://127.0.0.1:8080/v1/projects/demo-lumus-financas/databases/(default)/documents:commit',{method:'POST',headers:{Authorization:'Bearer owner','Content-Type':'application/json'},body:JSON.stringify({writes:records.docs.slice(offset,offset+200).map(record=>({delete:'projects/demo-lumus-financas/databases/(default)/documents/'+record.ref.path}))})});if(!response.ok)throw new Error('Isolated fixture cleanup failed.');}}
		await fetch(`http://127.0.0.1:8080/v1/projects/demo-lumus-financas/databases/(default)/documents/users/${uid}`,{method:'DELETE',headers:{Authorization:'Bearer owner'}});
		if(mockAuth.currentUser)await deleteUser(mockAuth.currentUser);
		await terminate(mockDb);await deleteApp(app);
	},30_000);

	it('measures simple, exact read, multi-field answer and batch with persisted effects',async()=>{
		const metrics: Record<string,unknown>={};
		let totalWrites=0;
		for(const scenario of ['simple','read','answer','batch10'] as const){
			const durations:number[]=[];const counts:typeof mockCalls[]=[];let modelCalls=0;
			for(let sample=-1;sample<20;sample++){
				const startCalls={...mockCalls};let currentModelCalls=0;
				const conversation=createAssistantConversation({uid,finance:financeCommandService,onChange:()=>{},
					report:async(request,catalog)=>(await assistantReportService.createReport(uid,request,catalog)).deterministicSummary,
					interpret:async(_text,state):Promise<AssistantAiConversationResponse>=>{currentModelCalls++;
						const common={name:'Teste de desempenho',bankRef:state.catalog.banks![0]!.handle,categoryRef:state.catalog.expenseCategories![0]!.handle};
						return {text:'',reportRequests:[],toolCallCount:1,actions:Array.from({length:scenario==='batch10'?10:1},()=>({kind:'create_expense',payload:scenario==='answer'?common:{...common,valueInCents:100,date}}))};
					},
				});
				const started=performance.now();
				if(scenario==='simple')await conversation.send('Registre R$ 1,00 de teste hoje no Nubank, categoria alimentação');
				if(scenario==='read')await conversation.send('Qual meu saldo?');
				if(scenario==='answer'){await conversation.send('Registre a despesa Teste de desempenho');await conversation.send('R$ 1,00, hoje');}
				if(scenario==='batch10'){await conversation.send('Registre dez despesas');await conversation.send('confirmo');}
				const elapsed=performance.now()-started;
				const expected=scenario==='read'?0:scenario==='batch10'?10:1;
				expect(conversation.snapshot().drafts.filter(item=>item.status==='succeeded')).toHaveLength(expected);
				expect(conversation.snapshot().messages.filter(item=>item.type==='error')).toHaveLength(0);
				totalWrites+=expected;
				if(sample>=0){durations.push(elapsed);counts.push(Object.fromEntries(Object.keys(mockCalls).map(key=>[key,mockCalls[key as keyof typeof mockCalls]-startCalls[key as keyof typeof mockCalls]])) as typeof mockCalls);modelCalls+=currentModelCalls;}
				conversation.dispose();
			}
			durations.sort((a,b)=>a-b);
			metrics[scenario]={samples:20,p50ms:Number(durations[9]!.toFixed(2)),p95ms:Number(durations[18]!.toFixed(2)),minCalls:Object.fromEntries(Object.keys(mockCalls).map(key=>[key,Math.min(...counts.map(item=>item[key as keyof typeof mockCalls]))])),maxCalls:Object.fromEntries(Object.keys(mockCalls).map(key=>[key,Math.max(...counts.map(item=>item[key as keyof typeof mockCalls]))])),modelSeamCallsPerSample:modelCalls/20,financialEffectsPerSample:scenario==='read'?0:scenario==='batch10'?10:1};
		}
		const expenses=await getDocs(query(collection(mockDb,'expenses'),where('personId','==',uid)));
		expect(expenses.size).toBe(501+totalWrites);
		expect(expenses.docs.reduce((sum,record)=>sum+Number(record.data().valueInCents),0)).toBe(501+totalWrites*100);
		console.log('LUMUS_CONVERSATION_EMULATOR_METRICS '+JSON.stringify({initialCatalogue:501,finalExpenses:expenses.size,interpretation:'deterministic model seam',renderer:false,metrics}));
	},180_000);
});
