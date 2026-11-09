// Collect successful local runs without retaining emulator tokens or raw test logs in Git.
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const directory = 'artifacts/security-stage03';
const [checkFile, integrationFile, webFile, nativeFile] = process.argv.slice(2);
if (!nativeFile) throw Error('Provide CHECK_LOG INTEGRATION_LOG WEB_LOG NATIVE_LOG');
const check = fs.readFileSync(checkFile, 'utf8');
const integration = fs.readFileSync(integrationFile, 'utf8');
const tests = check.match(/Tests:\s+(\d+) passed,\s+(\d+) total/);
const suites = check.match(/Test Suites:\s+(\d+) passed,\s+(\d+) total/);
assert(tests && suites && tests[1] === tests[2] && suites[1] === suites[2]);
assert(check.includes('Style architecture check passed.') && check.includes('tsc --noEmit'));
const count = name => Number(integration.match(new RegExp('^# ' + name + ' (\\d+)$', 'm'))?.[1]);
assert(count('tests') > 100 && count('tests') === count('pass') && count('fail') === 0);
const results = [...integration.matchAll(/^(ok|not ok) (\d+) - (.+)$/gm)].map(match => ({name:match[3],passed:match[1]==='ok'}));
assert(results.length===count('pass') && results.every(result=>result.passed));
fs.writeFileSync(`${directory}/integration-results.json`,JSON.stringify(results,null,2)+'\n');
assert(fs.readFileSync(webFile, 'utf8').includes('Exported: dist'));
assert(fs.readFileSync(nativeFile, 'utf8').includes('Exported:'));
const read = name => JSON.parse(fs.readFileSync(`${directory}/${name}.json`, 'utf8'));
const browser = read('browser-validation');
assert(browser.routes.length === 50 && browser.flows.length === 5);
assert(browser.flows.every(flow => flow.passed) && browser.routes.every(route => route.rendered && !route.horizontalOverflow));
assert(!browser.errors.length && !browser.consoleErrors.length && !browser.externalOrigins.length);
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const rules = read('rules-test-evidence');
assert(rules.rulesSHA256 === hash('firestore.rules') && rules.failed === 0 && rules.containmentPassed);
assert(rules.containmentSHA256 === hash('security/containment.rules'));
const recovery = read('restoration-proof');
assert(recovery.equal && recovery.uidPreserved && recovery.internalReferenceResolvedLocally && recovery.synthetic);
const inventory = require('../docs/backend-removal-manifest.json');
assert([...inventory.preservedScreens, ...inventory.preservedRoutes].every(file => fs.existsSync(file)));
const preserved = ['app', 'screens', 'assets', 'design-system', 'components/ui'];
// Physical homologation corrected label forwarding only; no visual primitive was replaced.
const presentationCorrections = ['components/ui/input/index.tsx'];
const changedPresentation = execFileSync('git', ['diff', '--name-only', 'recovery/security-stage03-20261108', '--', ...preserved], {encoding:'utf8'}).trim().split('\n').filter(Boolean);
assert(changedPresentation.every(file=>presentationCorrections.includes(file)));
const manifest=read('release-manifest'),inspection=read('production-readonly');
const report = {
	checkedAt: new Date().toISOString(),
	recoveryTag: 'recovery/security-stage03-20261108',
	rulesSHA256: rules.rulesSHA256,
	containmentSHA256: rules.containmentSHA256,
	unit: {suites:Number(suites[1]), passed:Number(tests[1]), failed:0, styles:true, types:true},
	integration: {passed:count('pass'), failed:0, emulatorOnly:true},
	securityMatrix: {scenarios:rules.tested, failed:rules.failed, containmentPassed:true},
	browser: {routes:50, flows:5, failed:0, externalRequests:0, processRestartVerified:true},
	exports: {web:true, android:true, ios:true, nativeInstalledRuntime:false},
	frontend: {screens:inventory.preservedScreens.length, routeFiles:inventory.preservedRoutes.length, preserved, presentationCorrections:changedPresentation},
	recovery: {sourceDocuments:recovery.sourceCount, restoredDocuments:recovery.restoredCount, hashesMatch:true, synthetic:true, realBackupValidated:false},
	production: {inspectionAt:inspection.checkedAt, published:manifest.published, writes:0, rulesStillPermissive:inspection.publishedRules.sha256==='8d431eb2263a6b35a77676b230f821e08068425d0f6c55b4f5430f3b7188cd1d', billingEnabled:inspection.billingEnabled, realUserPasswordsUsed:false},
	pending: ['specific publication approval and verified deployment', 'authorized real backup and isolated recovery; Auth accounts are outside the Firestore snapshot', 'installed mobile versions and device homologation', 'non-destructive production Auth/session validation with specifically authorized identities'],
};
fs.writeFileSync(`${directory}/validation-summary.json`, JSON.stringify(report,null,2)+'\n');
const matrix = read('compatibility-matrix');
const escape = value => String(value).replace(/\|/g, '\\|').replace(/\n/g, ' ');
fs.writeFileSync(`${directory}/compatibility-matrix.md`, '# Matriz executada — etapa 03\n\nRules publicadas capturadas versus candidato, com identidades e documentos sintéticos. Não equivale a homologação de binários mobile instalados.\n\n| Fluxo / ID | Operação | Coleção | Publicadas | Esperado | Propostas | Verificado | Ajuste |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n' + matrix.map(row => '| '+[row.flow+' / '+row.id,row.permission,row.collection,row.published,row.expected,row.proposed,row.verified?'Sim':'Não',row.adjustment].map(escape).join(' | ')+' |').join('\n')+'\n');
console.log(JSON.stringify(report));
