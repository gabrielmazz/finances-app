const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const security = path.join(__dirname, '..', 'security');
const read = name => fs.readFileSync(path.join(security, name), 'utf8');
const sha256 = source => createHash('sha256').update(source).digest('hex');

function block(source, start, end) {
	const first = source.indexOf('\n' + start) + 1;
	const last = source.indexOf('\n' + end, first + start.length) + 1;
	assert(first > 0 && last > first, 'Rules transition anchors changed');
	return source.slice(first, last);
}

function financialReleaseRules() {
	const canonical = read('financial-canonical.rules');
	const published = read('stage03-published.rules');
	const group = block(canonical, '    match /financialGroups/{groupId}', '    match /users/{uid}');
	const legacyAuthority = block(published, '    function mayReadOwner', '    function hasGroupAccess') +
		block(published, '    function legacyCollection', '    function isValidName');
	const legacyGroups = block(published, '    match /financialGroups/{groupId}', '    match /_authorizations/{uid}');
	const legacyCollections = block(published, '    match /{collection}/{id}', '    match /{document=**}');
	const transition = canonical.replace(group, legacyAuthority + legacyGroups + legacyCollections);
	const enabled = '    function canonicalFinancialWritesEnabled() { return true; }';
	assert(transition.includes(enabled), 'Missing canonical financial write gate');
	const canary = transition.replace(enabled, enabled.replace('true', 'false'));
	return { canary, canonical };
}

function releaseRulesHashes() {
	return Object.fromEntries(Object.entries(financialReleaseRules()).map(([name, source]) => [name, sha256(source)]));
}

function requiredIndexes() {
	return JSON.parse(read('financial-canonical.indexes.json')).indexes;
}

module.exports = { financialReleaseRules, releaseRulesHashes, requiredIndexes, sha256 };

if (require.main === module) {
	const directory = path.resolve(process.argv[2] ?? 'artifacts/mvp-1.6/rules');
	fs.mkdirSync(directory, { recursive: true });
	for (const [name, source] of Object.entries(financialReleaseRules())) {
		const file = name + '.rules';
		fs.writeFileSync(path.join(directory, file), source);
		fs.writeFileSync(path.join(directory, 'firebase.' + name + '.json'),
			JSON.stringify({ firestore: { rules: file } }, null, 2) + '\n');
	}
	console.log(JSON.stringify(releaseRulesHashes()));
}
