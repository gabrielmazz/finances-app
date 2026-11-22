import { planMigration, type MigrationDocument } from '../script/financial-migration/plan';
import { digest } from '../script/financial-migration/records';
import { reviewExceptions } from '../script/financial-migration/review';

const day = { timestampValue: '2026-01-14T02:03:04.123456Z' };
const bankId = 'ABCDEFGHIJKLMNOPQRST';
const movementId = 'ZXCVBNMASDFGHJKLQWER';
const s = (stringValue: string) => ({ stringValue });
const i = (integerValue: number) => ({ integerValue: String(integerValue) });
const record = (path: string, fields: MigrationDocument['fields']): MigrationDocument => ({
  path, fields, createTime: day.timestampValue, updateTime: day.timestampValue,
});
const bank = record(`banks/${bankId}`, { personId: s('owner'), name: s('Banco A') });
const bankEvidence = record(`_bankScopes/${bankId}`, { scopeKind: s('personal'), scopeId: s('owner') });
const tag = record('tags/refeicao', { personId: s('owner'), name: s('Refeição') });
const tagEvidence = record('_categoryScopes/refeicao', { scopeKind: s('personal'), scopeId: s('owner') });
const expense = record(`expenses/${movementId}`, { personId: s('owner'), name: s('Almoço'), date: day,
  valueInCents: i(3799), bankId: s(bankId), tagId: s('refeicao') });
const identity = [{ uid: 'owner', disabled: false }];

it('contabiliza a origem preservada e aplica a exceção apenas à revisão comprovada', () => {
  const missingCategory = { ...expense, fields: { ...expense.fields, tagId: s('missing') } };
  const monthly = record('monthlyBalances/archive', {});
  const documents = [bank, bankEvidence, tag, tagEvidence, missingCategory, monthly];
  const exception = { path: missingCategory.path, sourceHash: digest(missingCategory),
    evidence: 'A categoria não aparece na captura nem nos backups anteriores.' };
  const plan = planMigration(documents, identity, [], [], [exception]);

  expect(plan.counts).toEqual({ AUTO_MIGRATABLE: 2, PRESERVED: 3, PRESERVED_EXCEPTION: 1 });
  expect(plan.entries.find(item => item.path === expense.path)).toMatchObject({
    classification: 'PRESERVED_EXCEPTION', reason: 'missing-category-reference',
    destinations: [], evidence: [exception.evidence],
  });
  expect(plan.steps.flatMap(step => step.destinations)).toHaveLength(2);
  expect(() => planMigration(documents, identity, [], [], [{ ...exception, sourceHash: digest(expense) }]))
    .toThrow('exception-does-not-match-pending-source');
});

it('copia a conta pendente, a categoria sem tipo e o histórico sem criar saldo', () => {
  const plan = planMigration([expense, tagEvidence, bank, bankEvidence, tag], identity);
  const writes = plan.steps.flatMap(step => step.destinations);
  const account = writes.find(doc => doc.path.endsWith(`bankAccounts/${bankId}`));
  expect(account?.fields.initialBalanceCents).toBeUndefined();
  expect(writes.some(doc => doc.path.includes('accountOpenings'))).toBe(false);
  expect(writes.find(doc => doc.path.endsWith('categories/refeicao'))?.fields.usageType).toEqual({ nullValue: null });
  expect(writes.find(doc => doc.path.endsWith(`movements/${movementId}`))?.fields).toMatchObject({
    date: day, amountCents: i(3799), accountId: s(bankId), categoryId: s('refeicao'), categorySource: s('new'),
  });
  expect(plan.financialImpact.balanceAdjustmentCents).toBe('0');
});

it('mantém em revisão o banco contraditório e seus lançamentos dependentes', () => {
  const conflict = record(bankEvidence.path, { scopeKind: s('personal'), scopeId: s('other') });
  const plan = planMigration([bank, conflict, tag, tagEvidence, expense], [...identity, { uid: 'other', disabled: false }]);
  expect(plan.entries.find(item => item.path === bank.path)?.classification).toBe('REQUIRES_REVIEW');
  expect(plan.entries.find(item => item.path === expense.path)?.classification).toBe('REQUIRES_REVIEW');
  expect(plan.steps.flatMap(step => step.destinations).map(doc => doc.path)).toEqual(['financialContexts/personal:owner/categories/refeicao']);
});

