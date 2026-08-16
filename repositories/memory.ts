import type { EntityRepository, RepositoryObserver, Unsubscribe } from './contracts';

/** Small deterministic adapter for unit tests; Firestore query/rule semantics stay in emulator tests. */
export class MemoryEntityRepository<TEntity extends { id: string }> implements EntityRepository<TEntity> {
	private readonly entries = new Map<string, TEntity>();
	private readonly observers = new Set<RepositoryObserver<TEntity[]>>();

	constructor(initialValues: TEntity[] = []) {
		initialValues.forEach((value) => this.entries.set(value.id, value));
	}

	async get(id: string) { return this.entries.get(id) ?? null; }
	async list() { return [...this.entries.values()]; }
	async set(entity: TEntity) { this.entries.set(entity.id, entity); this.notify(); }
	async delete(id: string) { this.entries.delete(id); this.notify(); }

	subscribe(observer: RepositoryObserver<TEntity[]>): Unsubscribe {
		let active = true;
		this.observers.add(observer);
		observer([...this.entries.values()]);
		return () => {
			if (!active) return;
			active = false;
			this.observers.delete(observer);
		};
	}

	private notify() {
		const snapshot = [...this.entries.values()];
		this.observers.forEach((observer) => observer(snapshot));
	}
}
