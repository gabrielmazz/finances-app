export type Unsubscribe = () => void;

export type RepositoryObserver<T> = (value: T) => void;

export interface AuthSession<TUser> {
	currentUser(): TUser | null;
	subscribe(observer: RepositoryObserver<TUser | null>, onError?: (error: Error) => void): Unsubscribe;
}

export interface EntityRepository<TEntity extends { id: string }> {
	get(id: string): Promise<TEntity | null>;
	list(): Promise<TEntity[]>;
	set(entity: TEntity): Promise<void>;
	delete(id: string): Promise<void>;
	subscribe(observer: RepositoryObserver<TEntity[]>): Unsubscribe;
}