it('classifica registro cancelado, centavos ambíguos e referência ausente sem alterar saldos', () => {
  const fixture = [bank, bankEvidence, tag, tagEvidence,
    record('expenses/cancelled', { ...expense.fields, status: s('cancelled'), cancelledAt: day }),
    record('expenses/unpaid', { ...expense.fields, name: s('Não pago'), isPaid: { booleanValue: false } }),
    record('expenses/fractional', { ...expense.fields, name: s('Valor ambíguo'), valueInCents: { doubleValue: 12.346 } }),
    record('expenses/missing', { ...expense.fields, tagId: s('ausente') }),
  ];
  const plan = planMigration(fixture, identity);
  expect(plan.entries.filter(entry => entry.kind === 'movement').map(entry => entry.classification))
    .toEqual(['AUTO_MIGRATABLE', 'INVALID_SOURCE', 'REQUIRES_REVIEW', 'REQUIRES_REVIEW']);
  expect(plan.steps.flatMap(step => step.destinations).find(doc => doc.fields.status?.stringValue === 'cancelled')?.fields.cancelledAt).toEqual(day);
  expect(plan.financialImpact.historyExpenseCents).toBe('0');
});

it('não aceita um canônico preexistente em contexto contraditório', () => {
  const doc = record('financialContexts/personal:owner/categories/categoria', {
    scopeKind: s('personal'), scopeId: s('outro'), schemaVersion: i(1), name: s('Categoria'), status: s('active'), usageType: s('both'),
  });
  const plan = planMigration([doc], identity);
  expect(plan.entries[0]).toMatchObject({ classification: 'REQUIRES_REVIEW', reason: 'canonical-scope-or-schema-mismatch' });
});

it('reconhece vínculo protegido atual de grupo e mantém a revogação', () => {
  const generation = 'synthetic-generation', group = 'grupo';
  const groupBank = record('financialGroups/grupo/accounts/' + bankId, { name: s('Banco compartilhado'), personId: s('owner') });
  const groupDoc = record('financialGroups/grupo', { status: s('active') });
  const grant = (enabled: boolean) => record('_authorizations/owner', {
    generation: s(generation), enabled: { booleanValue: enabled },
    groups: { mapValue: { fields: { [group]: s('admin') } } }, readOwners: { arrayValue: {} },
  });
  const identities = [{ uid: 'owner', disabled: false, generation }];
  expect(planMigration([groupBank, groupDoc, grant(true)], identities).entries.find(entry => entry.path === groupBank.path)?.context)
    .toBe('group:grupo');
  expect(planMigration([groupBank, groupDoc, grant(false)], identities).entries.find(entry => entry.path === groupBank.path)?.classification)
    .toBe('REQUIRES_REVIEW');
});

it('trata duas origens para a mesma categoria como duplicidade dos dois lados', () => {
  const generation = 'synthetic-generation';
  const groupTag = record('financialGroups/grupo/tags/refeicao', { ...tag.fields, groupId: s('grupo') });
  const rootTag = record(tag.path, { ...tag.fields, groupId: s('grupo') });
  const protectedTag = record(tagEvidence.path, { scopeKind: s('group'), scopeId: s('grupo') });
  const groupDoc = record('financialGroups/grupo', { status: s('active') });
  const grant = record('_authorizations/owner', {
    generation: s(generation), enabled: { booleanValue: true },
    groups: { mapValue: { fields: { grupo: s('admin') } } }, readOwners: { arrayValue: {} },
  });
  const plan = planMigration([groupTag, rootTag, protectedTag, groupDoc, grant], [{ uid: 'owner', disabled: false, generation }]);
  expect(plan.counts.DUPLICATE_CANDIDATE).toBe(2);
  expect(plan.steps).toHaveLength(0);
});

it('preserva caixa histórico explicitamente sem banco e mantém a situação contraditória em revisão', () => {
  const cash = record('expenses/cash', { ...expense.fields, bankId: { nullValue: null }, moneyFormat: { booleanValue: true } });
  const conflict = record('expenses/cash-with-bank', { ...expense.fields, moneyFormat: { booleanValue: true } });
  const plan = planMigration([bank, bankEvidence, tag, tagEvidence, cash, conflict], identity);
  const copied = plan.steps.find(step => step.sources.includes(cash.path));
  expect(copied?.destinations[0].fields).toMatchObject({ accountId: { nullValue: null }, moneyFormat: { booleanValue: true } });
  expect(plan.entries.find(entry => entry.path === conflict.path)?.classification).toBe('REQUIRES_REVIEW');
  expect(plan.financialImpact).toMatchObject({ historyExpenseCents: '3799', historicalNetByAccountCents: {} });
});

