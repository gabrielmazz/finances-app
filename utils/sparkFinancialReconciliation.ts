import { validateLedgerTransaction, type AccountReconciliation, type LedgerTransaction } from './financialLedger';
import { createLegacyMigrationPlan, type FinancialAccountSeed, type LegacyMigrationInput } from './financialLedgerMigration';
import { calculateLegacyBankBalanceInCents } from './monthlyBalance';
import { endOfFinancialCivilDay, fromFinancialCivilDate } from './financialCivilDate';

export type SparkReconciliationIssue = { code: string; id: string; detail: string };
export type SparkImportedEntry = {
  id: string; effectiveAt: Date; kind: 'checkpoint' | 'movement'; amountInCents: number;
  includesBoundary: boolean; source: { collection: string; id: string }; actorId?: string;
  sourceReferences?: LedgerTransaction['sourceReferences'];
};
export type SparkReconciledAccount = {
  accountId: string; sourceAccountId: string; kind: FinancialAccountSeed['kind']; entries: SparkImportedEntry[];
  calculatedBalanceInCents: number; sourceBalanceInCents: number; differenceInCents: number;
  historicalBalances: Array<{ asOf: Date; balanceInCents: number }>;
};
const validMoney = (value: number) => Number.isSafeInteger(value) && Math.abs(value) <= 1_000_000_000_000;
const validDate = (value: Date) => value instanceof Date && Number.isFinite(value.valueOf()) && value.valueOf() >= 0;

/** Mesmo corte temporal do protocolo: mensal inclui a fronteira, contagem exata a exclui. */
export function projectSparkImportedHistory(entries: SparkImportedEntry[], asOf: Date): number {
  if (!validDate(asOf)) throw new Error('Data de reconciliação inválida.');
  const opening = entries.filter(entry => entry.kind === 'checkpoint' && entry.effectiveAt <= asOf)
    .sort((a, b) => b.effectiveAt.valueOf() - a.effectiveAt.valueOf())[0];
  const total = entries.reduce((sum, entry) => entry.kind === 'movement' && entry.effectiveAt <= asOf
    && (!opening || entry.effectiveAt > opening.effectiveAt || (opening.includesBoundary && entry.effectiveAt.valueOf() === opening.effectiveAt.valueOf()))
    ? sum + entry.amountInCents : sum, opening?.amountInCents ?? 0);
  if (!Number.isSafeInteger(total)) throw new Error('Projeção excede o limite inteiro seguro.');
  return total;
}

