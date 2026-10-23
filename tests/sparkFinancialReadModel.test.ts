import { buildSparkFinancialReadEvents, getSparkCurrentOrdinaryMovements, getSparkMovementResolutionIndex, type SparkReadRecord } from '@/utils/sparkFinancialReadModel';

const at = new Date('2026-09-10T12:00Z');
const record = (id: string, kind: string, data: Record<string, unknown> = {}): SparkReadRecord => ({ id, data: { kind, actorId: 'owner', createdAt: at, ...data } });
test('correção conserva inverso e substituto na nova data, nas contas e categorias correspondentes', () => {
  const original = record('old', 'income', { accountId: 'bank-a', differenceInCents: 1000, categoryId: 'old-category' });
  const corrected = record('edit', 'movement_correction', { originalOperationId: 'old', originalSource: 'live', movementKind: 'income',
    originalDeltaInCents: 1000, differenceInCents: 1500, fromAccountId: 'bank-a', toAccountId: 'bank-b', categoryId: 'new-category', effectiveAt: new Date('2026-10-10Z') });
  const rows = buildSparkFinancialReadEvents('g', [original, corrected]);
  expect(rows.filter(row => row.operationId === 'edit')).toEqual([
    expect.objectContaining({ component: 'inverse', accountId: 'bank-a', deltaInCents: -1000, categoryId: 'old-category', resolvesOperationId: 'old', executionReference: null }),
    expect.objectContaining({ component: 'replacement', accountId: 'bank-b', deltaInCents: 1500, categoryId: 'new-category', executionReference: { source: 'live', operationId: 'edit', family: 'ordinary' } }),
  ]);
  expect(rows.filter(row => row.operationId === 'edit').every(row => row.effectiveAt.getTime() === new Date('2026-10-10Z').getTime())).toBe(true);
});
test('ajuste substituído conserva as duas datas, inclusive quando a consulta termina antes da nova data', () => {
  const rows = buildSparkFinancialReadEvents('g', [record('replace', 'adjustment_replacement', { accountId: 'bank', replacesOperationId: 'old', originalDifferenceInCents: 1000,
    originalEffectiveAt: new Date('2026-08-01Z'), effectiveAt: new Date('2026-10-01Z'), differenceInCents: 2000 })]);
  expect(rows.filter(row => row.effectiveAt < new Date('2026-09-01Z')).map(row => row.deltaInCents)).toEqual([-1000]);
  expect(rows[0]).toMatchObject({ resolvesOperationId: 'old', economicKind: null }); expect(rows[1]).toMatchObject({ deltaInCents: 2000, economicKind: null });
});
test('transferências e seus estornos preservam as pernas sem entrar em receitas/despesas', () => {
  const rows = buildSparkFinancialReadEvents('g', [record('pair', 'transfer', { fromAccountId: 'a', toAccountId: 'b', amountInCents: 1000 }),
    record('undo', 'transfer_reversal', { fromAccountId: 'b', toAccountId: 'a', amountInCents: 1000, reversesOperationId: 'pair' })]);
  expect(rows.filter(row => row.accountId === 'a').reduce((total, row) => total + row.deltaInCents, 0)).toBe(0);
  expect(rows.every(row => row.economicKind === null)).toBe(true); expect(rows.filter(row => row.operationId === 'undo').every(row => row.executionReference === null)).toBe(true);
});
test('abertura financiada separa principal aplicado e referência observada sem inventar renda', () => {
  const rows = buildSparkFinancialReadEvents('g', [record('open', 'investment_opening', { fromAccountId: 'bank', toAccountId: 'investment', amountInCents: 1000,
    openingBalanceInCents: 1100, valuationDifferenceInCents: 100 })]);
  expect(rows.find(row => row.accountId === 'bank')).toMatchObject({ deltaInCents: -1000, kind: 'investment_deposit' });
  expect(rows.find(row => row.component === 'principal')).toMatchObject({ deltaInCents: 1000, referenceBalanceInCents: null, term: 'delta' });
  expect(rows.find(row => row.component === 'reference')).toMatchObject({ deltaInCents: 100, referenceBalanceInCents: 1100, term: 'reference' });
  expect(rows.every(row => row.economicKind === null)).toBe(true);
});
test('edição do principal usa a diferença assinada do receipt, sem atribuir novamente o principal inteiro', () => {
  const rows = buildSparkFinancialReadEvents('g', [record('edit', 'investment_principal_update', { fromAccountId: 'bank', toAccountId: 'investment',
    principalInCents: 800, previousPrincipalInCents: 1000, amountInCents: -200 })]);
  expect(rows.map(row => [row.accountId, row.deltaInCents])).toEqual([['bank', 200], ['investment', -200]]);
  expect(rows.every(row => row.kind === 'principal_change' && row.economicKind === null)).toBe(true);
});
test('troca de financiamento conserva três contas e diferença de principal', () => {
  const rows = buildSparkFinancialReadEvents('g', [record('change', 'investment_funding_change', { fromAccountId: 'new-bank', refundAccountId: 'old-bank',
    toAccountId: 'investment', previousPrincipalInCents: 1000, principalInCents: 1500, differenceInCents: 500 })]);
  expect(new Map(rows.map(row => [row.accountId, row.deltaInCents]))).toEqual(new Map([['new-bank', -1500], ['old-bank', 1000], ['investment', 500]]));
  expect(rows.reduce((sum, row) => sum + row.deltaInCents, 0)).toBe(0);
});
test.each(['bank_opening', 'account_count', 'investment_sync', 'monthly_opening'])('%s é referência e não receita pelo saldo contado', kind => {
  const rows = buildSparkFinancialReadEvents('g', [record('reference', kind, { accountId: 'bank', openingBalanceInCents: 10000, targetBalanceInCents: 10000, differenceInCents: 200 })]);
  expect(rows[0]).toMatchObject({ referenceBalanceInCents: 10000, term: 'reference', economicKind: null, executionReference: null });
});
test('efetivação recorrente é econômica e receipt importado auxiliar não duplica sua perna', () => {
  const rows = buildSparkFinancialReadEvents('g', [record('settle', 'recurring_settlement', { accountId: 'bank', recurringType: 'expense', differenceInCents: -1000, categoryId: 'rent' }),
    record('old-settle-link', 'imported_recurring_settlement', { accountId: 'bank', differenceInCents: -500 })]);
  expect(rows).toHaveLength(1); expect(rows[0]).toMatchObject({ economicKind: 'expense', deltaInCents: -1000, categoryId: 'rent', executionReference: null });
});
test('nós importados aparecem uma vez e usam a identidade executável em vez do ID de apresentação', () => {
  const node = record('node-a', 'imported_movement', { accountId: 'bank', differenceInCents: 1000, sourcePath: 'ledgerTransactions/source' });
  const identity = record('imported-source', 'income', { sourcePath: 'ledgerTransactions/source', historyNodes: [{ operationId: 'node-a', accountId: 'bank' }], ordinaryResolutionAllowed: true,
    readModel: { schemaVersion: 1, groupId: 'g', kind: 'income', effectiveAt: at, actorId: 'owner', categoryId: 'category', legs: [{ accountId: 'bank', deltaInCents: 1000 }, { accountId: null, deltaInCents: -1000 }], reversesIdentityId: null } });
  const rows = buildSparkFinancialReadEvents('g', [node], [identity]);
  expect(rows).toHaveLength(1); expect(rows[0]).toMatchObject({ deltaInCents: 1000, economicKind: 'income', categoryId: 'category', originalOperationId: 'imported-source',
    executionReference: { source: 'imported', operationId: 'imported-source', family: 'ordinary' } });
  expect(rows[0]!.id).not.toBe(rows[0]!.executionReference!.operationId);
});
test('origens ausentes, grupos divergentes, eventos desconhecidos e centavos inválidos não viram totais parciais', () => {
  expect(() => buildSparkFinancialReadEvents('g', [record('unknown', 'future-money')])).toThrow(/adaptador/);
  expect(() => buildSparkFinancialReadEvents('g', [record('invalid', 'expense', { accountId: 'bank', differenceInCents: 0.5 })])).toThrow(/inválido/);
  expect(() => buildSparkFinancialReadEvents('g', [record('node', 'imported_movement', { accountId: 'bank', differenceInCents: 1000, sourcePath: 'ledgerTransactions/source' })])).toThrow(/preparação/);
  expect(() => buildSparkFinancialReadEvents('g', [record('undo', 'movement_reversal', { accountId: 'bank', movementKind: 'income', differenceInCents: -1000, originalOperationId: 'missing' })])).toThrow(/ausente/);
});

