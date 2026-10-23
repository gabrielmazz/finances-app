import { financialFields } from '../../scripts/lib/sparkLedgerImport';
import { sealSnapshot, type LocalSnapshot } from '../../scripts/lib/sparkLocalSnapshot';

export const importAsOf = new Date('2026-10-01T12:00:00Z');
export function ledgerImportFixture(): LocalSnapshot {
  const documents: LocalSnapshot['documents'] = [];
  const put = (path: string, value: Record<string, unknown>) => documents.push({ path, fields: financialFields(value) });
  put('financialGroups/group', { status: 'active', members: { owner: 'admin', guest: 'member' }, createdBy: 'owner', createdAt: new Date('2026-09-01Z') });
  documents[0].fields.score = { doubleValue: 0.5 }; // Metadado alheio à matemática financeira deve ser preservado.
  for (const uid of ['owner', 'guest']) {
    put(`users/${uid}`, { financialGroupId: 'group', financialGroupRole: uid === 'owner' ? 'admin' : 'member' });
    put(`financialCutovers/${uid}`, { groupId: 'group' });
  }
  for (const [id, kind, balance] of [['bank-a', 'bank', 800], ['bank-b', 'bank', 800], ['cash-group', 'cash', 0], ['investment', 'investment', 100]] as const) {
    put(`financialAccounts/${id}`, { groupId: 'group', name: id, kind, currentBalanceInCents: balance, isActive: true, archivedAt: null, description: 'preserve metadata' });
  }
  for (const [id, accountId, value, source] of [['a', 'bank-a', 1000, 'legacyMonthStart'], ['b', 'bank-b', 500, 'manual']] as const) {
    put(`accountReconciliations/${id}`, { groupId: 'group', accountId, effectiveAt: new Date('2026-09-01T03:00:00Z'), countedBalanceInCents: value, differenceInCents: value, source });
  }
  const event = (id: string, kind: string, at: string, legs: Array<{ accountId: string | null; deltaInCents: number }>, actorId = 'owner') =>
    put(`ledgerTransactions/${id}`, { groupId: 'group', kind, actorId, clientActionId: `action_${id}`, effectiveAt: new Date(at), legs, note: 'original note' });
  event('income', 'income', '2026-09-02T12:00:00Z', [{ accountId: 'bank-a', deltaInCents: 200 }, { accountId: null, deltaInCents: -200 }], 'guest');
  event('transfer', 'transfer', '2026-09-03T12:00:00Z', [{ accountId: 'bank-a', deltaInCents: -300 }, { accountId: 'bank-b', deltaInCents: 300 }]);
  event('deposit', 'investment_deposit', '2026-09-04T12:00:00Z', [{ accountId: 'bank-a', deltaInCents: -100 }, { accountId: 'investment', deltaInCents: 100 }]);
  put('mandatoryExpenses/definition', { personId: 'owner', valueInCents: 500, name: 'original recurring metadata', installments: 3 });
  return sealSnapshot({ format: 'lumus-firestore-emulator-snapshot', schemaVersion: 1, databaseId: '(default)', projectId: 'demo-lumus-snapshot',
    capturedAt: '2026-10-18T12:00:00Z', consistency: 'two-matching-scans-not-point-in-time', documents,
    artifacts: { rules: 'rules_version = "2";', indexes: '{"indexes":[]}' } });
}
export function resealImportFixture(snapshot: LocalSnapshot) { const { sha256: _, ...body } = snapshot; return sealSnapshot(body); }
export function recurringLedgerImportFixture() {
  const snapshot = ledgerImportFixture();
  snapshot.documents = snapshot.documents.filter(row => row.path !== 'mandatoryExpenses/definition');
  const completedCycles: Record<string, any> = {};
  for (const [index, month] of ['07', '08', '09'].entries()) {
    const amount = index === 2 ? 334 : 333, id = `recurring-${month}`;
    const fields = financialFields({ groupId: 'group', actorId: 'owner', kind: 'income', clientActionId: `old_payment_${month}`,
      effectiveAt: new Date(`2026-${month}-15T12:00:00Z`), sourceReferences: [{ collection: 'mandatoryGains', id: 'contract' }],
      legs: [{ accountId: 'bank-a', deltaInCents: amount }, { accountId: null, deltaInCents: -amount }] });
    fields.createdAt = { timestampValue: `2026-09-20T12:00:00.00000${index + 1}Z` };
    snapshot.documents.push({ path: `ledgerTransactions/${id}`, fields });
    completedCycles[`2026-${month}`] = { transactionId: id, installmentsCount: 1, amountInCents: amount };
  }
  snapshot.documents.push({ path: 'mandatoryGains/contract', fields: financialFields({ personId: 'owner', groupId: 'group', name: 'Contrato',
    valueInCents: 333, installmentTotal: 3, installmentTotalValueInCents: 1000, installmentsCompleted: 3,
    installmentStartDate: new Date('2026-07-01T03:00:00Z'), installmentEndDate: new Date('2026-09-01T03:00:00Z'),
    createdAt: new Date('2026-07-01T03:00:00Z'), assistantCycleHistoryComplete: true, completedCycles,
    lastReceiptGainId: 'recurring-09', lastReceiptCycle: '2026-09', lastReceiptInstallmentsCount: 1,
    dueDay: 5, usesBusinessDays: true, description: 'Metadados preservados', reminderConfigVersion: 1,
    reminderEnabled: true, reminderDaysBefore: 2, reminderOnDueDate: true, reminderHour: 9, reminderMinute: 15 }) });
  snapshot.documents.find(row => row.path === 'financialAccounts/bank-a')!.fields.currentBalanceInCents = { integerValue: '1134' };
  return resealImportFixture(snapshot);
}
export function legacyImportFixture() {
  const documents: LocalSnapshot['documents'] = [];
  const put = (path: string, value: Record<string, unknown>) => documents.push({ path, fields: financialFields(value) });
  put('users/owner', { financialGroupId: null, financialGroupRole: null }); put('users/guest', {});
  put('banks/bank', { personId: 'owner', name: 'Bank' });
  put('monthlyBalances/opening', { personId: 'owner', bankId: 'bank', year: 2026, month: 9, valueInCents: 1000 });
  put('gains/income', { personId: 'guest', bankId: 'bank', valueInCents: 200, date: new Date('2026-09-02T12:00:00Z') });
  const { sha256: _, ...body } = ledgerImportFixture();
  const snapshot = sealSnapshot({ ...body, documents });
  return { snapshot, scope: { schemaVersion: 1, groupId: 'proposed-group', memberIds: ['owner', 'guest'],
    asOf: '2026-09-30T12:00:00Z', confirmedCashBalanceInCents: 0, confirmedAt: '2026-09-30T23:00:00Z', observedInvestmentBalancesInCents: {} } };
}
