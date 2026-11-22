import React, { act } from 'react';
import { createRoot } from 'test-renderer';
import { useHomeScreenData } from '../hooks/useHomeScreenData';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
jest.mock('expo-router', () => ({ useIsFocused: () => true }));
jest.mock('../firebase/client', () => ({ getFirebaseClient: jest.fn() }));
jest.mock('../contexts/BankAccountsContext', () => ({ useBankAccounts: jest.fn() }));
jest.mock('../hooks/useRecentMovements', () => ({ useRecentMovements: () => ({ items: [], cashIncomplete: false, incomplete: false, loading: false, error: null, refresh: jest.fn() }) }));
const { useBankAccounts } = require('../contexts/BankAccountsContext');

async function readHome() {
  const renderer = createRoot();
  let overview!: ReturnType<typeof useHomeScreenData>['overview'];
  function Home() { overview = useHomeScreenData().overview; return null; }
  await act(async () => { renderer.render(React.createElement(Home)); });
  await act(async () => { renderer.unmount(); });
  return overview;
}

it('distinguishes incomplete historical access from an empty account list', async () => {
  const base = { scopeError: null, active: { items: [], loading: false, error: null, loaded: true, issues: 0, unavailable: false }, reload: jest.fn() };
  useBankAccounts.mockReturnValue(base);
  expect((await readHome()).warning).toBeNull();
  useBankAccounts.mockReturnValue({ ...base, active: { ...base.active, issues: 1, contextUnverified: true } });
  expect((await readHome()).warning).toContain('Encontramos contas antigas');
  useBankAccounts.mockReturnValue({ ...base, active: { ...base.active, unavailable: true } });
  expect((await readHome()).warning).toContain('Nenhuma conta pessoal antiga ativa');
  useBankAccounts.mockReturnValue({ ...base, sharedReadStatus: 'authorized', active: { ...base.active, unavailable: true } });
  expect((await readHome()).warning).toContain('acesso compartilhado autorizado');
  useBankAccounts.mockReturnValue({ ...base, sharedReadStatus: 'group-listed', active: { ...base.active, unavailable: true } });
  expect((await readHome()).warning).toContain('vínculos de grupo');
  useBankAccounts.mockReturnValue({ ...base, sharedReadStatus: 'unverified', active: { ...base.active, unavailable: true } });
  expect((await readHome()).warning).toContain('Não foi possível verificar o acesso compartilhado');
  useBankAccounts.mockReturnValue({ ...base, scope: { kind: 'group' }, active: { ...base.active, unavailable: true } });
  expect((await readHome()).warning).toContain('grupo atual');
  useBankAccounts.mockReturnValue({ ...base, active: { ...base.active, issues: 2 } });
  expect((await readHome()).warning).toContain('registros de contas');
  expect((await readHome()).error).toBeNull();
  useBankAccounts.mockReturnValue({ ...base, active: { ...base.active, issues: 1, items: [{ id: 'synthetic', name: 'Banco teste', balanceInCents: null, colorHex: null, source: 'legacy', institutionKey: 'outro-banco' }] } });
  expect((await readHome()).data.bankBalances).toHaveLength(1);
  expect((await readHome()).historyError).toContain('indisponível');
  useBankAccounts.mockReturnValue({ ...base, active: { ...base.active, error: 'Acesso negado' } });
  expect((await readHome()).error).toBe('Acesso negado');
});