test('lista vigente mantém só o último substituto e respeita a data de resolução', () => {
  const original = record('old', 'income', { accountId: 'bank', differenceInCents: 1000 });
  const correction = (id: string, originalOperationId: string, old: number, next: number, day: string) => record(id, 'movement_correction', {
    originalSource: 'live', originalOperationId, movementKind: 'income', fromAccountId: 'bank', toAccountId: 'bank', originalDeltaInCents: old,
    differenceInCents: next, effectiveAt: new Date(day) });
  const rows = buildSparkFinancialReadEvents('g', [original, correction('first', 'old', 1000, 1500, '2026-09-12T12:00Z'),
    correction('last', 'first', 1500, 2000, '2026-09-15T12:00Z')]);
  expect(getSparkCurrentOrdinaryMovements(rows).map(row => row.id)).toEqual(['last:replacement']);
  expect(getSparkCurrentOrdinaryMovements(rows, new Date('2026-09-13Z')).map(row => row.id)).toEqual(['first:replacement']);
  expect(getSparkCurrentOrdinaryMovements(rows, new Date('2026-09-11Z')).map(row => row.id)).toEqual(['old:movement']);
});

test('estorno remove o alvo da lista vigente sem remover seus termos econômicos do journal', () => {
  const rows = buildSparkFinancialReadEvents('g', [record('old', 'expense', { accountId: 'bank', differenceInCents: -1000 }),
    record('undo', 'movement_reversal', { originalSource: 'live', originalOperationId: 'old', movementKind: 'expense', accountId: 'bank', differenceInCents: 1000 })]);
  expect(getSparkCurrentOrdinaryMovements(rows)).toEqual([]); expect(rows).toHaveLength(2);
  expect(getSparkMovementResolutionIndex(rows).resolvedBy(rows[0].executionReference!)).toBe('undo');
});

