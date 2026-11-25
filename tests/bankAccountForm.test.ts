jest.mock('react-native-css-interop/jsx-runtime',()=>require('react/jsx-runtime'));
jest.mock('expo-router',()=>({useLocalSearchParams:()=>mockRouteParams}));
jest.mock('../firebase/client',()=>({getFirebaseClient:()=>({})}));
jest.mock('../firebase/banks',()=>({readBank:jest.fn(),updateBank:jest.fn()}));
jest.mock('../application/bankIntents',()=>({pendingBankIntent:jest.fn(),beginAnotherBank:jest.fn()}));
jest.mock('../contexts/BankAccountsContext',()=>({useBankAccounts:()=>mockAccounts}));
jest.mock('../hooks/useSession',()=>({useSession:()=>({context:{kind:'personal'}})}));
jest.mock('../hooks/usePostSubmitBehavior',()=>({usePostSubmitBehavior:()=>jest.fn()}));
import React,{act} from 'react';
import {createRoot} from 'test-renderer';
import {useBankAccountForm} from '../hooks/useBankAccountForm';
import {readBank,updateBank} from '../firebase/banks';
import {pendingBankIntent} from '../application/bankIntents';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
const mockAccounts={scope:null as any,scopeError:null,reload:jest.fn()};
let mockRouteParams: { bankId?: string; bankSource?: string };
let form:ReturnType<typeof useBankAccountForm>;
function Consumer(){form=useBankAccountForm();return null;}
beforeEach(()=>{mockAccounts.scope=null;mockRouteParams={};jest.clearAllMocks();(readBank as jest.Mock).mockRejectedValue(Error('banks/not-found'));});
test('directly opened form stays disabled until identity and pending-operation lookup finish',async()=>{
 const root=createRoot();let resolveId!:(id:string)=>void;
 (pendingBankIntent as jest.Mock).mockImplementation(()=>new Promise(resolve=>{resolveId=resolve;}));
 await act(()=>root.render(React.createElement(Consumer)));
 expect(form.isLoadingBank).toBe(true);expect(form.canWrite).toBe(false);
 mockAccounts.scope={kind:'personal',id:'owner',uid:'owner'};
 await act(()=>root.render(React.createElement(Consumer)));
 expect(form.isLoadingBank).toBe(true);
 await act(async()=>{resolveId('a'.repeat(20));await Promise.resolve();});
 expect(form.isLoadingBank).toBe(false);
 await act(()=>form.setNameBank('Rascunho preservado'));
 expect(form.nameBank).toBe('Rascunho preservado');
 await act(()=>root.unmount());
});
test('a lookup failure keeps the form blocked for explicit recovery and never confirms saving',async()=>{
 mockAccounts.scope={kind:'personal',id:'owner',uid:'owner'};
 (pendingBankIntent as jest.Mock).mockRejectedValue(Error('banks/intent-storage-unavailable'));
 const root=createRoot();await act(()=>root.render(React.createElement(Consumer)));
 expect(form.bankLoadError).toMatch(/identificador/);expect(form.saved).toBeNull();
 await act(()=>root.unmount());
});
test('a migrated account awaiting its reference cannot submit a separate update', async () => {
	const scope = { kind: 'personal', id: 'owner', uid: 'owner' } as const;
	const bankId = 'a'.repeat(20);
	mockAccounts.scope = scope;
	mockRouteParams = { bankId, bankSource: 'new' };
	jest.mocked(readBank).mockResolvedValueOnce({
		id: bankId, source: 'new', scope, name: 'Conta migrada', migrated: true,
		institutionKey: 'outro-banco', institutionName: 'Banco de teste', accountType: 'checking', colorHex: null,
		openingDate: null, balanceInCents: null, revision: 0, status: 'active', issue: null,
	});
	const root = createRoot();
	try {
		await act(async () => { root.render(React.createElement(Consumer)); });
		await act(() => form.registerBank());
		expect(updateBank).not.toHaveBeenCalled();
		expect(form.referenceRequired).toBe(true);
	} finally {
		await act(() => root.unmount());
	}
});
