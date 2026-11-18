import { createHash } from 'node:crypto';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, documentId, getDocs, limit, orderBy, query, runTransaction, startAfter, where, type Firestore, type QueryDocumentSnapshot, type DocumentData } from 'firebase/firestore';

const GROUP_FIELDS = ['groupId', 'financialGroupId', 'ledgerGroupId'] as const;
const SOURCES = ['banks', 'tags', 'gains', 'expenses', 'cashRescues'] as const;
type Source = typeof SOURCES[number];

/** Emulator-only, bounded discovery. Never modifies legacy documents or grants. */
export async function prepareLegacyReadIndex(env: RulesTestEnvironment, uid: string) {
	if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8089' || !/^[A-Za-z0-9_-]{1,128}$/.test(uid)) throw Error('legacy-index/emulator-only');
	const counts = { scanned: 0, created: 0, existing: 0, skipped: 0, conflicts: 0 };
	await env.withSecurityRulesDisabled(async context => {
		const db = context.firestore() as unknown as Firestore;
		if (db.app.options.projectId !== 'demo-lumus-foundation') throw Error('legacy-index/emulator-only');
		for (const source of SOURCES) {
			let cursor: QueryDocumentSnapshot<DocumentData> | undefined;
			do {
				const page = await getDocs(query(collection(db, source), where('personId', '==', uid), orderBy(documentId()), ...(cursor ? [startAfter(cursor)] : []), limit(20)));
				for (const item of page.docs) {
					counts.scanned++;
					const result = await indexOne(db, uid, source, item.id);
					counts[result]++;
				}
				cursor = page.size === 20 ? page.docs[page.docs.length - 1] : undefined;
			} while (cursor);
		}
	});
	return counts;
}

async function indexOne(db: Firestore, uid: string, source: Source, id: string): Promise<'created' | 'existing' | 'skipped' | 'conflicts'> {
	const original = doc(db, source, id), context = `personal:${uid}`;
	const indexId = source === 'banks' || source === 'tags' ? id : createHash('sha256').update(source + '\0' + id).digest('hex');
	const indexName = source === 'banks' ? 'legacyBankReadIndex' : source === 'tags' ? 'legacyCategoryIndex' : 'legacyMovementReadIndex';
	const index = doc(db, 'financialContexts', context, indexName, indexId);
	return runTransaction(db, async tx => {
		const [sourceDoc, oldIndex] = await Promise.all([tx.get(original), tx.get(index)]);
		const data = sourceDoc.data();
		if (!data || data.personId !== uid || GROUP_FIELDS.some(field => data[field] != null) ||
			(source !== 'tags' && GROUP_FIELDS.every(field => Object.prototype.hasOwnProperty.call(data, field)))) return 'skipped';
		let pointer: Record<string, unknown>;
		if (source === 'banks') pointer = { bankId: id };
		else if (source === 'tags') pointer = { tagId: id };
		else {
			if (typeof data.bankId !== 'string' || !data.bankId || data.bankId.includes('/') || typeof data.date?.toMillis !== 'function') return 'skipped';
			pointer = { source, legacyId: id, bankId: data.bankId, date: data.date };
		}
		if (oldIndex.exists()) {
			const old = oldIndex.data();
			const same = Object.keys(old).length === Object.keys(pointer).length && Object.entries(pointer).every(([key, value]) =>
				key === 'date' ? old[key]?.toMillis?.() === (value as { toMillis(): number }).toMillis() : old[key] === value);
			return same ? 'existing' : 'conflicts';
		}
		tx.set(index, pointer);
		return 'created';
	});
}

if (require.main === module) {
	(async () => {
		if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8089') throw Error('legacy-index/emulator-only');
		const env = await initializeTestEnvironment({ projectId: 'demo-lumus-foundation', firestore: { host: '127.0.0.1', port: 8089 } });
		try { console.log(JSON.stringify(await prepareLegacyReadIndex(env, process.argv[2] || ''))); }
		finally { await env.cleanup(); }
	})().catch(error => { console.error(error instanceof Error ? error.message : 'legacy-index/failed'); process.exitCode = 1; });
}
