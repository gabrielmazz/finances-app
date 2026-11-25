import type { AccountClient } from '../firebase/profiles';
import { saveProfileName } from '../firebase/profiles';
import { register, requestPasswordReset } from '../application/account';
import { createBank, updateBank, archiveBank, newBankOperationId, requireBankReadEnvironment } from '../firebase/banks';
import { createCategory, updateCategory, archiveCategory, newCategoryId, readCategory } from '../firebase/categories';
import { createMovement, updateMovement, newMovementId, createBankTransfer, createCashWithdrawal, confirmMandatoryCycle, cancelMandatoryCycle } from '../firebase/movements';
import { saveMandatoryTemplate, archiveMandatoryTemplate } from '../firebase/mandatory';
import { financialLedgerAllowsWrites, OFFICIAL_PROJECT_ID, STAGING_PROJECT_ID, readFirebaseConfig, usesCanonicalFinance } from '../firebase/config';
import productionReadiness from '../firebase/production-readiness.json';

jest.mock('../firebase/production-readiness.json', () => ({
  ...jest.requireActual('../firebase/production-readiness.json'),
  financialSchemaVersion: undefined,
  migrationManifestSHA256: undefined,
  canonicalRulesSHA256: undefined,
  financialWritesEnabled: false,
}));

const scope = { kind: 'personal' as const, id: 'owner', uid: 'owner' };
const client = { auth: { currentUser: { uid: 'owner' } }, db: { app: { options: { projectId: 'finances-app-e8685' } } } } as unknown as AccountClient;

it('allows only scoped reads and blocks every mutation before any SDK request in the official project', async () => {
  expect(() => requireBankReadEnvironment(client, scope)).not.toThrow();
  expect(() => requireBankReadEnvironment(client, { ...scope, uid: 'another' })).toThrow('session/changed');
  expect(() => newBankOperationId(client, scope)).toThrow('read-only/operation');
  expect(() => newCategoryId(client, scope)).toThrow('read-only/operation');
  expect(() => newMovementId(client, scope)).toThrow('read-only/operation');
  const denied = [
    () => register(client, 'Name', 'a@example.test', 'password'),
    () => requestPasswordReset(client, 'a@example.test'),
    () => saveProfileName(client, 'owner', 'Name', null),
    () => createBank(client, scope, 'id', {} as never),
    () => updateBank(client, scope, {} as never, 0, {} as never),
    () => archiveBank(client, scope, {} as never, 0),
    () => createCategory(client, scope, 'id', {} as never),
    () => updateCategory(client, scope, {} as never, {} as never),
    () => archiveCategory(client, scope, {} as never),
    () => createMovement(client, scope, 'id', {} as never),
    () => updateMovement(client, scope, {} as never, null),
    () => createBankTransfer(client, scope, 'id', {} as never),
    () => createCashWithdrawal(client, scope, 'id', {} as never),
    () => saveMandatoryTemplate(client, scope, 'id', {} as never, null),
    () => archiveMandatoryTemplate(client, scope, {} as never),
    () => confirmMandatoryCycle(client, scope, 'id', {} as never),
    () => cancelMandatoryCycle(client, scope, 'id', '2026-11', 0),
  ];
  for (const action of denied) await expect(action()).rejects.toThrow('read-only/operation');
});

it('never uses the emulator in official mode and refuses an unprotected group-root category', async () => {
  const official = readFirebaseConfig({ mode: 'production', apiKey: 'public-test-key', host: '127.0.0.1' });
  expect(official.mode).toBe('production');
  expect(official.options.projectId).toBe('finances-app-e8685');
  expect(official).not.toHaveProperty('host');
  await expect(readCategory(client, { kind: 'group', id: 'group', uid: 'owner' }, { id: 'tag', source: 'group-root' })).rejects.toThrow('categories/ambiguous-owner');
});

it('requires the applied manifest and verified candidate Rules to select official canonical finance', () => {
  const readiness = { ...productionReadiness, financialSchemaVersion: 2, financialWritesEnabled: false,
    migrationManifestSHA256: 'a'.repeat(64), canonicalRulesSHA256: productionReadiness.rulesSHA256 };
  expect(usesCanonicalFinance(STAGING_PROJECT_ID)).toBe(true);
  expect(usesCanonicalFinance(OFFICIAL_PROJECT_ID)).toBe(false);
  expect(usesCanonicalFinance(OFFICIAL_PROJECT_ID, readiness)).toBe(true);
  expect(financialLedgerAllowsWrites(OFFICIAL_PROJECT_ID, readiness)).toBe(false);
  expect(financialLedgerAllowsWrites(OFFICIAL_PROJECT_ID, { ...readiness, releaseView: 'canary', financialWritesEnabled: true })).toBe(false);
  expect(financialLedgerAllowsWrites(OFFICIAL_PROJECT_ID, { ...readiness, releaseView: 'canonical', financialWritesEnabled: true })).toBe(true);
  expect(financialLedgerAllowsWrites(OFFICIAL_PROJECT_ID, { ...readiness, financialSchemaVersion: undefined, financialWritesEnabled: true })).toBe(false);
  expect(usesCanonicalFinance(OFFICIAL_PROJECT_ID, { ...readiness, status: 'pending' })).toBe(false);
  expect(usesCanonicalFinance(OFFICIAL_PROJECT_ID, { ...readiness, migrationManifestSHA256: '' })).toBe(false);
  expect(usesCanonicalFinance(OFFICIAL_PROJECT_ID, { ...readiness, canonicalRulesSHA256: 'b'.repeat(64) })).toBe(false);
});
