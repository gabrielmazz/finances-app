import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { auth, db } from '@/FirebaseConfig';
import { createFinancialClientActionId } from '@/functions/FinancialLedgerFirebase';
import { getSparkContextFirebase } from '@/functions/SparkContextFirebase';
import { submitSparkInvestmentFormFirebase, type SparkInvestmentFormDraft, type SparkInvestmentFormState } from '@/functions/SparkInvestmentFormFirebase';
import { DEMO_FIREBASE_PROJECT_ID } from '@/utils/firebaseRuntime';
import { normalizeCdiPercentageInBasisPoints, getInvestmentAssetType, getInvestmentValuationMethod } from '@/utils/investmentPortfolio';
import type { addFinanceInvestmentFirebase, updateFinanceInvestmentFirebase, syncFinanceInvestmentValueFirebase, moveFinanceInvestmentFirebase } from '@/functions/FinancesFirebase';

export function useSparkInvestmentForm() {
  const { user } = useAuth(), queryClient = useQueryClient();
  const owner = user?.uid ?? null;
  const state = useRef<{ owner: string | null; form: SparkInvestmentFormState; busy: boolean; pending: boolean; draft?: SparkInvestmentFormDraft }>({ owner, form: {}, busy: false, pending: false });
  if (state.current.owner !== owner) state.current = { owner, form: {}, busy: false, pending: false };
  const [, refresh] = useState(0), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const publish = useCallback(() => { if (mounted.current) refresh(value => value + 1); }, []);
  const submit = useCallback(async (draft: SparkInvestmentFormDraft) => {
    draft = 'selectedDate' in draft ? { ...draft, selectedDate: new Date(draft.selectedDate) } : { ...draft };
    const work = state.current;
    if (!work.owner || auth.currentUser?.uid !== work.owner || draft.actorId !== work.owner) return { success: false as const, error: 'A sessão autenticada mudou.' };
    if (work.busy) return { success: false as const, error: 'Aguarde a confirmação em andamento.' };
    work.busy = true; publish();
    try {
      const result = await submitSparkInvestmentFormFirebase(db, work.form, draft, () => createFinancialClientActionId('form_investment'));
      // [[Guia de Testes Locais]]: cadastro público não prepara o grupo da demonstração.
      if (result === null && db.app?.options?.projectId === DEMO_FIREBASE_PROJECT_ID) {
        throw new Error('Esta conta ainda não possui um grupo financeiro Spark preparado. Na demonstração local, saia e entre com spark@demo.lumus.local. O cadastro de novas contas ainda não prepara esse grupo.');
      }
      if (state.current !== work || auth.currentUser?.uid !== draft.actorId) throw new Error('A sessão autenticada mudou.');
      work.pending = !!result && 'preparing' in result && result.preparing === true;
      if (work.pending) work.draft = draft;
      if (result?.success) {
        work.pending = false; work.draft = undefined;
        void Promise.resolve().then(() => queryClient.invalidateQueries({ queryKey: ['finance', draft.actorId], refetchType: 'all' }))
          .catch(error => console.warn('Não foi possível atualizar a carteira.', error));
      }
      return result;
    } catch (error) {
      work.pending = work.pending || work.form.intent?.status === 'uncertain' || !!work.form.intent?.financialConfirmed && work.form.intent.status !== 'confirmed';
      if ((error as { sparkIntentCancelled?: boolean })?.sparkIntentCancelled && !work.form.intent) { work.pending = false; work.draft = undefined; }
      if (work.pending && !work.draft) work.draft = draft;
      return { success: false as const, error: error instanceof Error ? error.message : 'Não foi possível confirmar o investimento.' };
    } finally { work.busy = false; if (state.current === work) publish(); }
  }, [publish, queryClient]);
  const actor = () => { const id = auth.currentUser?.uid; if (!id) throw new Error('Usuário não autenticado.'); return id; };
  const create = async (params: Parameters<typeof addFinanceInvestmentFirebase>[0]) => {
    const assetType = getInvestmentAssetType(params.assetType);
    return submit({ actorId: params.personId, action: 'create', name: params.name, bankId: params.bankId,
      principalInCents: params.initialValueInCents, observedValueInCents: params.currentValueInCents ?? params.initialValueInCents,
      cdiPercentageInBasisPoints: params.cdiPercentageInBasisPoints ?? normalizeCdiPercentageInBasisPoints(params.cdiPercentage), assetType,
      valuationMethod: getInvestmentValuationMethod(params.valuationMethod, assetType), redemptionTerm: params.redemptionTerm, description: params.description ?? null, selectedDate: params.date });
  };
  const update = async (params: Parameters<typeof updateFinanceInvestmentFirebase>[0]) => {
    if (params.name === undefined || params.initialValueInCents === undefined || params.bankId === undefined || params.redemptionTerm === undefined) throw new Error('Confirme o cadastro completo antes de editar.');
    return submit({ actorId: actor(), action: 'edit', accountId: params.investmentId, name: params.name, bankId: params.bankId,
      principalInCents: params.initialValueInCents, observedValueInCents: params.currentValueInCents,
      cdiPercentageInBasisPoints: params.cdiPercentageInBasisPoints ?? normalizeCdiPercentageInBasisPoints(params.cdiPercentage), assetType: params.assetType,
      valuationMethod: params.valuationMethod, redemptionTerm: params.redemptionTerm, description: params.description ?? null });
  };
  const sync = async (params: Parameters<typeof syncFinanceInvestmentValueFirebase>[0]) => submit({ actorId: params.personId || actor(), action: 'sync',
    accountId: params.investmentId, selectedDate: params.date ?? new Date(), observedValueInCents: params.syncedValueInCents, reason: params.reason ?? 'manual' });
  const move = async (params: Parameters<typeof moveFinanceInvestmentFirebase>[0]) => {
    if (!params.bankId) throw new Error('Selecione o banco da movimentação.');
    return submit({ actorId: actor(), action: 'move', accountId: params.investmentId, bankId: params.bankId, amountInCents: params.valueInCents,
      selectedDate: params.date, movement: params.type, expectedCurrentValueInCents: params.expectedCurrentValueInCents });
  };
  const archive = async (accountId: string) => submit({ actorId: actor(), action: 'archive', accountId });
  const undoValuation = async (accountId: string, reason: string, originalOperationId: string, expectedRevision: number) =>
    submit({ actorId: actor(), action: 'undo-valuation', accountId, reason, originalOperationId, expectedRevision });
  const moveTemplate = async (params: { investmentId: string; deltaInCents: number; amountInCents: number; movementKind: 'income' | 'expense'; selectedDate: Date; bankId: string | null; moneyFormat: boolean }) => {
    const actorId = actor();
    if (!await getSparkContextFirebase(db, actorId)) return null;
    if (!Number.isSafeInteger(params.deltaInCents) || params.amountInCents !== Math.abs(params.deltaInCents)
      || (params.movementKind === 'expense' ? params.deltaInCents <= 0 : params.deltaInCents >= 0)) throw new Error('O valor e o sentido devem corresponder ao aporte ou resgate selecionado.');
    if (!params.moneyFormat && !params.bankId) throw new Error('Selecione o banco da movimentação.');
    const result = await move({ investmentId: params.investmentId, bankId: params.moneyFormat ? 'cash' : params.bankId!, valueInCents: params.amountInCents,
      date: params.selectedDate, type: params.movementKind === 'expense' ? 'deposit' : 'redemption' });
    if (!result) throw new Error('O contexto financeiro mudou. Atualize o formulário.');
    return result;
  };
  const reset = useCallback(() => {
    if (state.current.busy || state.current.pending) return false;
    state.current.form = {}; state.current.draft = undefined; publish(); return true;
  }, [publish]);
  const retryPending = useCallback(() => state.current.draft ? submit(state.current.draft) : Promise.resolve(null), [submit]);
  return { create, update, sync, move, moveTemplate, archive, undoValuation, reset, retryPending,
    fieldsLocked: state.current.busy || state.current.pending, isPending: state.current.pending,
    hasPending: () => state.current.pending, hasUncertainResult: () => state.current.form.intent?.status === 'uncertain' };
}
