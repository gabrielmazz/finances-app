import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { planMigration, type CategoryReferenceReview, type Identity, type MigrationDocument, type Plan, type PreservedException, type Step } from './financial-migration/plan';
import { digest } from './financial-migration/records';
import type { OwnershipReview } from './financial-migration/authority';
import { pending, reviewExceptions } from './financial-migration/review';
import { commitStep, liveIdentities, liveSnapshot, officialProject, projectFor, tokenFor, type Project, type Snapshot } from './financial-migration/remote';

const recovery = require('./firestore-recovery-run.cjs') as {
  protectedProcess(isRestore: boolean): void; privateDirectory(directory: string): string;
};
const encryption = require('./snapshot-encryption.cjs') as {
  readEncryptedBackup(file: string, key: string): Snapshot;
  readEncryptedPayload(file: string, key: string, format: string): unknown;
  writeEncryptedPayload(file: string, value: unknown, key: string, format: string): void;
};
const manifestFormat = 'lumus-migration-encrypted-v1';
type ReleaseView = 'canary' | 'canonical';
const releaseRules = require('./financial-release-rules.cjs') as {
  releaseRulesHashes(): Record<ReleaseView, string>;
  requiredIndexes(): { collectionGroup: string; queryScope: string; fields: { fieldPath: string; order: string }[] }[];
};
const releaseSpec = () => ({ rules: releaseRules.releaseRulesHashes(), indexes: releaseRules.requiredIndexes() });
type Manifest = {
  version: 1 | 2; projectId: string; runId: string; archiveSHA256: string; sourceAt: string;
  baseline: MigrationDocument[]; identities: Identity[]; reviews: OwnershipReview[]; categoryReviews?: CategoryReferenceReview[];
  preservedExceptions?: PreservedException[];
  release?: ReturnType<typeof releaseSpec>;
  plan: Plan; sha256: string;
};
type Journal = {
  sha256: string; prepared: number | null; completed: Record<string, string>; reverted: boolean;
  rollingBack?: boolean; rollbackPending?: string[];
};
type Approval = {
  projectId: string; runId: string; manifestSHA256: string; clientFinancialWritesDenied: boolean;
  privilegedWritersPaused: boolean; rollbackBeforeClientRelease: boolean; rulesSHA256: string;
  ownerUids: string[]; contexts: string[];
  publishRules?: boolean; createIndexes?: boolean;
};

function privateFile(file: string) {
  if (!path.isAbsolute(file)) throw Error('absolute-private-file-required');
  recovery.privateDirectory(path.dirname(file));
  return file;
}

