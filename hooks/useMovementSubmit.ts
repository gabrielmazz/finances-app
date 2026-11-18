import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { bankIntentLock } from '@/application/bankIntentLock';
import { useBankAccounts } from '@/contexts/BankAccountsContext';
import { getFirebaseClient } from '@/firebase/client';
import { confirmMandatoryCycle, createBankTransfer, createCashWithdrawal, createMovement, newMovementId, updateMovement } from '@/firebase/movements';
import type { BankOperationInput, BankTransferInput, Movement, MovementInput } from '@/domain/movements';
import { useCategoryScope } from './useCategoryScope';

type MovementSubmission = MovementInput | (BankOperationInput & { operation: 'cash-withdrawal' }) | (BankTransferInput & { operation: 'transfer' });

export function useMovementSubmit() {
  const scope = useCategoryScope();
  const { reload } = useBankAccounts();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const running = React.useRef(false);
  const completedBankOperation = React.useRef<{ key: string; draft: string } | null>(null);
  const resetBankOperation = React.useCallback(() => { completedBankOperation.current = null; }, []);
  const submit = React.useCallback(async (value: MovementSubmission, existing: Movement | null = null, mandatory?: { id: string; installments: number }) => {
    if (!scope) throw Error('movements/invalid-context');
    if (running.current) throw Error('movements/in-progress');
    running.current = true;
    setIsSubmitting(true);
    try {
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
      const draft = bankOperation ? JSON.stringify({ ...value, explanation: value.explanation.trim() }) : null;
      if (draft && completedBankOperation.current?.key === key && completedBankOperation.current.draft === draft) throw Error('movements/already-registered');
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
        if (bankOperation && error instanceof Error && error.message === 'movements/operation-conflict') await releaseIntent();
        throw error;
      });
      if (draft) completedBankOperation.current = { key, draft };
      await releaseIntent();
      if (bankOperation) await reload();
      return saved;
    } finally { running.current = false; setIsSubmitting(false); }
  }, [reload, scope]);
  return { submit, isSubmitting, resetBankOperation };
}
