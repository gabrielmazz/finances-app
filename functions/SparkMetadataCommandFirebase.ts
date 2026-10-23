import { doc, getDoc, type Firestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getSparkContextFirebase } from './SparkContextFirebase';
import { saveSparkCategoryFirebase, deleteSparkCategoryFirebase } from './SparkCategoryFirebase';
import { saveSparkCdiRateFirebase } from './SparkCdiRateFirebase';
import { sparkCategoryFromRecord } from '../utils/sparkCategory';
import { serializeAssistantRecord } from '../utils/assistantRecordFingerprint';
import { findTagIconByLabel } from '../utils/tagIconCatalog';
import { toFinancialCivilDate } from '../utils/financialCivilDate';
import { parseSparkCdiDay } from '../utils/sparkCdiRate';
import { assertSparkDocumentId } from './sparkFinancialProtocol';
import { assertClientActionId } from '../utils/financialLedger';
import { createOpaqueHandle } from '../utils/opaqueHandle';

export type SparkMetadataCommand = {
  groupId: string; actorId: string; clientActionId: string; domain: 'category' | 'cdi'; action: 'create' | 'update' | 'delete' | 'upsert';
  fields: Record<string, unknown>; recordId?: string; expectedFingerprint?: string; assistantRequestFingerprint?: string;
};
/** [[Integração Financeira Spark]]: mesmo comando para formulários e conversa, sem descartar sua confirmação. */
export async function executeSparkMetadataCommandFirebase(firestore: Firestore, input: SparkMetadataCommand) {
  if (!['category', 'cdi'].includes(input.domain) || !['create', 'update', 'upsert', 'delete'].includes(input.action)
    || !input.fields || typeof input.fields !== 'object' || Array.isArray(input.fields)) throw new Error('Comando de metadados inválido.');
  assertClientActionId(input.clientActionId);
  const context = await getSparkContextFirebase(firestore, input.actorId);
  if (!context || context.groupId !== input.groupId) throw new Error('Grupo Spark indisponível para este comando.');
  const allowed = input.domain === 'cdi' ? ['annualRateInBasisPoints', 'effectiveFrom']
    : ['name', 'usageType', 'isMandatoryExpense', 'isMandatoryGain', 'showInBothLists', 'iconLabel', 'iconFamily', 'iconName', 'iconStyle'];
  if (Object.keys(input.fields).some(key => !allowed.includes(key))) throw new Error('Campo de metadados não suportado.');
  const selectedIcon = input.fields.iconLabel === null ? { iconFamily: null, iconName: null, iconStyle: null }
    : typeof input.fields.iconLabel === 'string' ? findTagIconByLabel(input.fields.iconLabel) : undefined;
  if (input.fields.iconLabel !== undefined && !selectedIcon) throw new Error('Ícone de categoria inválido.');
  const icon = selectedIcon ? { iconFamily: selectedIcon.iconFamily, iconName: selectedIcon.iconName, iconStyle: selectedIcon.iconStyle ?? null } : undefined;
  let recordId = input.action === 'create' ? createOpaqueHandle('category', input.groupId, input.clientActionId, input.actorId) : input.recordId;
  let effectiveDay: string | undefined;
  if (input.domain === 'cdi') {
    if (!['create', 'update', 'upsert'].includes(input.action)) throw new Error('Operação CDI não suportada.');
    const raw = input.fields.effectiveFrom;
    const date = raw instanceof Date ? raw : raw && typeof (raw as { toDate?: unknown }).toDate === 'function' ? (raw as { toDate(): Date }).toDate() : new Date(String(raw));
    if (!Number.isFinite(date.getTime())) throw new Error('Vigência CDI inválida.');
    const civil = toFinancialCivilDate(date);
    effectiveDay = `${civil.getFullYear()}-${String(civil.getMonth() + 1).padStart(2, '0')}-${String(civil.getDate()).padStart(2, '0')}`;
    const canonicalId = `${input.actorId}_${parseSparkCdiDay(effectiveDay).dayKey}`;
    if (input.recordId && input.recordId !== canonicalId) throw new Error('Identidade CDI divergente do dia confirmado.');
    recordId = canonicalId;
  }
  if (!recordId) throw new Error('Informe a identidade do cadastro.'); assertSparkDocumentId(recordId);
  const commandMaterial = serializeAssistantRecord({ domain: input.domain, action: input.action, fields: input.fields, recordId,
    expectedFingerprint: input.expectedFingerprint ?? null, assistantRequestFingerprint: input.assistantRequestFingerprint ?? null });
  const confirmation = { expectedFingerprint: input.expectedFingerprint, assistantRequestFingerprint: input.assistantRequestFingerprint, commandMaterial };
  const receipt = (await getDoc(doc(firestore, 'financialGroups', context.groupId, 'sparkOperations', input.clientActionId))).data();
  if (receipt) {
    const kind = input.domain === 'cdi' ? 'investment_cdi_update' : input.action === 'delete' ? 'category_delete' : 'category_save';
    const matches = receipt.actorId === input.actorId && receipt.kind === kind && receipt.commandMaterial === commandMaterial
      && (input.domain === 'cdi' ? receipt.rateId === recordId && receipt.annualRateInBasisPoints === input.fields.annualRateInBasisPoints
        : receipt.categoryId === recordId && (input.action === 'delete' || Object.entries(sparkCategoryFromRecord({ ...receipt, ...input.fields, ...icon })).every(([key, value]) => receipt[key] === value)));
    if (!matches) throw new Error('Identificador de operação já utilizado com outros argumentos.');
    if (getAuth(firestore.app).currentUser?.uid !== input.actorId) throw new Error('A sessão autenticada mudou.');
    return { recordId, idempotent: true };
  }
  const ref = doc(firestore, input.domain === 'cdi' ? 'investmentCdiRates' : 'tags', recordId), previous = (await getDoc(ref)).data();
  if (input.action === 'create' && previous || input.action === 'update' && !previous) throw new Error('Cadastro já existe ou não está disponível para edição.');
  const identity = { ...context, clientActionId: input.clientActionId, ...confirmation }, expectedRevision = previous?.revision ?? null;
  if (input.domain === 'cdi') await saveSparkCdiRateFirebase(firestore, { ...identity, expectedRevision, effectiveDay: effectiveDay!, annualRateInBasisPoints: input.fields.annualRateInBasisPoints as number });
  else if (input.action === 'delete') await deleteSparkCategoryFirebase(firestore, { ...identity, expectedRevision, categoryId: recordId });
  else await saveSparkCategoryFirebase(firestore, { ...identity, expectedRevision, categoryId: recordId, category: sparkCategoryFromRecord({ ...previous, ...input.fields, ...icon }) });
  return { recordId, idempotent: false };
}
