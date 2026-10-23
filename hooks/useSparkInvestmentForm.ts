import { useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { auth, db } from '@/FirebaseConfig';
import { createFinancialClientActionId } from '@/functions/FinancialLedgerFirebase';
import { getSparkContextFirebase } from '@/functions/SparkContextFirebase';
import { submitSparkInvestmentFormFirebase, type SparkInvestmentFormDraft, type SparkInvestmentFormState } from '@/functions/SparkInvestmentFormFirebase';
import { normalizeCdiPercentageInBasisPoints, getInvestmentAssetType, getInvestmentValuationMethod } from '@/utils/investmentPortfolio';
import type { addFinanceInvestmentFirebase, updateFinanceInvestmentFirebase, syncFinanceInvestmentValueFirebase, moveFinanceInvestmentFirebase } from '@/functions/FinancesFirebase';

export function useSparkInvestmentForm() {
  const state = useRef<SparkInvestmentFormState>({}), queryClient = useQueryClient();
  const submit = useCallback(async (draft: SparkInvestmentFormDraft) => {
    try {
      const result = await submitSparkInvestmentFormFirebase(db, state.current, draft, () => createFinancialClientActionId('form_investment'));
      if (auth.currentUser?.uid !== draft.actorId) throw new Error('A sessão autenticada mudou.');
      if (result?.success) void queryClient.invalidateQueries({ queryKey: ['finance', draft.actorId], refetchType: 'all' }).catch(error => console.warn('Não foi possível atualizar a carteira.', error));
      return result;
    } catch (error) { return { success: false as const, error: error instanceof Error ? error.message : 'Não foi possível confirmar o investimento.' }; }
  }, [queryClient]);
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
  const reset = useCallback(() => { if (state.current.intent?.status === 'confirmed') state.current = {}; }, []);
  return { create, update, sync, move, moveTemplate, archive, undoValuation, reset,
    hasUncertainResult: () => state.current.intent?.status === 'uncertain' };
}
