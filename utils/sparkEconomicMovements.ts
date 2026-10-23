import type { SparkFinancialReadEvent } from './sparkFinancialReadModel';

/** [[Integração Financeira Spark]]: um estorno reduz a categoria econômica original, mesmo quando muda o sinal bancário. */
export function projectSparkEconomicMovements(events: SparkFinancialReadEvent[]) {
  return events.filter(event => event.term === 'delta' && event.economicKind !== null).map(event => {
    const valueInCents = event.economicKind === 'expense' ? -event.deltaInCents : event.deltaInCents;
    const name = event.details?.name || event.note || (event.economicKind === 'expense' ? 'Despesa' : 'Ganho');
    return { id: event.id, type: event.economicKind === 'expense' ? 'expense' as const : 'gain' as const,
      valueInCents, date: event.effectiveAt, tagId: event.categoryId, bankId: event.accountId === 'cash' ? null : event.accountId,
      name: valueInCents < 0 ? `Estorno: ${name}` : name, explanation: event.details?.explanation ?? event.note };
  });
}
