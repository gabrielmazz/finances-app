import { parseCategory } from '../domain/categories';

test('legacy categories retain IDs and unknown types and reject a foreign context', () => {
  const scope = { kind: 'personal' as const, id: 'owner', uid: 'owner' };
  const data = { personId: 'owner', name: 'Antiga' };
  const item = parseCategory('historical-id', 'legacy', data, scope);
  expect(item.id).toBe('historical-id');
  expect(item.usageType).toBeNull();
  expect(() => parseCategory('historical-id', 'legacy', { ...data, personId: 'other' }, scope)).toThrow();
});