it('recupera o valor total pelos centavos e quantidade registrados quando o contrato legado não tem o total', () => {
  const template = record('mandatoryExpenses/installment', {
    name: s('Despesa parcelada'), personId: s('owner'), tagId: s('refeicao'), valueInCents: i(3099), dueDay: i(12),
    installmentTotal: i(3), installmentStartDate: day,
  });
  const plan = planMigration([tag, tagEvidence, template], identity);
  expect(plan.steps.find(step => step.sources.includes(template.path))?.destinations[0].fields.installmentTotalValueInCents).toEqual(i(9297));
  const malformed = record(template.path, { ...template.fields, installmentTotalValueInCents: s('9297') });
  expect(planMigration([tag, tagEvidence, malformed], identity).entries.find(entry => entry.path === template.path)?.reason)
    .toBe('invalid-template-installment-total');
});

it('separa projeções de revisão dos destinos válidos e não libera dependentes de outro titular', () => {
  const other = { uid: 'other', disabled: false };
  const foreign = record('expenses/foreign', { ...expense.fields, personId: s(other.uid) });
  const unrelated = record('expenses/unlinked', { ...expense.fields, bankId: s('missing-bank') });
  const documents = [bank, tag, tagEvidence, expense, foreign, unrelated];
  const identities = [...identity, other];
  const plan = planMigration(documents, identities);
  const report = reviewExceptions(documents, identities, plan, []);
  expect(report.decisions).toEqual([expect.objectContaining({ path: bank.path, sourceHash: digest(bank),
    dependents: [foreign.path, expense.path].sort() })]);
  expect(report.summary.forecast).toMatchObject({ potentiallyResolvedOrigins: 1, potentiallyResolvedDependents: 1,
    pendingAfterHypothesis: 2, reasons: { 'personal-owner-mismatch': 1, 'missing-bank-reference': 1 } });
  expect(plan.steps.flatMap(step => step.sources)).toEqual([tag.path]);
});

it('preserva a categoria de outro login como referência arquivada somente para lançamentos conciliados com a conta revisada', () => {
  const other = { uid: 'other', disabled: false };
  const crossedCategory = record(tag.path, { ...tag.fields, personId: s(other.uid) });
  const crossedBinding = record(tagEvidence.path, { ...tagEvidence.fields, scopeId: s(other.uid) });
  const another = record('expenses/another', { ...expense.fields, name: s('Reenvio distinto') });
  const wrongUid = record('expenses/foreign', { ...expense.fields, personId: s(other.uid), name: s('Autor diferente') });
  const noBank = record('expenses/no-bank', { ...expense.fields, bankId: { nullValue: null }, name: s('Sem conta') });
  const documents = [bank, bankEvidence, crossedCategory, crossedBinding, expense, another, wrongUid, noBank];
  const choice = { bankPath: bank.path, bankHash: digest(bank), categoryPath: crossedCategory.path,
    categoryHash: digest(crossedCategory), evidence: 'Conciliação aprovada para este banco e esta categoria' };
  const earlier = planMigration(documents, [...identity, other]);
  expect(earlier.entries.find(item => item.path === expense.path)?.classification).toBe('REQUIRES_REVIEW');
  const plan = planMigration(documents, [...identity, other], [], [choice]);
  const source = 'financialContexts/personal:other/categories/refeicao';
  const copy = 'financialContexts/personal:owner/categories/refeicao';
  const writes = plan.steps.flatMap(step => step.destinations);
  expect(writes.find(doc => doc.path === source)?.fields.status).toEqual(s('active'));
  expect(writes.filter(doc => doc.path === copy)).toEqual([expect.objectContaining({ fields: expect.objectContaining({
    status: s('archived'), historicalSourcePath: s(crossedCategory.path), scopeId: s('owner'),
  }) })]);
  expect(plan.entries.filter(item => [expense.path, another.path].includes(item.path)).map(item => item.classification))
    .toEqual(['AUTO_MIGRATABLE', 'AUTO_MIGRATABLE']);
  expect(plan.entries.filter(item => [wrongUid.path, noBank.path].includes(item.path)).map(item => item.classification))
    .toEqual(['REQUIRES_REVIEW', 'REQUIRES_REVIEW']);
  expect(plan.financialImpact.balanceAdjustmentCents).toBe('0');
  expect(() => planMigration(documents, [...identity, other], [], [{ ...choice, bankHash: 'stale' }])).toThrow('category-review-does-not-match-source');
});

