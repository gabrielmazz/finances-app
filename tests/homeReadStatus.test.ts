import { useHomeScreenData } from '../hooks/useHomeScreenData';

jest.mock('../contexts/BankAccountsContext', () => ({ useBankAccounts: jest.fn() }));
jest.mock('../hooks/useRecentMovements', () => ({ useRecentMovements: () => ({ items: [], cashIncomplete: false, incomplete: false, loading: false, error: null, refresh: jest.fn() }) }));
const { useBankAccounts } = require('../contexts/BankAccountsContext');

it('distinguishes incomplete historical access from an empty account list', () => {
  const base = { scopeError: null, active: { items: [], loading: false, error: null, loaded: true, issues: 0, unavailable: false }, reload: jest.fn() };
  useBankAccounts.mockReturnValue(base);
  expect(useHomeScreenData().overview.warning).toBeNull();
  useBankAccounts.mockReturnValue({ ...base, active: { ...base.active, issues: 1, contextUnverified: true } });
  expect(useHomeScreenData().overview.warning).toContain('Encontramos contas antigas');
  useBankAccounts.mockReturnValue({ ...base, active: { ...base.active, unavailable: true } });
  expect(useHomeScreenData().overview.warning).toContain('Nenhuma conta pessoal antiga ativa');
  useBankAccounts.mockReturnValue({ ...base, sharedReadStatus: 'authorized', active: { ...base.active, unavailable: true } });
  expect(useHomeScreenData().overview.warning).toContain('acesso compartilhado autorizado');
  useBankAccounts.mockReturnValue({ ...base, sharedReadStatus: 'group-listed', active: { ...base.active, unavailable: true } });
  expect(useHomeScreenData().overview.warning).toContain('vínculos de grupo');
  useBankAccounts.mockReturnValue({ ...base, sharedReadStatus: 'unverified', active: { ...base.active, unavailable: true } });
  expect(useHomeScreenData().overview.warning).toContain('Não foi possível verificar o acesso compartilhado');
  useBankAccounts.mockReturnValue({ ...base, scope: { kind: 'group' }, active: { ...base.active, unavailable: true } });
  expect(useHomeScreenData().overview.warning).toContain('grupo atual');
  useBankAccounts.mockReturnValue({ ...base, active: { ...base.active, issues: 2 } });
  expect(useHomeScreenData().overview.warning).toContain('registros de contas');
  expect(useHomeScreenData().overview.error).toBeNull();
  useBankAccounts.mockReturnValue({ ...base, active: { ...base.active, issues: 1, items: [{ id: 'synthetic', name: 'Banco teste', balanceInCents: null, colorHex: null, source: 'legacy', institutionKey: 'outro-banco' }] } });
  expect(useHomeScreenData().overview.data.bankBalances).toHaveLength(1);
  expect(useHomeScreenData().overview.historyError).toContain('indisponível');
  useBankAccounts.mockReturnValue({ ...base, active: { ...base.active, error: 'Acesso negado' } });
  expect(useHomeScreenData().overview.error).toBe('Acesso negado');
});
