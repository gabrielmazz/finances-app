const mockContext = jest.fn(), mockAccounts = jest.fn(), mockEvents = jest.fn(), mockTags = jest.fn(), mockPlans = jest.fn(), mockLegacy = jest.fn(), mockRates = jest.fn();
jest.mock('@/FirebaseConfig', () => ({ db: {} }));
jest.mock('@/functions/SparkContextFirebase', () => ({ getSparkContextFirebase: (...args: unknown[]) => mockContext(...args) }));
jest.mock('@/functions/SparkAccountReadFirebase', () => ({ readSparkAccountsFirebase: (...args: unknown[]) => mockAccounts(...args) }));
jest.mock('@/functions/SparkFinancialReadFirebase', () => ({ readSparkFinancialEventsFirebase: (...args: unknown[]) => mockEvents(...args) }));
jest.mock('@/functions/SparkRecurringReadFirebase', () => ({ readSparkRecurringPlansFirebase: (...args: unknown[]) => mockPlans(...args) }));
jest.mock('@/functions/TagFirebase', () => ({ getTagsWithUsersByPersonFirebase: (...args: unknown[]) => mockTags(...args) }));
jest.mock('@/functions/FinancialLedgerFirebase', () => ({ getFinancialLedgerContextFirebase: (...args: unknown[]) => mockLegacy(...args) }));
jest.mock('@/functions/RegisterUserFirebase', () => ({ getRelatedUsersIDsFirebase: () => { throw new Error('Não deve consultar vínculos anteriores.'); } }));
jest.mock('@/functions/BankFirebase', () => ({ getLegacyBankBalancesInCentsFirebase: () => { throw new Error('Não deve consultar saldos anteriores.'); } }));
jest.mock('@/functions/InvestmentCdiRateFirebase', () => ({ getInvestmentCdiRatesWithRelationsFirebase: (...args: unknown[]) => mockRates(...args), getInvestmentCdiRatesByPersonIdsFirebase: () => { throw new Error('Editor não prova titular de CDI.'); } }));
jest.mock('firebase/firestore', () => ({ collection: () => { throw new Error('Não deve consultar coleção financeira anterior.'); } }));
import { getHomeSnapshotFirebase, getHomeOverviewFirebase, getHomeBalancesFirebase, getHomeInvestmentsFirebase } from '@/functions/HomeFirebase';
import { buildSparkFinancialReadEvents, type SparkReadRecord } from '@/utils/sparkFinancialReadModel';
const at = (day = '2026-10-10') => new Date(`${day}T12:00:00-03:00`);
const row = (id: string, kind: string, data: Record<string, unknown> = {}): SparkReadRecord => ({ id, data: { kind, actorId: 'owner', createdAt: at(), ...data } });
const expense = (id: string, amount: number, data: Record<string, unknown> = {}) => row(id, 'expense', { accountId: 'bank', differenceInCents: -amount, categoryId: 'food', ...data });
const account = (id: string, kind = 'bank', active = true) => ({ accountId: id, groupId: 'group',
  position: { kind, balanceInCents: 12345, revision: 0, active, lastOperationId: null, nextActivationAt: null },
  catalog: { name: id, colorHex: null, cdiPercentageInBasisPoints: 10000 }, principal: null, reference: null });