it('preserva a observação histórica original ao adaptar quebras de linha e tabulações à exibição', () => {
  const note = 'Primeira linha\r\nSegunda linha\tDetalhe';
  const original = record(expense.path, { ...expense.fields, explanation: s(note) });
  const plan = planMigration([bank, bankEvidence, tag, tagEvidence, original], identity);
  const projected = plan.steps.find(step => step.sources.includes(original.path))?.destinations[0];
  expect(projected?.fields).toMatchObject({
    explanation: s('Primeira linha Segunda linha Detalhe'), historicalExplanation: s(note),
  });
  const malformed = record(expense.path, { ...expense.fields, explanation: s('Texto\x00inválido') });
  expect(planMigration([bank, bankEvidence, tag, tagEvidence, malformed], identity).entries.find(entry => entry.path === malformed.path)?.reason)
    .toBe('invalid-text');
});

it('concilia apenas o dinheiro confirmado no grupo, com categoria arquivada e zero efeito bancário', () => {
  const other = { uid: 'other', disabled: false };
  const category = record(tag.path, { ...tag.fields, personId: s(other.uid) });
  const binding = record(tagEvidence.path, { ...tagEvidence.fields, scopeId: s(other.uid) });
  const cash = record('expenses/paid-in-cash', { ...expense.fields, bankId: { nullValue: null }, moneyFormat: { booleanValue: true } });
  const unreviewed = record('expenses/unreviewed-cash', { ...cash.fields, name: s('Outro pagamento em dinheiro') });
  const documents = [category, binding, cash, unreviewed];
  const identities = [...identity, other];
  const decision = { categoryPath: category.path, categoryHash: digest(category), cashOwnerUid: 'owner',
    cashMovements: [{ path: cash.path, sourceHash: digest(cash) }], evidence: 'Titular confirmou o grupo de lançamentos em dinheiro' };
  const plan = planMigration(documents, identities, [], [decision]);
  const projected = plan.steps.flatMap(step => step.destinations);
  expect(projected.find(item => item.path === 'financialContexts/personal:owner/categories/refeicao')?.fields.status).toEqual(s('archived'));
  expect(projected.find(item => item.fields.historicalSourcePath?.stringValue === cash.path)?.fields).toMatchObject({
    accountId: { nullValue: null }, categoryId: s('refeicao'), moneyFormat: { booleanValue: true },
  });
  expect(plan.entries.find(item => item.path === unreviewed.path)?.reason).toBe('personal-owner-mismatch');
  expect(plan.financialImpact).toMatchObject({ balanceAdjustmentCents: '0', historicalNetByAccountCents: {} });
  expect(() => planMigration(documents, identities, [], [{ ...decision, cashOwnerUid: other.uid }]))
    .toThrow('cash-category-review-does-not-match-source');
});

it('projeta apenas o lançamento confirmado no banco de outro login e conserva a autoria histórica', () => {
  const other = { uid: 'second', disabled: false };
  const secondBank = record(bank.path, { ...bank.fields, personId: s(other.uid) });
  const secondBankEvidence = record(bankEvidence.path, { ...bankEvidence.fields, scopeId: s(other.uid) });
  const pendingBill = record('expenses/uncertain-bill', { ...expense.fields, name: s('Conta a conferir') });
  const documents = [secondBank, secondBankEvidence, tag, tagEvidence, expense, pendingBill];
  const reviewed = { bankPath: secondBank.path, bankHash: digest(secondBank), categoryPath: tag.path, categoryHash: digest(tag),
    bankMovements: [{ path: expense.path, sourceHash: digest(expense) }], evidence: 'Movimentação confirmada no histórico do banco indicado' };
  const plan = planMigration(documents, [...identity, other], [], [reviewed]);
  const moved = plan.entries.find(entry => entry.path === expense.path);
  expect(moved).toMatchObject({ classification: 'AUTO_MIGRATABLE', context: 'personal:second', ownerUid: 'second' });
  const transfer = plan.steps.flatMap(step => step.destinations)
    .find(doc => doc.path === 'financialContexts/personal:second/movements/' + movementId);
  expect(transfer?.fields).toMatchObject({ scopeId: s('second'), accountId: s(bankId), categoryId: s('refeicao'),
    createdBy: s('owner'), updatedBy: s('owner'), historicalSourcePath: s(expense.path) });
  expect(plan.entries.find(entry => entry.path === pendingBill.path)?.classification).toBe('REQUIRES_REVIEW');
  expect(plan.financialImpact.balanceAdjustmentCents).toBe('0');
  expect(() => planMigration(documents, [...identity, other], [], [
    { ...reviewed, bankMovements: [{ path: expense.path, sourceHash: 'stale' }] },
  ])).toThrow('bank-movement-review-does-not-match-source');
});

