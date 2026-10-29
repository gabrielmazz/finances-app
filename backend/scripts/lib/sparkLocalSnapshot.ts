import { createHash } from 'node:crypto';

// [[Inventário e Restauração Local Spark]]: transporte restrito ao Emulator; nenhum SDK/ADC.
export type Fields = Record<string, Record<string, unknown>>;
export type SnapshotDocument = { path: string; fields: Fields; createTime?: string; updateTime?: string };
export type LocalSnapshot = {
  format: 'lumus-firestore-emulator-snapshot'; schemaVersion: 1; projectId: string; databaseId: '(default)';
  capturedAt: string; consistency: 'two-matching-scans-not-point-in-time'; documents: SnapshotDocument[];
  artifacts: { rules: string; indexes: string }; sha256: string;
};
const MAX_DOCUMENTS = 100_000;
export const MAX_SNAPSHOT_BYTES = 128 * 1024 * 1024;
export class LocalSnapshotError extends Error {}
function localHost(host: string) {
  requireThat(/^(127\.0\.0\.1|\[::1\]):[1-9]\d{3,4}$/.test(host) && Number(host.split(':').at(-1)) <= 65535, 'Host deve ser loopback literal com porta entre 1000 e 65535.');
}
const record = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
function requireThat(condition: unknown, message: string): asserts condition { if (!condition) throw new LocalSnapshotError(message); }
function keys(value: unknown, allowed: string[], required = allowed): asserts value is Record<string, any> {
  requireThat(record(value) && Object.keys(value).every(key => allowed.includes(key)) && required.every(key => Object.hasOwn(value, key)), 'Estrutura do snapshot inválida.');
}
export function canonical(value: unknown): string {
  if (value instanceof Date) { requireThat(Number.isFinite(value.valueOf()), 'Data inválida no relatório.'); return JSON.stringify(value.toISOString()); }
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (record(value)) return '{' + Object.keys(value).filter(key => value[key] !== undefined).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  requireThat(value === null || ['string', 'boolean', 'number'].includes(typeof value), 'Valor JSON inválido.');
  requireThat(typeof value !== 'number' || Number.isFinite(value), 'Número JSON inválido.');
  return Object.is(value, -0) ? '-0' : JSON.stringify(value);
}
export const digest = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
function project(projectId: unknown): asserts projectId is string {
  requireThat(typeof projectId === 'string' && /^demo-[a-z0-9][a-z0-9-]{0,54}$/.test(projectId), 'Somente projeto demo-* explícito é permitido.');
}
function segment(value: unknown): asserts value is string {
  requireThat(typeof value === 'string' && value.length > 0 && Buffer.byteLength(value) <= 1500 && !['.', '..'].includes(value) && !value.includes('/'), 'Segmento Firestore inválido.');
  encodeURIComponent(value);
}
export function documentPath(value: unknown): asserts value is string {
  requireThat(typeof value === 'string', 'Caminho de documento inválido.');
  const parts = value.split('/');
  requireThat(parts.length % 2 === 0 && parts.length <= 200, 'Caminho de documento inválido.');
  parts.forEach(segment);
}
const validTimestamp = (value: unknown) => typeof value === 'string' && !value.startsWith('0000')
  && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/.test(value) && Number.isFinite(Date.parse(value))
  && new Date(value).toISOString().slice(0, 19) === value.slice(0, 19);

