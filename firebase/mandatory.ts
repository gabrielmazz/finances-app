import { collection, doc, documentId, getDocFromServer, getDocsFromServer, limit, orderBy, query, runTransaction, serverTimestamp, startAfter, Timestamp, where, type DocumentData } from 'firebase/firestore';
import { bankContextKey, requireBankEnvironment, requireBankReadEnvironment } from './banks';
import { readCategory } from './categories';
import type { AccountClient } from './profiles';
import type { BankScope } from '../domain/banks';
import { validateMandatory, type MandatoryInput, type MandatoryTemplate } from '../domain/mandatory';
import type { MovementType } from '../domain/movements';
import { isTagVisibleInMandatoryUsageList } from '../utils/tagUsage';

function templates(client: AccountClient, scope: BankScope) {
  requireBankReadEnvironment(client, scope);
  return collection(client.db, 'financialContexts', bankContextKey(scope), 'mandatoryTemplates');
}

export function mandatoryRef(client: AccountClient, scope: BankScope, id: string) {
  if (!/^[A-Za-z0-9]{20}$/.test(id)) throw Error('mandatory/invalid-id');
  return doc(templates(client, scope), id);
}

export function parseMandatory(id: string, data: DocumentData): MandatoryTemplate {
  const start = data.installmentStartDate?.toDate();
  const last = data.lastMovementDate?.toDate();
  return {
    ...validateMandatory({
      type: data.type, name: data.name, valueInCents: data.valueInCents, categoryId: data.categoryId,
      categorySource: data.categorySource, description: data.description, dueDay: data.dueDay,
      usesBusinessDays: data.usesBusinessDays, installmentTotal: data.installmentTotal,
      installmentTotalValueInCents: data.installmentTotalValueInCents,
      installmentStartDate: start ? start.toISOString().slice(0, 10) : null,
    }),
    id, revision: data.revision, isActive: data.isActive, installmentsCompleted: data.installmentsCompleted,
    lastCycle: data.lastCycle, lastMovementDate: last ? last.toISOString().slice(0, 10) : null,
    lastAmountCents: data.lastAmountCents, lastInstallments: data.lastInstallments,
  };
}

export async function readMandatoryTemplate(client: AccountClient, scope: BankScope, id: string) {
  const result = await getDocFromServer(mandatoryRef(client, scope, id));
  requireBankReadEnvironment(client, scope);
  if (!result.exists()) throw Error('mandatory/not-found');
  return parseMandatory(result.id, result.data());
}

export async function readMandatoryPage(client: AccountClient, scope: BankScope, type: MovementType, after?: string | null) {
  const result = await getDocsFromServer(query(templates(client, scope), where('type', '==', type), where('isActive', '==', true), orderBy(documentId()), ...(after ? [startAfter(after)] : []), limit(20)));
  requireBankReadEnvironment(client, scope);
  return { items: result.docs.map(item => parseMandatory(item.id, item.data())), next: result.size === 20 ? result.docs.at(-1)!.id : null };
}

export function newMandatoryId(client: AccountClient, scope: BankScope) {
  requireBankEnvironment(client, scope);
  return doc(templates(client, scope)).id;
}

export async function saveMandatoryTemplate(client: AccountClient, scope: BankScope, id: string, input: MandatoryInput, expectedRevision: number | null) {
  requireBankEnvironment(client, scope);
  const value = validateMandatory(input), ref = mandatoryRef(client, scope, id);
  await runTransaction(client.db, async tx => {
    const snap = await tx.get(ref);
    requireBankEnvironment(client, scope);
    const fields = { ...value, installmentStartDate: value.installmentStartDate ? Timestamp.fromDate(new Date(value.installmentStartDate + 'T00:00:00Z')) : null };
    const previous = snap.exists() ? parseMandatory(id, snap.data()) : null;
    if (!previous || previous.categoryId !== value.categoryId || previous.categorySource !== value.categorySource) {
      const category = await readCategory(client, scope, { id: value.categoryId, source: value.categorySource });
      if (category.status !== 'active' || category.blocked || !isTagVisibleInMandatoryUsageList(category, value.type)) throw Error('movements/invalid-category');
    }
    if (!previous && expectedRevision === null) {
      tx.set(ref, { ...fields, revision: 0, isActive: true, installmentsCompleted: 0, lastCycle: null, lastMovementDate: null,
        lastAmountCents: null, lastInstallments: 0, updatedBy: scope.uid, updatedAt: serverTimestamp() });
      return;
    }
    if (!previous) throw Error('mandatory/not-found');
    const current = previous;
    if (current.type !== value.type || !current.isActive) throw Error('mandatory/conflict');
    if (expectedRevision === null) {
      if (Object.entries(value).every(([key, field]) => Reflect.get(current, key) === field)) return;
      throw Error('mandatory/conflict');
    }
    if (current.revision !== expectedRevision) throw Error('mandatory/conflict');
    if (current.installmentsCompleted > 0 && (current.installmentTotal !== value.installmentTotal ||
      current.installmentTotalValueInCents !== value.installmentTotalValueInCents || current.installmentStartDate !== value.installmentStartDate)) throw Error('mandatory/installments-started');
    tx.update(ref, { ...fields, revision: expectedRevision + 1, updatedBy: scope.uid, updatedAt: serverTimestamp() });
  });
  return readMandatoryTemplate(client, scope, id);
}

export async function archiveMandatoryTemplate(client: AccountClient, scope: BankScope, expected: MandatoryTemplate) {
  requireBankEnvironment(client, scope);
  const ref = mandatoryRef(client, scope, expected.id);
  await runTransaction(client.db, async tx => {
    const snap = await tx.get(ref);
    requireBankEnvironment(client, scope);
    if (!snap.exists()) throw Error('mandatory/not-found');
    const current = parseMandatory(expected.id, snap.data());
    if (!current.isActive) return;
    if (current.revision !== expected.revision) throw Error('mandatory/conflict');
    tx.update(ref, { isActive: false, revision: current.revision + 1, updatedBy: scope.uid, updatedAt: serverTimestamp() });
  });
}