it('mantém a categoria histórica do último pagamento em dinheiro e usa a categoria ativa escolhida para o modelo', () => {
  const other = { uid: 'other', disabled: false };
  const original = record(tag.path, { ...tag.fields, personId: s(other.uid) });
  const binding = record(tagEvidence.path, { ...tagEvidence.fields, scopeId: s(other.uid) });
  const chosen = record('tags/futura', { personId: s('owner'), name: s('Categoria futura de teste'), usageType: s('expense'),
    isMandatoryExpense: { booleanValue: true } });
  const chosenBinding = record('_categoryScopes/futura', tagEvidence.fields);
  const payment = record(expense.path, { ...expense.fields, bankId: { nullValue: null }, moneyFormat: { booleanValue: true } });
  const model = record('mandatoryExpenses/' + 'A'.repeat(20), {
    personId: s('owner'), name: s('Modelo ativo'), tagId: s('refeicao'), valueInCents: i(3799), dueDay: i(14),
    lastPaymentCycle: s('2026-01'), lastPaymentExpenseId: s(movementId), lastPaymentDate: day,
  });
  const documents = [original, binding, chosen, chosenBinding, payment, model];
  const identities = [...identity, other];
  const cashDecision = { categoryPath: original.path, categoryHash: digest(original), cashOwnerUid: 'owner',
    cashMovements: [{ path: payment.path, sourceHash: digest(payment) }], evidence: 'Titular confirmou o pagamento em dinheiro' };
  const future = { categoryPath: chosen.path, categoryHash: digest(chosen), templatePath: model.path, templateHash: digest(model),
    evidence: 'Titular escolheu a categoria ativa para os próximos ciclos' };
  const plan = planMigration(documents, identities, [], [cashDecision, future]);
  const batch = plan.steps.find(step => step.sources.includes(model.path));
  expect(batch?.sources).toEqual(expect.arrayContaining([model.path, payment.path, chosen.path, original.path]));
  expect(batch?.destinations[0].fields).toMatchObject({ categoryId: s('futura'), lastCycle: s('2026-01'), lastAmountCents: i(3799) });
  expect(batch?.destinations[1]).toMatchObject({ path: 'financialContexts/personal:owner/movements/' + 'A'.repeat(20) + '-2026-01',
    fields: { categoryId: s('refeicao'), accountId: { nullValue: null }, moneyFormat: { booleanValue: true }, isFromMandatory: { booleanValue: true } } });
  expect(plan.financialImpact.historicalNetByAccountCents).toEqual({});
  expect(planMigration(documents, identities, [], [future]).entries.find(item => item.path === model.path)?.classification).toBe('REQUIRES_REVIEW');
});

it('a revisão individual não substitui vínculo protegido, UID conhecido ou contexto de dependência', () => {
  const review = (source: MigrationDocument, ownerUid: string) => ({ path: source.path, sourceHash: digest(source), ownerUid,
    scope: { kind: 'personal' as const, id: ownerUid }, evidence: 'Confirmação individual para o teste' });
  const other = { uid: 'other', disabled: false };
  const foreign = record('expenses/foreign', { ...expense.fields, personId: s(other.uid) });
  const conflict = record(bankEvidence.path, { scopeKind: s('group'), scopeId: s('group') });
  const blocked = planMigration([bank, conflict, tag, tagEvidence, foreign], [...identity, other], [review(bank, 'owner')]);
  expect(blocked.entries.find(entry => entry.path === bank.path)?.classification).toBe('REQUIRES_REVIEW');
  const linked = planMigration([bank, bankEvidence, tag, tagEvidence, foreign, expense], [...identity, other], [review(foreign, 'owner')]);
  expect(linked.entries.find(entry => entry.path === foreign.path)?.classification).toBe('REQUIRES_REVIEW');
  expect(linked.entries.find(entry => entry.path === expense.path)?.classification).toBe('AUTO_MIGRATABLE');
});
