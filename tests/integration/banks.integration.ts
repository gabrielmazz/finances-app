import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http2';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import {
	getFirestore,
	connectFirestoreEmulator,
	terminate,
	doc,
	getDocFromServer,
	getDocsFromServer,
	collection,
	query,
	where,
	limit,
	setDoc,
	updateDoc,
	deleteDoc,
	writeBatch,
	serverTimestamp,
	Timestamp,
	setLogLevel,
	disableNetwork,
	enableNetwork,
} from 'firebase/firestore';
import {
	initializeTestEnvironment,
	type RulesTestEnvironment,
	assertFails,
	assertSucceeds,
} from '@firebase/rules-unit-testing';
import { register, login } from '../../application/account';
import { LOCAL_PROJECT, DEMO_PASSWORD, setEmulatorClaims } from '../../script/emulator-fixtures';
import {
	createBank,
	readBank,
	readBankPage,
	updateBank,
	archiveBank,
	requireBankEnvironment,
	bankContextKey,
} from '../../firebase/banks';
import type { BankScope, BankCreation } from '../../domain/banks';

let environment: RulesTestEnvironment,
	owner: ReturnType<typeof client>,
	other: ReturnType<typeof client>,
	admin: ReturnType<typeof client>,
	member: ReturnType<typeof client>;
const apps: FirebaseApp[] = [],
	results: { name: string; passed: boolean }[] = [];
const generation = 'synthetic-banks-stage04',
	date = Timestamp.fromDate(new Date('2025-01-01T00:00:00Z'));
const input: BankCreation = {
	name: 'Conta principal',
	institutionKey: 'nubank',
	institutionName: 'Nubank',
	accountType: 'checking',
	colorHex: null,
	initialBalanceCents: 150000,
	openingDate: '2025-01-01',
	reason: '',
};
function client(name: string, port = 8089) {
	const app = initializeApp({ apiKey: 'demo-api-key', projectId: LOCAL_PROJECT }, 'banks-' + name);
	apps.push(app);
	const auth = getAuth(app);
	connectAuthEmulator(auth, 'http://127.0.0.1:9098', { disableWarnings: true });
	const db = getFirestore(app);
	connectFirestoreEmulator(db, '127.0.0.1', port);
	return { auth, db };
}
function scope(c: typeof owner): BankScope {
	return { kind: 'personal', id: c.auth.currentUser!.uid, uid: c.auth.currentUser!.uid };
}
const op = (name: string) => name.padEnd(20, '0');
const accountPath = (s: BankScope, id: string) => `financialContexts/${bankContextKey(s)}/bankAccounts/${id}`;
const openingPath = (s: BankScope, id: string) =>
	`financialContexts/${bankContextKey(s)}/accountOpenings/${id}`;