/** Análise local de um snapshot fornecido; não consulta/escreve Firestore nem certifica sua completude remota. */
export function reconcileSparkLedgerSnapshot(input: {
  groupId: string; asOf: Date; accounts: FinancialAccountSeed[]; transactions: LedgerTransaction[];
  reconciliations: AccountReconciliation[]; verificationDates?: Date[]; preflightIssues?: SparkReconciliationIssue[];
}) {
  if (typeof input.groupId !== 'string' || !input.groupId || input.groupId.length > 160 || input.groupId.includes('/')) throw new Error('Grupo inválido.');
  if (!validDate(input.asOf) || input.verificationDates?.some(date => !validDate(date))) throw new Error('Data de reconciliação inválida.');
  const issues: SparkReconciliationIssue[] = [...input.preflightIssues ?? []];
  const issue = (code: string, id: string, detail: string) => issues.push({ code, id, detail });
  const accountIds = new Set<string>(); const targetIds = new Set<string>(); const entryIds = new Set<string>();
  const histories = new Map<string, SparkImportedEntry[]>();
  for (const account of input.accounts) {
    const targetId = account.kind === 'cash' ? 'cash' : account.id;
    if (accountIds.has(account.id) || targetIds.has(targetId)) issue('duplicate-account', account.id, 'Identidade de conta duplicada.');
    if (account.groupId !== input.groupId || !['bank', 'cash', 'investment'].includes(account.kind)
      || !targetId || targetId.length > 160 || targetId.includes('/') || (targetId === 'cash' && account.kind !== 'cash')
      || !validMoney(account.currentBalanceInCents)) issue('invalid-account', account.id, 'Grupo, identidade, tipo ou saldo da conta inválido.');
    accountIds.add(account.id); targetIds.add(targetId); histories.set(account.id, []);
  }
  for (const event of input.transactions) {
    try { validateLedgerTransaction(event); } catch (error) { issue('invalid-event', event.id, String(error)); continue; }
    if (entryIds.has(event.id)) issue('duplicate-event', event.id, 'Evento repetido no snapshot.');
    entryIds.add(event.id);
    if (event.groupId !== input.groupId || !validDate(event.effectiveAt) || event.legs.some(leg => !validMoney(leg.deltaInCents))
      || !['income', 'expense', 'transfer', 'investment_deposit', 'investment_redemption', 'reconciliation_adjustment', 'migration', 'reversal'].includes(event.kind)) {
      issue('invalid-event', event.id, 'Grupo, data ou centavos do evento inválidos.'); continue;
    }
    if (event.effectiveAt > input.asOf) issue('future-event', event.id, 'Evento futuro exige modelo de ativação antes do bootstrap Spark.');
    for (const leg of event.legs) {
      if (leg.accountId === null) continue;
      if (!histories.has(leg.accountId)) { issue('missing-account', event.id, 'Contrapartida aponta a conta ausente.'); continue; }
      histories.get(leg.accountId)!.push({ id: `event:${event.id}`, kind: 'movement', effectiveAt: event.effectiveAt,
        amountInCents: leg.deltaInCents, includesBoundary: false, source: { collection: 'ledgerTransactions', id: event.id },
        sourceReferences: event.sourceReferences, actorId: event.actorId });
    }
  }
  const openingIds = new Set<string>(); const openingDates = new Set<string>();
  for (const opening of input.reconciliations) {
    const key = `${opening.accountId}/${opening.effectiveAt?.valueOf()}`;
    if (openingIds.has(opening.id) || openingDates.has(key)) issue('duplicate-opening', opening.id, 'Duas aberturas têm a mesma identidade ou instante; resolver explicitamente.');
    openingIds.add(opening.id); openingDates.add(key);
    if (opening.groupId !== input.groupId || !histories.has(opening.accountId) || !validDate(opening.effectiveAt)
      || !validMoney(opening.countedBalanceInCents) || !['manual', 'legacyMonthStart'].includes(opening.source)) {
      issue('invalid-opening', opening.id, 'Abertura aponta a conta, grupo, data, fonte ou centavos inválidos.'); continue;
    }
    if (opening.effectiveAt > input.asOf) issue('future-opening', opening.id, 'Abertura futura exige ativação temporal antes do bootstrap Spark.');
    histories.get(opening.accountId)!.push({ id: `opening:${opening.id}`, kind: 'checkpoint', effectiveAt: opening.effectiveAt,
      amountInCents: opening.countedBalanceInCents, includesBoundary: opening.source === 'legacyMonthStart',
      source: { collection: 'accountReconciliations', id: opening.id } });
  }
  const accounts: SparkReconciledAccount[] = input.accounts.map(account => {
    const entries = histories.get(account.id)!.sort((a, b) => a.effectiveAt.valueOf() - b.effectiveAt.valueOf() || a.id.localeCompare(b.id));
    const calculated = projectSparkImportedHistory(entries, input.asOf);
    const difference = calculated - account.currentBalanceInCents;
    if (!validMoney(calculated) || (account.kind !== 'bank' && calculated < 0)) issue('invalid-position', account.id, 'Saldo projetado inválido para a conta.');
    if (difference !== 0) issue('balance-mismatch', account.id, 'Saldo armazenado difere do histórico fornecido.');
    return { accountId: account.kind === 'cash' ? 'cash' : account.id, sourceAccountId: account.id, kind: account.kind, entries,
      calculatedBalanceInCents: calculated, sourceBalanceInCents: account.currentBalanceInCents, differenceInCents: difference,
      historicalBalances: (input.verificationDates ?? []).map(asOf => ({ asOf, balanceInCents: projectSparkImportedHistory(entries, asOf) })) };
  });
  return { schemaVersion: 1 as const, groupId: input.groupId, asOf: input.asOf, sourceCompleteness: 'provided-snapshot-only' as const,
    eligibleForReviewedBootstrap: issues.length === 0, issues, accounts };
}

