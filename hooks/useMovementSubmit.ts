import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { bankIntentLock } from '@/application/bankIntentLock';
import { getFirebaseClient } from '@/firebase/client';
import { createMovement, newMovementId, updateMovement } from '@/firebase/movements';
import type { Movement, MovementInput } from '@/domain/movements';
import { useCategoryScope } from './useCategoryScope';

export function useMovementSubmit() {
  const scope = useCategoryScope();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const running = React.useRef(false);
  const submit = React.useCallback(async (value: MovementInput, existing: Movement | null) => {
    if (!scope) throw Error('movements/invalid-context');
    if (running.current) throw Error('movements/in-progress');
    running.current = true;
    setIsSubmitting(true);
    try {
      const client = getFirebaseClient();
      if (existing) return await updateMovement(client, scope, existing, value);
      const key = `lumus:movement:v1:${scope.uid}:${scope.kind}:${scope.id}:${value.type}`;
      return await bankIntentLock(key, async () => {
        let id = await AsyncStorage.getItem(key);
        if (!id) { id = newMovementId(client, scope); await AsyncStorage.setItem(key, id); }
        const saved = await createMovement(client, scope, id, value);
        if (await AsyncStorage.getItem(key) === id) await AsyncStorage.removeItem(key);
        return saved;
      });
    } finally { running.current = false; setIsSubmitting(false); }
  }, [scope]);
  return { submit, isSubmitting };
}
