import type { Firestore } from 'firebase/firestore';
import type { HomeBalancesData, HomeInvestmentsData, HomeMovementsData, HomeOverviewData, HomeTimelineMovement } from './HomeFirebase';
import { getSparkContextFirebase } from './SparkContextFirebase';
import { readSparkAccountsFirebase, type SparkAccountReadModel } from './SparkAccountReadFirebase';
import { readSparkFinancialEventsFirebase } from './SparkFinancialReadFirebase';
import { readSparkRecurringPlansFirebase } from './SparkRecurringReadFirebase';
import { getTagsWithUsersByPersonFirebase } from './TagFirebase';
import { projectSparkEconomicMovements } from '../utils/sparkEconomicMovements';
import { buildSparkUpcomingMandatoryItems } from '../utils/sparkRecurringReadModel';
import { buildHomeExpenseHistory } from '../utils/homeExpenseHistory';
import { buildHomeActivityHeatmap } from '../utils/homeActivityHeatmap';
import { addHomeCents } from '../utils/homeCents';
import { endOfFinancialCivilDay, fromFinancialCivilDate, toFinancialCivilDate } from '../utils/financialCivilDate';
import type { SparkFinancialReadEvent } from '../utils/sparkFinancialReadModel';
import { projectSparkInvestmentPortfolio } from './SparkInvestmentReadFirebase';
import { buildInvestmentPortfolioAnalytics, type InvestmentAssetType, type InvestmentValuationMethod } from '../utils/investmentPortfolio';
import { getInvestmentCdiRatesWithRelationsFirebase } from './InvestmentCdiRateFirebase';

const accountName = (account: SparkAccountReadModel) => account.catalog?.name ?? (account.position.kind === 'cash' ? 'Dinheiro' : 'Conta sem cadastro');
const sum = (values: number[]) => values.reduce(addHomeCents, 0);
const balances = (accounts: SparkAccountReadModel[]): HomeBalancesData => {
  const active = accounts.filter(account => account.position.active), cash = active.find(account => account.position.kind === 'cash');
  // A soma que a tela apresenta precisa ser tão exata quanto os saldos individuais.
  sum(active.filter(account => account.position.kind !== 'investment').map(account => account.position.balanceInCents));
  return { bankBalances: active.filter(account => account.position.kind === 'bank').map(account => ({ id: account.accountId,
    name: accountName(account), colorHex: account.catalog?.colorHex ?? null, balanceInCents: account.position.balanceInCents })),
    cashSummary: cash ? { id: 'cash-transactions', name: accountName(cash), balanceInCents: cash.position.balanceInCents } : null };
};

