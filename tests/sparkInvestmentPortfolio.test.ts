import { projectSparkInvestmentPortfolio } from '@/functions/SparkInvestmentReadFirebase';
import { buildSparkFinancialReadEvents, type SparkReadRecord } from '@/utils/sparkFinancialReadModel';
import { buildInvestmentPortfolioAnalytics, type InvestmentPortfolioInvestment } from '@/utils/investmentPortfolio';
import type { SparkAccountReadModel } from '@/functions/SparkAccountReadFirebase';
import { Timestamp } from 'firebase/firestore';
const at = (time: string) => new Date(`2026-10-21T${time}-03:00`);
const opening = (extra: Record<string, unknown> = {}): SparkReadRecord => ({ id: 'opening', data: { kind: 'investment_opening', actorId: 'creator',
  createdAt: at('09:00:00'), effectiveAt: at('09:00:00'), fromAccountId: 'bank', toAccountId: 'asset', amountInCents: 10000,
  openingBalanceInCents: 11000, valuationDifferenceInCents: 1000, ...extra } });
const account = (): SparkAccountReadModel => ({ accountId: 'asset', groupId: 'group', positionStatus: 'current',
  position: { schemaVersion: 1, kind: 'investment', active: true, balanceInCents: 18000, revision: 2, lastOperationId: 'deposit', nextActivationAt: null },
  principal: { initialValueInCents: 10000, fundingAccountId: 'bank', revision: 0, lastOperationId: 'opening', openingOperationId: 'opening' },
  catalog: { name: 'Carteira', colorHex: null, iconKey: null, bankAccountId: 'bank', assetType: 'fixed_income', valuationMethod: 'cdi',
    cdiPercentageInBasisPoints: 10000, redemptionTerm: 'anytime', description: null }, catalogActorId: 'another-editor', catalogRevision: 3,
  lifecycle: { isActive: true, archived: false, archivedAt: null, revision: null }, reference: null });

test('titular de CDI é o autor da abertura protegida e não muda com outro editor do catálogo', () => {
  const result = projectSparkInvestmentPortfolio([account()], buildSparkFinancialReadEvents('group', [opening()]), at('18:00:00'));
  expect(result.investments[0].personId).toBe('creator'); expect(result.investments[0].personId).not.toBe('another-editor');
});
test('capital sem abertura comprovada é recusado sem atribuir a taxa do leitor', () => {
  expect(() => projectSparkInvestmentPortfolio([account()], [], at('18:00:00'))).toThrow(/titular/);
});
test('conta arquivada aparece somente na consulta explícita e conserva saldo retido', () => {
  const value = account(); value.position.active = false; value.positionStatus = 'retained'; value.lifecycle.archived = true;
  const events = buildSparkFinancialReadEvents('group', [opening()]);
  expect(projectSparkInvestmentPortfolio([value], events).investments).toEqual([]);
  expect(projectSparkInvestmentPortfolio([value], events, new Date(), true).investments[0].currentValueInCents).toBe(18000);
});
const investment: InvestmentPortfolioInvestment = { id: 'asset', personId: 'creator', name: 'Carteira', bankId: 'bank',
  initialValueInCents: 10000, currentValueInCents: 18000, cdiPercentageInBasisPoints: 10000, assetType: 'fixed_income', valuationMethod: 'cdi',
  investmentDate: new Date(2026, 9, 21), createdAt: new Date(2026, 9, 21), lastManualSyncAt: new Date(2026, 9, 21, 10),
  lastManualSyncValueInCents: 15000, timelinePrecision: 'instant' };
const clock = (hour: number) => new Date(2026, 9, 21, hour);
test('conferência às dez e aporte às onze são aplicados na ordem efetiva, sem perder o aporte', () => {
  const result = buildInvestmentPortfolioAnalytics({ investments: [investment], rates: [], period: 'all', asOfDate: clock(18),
    syncs: [{ investmentId: 'asset', date: clock(10), syncedValueInCents: 15000, reason: 'deposit', sequence: 1 }],
    cashFlows: [{ investmentId: 'asset', date: clock(11), valueInCents: 3000, kind: 'deposit', sequence: 2 }] });
  expect(result.projectedValueInCents).toBe(18000); expect(result.netAppliedInCents).toBe(13000);
});
test('revisão certificada desempata efetivações com o mesmo instante', () => {
  const result = buildInvestmentPortfolioAnalytics({ investments: [{ ...investment, lastManualSyncAt: clock(10), lastManualSyncValueInCents: 17000 }],
    rates: [], period: 'all', asOfDate: clock(18),
    syncs: [{ investmentId: 'asset', date: clock(10), syncedValueInCents: 17000, reason: 'manual', sequence: 2 }],
    cashFlows: [{ investmentId: 'asset', date: clock(10), valueInCents: 3000, kind: 'deposit', sequence: 1 }] });
  expect(result.projectedValueInCents).toBe(17000);
});

test('carteira atual inclui avaliação protegida e cabeça confirmada com relógio cliente atrasado', () => {
  const value = account(); value.reference = { operationId: 'sync', effectiveAt: Timestamp.fromDate(at('10:00:00')),
    countedBalanceInCents: 15000, includesBoundary: false };
  const events = buildSparkFinancialReadEvents('group', [opening(), { id: 'sync', data: { kind: 'investment_sync', actorId: 'creator', accountId: 'asset',
    createdAt: at('10:00:01'), effectiveAt: at('10:00:00'), targetBalanceInCents: 15000, differenceInCents: 4000, expectedRevision: 0 } },
  { id: 'deposit', data: { kind: 'investment_deposit', actorId: 'creator', createdAt: at('10:00:02'), effectiveAt: at('10:00:02'),
    fromAccountId: 'bank', toAccountId: 'asset', amountInCents: 3000, fromRevision: 0, toRevision: 1 } }]);
  const result = projectSparkInvestmentPortfolio([value], events, at('09:59:59'));
  expect(result.activity.syncs.at(-1)?.syncedValueInCents).toBe(15000);
  expect(result.activity.cashFlows.at(-1)?.valueInCents).toBe(3000);
  expect(result.investments[0].currentValueInCents).toBe(18000);
});
