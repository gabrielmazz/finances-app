import { db } from '@/FirebaseConfig';
import { collection, getDocs, limit, query, startAfter, where, type QueryDocumentSnapshot } from 'firebase/firestore';

/** [[Despesas Fixas]] / [[Receitas Fixas]]: complete related scope, independent of screen pagination. */
export async function readRecurringDefinitionsFirebase(name: 'mandatoryExpenses' | 'mandatoryGains', personIds: string[]) {
	const chunks = Array.from({ length: Math.ceil(personIds.length / 30) }, (_, index) => personIds.slice(index * 30, index * 30 + 30));
	const pages = await Promise.all(chunks.map(async ids => {
		const documents: QueryDocumentSnapshot[] = [];
		let cursor: QueryDocumentSnapshot | undefined;
		while (true) {
			const snapshot = await getDocs(query(collection(db, name), where('personId', ids.length === 1 ? '==' : 'in', ids.length === 1 ? ids[0] : ids), ...(cursor ? [startAfter(cursor)] : []), limit(200)));
			documents.push(...snapshot.docs);
			if (snapshot.docs.length < 200) return documents;
			const next = snapshot.docs[snapshot.docs.length - 1]!;
			if (next.id === cursor?.id) throw new Error('A consulta de recorrências não avançou; nenhum resultado parcial será apresentado.');
			cursor = next;
		}
	}));
	return pages.flat();
}