/** Mantém o JSON Value oficial: int64 em string, nanos, bytes, refs e tipos não financeiros. */
export function validateFields(value: unknown, depth = 0): asserts value is Fields {
  requireThat(record(value) && depth <= 20, 'Mapa Firestore inválido ou profundo demais.');
  for (const [name, field] of Object.entries(value)) {
    requireThat(name.length > 0 && Buffer.byteLength(name) <= 1500 && record(field) && Object.keys(field).length === 1, 'Campo Firestore inválido.');
    const [kind, data] = Object.entries(field)[0];
    let valid = false;
    switch (kind) {
      case 'nullValue': valid = data === null; break;
      case 'booleanValue': valid = typeof data === 'boolean'; break;
      case 'stringValue': valid = typeof data === 'string'; break;
      case 'integerValue': valid = typeof data === 'string' && data.length <= 20 && /^-?(0|[1-9]\d*)$/.test(data)
        && BigInt(data) >= -(2n ** 63n) && BigInt(data) < 2n ** 63n; break;
      case 'doubleValue': valid = typeof data === 'number' && Number.isFinite(data)
        || typeof data === 'string' && ['NaN', 'Infinity', '-Infinity'].includes(data); break;
      case 'timestampValue': valid = validTimestamp(data); break;
      case 'bytesValue': valid = typeof data === 'string' && Buffer.from(data, 'base64').toString('base64') === data; break;
      case 'referenceValue': {
        const match = typeof data === 'string' ? data.match(/^projects\/[^/]+\/databases\/[^/]+\/documents\/(.+)$/) : null;
        if (match) { documentPath(match[1]); valid = true; } break;
      }
      case 'geoPointValue':
        keys(data, ['latitude', 'longitude'], []);
        valid = typeof (data.latitude ?? 0) === 'number' && Number.isFinite(data.latitude ?? 0) && Math.abs(data.latitude ?? 0) <= 90
          && typeof (data.longitude ?? 0) === 'number' && Number.isFinite(data.longitude ?? 0) && Math.abs(data.longitude ?? 0) <= 180; break;
      case 'mapValue':
        keys(data, ['fields'], []); validateFields(data.fields ?? {}, depth + 1); valid = true; break;
      case 'arrayValue':
        keys(data, ['values'], []); requireThat(Array.isArray(data.values ?? []), 'Array Firestore inválido.');
        for (const item of data.values ?? []) {
          requireThat(!record(item) || !Object.hasOwn(item, 'arrayValue'), 'Array Firestore aninhado inválido.');
          validateFields({ item }, depth + 1);
        }
        valid = true; break;
    }
    requireThat(valid, 'Tipo ou valor Firestore não suportado; snapshot recusado.');
  }
}
export function sealSnapshot(body: Omit<LocalSnapshot, 'sha256'>): LocalSnapshot { return { ...body, sha256: digest(body) }; }
export function validateDocumentSet(documents: SnapshotDocument[]) {
  requireThat(Array.isArray(documents) && documents.length <= MAX_DOCUMENTS, 'Quantidade de documentos inválida.');
  const seen = new Set<string>();
  for (const document of documents) {
    keys(document, ['path', 'fields', 'createTime', 'updateTime'], ['path', 'fields']); documentPath(document.path);
    requireThat(!seen.has(document.path), 'Documento duplicado no snapshot.'); seen.add(document.path);
    validateFields(document.fields);
    for (const key of ['createTime', 'updateTime'] as const) requireThat(document[key] === undefined || validTimestamp(document[key]), 'Metadado temporal inválido.');
  }
  requireThat(Buffer.byteLength(canonical(documents)) < MAX_SNAPSHOT_BYTES, 'Documentos excedem o limite local de 128 MiB.');
}
export function validateSnapshot(value: unknown): asserts value is LocalSnapshot {
  keys(value, ['format', 'schemaVersion', 'projectId', 'databaseId', 'capturedAt', 'consistency', 'documents', 'artifacts', 'sha256']);
  requireThat(value.format === 'lumus-firestore-emulator-snapshot' && value.schemaVersion === 1 && value.databaseId === '(default)'
    && value.consistency === 'two-matching-scans-not-point-in-time' && validTimestamp(value.capturedAt), 'Versão ou origem de snapshot inválida.');
  project(value.projectId);
  keys(value.artifacts, ['rules', 'indexes']);
  requireThat(typeof value.artifacts.rules === 'string' && value.artifacts.rules.length > 0 && typeof value.artifacts.indexes === 'string', 'Rules/índices ausentes.');
  requireThat(record(JSON.parse(value.artifacts.indexes)), 'Índices inválidos.');
  validateDocumentSet(value.documents);
  const { sha256, ...body } = value;
  requireThat(typeof sha256 === 'string' && sha256 === digest(body), 'Integridade do snapshot inválida.');
  requireThat(Buffer.byteLength(canonical(value)) + 1 <= MAX_SNAPSHOT_BYTES, 'Snapshot excede o limite local de 128 MiB; captura não pode produzir arquivo irrestaurável.');
}
export const dataDigest = (documents: SnapshotDocument[]) => digest(documents.map(({ path, fields }) => ({ path, fields })).sort((a, b) => a.path.localeCompare(b.path, 'en')));

