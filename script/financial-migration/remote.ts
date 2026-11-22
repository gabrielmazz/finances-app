import { validId } from '../../domain/banks';
import type { Destination, Identity, MigrationDocument } from './records';

export const officialProject = 'finances-app-e8685';
export const stagingProject = 'lumus-financas-hml';
export type Project = { id: string; local: boolean };
export type Snapshot = {
  projectId: string; version: number; complete: boolean; pointInTime: boolean; readTime?: string;
  sha256: string; documentCount: number; documents: MigrationDocument[];
};
type Read = { projectId: string; local: boolean; token?: string; includeMetadata: boolean; readTime?: string; maxDocuments: number; maxRequests: number; delayMs?: number };
const { exportSnapshot }: { exportSnapshot(input: Read): Promise<Snapshot> } = require('../firestore-snapshot.cjs');

export function projectFor(id: string): Project {
  if (/^demo-lumus-[a-z0-9-]+$/.test(id)) return { id, local: true };
  if ([officialProject, stagingProject].includes(id)) return { id, local: false };
  throw Error('migration-project-not-allowed');
}

export function tokenFor(project: Project) {
  const value = process.env.GOOGLE_OAUTH_ACCESS_TOKEN;
  if (!project.local && (!value || process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST))
    throw Error('remote-project-requires-explicit-oauth-and-no-emulator-environment');
  return project.local ? 'owner' : value!;
}

export async function liveSnapshot(project: Project) {
  let readTime: string | undefined;
  if (!project.local) {
    const root = 'projects/' + project.id + '/databases/(default)/documents';
    const response = await fetch('https://firestore.googleapis.com/v1/' + root + ':batchGet', {
      method: 'POST', headers: { Authorization: 'Bearer ' + tokenFor(project), 'Content-Type': 'application/json' },
      body: JSON.stringify({ documents: [root + '/financialContexts/migration-clock'], mask: { fieldPaths: ['__name__'] } }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw Error('migration-read-time-http-' + response.status);
    readTime = (await response.json())[0]?.readTime;
    if (!readTime) throw Error('migration-server-read-time-required');
  }
  return exportSnapshot({
    projectId: project.id, local: project.local, token: tokenFor(project), includeMetadata: true, readTime,
    maxDocuments: 4000, maxRequests: 8000, delayMs: project.local ? 0 : 25,
  });
}

export async function liveIdentities(project: Project): Promise<Identity[]> {
  const origin = project.local ? 'http://127.0.0.1:9098/identitytoolkit.googleapis.com' : 'https://identitytoolkit.googleapis.com';
  const path = '/v1/projects/' + project.id + '/accounts:batchGet';
  const identities: Identity[] = [];
  const pages = new Set<string>();
  let page: string | undefined;
  do {
    const parameters = new URLSearchParams({ maxResults: '100', fields: 'nextPageToken,users(localId,disabled,customAttributes)' });
    if (page) parameters.set('nextPageToken', page);
    const response = await fetch(origin + path + '?' + parameters, {
      headers: { Authorization: 'Bearer ' + tokenFor(project) }, signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw Error('auth-inventory-http-' + response.status);
    const result = await response.json();
    for (const document of result.users ?? []) {
      if (!validId(document.localId)) throw Error('invalid-inventory-uid');
      const claim = document.customAttributes ? JSON.parse(document.customAttributes).lumusAccess : undefined;
      identities.push({ uid: document.localId, disabled: document.disabled === true, ...(typeof claim === 'string' ? { generation: claim } : {}) });
    }
    page = result.nextPageToken;
    if ((page && pages.has(page)) || identities.length > 10_000 || pages.size >= 100) throw Error('auth-inventory-incomplete');
    if (page) pages.add(page);
  } while (page);
  return identities.sort((a, b) => a.uid < b.uid ? -1 : a.uid === b.uid ? 0 : 1);
}

function validPath(path: string): boolean {
  const segments = path.split('/');
  return segments.length > 0 && segments.length % 2 === 0 &&
    segments.every(segment => segment && segment !== '.' && segment !== '..' && Buffer.byteLength(segment) <= 1_500);
}

function allowedDestination(path: string): boolean {
  return validPath(path) && /^financialContexts\/(personal|group):[A-Za-z0-9_-]{1,128}\/(bankAccounts|movements|categories|mandatoryTemplates)\/[^/]+$/.test(path);
}

type Verify = { path: string; updateTime: string };
type Remove = { path: string; updateTime: string; rollback: true };

export async function commitStep(project: Project, create: Destination[], verify: Verify[], remove: Remove[] = []) {
  if ((!create.length && !remove.length) || (create.length > 0 && remove.length > 0) || create.length + verify.length + remove.length > 500 ||
      create.some(doc => !allowedDestination(doc.path)) || remove.some(doc => !allowedDestination(doc.path) || !doc.rollback) ||
      verify.some(doc => !validPath(doc.path) || !doc.updateTime))
    throw Error('migration-write-scope-rejected');
  const root = 'projects/' + project.id + '/databases/(default)/documents';
  const origin = project.local ? 'http://127.0.0.1:8089' : 'https://firestore.googleapis.com';
  const endpoint = origin + '/v1/' + root;
  async function post(action: string, body: object) {
    const response = await fetch(endpoint + ':' + action, {
      method: 'POST', headers: { Authorization: 'Bearer ' + tokenFor(project), 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw Error('migration-' + action + '-http-' + response.status);
    return response.json();
  }
  const writes = [
    ...create.map(doc => ({ update: { name: root + '/' + doc.path, fields: doc.fields }, currentDocument: { exists: false } })),
    ...remove.map(doc => ({ delete: root + '/' + doc.path, currentDocument: { updateTime: doc.updateTime } })),
  ];
  const transaction = verify.length ? (await post('beginTransaction', { options: { readWrite: {} } })).transaction : undefined;
  let result;
  try {
    if (transaction) {
      const expected = new Map(verify.map(doc => [root + '/' + doc.path, doc.updateTime]));
      const live = await post('batchGet', { transaction, documents: [...expected.keys()], mask: { fieldPaths: ['__name__'] } });
      for (const answer of live) {
        const name = answer.found?.name;
        if (!name || expected.get(name) !== answer.found.updateTime) throw Error('transaction-source-changed');
        expected.delete(name);
      }
      if (expected.size) throw Error('transaction-source-check-incomplete');
    } else if (verify.length) throw Error('migration-missing-transaction');
    result = await post('commit', { writes, ...(transaction ? { transaction } : {}) });
  } catch (error) {
    if (transaction) await post('rollback', { transaction }).catch(() => undefined);
    throw error;
  }
  if (result.writeResults?.length !== writes.length) throw Error('migration-commit-result-incomplete');
  return create.map((doc, index) => {
    const updateTime: unknown = result.writeResults[index].updateTime;
    if (typeof updateTime !== 'string') throw Error('migration-commit-missing-update-time');
    return { path: doc.path, updateTime };
  });
}
