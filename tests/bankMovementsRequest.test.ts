import React from 'react';
import { act, renderHook } from '@testing-library/react-native';
import { useBankMovementsRequest } from '@/hooks/useBankMovementsRequest';

let mockUid: string | null = 'owner';
jest.mock('@/FirebaseConfig', () => ({ auth: { get currentUser() { return mockUid ? { uid: mockUid } : null; } } }));
jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: mockUid ? { uid: mockUid } : null }) }));

const deferred = () => {
  let resolve!: (value: number) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<number>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const useStatement = (scope: string) => {
  const { beginRequest, cancelRequest } = useBankMovementsRequest(scope);
  const [value, setValue] = React.useState<number | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const load = async (promise: Promise<number>) => {
    const current = beginRequest();
    setValue(null); setError(null); setLoading(true);
    try { const next = await promise; if (current()) setValue(next); }
    catch { if (current()) setError('Falha de leitura'); }
    finally { if (current()) setLoading(false); }
  };
  return { load, cancelRequest, value, loading, error };
};
beforeEach(() => { mockUid = 'owner'; });

test('consulta lenta anterior não substitui o saldo nem encerra o carregamento atual', async () => {
  const old = deferred(), current = deferred();
  const { result, unmount } = await renderHook(() => useStatement('bank:october'));
  let oldLoad!: Promise<void>, newLoad!: Promise<void>;
  await act(async () => { oldLoad = result.current.load(old.promise); newLoad = result.current.load(current.promise); });
  await act(async () => { old.resolve(1000); await oldLoad; });
  expect(result.current.value).toBeNull(); expect(result.current.loading).toBe(true);
  await act(async () => { current.resolve(113000); await newLoad; });
  expect(result.current.value).toBe(113000); expect(result.current.loading).toBe(false);
  await unmount();
});

test.each(['other-bank:october', 'bank:november', 'cash:october'])('troca de escopo para %s descarta sucesso e falha antigos', async scope => {
  const old = deferred();
  const { result, rerender, unmount } = await renderHook(({ scope }: { scope: string }) => useStatement(scope), { initialProps: { scope: 'bank:october' } });
  let pending!: Promise<void>;
  await act(async () => { pending = result.current.load(old.promise); });
  await rerender({ scope });
  await act(async () => { await result.current.load(Promise.resolve(2000)); });
  await act(async () => { old.reject(new Error('offline')); await pending; });
  expect(result.current.value).toBe(2000); expect(result.current.error).toBeNull(); expect(result.current.loading).toBe(false);
  await unmount();
});

test('erro atual permite tentar novamente sem manter o valor anterior', async () => {
  const { result, unmount } = await renderHook(() => useStatement('bank'));
  await act(async () => { await result.current.load(Promise.resolve(1000)); });
  const failure = deferred(); let pending!: Promise<void>;
  await act(async () => { pending = result.current.load(failure.promise); });
  expect(result.current.value).toBeNull();
  await act(async () => { failure.reject(new Error('offline')); await pending; });
  expect(result.current.error).toBe('Falha de leitura'); expect(result.current.loading).toBe(false);
  await act(async () => { await result.current.load(Promise.resolve(113000)); });
  expect(result.current.value).toBe(113000); expect(result.current.error).toBeNull();
  await unmount();
});

test('troca de UID ou logout rejeita resposta mesmo antes do próximo render', async () => {
  const { result, rerender, unmount } = await renderHook(() => useBankMovementsRequest('bank'));
  const ownerRequest = result.current.beginRequest();
  mockUid = 'other'; expect(ownerRequest()).toBe(false);
  await rerender({});
  const otherRequest = result.current.beginRequest(); expect(otherRequest()).toBe(true);
  mockUid = null; expect(otherRequest()).toBe(false);
  await unmount();
});

test('saída de foco e desmontagem invalidam leituras pendentes', async () => {
  const { result, unmount } = await renderHook(() => useBankMovementsRequest('bank'));
  const blurred = result.current.beginRequest();
  result.current.cancelRequest(); expect(blurred()).toBe(false);
  const active = result.current.beginRequest(); expect(active()).toBe(true);
  await unmount(); expect(active()).toBe(false);
});