export class LocalFirestore {
  private readonly root: string;
  private readonly prefix: string;
  constructor(readonly projectId: string, private readonly host: string, private readonly hub: string, private readonly request: typeof fetch = fetch) {
    project(projectId);
    localHost(host); localHost(hub);
    this.prefix = `projects/${projectId}/databases/(default)/documents`;
    this.root = `http://${host}/v1/${this.prefix}`;
  }
  async assertIsolatedEmulator() {
    const response = await this.request(`http://${this.hub}/emulators`, { redirect: 'error', signal: AbortSignal.timeout(5000) });
    requireThat(response.ok, 'Emulator Hub indisponível.');
    const state: unknown = await response.json();
    requireThat(record(state) && record(state.firestore) && Number(state.firestore.port) === Number(this.host.split(':').at(-1))
      && ['127.0.0.1', '0.0.0.0', '::1', '::', 'localhost'].includes(state.firestore.host)
      && !state.functions && !state.eventarc, 'Exija Firestore isolado no Hub, com a porta informada e sem Functions/Eventarc.');
  }
  async call(suffix: string, method = 'GET', body?: unknown): Promise<Record<string, any>> {
    const response = await this.request(this.root + suffix, { method, redirect: 'error', signal: AbortSignal.timeout(30_000),
      headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: canonical(body) }) });
    requireThat(response.ok, `Emulator recusou operação (${response.status}); nenhuma tentativa remota será feita.`);
    const result: unknown = await response.json(); requireThat(record(result), 'Resposta inválida do Emulator.'); return result;
  }
  async scan(): Promise<SnapshotDocument[]> {
    const documents: SnapshotDocument[] = [], visited = new Set<string>();
    let bytes = 0;
    const urlPath = (path: string) => path ? '/' + path.split('/').map(encodeURIComponent).join('/') : '';
    const pages = async (suffix: string, method: string, body: Record<string, unknown>, key: string): Promise<any[]> => {
      let token = ''; const tokens = new Set<string>(), items: any[] = [];
      do {
        requireThat(tokens.size < 1000 && !tokens.has(token), 'Paginação inválida do Emulator.'); tokens.add(token);
        const page = method === 'POST' ? await this.call(suffix, method, { ...body, ...(token ? { pageToken: token } : {}) })
          : await this.call(suffix + `&pageToken=${encodeURIComponent(token)}`);
        requireThat(page[key] === undefined || Array.isArray(page[key]), 'Página inválida do Emulator.');
        items.push(...page[key] ?? []); requireThat(items.length <= MAX_DOCUMENTS, 'Inventário excede o limite local de documentos.');
        token = page.nextPageToken ?? ''; requireThat(typeof token === 'string', 'Token de página inválido.');
      } while (token);
      return items;
    };
    const visit = async (parent: string): Promise<void> => {
      requireThat(!visited.has(parent) && visited.size < MAX_DOCUMENTS, 'Árvore inválida ou grande demais.'); visited.add(parent);
      const collections = await pages(urlPath(parent) + ':listCollectionIds', 'POST', { pageSize: 100 }, 'collectionIds');
      requireThat(new Set(collections).size === collections.length, 'Coleção repetida na enumeração.');
      for (const collection of collections) {
        segment(collection);
        const path = parent ? `${parent}/${collection}` : collection;
        const rows = await pages(urlPath(path) + '?pageSize=100&showMissing=true', 'GET', {}, 'documents');
        for (const row of rows) {
          requireThat(record(row) && typeof row.name === 'string' && row.name.startsWith(this.prefix + '/'), 'Documento de outra origem.');
          const relative = row.name.slice(this.prefix.length + 1); documentPath(relative);
          requireThat(relative.slice(0, relative.lastIndexOf('/')) === path, 'Documento fora da coleção enumerada.');
          if (row.createTime !== undefined || row.updateTime !== undefined || row.fields !== undefined) {
            validateFields(row.fields ?? {});
            documents.push({ path: relative, fields: row.fields ?? {}, ...(row.createTime ? { createTime: row.createTime } : {}), ...(row.updateTime ? { updateTime: row.updateTime } : {}) });
            bytes += Buffer.byteLength(canonical(documents.at(-1)));
            requireThat(bytes < MAX_SNAPSHOT_BYTES, 'Inventário excede o limite local de 128 MiB.');
          }
          await visit(relative); // showMissing também encontra subcoleções de pais inexistentes.
        }
      }
    };
    await visit('');
    return documents.sort((a, b) => a.path.localeCompare(b.path, 'en'));
  }
  async capture(artifacts: LocalSnapshot['artifacts']): Promise<LocalSnapshot> {
    await this.assertIsolatedEmulator();
    const first = await this.scan(), second = await this.scan();
    requireThat(digest(first) === digest(second), 'Dados mudaram durante a cópia; pause escritores e capture novamente.');
    const snapshot = sealSnapshot({ format: 'lumus-firestore-emulator-snapshot', schemaVersion: 1, projectId: this.projectId,
      databaseId: '(default)', capturedAt: new Date().toISOString(), consistency: 'two-matching-scans-not-point-in-time', documents: second, artifacts });
    validateSnapshot(snapshot); return snapshot;
  }
  async restore(snapshot: LocalSnapshot) {
    validateSnapshot(snapshot);
    requireThat(snapshot.projectId === this.projectId, 'Restauração exige o mesmo projeto demo-* para preservar referências.');
    return this.createEmptyDocumentSet(snapshot.documents);
  }
  /** Importador local chama isto somente após reconstruir e conferir seu candidato. */
  async createEmptyDocumentSet(documents: SnapshotDocument[]) {
    validateDocumentSet(documents);
    await this.assertIsolatedEmulator();
    requireThat((await this.scan()).length === 0, 'Destino precisa estar vazio; não há limpeza ou sobrescrita automática.');
    for (let offset = 0; offset < documents.length; offset += 100) {
      await this.assertIsolatedEmulator();
      await this.call(':commit', 'POST', { writes: documents.slice(offset, offset + 100).map(document => ({
        update: { name: this.prefix + '/' + document.path, fields: document.fields }, currentDocument: { exists: false },
      })) });
    }
    const restored = await this.scan();
    requireThat(dataDigest(restored) === dataDigest(documents), 'Conferência da restauração divergiu; isole o destino e recomece em emulador vazio.');
    return { documents: restored.length, dataSha256: dataDigest(restored), verified: true, rulesApplied: false, indexesApplied: false,
      serverMetadataPreserved: false, authIncluded: false, storageIncluded: false };
  }

  /** [[Importação Financeira Local Spark]]: retoma apenas um conjunto já revisado, sem sobrescrever diferenças. */
  async resumeDocumentSet(documents: SnapshotDocument[], onProgress?: (completed: number, total: number) => void) {
    validateDocumentSet(documents);
    await this.assertIsolatedEmulator();
    const expected = new Map(documents.map(document => [document.path, document]));
    const existing = await this.scan();
    for (const row of existing) {
      const target = expected.get(row.path);
      requireThat(target && canonical(target.fields) === canonical(row.fields), 'Destino contém documento não previsto ou divergente; retomada bloqueada.');
    }
    const present = new Set(existing.map(row => row.path));
    const missing = documents.filter(row => !present.has(row.path));
    onProgress?.(present.size, documents.length);
    for (let offset = 0; offset < missing.length; offset += 100) {
      await this.assertIsolatedEmulator();
      const batch = missing.slice(offset, offset + 100);
      await this.call(':commit', 'POST', { writes: batch.map(document => ({
        update: { name: this.prefix + '/' + document.path, fields: document.fields }, currentDocument: { exists: false },
      })) });
      onProgress?.(present.size + offset + batch.length, documents.length);
    }
    const result = await this.scan();
    requireThat(dataDigest(result) === dataDigest(documents), 'Conferência da retomada divergiu; mantenha o destino isolado.');
    return { documents: result.length, dataSha256: dataDigest(result), verified: true };
  }
}

