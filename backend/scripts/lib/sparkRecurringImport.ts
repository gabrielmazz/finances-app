import type { LedgerTransaction } from '../../../utils/financialLedger';
import { getCycleKeyFromDate } from '../../../utils/mandatoryExpenses';
import { toFinancialCivilDate } from '../../../utils/financialCivilDate';
import { getMandatoryInstallmentValueInCents } from '../../../utils/mandatoryInstallments';
import { validateSparkRecurringMetadata } from '../../../utils/sparkRecurringMetadata';
import { decodeSparkFinancialValue } from './sparkBootstrapPreflight';
import { digest, type LocalSnapshot } from './sparkLocalSnapshot';

export const sparkImportedRecurringPlanId = (groupId: string, path: string) => 'plan_' + digest({ groupId, path });
export const sparkImportedRecurringReceiptId = (groupId: string, transactionId: string) => 'recurring_' + digest({ groupId, transactionId });
const civilCycle = (date: Date) => getCycleKeyFromDate(toFinancialCivilDate(date));
const nextCycle = (value: string, count = 1) => {
  const [year, month] = value.split('-').map(Number), date = new Date(Date.UTC(year, month - 1 + count, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
};
const money = (value: unknown) => Number.isSafeInteger(value) && (value as number) > 0 && (value as number) <= 1e12;
function requireKnown(valid: unknown, code: string): asserts valid { if (!valid) throw new Error(code); }

/** [[Conversão de Recorrências Spark]]: candidato parcial explícito, nunca adivinha ciclos pagos. */
export function prepareSparkRecurringImport(input: {
  snapshot: LocalSnapshot; groupId: string; asOf: Date; importId: string; members: string[];
  transactions: LedgerTransaction[]; mappings: Array<{ sourceAccountId: string; accountId: string }>;
}) {
  const { snapshot, groupId, asOf, importId, transactions } = input;
  const documents: Array<{ path: string; value: Record<string, any> }> = [];
  const converted: Array<{ sourcePath: string; planId: string; cycles: number; historyFromCycle: string }> = [];
  const issues: Array<{ sourcePath: string; code: string }> = [];
  const warnings: Array<{ sourcePath: string; code: string }> = [];
  const prefix = `financialGroups/${groupId}`;
  const reversed = new Set(transactions.filter(event => event.kind === 'reversal').map(event => event.reversesTransactionId));
  const fields = ['personId', 'groupId', 'name', 'valueInCents', 'tagId', 'createdAt', 'isActive', 'archivedAt', 'dueDay', 'usesBusinessDays', 'description',
    'installments', 'installmentTotal', 'installmentTotalValueInCents', 'installmentsCompleted', 'installmentStartDate', 'installmentEndDate',
    'assistantCycleHistoryComplete', 'completedCycles', 'lastPaymentExpenseId', 'lastPaymentCycle', 'lastPaymentDate', 'lastPaymentInstallmentsCount',
    'lastReceiptGainId', 'lastReceiptCycle', 'lastReceiptDate', 'lastReceiptInstallmentsCount',
    'reminderConfigVersion', 'reminderEnabled', 'reminderDaysBefore', 'reminderOnDueDate', 'reminderHour', 'reminderMinute'];
  for (const source of snapshot.documents.filter(row => /^(mandatoryExpenses|mandatoryGains)\/[^/]+$/.test(row.path)
    && (row.fields.groupId?.stringValue === groupId || input.members.includes(row.fields.personId?.stringValue as string)))) {
    const staged: typeof documents = [], localWarnings: string[] = [];
    try {
      const data = Object.fromEntries(fields.filter(key => key in source.fields).map(key => [key, decodeSparkFinancialValue(source.fields[key])]));
      requireKnown(typeof data.personId === 'string' && input.members.includes(data.personId) && (data.groupId == null || data.groupId === groupId), 'recurring-owner-scope-conflict');
      requireKnown(typeof data.name === 'string' && data.name.trim() === data.name && data.name.length > 0 && data.name.length <= 160 && money(data.valueInCents), 'recurring-invalid-definition');
      requireKnown(data.installments == null, 'recurring-unsupported-installment-alias');
      requireKnown(data.isActive == null || typeof data.isActive === 'boolean', 'recurring-invalid-status');
      for (const key of ['createdAt', 'archivedAt', 'installmentStartDate', 'installmentEndDate']) if (data[key] != null) requireKnown(data[key] instanceof Date && Number.isFinite(data[key].valueOf()) && data[key].valueOf() >= 0 && (key.startsWith('installment') || data[key] <= asOf), 'recurring-invalid-date');
      for (const key of ['assistantCycleHistoryComplete', 'reminderEnabled', 'reminderOnDueDate']) if (data[key] != null) requireKnown(typeof data[key] === 'boolean', 'recurring-invalid-boolean');
      requireKnown(data.reminderConfigVersion == null || data.reminderConfigVersion === 0 || data.reminderConfigVersion === 1, 'recurring-unsupported-reminder-version');
      requireKnown(data.tagId == null || typeof data.tagId === 'string' && data.tagId.length > 0 && data.tagId.length <= 160 && !data.tagId.includes('/'), 'recurring-invalid-category');
      const expense = source.path.startsWith('mandatoryExpenses/'), recurringType = expense ? 'expense' : 'gain';
      const linkKey = expense ? 'lastPaymentExpenseId' : 'lastReceiptGainId', cycleKey = expense ? 'lastPaymentCycle' : 'lastReceiptCycle';
      const countKey = expense ? 'lastPaymentInstallmentsCount' : 'lastReceiptInstallmentsCount';
      const sourceId = source.path.split('/')[1], collection = source.path.split('/')[0];
      const referenced = transactions.filter(event => event.kind !== 'reversal' && event.sourceReferences?.some(ref => ref.collection === collection && ref.id === sourceId));
      const active = referenced.filter(event => !reversed.has(event.id));
      for (const event of referenced) requireKnown(event.sourceReferences!.length === 1 && event.kind === (expense ? 'expense' : 'income')
        && event.actorId === data.personId, 'recurring-incompatible-financial-source');
      const history = data.completedCycles ?? {};
      requireKnown(history && typeof history === 'object' && !Array.isArray(history), 'recurring-invalid-cycle-map');
      const known = new Map<string, any>();
      for (const [cycle, entry] of Object.entries(history) as Array<[string, any]>) {
        requireKnown(/^(19[7-9]\d|20\d\d|2100)-(0[1-9]|1[0-2])$/.test(cycle) && entry && typeof entry === 'object'
          && Object.keys(entry).every(key => ['transactionId', 'installmentsCount', 'amountInCents'].includes(key))
          && typeof entry.transactionId === 'string' && Number.isInteger(entry.installmentsCount) && entry.installmentsCount > 0 && entry.installmentsCount <= 360 && money(entry.amountInCents), 'recurring-invalid-cycle-entry');
        requireKnown(active.some(event => event.id === entry.transactionId && civilCycle(event.effectiveAt) === cycle), 'recurring-orphan-cycle');
        known.set(cycle, entry);
      }
      if (data[linkKey] != null || data[cycleKey] != null) {
        requireKnown(typeof data[linkKey] === 'string' && active.some(event => event.id === data[linkKey] && civilCycle(event.effectiveAt) === data[cycleKey]), 'recurring-orphan-last-payment');
        const entry = known.get(data[cycleKey]);
        requireKnown(!entry || entry.transactionId === data[linkKey], 'recurring-conflicting-last-payment');
      }
      const total = data.installmentTotal ?? null;
      requireKnown(total === null || Number.isInteger(total) && total >= 1 && total <= 360, 'recurring-invalid-installment-total');
      const contract = total === null ? null : data.installmentTotalValueInCents;
      requireKnown(total === null ? data.installmentTotalValueInCents == null : money(contract) && Math.floor(contract / total) === data.valueInCents && data.installmentStartDate instanceof Date, 'recurring-unproven-installment-contract');
      const start = data.installmentStartDate ? civilCycle(data.installmentStartDate) : data.createdAt ? civilCycle(data.createdAt)
        : active.length ? active.map(event => civilCycle(event.effectiveAt)).sort()[0] : civilCycle(asOf);
      const end = total === null ? null : nextCycle(start, total - 1);
      requireKnown(!data.installmentEndDate || civilCycle(data.installmentEndDate) === end, 'recurring-conflicting-end-cycle');
      requireKnown(nextCycle(end ?? start, 0) <= '2100-12', 'recurring-calendar-overflow');
      const complete = data.assistantCycleHistoryComplete === true;
      requireKnown(!complete || data.installmentStartDate instanceof Date || data.createdAt instanceof Date, 'recurring-missing-history-start');
      if (!data.installmentStartDate && !data.createdAt) localWarnings.push('recurring-start-cycle-limited-to-evidence');
      if (complete) requireKnown(active.every(event => known.get(civilCycle(event.effectiveAt))?.transactionId === event.id), 'recurring-incomplete-declared-history');
      const coverage = complete ? start : nextCycle(civilCycle(asOf));
      requireKnown(/^(19[7-9]\d|20\d\d|2100)-(0[1-9]|1[0-2])$/.test(coverage), 'recurring-coverage-outside-calendar');
      if (!complete) localWarnings.push('recurring-history-restricted-after-cutoff');
      const commitKey = (event: LedgerTransaction) => {
        const value = snapshot.documents.find(row => row.path === `ledgerTransactions/${event.id}`)?.fields.createdAt?.timestampValue;
        return typeof value === 'string' ? value.replace(/(?:\.(\d+))?Z$/, (_, part: string) => '.' + (part ?? '').padEnd(9, '0') + 'Z') : null;
      };
      if (total !== null && active.length > 1) {
        const times = active.map(commitKey); requireKnown(times.every(Boolean) && new Set(times).size === active.length, 'recurring-ambiguous-installment-order');
      }
      const ordered = [...active].sort((a, b) => total !== null ? (commitKey(a) ?? '').localeCompare(commitKey(b) ?? '') : a.id.localeCompare(b.id));
      const planId = sparkImportedRecurringPlanId(groupId, source.path), bootstrapId = 'bootstrap_' + digest({ importId, planId });
      let completed = 0; const seenCycles = new Set<string>();
      for (const event of ordered) {
        const cycle = civilCycle(event.effectiveAt), entry = known.get(cycle);
        requireKnown(!seenCycles.has(cycle) && cycle >= start && (end === null || cycle <= end), 'recurring-duplicate-or-outside-cycle'); seenCycles.add(cycle);
        const quantity = entry?.installmentsCount ?? (data[linkKey] === event.id ? data[countKey] ?? 1 : 1);
        requireKnown(Number.isInteger(quantity) && quantity > 0 && quantity <= (total === null ? 1 : total - completed), 'recurring-invalid-installment-count');
        const leg = event.legs.find(leg => leg.accountId !== null)!, amount = Math.abs(leg.deltaInCents);
        requireKnown(money(amount), 'recurring-invalid-amount');
        const accountId = input.mappings.find(mapping => mapping.sourceAccountId === leg.accountId)?.accountId;
        const account = snapshot.documents.find(row => row.path === `financialAccounts/${leg.accountId}`);
        requireKnown(accountId && account?.fields.kind.stringValue !== 'investment' && leg.deltaInCents === (expense ? -amount : amount), 'recurring-incompatible-account');
        requireKnown(!entry || entry.transactionId === event.id && entry.amountInCents === amount, 'recurring-cycle-amount-conflict');
        const after = total === null ? 0 : completed + quantity;
        if (total !== null) requireKnown(amount === getMandatoryInstallmentValueInCents({ installmentTotal: total, installmentsCompleted: completed, installmentsToSettle: quantity,
          installmentValueInCents: data.valueInCents, installmentTotalValueInCents: contract }), 'recurring-contractual-amount-conflict');
        const receiptId = sparkImportedRecurringReceiptId(groupId, event.id);
        staged.push({ path: `${prefix}/sparkOperations/${receiptId}`, value: { schemaVersion: 1, actorId: data.personId, kind: 'imported_recurring_settlement',
          planId, cycle, accountId, amountInCents: amount, installmentsCount: quantity, recurringType, differenceInCents: leg.deltaInCents,
          effectiveAt: event.effectiveAt, installmentsBefore: completed, installmentsAfter: after, sourceTransactionId: event.id,
          sourceDocumentSha256: digest(snapshot.documents.find(row => row.path === `ledgerTransactions/${event.id}`)!.fields), createdAt: asOf, importId } });
        staged.push({ path: `${prefix}/sparkRecurringPlans/${planId}/cycles/${cycle}`, value: { schemaVersion: 1, active: true, revision: 0,
          settlementOperationId: receiptId, lastOperationId: receiptId, accountId, amountInCents: amount, installmentsCount: quantity,
          installmentsBefore: completed, installmentsAfter: after, effectiveAt: event.effectiveAt, updatedAt: asOf } }); completed = after;
      }
      requireKnown(total === null ? data.installmentsCompleted == null || data.installmentsCompleted === 0
        : data.installmentsCompleted === completed, 'recurring-unproven-installment-counter');
      const metadata = validateSparkRecurringMetadata({ dueDay: data.dueDay ?? null, usesBusinessDays: data.usesBusinessDays ?? false, description: data.description ?? null,
        reminderConfigVersion: 1, reminderEnabled: data.reminderConfigVersion === 1 && data.reminderEnabled === true,
        reminderDaysBefore: data.reminderDaysBefore ?? 0, reminderOnDueDate: data.reminderOnDueDate ?? false,
        reminderHour: data.reminderHour ?? 9, reminderMinute: data.reminderMinute ?? 0 });
      if (data.reminderEnabled && data.reminderConfigVersion !== 1) localWarnings.push('recurring-unversioned-reminder-kept-disabled');
      if (data.tagId) {
        const tag = snapshot.documents.find(row => row.path === `tags/${data.tagId}`)?.fields;
        const owner = snapshot.documents.find(row => row.path === `users/${tag?.personId?.stringValue}`)?.fields;
        if (!tag || !(tag.groupId?.stringValue === groupId || tag.personId?.stringValue === data.personId || owner?.financialGroupId?.stringValue === groupId)
          || tag.usageType && !['both', expense ? 'expense' : 'gain'].includes(tag.usageType.stringValue as string)) localWarnings.push('recurring-category-requires-review');
      }
      staged.push({ path: `${prefix}/sparkRecurringPlans/${planId}`, value: { schemaVersion: 1, actorId: data.personId, recurringType,
        name: data.name, valueInCents: data.valueInCents, categoryId: data.tagId ?? null, startCycle: start, endCycle: end,
        historyFromCycle: coverage, installmentTotal: total, contractTotalInCents: contract, installmentsCompleted: completed,
        active: data.isActive !== false && data.archivedAt == null, revision: 0, lastOperationId: bootstrapId, createdAt: data.createdAt ?? asOf, updatedAt: asOf } });
      staged.push({ path: `${prefix}/sparkRecurringMetadata/${planId}`, value: { schemaVersion: 1, actorId: data.personId, ...metadata,
        revision: 0, lastOperationId: bootstrapId, updatedAt: asOf } });
      staged.push({ path: `${prefix}/sparkOperations/${bootstrapId}`, value: { schemaVersion: 1, actorId: data.personId, kind: 'imported_recurring_plan', planId, sourcePath: source.path, importId, createdAt: asOf } });
      staged.push({ path: `${prefix}/sparkImportRecurringMappings/${planId}`, value: { sourcePath: source.path, sourceDocumentSha256: digest(source.fields), planId,
        historyFromCycle: coverage, sourceDeclaredComplete: complete, importId, originalCreatedAtKnown: data.createdAt != null } });
      documents.push(...staged); converted.push({ sourcePath: source.path, planId, cycles: seenCycles.size, historyFromCycle: coverage });
      warnings.push(...localWarnings.map(code => ({ sourcePath: source.path, code })));
    } catch (error) { issues.push({ sourcePath: source.path, code: error instanceof Error && error.message.startsWith('recurring-') ? error.message : 'recurring-unsupported-field-type' }); }
  }
  return { documents, report: { converted, issues, warnings, allScopedTemplatesConverted: issues.length === 0, activationAllowed: false } };
}