export function reconcileSparkLegacySnapshot(input: LegacyMigrationInput & {
  asOf: Date; verificationDates?: Date[]; observedInvestmentBalancesInCents?: Record<string, number>;
}) {
  if (!validDate(input.asOf)) throw new Error('Data de reconciliação inválida.');
  const source = createLegacyMigrationPlan({ ...input, confirmedAt: input.confirmedAt ?? input.asOf });
  const preflightIssues: SparkReconciliationIssue[] = source.issues.map(item => ({ code: item.code, id: item.id, detail: item.detail }));
  for (const item of [...input.expenses, ...input.gains, ...input.bankTransfers, ...input.cashRescues, ...input.investments, ...input.balanceAdjustments ?? []]) {
    if (!validDate(item.effectiveAt)) preflightIssues.push({ code: 'invalid-source-date', id: item.id, detail: 'Data original inválida; não substituir por epoch.' });
  }
  for (const item of [...input.expenses, ...input.gains]) {
    const fields = item as unknown as Record<string, unknown>;
    if (fields.isFinanceInvestment === true || fields.isFinanceInvestmentSync === true
      || (item.isInvestmentDeposit === true && item.isInvestmentRedemption === true)) preflightIssues.push({
      code: 'unsupported-legacy-classification', id: item.id, detail: 'Classificação financeira exige normalização explícita antes da importação.',
    });
  }
  const usedExpenses = new Set<string>(), usedGains = new Set<string>();
  for (const transfer of input.bankTransfers) {
    const expense = input.expenses.find(item => item.id === transfer.expenseId), gain = input.gains.find(item => item.id === transfer.gainId);
    if (!expense || !gain || usedExpenses.has(transfer.expenseId) || usedGains.has(transfer.gainId)
      || expense.bankId !== transfer.fromBankId || gain.bankId !== transfer.toBankId || transfer.fromBankId === transfer.toBankId
      || expense.amountInCents !== transfer.amountInCents || gain.amountInCents !== transfer.amountInCents
      || expense.effectiveAt.valueOf() !== transfer.effectiveAt.valueOf() || gain.effectiveAt.valueOf() !== transfer.effectiveAt.valueOf()
      || (expense.transferId && expense.transferId !== transfer.id) || (gain.transferId && gain.transferId !== transfer.id)) {
      preflightIssues.push({ code: 'inconsistent-transfer-pair', id: transfer.id, detail: 'Contas, valores, datas ou exclusividade das contrapartidas divergem.' });
    }
    usedExpenses.add(transfer.expenseId); usedGains.add(transfer.gainId);
  }
  for (const [collection, rows] of Object.entries({ banks: input.banks, expenses: input.expenses, gains: input.gains,
    bankTransfers: input.bankTransfers, cashRescues: input.cashRescues, investments: input.investments,
    monthlyBalances: input.monthlyBalances, balanceAdjustments: input.balanceAdjustments ?? [] })) {
    const seen = new Set<string>();
    for (const row of rows) {
      if (seen.has(row.id)) preflightIssues.push({ code: 'duplicate-source-id', id: row.id, detail: `Documento repetido em ${collection}.` });
      seen.add(row.id);
    }
  }
  const asOf = endOfFinancialCivilDay(input.asOf);
  // O importador antigo aproxima UTC-03. Esta análise usa o adaptador civil IANA existente, inclusive DST.
  const reconciliations = source.reconciliations.map(opening => {
    const monthly = input.monthlyBalances.find(snapshot => `migration-reconciliation-${snapshot.id}` === opening.id);
    if (!monthly) return opening;
    const year = monthly.year, month = monthly.month;
    if (!Number.isInteger(year) || year < 1970 || year > 9999 || !Number.isInteger(month) || month < 1 || month > 12) {
      preflightIssues.push({ code: 'invalid-cycle', id: monthly.id, detail: 'Ciclo mensal inválido.' }); return opening;
    }
    return { ...opening, effectiveAt: fromFinancialCivilDate(new Date(year, month - 1, 1)) };
  });
  const accounts = source.accounts.map(account => {
    if (account.kind === 'bank') {
      const balance = calculateLegacyBankBalanceInCents({ bankId: account.legacyBankId!, asOfDate: input.asOf,
        snapshots: input.monthlyBalances.map(row => ({ ...row, valueInCents: row.balanceInCents })),
        expenses: input.expenses.map(row => ({ ...row, date: row.effectiveAt, valueInCents: row.amountInCents })),
        gains: input.gains.map(row => ({ ...row, date: row.effectiveAt, valueInCents: row.amountInCents })),
        cashRescues: input.cashRescues.map(row => ({ ...row, date: row.effectiveAt, valueInCents: row.amountInCents })),
        investments: input.investments.map(row => ({ ...row, date: row.effectiveAt })),
        balanceAdjustments: input.balanceAdjustments?.map(row => ({ ...row, date: row.effectiveAt })),
      });
      if (balance === null) preflightIssues.push({ code: 'missing-opening', id: account.id, detail: 'Banco sem abertura elegível no snapshot.' });
      return { ...account, currentBalanceInCents: balance ?? 0 };
    }
    if (account.kind === 'investment') {
      const observed = input.observedInvestmentBalancesInCents?.[account.legacyInvestmentId!];
      if (observed === undefined || !validMoney(observed)) preflightIssues.push({ code: 'unverified-investment-position', id: account.id,
        detail: 'Forneça o valor atual observado independentemente do principal importado.' });
      return { ...account, currentBalanceInCents: observed ?? account.currentBalanceInCents };
    }
    return account;
  });
  if (input.confirmedCashBalanceInCents == null || !input.confirmedAt) preflightIssues.push({ code: 'unconfirmed-cash', id: input.groupId, detail: 'Conferência de caixa exige valor e instante explícitos.' });
  return reconcileSparkLedgerSnapshot({ groupId: input.groupId, asOf, accounts, transactions: source.transactions,
    reconciliations, verificationDates: input.verificationDates, preflightIssues });
}

/** Calendário protegido a preparar junto ao bootstrap; o app não pode editar esses documentos. */
export function createSparkCivilMonthCalendar(firstYear: number, lastYear: number) {
  if (!Number.isInteger(firstYear) || !Number.isInteger(lastYear) || firstYear < 1970 || lastYear > 2100 || lastYear < firstYear) throw new Error('Intervalo de calendário inválido.');
  return Array.from({ length: (lastYear - firstYear + 1) * 12 }, (_, index) => {
    const year = firstYear + Math.floor(index / 12), month = index % 12;
    return { cycle: `${year}-${String(month + 1).padStart(2, '0')}`, timeZone: 'America/Sao_Paulo' as const,
      startAt: fromFinancialCivilDate(new Date(year, month, 1)), endAt: fromFinancialCivilDate(new Date(year, month + 1, 1)),
      dayEnds: Array.from({ length: new Date(year, month + 1, 0).getDate() }, (_, day) =>
        fromFinancialCivilDate(new Date(year, month, day + 1, 23, 59, 59, 999))) };
  });
}