function readJson<T>(file: string): T {
  const stat = fs.lstatSync(privateFile(file));
  if (!stat.isFile() || (stat.mode & 0o077) !== 0) throw Error('private-regular-file-required');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJournal(file: string, data: Journal) {
  const temporary = file + '.partial-' + process.pid;
  try {
    fs.writeFileSync(temporary, JSON.stringify(data), { flag: 'wx', mode: 0o600, flush: true });
    fs.renameSync(temporary, file);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

function same(left: unknown, right: unknown) {
  return digest(left) === digest(right);
}

function makeManifest(project: Project, runId: string, snapshot: Snapshot, identities: Identity[], reviews: OwnershipReview[],
  categoryReviews: CategoryReferenceReview[], preservedExceptions: PreservedException[]): Manifest {
  assert.equal(snapshot.projectId, project.id, 'snapshot-project-mismatch');
  assert(snapshot.complete && snapshot.documents.length === snapshot.documentCount, 'incomplete-source-capture');
  if (!project.local) assert(snapshot.pointInTime && snapshot.readTime, 'complete-fixed-time-archive-required');
  const baseline = [...snapshot.documents].sort((a, b) => a.path < b.path ? -1 : a.path === b.path ? 0 : 1);
  assert(baseline.every(doc => doc.updateTime), 'source-revisions-required');
  const sortedIdentities = [...identities].sort((a, b) => a.uid < b.uid ? -1 : a.uid === b.uid ? 0 : 1);
  const content = {
    version: 2 as const, projectId: project.id, runId, archiveSHA256: snapshot.sha256,
    sourceAt: snapshot.readTime ?? new Date().toISOString(), baseline, identities: sortedIdentities,
    reviews, ...(categoryReviews.length ? { categoryReviews } : {}),
    ...(preservedExceptions.length ? { preservedExceptions } : {}),
    ...(project.id === officialProject ? { release: releaseSpec() } : {}),
    plan: planMigration(baseline, sortedIdentities, reviews, categoryReviews, preservedExceptions, snapshot.readTime),
  };
  return { ...content, sha256: digest(content) };
}

function readManifest(project: Project, file: string, key: string, mode: string) {
  const manifest = encryption.readEncryptedPayload(privateFile(file), privateFile(key), manifestFormat) as Manifest;
  const { sha256, ...content } = manifest;
  assert(manifest.projectId === project.id && sha256 === digest(content), 'manifest-integrity-or-project-mismatch');
  if (manifest.version === 1) {
    assert(mode === 'verify' || mode === 'rollback', 'use-new-manifest-for-migration');
  } else {
    assert(manifest.version === 2 && same(manifest.plan, planMigration(manifest.baseline, manifest.identities,
      manifest.reviews, manifest.categoryReviews, manifest.preservedExceptions, project.local ? undefined : manifest.sourceAt)),
    'manifest-integrity-or-project-mismatch');
  }
  return manifest;
}

function summary(manifest: Manifest) {
  const { entries, steps, counts } = manifest.plan;
  const byReason = Object.create(null) as Record<string, number>;
  const byCollection = Object.create(null) as Record<string, Partial<Record<Plan['entries'][number]['classification'], number>>>;
  for (const entry of entries) {
    byReason[entry.reason] = (byReason[entry.reason] ?? 0) + 1;
    const collection = byCollection[entry.path.split('/').at(-2)!] ??= {};
    collection[entry.classification] = (collection[entry.classification] ?? 0) + 1;
  }
  const declaredOwners = new Map<string, number>();
  for (const doc of manifest.baseline) {
    const uid = doc.fields.personId?.stringValue;
    if (uid) declaredOwners.set(uid, (declaredOwners.get(uid) ?? 0) + 1);
  }
  const byDeclaredOwner = [...declaredOwners.entries()].sort(([a], [b]) => a < b ? -1 : a === b ? 0 : 1)
    .map(([uid, documents], index) => ({ alias: 'titular-' + (index + 1), documents,
      matchingAuthUid: manifest.identities.some(identity => identity.uid === uid) }));
  const byVerifiedContext = { personal: 0, group: 0 };
  for (const entry of entries) {
    if (entry.context?.startsWith('personal:')) byVerifiedContext.personal++;
    if (entry.context?.startsWith('group:')) byVerifiedContext.group++;
  }
  return { projectId: manifest.projectId, runId: manifest.runId, manifestSHA256: manifest.sha256,
    capturedAt: manifest.sourceAt, sourceDocuments: entries.length, byClassification: counts, byCollection, byReason, byDeclaredOwner,
    withoutDeclaredOwner: manifest.baseline.length - byDeclaredOwner.reduce((total, owner) => total + owner.documents, 0), byVerifiedContext,
    intendedCreates: steps.reduce((total, step) => total + step.destinations.length, 0),
    ...(manifest.release ? { release: manifest.release } : {}),
    pending: entries.filter(pending).length,
    historyBalanceAdjustmentCents: manifest.plan.financialImpact.balanceAdjustmentCents,
  };
}

async function captureIdentities(project: Project, file: string | undefined, key: string) {
  if (!file) return liveIdentities(project);
  const data = encryption.readEncryptedPayload(privateFile(file), privateFile(key), 'lumus-auth-encrypted-v1') as {
    projectId: string; observedAt: string; identities: Identity[];
  };
  assert(data.projectId === project.id && Array.isArray(data.identities) && Number.isFinite(Date.parse(data.observedAt)), 'identity-evidence-project-mismatch');
  return data.identities;
}

async function reconcile(project: Project, manifest: Manifest) {
  const snapshot = await liveSnapshot(project);
  const expected = new Map(manifest.baseline.map(doc => [doc.path, doc]));
  const destinations = new Map(manifest.plan.steps.flatMap(step => step.destinations).map(doc => [doc.path, doc]));
  const applied = new Map<string, string>();
  let differences = 0;
  for (const actual of snapshot.documents) {
    if (expected.has(actual.path)) {
      if (!same(expected.get(actual.path), actual)) differences++;
      expected.delete(actual.path);
    } else {
      const planned = destinations.get(actual.path);
      if (!planned || !same(planned.fields, actual.fields) || !actual.updateTime) differences++;
      else applied.set(actual.path, actual.updateTime);
    }
  }
  differences += expected.size;
  if (!same(await liveIdentities(project), manifest.identities)) throw Error('auth-identities-or-grants-changed');
  if (differences) throw Error('source-or-destination-changed-' + differences);
  for (const step of manifest.plan.steps) {
    const present = step.destinations.filter(doc => applied.has(doc.path)).length;
    if (present && present !== step.destinations.length) throw Error('partial-atomic-step-found');
  }
  return { applied, intended: destinations.size };
}

async function rulesHash(project: Project) {
  const fetchRules = async (resource: string) => {
    if (!resource.startsWith('projects/' + project.id + '/')) throw Error('wrong-rules-project');
    const response = await fetch('https://firebaserules.googleapis.com/v1/' + resource, {
      headers: { Authorization: 'Bearer ' + tokenFor(project) }, signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw Error('migration-rules-http-' + response.status);
    return response.json();
  };
  const release = await fetchRules('projects/' + project.id + '/releases/cloud.firestore');
  const ruleset = await fetchRules(release.rulesetName);
  assert.equal(ruleset.source?.files?.length, 1, 'unexpected-rules-source');
  return require('node:crypto').createHash('sha256').update(ruleset.source.files[0].content).digest('hex') as string;
}

async function requireApproval(project: Project, manifest: Manifest, mode: string, approvalFile: string | undefined,
  receiptFile: string | undefined, confirm: string | undefined) {
  assert.equal(confirm, project.id + ':' + manifest.runId + ':' + mode, 'explicit-run-confirmation-required');
  if (mode !== 'rollback') assert.equal(summary(manifest).pending, 0, 'resolve-migration-pending-records');
  if (project.local) return;
  const approval = readJson<Approval>(approvalFile ?? '');
  const receipt = readJson<{ projectId: string; sha256: string; readTime: string; countVerified: boolean; target: string;
    restore: { equal: boolean; sourceCount: number; restoredCount: number; expectedHash: string; restoredHash: string } }>(receiptFile ?? '');
  assert(approval.projectId === project.id && approval.runId === manifest.runId && approval.manifestSHA256 === manifest.sha256 &&
    approval.clientFinancialWritesDenied === true && approval.privilegedWritersPaused === true &&
    (mode !== 'rollback' || approval.rollbackBeforeClientRelease === true), 'missing-approved-cutover-window');
  assert(receipt.projectId === project.id && receipt.sha256 === manifest.archiveSHA256 && receipt.readTime === manifest.sourceAt &&
    receipt.countVerified === true && receipt.target.startsWith('demo-lumus-') && receipt.restore.equal === true &&
    receipt.restore.sourceCount === manifest.baseline.length && receipt.restore.restoredCount === manifest.baseline.length &&
    receipt.restore.expectedHash === receipt.restore.restoredHash, 'matching-tested-backup-required');
  const age = Date.now() - Date.parse(receipt.readTime);
  assert(Number.isFinite(age) && age >= 0 && (mode !== 'apply' || age <= 24 * 60 * 60 * 1000), 'current-backup-required');
  const { createHash } = require('node:crypto') as typeof import('node:crypto');
  const closed = fs.readFileSync(path.resolve(__dirname, project.id === officialProject ? '../security/stage03-published.rules' : '../security/containment.rules'));
  const closedHash = createHash('sha256').update(closed).digest('hex');
  assert.equal(approval.rulesSHA256, closedHash, 'unexpected-pre-cutover-rules');
  let expected = closedHash;
  let published: string;
  if (project.id === officialProject && mode !== 'rollback') {
    assert(manifest.release && same(manifest.release, releaseSpec()) && approval.publishRules === true &&
      approval.createIndexes === true, 'release-candidate-changed-or-unapproved');
    const { inspectProduction } = require('./production-readiness.cjs');
    const { inspection } = await inspectProduction(tokenFor(project), { includeCounts: false });
    assert(inspection.billingEnabled === false && inspection.database.edition === 'STANDARD' && inspection.database.freeTier,
      'spark-production-required');
    expected = manifest.release.rules.canary;
    published = inspection.publishedRules.sha256;
  } else published = await rulesHash(project);
  assert.equal(published, expected, 'financial-writes-must-remain-closed');
  checkApprovedContexts(approval, manifest);
}

function checkApprovedContexts(approval: Approval, manifest: Manifest) {
  for (const entry of manifest.plan.entries) {
    if (entry.classification !== 'AUTO_MIGRATABLE' || !entry.destinations.length) continue;
    assert(approval.ownerUids.includes(entry.ownerUid!) && approval.contexts.includes(entry.context!), 'unapproved-owner-or-context');
  }
}

async function verifiedRelease(project: Project, manifest: Manifest, view: ReleaseView, approvalFile: string | undefined) {
  assert(project.id === officialProject && manifest.version === 2 && manifest.release, 'official-release-manifest-required');
  const approval = readJson<Approval>(approvalFile ?? '');
  assert(approval.projectId === project.id && approval.runId === manifest.runId &&
    approval.manifestSHA256 === manifest.sha256 && approval.publishRules === true && approval.createIndexes === true,
  'release-rules-and-indexes-approval-required');
  checkApprovedContexts(approval, manifest);
  assert(same(manifest.release, releaseSpec()), 'release-candidate-changed');
  const { inspectProduction, readonlyClient } = require('./production-readiness.cjs');
  const token = tokenFor(project);
  const { inspection } = await inspectProduction(token, { includeCounts: false });
  assert(inspection.billingEnabled === false && inspection.database.edition === 'STANDARD' && inspection.database.freeTier &&
    inspection.auth.emailPasswordEnabled, 'spark-production-required');
  const expectedRules = manifest.release.rules[view];
  assert.equal(inspection.publishedRules.sha256, expectedRules, 'release-rules-not-published');
  const read = readonlyClient(token);
  const all = await read('https://firestore.googleapis.com/v1/projects/' + project.id + '/databases/(default)/collectionGroups/-/indexes');
  assert(!all.nextPageToken && manifest.release.indexes.every(index => all.indexes?.some((item: {
    name: string; state: string; queryScope: string; fields: typeof index.fields;
  }) => item.state === 'READY' && item.name.includes('/collectionGroups/' + index.collectionGroup + '/') &&
    item.queryScope === index.queryScope && same(item.fields, index.fields))), 'release-indexes-not-ready');
  return {
    status: 'published-verified', projectId: project.id, appId: inspection.sdk.appId, authDomain: inspection.sdk.authDomain,
    financialSchemaVersion: 2, migrationManifestSHA256: manifest.sha256, rulesSHA256: expectedRules,
    canonicalRulesSHA256: expectedRules, verifiedAt: inspection.checkedAt, financialWritesEnabled: view !== 'canary',
    published: true, releaseView: view,
  };
}

function sourceChecks(manifest: Manifest, steps: Step[]) {
  const requested = new Set(steps.flatMap(step => step.sources));
  return manifest.baseline.filter(doc => requested.has(doc.path) || /^(_bankScopes|_categoryScopes|_authorizations|financialGroups)\/[^/]+$/.test(doc.path))
    .map(doc => ({ path: doc.path, updateTime: doc.updateTime! }));
}

async function mutate(project: Project, manifest: Manifest, file: string, mode: string, stepLimit: number) {
  const journalPath = privateFile(file);
  const lock = journalPath + '.lock';
  const handle = fs.openSync(lock, fs.constants.O_CREAT | fs.constants.O_RDWR | fs.constants.O_NOFOLLOW, 0o600);
  try {
    const lease = spawnSync('flock', ['-n', '3'], { stdio: ['ignore', 'ignore', 'ignore', handle] });
    assert.equal(lease.status, 0, 'migration-journal-locked-or-flock-unavailable');
    if (mode === 'apply') assert(!fs.existsSync(journalPath), 'existing-run-use-resume');
    const journal: Journal = mode === 'apply' ? { sha256: manifest.sha256, prepared: null, completed: {}, reverted: false } : readJson(journalPath);
    assert(journal.sha256 === manifest.sha256 && !journal.reverted, 'wrong-or-reverted-run');
    assert(!journal.rollingBack || mode === 'rollback', 'continue-existing-rollback');
    const { applied, intended } = await reconcile(project, manifest);
    if (journal.rollbackPending?.length) {
      const remaining = journal.rollbackPending.filter(name => applied.has(name)).length;
      assert(remaining === journal.rollbackPending.length || remaining === 0, 'partial-rollback-batch-found');
      if (!remaining) for (const name of journal.rollbackPending) delete journal.completed[name];
      journal.rollbackPending = [];
      writeJournal(journalPath, journal);
    }
    const paths = new Set(Object.keys(journal.completed));
    for (const [name, updateTime] of Object.entries(journal.completed))
      assert.equal(applied.get(name), updateTime, 'applied-document-version-changed');
    if (journal.prepared !== null) {
      assert(mode === 'resume', 'resume-inflight-step-before-rollback');
      const inflight = manifest.plan.steps.slice(journal.prepared, journal.prepared + 20).flatMap(step => step.destinations);
      for (const doc of inflight) if (applied.has(doc.path)) paths.add(doc.path);
    }
    assert(applied.size === paths.size, 'unrecognized-applied-document');
    if (mode === 'rollback') {
      const reversed = [...manifest.plan.steps].reverse().filter(step => applied.has(step.destinations[0].path));
      const checks = manifest.baseline.filter(doc => /^(_bankScopes|_categoryScopes|_authorizations|financialGroups)\/[^/]+$/.test(doc.path))
        .map(doc => ({ path: doc.path, updateTime: doc.updateTime! }));
      let reverted = 0;
      journal.rollingBack = true;
      for (let start = 0; start < reversed.length; start += 20) {
        const targets = reversed.slice(start, start + 20).flatMap(step => step.destinations).map(doc => doc.path);
        journal.rollbackPending = targets;
        writeJournal(journalPath, journal);
        await commitStep(project, [], checks, targets.map(path => ({ path, updateTime: applied.get(path)!, rollback: true })));
        for (const name of targets) delete journal.completed[name];
        journal.rollbackPending = [];
        writeJournal(journalPath, journal);
        reverted += targets.length;
      }
      assert.equal((await reconcile(project, manifest)).applied.size, 0, 'rollback-verification-failed');
      journal.reverted = true;
      writeJournal(journalPath, journal);
      return { reverted };
    }
    for (const [name, timestamp] of applied) journal.completed[name] = timestamp;
    let batches = 0;
    for (let offset = 0; offset < manifest.plan.steps.length && batches < stepLimit; offset += 20) {
      const group = manifest.plan.steps.slice(offset, offset + 20).filter(step => !applied.has(step.destinations[0].path));
      if (!group.length) continue;
      journal.prepared = offset;
      writeJournal(journalPath, journal);
      let created;
      try { created = await commitStep(project, group.flatMap(step => step.destinations), sourceChecks(manifest, group)); }
      catch (error) {
        const code = error instanceof Error ? error.message : 'unknown';
        throw Error('migration-batch-' + offset + '-stopped-' + code);
      }
      for (const doc of created) journal.completed[doc.path] = doc.updateTime;
      journal.prepared = null;
      writeJournal(journalPath, journal);
      batches++;
    }
    journal.prepared = null;
    writeJournal(journalPath, journal);
    return { applied: Object.keys(journal.completed).length, intended, requiresVerify: true };
  } finally {
    fs.closeSync(handle);
  }
}

export async function main(args: string[]) {
  process.umask(0o077);
  const { values: options, positionals } = parseArgs({ args, allowPositionals: true, options: {
    project: { type: 'string' }, run: { type: 'string' }, backup: { type: 'string' }, key: { type: 'string' },
    identities: { type: 'string' }, reviews: { type: 'string' }, manifest: { type: 'string' }, journal: { type: 'string' },
    'review-report': { type: 'string' }, 'category-reviews': { type: 'string' }, 'preserve-exceptions': { type: 'string' },
    approval: { type: 'string' }, 'restore-receipt': { type: 'string' }, confirm: { type: 'string' }, 'batch-limit': { type: 'string' },
    'release-view': { type: 'string' }, 'client-readiness': { type: 'string' },
  } });
  const mode = positionals[0] ?? 'dry-run', runId = options.run ?? '';
  assert(positionals.length <= 1 && ['inventory', 'dry-run', 'review', 'verify', 'apply', 'resume', 'rollback'].includes(mode), 'invalid-migration-mode');
  assert(/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,39}$/.test(runId), 'explicit-valid-run-id-required');
  const project = projectFor(options.project ?? '');
  if (!project.local) recovery.protectedProcess(false);
  const key = privateFile(options.key ?? '');
  if (mode === 'review') {
    assert(fs.statfsSync('/dev/shm').type === 0x01021994, 'private-review-view-requires-tmpfs');
    const report = encryption.readEncryptedPayload(privateFile(options['review-report'] ?? ''), key, manifestFormat) as {
      kind: string; projectId: string; runId: string; report: ReturnType<typeof reviewExceptions>;
    };
    assert(report.kind === 'ownership-review-v1' && report.projectId === project.id && report.runId === runId, 'review-report-project-run-mismatch');
    const directory = fs.mkdtempSync('/dev/shm/lumus-ownership-review-');
    const detail = path.join(directory, 'detalhes.json');
    const worksheet = path.join(directory, 'revisao.md');
    const clean = (value: string | null | undefined) => String(value ?? '—').replace(/[\x00-\x1f|\x7f]/g, ' ');
    fs.writeFileSync(detail, JSON.stringify(report, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    const byOwner = Map.groupBy(report.report.decisions, decision => decision.ownerAlias ?? 'sem-titular');
    const sections = [...byOwner.entries()].map(([owner, decisions]) => [
      '## ' + owner, '', '| Origem | Tipo | Nome | Contexto pessoal possível | Vínculo protegido | Dependentes | Decisão |',
      '| --- | --- | --- | --- | --- | ---: | --- |',
      ...decisions.map(decision => '| ' + [clean(decision.path), decision.kind === 'bank' ? 'Banco' : 'Categoria', clean(decision.name),
        decision.proposedScope ? owner : 'Indeterminado', decision.protectedBinding ? clean(decision.protectedBinding.path) : 'Ausente',
        decision.dependents.length, 'Pendente'].join(' | ') + ' |'), '',
    ].join('\n'));
    const exceptions = report.report.exceptionGroups.map((group, index) => {
      const origins = group.relatedOrigins.map(origin => clean(origin.path) + (origin.exists ? '' : ' (ausente)')).join(', ');
      return '| ' + [String(index + 1), clean(group.reason), clean(group.declaredOwner), origins || '—',
        group.documents.length, 'Pendente'].join(' | ') + ' |';
    });
    const categories = (report.report.categoryDecisions ?? []).map(group => '| ' +
      [clean(group.bankPath ?? group.context), clean(group.categoryPath), clean(group.categoryName), String(group.movements.length)].join(' | ') + ' |');
    const categorySection = categories.length ? ['## Referências históricas de categoria', '',
      'A categoria projetada fica arquivada no contexto confirmado da movimentação e serve para exibir o histórico. A categoria original conserva o seu contexto.', '',
      '| Banco ou contexto do dinheiro | Categoria de origem | Nome | Movimentações conciliadas |',
      '| --- | --- | --- | ---: |', ...categories, ''] : [];
    const templates = (report.report.templateDecisions ?? []).map(row => '| ' +
      [clean(row.templatePath), clean(row.templateName), clean(row.categoryName), row.validated ? 'Validada na simulação' : 'Pendente'].join(' | ') + ' |');
    const templateSection = templates.length ? ['## Categoria das próximas ocorrências', '',
      '| Modelo | Nome | Categoria ativa | Situação |', '| --- | --- | --- | --- |', ...templates, ''] : [];
    fs.writeFileSync(worksheet, ['# Revisão privada de associações do Lumus', '',
      'As origens pendentes exigem evidência de titularidade. Os detalhes, as decisões e os documentos dependentes estão em detalhes.json.', '',
      ...sections, ...categorySection, ...templateSection,
      '## Exceções após simular a confirmação das origens', '',
      'Cada grupo reúne registros com a mesma causa, titular declarado e referências. A evidência de uma origem não confirma o vínculo de um registro contraditório.', '',
      '| Grupo | Causa | Titular declarado | Origens relacionadas | Registros | Decisão |', '| ---: | --- | --- | --- | ---: | --- |',
      ...exceptions].join('\n') + '\n', { mode: 0o600, flag: 'wx' });
    return { mode, projectId: project.id, runId, worksheet, detail };
  }
  const file = privateFile(options.manifest ?? '');
  if (mode === 'inventory' || mode === 'dry-run') {
    if (!project.local && !options.backup) throw Error('use-captured-encrypted-archive-for-remote-dry-run');
    const snapshot = options.backup ? encryption.readEncryptedBackup(privateFile(options.backup), key) : await liveSnapshot(project);
    const identities = await captureIdentities(project, options.identities, key);
    const reviews = options.reviews ? readJson<OwnershipReview[]>(options.reviews) : [];
    const categoryReviews = options['category-reviews'] ? readJson<CategoryReferenceReview[]>(options['category-reviews']) : [];
    const preservedExceptions = options['preserve-exceptions'] ? readJson<PreservedException[]>(options['preserve-exceptions']) : [];
    const manifest = makeManifest(project, runId, snapshot, identities, reviews, categoryReviews, preservedExceptions);
    encryption.writeEncryptedPayload(file, manifest, key, manifestFormat);
    const report = options['review-report'] ? reviewExceptions(manifest.baseline, identities, manifest.plan, reviews, categoryReviews) : null;
    if (report) encryption.writeEncryptedPayload(privateFile(options['review-report']!), {
      kind: 'ownership-review-v1', projectId: project.id, runId, manifestSHA256: manifest.sha256, report,
    }, key, manifestFormat);
    return { mode, ...summary(manifest), ...(report ? { review: report.summary } : {}), remoteWrites: 0 };
  }
  const manifest = readManifest(project, file, key, mode);
  assert.equal(manifest.runId, runId, 'manifest-run-id-mismatch');
  if (mode === 'verify') {
    const result = await reconcile(project, manifest);
    const complete = result.applied.size === result.intended && summary(manifest).pending === 0;
    if (options['release-view'] || options['client-readiness']) {
      const view = options['release-view'] as ReleaseView;
      assert(complete && ['canary', 'canonical'].includes(view), 'verified-complete-migration-and-release-view-required');
      const destination = privateFile(options['client-readiness'] ?? '');
      const readiness = await verifiedRelease(project, manifest, view, options.approval);
      fs.writeFileSync(destination, JSON.stringify(readiness, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    }
    return { mode, ...summary(manifest), matches: result.applied.size, complete,
      missingDestinations: result.intended - result.applied.size, remoteWrites: 0 };
  }
  await requireApproval(project, manifest, mode, options.approval, options['restore-receipt'], options.confirm);
  const limit = options['batch-limit'] === undefined ? Infinity : Number(options['batch-limit']);
  assert(limit === Infinity || project.local && Number.isSafeInteger(limit) && limit >= 1, 'batch-limit-demo-only');
  return { mode, ...summary(manifest), ...await mutate(project, manifest, options.journal ?? '', mode, limit) };
}

if (require.main === module) main(process.argv.slice(2)).then(result => console.log(JSON.stringify(result))).catch(error => {
  // Detailed source IDs and fields belong to the encrypted manifest.
  const code = error instanceof Error && /^[a-z0-9:-]+$/.test(error.message) ? error.message : 'invalid-operator-input-or-migration-failed';
  console.error(code);
  process.exitCode = 1;
});