/** [[Dashboard Home]]: transporte Spark antes das consultas legadas; cada seção conserva seu próprio erro. */
export function createSparkHomeReader(firestore: Firestore, actorId: string, groupId: string, now = new Date()) {
  const asOfDate = endOfFinancialCivilDay(now), civil = toFinancialCivilDate(asOfDate);
  const startOfMonth = fromFinancialCivilDate(new Date(civil.getFullYear(), civil.getMonth(), 1));
  const verify = async <T>(data: T): Promise<T> => {
    if ((await getSparkContextFirebase(firestore, actorId))?.groupId !== groupId) throw new Error('O acesso financeiro mudou.');
    return data;
  };
  let currentUntil: number | null = null;
  const rememberDeadline = (rows: SparkAccountReadModel[]) => {
    const deadlines = rows.filter(account => account.position.active && account.position.nextActivationAt !== null)
      .map(account => account.position.nextActivationAt!.toMillis());
    currentUntil = deadlines.length ? deadlines.reduce((earliest, value) => Math.min(earliest, value)) : null;
    return rows;
  };
  let accountsPromise: Promise<SparkAccountReadModel[]> | undefined;
  const accounts = () => accountsPromise ??= readSparkAccountsFirebase(firestore, actorId, groupId).then(rememberDeadline);
  let financialPromise: Promise<{ accounts: SparkAccountReadModel[]; events: SparkFinancialReadEvent[] }> | undefined;
  const financial = () => financialPromise ??= (async () => {
    let before = await accounts();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const events = await readSparkFinancialEventsFirebase(firestore, actorId, groupId);
      const after = await readSparkAccountsFirebase(firestore, actorId, groupId);
      if (JSON.stringify(before) === JSON.stringify(after)) return { accounts: rememberDeadline(after), events };
      before = after;
    }
    throw new Error('O financeiro mudou durante a consulta. Atualize a Home.');
  })();
  let plansPromise: ReturnType<typeof readSparkRecurringPlansFirebase> | undefined;
  const plans = () => plansPromise ??= readSparkRecurringPlansFirebase(firestore, actorId, groupId, asOfDate);
  let dashboardPromise: Promise<{ snapshot: Awaited<ReturnType<typeof financial>>; recurring: Awaited<ReturnType<typeof plans>> }> | undefined;
  const dashboard = () => dashboardPromise ??= (async () => {
    const [snapshot, recurring] = await Promise.all([financial(), plans()]);
    const after = await readSparkAccountsFirebase(firestore, actorId, groupId);
    if (JSON.stringify(snapshot.accounts) !== JSON.stringify(after)) throw new Error('Os saldos mudaram durante a leitura dos compromissos. Atualize a Home.');
    return { snapshot, recurring };
  })();

  return {
    metadata: () => ({ financialSource: 'spark' as const, currentUntil }),
    balances: async (): Promise<HomeBalancesData> => verify(balances(await accounts())),
    overview: async (): Promise<HomeOverviewData> => {
      const { snapshot, recurring } = await dashboard();
      const positions = balances(snapshot.accounts), byId = new Map(snapshot.accounts.map(account => [account.accountId, account]));
      const expenses: Record<string, number> = {}, gains: Record<string, number> = {};
      let cashExpenses = 0, cashGains = 0;
      const economic = projectSparkEconomicMovements(snapshot.events).filter(event => event.date <= asOfDate);
      for (const movement of economic.filter(event => event.date >= startOfMonth)) {
        const account = byId.get(movement.bankId ?? 'cash');
        if (!account || account.position.kind === 'investment') throw new Error('Movimento econômico sem banco ou Caixa canônico.');
        if (account.position.kind === 'cash') {
          if (movement.type === 'expense') cashExpenses = addHomeCents(cashExpenses, movement.valueInCents);
          else cashGains = addHomeCents(cashGains, movement.valueInCents);
        } else {
          const totals = movement.type === 'expense' ? expenses : gains;
          totals[account.accountId] = addHomeCents(totals[account.accountId] ?? 0, movement.valueInCents);
        }
      }
      // Caixa tem campo próprio na Home; incluí-lo também no mapa duplicaria os totais Web.
      sum([...Object.values(expenses), cashExpenses]); sum([...Object.values(gains), cashGains]);
      const history = (type: 'expense' | 'gain') => economic.filter(event => event.type === type)
        .map(event => ({ date: toFinancialCivilDate(event.date), valueInCents: event.valueInCents }));
      const actions = new Map<string, Date>();
      for (const event of snapshot.events.filter(event => event.effectiveAt <= asOfDate)) {
        const key = JSON.stringify([event.originalSource, event.originalOperationId]);
        const previous = actions.get(key); if (!previous || event.effectiveAt > previous) actions.set(key, event.effectiveAt);
      }
      return verify({ ...positions,
        cashSummary: positions.cashSummary ? { ...positions.cashSummary, currentMonthExpensesInCents: cashExpenses, currentMonthGainsInCents: cashGains } : null,
        currentMonthExpensesByBankId: expenses, currentMonthGainsByBankId: gains,
        expenseHistoryLastThreeMonths: buildHomeExpenseHistory(history('expense'), history('gain'), civil, { allowSigned: true }),
        activityHeatmap: buildHomeActivityHeatmap([...actions.values()].map(date => ({ date: toFinancialCivilDate(date) })), civil),
        upcomingMandatoryItems: buildSparkUpcomingMandatoryItems(recurring, asOfDate) });
    },
    movements: async (): Promise<HomeMovementsData> => {
      const [{ snapshot, recurring }, tags] = await Promise.all([dashboard(), getTagsWithUsersByPersonFirebase(actorId)]);
      if (!tags.success) throw tags.error;
      const byId = new Map(snapshot.accounts.map(account => [account.accountId, account]));
      const categories = new Map((tags.data ?? []).map(tag => [tag.id, tag]));
      const names = new Map(recurring.map(plan => [plan.id, plan.name]));
      const timeline = snapshot.events.filter(event => event.effectiveAt >= startOfMonth && event.effectiveAt <= asOfDate).flatMap<HomeTimelineMovement>(event => {
        const account = byId.get(event.accountId); if (!account) throw new Error('Conta do movimento ausente.');
        const economic = event.economicKind !== null, transfer = event.kind === 'transfer';
        const deposit = event.kind === 'investment_deposit', redemption = event.kind === 'investment_redemption';
        const valuation = ['investment_sync', 'investment_edit_valuation', 'investment_valuation_reversal'].includes(event.operationKind ?? '') && event.kind === 'valuation' && event.term === 'reference' && account.position.kind === 'investment';
        if (!economic && !(transfer && event.deltaInCents < 0) && !((deposit || redemption) && account.position.kind === 'bank') && !valuation) return [];
        const inverse = event.resolvesOperationId !== null || economic && (event.economicKind === 'expense' ? event.deltaInCents > 0 : event.deltaInCents < 0);
        const category = event.categoryId ? categories.get(event.categoryId) : null;
        const other = event.counterpartyAccountId ? byId.get(event.counterpartyAccountId) : null;
        const rawName = event.details?.name || event.note || (event.recurringPlanId ? names.get(event.recurringPlanId) : null)
          || (transfer ? 'Transferência' : deposit ? 'Aporte de investimento' : redemption ? 'Resgate de investimento' : valuation ? 'Avaliação de investimento' : event.kind === 'expense' ? 'Despesa' : 'Ganho');
        const text = (value: unknown) => typeof value === 'string' ? value : null;
        return [{ id: event.id, isSparkMovement: true, sparkExecutionReference: event.executionReference, type: valuation ? 'sync' : event.deltaInCents < 0 ? 'expense' : 'gain',
          name: inverse ? `Estorno: ${rawName}` : rawName, valueInCents: valuation ? event.referenceBalanceInCents! : Math.abs(event.deltaInCents),
          date: event.effectiveAt, tagId: event.categoryId, tagName: text(category?.name), tagIconFamily: text(category?.iconFamily),
          tagIconName: text(category?.iconName), tagIconStyle: text(category?.iconStyle), bankId: account.position.kind === 'bank' ? account.accountId : null,
          bankName: account.position.kind === 'bank' ? accountName(account) : null, explanation: event.details?.explanation ?? event.note,
          moneyFormat: account.position.kind === 'cash', isBankTransfer: transfer, bankTransferDirection: transfer ? 'outgoing' : null,
          bankTransferSourceBankNameSnapshot: transfer ? accountName(account) : null, bankTransferTargetBankNameSnapshot: transfer && other ? accountName(other) : null,
          isInvestmentDeposit: deposit, isInvestmentRedemption: redemption, isFinanceInvestmentSync: valuation,
          investmentSyncPreviousValueInCents: valuation ? addHomeCents(event.referenceBalanceInCents!, -event.deltaInCents) : null,
          investmentSyncReason: valuation ? 'manual' : null, investmentNameSnapshot: valuation ? accountName(account) : (deposit || redemption) && other ? accountName(other) : null,
          isFromMandatory: event.component === 'recurring' && event.resolvesOperationId === null }];
      }).sort((left, right) => right.date!.getTime() - left.date!.getTime() || left.id.localeCompare(right.id)).slice(0, 6);
      return verify({ timelineMovements: timeline, bankColorsById: Object.fromEntries(snapshot.accounts.filter(account => account.position.kind === 'bank')
        .map(account => [account.accountId, account.catalog?.colorHex ?? null])) });
    },
    investments: async (): Promise<HomeInvestmentsData> => {
      const snapshot = await financial();
      const assets = snapshot.accounts.filter(account => account.position.kind === 'investment' && account.position.active);
      let items = assets.map(account => {
        if (!account.principal || !account.catalog) throw new Error('O investimento precisa de cadastro e principal reconciliados.');
        const events = snapshot.events.filter(event => event.accountId === account.accountId && event.effectiveAt <= asOfDate);
        const lastSync = events.find(event => ['investment_sync', 'investment_edit_valuation', 'investment_valuation_reversal'].includes(event.operationKind ?? '') && event.kind === 'valuation' && event.term === 'reference' && event.operationId === account.reference?.operationId);
        const bank = snapshot.accounts.find(candidate => candidate.accountId === account.principal!.fundingAccountId);
        return { id: account.accountId, name: accountName(account), bankId: account.principal.fundingAccountId, bankNameSnapshot: bank ? accountName(bank) : null,
          initialValueInCents: account.principal.initialValueInCents, currentBaseValueInCents: account.position.balanceInCents,
          // O editor do catálogo não prova o titular das vigências CDI. Sem vínculo canônico, conservar o saldo confirmado.
          simulatedValueInCents: account.position.balanceInCents, estimatedGainInCents: 0, cdiPercentage: (account.catalog.cdiPercentageInBasisPoints ?? 0) / 100,
          lastManualSyncValueInCents: account.position.lastOperationId === lastSync?.operationId ? lastSync?.referenceBalanceInCents ?? null : null,
          lastManualSyncAt: lastSync?.effectiveAt ?? null, createdAt: events.find(event => event.operationId === account.principal!.openingOperationId)?.effectiveAt ?? null };
      }).sort((left, right) => right.currentBaseValueInCents - left.currentBaseValueInCents);
      let projectionStatus: HomeInvestmentsData['projectionStatus'] = 'confirmed_only';
      const canProject = assets.length > 0 && assets.every(account => account.positionStatus === 'current' && account.principal && account.catalog?.assetType && account.catalog.valuationMethod
        && snapshot.events.some(event => event.accountId === account.accountId && event.operationId === account.principal!.openingOperationId && event.operationKind === 'investment_opening' && event.actorId));
      if (canProject) {
        const rates = await getInvestmentCdiRatesWithRelationsFirebase(actorId);
        if (rates.success) {
          const native = projectSparkInvestmentPortfolio(snapshot.accounts, snapshot.events, asOfDate);
          const analytics = buildInvestmentPortfolioAnalytics({ investments: native.investments.map(item => ({ ...item, investmentDate: item.date,
            assetType: item.assetType as InvestmentAssetType, valuationMethod: item.valuationMethod as InvestmentValuationMethod, timelinePrecision: 'instant' })),
            ...native.activity, rates: rates.data ?? [], period: 'all', asOfDate: civil });
          if (analytics.unconfiguredInvestmentIds.length === 0 && native.investments.some(item => item.valuationMethod === 'cdi')) {
            items = items.map(item => {
              const projected = analytics.itemsByInvestmentId[item.id].projectedValueInCents;
              return { ...item, simulatedValueInCents: projected, estimatedGainInCents: addHomeCents(projected, -item.currentBaseValueInCents) };
            });
            projectionStatus = 'projected';
          }
        }
        if (JSON.stringify(snapshot.accounts) !== JSON.stringify(await readSparkAccountsFirebase(firestore, actorId, groupId))) throw new Error('A carteira mudou durante a projeção. Atualize a Home.');
      }
      return verify({ projectionStatus, portfolio: { items, investmentCount: items.length, totalCurrentBaseInCents: sum(items.map(item => item.currentBaseValueInCents)),
        totalInitialInCents: sum(items.map(item => item.initialValueInCents)), totalSimulatedInCents: sum(items.map(item => item.simulatedValueInCents)), totalEstimatedGainInCents: sum(items.map(item => item.estimatedGainInCents)) } });
    },
  };
}
