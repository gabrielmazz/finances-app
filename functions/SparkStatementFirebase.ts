import { doc, getDocFromServer, type Firestore } from 'firebase/firestore';
import { getSparkContextFirebase } from './SparkContextFirebase';
import { readSparkAccountFirebase } from './SparkAccountReadFirebase';
import { readSparkFinancialEventsFirebase } from './SparkFinancialReadFirebase';
import { fromFinancialCivilDate } from '../utils/financialCivilDate';
import { getSparkMovementResolutionIndex } from '../utils/sparkFinancialReadModel';

/** [[Integração Financeira Spark]]: extrato de banco/Caixa conserva componentes; datas da seleção são dias civis de São Paulo. */
export async function readSparkStatementFirebase(firestore: Firestore, actorId: string, groupId: string, accountId: string, startDate: Date, endDate: Date) {
  if (!(startDate instanceof Date) || !(endDate instanceof Date) || !Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime())) throw new Error('Período inválido.');
  const start = fromFinancialCivilDate(new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()));
  const end = fromFinancialCivilDate(new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 23, 59, 59, 999));
  if (end < start) throw new Error('Período inválido.');
  const account = await readSparkAccountFirebase(firestore, actorId, groupId, accountId, { requireCurrent: false });
  if (!['bank', 'cash'].includes(account.position.kind)) throw new Error('Selecione banco ou Caixa do grupo.');
  const events = await readSparkFinancialEventsFirebase(firestore, actorId, groupId), expenses: Record<string, any>[] = [], gains: Record<string, any>[] = [];
  const resolutions = getSparkMovementResolutionIndex(events);
  const names = new Map<string, string>(account.catalog ? [[accountId, account.catalog.name]] : []);
  const counterparties = [...new Set(events.filter(event => event.accountId === accountId && event.effectiveAt >= start && event.effectiveAt <= end)
    .map(event => event.counterpartyAccountId).filter((id): id is string => !!id && id !== accountId))];
  await Promise.all(counterparties.map(async id => {
    const catalog = (await getDocFromServer(doc(firestore, 'financialGroups', groupId, 'sparkAccountCatalog', id))).data();
    if (typeof catalog?.name === 'string' && catalog.name.trim()) names.set(id, catalog.name);
  }));
  if ((await getSparkContextFirebase(firestore, actorId))?.groupId !== groupId) throw new Error('O acesso financeiro mudou.');
  for (const event of events) {
    if (event.accountId !== accountId || event.effectiveAt < start || event.effectiveAt > end) continue;
    const value = event.kind === 'opening' ? event.referenceBalanceInCents ?? event.deltaInCents : event.deltaInCents;
    if (!value) continue;
    const funding = event.kind === 'principal_change' || event.kind === 'funding_change';
    const investmentPair = event.kind === 'investment_deposit' || event.kind === 'investment_redemption';
    const investmentName = investmentPair && event.counterpartyAccountId ? names.get(event.counterpartyAccountId) ?? 'investimento' : null;
    const cash = event.kind === 'transfer' && (accountId === 'cash' || event.counterpartyAccountId === 'cash');
    const adjustmentId = event.originalSource === 'live' && ['balance_adjustment', 'dated_adjustment', 'adjustment_replacement'].includes(event.operationKind ?? '')
      && !event.resolvesOperationId && event.term === 'delta' ? event.operationId : null;
    const inverse = event.economicKind === 'expense' ? value > 0 : event.economicKind === 'income' && value < 0;
    const movement = { id: event.id, bankId: accountId === 'cash' ? null : accountId, personId: event.actorId ?? '', date: event.effectiveAt, valueInCents: Math.abs(value),
      name: event.details?.name || event.note || (investmentPair ? `${event.resolvesOperationId ? 'Estorno de ' : ''}${event.kind === 'investment_deposit' ? 'Aporte' : 'Resgate'} em ${investmentName}`
        : event.kind === 'income' ? 'Ganho' : event.kind === 'expense' ? 'Despesa' : event.kind === 'opening' ? 'Saldo inicial' : cash ? 'Movimentação de dinheiro' : 'Movimentação financeira'),
      explanation: event.details?.explanation ?? event.note, paymentFormats: event.details?.paymentFormats ?? [], tagId: event.categoryId,
      moneyFormat: account.position.kind === 'cash', isLedgerMovement: true, isSparkMovement: true,
      sparkOperationId: event.operationId, sparkComponent: event.component, sparkOriginalSource: event.originalSource, sparkOriginalOperationId: event.originalOperationId,
      sparkExecutionReference: event.executionReference,
      sparkEconomicKind: event.economicKind, sparkDeltaInCents: event.deltaInCents,
      sparkAdjustmentOperationId: adjustmentId,
      sparkAdjustmentResolved: adjustmentId ? !!resolutions.resolvedBy({ source: 'live', operationId: adjustmentId, family: 'ordinary' }) : false,
      sparkResolvedByOperationId: event.executionReference ? resolutions.resolvedBy(event.executionReference) : null,
      isBankTransfer: event.kind === 'transfer' && !cash, isCashRescue: cash,
      bankNameSnapshot: cash ? names.get(accountId === 'cash' ? event.counterpartyAccountId! : accountId) ?? null : null,
      bankTransferPairId: event.operationId, bankTransferDirection: value < 0 ? 'outgoing' : 'incoming',
      bankTransferSourceBankId: value < 0 ? accountId : event.counterpartyAccountId, bankTransferTargetBankId: value > 0 ? accountId : event.counterpartyAccountId,
      bankTransferSourceBankNameSnapshot: names.get(value < 0 ? accountId : event.counterpartyAccountId!) ?? null,
      bankTransferTargetBankNameSnapshot: names.get(value > 0 ? accountId : event.counterpartyAccountId!) ?? null,
      investmentId: investmentPair ? event.counterpartyAccountId : null, investmentNameSnapshot: investmentName,
      isInvestmentDeposit: (investmentPair || funding) && value < 0,
      isInvestmentRedemption: (investmentPair || funding) && value > 0,
      isBalanceAdjustment: event.term === 'reference' || event.kind === 'adjustment' || event.kind === 'valuation',
    };
    if (inverse) movement.name = `Estorno: ${movement.name}`;
    (value < 0 ? expenses : gains).push(movement);
  }
  return { expenses, gains, isLedgerSource: true, isSparkSource: true };
}
