// REST export uses document reads; it does not use the paid managed export service.
const { createHash } = require('node:crypto');
const { readFileSync, writeFileSync } = require('node:fs');
function encodePath(value) {
	return value.split('/').map(encodeURIComponent).join('/');
}
function canonical(value) {
	if (Array.isArray(value)) return value.map(canonical);
	if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
	return value;
}
function digest(documents) {
	return createHash('sha256').update(JSON.stringify(canonical(documents))).digest('hex');
}
function validate(snapshot) {
	if (
		![1,2].includes(snapshot.version) ||
		!Array.isArray(snapshot.documents) ||
		(snapshot.version === 2 ? snapshot.documentCount !== snapshot.documents.length || snapshot.complete !== true ||
		 snapshot.sha256 !== digest(Object.fromEntries(Object.entries(snapshot).filter(([key])=>key!=='sha256'))) :
		 snapshot.sha256 !== createHash('sha256').update(JSON.stringify(snapshot.documents)).digest('hex'))
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
function rest(projectId, token, local, {maxRequests = 10000, delayMs = 0} = {}) {
	if (!/^[a-z][a-z0-9-]+$/.test(projectId)) throw Error('Invalid project');
	if (local && !projectId.startsWith('demo-')) throw Error('Local snapshots require demo- project');
	if (!local && !token) throw Error('Read-only OAuth access token required');
	const origin = local ? 'http://127.0.0.1:8089' : 'https://firestore.googleapis.com';
	const root = `/v1/projects/${projectId}/databases/(default)/documents`;
	let requests = 0;
	return {
		root,
		async request(method, path, body) {
			if (++requests > maxRequests) throw Error('Request budget reached; no complete backup produced');
			// The only remote POST permitted is metadata listing, which does not write data.
			if (!local && method !== 'GET' && !(method === 'POST' && path.endsWith(':listCollectionIds')))
				throw Error('Production writes forbidden');
			if(delayMs) await new Promise(resolve=>setTimeout(resolve,delayMs));
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
async function exportSnapshot({ projectId, token = undefined, local = false, maxDocuments = 1000, maxBytes = 32*1024*1024, maxRequests = 10000, delayMs = 0 }) {
	if (!Number.isSafeInteger(maxDocuments) || maxDocuments < 1 || maxDocuments > 50000)
		throw Error('Set an explicit document budget between 1 and 50000');
	if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>128*1024*1024||!Number.isSafeInteger(maxRequests)||maxRequests<1||maxRequests>100000||!Number.isSafeInteger(delayMs)||delayMs<0||delayMs>1000)throw Error('Invalid byte/request/rate budget');
	const startedAt = new Date().toISOString();
	const api = rest(projectId, token, local, {maxRequests,delayMs});
	const documents = [];
	let scannedDocuments = 0;
	let bytes = 0;
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
						if (document.createTime) {
							const record = {path:document.name.slice(prefix.length),fields:document.fields||{}};
							bytes += Buffer.byteLength(JSON.stringify(record));
							if(bytes > maxBytes)throw Error('Byte budget reached; no complete backup produced');
							documents.push(record);
						}
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
	const snapshot = {
		version: 2,
		projectId,
		database: '(default)',
		exportedAt: new Date().toISOString(),
		startedAt,
		pointInTime: false,
		complete: true,
		documentCount: documents.length,
		serializedDocumentBytes: bytes,
		scannedDocuments,
		documents,
	};
	return validate({...snapshot,sha256:digest(snapshot)});
}
function remapReferences(value, source, target) {
	if (Array.isArray(value)) return value.map(item=>remapReferences(item,source,target));
	if (!value || typeof value !== 'object') return value;
	return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,key==='referenceValue'&&typeof item==='string'&&item.startsWith(source+'/')?target+item.slice(source.length):remapReferences(item,source,target)]));
}
function compareSnapshots(source, restored, {remappedReferences = false} = {}) {
	validate(source);validate(restored);
	const expected = remappedReferences ? remapReferences(source.documents,`projects/${source.projectId}/databases/(default)/documents`,`projects/${restored.projectId}/databases/(default)/documents`) : source.documents;
	const byPath = records => [...records].sort((left,right)=>left.path.localeCompare(right.path));
	const expectedHash=digest(byPath(expected)),restoredHash=digest(byPath(restored.documents));
	return {equal:expectedHash===restoredHash,sourceCount:source.documents.length,restoredCount:restored.documents.length,expectedHash,restoredHash};
}
async function restoreToEmulator(snapshot, targetProject, {remapInternalReferences = false} = {}) {
	validate(snapshot);
	if (!targetProject?.startsWith('demo-')) throw Error('Restore is allowed only in a demo- emulator project');
	const api = rest(targetProject, null, true);
	const documents = remapInternalReferences ? remapReferences(snapshot.documents,`projects/${snapshot.projectId}/databases/(default)/documents`,api.root.slice(4)) : snapshot.documents;
	// Preflight all collisions before writing. Every commit also has a create-only precondition.
	for (const document of documents) {
		try {
			await api.request('GET', `${api.root}/${encodePath(document.path)}`);
			throw Error('Restore target contains documents');
		} catch (error) {
			if (error.message !== 'Firestore HTTP 404') throw error;
		}
	}
	for (let start = 0; start < documents.length; start += 100) {
		await api.request('POST', api.root.replace(/\/documents$/, '/documents:commit'), {
			writes: documents.slice(start, start + 100).map((document) => ({
				update: { name: api.root.slice(4) + '/' + document.path, fields: document.fields },
				currentDocument: { exists: false },
			})),
		});
	}
	return snapshot.documents.length;
}
module.exports = { exportSnapshot, restoreToEmulator, validate, compareSnapshots };
if (require.main === module) {
	(async () => {
		const [action, projectId, file, budget, requestBudget, byteBudget] = process.argv.slice(2);
		if (action === 'export-local' || action === 'export-readonly') {
			if (!file) throw Error('Specify an output on an encrypted, private volume');
			if(action==='export-readonly')require('./snapshot-encryption.cjs').preflightEncryptedBackup(file,process.env.LUMUS_BACKUP_KEY_FILE);
			const snapshot = await exportSnapshot({
				projectId,
				local: action === 'export-local',
				token: process.env.GOOGLE_OAUTH_ACCESS_TOKEN,
				maxDocuments: Number(budget),
				maxRequests: requestBudget === undefined ? 10000 : Number(requestBudget),
				maxBytes: byteBudget === undefined ? 32*1024*1024 : Number(byteBudget),
				delayMs: action==='export-readonly'?25:0,
			});
			if(action==='export-readonly') {
				const { writeEncryptedBackup } = require('./snapshot-encryption.cjs');
				writeEncryptedBackup(file,snapshot,process.env.LUMUS_BACKUP_KEY_FILE);
			}else writeFileSync(file, JSON.stringify(snapshot), { flag: 'wx', mode: 0o600 });
			console.log(
				`Complete traversal saved: ${snapshot.documents.length} documents; checksum ${snapshot.sha256}. Restore validation is still required.`,
			);
		} else if (action === 'restore-local' || action === 'restore-encrypted-local') {
			const snapshot = action==='restore-encrypted-local' ? require('./snapshot-encryption.cjs').readEncryptedBackup(file,process.env.LUMUS_BACKUP_KEY_FILE) : validate(JSON.parse(readFileSync(file, 'utf8')));
			console.log(
				`Restored ${await restoreToEmulator(snapshot, projectId, {remapInternalReferences:true})} documents to isolated demo project.`,
			);
			// Version 1 has no scannedDocuments; count real and missing ancestor paths.
			const ancestors = new Set();
			for (const document of snapshot.documents) {
				const parts = document.path.split('/');
				for (let depth = 2; depth <= parts.length; depth += 2) ancestors.add(parts.slice(0, depth).join('/'));
			}
			const restored=await exportSnapshot({projectId,local:true,maxDocuments:Math.min(50000,ancestors.size+100)});
			const proof=compareSnapshots(snapshot,restored,{remappedReferences:true});
			if(!proof.equal)throw Error('Restore integrity verification failed');
			console.log(JSON.stringify({...proof,sourceProject:snapshot.projectId,targetProject:projectId,realDataValidation:'Operator must confirm source completeness and authorization separately'}));
		} else
			throw Error(
				'Use export-local|export-readonly PROJECT OUTPUT MAX_DOCUMENTS [MAX_REQUESTS] [MAX_BYTES], or restore-local|restore-encrypted-local DEMO_PROJECT INPUT',
			);
	})().catch((error) => {
		console.error(error.message);
		process.exitCode = 1;
	});
}
