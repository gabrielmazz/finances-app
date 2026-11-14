import { loadFinancialContext } from '../firebase/financialContext';
import { loadAuthorization } from '../firebase/authorization';
import type { AccountClient } from '../firebase/profiles';

jest.mock('../firebase/authorization', () => ({ loadAuthorization: jest.fn() }));
const checkAuthorization = jest.mocked(loadAuthorization);
const client = { auth: { currentUser: { uid: 'owner' } } } as unknown as AccountClient;

afterEach(() => jest.resetAllMocks());

test('only a verified grant for another owner signals shared read access', async () => {
  checkAuthorization.mockResolvedValueOnce(null);
  await expect(loadFinancialContext(client, 'owner', null)).resolves.toEqual({ kind: 'personal' });
  checkAuthorization.mockResolvedValueOnce({ generation: 'generation', readOwners: ['owner'], groups: {} });
  await expect(loadFinancialContext(client, 'owner', null)).resolves.toEqual({ kind: 'personal' });
  checkAuthorization.mockResolvedValueOnce({ generation: 'generation', readOwners: ['other'], groups: {} });
  await expect(loadFinancialContext(client, 'owner', null)).resolves.toEqual({ kind: 'personal', sharedReadStatus: 'authorized' });
  checkAuthorization.mockResolvedValueOnce({ generation: 'generation', readOwners: [], groups: { group: 'member' } });
  await expect(loadFinancialContext(client, 'owner', null)).resolves.toEqual({ kind: 'personal', sharedReadStatus: 'group-listed' });
});

test('an unverifiable shared grant does not grant access or block the personal context', async () => {
  checkAuthorization.mockRejectedValueOnce(new Error('permission-denied'));
  await expect(loadFinancialContext(client, 'owner', null)).resolves.toEqual({ kind: 'personal', sharedReadStatus: 'unverified' });
});
