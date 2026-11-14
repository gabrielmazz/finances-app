import { parseCategory, categorySupports, validateCategoryInput } from '../domain/categories';

const personal = { kind: 'personal' as const, id: 'owner', uid: 'owner' };

describe('financial category contracts', () => {
  it('preserves legacy identity and leaves missing type unclassified', () => {
    const category = parseCategory('historical-id', 'legacy', { personId: 'owner', name: 'Antiga' }, personal);
    expect(category.id).toBe('historical-id');
    expect(category.usageType).toBeNull();
    expect(categorySupports(category, 'expense')).toBe(false);
    expect(categorySupports(category, 'gain')).toBe(false);
  });
  it('recognizes shared types and does not confuse expense and gain', () => {
    const shared = parseCategory('shared', 'legacy', { personId: 'owner', name: 'Comum', usageType: 'both' }, personal);
    const expense = parseCategory('expense', 'legacy', { personId: 'owner', name: 'Mercado', usageType: 'expense' }, personal);
    expect(categorySupports(shared, 'gain')).toBe(true);
    expect(categorySupports(shared, 'expense')).toBe(true);
    expect(categorySupports(expense, 'gain')).toBe(false);
  });
  it('preserves archived records for history but excludes them from new uses', () => {
    const item = parseCategory('old', 'legacy', { personId: 'owner', name: 'Antiga', usageType: 'gain', deleted: true }, personal);
    expect(item.status).toBe('archived');
    expect(categorySupports(item, 'gain')).toBe(false);
  });
  it('rejects ambiguous or foreign ownership', () => {
    expect(() => parseCategory('x', 'legacy', { name: 'Outra' }, personal)).toThrow();
    expect(() => parseCategory('x', 'legacy', { name: 'Outra', personId: 'other' }, personal)).toThrow();
    expect(() => parseCategory('x', 'legacy', { name: 'Outra', personId: 'owner', groupId: 'other' }, personal)).toThrow();
  });
  it('rejects invalid legacy flags and accepts the original group owner', () => {
    const group = { kind: 'group' as const, id: 'family', uid: 'owner' };
    expect(parseCategory('id with spaces', 'group-root', { personId: 'owner', groupId: 'family', name: 'Grupo', usageType: 'both' }, group).id).toBe('id with spaces');
    const malformed = parseCategory('x', 'legacy', { personId: 'owner', name: 'Malformada', usageType: 'expense', isMandatoryExpense: 'true' }, personal);
    expect(malformed.blocked).toBe(true);
    expect(categorySupports(malformed, 'expense')).toBe(false);
  });
  it('validates names and incompatible mandatory flags', () => {
    const input = { name: ' Mercado ', usageType: 'expense' as const, isMandatoryExpense: true, isMandatoryGain: false, showInBothLists: false, iconFamily: null, iconName: null, iconStyle: null };
    expect(validateCategoryInput(input).name).toBe('Mercado');
    expect(() => validateCategoryInput({ ...input, name: '  ' })).toThrow();
    expect(() => validateCategoryInput({ ...input, isMandatoryGain: true })).toThrow();
  });
});
