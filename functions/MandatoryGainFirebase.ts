import { db } from '@/FirebaseConfig';
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { getRelatedUsersIDsFirebase } from '@/functions/RegisterUserFirebase';
import { getCycleKeyFromDate } from '@/utils/mandatoryExpenses';

interface AddMandatoryGainParams {
	name: string;
	valueInCents: number;
	dueDay: number;
	tagId: string;
	personId: string;
	description?: string | null;
	reminderEnabled?: boolean;
	reminderHour?: number;
	reminderMinute?: number;
}

interface UpdateMandatoryGainParams {
	gainTemplateId: string;
	name?: string;
	valueInCents?: number;
	dueDay?: number;
	tagId?: string;
	description?: string | null;
	reminderEnabled?: boolean;
	reminderHour?: number;
	reminderMinute?: number;
}

interface MarkMandatoryGainReceiptParams {
	gainTemplateId: string;
	receiptGainId: string;
	receiptDate: Date;
}

const MANDATORY_GAINS_COLLECTION = 'mandatoryGains';

export async function addMandatoryGainFirebase({
	name,
	valueInCents,
	dueDay,
	tagId,
	personId,
	description,
	reminderEnabled = true,
	reminderHour = 9,
	reminderMinute = 0,
}: AddMandatoryGainParams) {
	try {
		const mandatoryGainRef = doc(collection(db, MANDATORY_GAINS_COLLECTION));

		await setDoc(mandatoryGainRef, {
			name,
			valueInCents,
			dueDay,
			tagId,
			personId,
			description: description ?? null,
			reminderEnabled,
			reminderHour,
			reminderMinute,
			lastReceiptGainId: null,
			lastReceiptCycle: null,
			lastReceiptDate: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		});

		return { success: true, id: mandatoryGainRef.id };
	} catch (error) {
		console.error('Erro ao adicionar ganho obrigatório:', error);
		return { success: false, error };
	}
}

export async function updateMandatoryGainFirebase({
	gainTemplateId,
	name,
	valueInCents,
	dueDay,
	tagId,
	description,
	reminderEnabled,
	reminderHour,
	reminderMinute,
}: UpdateMandatoryGainParams) {
	try {
		const mandatoryGainRef = doc(db, MANDATORY_GAINS_COLLECTION, gainTemplateId);
		const updates: Record<string, unknown> = {
			updatedAt: new Date(),
		};

		if (typeof name === 'string') {
			updates.name = name;
		}

		if (typeof valueInCents === 'number') {
			updates.valueInCents = valueInCents;
		}

		if (typeof dueDay === 'number') {
			updates.dueDay = dueDay;
		}

		if (typeof tagId === 'string') {
			updates.tagId = tagId;
		}

		if (description !== undefined) {
			updates.description = description ?? null;
		}

		if (typeof reminderEnabled === 'boolean') {
			updates.reminderEnabled = reminderEnabled;
		}

		if (typeof reminderHour === 'number') {
			updates.reminderHour = reminderHour;
		}

		if (typeof reminderMinute === 'number') {
			updates.reminderMinute = reminderMinute;
		}

		await setDoc(mandatoryGainRef, updates, { merge: true });

		return { success: true };
	} catch (error) {
		console.error('Erro ao atualizar ganho obrigatório:', error);
		return { success: false, error };
	}
}

export async function deleteMandatoryGainFirebase(gainTemplateId: string) {
	try {
		await deleteDoc(doc(db, MANDATORY_GAINS_COLLECTION, gainTemplateId));
		return { success: true };
	} catch (error) {
		console.error('Erro ao deletar ganho obrigatório:', error);
		return { success: false, error };
	}
}

export async function getMandatoryGainFirebase(gainTemplateId: string) {
	try {
		const gainDoc = await getDoc(doc(db, MANDATORY_GAINS_COLLECTION, gainTemplateId));

		if (gainDoc.exists()) {
			return { success: true, data: { id: gainDoc.id, ...gainDoc.data() } };
		}

		return { success: false, error: 'Ganho obrigatório não encontrado' };
	} catch (error) {
		console.error('Erro ao obter ganho obrigatório:', error);
		return { success: false, error };
	}
}

export async function getMandatoryGainsWithRelationsFirebase(personId: string) {
	try {
		const relatedUsersResult = await getRelatedUsersIDsFirebase(personId);

		const relatedIds =
			relatedUsersResult.success && Array.isArray(relatedUsersResult.data) ? [...relatedUsersResult.data] : [];

		const idsSet = new Set<string>([personId, ...relatedIds.filter(id => typeof id === 'string' && id.length > 0)]);

		const ids = Array.from(idsSet);

		let gainsQuery;

		if (ids.length === 1) {
			gainsQuery = query(collection(db, MANDATORY_GAINS_COLLECTION), where('personId', '==', ids[0]));
		} else {
			gainsQuery = query(collection(db, MANDATORY_GAINS_COLLECTION), where('personId', 'in', ids));
		}

		const snapshot = await getDocs(gainsQuery);
		const toComparableName = (entry: Record<string, unknown>) => {
			const value = entry['name'];
			return typeof value === 'string' ? value.toLocaleLowerCase() : '';
		};
		const gains = snapshot.docs
			.map(gainDoc => ({
				id: gainDoc.id,
				...gainDoc.data(),
			}))
			.sort((a, b) =>
				toComparableName(a as Record<string, unknown>).localeCompare(toComparableName(b as Record<string, unknown>)),
			);
		return { success: true, data: gains };
	} catch (error) {
		console.error('Erro ao obter ganhos obrigatórios:', error);
		return { success: false, error };
	}
}

export async function markMandatoryGainReceiptFirebase({
	gainTemplateId,
	receiptGainId,
	receiptDate,
}: MarkMandatoryGainReceiptParams) {
	try {
		const gainTemplateRef = doc(db, MANDATORY_GAINS_COLLECTION, gainTemplateId);
		await setDoc(
			gainTemplateRef,
			{
				lastReceiptGainId: receiptGainId,
				lastReceiptDate: receiptDate,
				lastReceiptCycle: getCycleKeyFromDate(receiptDate),
				updatedAt: new Date(),
			},
			{ merge: true },
		);

		return { success: true };
	} catch (error) {
		console.error('Erro ao marcar recebimento do ganho obrigatório:', error);
		return { success: false, error };
	}
}

export async function clearMandatoryGainReceiptFirebase(gainTemplateId: string) {
	try {
		const gainTemplateRef = doc(db, MANDATORY_GAINS_COLLECTION, gainTemplateId);
		await setDoc(
			gainTemplateRef,
			{
				lastReceiptGainId: null,
				lastReceiptDate: null,
				lastReceiptCycle: null,
				updatedAt: new Date(),
			},
			{ merge: true },
		);

		return { success: true };
	} catch (error) {
		console.error('Erro ao limpar recebimento do ganho obrigatório:', error);
		return { success: false, error };
	}
}
