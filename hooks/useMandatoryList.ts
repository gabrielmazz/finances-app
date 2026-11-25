import { useIsFocused } from 'expo-router';
import React from 'react';
import { errorMessage } from '@/application/errors';
import { useBankAccounts } from '@/contexts/BankAccountsContext';
import { civilDate, mandatoryAmount, type MandatoryTemplate } from '@/domain/mandatory';
import type { MovementType } from '@/domain/movements';
import { readCategory } from '@/firebase/categories';
import { getFirebaseClient } from '@/firebase/client';
import { archiveMandatoryTemplate, readMandatoryPage } from '@/firebase/mandatory';
import { cancelMandatoryCycle } from '@/firebase/movements';
import { resolveMonthlyOccurrence } from '@/utils/businessCalendar';
import { getCycleKeyFromDate } from '@/utils/mandatoryExpenses';
import { getMandatoryInstallmentEndDateFromTotal } from '@/utils/mandatoryInstallments';
import { toFinancialCivilDate } from '@/utils/financialCivilDate';
import { useCategoryScope } from './useCategoryScope';

type Loaded = Awaited<ReturnType<typeof readMandatoryPage>>;
type Tag = { name: string; iconFamily: string | null; iconName: string | null; iconStyle: string | null };
type State = { identity: string; page: Loaded | null; tags: Record<string, Tag>; loading: boolean; error: string | null };

export function useMandatoryList(type: MovementType) {
  const scope = useCategoryScope(), accounts = useBankAccounts(), focused = useIsFocused();
  const identity = JSON.stringify([scope?.uid, scope?.kind, scope?.id, type]);
  const current = React.useRef(identity);
  current.current = identity;
  const [state, setState] = React.useState<State>({ identity, page: null, tags: {}, loading: true, error: null });
  const last = React.useRef(state);
  last.current = state;
  const request = React.useRef(0);
  const load = React.useCallback(async (more = false) => {
    if (!scope || !focused) return;
    const previous = last.current.identity === identity ? last.current : null;
    if (more && (!previous?.page?.next || previous.loading)) return;
    const token = ++request.current;
    setState({ identity, page: previous?.page ?? null, tags: previous?.tags ?? {}, loading: true, error: null });
    try {
      const client = getFirebaseClient(), page = await readMandatoryPage(client, scope, type, more ? previous?.page?.next : null);
      const refs = new Map(page.items.map(item => [`${item.categorySource}:${item.categoryId}`, { source: item.categorySource, id: item.categoryId }]));
      const tags: Record<string, Tag> = more ? { ...previous?.tags } : {};
      await Promise.all([...refs.entries()].filter(([key]) => !tags[key]).map(async ([key, ref]) => {
        try { tags[key] = await readCategory(client, scope, ref); }
        catch { /* A category may have been archived or lost its binding. */ }
      }));
      if (current.current !== identity || request.current !== token) return;
      setState({ identity, page: { items: [...(more ? previous?.page?.items ?? [] : []), ...page.items], next: page.next }, tags, loading: false, error: null });
    } catch (error) {
      if (current.current !== identity || request.current !== token) return;
      setState({ identity, page: null, tags: {}, loading: false, error: errorMessage(error) });
    }
  }, [focused, identity, scope, type]);
  React.useEffect(() => {
    if (!scope) {
      setState({ identity, page: null, tags: {}, loading: false, error: null });
      return;
    }
    if (focused) void load();
    return () => { request.current++; };
  }, [focused, identity, load, scope, focused ? accounts.ledgerRevision : 0]);

  const items = state.identity === identity ? state.page?.items : null;
  const rows = React.useMemo(() => {
    const today = toFinancialCivilDate(new Date()), cycle = getCycleKeyFromDate(today);
    return (items ?? []).map(template => {
      const tagId = `${template.categorySource}:${template.categoryId}`;
      const startDate = template.installmentStartDate ? civilDate(template.installmentStartDate) : null;
      const due = resolveMonthlyOccurrence({ referenceDate: today, dueDay: template.dueDay, usesBusinessDays: template.usesBusinessDays });
      const complete = template.lastCycle === cycle && template.lastMovementDate !== null;
      const remaining = template.installmentTotal === null ? null : template.installmentTotal - template.installmentsCompleted;
      const isInstallmentComplete = remaining === 0;
      const date = template.lastMovementDate ? civilDate(template.lastMovementDate) : null;
      const lastId = date ? `${template.id}-${template.lastCycle}` : null;
      return { ...template, tagId, resolvedDueDate: due.date, holidayName: due.holiday?.name ?? null,
        installmentStartDate: startDate, installmentEndDate: getMandatoryInstallmentEndDateFromTotal(startDate, template.installmentTotal),
        installmentLabel: remaining === null ? null : `${template.installmentsCompleted} de ${template.installmentTotal} parcelas`,
        remainingInstallments: remaining ?? undefined, isInstallmentComplete, remainingValueInCents: remaining ? mandatoryAmount(template, remaining) : 0,
        displayValueInCents: complete ? template.lastAmountCents ?? template.valueInCents : isInstallmentComplete ? template.valueInCents : mandatoryAmount(template, 1),
        isPaidForCurrentCycle: complete, lastPaymentCycle: date ? template.lastCycle : null, lastPaymentDate: date, lastPaymentExpenseId: lastId,
        lastPaymentValueInCents: template.lastAmountCents,
        isReceivedForCurrentCycle: complete, lastReceiptCycle: date ? template.lastCycle : null, lastReceiptDate: date, lastReceiptGainId: lastId,
        lastReceiptValueInCents: template.lastAmountCents };
    });
  }, [items]);
  async function change(id: string, action: 'delete' | 'reclaim') {
    const item = items?.find(value => value.id === id);
    if (!scope || !item) throw Error('mandatory/not-found');
    if (!accounts.canWrite) throw Error('read-only/operation');
    const client = getFirebaseClient();
    if (action === 'delete') await archiveMandatoryTemplate(client, scope, item);
    else {
      if (!item.lastCycle || !item.lastMovementDate) throw Error('mandatory/cycle-unavailable');
      await cancelMandatoryCycle(client, scope, item.id, item.lastCycle, item.revision);
      await accounts.reload();
    }
    await load();
  }
  function amount(id: string, installments: number) {
    const item = items?.find(value => value.id === id);
    return item ? mandatoryAmount(item, installments) : null;
  }
  const visible = state.identity === identity ? state : null;
  return { rows, tags: visible?.tags ?? {}, isLoading: !!scope && (!visible || visible.loading && !visible.page),
    isRefreshing: !!visible?.page && visible.loading, hasLoadedData: !!visible?.page, loadError: visible?.error ?? null,
    hasMore: !!visible?.page?.next, load, change, amount };
}