function bodies(s: BankScope, id: string, value = 150000) {
	return {
		account: {
			schemaVersion: 1,
			scopeKind: s.kind,
			scopeId: s.id,
			name: input.name,
			institutionKey: input.institutionKey,
			institutionName: input.institutionName,
			accountType: input.accountType,
			colorHex: null,
			initialBalanceCents: value,
			openingDate: date,
			status: 'active',
			revision: 0,
			createdBy: s.uid,
			updatedBy: s.uid,
			createdAt: serverTimestamp(),
			updatedAt: serverTimestamp(),
		},
		opening: {
			schemaVersion: 1,
			accountId: id,
			scopeKind: s.kind,
			scopeId: s.id,
			type: 'opening',
			amountCents: value,
			date,
			reason: value < 0 ? 'Limite utilizado' : '',
			createdBy: s.uid,
			createdAt: serverTimestamp(),
		},
	};
}
async function pair(
	db: ReturnType<typeof getFirestore>,
	s: BankScope,
	id: string,
	changeAccount = {},
	changeOpening = {},
) {
	const data = bodies(s, id),
		batch = writeBatch(db);
	batch.set(doc(db, accountPath(s, id)), { ...data.account, ...changeAccount });
	batch.set(doc(db, openingPath(s, id)), { ...data.opening, ...changeOpening });
	await batch.commit();
}
function scenario(name: string, run: () => Promise<void>) {
	test('banks: ' + name, async () => {
		try {
			await run();
			results.push({ name, passed: true });
		} catch (error) {
			results.push({ name, passed: false });
			throw error;
		}
	});
}
before(async () => {
	assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8089');
	assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9098');
	setLogLevel('silent');
	environment = await initializeTestEnvironment({
		projectId: LOCAL_PROJECT,
		firestore: { host: '127.0.0.1', port: 8089, rules: readFileSync('firestore.rules', 'utf8') },
	});
	owner = client('owner');
	other = client('other');
	admin = client('admin');
	member = client('member');
	for (const [name, c] of Object.entries({ owner, other, admin, member })) {
		await register(c, 'Pessoa ' + name, `bank-stage04-${name}@lumus.test`, DEMO_PASSWORD);
	}
	await environment.withSecurityRulesDisabled(async (context) => {
		const db = context.firestore();
		await db.doc('financialGroups/bankgroup').set({ status: 'active' });
		for (const [c, role] of [
			[admin, 'admin'],
			[member, 'member'],
		] as const)
			await db
				.doc('_authorizations/' + c.auth.currentUser!.uid)
				.set({ generation, enabled: true, readOwners: [], groups: { bankgroup: role } });
		await db
			.doc('banks/stage04legacy')
			.set({
				name: 'Conta anterior',
				personId: owner.auth.currentUser!.uid, groupId: null, financialGroupId: null, ledgerGroupId: null,
				colorHex: '#123456',
				createdAt: date,
			});
		await db
			.doc('monthlyBalances/stage04historical')
			.set({
				bankId: 'stage04legacy',
				personId: owner.auth.currentUser!.uid,
				year: 2025,
				month: 1,
				valueInCents: 12345,
				createdAt: date,
			});
	});
	for (const c of [admin, member]) {
		await setEmulatorClaims(c.auth.currentUser!.uid, { lumusAccess: generation });
		await c.auth.currentUser!.getIdToken(true);
	}
});
after(async () => {
	mkdirSync('artifacts/banks-stage04', { recursive: true });
	writeFileSync(
		'artifacts/banks-stage04/integration.json',
		JSON.stringify(
			{
				rulesSHA256: createHash('sha256').update(readFileSync('firestore.rules')).digest('hex'),
				tests: results,
				failed: results.filter((item) => !item.passed).length,
				synthetic: true,
				productionWrites: 0,
			},
			null,
			2,
		) + '\n',
	);
	for (const app of apps) {
		await terminate(getFirestore(app));
		await deleteApp(app);
	}
	await environment?.cleanup();
});

