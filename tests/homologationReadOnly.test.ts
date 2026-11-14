import type { AccountClient } from '../firebase/profiles';
import { saveProfileName } from '../firebase/profiles';
import { register, requestPasswordReset } from '../application/account';
import { createBank, updateBank, archiveBank, newBankOperationId, requireBankReadEnvironment } from '../firebase/banks';
import { createCategory, updateCategory, archiveCategory, newCategoryId, readCategory } from '../firebase/categories';
import { createMovement, updateMovement, newMovementId } from '../firebase/movements';
import { readFirebaseConfig } from '../firebase/config';

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
