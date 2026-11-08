// REST export uses document reads; it does not use the paid managed export service.
const { createHash } = require('node:crypto');
const { readFileSync, writeFileSync } = require('node:fs');
function encodePath(value) {
	return value.split('/').map(encodeURIComponent).join('/');
}
function digest(documents) {
	return createHash('sha256').update(JSON.stringify(documents)).digest('hex');
}
function validate(snapshot) {
	if (
		snapshot.version !== 1 ||
		!Array.isArray(snapshot.documents) ||
		snapshot.sha256 !== digest(snapshot.documents)
	)
		throw Error('Invalid snapshot or checksum');
	const paths = new Set();
	for (const document of snapshot.documents) {
		if (
			!document.path ||
			document.path.split('/').length % 2 !== 0 ||
			document.path.split('/').some((part) => !part || part === '.' || part === '..') ||
			paths.has(document.path) ||
			!document.fields ||
			typeof document.fields !== 'object'
		)
			throw Error('Invalid or duplicate document path');
		paths.add(document.path);
	}
	return snapshot;
}
function rest(projectId, token, local) {
	if (!/^[a-z][a-z0-9-]+$/.test(projectId)) throw Error('Invalid project');
	if (local && !projectId.startsWith('demo-')) throw Error('Local snapshots require demo- project');
	if (!local && !token) throw Error('Read-only OAuth access token required');
	const origin = local ? 'http://127.0.0.1:8089' : 'https://firestore.googleapis.com';
	const root = `/v1/projects/${projectId}/databases/(default)/documents`;
	return {
		root,
		async request(method, path, body) {
			// The only remote POST permitted is metadata listing, which does not write data.
			if (!local && method !== 'GET' && !(method === 'POST' && path.includes(':listCollectionIds')))
				throw Error('Production writes forbidden');
			const response = await fetch(origin + path, {
				method,
				headers: { Authorization: `Bearer ${local ? 'owner' : token}`, 'Content-Type': 'application/json' },
				body: body ? JSON.stringify(body) : undefined,
				signal: AbortSignal.timeout(30000),
			});
			if (!response.ok) throw Error(`Firestore HTTP ${response.status}`);
			return response.json();
		},
	};
}
async function exportSnapshot({ projectId, token = undefined, local = false, maxDocuments = 1000 }) {
	if (!Number.isSafeInteger(maxDocuments) || maxDocuments < 1 || maxDocuments > 50000)
		throw Error('Set an explicit document budget between 1 and 50000');
	const api = rest(projectId, token, local);
	const documents = [];
	let scannedDocuments = 0;
	async function walk(parent) {
		let collectionToken;
		do {
			const collections = await api.request('POST', `${parent}:listCollectionIds`, {
				pageSize: 100,
				...(collectionToken ? { pageToken: collectionToken } : {}),
			});
			for (const collection of collections.collectionIds || []) {
				let pageToken;
				do {
					const remaining = maxDocuments - scannedDocuments;
					if (remaining <= 0) throw Error('Document budget reached; no complete backup produced');
					const parameters = new URLSearchParams({
						pageSize: String(Math.min(100, remaining)),
						showMissing: 'true',
					});
					if (pageToken) parameters.set('pageToken', pageToken);
					const page = await api.request('GET', `${parent}/${encodeURIComponent(collection)}?${parameters}`);
					// Reserve sibling reads before recursion consumes the remaining document budget.
					scannedDocuments += (page.documents || []).length;
					if (scannedDocuments > maxDocuments) throw Error('Document budget exceeded');
					for (const document of page.documents || []) {
						const prefix = api.root.slice(4) + '/';
						if (!document.name.startsWith(prefix)) throw Error('Unexpected document namespace');
						if (document.createTime)
							documents.push({ path: document.name.slice(prefix.length), fields: document.fields || {} });
						// Missing parent documents may still contain real subcollections.
						await walk('/v1/' + encodePath(document.name));
					}
					pageToken = page.nextPageToken;
				} while (pageToken);
			}
			collectionToken = collections.nextPageToken;
		} while (collectionToken);
	}
	await walk(api.root);
	documents.sort((a, b) => a.path.localeCompare(b.path));
	return validate({
		version: 1,
		projectId,
		database: '(default)',
		exportedAt: new Date().toISOString(),
		pointInTime: false,
		scannedDocuments,
		documents,
		sha256: digest(documents),
	});
}
async function restoreToEmulator(snapshot, targetProject) {
	validate(snapshot);
	if (!targetProject?.startsWith('demo-')) throw Error('Restore is allowed only in a demo- emulator project');
	const api = rest(targetProject, null, true);
	// Preflight all collisions before writing. Every commit also has a create-only precondition.
	for (const document of snapshot.documents) {
		try {
			await api.request('GET', `${api.root}/${encodePath(document.path)}`);
			throw Error('Restore target contains documents');
		} catch (error) {
			if (error.message !== 'Firestore HTTP 404') throw error;
		}
	}
	for (let start = 0; start < snapshot.documents.length; start += 100) {
		await api.request('POST', api.root.replace(/\/documents$/, '/documents:commit'), {
			writes: snapshot.documents.slice(start, start + 100).map((document) => ({
				update: { name: api.root.slice(4) + '/' + document.path, fields: document.fields },
				currentDocument: { exists: false },
			})),
		});
	}
	return snapshot.documents.length;
}
module.exports = { exportSnapshot, restoreToEmulator, validate };
if (require.main === module) {
	(async () => {
		const [action, projectId, file, budget] = process.argv.slice(2);
		if (action === 'export-local' || action === 'export-readonly') {
			if (!file) throw Error('Specify an output on an encrypted, private volume');
			const snapshot = await exportSnapshot({
				projectId,
				local: action === 'export-local',
				token: process.env.GOOGLE_OAUTH_ACCESS_TOKEN,
				maxDocuments: Number(budget),
			});
			writeFileSync(file, JSON.stringify(snapshot), { flag: 'wx', mode: 0o600 });
			console.log(
				`Complete traversal saved: ${snapshot.documents.length} documents; checksum ${snapshot.sha256}. Restore validation is still required.`,
			);
		} else if (action === 'restore-local') {
			const snapshot = validate(JSON.parse(readFileSync(file, 'utf8')));
			console.log(
				`Restored ${await restoreToEmulator(snapshot, projectId)} documents to isolated demo project.`,
			);
		} else
			throw Error(
				'Use export-local|export-readonly PROJECT OUTPUT MAX_DOCUMENTS, or restore-local DEMO_PROJECT INPUT',
			);
	})().catch((error) => {
		console.error(error.message);
		process.exitCode = 1;
	});
}
