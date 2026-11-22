const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { exportSnapshot } = require('./firestore-snapshot.cjs');
const { readEncryptedBackup, writeEncryptedBackup } = require('./snapshot-encryption.cjs');
const { privateDirectory, protectedProcess, recover } = require('./firestore-recovery-run.cjs');

const officialProject = 'finances-app-e8685';
const stagingProject = 'lumus-financas-hml';

async function capture({ projectId, token, file, keyFile }) {
	assert([officialProject, stagingProject].includes(projectId), 'Use an explicit Lumus project');
	assert(token, 'Read-only OAuth required');
	const backupDirectory = privateDirectory(path.dirname(file));
	const keyDirectory = privateDirectory(path.dirname(keyFile));
	assert.notEqual(backupDirectory, keyDirectory, 'Store the key separately from the archive');
	assert(!fs.existsSync(file) && !fs.existsSync(keyFile), 'Use new capture and key paths');
	const readTime = new Date(Date.now() - 60_000).toISOString();
	const snapshot = await exportSnapshot({ projectId, token, readTime, maxDocuments: 3000, maxRequests: 6000, delayMs: 25 });
	fs.writeFileSync(keyFile, randomBytes(32), { flag: 'wx', mode: 0o600 });
	writeEncryptedBackup(file, snapshot, keyFile);
	assert.equal(readEncryptedBackup(file, keyFile).sha256, snapshot.sha256);
	return summarize(snapshot);
}

function summarize(snapshot) {
	const collections = Object.create(null);
	for (const [collectionPath, count] of Object.entries(snapshot.collectionCounts)) {
		const collection = collectionPath.split('/').at(-1);
		collections[collection] = (collections[collection] ?? 0) + count;
	}
	return { projectId: snapshot.projectId, sha256: snapshot.sha256, readTime: snapshot.readTime,
		startedAt: snapshot.startedAt, exportedAt: snapshot.exportedAt, documents: snapshot.documentCount,
		collections, countVerified: true, productionWrites: 0 };
}

async function run(action, input) {
	assert(['capture', 'restore'].includes(action));
	protectedProcess(action === 'restore');
	if (action === 'capture') return capture(input);
	const snapshot = readEncryptedBackup(input.file, input.keyFile);
	assert([officialProject, stagingProject].includes(snapshot.projectId), 'Restore only a Lumus archive');
	assert(snapshot.pointInTime && snapshot.collectionCounts, 'Use the current verified-count archive');
	const proof = await recover(snapshot, input);
	return { ...summarize(snapshot), restore: proof, target: input.target };
}

module.exports = { run };
if (require.main === module) {
	process.umask(0o077);
	Promise.resolve().then(() => run(process.argv[2], JSON.parse(fs.readFileSync(0, 'utf8'))))
		.then(result => console.log(JSON.stringify(result)))
		.catch(() => {
			console.error('Protected migration capture or recovery failed. No production records were written.');
			process.exitCode = 1;
		});
}
