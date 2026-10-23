import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword, type Auth } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, terminate, type Firestore } from 'firebase/firestore';

let mockClientDb: Firestore, mockClientAuth: Auth;
jest.mock('@/FirebaseConfig', () => ({ get db() { return mockClientDb; }, get auth() { return mockClientAuth; }, firebaseFunctions: {} }));
import { getHomeOverviewFirebase } from '@/functions/HomeFirebase';
import { getAllBanksFirebase } from '@/functions/BankFirebase';
import { getTagsWithUsersByPersonFirebase } from '@/functions/TagFirebase';

const suite = process.env.RUN_SPARK_DEMO === '1' ? describe : describe.skip;
suite('Spark local: application readers with real Auth/Firestore and no Functions', () => {
  const uid = 'spark-demo-user';
  let app: ReturnType<typeof initializeApp>;
  beforeAll(async () => {
    if (process.env.FIREBASE_PROJECT_ID !== 'demo-lumus-financas' || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080'
      || process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099') throw new Error('Use npm run test:spark:demo.');
    app = initializeApp({ projectId: 'demo-lumus-financas', apiKey: 'fake-api-key' }, 'spark-demo-home');
    mockClientAuth = getAuth(app); connectAuthEmulator(mockClientAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
    mockClientDb = getFirestore(app); connectFirestoreEmulator(mockClientDb, '127.0.0.1', 8080);
    await signInWithEmailAndPassword(mockClientAuth, 'spark@demo.lumus.local', 'Spark-teste-123!');
  });
  afterAll(async () => { if (mockClientDb) await terminate(mockClientDb); if (app) await deleteApp(app); });
  test('Home, bank selector and categories use the synthetic native group', async () => {
    const overview = await getHomeOverviewFirebase(uid);
    if (!overview.success) throw overview.error;
    expect(overview.data?.bankBalances.reduce((sum, bank) => sum + (bank.balanceInCents ?? 0), 0)).toBe(710000);
    expect(overview.data?.cashSummary?.balanceInCents).toBe(30000);
    expect(Object.values(overview.data?.currentMonthGainsByBankId ?? {}).reduce((sum, value) => sum + value, 0)).toBe(10000);
    expect(Object.values(overview.data?.currentMonthExpensesByBankId ?? {}).reduce((sum, value) => sum + value, 0)).toBe(0);
    const banks = await getAllBanksFirebase(); expect(banks.success).toBe(true); expect(banks.data).toHaveLength(4);
    const tags = await getTagsWithUsersByPersonFirebase(uid); expect(tags.success).toBe(true); expect(tags.data).toHaveLength(3);
  }, 60000);
});
