import { db } from '@/FirebaseConfig';
import { collection, doc, getDoc, setDoc } from 'firebase/firestore';

const COLLECTION_NAME = 'monthlyBalances';

const buildMonthlyBalanceDocId = (personId: string, bankId: string, year: number, month: number) =>
	`${personId}_${bankId}_${year}_${month}`;

export type MonthlyBalanceRecord = {
	id: string;
	personId: string;
	bankId: string;
	year: number;
	month: number;
	valueInCents: number;
	createdAt?: Date;
	updatedAt?: Date;
};

interface UpsertMonthlyBalanceParams {
	personId: string;
	bankId: string;
	year: number;
	month: number;
	valueInCents: number;
}

type UpsertMonthlyBalanceResponse = { success: true; id: string } | { success: false; error: unknown };

export async function upsertMonthlyBalanceFirebase({
	personId,
	bankId,
	year,
	month,
	valueInCents,
}: UpsertMonthlyBalanceParams): Promise<UpsertMonthlyBalanceResponse> {
	try {
		const docId = buildMonthlyBalanceDocId(personId, bankId, year, month);
		const balanceRef = doc(collection(db, COLLECTION_NAME), docId);
		const existingSnapshot = await getDoc(balanceRef);

		const dataToSave: Record<string, unknown> = {
			personId,
			bankId,
			year,
			month,
			valueInCents,
			updatedAt: new Date(),
		};

		if (!existingSnapshot.exists()) {
			dataToSave.createdAt = new Date();
		}

		await setDoc(balanceRef, dataToSave, { merge: true });

		return { success: true, id: docId };
	} catch (error) {
		console.error('Erro ao registrar saldo mensal:', error);
		return { success: false, error };
	}
}

interface GetMonthlyBalanceParams {
	personId: string;
	bankId: string;
	year: number;
	month: number;
}

type GetMonthlyBalanceResponse =
	| { success: true; data: MonthlyBalanceRecord | null }
	| { success: false; error: unknown };

export async function getMonthlyBalanceFirebase({ personId, bankId, year, month }: GetMonthlyBalanceParams): Promise<GetMonthlyBalanceResponse> {
	try {
		const docId = buildMonthlyBalanceDocId(personId, bankId, year, month);
		const balanceRef = doc(collection(db, COLLECTION_NAME), docId);
		const balanceSnapshot = await getDoc(balanceRef);

		if (!balanceSnapshot.exists()) {
			return { success: true, data: null };
		}

		const payload = balanceSnapshot.data() as Omit<MonthlyBalanceRecord, 'id'>;
		return {
			success: true,
			data: {
				id: balanceSnapshot.id,
				...payload,
			},
		};
	} catch (error) {
		console.error('Erro ao obter saldo mensal:', error);
		return { success: false, error };
	}
}
