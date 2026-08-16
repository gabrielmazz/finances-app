import { MemoryEntityRepository } from '@/repositories/memory';

describe('MemoryEntityRepository', () => {
	it('notifies initial data and stops idempotently after unsubscribe', async () => {
		const repository = new MemoryEntityRepository([{ id: 'one', name: 'One' }]);
		const observer = jest.fn();
		const unsubscribe = repository.subscribe(observer);
		await repository.set({ id: 'two', name: 'Two' });
		unsubscribe(); unsubscribe();
		await repository.delete('one');
		expect(observer).toHaveBeenCalledTimes(2);
	});
});
