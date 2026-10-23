import type { Firestore } from 'firebase/firestore';
import { readSparkFinancialEventsFirebase } from './SparkFinancialReadFirebase';
import { getSparkCurrentOrdinaryMovements, getSparkMovementResolutionIndex } from '../utils/sparkFinancialReadModel';

/** Lista vigente difere do journal: inversos não viram nova renda/despesa nem reapresentam o original resolvido. */
export async function readSparkMovementListFirebase(firestore: Firestore, actorId: string, groupId: string, kind: 'income' | 'expense', maximum?: number) {
  if (maximum !== undefined && (!Number.isSafeInteger(maximum) || maximum < 1)) throw new Error('Limite de consulta inválido.');
  const events = await readSparkFinancialEventsFirebase(firestore, actorId, groupId), resolutions = getSparkMovementResolutionIndex(events);
  const ordinary = new Set(getSparkCurrentOrdinaryMovements(events).map(event => event.id));
  const records = events.filter(event => event.economicKind === kind && event.deltaInCents * (kind === 'income' ? 1 : -1) > 0
    && (ordinary.has(event.id) || (event.component === 'recurring' && event.operationKind === 'recurring_settlement' || event.component === 'imported' && !event.resolvesOperationId)
      && !resolutions.resolvedBy({ source: event.originalSource, operationId: event.originalOperationId, family: 'ordinary' })))
    .map(event => ({ id: event.id, name: event.details?.name || event.note || (kind === 'income' ? 'Ganho' : 'Despesa'),
      valueInCents: Math.abs(event.deltaInCents), date: event.effectiveAt, personId: event.actorId,
      bankId: event.accountId === 'cash' ? null : event.accountId, tagId: event.categoryId, moneyFormat: event.accountId === 'cash',
      explanation: event.details?.explanation ?? event.note, paymentFormats: event.details?.paymentFormats ?? [],
      isSparkMovement: true, isLedgerMovement: true, isFromMandatory: event.component === 'recurring'
        || event.sourceReferences.some(ref => ['mandatoryExpenses', 'mandatoryGains'].includes(ref.collection)),
      sparkExecutionReference: event.executionReference, sparkResolvedByOperationId: null, person: null }))
    .sort((left, right) => right.date.getTime() - left.date.getTime() || left.id.localeCompare(right.id));
  return maximum === undefined ? records : records.slice(0, maximum);
}
