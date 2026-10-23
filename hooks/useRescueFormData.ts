import { useCallback, useEffect, useState } from 'react';
import { auth, db } from '@/FirebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import { getSparkContextFirebase } from '@/functions/SparkContextFirebase';
import { readSparkAccountsFirebase } from '@/functions/SparkAccountReadFirebase';
import { getFinancialLedgerAccountsFirebase, getFinancialLedgerContextFirebase, type FinancialLedgerContext } from '@/functions/FinancialLedgerFirebase';
import { getBanksWithUsersByPersonFirebase, getBankCurrentBalanceInCentsFirebase } from '@/functions/BankFirebase';

type BankOption = { id: string; name: string; iconKey?: string | null; colorHex?: string | null; currentBalanceInCents?: number | null };
type RescueContext = { mode: 'spark' | 'ledger' | 'legacy'; banks: BankOption[]; ledger: FinancialLedgerContext | null; cashAccountId: string | null };
type ReadState<T> = { key: string; data: T | null; loading: boolean; error: string | null };

/** [[Resgate de Caixa]]: um erro de contexto não escolhe legado; seleção, sessão e recarga invalidam leituras anteriores. */
export function useRescueFormData(selectedBankId: string | null) {
  const { user } = useAuth();
  const personId = user?.uid ?? null;
  const [version, setVersion] = useState(0);
  const key = JSON.stringify([personId, version]);
  const [state, setState] = useState<ReadState<RescueContext>>({ key, data: null, loading: true, error: null });
  const reload = useCallback(() => setVersion(value => value + 1), []);
  useEffect(() => {
    let active = true;
    const checkSession = () => { if (auth.currentUser?.uid !== personId) throw new Error('A sessão mudou. Entre novamente.'); };
    setState({ key, data: null, loading: true, error: null });
    void (async () => {
      try {
        if (!personId) throw new Error('Entre novamente para registrar o saque.');
        const spark = await getSparkContextFirebase(db, personId);
        if (!active) return; checkSession();
        let data: RescueContext;
        if (spark) {
          const accounts = await readSparkAccountsFirebase(db, personId, spark.groupId, { requireCurrent: false });
          checkSession();
          const cash = accounts.find(account => account.accountId === 'cash' && account.position.kind === 'cash' && account.position.active && !account.lifecycle.archived);
          if (!cash) throw new Error('A conta Dinheiro do grupo não está disponível. Tente novamente.');
          const banks = accounts.filter(account => account.position.kind === 'bank' && account.position.active && !account.lifecycle.archived).map(account => {
            if (!account.catalog) throw new Error('Conclua o cadastro do banco antes de registrar saques.');
            return { id: account.accountId, name: account.catalog.name, iconKey: account.catalog.iconKey, colorHex: account.catalog.colorHex };
          });
          data = { mode: 'spark', banks, ledger: null, cashAccountId: cash.accountId };
        } else {
          const ledger = await getFinancialLedgerContextFirebase(personId);
          if (!active) return; checkSession();
          if (ledger) {
            const accounts = await getFinancialLedgerAccountsFirebase(ledger.groupId);
            checkSession();
            const available = accounts.filter(account => account.isActive !== false && !account.archivedAt);
            const cash = available.find(account => account.kind === 'cash');
            if (!cash) throw new Error('A conta Caixa do grupo não está disponível. Tente novamente.');
            data = { mode: 'ledger', ledger, cashAccountId: cash.id, banks: available.filter(account => account.kind === 'bank') };
          } else {
            const result = await getBanksWithUsersByPersonFirebase(personId);
            checkSession();
            if (!result.success || !Array.isArray(result.data)) throw new Error('Não foi possível carregar os bancos. Confira a conexão e tente novamente.');
            data = { mode: 'legacy', banks: result.data.map(bank => ({ id: bank.id, name: typeof bank.name === 'string' && bank.name.trim() ? bank.name.trim() : 'Banco sem nome',
              iconKey: typeof bank.iconKey === 'string' ? bank.iconKey : null, colorHex: typeof bank.colorHex === 'string' ? bank.colorHex : null })), ledger: null, cashAccountId: null };
          }
        }
        if (active) setState({ key, data, loading: false, error: null });
      } catch (error) {
        if (active) setState({ key, data: null, loading: false, error: error instanceof Error ? error.message : 'Não foi possível preparar o saque. Tente novamente.' });
      }
    })();
    return () => { active = false; };
  }, [personId, version, key]);
  const context = state.key === key ? state : { key, data: null, loading: true, error: null };
  const selectedBank = context.data?.banks.find(bank => bank.id === selectedBankId);
  const balanceKey = JSON.stringify([key, selectedBankId, !!selectedBank, context.data?.mode]);
  const [balance, setBalance] = useState<ReadState<number>>({ key: balanceKey, data: null, loading: false, error: null });
  const ledgerBalance = selectedBank?.currentBalanceInCents;
  useEffect(() => {
    let active = true;
    setBalance({ key: balanceKey, data: null, loading: !!selectedBank, error: null });
    if (selectedBank && personId) void (async () => {
      try {
        const result = context.data?.mode === 'ledger' ? { success: true, data: ledgerBalance } : await getBankCurrentBalanceInCentsFirebase(personId, selectedBank.id);
        if (auth.currentUser?.uid !== personId) throw new Error('A sessão mudou. Entre novamente.');
        if (!result.success || typeof result.data !== 'number' || !Number.isSafeInteger(result.data)) throw new Error('Não foi possível confirmar o saldo do banco. Tente novamente.');
        if (active) setBalance({ key: balanceKey, data: result.data, loading: false, error: null });
      } catch (error) {
        if (active) setBalance({ key: balanceKey, data: null, loading: false, error: error instanceof Error ? error.message : 'Não foi possível confirmar o saldo do banco. Tente novamente.' });
      }
    })();
    return () => { active = false; };
  }, [personId, selectedBank?.id, context.data?.mode, ledgerBalance, balanceKey]);
  const currentBalance = balance.key === balanceKey ? balance : { data: null, loading: !!selectedBank, error: null };
  const selectionError = context.data && selectedBankId && !selectedBank ? 'O banco selecionado não está mais disponível. Escolha outro banco.' : null;
  return { personId, banks: context.data?.banks ?? [], isSparkMode: context.data?.mode === 'spark',
    financialLedgerContext: context.data?.ledger ?? null, cashAccountId: context.data?.cashAccountId ?? null,
    isLoadingBanks: context.loading, banksError: context.error, currentBankBalanceInCents: currentBalance.data, isLoadingBankBalance: currentBalance.loading,
    error: context.error || selectionError || currentBalance.error, needsBank: !!context.data && context.data.banks.length === 0, reload };
}
