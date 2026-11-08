import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportSnapshot, restoreToEmulator, validate } from '../../script/firestore-snapshot.cjs';

test('typed external snapshot: nested/orphan documents, checksum, create-only restore and round trip', async () => {
	const source = 'demo-lumus-snapshot';
	const target = 'demo-lumus-restored';
	const fields = {
		amount: { integerValue: '9007199254740991' },
		date: { timestampValue: '2025-01-01T00:00:00.123456Z' },
		bytes: { bytesValue: 'AQID' },
		nullable: { nullValue: null },
		nested: { mapValue: { fields: { list: { arrayValue: { values: [{ booleanValue: true }] } } } } },
		location: { geoPointValue: { latitude: 1, longitude: 2 } },
		reference: { referenceValue: `projects/${source}/databases/(default)/documents/users/synthetic` },
	};
	const root = `projects/${source}/databases/(default)/documents`;
	const response = await fetch(`http://127.0.0.1:8089/v1/${root}:commit`, {
		method: 'POST',
		headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
		body: JSON.stringify({
			writes: [
				{ update: { name: `${root}/users/synthetic`, fields } },
				{ update: { name: `${root}/odd #?%/id #?%/documents/entry #?%`, fields } },
				{
					update: {
						name: `${root}/users/missing-parent/history/entry`,
						fields: { value: { integerValue: '42' } },
					},
				},
			],
		}),
	});
	assert.equal(response.status, 200);
	const snapshot = await exportSnapshot({ projectId: source, local: true, maxDocuments: 10 });
	assert.equal(snapshot.documents.length, 3);
	assert.throws(() => validate({ ...snapshot, sha256: 'tampered' }), /checksum/);
	await assert.rejects(exportSnapshot({ projectId: source, local: true, maxDocuments: 1 }), /budget/);
	await assert.rejects(restoreToEmulator(snapshot, 'finances-app-e8685'), /demo-/);
	assert.equal(await restoreToEmulator(snapshot, target), 3);
	const restored = await exportSnapshot({ projectId: target, local: true, maxDocuments: 10 });
	assert.deepEqual(restored.documents, snapshot.documents);
	await assert.rejects(restoreToEmulator(snapshot, target), /contains documents/);
});

test('snapshot reserves a sibling page before recursively reading children', async (context) => {
	const root = 'projects/demo-budget/databases/(default)/documents';
	let readDocuments = 0;
	context.mock.method(globalThis, 'fetch', async (url: string) => {
		const path = new URL(url).pathname;
		let body: Record<string, unknown> = {};
		if (path.endsWith('/documents:listCollectionIds')) body = { collectionIds: ['parents'] };
		else if (path.endsWith('/parents')) {
			readDocuments += 2;
			body = {
				documents: ['a', 'b'].map((id) => ({
					name: `${root}/parents/${id}`,
					createTime: '2025-01-01T00:00:00Z',
					fields: {},
				})),
			};
		} else if (path.endsWith('/parents/a:listCollectionIds')) body = { collectionIds: ['children'] };
		else if (path.endsWith('/children')) {
			readDocuments++;
			body = {
				documents: [{ name: `${root}/parents/a/children/c`, createTime: '2025-01-01T00:00:00Z', fields: {} }],
			};
		}
		return new Response(JSON.stringify(body), {
			status: 200,
			headers: { 'Content-Type': 'application/json' },
		});
	});
	await assert.rejects(exportSnapshot({ projectId: 'demo-budget', local: true, maxDocuments: 2 }), /budget/);
	assert.equal(readDocuments, 2);
});
