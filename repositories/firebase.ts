import type { Firestore } from 'firebase/firestore';
import { collection, doc, getDoc, getDocs, onSnapshot, setDoc, deleteDoc, type DocumentData } from 'firebase/firestore';

import type { EntityRepository, RepositoryObserver, Unsubscribe } from './contracts';
import { createReadScope, recordFirestoreRead, type ReadScope } from '@/utils/firebaseReadAudit';

export class FirestoreEntityRepository<TEntity extends { id: string }> implements EntityRepository<TEntity> {
	constructor(private readonly firestore: Firestore, private readonly collectionName: string) {}

	async get(id: string): Promise<TEntity | null> {
		const startedAt = Date.now();
		const snapshot = await getDoc(doc(this.firestore, this.collectionName, id));
		recordFirestoreRead({ scope: createReadScope(this.collectionName), label: this.collectionName, operation: 'getDoc', documentsDelivered: snapshot.exists() ? 1 : 0, estimatedBillableReads: 1, durationMs: Date.now() - startedAt, origin: snapshot.metadata.fromCache ? 'cache' : 'server' });
		return snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as TEntity) : null;
	}

	async list(): Promise<TEntity[]> {
		const startedAt = Date.now();
		const snapshot = await getDocs(collection(this.firestore, this.collectionName));
		recordFirestoreRead({ scope: createReadScope(this.collectionName), label: this.collectionName, operation: 'getDocs', documentsDelivered: snapshot.size, estimatedBillableReads: Math.max(1, snapshot.size), durationMs: Date.now() - startedAt, origin: snapshot.metadata.fromCache ? 'cache' : 'server' });
		return snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as TEntity));
	}

	async set(entity: TEntity) { await setDoc(doc(this.firestore, this.collectionName, entity.id), entity as DocumentData); }
	async delete(id: string) { await deleteDoc(doc(this.firestore, this.collectionName, id)); }

	subscribe(observer: RepositoryObserver<TEntity[]>): Unsubscribe {
		const scope: ReadScope = createReadScope(this.collectionName, 'listener');
		let initial = true;
		const unsubscribe = onSnapshot(collection(this.firestore, this.collectionName), (snapshot) => {
			const delivered = initial ? snapshot.size : snapshot.docChanges().length;
			recordFirestoreRead({ scope, label: this.collectionName, operation: 'listener', documentsDelivered: delivered, estimatedBillableReads: delivered });
			initial = false;
			observer(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as TEntity)));
		});
		let active = true;
		return () => {
			if (!active) return;
			active = false;
			unsubscribe();
			recordFirestoreRead({ scope, label: this.collectionName, operation: 'unsubscribe', documentsDelivered: 0, estimatedBillableReads: 0 });
		};
	}
}