scenario('creates positive opening atomically and never a gain', async () => {
	const s = scope(owner),
		id = op('positive');
	const bank = await createBank(owner, s, id, input);
	assert.equal(bank.balanceInCents, 150000);
	const opening = await getDocFromServer(doc(owner.db, openingPath(s, id)));
	assert.equal(opening.data()!.type, 'opening');
	assert.equal(opening.data()!.amountCents, 150000);
	await environment.withSecurityRulesDisabled(async (context) =>
		assert.equal(
			(
				await context
					.firestore()
					.doc('gains/' + id)
					.get()
			).exists,
			false,
		),
	);
});
scenario('zero and justified negative openings preserve integer precision', async () => {
	for (const [name, value] of [
		['zero', 0],
		['negative', -1],
	] as const) {
		const bank = await createBank(owner, scope(owner), op(name), {
			...input,
			name,
			initialBalanceCents: value,
			reason: value < 0 ? 'Limite utilizado' : '',
		});
		assert.equal(bank.balanceInCents, value);
	}
});
scenario('parallel retries with the same operation produce one account and one opening', async () => {
	const s = scope(owner),
		id = op('concurrent');
	const records = await Promise.all(Array.from({ length: 8 }, () => createBank(owner, s, id, input)));
	assert(records.every((record) => record.id === id && record.balanceInCents === 150000));
	const second = client('parallel-session');
	await login(second, 'bank-stage04-owner@lumus.test', DEMO_PASSWORD);
	assert.equal((await createBank(second, s, id, input)).id, id);
	await assert.rejects(
		createBank(owner, s, id, { ...input, initialBalanceCents: 150001 }),
		/operation-conflict/,
	);
	assert.equal((await readBank(owner, s, { id, source: 'new' })).balanceInCents, 150000);
});
scenario('new SDK process/session reads the same persisted account', async () => {
	const fresh = client('restart');
	await login(fresh, 'bank-stage04-owner@lumus.test', DEMO_PASSWORD);
	assert.equal(
		(await readBank(fresh, scope(fresh), { id: op('positive'), source: 'new' })).balanceInCents,
		150000,
	);
});
scenario('metadata edits preserve opening and historical identifiers', async () => {
	const s = scope(owner),
		id = op('positive'),
		before = (await getDocFromServer(doc(owner.db, openingPath(s, id)))).data();
	const edited = await updateBank(owner, s, { id, source: 'new' }, 0, { ...input, name: 'Conta editada' });
	assert.equal(edited.name, 'Conta editada');
	assert.equal(edited.balanceInCents, 150000);
	assert.deepEqual((await getDocFromServer(doc(owner.db, openingPath(s, id)))).data(), before);
	await updateBank(owner, s, { id, source: 'new' }, 0, { ...input, name: 'Conta editada' });
	assert.equal((await readBank(owner, s, { id, source: 'new' })).revision, 1);
});
scenario('competing metadata edits reject a stale revision without losing the winner', async () => {
	const s = scope(owner),
		id = op('editrace');
	await createBank(owner, s, id, input);
	const attempts = await Promise.allSettled(
		['Primeira', 'Segunda'].map((name) => updateBank(owner, s, { id, source: 'new' }, 0, { ...input, name })),
	);
	assert.equal(attempts.filter((result) => result.status === 'fulfilled').length, 1);
	assert.equal(attempts.filter((result) => result.status === 'rejected').length, 1);
	const bank = await readBank(owner, s, { id, source: 'new' });
	assert(['Primeira', 'Segunda'].includes(bank.name));
	assert.equal(bank.revision, 1);
	assert.equal(bank.balanceInCents, 150000);
});
scenario('archives only zero balances and replay does not increment again', async () => {
	const s = scope(owner),
		id = op('zero');
	const bank = await archiveBank(owner, s, { id, source: 'new' }, 0);
	assert.equal(bank.status, 'archived');
	assert.equal((await archiveBank(owner, s, { id, source: 'new' }, 0)).revision, 1);
	await assert.rejects(archiveBank(owner, s, { id: op('positive'), source: 'new' }, 1), /nonzero-archive/);
	await assert.rejects(updateBank(owner, s, { id, source: 'new' }, 1, input), /archived/);
	assert.equal((await getDocFromServer(doc(owner.db, openingPath(s, id)))).data()!.amountCents, 0);
});
scenario('legacy reads and metadata-only edit never create another opening or change snapshots', async () => {
	const s = scope(owner),
		ref = { id: 'stage04legacy', source: 'legacy' as const };
	const before = (await getDocFromServer(doc(owner.db, 'monthlyBalances/stage04historical'))).data();
	const bank = await readBank(owner, s, ref);
	assert.equal(bank.balanceInCents, null);
	assert.equal(bank.id, ref.id);
	await updateBank(owner, s, ref, 0, { ...input, name: 'Nome atualizado' });
	assert.deepEqual(
		(await getDocFromServer(doc(owner.db, 'monthlyBalances/stage04historical'))).data(),
		before,
	);
	assert.equal((await getDocFromServer(doc(owner.db, openingPath(s, ref.id)))).exists(), false);
	await assert.rejects(archiveBank(owner, s, ref, 1), /reconciliation/);
});
scenario('pagination is scoped and separates active/archived without full history reads', async () => {
	const s = scope(owner);
	const active = await readBankPage(owner, s, 'new', 'active');
	assert(active.banks.every((bank) => bank.status === 'active'));
	const archived = await readBankPage(owner, s, 'new', 'archived');
	assert.equal(archived.banks.length, 1);
	assert.equal(archived.banks[0].id, op('zero'));
	await assertFails(
		getDocsFromServer(
			query(collection(owner.db, `financialContexts/${bankContextKey(s)}/bankAccounts`), limit(21)),
		),
	);
});
scenario('group admins write, members read, outsiders and self-assigned roles cannot write', async () => {
	const s: BankScope = { kind: 'group', id: 'bankgroup', uid: admin.auth.currentUser!.uid },
		id = op('groupaccount');
	await createBank(admin, s, id, input);
	const memberScope = { ...s, uid: member.auth.currentUser!.uid };
	assert.equal((await readBank(member, memberScope, { id, source: 'new' })).balanceInCents, 150000);
	await assert.rejects(createBank(member, memberScope, op('membercreate'), input));
	await assert.rejects(readBank(other, { ...s, uid: other.auth.currentUser!.uid }, { id, source: 'new' }));
	await assertFails(updateDoc(doc(other.db, 'users', other.auth.currentUser!.uid), { adminUser: true }));
	await assertFails(
		setDoc(doc(other.db, '_authorizations', other.auth.currentUser!.uid), {
			generation,
			enabled: true,
			readOwners: [],
			groups: { bankgroup: 'admin' },
		}),
	);
});
scenario('anonymous and foreign users cannot read or create in another context', async () => {
	const s = scope(owner),
		guest = environment.unauthenticatedContext().firestore(),
		foreign = other.db;
	await assertFails(guest.doc(accountPath(s, op('positive'))).get());
	await assertFails(getDocFromServer(doc(foreign, accountPath(s, op('positive')))));
	await assertFails(
		getDocsFromServer(
			query(collection(foreign, `financialContexts/${bankContextKey(s)}/bankAccounts`), limit(20)),
		),
	);
	await assertFails(pair(foreign, { ...s, uid: other.auth.currentUser!.uid }, op('foreigncreate')));
});

