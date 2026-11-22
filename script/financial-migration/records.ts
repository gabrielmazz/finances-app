import { createHash } from 'node:crypto';
import { validCents } from '../../domain/money';
import { validId } from '../../domain/banks';

export type Field = {
  nullValue?: null; stringValue?: string; booleanValue?: boolean;
  integerValue?: string; doubleValue?: number; timestampValue?: string;
  arrayValue?: { values?: Field[] }; mapValue?: { fields?: Fields };
};
export type Fields = Record<string, Field>;
export type Destination = { path: string; fields: Fields };
export type MigrationDocument = Destination & { createTime?: string; updateTime?: string };
export type Scope = { kind: 'personal' | 'group'; id: string };
export type Identity = { uid: string; disabled: boolean; generation?: string };
export const { digest }: { digest(value: unknown): string } = require('../firestore-snapshot.cjs');

export class Review extends Error {}
export const s = (stringValue: string): Field => ({ stringValue });
export const b = (booleanValue: boolean): Field => ({ booleanValue });
export const i = (value: number): Field => ({ integerValue: String(value) });
export const nil: Field = { nullValue: null };
export const array = (values: string[]): Field => ({ arrayValue: values.length ? { values: values.map(s) } : {} });
export const text = (record: MigrationDocument | undefined, key: string) => record?.fields[key]?.stringValue;
export const flag = (record: MigrationDocument, key: string) => record.fields[key]?.booleanValue;
export const idOf = (record: MigrationDocument) => record.path.split('/').at(-1)!;
export const scopeKey = ({ kind, id }: Scope) => kind + ':' + id;
export const target = (scope: Scope, collection: string, id: string) => 'financialContexts/' + scopeKey(scope) + '/' + collection + '/' + id;
export const canonicalId = (record: MigrationDocument) => /^[A-Za-z0-9]{20}$/.test(idOf(record)) ? idOf(record) :
  createHash('sha256').update(record.path).digest('hex').slice(0, 20);

export function cents(record: MigrationDocument, ...keys: string[]) {
  const values = keys.flatMap(key => {
    const field = record.fields[key];
    if (!field || 'nullValue' in field) return [];
    if (!/^-?(0|[1-9]\d*)$/.test(field.integerValue ?? '')) throw Error('invalid-integer-cents');
    const amount = Number(field.integerValue);
    if (!validCents(amount)) throw Error('invalid-integer-cents');
    return [amount];
  });
  if (!values.length || values.some(value => value !== values[0])) throw Error('missing-or-conflicting-cents');
  return values[0];
}

export function optionalDate(record: MigrationDocument, key: string): Field | undefined {
  const field = record.fields[key];
  if (!field || 'nullValue' in field) return undefined;
  const stamp = field.timestampValue;
  if (!stamp || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/.test(stamp) || !Number.isFinite(Date.parse(stamp)))
    throw Error('invalid-timestamp:' + key);
  return { timestampValue: stamp };
}

export function requiredDate(record: MigrationDocument, key: string): Field {
  const date = optionalDate(record, key);
  if (!date) throw Error('missing-timestamp:' + key);
  return date;
}

export function boundedText(value: string | undefined, limit: number, allowEmpty = false) {
  if (value === undefined || (!allowEmpty && !value.trim()) || value.length > limit || /[\x00-\x1f\x7f]/.test(value)) throw Error('invalid-text');
  return value;
}

export function audit(record: MigrationDocument, actor: string): Fields {
  const createdAt = optionalDate(record, 'createdAt') ?? { timestampValue: record.createTime };
  const updatedAt = optionalDate(record, 'updatedAt') ?? { timestampValue: record.updateTime ?? record.createTime };
  if (!createdAt.timestampValue || !updatedAt.timestampValue) throw Error('missing-source-audit-timestamps');
  const createdBy = text(record, 'createdBy'), updatedBy = text(record, 'updatedBy');
  if ((createdBy && !validId(createdBy)) || (updatedBy && !validId(updatedBy))) throw Error('invalid-source-actor');
  return { createdAt, updatedAt, createdBy: s(createdBy ?? actor), updatedBy: s(updatedBy ?? actor) };
}

export function state(record: MigrationDocument, kind: 'archived' | 'cancelled') {
  const status = text(record, 'status');
  const flags = kind === 'archived' ? ['archived', 'deleted', 'isActive'] : ['cancelled', 'deleted'];
  if (flags.some(key => record.fields[key] && !('nullValue' in record.fields[key]) && flag(record, key) === undefined))
    throw Error('invalid-status');
  const date = kind === 'cancelled' ? optionalDate(record, 'cancelledAt') ?? optionalDate(record, 'deletedAt') : undefined;
  const acceptedStatuses = kind === 'archived' ? ['active', kind] : ['posted', 'active', 'paid', 'received', kind];
  if (status !== undefined && !acceptedStatuses.includes(status))
    throw new Review('unknown-operation-status');
  const archived = status === kind || flags.some(key => key === 'isActive' ? flag(record, key) === false : flag(record, key) === true);
  if (status && status !== kind && (archived || date)) throw new Review('conflicting-operation-status');
  return archived || Boolean(date);
}
