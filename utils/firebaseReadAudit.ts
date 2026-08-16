export type ReadTrigger = 'mount' | 'manual-refresh' | 'pagination' | 'listener' | 'mutation';
export type ReadScope = Readonly<{ id: string; flow: string; trigger: ReadTrigger }>;
export type ReadAuditEntry = Readonly<{
	scope: ReadScope;
	label: string;
	operation: 'getDoc' | 'getDocs' | 'listener' | 'unsubscribe';
	documentsDelivered: number;
	estimatedBillableReads: number;
	durationMs?: number;
	origin?: 'cache' | 'server' | 'unknown';
}>;
export type ReadReport = Readonly<{ entries: ReadAuditEntry[]; operations: number; documentsDelivered: number; estimatedBillableReads: number }>;

let sequence = 0;
let entries: ReadAuditEntry[] = [];
export const createReadScope = (flow: string, trigger: ReadTrigger = 'mount'): ReadScope => ({ id: `${flow}-${++sequence}`, flow, trigger });
export const recordFirestoreRead = (entry: ReadAuditEntry) => { entries.push(entry); };
export const getReadReport = (): ReadReport => ({
	entries: [...entries], operations: entries.filter((entry) => entry.operation !== 'unsubscribe').length,
	documentsDelivered: entries.reduce((sum, entry) => sum + entry.documentsDelivered, 0),
	estimatedBillableReads: entries.reduce((sum, entry) => sum + entry.estimatedBillableReads, 0),
});
export const resetReadReport = () => { entries = []; sequence = 0; };
