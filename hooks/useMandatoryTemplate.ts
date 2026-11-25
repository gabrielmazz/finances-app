import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { bankIntentLock } from '@/application/bankIntentLock';
import { errorMessage } from '@/application/errors';
import { useBankAccounts } from '@/contexts/BankAccountsContext';
import { getFirebaseClient } from '@/firebase/client';
import { newMandatoryId, readMandatoryTemplate, saveMandatoryTemplate } from '@/firebase/mandatory';
import { civilDate, type MandatoryInput, type MandatoryTemplate } from '@/domain/mandatory';
import type { MovementType } from '@/domain/movements';
import { getMandatoryInstallmentEndDateFromTotal } from '@/utils/mandatoryInstallments';
import { useCategories } from './useCategories';
import { useCategoryScope } from './useCategoryScope';

export function useMandatoryTemplate(type: MovementType, id: string | null) {
  const scope = useCategoryScope();
  const { canWrite } = useBankAccounts();
  const tags = useCategories(true, type === 'gain' ? 'mandatory-gain' : 'mandatory-expense');
  const identity = JSON.stringify([scope?.uid, scope?.kind, scope?.id, id]);
  const currentIdentity = React.useRef(identity);
  currentIdentity.current = identity;
  const [version, refresh] = React.useReducer(value => value + 1, 0);
  const [state, setState] = React.useState<{ identity: string; template: MandatoryTemplate | null; error: string | null; loading: boolean }>({ identity, template: null, error: null, loading: !!id });
  React.useEffect(() => {
    if (!id || !scope) return;
    let active = true;
    setState({ identity, template: null, error: null, loading: true });
    void readMandatoryTemplate(getFirebaseClient(), scope, id).then(template => {
      if (template.type !== type || !template.isActive) throw Error('mandatory/not-found');
      if (active) setState({ identity, template, error: null, loading: false });
    }).catch(error => {
      if (active) setState({ identity, template: null, error: errorMessage(error), loading: false });
    });
    return () => { active = false; };
  }, [id, identity, scope, type, version]);

  const template = state.identity === identity ? state.template : null;
  const start = template?.installmentStartDate;
  const record = React.useMemo<Record<string, unknown> | null>(() => {
    if (!template) return null;
    const startDate = start ? civilDate(start) : null;
    return { ...template, tagId: `${template.categorySource}:${template.categoryId}`, installmentStartDate: startDate,
      installmentEndDate: getMandatoryInstallmentEndDateFromTotal(startDate, template.installmentTotal),
      lastReceiptCycle: template.lastMovementDate ? template.lastCycle : null, lastPaymentCycle: template.lastMovementDate ? template.lastCycle : null };
  }, [template, start]);

  async function save(input: Omit<MandatoryInput, 'type'>) {
    if (!scope) throw Error('mandatory/not-found');
    if (!canWrite) throw Error('read-only/operation');
    const client = getFirebaseClient(), value = { ...input, type };
    if (template) return saveMandatoryTemplate(client, scope, template.id, value, template.revision);
    if (id) throw Error('mandatory/not-found');
    const key = `lumus:mandatory-template:${scope.uid}:${scope.kind}:${scope.id}:${type}`;
    return bankIntentLock(key, async () => {
      const pending = await AsyncStorage.getItem(key);
      const next = pending || newMandatoryId(client, scope);
      if (!pending) await AsyncStorage.setItem(key, next);
      if (currentIdentity.current !== identity) throw Error('session/changed');
      const saved = await saveMandatoryTemplate(client, scope, next, value, null);
      if (await AsyncStorage.getItem(key) === next) await AsyncStorage.removeItem(key);
      return saved;
    });
  }

  const tagOptions = React.useMemo(() => tags.items.filter(tag => !tag.blocked).map(tag => ({
    id: `${tag.source}:${tag.id}`, name: tag.name, iconFamily: tag.iconFamily, iconName: tag.iconName, iconStyle: tag.iconStyle,
  })), [tags.items]);
  return { record, loading: !!id && !!scope && (state.identity !== identity || state.loading), ready: !!scope && canWrite && (!id || !!template),
    error: scope && !canWrite ? errorMessage(Error('read-only/operation')) : state.identity === identity ? state.error : null, retry: refresh, save, tagOptions, tags };
}
