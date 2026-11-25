import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { bankIntentLock } from '@/application/bankIntentLock';
import { useBankAccounts } from '@/contexts/BankAccountsContext';
import { getFirebaseClient } from '@/firebase/client';
import { confirmMandatoryCycle, createBankTransfer, createCashWithdrawal, createMovement, MovementReferenceConfirmationRequired, newMovementId, updateMovement } from '@/firebase/movements';
import type { BankOperationInput, BankTransferInput, Movement, MovementInput, ReferenceChoice } from '@/domain/movements';
import { MovementReferenceDialog } from '@/components/uiverse/banks/movement-reference-dialog';
import { useCategoryScope } from './useCategoryScope';

type MovementSubmission = MovementInput | (BankOperationInput & { operation: 'cash-withdrawal' }) | (BankTransferInput & { operation: 'transfer' });

export function useMovementSubmit() {
  const scope = useCategoryScope();
  const { reload, canWrite } = useBankAccounts();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [reference, setReference] = React.useState<MovementReferenceConfirmationRequired | null>(null);
  const resolveReference = React.useRef<((choice: ReferenceChoice | null) => void) | null>(null);
  const chooseReference = React.useCallback((choice: ReferenceChoice | null) => {
    const resolve = resolveReference.current;
    resolveReference.current = null;
    setReference(null);
    resolve?.(choice);
  }, []);
  const mounted = React.useRef(true);
  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      resolveReference.current?.(null);
      resolveReference.current = null;
    };
  }, []);
  const running = React.useRef(false);
  const completed = React.useRef<{ key: string; draft: string | null } | null>(null);
  const resetBankOperation = React.useCallback(() => { completed.current = null; }, []);
  const save = React.useCallback(async (value: MovementSubmission, original: MovementSubmission, existing: Movement | null, mandatory?: { id: string; installments: number }) => {
    if (!scope) throw Error('movements/invalid-context');
    if (!canWrite) throw Error('read-only/operation');
    const client = getFirebaseClient();
    if (mandatory) {
      if (existing || 'operation' in value) throw Error('movements/unsupported-edit');
      return await confirmMandatoryCycle(client, scope, mandatory.id, value, mandatory.installments);
    }
    if (existing) {
      if ('operation' in value) throw Error('movements/unsupported-edit');
      return await updateMovement(client, scope, existing, value);
    }
    const bankOperation = 'operation' in value;
    const kind = bankOperation ? value.operation : value.type;
    const key = `lumus:movement:v1:${scope.uid}:${scope.kind}:${scope.id}:${kind}`;
    const draft = JSON.stringify({ ...original, explanation: original.explanation.trim() });
    if (completed.current?.key === key && (completed.current.draft === draft || completed.current.draft === null))
      throw Error('movements/already-registered');
    const id = await bankIntentLock(key, async () => {
      const pending = await AsyncStorage.getItem(key);
      if (pending) return pending;
      const next = newMovementId(client, scope);
      await AsyncStorage.setItem(key, next);
      return next;
    });
    const releaseIntent = () => bankIntentLock(key, async () => {
      if (await AsyncStorage.getItem(key) === id) await AsyncStorage.removeItem(key);
    });
    const saved = await (bankOperation
      ? value.operation === 'transfer' ? createBankTransfer(client, scope, id, value) : createCashWithdrawal(client, scope, id, value)
      : createMovement(client, scope, id, value)).catch(async error => {
      if (error instanceof Error && error.message === 'movements/operation-conflict') {
        completed.current = { key, draft: null };
        await releaseIntent();
      }
      throw error;
    });
    completed.current = { key, draft };
    await releaseIntent();
    if (bankOperation) await reload();
    return saved;
  }, [reload, scope, canWrite]);
  const submit = React.useCallback(async (value: MovementSubmission, existing: Movement | null = null, mandatory?: { id: string; installments: number }) => {
    if (running.current) throw Error('movements/in-progress');
    running.current = true;
    setIsSubmitting(true);
    let draft = value;
    try {
      for (;;) {
        try { return await save(draft, value, existing, mandatory); }
        catch (error) {
          if (!(error instanceof MovementReferenceConfirmationRequired)) throw error;
          if (!mounted.current) return null;
          const destination = 'destinationAccountId' in draft && error.accountId === draft.destinationAccountId ? draft : null;
          if (destination ? destination.destinationReferenceTreatment : draft.referenceTreatment) throw error;
          const choice = await new Promise<ReferenceChoice | null>(resolve => {
            resolveReference.current = resolve;
            setReference(error);
          });
          if (!choice) return null;
          draft = destination ? { ...destination, destinationReferenceTreatment: choice } : { ...draft, referenceTreatment: choice };
        }
      }
    } finally {
      running.current = false;
      if (mounted.current) setIsSubmitting(false);
    }
  }, [save]);
  const referenceDialog = reference && React.createElement(MovementReferenceDialog, {
    accountName: reference.accountName, referenceAt: reference.referenceAt, onChoice: chooseReference,
  });
  return { submit, isSubmitting, resetBankOperation, canWrite, referenceDialog };
}