let records: ReturnType<typeof account>[];
const overview = async () => { const result = await getHomeOverviewFirebase('owner'); if (!result.success) throw result.error; return result.data; };
beforeEach(() => {
  jest.useFakeTimers().setSystemTime(at()); jest.clearAllMocks();
  mockContext.mockReset().mockResolvedValue({ groupId: 'group', actorId: 'owner', role: 'member' });
  records = [account('bank'), account('cash', 'cash')];
  mockAccounts.mockReset().mockImplementation(async () => records);
  mockEvents.mockReset().mockResolvedValue([]); mockPlans.mockReset().mockResolvedValue([]);
  mockTags.mockReset().mockResolvedValue({ success: true, data: [{ id: 'food', name: 'Alimentação' }] });
  mockRates.mockReset().mockResolvedValue({ success: true, data: [] });
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

test('Home Spark mantém saldos canônicos e corrige despesa entre banco e Caixa sem duplicar ganhos', async () => {
  mockEvents.mockResolvedValue(buildSparkFinancialReadEvents('group', [expense('old', 10000), row('edit', 'movement_correction', {
    originalSource: 'live', originalOperationId: 'old', fromAccountId: 'bank', toAccountId: 'cash', movementKind: 'expense', originalDeltaInCents: -10000, differenceInCents: -12000 })]));
  const data = await overview();
  expect(data.bankBalances[0].balanceInCents).toBe(12345);
  expect(data.currentMonthExpensesByBankId).toEqual({ bank: 0 }); expect(data.currentMonthGainsByBankId).toEqual({});
  expect(data.cashSummary).toMatchObject({ balanceInCents: 12345, currentMonthExpensesInCents: 12000, currentMonthGainsInCents: 0 });
  expect(data.expenseHistoryLastThreeMonths.at(-1)?.totalExpensesInCents).toBe(12000);
  expect(data.activityHeatmap.totalActions).toBe(2); expect(mockLegacy).not.toHaveBeenCalled();
});

test('estorno entre meses conserva mês anterior, total negativo atual e histórico de banco arquivado', async () => {
  records[0] = account('bank', 'bank', false);
  mockEvents.mockResolvedValue(buildSparkFinancialReadEvents('group', [expense('old', 1000, { effectiveAt: at('2026-09-05') }),
    row('undo', 'movement_reversal', { originalSource: 'live', originalOperationId: 'old', accountId: 'bank', movementKind: 'expense', differenceInCents: 1000 })]));
  const data = await overview(); expect(data.bankBalances).toEqual([]); expect(data.currentMonthExpensesByBankId.bank).toBe(-1000);
  expect(data.expenseHistoryLastThreeMonths.map(month => month.totalExpensesInCents)).toEqual([0, 1000, -1000]);
});

test('posição focada dispensa journal, recorrências, categorias e carteira', async () => {
  expect(await getHomeBalancesFirebase('owner')).toMatchObject({ success: true, data: { bankBalances: [{ id: 'bank', balanceInCents: 12345 }] } });
  expect(mockAccounts).toHaveBeenCalledTimes(1); expect(mockEvents).not.toHaveBeenCalled(); expect(mockPlans).not.toHaveBeenCalled(); expect(mockTags).not.toHaveBeenCalled();
});
test('snapshot declara o primeiro prazo ativo para que o cache não prorrogue a abertura mensal', async () => {
  records[0].position.nextActivationAt = { seconds: 1, nanoseconds: 0, toMillis: () => 1000 } as any;
  records[1].position.nextActivationAt = { seconds: 2, nanoseconds: 0, toMillis: () => 2000 } as any;
  records.push({ ...account('archived', 'bank', false), position: { ...account('archived').position, active: false, nextActivationAt: { toMillis: () => 500 } } } as any);
  expect(await getHomeSnapshotFirebase('owner')).toMatchObject({ success: true, data: { financialSource: 'spark', currentUntil: 1000 } });
});

test('snapshot compartilha uma fotografia financeira e mostra os pares uma vez por ação', async () => {
  mockEvents.mockResolvedValue(buildSparkFinancialReadEvents('group', [row('pair', 'transfer', { fromAccountId: 'bank', toAccountId: 'cash', amountInCents: 500 }), expense('item', 100)]));
  const result = await getHomeSnapshotFirebase('owner'); if (!result.success) throw result.error;
  expect(result.data.overview.success).toBe(true); expect(result.data.investments.success).toBe(true);
  expect(result.data.movements).toMatchObject({ success: true, data: { timelineMovements: expect.arrayContaining([
    expect.objectContaining({ id: 'pair:from', isBankTransfer: true, valueInCents: 500, bankTransferTargetBankNameSnapshot: 'cash' }),
    expect.objectContaining({ id: 'item:movement', sparkExecutionReference: { source: 'live', operationId: 'item', family: 'ordinary' } }),
  ]) } });
  if (result.data.movements.success) expect(result.data.movements.data.timelineMovements).toHaveLength(2);
  expect(mockEvents).toHaveBeenCalledTimes(1); expect(mockAccounts).toHaveBeenCalledTimes(3); expect(mockPlans).toHaveBeenCalledTimes(1);
});

test('movimento posterior ao fim do dia civil não entra nos indicadores ou na timeline', async () => {
  mockEvents.mockResolvedValue(buildSparkFinancialReadEvents('group', [expense('today', 100, { effectiveAt: new Date('2026-10-11T02:59:59.999Z') }),
    expense('tomorrow', 300, { effectiveAt: new Date('2026-10-11T03:00:00Z') })]));
  const data = await overview(); expect(data.currentMonthExpensesByBankId.bank).toBe(100); expect(data.activityHeatmap.totalActions).toBe(1);
});

test('investimentos Spark aparecem sem coleção anterior e sem atribuir CDI ao editor do catálogo', async () => {
  records.push({ ...account('investment', 'investment'), principal: { initialValueInCents: 10000, fundingAccountId: 'bank', openingOperationId: 'open' } } as any);
  mockEvents.mockResolvedValue(buildSparkFinancialReadEvents('group', [row('open', 'investment_opening', { fromAccountId: 'bank', toAccountId: 'investment',
    amountInCents: 10000, openingBalanceInCents: 12345, valuationDifferenceInCents: 2345 })]));
  const result = await getHomeInvestmentsFirebase('owner');
  expect(result).toMatchObject({ success: true, data: { projectionStatus: 'confirmed_only', portfolio: { investmentCount: 1, totalInitialInCents: 10000,
    totalCurrentBaseInCents: 12345, totalSimulatedInCents: 12345, totalEstimatedGainInCents: 0, items: [{ bankId: 'bank', bankNameSnapshot: 'bank' }] } } });
});

test('principal ausente falha só a carteira, em vez de inventar capital ou esconder conta', async () => {
  records.push(account('investment', 'investment'));
  const result = await getHomeSnapshotFirebase('owner'); if (!result.success) throw result.error;
  expect(result.data.investments.success).toBe(false); expect(result.data.overview.success).toBe(true); expect(result.data.movements.success).toBe(true);
});

test('desfazer pagamento não apresenta um recebimento obrigatório concluído na timeline', async () => {
  mockPlans.mockResolvedValue([{ id: 'rent', name: 'Aluguel', active: false }]);
  mockEvents.mockResolvedValue(buildSparkFinancialReadEvents('group', [row('paid', 'recurring_settlement', { accountId: 'bank', planId: 'rent', recurringType: 'expense', differenceInCents: -1000 }),
    row('undo', 'recurring_reversal', { accountId: 'bank', planId: 'rent', recurringType: 'expense', settlementOperationId: 'paid', differenceInCents: 1000 })]));
  const result = await getHomeSnapshotFirebase('owner'); if (!result.success || !result.data.movements.success) throw new Error('Timeline indisponível.');
  expect(result.data.movements.data.timelineMovements.find(item => item.id === 'paid:recurring')).toMatchObject({ name: 'Aluguel', isFromMandatory: true, type: 'expense' });
  expect(result.data.movements.data.timelineMovements.find(item => item.id === 'undo:recurring')).toMatchObject({ name: 'Estorno: Aluguel', isFromMandatory: false, type: 'gain' });
});

test('recorrência ilegível falha no resumo, mas não elimina a carteira confirmada', async () => {
  mockPlans.mockRejectedValue(new Error('Histórico indisponível.'));
  const result = await getHomeSnapshotFirebase('owner'); if (!result.success) throw result.error;
  expect(result.data.overview.success).toBe(false); expect(result.data.movements.success).toBe(false); expect(result.data.investments.success).toBe(true);
});

test('mudança nas posições refaz o journal e não mistura saldos anteriores com eventos novos', async () => {
  mockAccounts.mockResolvedValueOnce(records).mockResolvedValueOnce(records.map(item => ({ ...item, position: { ...item.position, revision: 1 } })))
    .mockResolvedValueOnce(records.map(item => ({ ...item, position: { ...item.position, revision: 1 } })));
  mockAccounts.mockResolvedValue(records.map(item => ({ ...item, position: { ...item.position, revision: 1 } })));
  await overview(); expect(mockEvents).toHaveBeenCalledTimes(2); expect(mockAccounts).toHaveBeenCalledTimes(4);
});

test('pagamento durante a leitura dos compromissos não combina plano quitado com saldo anterior', async () => {
  mockAccounts.mockResolvedValueOnce(records).mockResolvedValueOnce(records)
    .mockResolvedValueOnce(records.map(item => ({ ...item, position: { ...item.position, revision: 1 } })));
  expect(await getHomeOverviewFirebase('owner')).toMatchObject({ success: false });
});

test('alterações contínuas e troca de grupo recusam a fotografia sem fallback', async () => {
  let revision = 0;
  mockAccounts.mockImplementation(async () => records.map(item => ({ ...item, position: { ...item.position, revision: revision++ } })));
  expect(await getHomeOverviewFirebase('owner')).toMatchObject({ success: false }); expect(mockEvents).toHaveBeenCalledTimes(3);
  mockAccounts.mockResolvedValue(records);
  mockContext.mockResolvedValueOnce({ groupId: 'group' }).mockResolvedValueOnce({ groupId: 'other' });
  expect(await getHomeBalancesFirebase('owner')).toMatchObject({ success: false }); expect(mockLegacy).not.toHaveBeenCalled();
});

test('guard de saldo vencido e contexto recusado não consultam fontes anteriores', async () => {
  mockAccounts.mockRejectedValue(new Error('permission-denied'));
  expect(await getHomeBalancesFirebase('owner')).toMatchObject({ success: false });
  mockContext.mockRejectedValue(new Error('Grupo em preparação.'));
  expect(await getHomeSnapshotFirebase('owner')).toMatchObject({ success: false }); expect(mockLegacy).not.toHaveBeenCalled();
});

test('totais volumosos não apresentam centavos arredondados silenciosamente', async () => {
  mockEvents.mockResolvedValue(buildSparkFinancialReadEvents('group', Array.from({ length: 9008 }, (_, index) => expense(`large-${index}`, 1e12))));
  expect(await getHomeOverviewFirebase('owner')).toMatchObject({ success: false });
});

test('CDI da Home usa titular da abertura mesmo após outro administrador editar o catálogo', async () => {
  records.push({ ...account('investment', 'investment'), positionStatus: 'current', catalogActorId: 'editor', lifecycle: { isActive: true, archived: false, archivedAt: null, revision: null },
    position: { ...account('investment', 'investment').position, balanceInCents: 100000 },
    principal: { initialValueInCents: 100000, fundingAccountId: 'bank', openingOperationId: 'open' },
    catalog: { name: 'Carteira', colorHex: null, iconKey: null, bankAccountId: 'bank', assetType: 'fixed_income', valuationMethod: 'cdi',
      cdiPercentageInBasisPoints: 10000, redemptionTerm: 'anytime', description: null } } as any);
  mockEvents.mockResolvedValue(buildSparkFinancialReadEvents('group', [row('open', 'investment_opening', { actorId: 'creator', effectiveAt: at('2026-09-10'),
    fromAccountId: 'bank', toAccountId: 'investment', amountInCents: 100000, openingBalanceInCents: 100000, valuationDifferenceInCents: 0 })]));
  mockRates.mockResolvedValue({ success: true, data: [{ id: 'rate', personId: 'creator', annualRateInBasisPoints: 1200, effectiveFrom: new Date(2026, 8, 1) },
    { id: 'editor-rate', personId: 'editor', annualRateInBasisPoints: 0, effectiveFrom: new Date(2026, 8, 1) }] });
  const result = await getHomeInvestmentsFirebase('owner');
  if (!result.success) throw result.error;
  expect(result.data.projectionStatus).toBe('projected'); expect(mockRates).toHaveBeenCalledWith('owner');
  expect(result.data.portfolio.totalCurrentBaseInCents).toBe(100000);
  expect(result.data.portfolio.totalSimulatedInCents).toBeGreaterThan(100000);
  for (const data of [[], [{ id: 'wrong-owner', personId: 'editor', annualRateInBasisPoints: 1200, effectiveFrom: new Date(2026, 8, 1) }]]) {
    mockRates.mockResolvedValueOnce({ success: true, data });
    expect(await getHomeInvestmentsFirebase('owner')).toMatchObject({ success: true, data: { projectionStatus: 'confirmed_only', portfolio: { totalSimulatedInCents: 100000 } } });
  }
  mockRates.mockResolvedValue({ success: false });
  expect(await getHomeInvestmentsFirebase('owner')).toMatchObject({ success: true, data: { projectionStatus: 'confirmed_only', portfolio: { totalSimulatedInCents: 100000 } } });
});


test('primeiro percurso da Home mantém ganho de 200 reais e despesa corrigida de 70, com saldo de 1.130', async () => {
  records[0].position.balanceInCents = 113000;
  mockEvents.mockResolvedValue(buildSparkFinancialReadEvents('group', [
    row('open', 'bank_opening', { accountId: 'bank', openingBalanceInCents: 100000 }),
    row('gain', 'income', { accountId: 'bank', differenceInCents: 20000 }),
    expense('expense', 5000),
    row('edit-expense', 'movement_correction', { originalSource: 'live', originalOperationId: 'expense', fromAccountId: 'bank', toAccountId: 'bank',
      movementKind: 'expense', originalDeltaInCents: -5000, differenceInCents: -7000 }),
  ]));
  const data = await overview();
  expect(data.bankBalances[0].balanceInCents).toBe(113000);
  expect(data.currentMonthGainsByBankId.bank).toBe(20000);
  expect(data.currentMonthExpensesByBankId.bank).toBe(7000);
});

test('timeline conserva a resolução de operações Spark para impedir novo estorno pela Home', async () => {
  mockEvents.mockResolvedValue(buildSparkFinancialReadEvents('group', [expense('original', 1000), row('undo', 'movement_reversal', {
    originalSource: 'live', originalOperationId: 'original', accountId: 'bank', movementKind: 'expense', differenceInCents: 1000 })]));
  const result = await getHomeSnapshotFirebase('owner');
  if (!result.success || !result.data.movements.success) throw new Error('Timeline indisponível.');
  expect(result.data.movements.data.timelineMovements.find(item => item.id === 'original:movement')).toMatchObject({
    isLedgerMovement: true, isSparkMovement: true, sparkResolvedByOperationId: 'undo', personId: 'owner',
    sparkExecutionReference: { source: 'live', operationId: 'original', family: 'ordinary' },
  });
});

test('ajuste ativo e referência de abertura aparecem com suas permissões financeiras', async () => {
  mockEvents.mockResolvedValue(buildSparkFinancialReadEvents('group', [
    row('opening', 'bank_opening', { accountId: 'bank', openingBalanceInCents: 10000 }),
    row('adjustment', 'balance_adjustment', { accountId: 'bank', differenceInCents: -500 }),
  ]));
  const result = await getHomeSnapshotFirebase('owner');
  if (!result.success || !result.data.movements.success) throw new Error('Timeline indisponível.');
  expect(result.data.movements.data.timelineMovements).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: 'opening:reference', isLedgerMovement: true, isBalanceAdjustment: true, sparkAdjustmentOperationId: null, valueInCents: 10000 }),
    expect.objectContaining({ id: 'adjustment:adjustment', isBalanceAdjustment: true, sparkAdjustmentOperationId: 'adjustment', sparkAdjustmentResolved: false, personId: 'owner', type: 'expense', valueInCents: 500 }),
  ]));
  if (!result.data.overview.success) throw new Error('Resumo indisponível.');
  expect(result.data.overview.data.currentMonthExpensesByBankId).toEqual({});
  expect(result.data.overview.data.currentMonthGainsByBankId).toEqual({});
});

test('saque Spark conserva a referência do par e aparece uma única vez na Home', async () => {
  mockEvents.mockResolvedValue(buildSparkFinancialReadEvents('group', [row('pair', 'transfer', { fromAccountId: 'bank', toAccountId: 'cash', amountInCents: 500 })]));
  const result = await getHomeSnapshotFirebase('owner');
  if (!result.success || !result.data.movements.success) throw new Error('Timeline indisponível.');
  expect(result.data.movements.data.timelineMovements).toHaveLength(1);
  expect(result.data.movements.data.timelineMovements[0]).toMatchObject({ isCashRescue: true, isLedgerMovement: true,
    sparkExecutionReference: { source: 'live', operationId: 'pair', family: 'pair' } });
});
