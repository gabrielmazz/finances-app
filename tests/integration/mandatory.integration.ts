import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { assertFails, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, limit, query, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { createBank, readBank } from '../../firebase/banks';
import { createCategory } from '../../firebase/categories';
import { archiveMandatoryTemplate, readMandatoryPage, readMandatoryTemplate, saveMandatoryTemplate } from '../../firebase/mandatory';
import { cancelMandatoryCycle, confirmMandatoryCycle, readMovement, updateMovement } from '../../firebase/movements';
import type { MandatoryInput } from '../../domain/mandatory';
import type { AccountClient } from '../../firebase/profiles';

test('mandatory expense installments and gain receipts update the ledger once per cycle', async () => {
  const env = await initializeTestEnvironment({ projectId: 'demo-lumus-foundation', firestore: { host: '127.0.0.1', port: 8089, rules: readFileSync('firestore.rules', 'utf8') } });
  try {
    const uid = 'mandatory-test-owner-' + Date.now(), scope = { kind: 'personal' as const, id: uid, uid };
    const db = env.authenticatedContext(uid).firestore();
    const client = { db, auth: { currentUser: { uid } } } as unknown as AccountClient;
    const bank = 'mandatoryBank0000001';
    const tagExpense = 'mandatoryTagE0000001', tagGain = 'mandatoryTagG0000001';
    const expenseId = 'mandatoryExp00000001', gainId = 'mandatoryGain0000001';
    await createBank(client, scope, bank, { accountType: 'checking', name: 'Conta', institutionName: 'Banco', institutionKey: 'outro-banco', colorHex: null, initialBalanceCents: 100000, openingDate: '2025-01-01', reason: '' });
    const category = { name: 'Categoria obrigatória', showInBothLists: false, iconFamily: null, iconName: null, iconStyle: null };
    await createCategory(client, scope, tagExpense, { ...category, usageType: 'expense', isMandatoryExpense: true, isMandatoryGain: false });
    await createCategory(client, scope, tagGain, { ...category, usageType: 'gain', isMandatoryExpense: false, isMandatoryGain: true });
    const expense: MandatoryInput = { type: 'expense', name: 'Curso', valueInCents: 333, categoryId: tagExpense, categorySource: 'new',
      description: '', dueDay: 15, usesBusinessDays: false, installmentTotal: 3, installmentTotalValueInCents: 1000, installmentStartDate: '2025-05-15' };
    const gain: MandatoryInput = { ...expense, type: 'gain', name: 'Recebimento', valueInCents: 2000, categoryId: tagGain,
      installmentTotal: null, installmentTotalValueInCents: null, installmentStartDate: null };
    await saveMandatoryTemplate(client, scope, expenseId, expense, null);
    await saveMandatoryTemplate(client, scope, gainId, gain, null);
    const balance = async () => (await readBank(client, scope, { id: bank, source: 'new' })).balanceInCents;
    assert.equal(await balance(), 100000);
    assert.deepEqual((await readMandatoryPage(client, scope, 'expense')).items.map(item => item.id), [expenseId]);
    const movement = { type: 'expense' as const, name: expense.name, amountCents: 333, categoryId: tagExpense, categorySource: 'new' as const,
      date: '2025-05-20', accountId: bank, explanation: '', paymentFormats: [] };
    await assert.rejects(confirmMandatoryCycle(client, scope, expenseId, { ...movement, amountCents: 334 }), /mandatory\/conflict/);
    await confirmMandatoryCycle(client, scope, expenseId, movement);
    await confirmMandatoryCycle(client, scope, expenseId, movement);
    assert.equal(await balance(), 99667);
    const settlement = await confirmMandatoryCycle(client, scope, expenseId, { ...movement, date: '2025-06-20', amountCents: 667 }, 2);
    assert.equal(await balance(), 99000);
    const confirmed = await readMandatoryTemplate(client, scope, expenseId);
    assert.equal(confirmed.installmentsCompleted, 3);
    await assert.rejects(cancelMandatoryCycle(client, scope, expenseId, '2025-05', confirmed.revision), /mandatory\/cycle-unavailable/);
    await assert.rejects(updateMovement(client, scope, settlement, null));
    await cancelMandatoryCycle(client, scope, expenseId, '2025-06', confirmed.revision);
    await cancelMandatoryCycle(client, scope, expenseId, '2025-06', confirmed.revision);
    assert.equal(await balance(), 99667);
    assert.equal((await readMovement(client, scope, settlement.id)).status, 'cancelled');
    assert.equal((await readMandatoryTemplate(client, scope, expenseId)).installmentsCompleted, 1);
    await confirmMandatoryCycle(client, scope, expenseId, { ...movement, date: '2025-06-21', amountCents: 667 }, 2);
    await assert.rejects(cancelMandatoryCycle(client, scope, expenseId, '2025-06', confirmed.revision), /mandatory\/conflict/);
    assert.equal(await balance(), 99000);
    await confirmMandatoryCycle(client, scope, gainId, { ...movement, type: 'gain', name: gain.name, categoryId: tagGain, amountCents: 2000 });
    assert.equal(await balance(), 101000);
    const template = doc(db, 'financialContexts', 'personal:' + uid, 'mandatoryTemplates', gainId);
    await assertFails(updateDoc(template, { lastAmountCents: 1, revision: 2, updatedAt: serverTimestamp(), updatedBy: uid }));
    const outsider = env.authenticatedContext('mandatory-outsider').firestore();
    await assertFails(getDoc(doc(outsider, template.path)));
    await assertFails(getDocs(query(collection(outsider, template.parent.path), limit(20))));
    await assertFails(setDoc(doc(outsider, template.path), { revision: 1 }));
    await archiveMandatoryTemplate(client, scope, await readMandatoryTemplate(client, scope, gainId));
    assert.deepEqual((await readMandatoryPage(client, scope, 'gain')).items, []);
    assert.equal(await balance(), 101000);
  } finally { await env.cleanup(); }
});

test('group members can read mandatory models only while their membership is current', async () => {
  const env = await initializeTestEnvironment({ projectId: 'demo-lumus-foundation', firestore: { host: '127.0.0.1', port: 8089, rules: readFileSync('firestore.rules', 'utf8') } });
  try {
    const group = 'mandatory-cycle-group-' + Date.now(), generation = 'mandatory-group-generation', admin = 'mandatory-cycle-admin', member = 'mandatory-cycle-member';
    const adminScope = { kind: 'group' as const, id: group, uid: admin };
    const memberScope = { ...adminScope, uid: member };
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await setDoc(doc(db, 'financialGroups', group), { status: 'active' });
      for (const [uid, role] of [[admin, 'admin'], [member, 'member']]) {
        await setDoc(doc(db, '_authorizations', uid), { generation, enabled: true, readOwners: [], groups: { [group]: role } });
      }
    });
    const clientFor = (uid: string) => ({ db: env.authenticatedContext(uid, { lumusAccess: generation }).firestore(), auth: { currentUser: { uid } } }) as unknown as AccountClient;
    const adminClient = clientFor(admin), memberClient = clientFor(member);
    const template = 'mandatoryGroup000001', tag = 'mandatoryGroupTag001', bank = 'mandatoryGroupBank01';
    await createBank(adminClient, adminScope, bank, { accountType: 'checking', name: 'Conta do grupo', institutionName: 'Banco', institutionKey: 'outro-banco', colorHex: null, initialBalanceCents: 1000, openingDate: '2025-01-01', reason: '' });
    await createCategory(adminClient, adminScope, tag, { name: 'Ganho obrigatório', usageType: 'gain', isMandatoryGain: true, isMandatoryExpense: false, showInBothLists: false, iconFamily: null, iconName: null, iconStyle: null });
    await saveMandatoryTemplate(adminClient, adminScope, template, { type: 'gain', name: 'Ganho do grupo', valueInCents: 750,
      categoryId: tag, categorySource: 'new', description: '', dueDay: 10, usesBusinessDays: true,
      installmentTotal: null, installmentStartDate: null, installmentTotalValueInCents: null }, null);
    const movement = { type: 'gain' as const, name: 'Ganho do grupo', amountCents: 750, categoryId: tag, categorySource: 'new' as const,
      accountId: bank, date: '2025-09-12', explanation: '', paymentFormats: [] };
    assert.equal((await readMandatoryPage(memberClient, memberScope, 'gain')).items.length, 1);
    await assert.rejects(confirmMandatoryCycle(memberClient, memberScope, template, movement));
    const saved = await confirmMandatoryCycle(adminClient, adminScope, template, movement);
    assert.equal((await readMovement(memberClient, memberScope, saved.id)).amountCents, 750);
    await env.withSecurityRulesDisabled(async context => updateDoc(doc(context.firestore(), '_authorizations', member), { groups: {} }));
    await assert.rejects(readMandatoryTemplate(memberClient, memberScope, template));
    await assert.rejects(readMandatoryPage(memberClient, memberScope, 'gain'));
    await assert.rejects(readMovement(memberClient, memberScope, saved.id));
    assert.equal((await readBank(adminClient, adminScope, { id: bank, source: 'new' })).balanceInCents, 1750);
  } finally { await env.cleanup(); }
});