export function inventorySnapshot(snapshot: LocalSnapshot) {
  validateSnapshot(snapshot);
  const collections = new Map<string, number>(), missingParents = new Set<string>(), paths = new Set(snapshot.documents.map(row => row.path));
  const identities = new Map<string, Set<string>>();
  const byPath = new Map(snapshot.documents.map(row => [row.path, row]));
  const issues: Array<{ code: string; path: string }> = [];
  const cycles = new Set<string>();
  for (const document of snapshot.documents) {
    const parts = document.path.split('/');
    const collection = parts.slice(0, -1).map((part, index) => index % 2 ? '{id}' : part).join('/');
    collections.set(collection, (collections.get(collection) ?? 0) + 1);
    for (let size = 2; size < parts.length; size += 2) if (!paths.has(parts.slice(0, size).join('/'))) missingParents.add(parts.slice(0, size).join('/'));
    const groupId = document.fields.groupId?.stringValue;
    if (typeof groupId === 'string') {
      const roots = identities.get(groupId) ?? new Set<string>(); roots.add(parts[0]); identities.set(groupId, roots);
    }
    if (parts.length === 2 && parts[0] === 'monthlyBalances') {
      const { bankId, year, month } = document.fields;
      if (typeof bankId?.stringValue !== 'string' || !year?.integerValue || !month?.integerValue) issues.push({ code: 'invalid-monthly-identity', path: document.path });
      else {
        const key = canonical([bankId, year, month]);
        if (cycles.has(key)) issues.push({ code: 'duplicate-monthly-opening', path: document.path }); cycles.add(key);
      }
    }
  }
  const groups = snapshot.documents.filter(row => /^financialGroups\/[^/]+$/.test(row.path)).map(row => {
    const groupId = row.path.split('/')[1];
    const members = (row.fields.members?.mapValue as { fields?: Fields } | undefined)?.fields ?? {};
    if (!Object.values(members).some(role => role.stringValue === 'admin')) issues.push({ code: 'group-without-known-admin', path: row.path });
    return { groupId, status: row.fields.status?.stringValue ?? null, sparkProtocol: row.fields.sparkProtocol?.stringValue ?? null,
      members: Object.fromEntries(Object.entries(members).map(([uid, role]) => [uid, role.stringValue ?? null])),
      sourceCollections: [...identities.get(groupId) ?? []].sort() };
  });
  const users = snapshot.documents.filter(row => /^users\/[^/]+$/.test(row.path)).map(row => {
    const uid = row.path.split('/')[1], groupId = row.fields.financialGroupId?.stringValue, role = row.fields.financialGroupRole?.stringValue;
    const cutover = byPath.get(`financialCutovers/${uid}`);
    const group = groups.find(candidate => candidate.groupId === groupId);
    const knownRole = role === 'admin' || role === 'member';
    let storageModel = 'unknown';
    const noGroup = row.fields.financialGroupId === undefined || row.fields.financialGroupId.nullValue === null;
    const noRole = row.fields.financialGroupRole === undefined || row.fields.financialGroupRole.nullValue === null;
    if (noGroup && noRole && !cutover && !groups.some(candidate => Object.hasOwn(candidate.members, uid))) storageModel = 'legacy';
    else if (group && group.status === 'active' && knownRole && group.members[uid] === role && cutover?.fields.groupId?.stringValue === groupId) storageModel = group.sparkProtocol ? 'spark-marked' : 'ledger';
    if (storageModel === 'unknown') issues.push({ code: 'ambiguous-storage-model', path: row.path });
    return { uid, groupId: groupId ?? null, role: role ?? null, storageModel, hasCutover: !!cutover };
  });
  for (const group of groups) for (const uid of Object.keys(group.members)) {
    if (!byPath.has(`users/${uid}`)) issues.push({ code: 'missing-member-profile', path: `financialGroups/${group.groupId}` });
  }
  const cutovers = snapshot.documents.filter(row => /^financialCutovers\/[^/]+$/.test(row.path)).map(row => {
    const uid = row.path.split('/')[1], groupId = row.fields.groupId?.stringValue ?? null;
    if (!byPath.has(`users/${uid}`) || !groups.some(group => group.groupId === groupId)) issues.push({ code: 'orphan-cutover', path: row.path });
    return { uid, groupId };
  });
  return { schemaVersion: 1, snapshotSha256: snapshot.sha256, projectId: snapshot.projectId, documentCount: snapshot.documents.length,
    sourceCompleteness: 'emulator-traversal-only', collections: Object.fromEntries([...collections].sort()),
    artifactsSource: 'local-files-not-loaded-emulator-configuration', missingParents: [...missingParents].sort(),
    groups, users, cutovers, issues, readyForCutover: false };
}
