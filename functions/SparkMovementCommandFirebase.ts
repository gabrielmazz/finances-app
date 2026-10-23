import { Timestamp, type Firestore } from 'firebase/firestore';
import { getSparkContextFirebase } from './SparkContextFirebase';
import { postSparkMovementFirebase, correctSparkMovementFirebase, reverseSparkMovementFirebase } from './SparkMovementFirebase';
import { assertSparkDocumentId, sparkText, SPARK_MAX_CENTS, type SparkIdentity } from './sparkFinancialProtocol';
import { assertClientActionId } from '../utils/financialLedger';
import { serializeAssistantRecord } from '../utils/assistantRecordFingerprint';
import { validateSparkMovementDetails, type SparkMovementDetails } from '../utils/sparkMovementDetails';
import type { SparkExecutionReference } from '../utils/sparkFinancialReadModel';
import { sparkMetadataConfirmation } from '../utils/sparkMetadataConfirmation';

type Common = SparkIdentity & {
  movementKind: 'income' | 'expense'; effectiveAt: Timestamp; note?: string | null; overdraftReason?: string | null;
  assistantRequestFingerprint?: string | null;
};
type Fields = { accountId: string; amountInCents: number; categoryId: string | null; details: SparkMovementDetails };
type Target = { target: SparkExecutionReference; expectedFingerprint: string };
export type SparkMovementCommand = Common & (
  { action: 'create' } & Fields | { action: 'correct' } & Fields & Target | { action: 'reverse' } & Target
);

/** [[Operações Ordinárias Spark]]: intenção completa compartilhada, sem converter ID visual em referência executável. */
export async function executeSparkMovementCommandFirebase(firestore: Firestore, input: SparkMovementCommand) {
  const baseKeys = ['groupId', 'actorId', 'clientActionId', 'action', 'movementKind', 'effectiveAt', 'note', 'overdraftReason', 'assistantRequestFingerprint'];
  const fieldKeys = input.action === 'reverse' ? [] : ['accountId', 'amountInCents', 'categoryId', 'details'];
  const targetKeys = input.action === 'create' ? [] : ['target', 'expectedFingerprint'];
  if (!['create', 'correct', 'reverse'].includes(input.action) || !['income', 'expense'].includes(input.movementKind)
    || Object.keys(input).some(key => ![...baseKeys, ...fieldKeys, ...targetKeys].includes(key))) throw new Error('Comando ordinário inválido ou com campos especiais.');
  [input.groupId, input.actorId].forEach(assertSparkDocumentId); assertClientActionId(input.clientActionId);
  if (!(input.effectiveAt instanceof Timestamp) || input.effectiveAt.seconds < 0 || input.effectiveAt.toMillis() > Date.now()) throw new Error('Data efetiva inválida ou futura.');
  // Copiar todos os argumentos antes da primeira espera: o formulário não pode mudar uma confirmação em andamento.
  const common = { groupId: input.groupId, actorId: input.actorId, clientActionId: input.clientActionId,
    effectiveAt: new Timestamp(input.effectiveAt.seconds, input.effectiveAt.nanoseconds), note: sparkText(input.note, 2000), overdraftReason: sparkText(input.overdraftReason, 500) };
  const action = input.action, movementKind = input.movementKind;
  const target = input.action === 'create' ? null : { ...input.target };
  if (target && (Object.keys(target).length !== 3 || target.family !== 'ordinary' || !['live', 'imported'].includes(target.source))) throw new Error('Use o fluxo específico da origem deste lançamento.');
  if (target) assertClientActionId(target.operationId);
  const expectedFingerprint = input.action === 'create' ? null : input.expectedFingerprint;
  if (input.action !== 'create' && (typeof expectedFingerprint !== 'string' || !expectedFingerprint)) throw new Error('Atualize o lançamento antes de confirmar.');
  let fields: Fields | null = null;
  if (input.action !== 'reverse') {
    assertSparkDocumentId(input.accountId); if (input.categoryId !== null) assertSparkDocumentId(input.categoryId);
    if (!Number.isSafeInteger(input.amountInCents) || input.amountInCents <= 0 || input.amountInCents > SPARK_MAX_CENTS) throw new Error('Valor deve ser positivo e inteiro em centavos.');
    fields = { accountId: input.accountId, amountInCents: input.amountInCents, categoryId: input.categoryId, details: validateSparkMovementDetails(input.details) };
  }
  const assistantRequestFingerprint = input.assistantRequestFingerprint ?? null;
  const confirmation = sparkMetadataConfirmation({ expectedFingerprint, assistantRequestFingerprint,
    commandMaterial: serializeAssistantRecord({ action, movementKind, groupId: common.groupId, actorId: common.actorId,
      // Não reduzir timestamps a milissegundos no material confirmado.
      effectiveAt: { seconds: common.effectiveAt.seconds, nanoseconds: common.effectiveAt.nanoseconds }, note: common.note, overdraftReason: common.overdraftReason,
      fields, target, expectedFingerprint, assistantRequestFingerprint }) });
  const context = await getSparkContextFirebase(firestore, common.actorId);
  if (!context || context.groupId !== common.groupId) throw new Error('O grupo financeiro mudou. Atualize a confirmação.');
  if (action === 'create') return postSparkMovementFirebase(firestore, { ...common, ...fields!, ...confirmation, kind: movementKind });
  const resolution = { ...common, ...confirmation, originalOperationId: target!.operationId, originalSource: target!.source, expectedMovementKind: movementKind };
  return action === 'correct' ? correctSparkMovementFirebase(firestore, { ...resolution, ...fields! }) : reverseSparkMovementFirebase(firestore, resolution);
}
