import { useCallback, useEffect, useState } from 'react';
import { auth } from '@/FirebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import { getBanksWithUsersByPersonFirebase, getBankCurrentBalanceInCentsFirebase } from '@/functions/BankFirebase';

export type TransferBankOption = { id: string; name: string; iconKey: string | null; colorHex: string | null };
type ReadState<T> = { key: string; data: T; loading: boolean; error: string | null };

function useTransferBalance(personId: string | null, bankId: string | null, enabled: boolean, version: number) {
  const key = JSON.stringify([personId, bankId, enabled, version]);
  const empty: ReadState<number | null> = { key, data: null, loading: enabled && !!bankId, error: null };
  const [state, setState] = useState(empty);
  useEffect(() => {
    let active = true;
    setState({ key, data: null, loading: enabled && !!bankId, error: null });
    if (enabled && bankId && personId) void (async () => {
      try {
        const result = await getBankCurrentBalanceInCentsFirebase(personId, bankId);
        if (auth.currentUser?.uid !== personId) throw new Error('A sessão mudou. Entre novamente.');
        if (!result.success || !Number.isSafeInteger(result.data)) throw new Error('Não foi possível confirmar o saldo do banco. Tente novamente.');
        if (active) setState({ key, data: result.data, loading: false, error: null });
      } catch (error) {
        if (active) setState({ key, data: null, loading: false, error: error instanceof Error ? error.message : 'Não foi possível confirmar o saldo do banco. Tente novamente.' });
      }
    })();
    return () => { active = false; };
  }, [personId, bankId, enabled, version, key]);
  return state.key === key ? state : empty;
}

/** [[Transferências]]: erro de contexto não libera fontes anteriores; recarga conserva os campos e invalida saldos antigos. */
export function useTransferFormData(sourceBankId: string | null, targetBankId: string | null) {
  const { user } = useAuth();
  const personId = user?.uid ?? null;
  const [version, setVersion] = useState(0);
  const key = JSON.stringify([personId, version]);
  const empty: ReadState<TransferBankOption[]> = { key, data: [], loading: true, error: null };
  const [state, setState] = useState(empty);
  const reload = useCallback(() => setVersion(value => value + 1), []);
  useEffect(() => {
    let active = true;
    setState({ key, data: [], loading: true, error: null });
    void (async () => {
      try {
        if (!personId) throw new Error('Entre novamente para registrar a transferência.');
        const result = await getBanksWithUsersByPersonFirebase(personId);
        if (auth.currentUser?.uid !== personId) throw new Error('A sessão mudou. Entre novamente.');
        if (!result.success || !Array.isArray(result.data)) throw new Error('Não foi possível carregar os bancos. Confira a conexão e tente novamente.');
        const banks = result.data.map(bank => ({ id: bank.id, name: typeof bank.name === 'string' && bank.name.trim() ? bank.name.trim() : 'Banco sem nome',
          iconKey: typeof bank.iconKey === 'string' ? bank.iconKey : null, colorHex: typeof bank.colorHex === 'string' ? bank.colorHex : null }));
        if (active) setState({ key, data: banks, loading: false, error: null });
      } catch (error) {
        if (active) setState({ key, data: [], loading: false, error: error instanceof Error ? error.message : 'Não foi possível preparar a transferência. Tente novamente.' });
      }
    })();
    return () => { active = false; };
  }, [personId, version, key]);
  const banksState = state.key === key ? state : empty;
  const ready = !banksState.loading && !banksState.error && !!personId;
  const sourceAvailable = banksState.data.some(bank => bank.id === sourceBankId);
  const targetAvailable = banksState.data.some(bank => bank.id === targetBankId);
  const source = useTransferBalance(personId, sourceBankId, ready && sourceAvailable, version);
  const target = useTransferBalance(personId, targetBankId, ready && targetAvailable, version);
  const selectionError = ready && (sourceBankId && !sourceAvailable || targetBankId && !targetAvailable)
    ? 'Um banco selecionado não está mais disponível. Escolha outro banco.' : null;
  return { personId, banks: banksState.data, isLoadingBanks: banksState.loading, banksError: banksState.error,
    originBalanceInCents: source.data, isLoadingBalance: source.loading,
    targetBalanceInCents: target.data, isLoadingTargetBalance: target.loading,
    error: banksState.error || selectionError || source.error || target.error, reload,
    needsBanks: ready && banksState.data.length < 2 };
}