for (const [name, accountPatch, openingPatch] of [
	['fractional cents', { initialBalanceCents: 1.5 }, { amountCents: 1.5 }],
	['overflow', { initialBalanceCents: 9000000000001 }, { amountCents: 9000000000001 }],
	['wrong context', { scopeId: 'victim' }, {}],
	['wrong creator', { createdBy: 'victim' }, {}],
	['extra permission field', { adminUser: true }, {}],
	['unknown account type', { accountType: 'admin' }, {}],
	['oversized name', { name: 'x'.repeat(101) }, {}],
	['oversized institution', { institutionName: 'x'.repeat(101) }, {}],
	['bad color', { colorHex: 'red' }, {}],
	[
		'future date',
		{ openingDate: Timestamp.fromDate(new Date('2099-01-01')) },
		{ date: Timestamp.fromDate(new Date('2099-01-01')) },
	],
	['forged opening kind', {}, { type: 'gain' }],
	['mismatched opening amount', {}, { amountCents: 1 }],
	['oversized reason', {}, { reason: 'x'.repeat(501) }],
	['mismatched account id', {}, { accountId: op('otherid') }],
] as [string, Record<string, unknown>, Record<string, unknown>][])
	scenario('direct forged creation denied: ' + name, async () => {
		const s = scope(owner),
			id = op('attack' + results.length);
		await assertFails(pair(owner.db, s, id, accountPatch, openingPatch));
		assert.equal((await getDocFromServer(doc(owner.db, accountPath(s, id)))).exists(), false);
		assert.equal((await getDocFromServer(doc(owner.db, openingPath(s, id)))).exists(), false);
	});

