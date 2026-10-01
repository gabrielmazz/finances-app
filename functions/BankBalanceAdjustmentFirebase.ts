import { auth, db, firebaseFunctions } from '@/FirebaseConfig';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getRelatedUsersIDsFirebase } from '@/functions/RegisterUserFirebase';
import { getBanksWithUsersByPersonFirebase } from '@/functions/BankFirebase';
import { getFinancialLedgerAccountsFirebase, getFinancialLedgerContextFirebase } from '@/functions/FinancialLedgerFirebase';
import type { BankBalanceAdjustment } from '@/utils/bankBalanceAdjustment';
import type { BankActionsheetOption } from '@/components/uiverse/banks/bank-actionsheet-selector';

export type BankBalanceAdjustmentCommand = {
	action: 'preview' | 'save' | 'revert';
	bankId: string;
	date?: string;
	adjustmentId?: string;
	clientActionId?: string;
	targetBalanceInCents?: number;
	expectedPreviousBalanceInCents?: number;
	description?: string;
};

export async function runBankBalanceAdjustmentFirebase(input: BankBalanceAdjustmentCommand) {
	const callable = httpsCallable<BankBalanceAdjustmentCommand, { adjustmentId?: string; previousBalanceInCents: number; differenceInCents?: number }>(firebaseFunctions, 'bankBalanceAdjustment');
	return (await callable(input)).data;
}

function parseAdjustment(id: string, data: Record<string, unknown>): BankBalanceAdjustment {
	const rawDate = data.date as { toDate(): Date };
	return {
		id, bankId: String(data.bankId), personId: String(data.personId), date: rawDate.toDate(),
		differenceInCents: data.differenceInCents as number,
		previousBalanceInCents: data.previousBalanceInCents as number,
		targetBalanceInCents: data.targetBalanceInCents as number,
		description: typeof data.description === 'string' ? data.description : null,
		status: data.status as BankBalanceAdjustment['status'],
		reversesAdjustmentId: typeof data.reversesAdjustmentId === 'string' ? data.reversesAdjustmentId : null,
		groupId: typeof data.groupId === 'string' ? data.groupId : null,
	};
}

export async function getBankBalanceAdjustmentFirebase(id: string) {
	const snapshot = await getDoc(doc(db, 'bankBalanceAdjustments', id));
	if (!snapshot.exists()) throw new Error('Ajuste não encontrado.');
	return parseAdjustment(snapshot.id, snapshot.data());
}

export async function getBankBalanceAdjustmentsFirebase(personId: string, bankId: string, startDate: Date, endDate: Date) {
	const context = await getFinancialLedgerContextFirebase(personId);
	const load = async (field: string, values: string[]) => {
		const snapshots = await Promise.all(Array.from({ length: Math.ceil(values.length / 10) }, (_, index) =>
			getDocs(query(collection(db, 'bankBalanceAdjustments'), where(field, 'in', values.slice(index * 10, index * 10 + 10))))));
		return snapshots.flatMap(snapshot => snapshot.docs.map(item => parseAdjustment(item.id, item.data())));
	};
	let records: BankBalanceAdjustment[];
	if (context) {
		const related = await getRelatedUsersIDsFirebase(personId);
		if (!related.success) throw new Error('Não foi possível carregar os ajustes vinculados.');
		const [groupRecords, legacyRecords] = await Promise.all([load('groupId', [context.groupId]), load('personId', [...new Set([personId, ...(related.data ?? [])])])]);
		records = [...new Map([...legacyRecords, ...groupRecords].map(item => [item.id, item])).values()];
	} else {
		const related = await getRelatedUsersIDsFirebase(personId);
		if (!related.success) throw new Error('Não foi possível carregar os ajustes vinculados.');
		records = await load('personId', [...new Set([personId, ...(related.data ?? [])])]);
	}
	return records.filter(item => item.bankId === bankId && item.date >= startDate && item.date <= endDate);
}

export async function getBalanceAdjustmentBanksFirebase(): Promise<BankActionsheetOption[]> {
	const uid = auth.currentUser?.uid;
	if (!uid) throw new Error('Entre na sua conta para ajustar o saldo.');
	const context = await getFinancialLedgerContextFirebase(uid);
	if (context) {
		if (context.role !== 'admin') throw new Error('O ajuste de saldo deste grupo exige acesso de administrador.');
		return (await getFinancialLedgerAccountsFirebase(context.groupId)).filter(item => item.kind === 'bank' && !item.archivedAt).map(item => ({
			id: item.legacyBankId || item.id, name: item.name, iconKey: item.iconKey, colorHex: item.colorHex,
		}));
	}
	const result = await getBanksWithUsersByPersonFirebase(uid);
	if (!result.success) throw new Error('Não foi possível carregar os bancos.');
	return (result.data ?? []).map((item: { id: string; name?: string; iconKey?: string | null; colorHex?: string | null }) => ({
		id: item.id, name: item.name || 'Banco sem nome', iconKey: item.iconKey, colorHex: item.colorHex,
	}));
}
