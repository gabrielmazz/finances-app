jest.mock('@/FirebaseConfig', () => ({ db: {} }));
jest.mock('@/functions/RegisterUserFirebase', () => ({ getRelatedUsersIDsFirebase: jest.fn() }));
jest.mock('firebase/firestore', () => ({
	collection: jest.fn((_db, name) => ({ name })),
	getDocs: jest.fn(),
	query: jest.fn((collectionRef, ...constraints) => ({ collectionName: collectionRef.name, constraints })),
	where: jest.fn((field, operator, value) => ({ type: 'where', field, operator, value })),
	orderBy: jest.fn((field, direction) => ({ type: 'orderBy', field, direction })),
	limit: jest.fn(value => ({ type: 'limit', value })),
	doc: jest.fn(),
	setDoc: jest.fn(),
	getDoc: jest.fn(),
	deleteDoc: jest.fn(),
	Timestamp: {},
	documentId: jest.fn(),
	writeBatch: jest.fn(),
}));

import { getLegacyBankBalancesInCentsFirebase } from '@/functions/BankFirebase';
import { getRelatedUsersIDsFirebase } from '@/functions/RegisterUserFirebase';
import { getDocs } from 'firebase/firestore';

const mockGetDocs = getDocs as jest.Mock;
const mockGetRelatedUsersIDsFirebase = getRelatedUsersIDsFirebase as jest.Mock;

const snapshot = (data: Record<string, unknown>) => ({ docs: [{ data: () => data }] });


describe('legacy bank balance production compatibility', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		jest.spyOn(console, 'warn').mockImplementation(() => undefined);
		mockGetRelatedUsersIDsFirebase.mockResolvedValue({ success: true, data: [] });
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('falls back while the monthly balance index is still being built', async () => {
		mockGetDocs.mockImplementation(async (request: { collectionName: string; constraints: Array<{ type?: string }> }) => {
			if (
				request.collectionName === 'monthlyBalances' &&
				request.constraints.some(constraint => constraint.type === 'orderBy')
			) {
				throw new Error('FAILED_PRECONDITION: index is still building');
			}

			if (request.collectionName === 'monthlyBalances') {
				return snapshot({ bankId: 'bank-1', year: 2026, month: 8, valueInCents: 10000 });
			}

			return { docs: [] };
		});

		await expect(getLegacyBankBalancesInCentsFirebase({
			personId: 'user-1',
			bankIds: ['bank-1'],
			asOfDate: new Date(2026, 7, 21),
		})).resolves.toEqual({ success: true, data: { 'bank-1': 10000 } });
	});
});
