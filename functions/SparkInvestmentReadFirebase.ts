import type { Firestore } from 'firebase/firestore';
import { getSparkContextFirebase } from './SparkContextFirebase';
import { readSparkAccountsFirebase, type SparkAccountReadModel } from './SparkAccountReadFirebase';
import { readSparkFinancialEventsFirebase } from './SparkFinancialReadFirebase';
import type { SparkFinancialReadEvent } from '../utils/sparkFinancialReadModel';
import { toFinancialCivilDate } from '../utils/financialCivilDate';
import type { InvestmentCashFlow, InvestmentSync } from '../utils/investmentPortfolio';

/** O titular da curva CDI vem da abertura imutável, nunca do último editor do catálogo. */
export function projectSparkInvestmentPortfolio(accounts: SparkAccountReadModel[], events: SparkFinancialReadEvent[], now = new Date(), includeInactive = false) {
  const investments = accounts.filter(account => account.position.kind === 'investment' && (includeInactive || account.position.active)).map(account => {
    const principal = account.principal, catalog = account.catalog;
    const opening = principal && events.find(event => event.operationId === principal.openingOperationId && event.accountId === account.accountId
      && event.operationKind === 'investment_opening' && event.component === 'principal');
    if (!principal || !catalog || !opening?.actorId) throw new Error('O principal ou o titular do investimento precisa de reconciliação.');
    if (account.position.active && account.positionStatus !== 'current') throw new Error('Atualize as aberturas vencidas antes de consultar a carteira.');
    const reference = account.reference && events.some(event => event.operationId === account.reference!.operationId && ['investment_sync', 'investment_edit_valuation', 'investment_valuation_reversal'].includes(event.operationKind ?? '')) ? account.reference : null;
    return { id: account.accountId, financialSource: 'spark' as const, sparkNative: true, personId: opening.actorId,
      name: catalog.name, bankId: principal.fundingAccountId, bankNameSnapshot: accounts.find(bank => bank.accountId === principal.fundingAccountId)?.catalog?.name ?? null,
      initialValueInCents: principal.initialValueInCents, currentValueInCents: account.position.balanceInCents,
      cdiPercentageInBasisPoints: catalog.cdiPercentageInBasisPoints!, cdiPercentage: catalog.cdiPercentageInBasisPoints! / 100,
      assetType: catalog.assetType!, valuationMethod: catalog.valuationMethod!, redemptionTerm: catalog.redemptionTerm, description: catalog.description,
      date: toFinancialCivilDate(opening.effectiveAt), createdAt: toFinancialCivilDate(opening.effectiveAt),
      lastManualSyncAt: reference ? toFinancialCivilDate(reference.effectiveAt.toDate()) : null,
      lastManualSyncValueInCents: reference?.countedBalanceInCents ?? null,
      sparkCanUndoValuation: !!reference && events.some(event => event.operationId === reference.operationId && ['investment_sync', 'investment_edit_valuation'].includes(event.operationKind ?? '')),
      sparkReferenceOperationId: reference?.operationId ?? null, sparkRevision: account.position.revision,
      archived: account.lifecycle.archived, isActive: account.lifecycle.isActive };
  });
  const ids = new Set(investments.map(investment => investment.id));
  // Esta carteira contém posições atuais; a referência confirmada não desaparece por atraso do relógio cliente.
  const confirmedThrough = new Map(accounts.map(account => [account.accountId,
    Math.max(now.getTime(), account.reference?.effectiveAt.toMillis() ?? 0)]));
  const heads = new Map(accounts.map(account => [account.accountId, account.position.lastOperationId]));
  for (const event of events) {
    if (heads.get(event.accountId) === event.operationId) confirmedThrough.set(event.accountId,
      Math.max(confirmedThrough.get(event.accountId)!, event.effectiveAt.getTime()));
  }
  const cashFlows: InvestmentCashFlow[] = [], syncs: InvestmentSync[] = [];
  for (const event of events.filter(event => ids.has(event.accountId) && event.effectiveAt.getTime() <= confirmedThrough.get(event.accountId)!)) {
    if (['investment_deposit', 'investment_redemption'].includes(event.kind) && event.operationKind !== 'investment_opening') {
      if (event.deltaInCents !== 0) cashFlows.push({ investmentId: event.accountId, date: toFinancialCivilDate(event.effectiveAt),
        sequence: event.accountRevision, valueInCents: Math.abs(event.deltaInCents), kind: event.deltaInCents > 0 ? 'deposit' : 'withdrawal' });
    } else if (event.kind === 'valuation' && event.term === 'reference') {
      if (event.referenceBalanceInCents === null) throw new Error('Avaliação sem referência.');
      syncs.push({ investmentId: event.accountId, date: toFinancialCivilDate(event.effectiveAt), syncedValueInCents: event.referenceBalanceInCents,
        sequence: event.accountRevision,
        reason: event.note === 'Sincronização antes do aporte' ? 'deposit' : event.note === 'Sincronização antes do resgate' ? 'withdrawal' : 'manual' });
    }
  }
  return { investments, activity: { cashFlows, syncs } };
}

export async function readSparkInvestmentPortfolioFirebase(firestore: Firestore, actorId: string, groupId: string, now = new Date(), includeInactive = false) {
  now = new Date(now);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const before = await readSparkAccountsFirebase(firestore, actorId, groupId);
    const events = await readSparkFinancialEventsFirebase(firestore, actorId, groupId);
    const after = await readSparkAccountsFirebase(firestore, actorId, groupId);
    if (JSON.stringify(before) !== JSON.stringify(after)) continue;
    if ((await getSparkContextFirebase(firestore, actorId))?.groupId !== groupId) throw new Error('O acesso financeiro mudou.');
    return projectSparkInvestmentPortfolio(after, events, now, includeInactive);
  }
  throw new Error('A carteira mudou durante a consulta. Atualize os dados.');
}