test('claims importados não resolvem um ID igual do namespace nativo', () => {
  const identity = record('same', 'income', { sourcePath: 'ledgerTransactions/old', historyNodes: [{ operationId: 'node', accountId: 'bank' }], ordinaryResolutionAllowed: true,
    readModel: { schemaVersion: 1, groupId: 'g', kind: 'income', effectiveAt: at, legs: [{ accountId: 'bank', deltaInCents: 1000 }, { accountId: null, deltaInCents: -1000 }] } });
  const rows = buildSparkFinancialReadEvents('g', [record('same', 'income', { accountId: 'bank', differenceInCents: 2000 }),
    record('node', 'imported_movement', { accountId: 'bank', differenceInCents: 1000, sourcePath: 'ledgerTransactions/old' }),
    record('undo', 'movement_reversal', { originalSource: 'imported', originalOperationId: 'same', movementKind: 'income', accountId: 'bank', differenceInCents: -1000 })], [identity]);
  expect(getSparkCurrentOrdinaryMovements(rows).map(row => row.id)).toEqual(['same:movement']);
});

test('resolução duplicada divergente e corte inválido não retornam alvos editáveis', () => {
  const rows = buildSparkFinancialReadEvents('g', [record('old', 'income', { accountId: 'bank', differenceInCents: 1000 }),
    ...['undo-a', 'undo-b'].map(id => record(id, 'movement_reversal', { originalSource: 'live', originalOperationId: 'old', movementKind: 'income', accountId: 'bank', differenceInCents: -1000 }))]);
  expect(() => getSparkCurrentOrdinaryMovements(rows)).toThrow(/mais de uma/);
  expect(() => getSparkCurrentOrdinaryMovements([], new Date('invalid'))).toThrow(/inválida/);
});