scenario('missing opening or account rejects the entire write', async () => {
	const s = scope(owner),
		id = op('orphan'),
		data = bodies(s, id);
	await assertFails(setDoc(doc(owner.db, accountPath(s, id)), data.account));
	await assertFails(setDoc(doc(owner.db, openingPath(s, id)), data.opening));
	assert.equal((await getDocFromServer(doc(owner.db, accountPath(s, id)))).exists(), false);
});
scenario('balance, ownership, context, opening and audit cannot be changed or deleted', async () => {
	const s = scope(owner),
		id = op('positive'),
		ref = doc(owner.db, accountPath(s, id));
	for (const patch of [
		{ initialBalanceCents: 1 },
		{ scopeId: 'victim' },
		{ createdBy: 'victim' },
		{ createdAt: serverTimestamp() },
		{ openingDate: Timestamp.now() },
		{ schemaVersion: 2 },
	])
		await assertFails(
			updateDoc(ref, { ...patch, revision: 2, updatedAt: serverTimestamp(), updatedBy: s.uid }),
		);
	await assertFails(updateDoc(doc(owner.db, openingPath(s, id)), { amountCents: 1 }));
	await assertFails(deleteDoc(doc(owner.db, openingPath(s, id))));
	await assertFails(deleteDoc(ref));
	await assertFails(
		updateDoc(ref, { status: 'archived', revision: 2, updatedAt: serverTimestamp(), updatedBy: s.uid }),
	);
	assert.equal((await readBank(owner, s, { id, source: 'new' })).balanceInCents, 150000);
});
scenario('unknown result is recovered by the same id and an outage creates no partial pair', async () => {
	const s = scope(owner),
		id = op('lostresponse');
	await createBank(owner, s, id, input);
	assert.equal((await createBank(owner, s, id, input)).id, id);
	// disableNetwork() does not stop unary transaction RPCs; inject a real local outage.
	const unavailable = createServer();
	unavailable.on('stream', (stream) => {
		stream.respond({
			':status': 200,
			'content-type': 'application/grpc',
			'grpc-status': '14',
			'grpc-message': 'Synthetic outage',
		});
		stream.end();
	});
	await new Promise<void>((resolve) => unavailable.listen(0, '127.0.0.1', resolve));
	const offline = client('offline', (unavailable.address() as { port: number }).port);
	try {
		await login(offline, 'bank-stage04-owner@lumus.test', DEMO_PASSWORD);
		await assert.rejects(createBank(offline, scope(offline), op('offline'), input));
	} finally {
		await terminate(offline.db);
		await new Promise<void>((resolve) => unavailable.close(() => resolve()));
	}
	assert.equal((await getDocFromServer(doc(owner.db, accountPath(s, op('offline'))))).exists(), false);
	assert.equal((await getDocFromServer(doc(owner.db, openingPath(s, op('offline'))))).exists(), false);
});
scenario('concurrent distinct intents create exactly two independent pairs', async () => {
	const s = scope(owner),
		ids = [op('independentA'), op('independentB')];
	await Promise.all(ids.map((id) => createBank(owner, s, id, input)));
	for (const id of ids) {
		assert.equal((await readBank(owner, s, { id, source: 'new' })).balanceInCents, 150000);
		assert.equal((await getDocFromServer(doc(owner.db, openingPath(s, id)))).data()!.amountCents, 150000);
	}
	await environment.withSecurityRulesDisabled(async (context) => {
		const db = context.firestore(),
			accounts = await db.collection(`financialContexts/${bankContextKey(s)}/bankAccounts`).get(),
			openings = await db.collection(`financialContexts/${bankContextKey(s)}/accountOpenings`).get();
		assert.equal(accounts.size, openings.size);
		assert.deepEqual(
			accounts.docs.map((item) => item.id).sort(),
			openings.docs.map((item) => item.id).sort(),
		);
		assert.equal(accounts.docs.filter((item) => item.id === op('concurrent')).length, 1);
	});
});
scenario('one cent and maximum allowed integer opening survive round trips', async () => {
	for (const amount of [1, 9000000000000])
		assert.equal(
			(await createBank(owner, scope(owner), op('edge' + amount), { ...input, initialBalanceCents: amount }))
				.balanceInCents,
			amount,
		);
});
scenario('negative opening without justification and noninteger revisions are denied directly', async () => {
	const s = scope(owner),
		id = op('invalidDebt');
	await assertFails(pair(owner.db, s, id, { initialBalanceCents: -1 }, { amountCents: -1, reason: '' }));
	await assertFails(pair(owner.db, s, op('badrevision'), { revision: 0.5 }, {}));
	await assertFails(
		updateDoc(doc(owner.db, accountPath(s, op('positive'))), {
			name: 'Invalid',
			revision: 1.5,
			updatedAt: serverTimestamp(),
			updatedBy: s.uid,
		}),
	);
});
scenario('a batch containing one invalid pair commits neither pair', async () => {
	const s = scope(owner),
		batch = writeBatch(owner.db);
	for (const [id, amount] of [
		[op('batchvalid'), 0],
		[op('batchinvalid'), 1.5],
	] as const) {
		const data = bodies(s, id);
		batch.set(doc(owner.db, accountPath(s, id)), { ...data.account, initialBalanceCents: amount });
		batch.set(doc(owner.db, openingPath(s, id)), { ...data.opening, amountCents: amount });
	}
	await assertFails(batch.commit());
	for (const id of [op('batchvalid'), op('batchinvalid')])
		assert.equal((await getDocFromServer(doc(owner.db, accountPath(s, id)))).exists(), false);
});
scenario('two group pairs fit rule access budgets in one atomic batch', async () => {
	const s: BankScope = { kind: 'group', id: 'bankgroup', uid: admin.auth.currentUser!.uid },
		batch = writeBatch(admin.db);
	for (const id of [op('groupbatchA'), op('groupbatchB')]) {
		const data = bodies(s, id, 0);
		batch.set(doc(admin.db, accountPath(s, id)), data.account);
		batch.set(doc(admin.db, openingPath(s, id)), data.opening);
	}
	await assertSucceeds(batch.commit());
	for (const id of [op('groupbatchA'), op('groupbatchB')])
		assert.equal((await readBank(admin, s, { id, source: 'new' })).balanceInCents, 0);
});
scenario('revoked authorization and inactive groups immediately lose account access', async () => {
	const s: BankScope = { kind: 'group', id: 'bankgroup', uid: member.auth.currentUser!.uid },
		ref = { id: op('groupaccount'), source: 'new' as const };
	await environment.withSecurityRulesDisabled(async (context) =>
		context
			.firestore()
			.doc('_authorizations/' + s.uid)
			.update({ enabled: false }),
	);
	await assert.rejects(readBank(member, s, ref));
	await environment.withSecurityRulesDisabled(async (context) => {
		await context
			.firestore()
			.doc('_authorizations/' + s.uid)
			.update({ enabled: true });
		await context.firestore().doc('financialGroups/bankgroup').update({ status: 'inactive' });
	});
	await assert.rejects(readBank(member, s, ref));
	await assert.rejects(
		createBank(admin, { ...s, uid: admin.auth.currentUser!.uid }, op('inactivegroup'), input),
	);
	await environment.withSecurityRulesDisabled(async (context) =>
		context.firestore().doc('financialGroups/bankgroup').update({ status: 'active' }),
	);
});
scenario('legacy incomplete and ambiguous records are explicitly blocked without writes', async () => {
	const s = scope(owner);
	await environment.withSecurityRulesDisabled(async (context) => {
		await context.firestore().doc('banks/stage04incomplete').set({ personId: s.uid, groupId: null, financialGroupId: null, ledgerGroupId: null });
		await context
			.firestore()
			.doc('banks/stage04ambiguous')
			.set({ name: 'Ambiguous', personId: 'another-owner' });
	});
	const page = await readBankPage(owner, s, 'legacy', 'active');
	assert.equal(page.issues, 1);
	assert(
		page.banks.some(
			(bank) => bank.id === 'stage04incomplete' && bank.blocked && bank.balanceInCents === null,
		),
	);
	assert(!page.banks.some((bank) => bank.id === 'stage04ambiguous'));
	await assert.rejects(readBank(owner, s, { id: 'stage04incomplete', source: 'legacy' }));
	await assert.rejects(readBank(owner, s, { id: 'stage04ambiguous', source: 'legacy' }));
	await assertFails(
		updateDoc(doc(owner.db, 'banks/stage04legacy'), {
			personId: 'victim',
			metadataRevision: 2,
			updatedBy: s.uid,
			updatedAt: serverTimestamp(),
		}),
	);
});
scenario('legacy shared-owner grant cannot read a new personal namespace', async () => {
	const victim = scope(owner),
		uid = other.auth.currentUser!.uid;
	await environment.withSecurityRulesDisabled(async (context) =>
		context
			.firestore()
			.doc('_authorizations/' + uid)
			.set({ generation, enabled: true, readOwners: [victim.uid], groups: {} }),
	);
	await setEmulatorClaims(uid, { lumusAccess: generation });
	await other.auth.currentUser!.getIdToken(true);
	await assertFails(getDocFromServer(doc(other.db, accountPath(victim, op('positive')))));
});
scenario('compatibility matrix compares the actual Stage03 source with Stage04 locally',async()=>{
 const oldSource=readFileSync('security/stage03-published.rules','utf8');
 const old=await initializeTestEnvironment({projectId:'demo-lumus-stage03-compat',firestore:{host:'127.0.0.1',port:8089,rules:oldSource}});
 const uid=owner.auth.currentUser!.uid,s=scope(owner),id=op('compatnew'),matrix:{flow:string;stage03:string;stage04:string}[]=[];
 try{
  await old.withSecurityRulesDisabled(async context=>{await context.firestore().doc('banks/compatlegacy').set({personId:uid,name:'Legacy'});await context.firestore().doc(accountPath(s,id)).set({initialBalanceCents:0});});
  const oldOwner=old.authenticatedContext(uid).firestore(),oldForeign=old.authenticatedContext('foreign').firestore();
  await assertSucceeds(oldOwner.doc('banks/compatlegacy').get());await assertFails(oldForeign.doc('banks/compatlegacy').get());
  await assertSucceeds(readBank(owner,s,{id:'stage04legacy',source:'legacy'}));await assertFails(environment.authenticatedContext('compat-foreign').firestore().doc('banks/stage04legacy').get());
  matrix.push({flow:'legacy own read / foreign read',stage03:'allow own; deny foreign',stage04:'allow own; deny foreign'});
  await assertFails(oldOwner.doc(accountPath(s,id)).get());await assertSucceeds(createBank(owner,s,id,{...input,initialBalanceCents:0}));
  matrix.push({flow:'new scoped account read/create',stage03:'deny (unsupported)',stage04:'allow owner with atomic opening'});
  await assertFails(oldOwner.doc('banks/compatlegacy').update({name:'Edited'}));const legacy=await readBank(owner,s,{id:'stage04legacy',source:'legacy'});await assertSucceeds(updateBank(owner,s,legacy,legacy.revision,{...input,name:'Compatible edit'}));
  matrix.push({flow:'legacy metadata edit',stage03:'deny',stage04:'allow owner with revision; history immutable'});
  await assertFails(oldOwner.doc('gains/compatgain').set({personId:uid,valueInCents:1}));await assertFails(setDoc(doc(owner.db,'gains/compatgain'),{personId:uid,valueInCents:1}));
  matrix.push({flow:'legacy financial writes',stage03:'deny',stage04:'deny; old clients remain read-only'});
  writeFileSync('artifacts/banks-stage04/stage03-to-stage04-compatibility.json',JSON.stringify({synthetic:true,stage03SHA256:createHash('sha256').update(oldSource).digest('hex'),stage04SHA256:createHash('sha256').update(readFileSync('firestore.rules')).digest('hex'),matrix,productionRulesReadDuringThisTest:false,installedOldBinariesCertified:false},null,2)+'\n');
 }finally{await old.cleanup();}
});

scenario('production financial endpoints and changed sessions fail before any I/O',async()=>{
 const s=scope(owner);
 assert.throws(()=>requireBankEnvironment({auth:owner.auth,db:{app:{options:{projectId:'production-project'}}}} as any,s),/not-released/);
 assert.throws(()=>requireBankEnvironment(other,s),/session\/changed/);
 assert.throws(()=>requireBankEnvironment(owner,{...s,id:'somebody-else'}),/invalid-context/);
});
