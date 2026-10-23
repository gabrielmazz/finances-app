import { doc, serverTimestamp, Timestamp, type Firestore } from 'firebase/firestore';
import { parseSparkCdiDay } from '../utils/sparkCdiRate';
import { assertSparkDocumentId, runSparkOperation, SPARK_MAX_CENTS, type SparkIdentity } from './sparkFinancialProtocol';
import { createAssistantRecordFingerprint } from '../utils/assistantRecordFingerprint';
import { sparkMetadataConfirmation, type SparkMetadataConfirmation } from '../utils/sparkMetadataConfirmation';
import { prepareSparkMetadataOrigin } from './sparkMetadataOrigin';

export type SparkCdiRateInput = SparkIdentity & SparkMetadataConfirmation & { effectiveDay: string; annualRateInBasisPoints: number; expectedRevision: number | null };

/** [[Categorias e CDI Spark]]: vigência única por pessoa/dia, revisão e recibo/cota atômicos. */
export async function saveSparkCdiRateFirebase(firestore: Firestore, input: SparkCdiRateInput) {
  input = { ...input }; const { cycle, day, dayKey } = parseSparkCdiDay(input.effectiveDay);
  const rateId = `${input.actorId}_${dayKey}`; assertSparkDocumentId(rateId);
  if (!Number.isSafeInteger(input.annualRateInBasisPoints) || input.annualRateInBasisPoints < 0 || input.annualRateInBasisPoints > 100_000
    || input.expectedRevision !== null && (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0 || input.expectedRevision >= SPARK_MAX_CENTS)) throw new Error('Taxa CDI ou revisão inválida.');
  const ref = doc(firestore, 'investmentCdiRates', rateId);
  const confirmation = sparkMetadataConfirmation(input);
  return runSparkOperation(firestore, input, async transaction => {
    const month = (await transaction.get(doc(firestore, 'sparkCivilMonths', cycle))).data();
    const previousEnd = month?.dayEnds?.[day - 2];
    const effectiveFrom = day === 1 ? month?.startAt : previousEnd instanceof Timestamp ? Timestamp.fromMillis(previousEnd.toMillis() + 1) : undefined;
    if (!(effectiveFrom instanceof Timestamp) || day > month!.dayEnds.length) throw new Error('Calendário autorizado indisponível para a vigência CDI.');
    return { kind: 'investment_cdi_update', rateId, cycle, day, effectiveFrom,
      annualRateInBasisPoints: input.annualRateInBasisPoints, expectedRevision: input.expectedRevision, ...confirmation };
  }, async (transaction, material) => {
    const previous = (await transaction.get(ref)).data();
    if (previous && (previous.personId !== input.actorId || previous.groupId && previous.groupId !== input.groupId)) throw new Error('Taxa CDI de outro proprietário ou grupo.');
    if ((previous?.revision ?? null) !== input.expectedRevision) throw new Error('A taxa CDI mudou. Atualize a confirmação.');
    if (confirmation.expectedFingerprint && (!previous || createAssistantRecordFingerprint(previous) !== confirmation.expectedFingerprint)) throw new Error('A taxa CDI mudou após a confirmação.');
    if (previous && !(previous.effectiveFrom instanceof Timestamp && previous.effectiveFrom.isEqual(material.effectiveFrom))) throw new Error('A vigência existente difere do dia civil confirmado.');
    const preserveOrigin = await prepareSparkMetadataOrigin(firestore, transaction, input, 'cdi', rateId, previous);
    preserveOrigin();
    transaction.set(ref, { schemaVersion: 1, personId: input.actorId, groupId: input.groupId,
      annualRateInBasisPoints: input.annualRateInBasisPoints, effectiveFrom: material.effectiveFrom,
      revision: (previous?.revision ?? -1) + 1, lastOperationId: input.clientActionId,
      createdAt: previous?.createdAt ?? serverTimestamp(), updatedAt: serverTimestamp() });
  });
}
