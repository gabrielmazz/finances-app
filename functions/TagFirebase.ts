// O arquivo TagFirebase.ts é responsável por gerenciar as operações relacionadas às tags
// registradas para uso no aplicativo.

import { auth, db } from '@/FirebaseConfig';
import {
	collection,
	deleteDoc,
	doc,
	getCountFromServer,
	getDoc,
	getDocs,
	query,
	setDoc,
	where,
} from 'firebase/firestore';
import type { TagIconFamily, TagIconStyle } from '@/hooks/useTagIcons';
import { createTagReferenceSummary } from '@/utils/categoryReferenceSummary';
import { getRelatedUsersIDsFirebase } from '@/functions/RegisterUserFirebase';
import type { TagUsageType } from '@/utils/tagUsage';

interface AddTagParams {
	tagName: string;
	personId: string;
	usageType: TagUsageType;
	isMandatoryExpense?: boolean;
	isMandatoryGain?: boolean;
	showInBothLists?: boolean;
	iconFamily?: TagIconFamily | null;
	iconName?: string | null;
	iconStyle?: TagIconStyle | null;
}

interface UpdateTagParams {
	tagId: string;
	tagName?: string;
	usageType?: TagUsageType;
	isMandatoryExpense?: boolean;
	isMandatoryGain?: boolean;
	showInBothLists?: boolean;
	iconFamily?: TagIconFamily | null;
	iconName?: string | null;
	iconStyle?: TagIconStyle | null;
}

export type { TagReferenceSummary } from '@/utils/categoryReferenceSummary';

// =========================================== Funções de Registro ================================================== //

// Função para registrar uma nova tag no Firestore
export async function addTagFirebase({
	tagName,
	personId,
	usageType,
	isMandatoryExpense = false,
	isMandatoryGain = false,
	showInBothLists = false,
	iconFamily = null,
	iconName = null,
	iconStyle = null,
}: AddTagParams) {
	try {
		const tagRef = doc(collection(db, 'tags'));
		const shouldShowInBothLists = Boolean(showInBothLists);
		const shouldMarkMandatoryExpense =
			usageType === 'expense' || usageType === 'both'
				? shouldShowInBothLists || Boolean(isMandatoryExpense)
				: false;
		const shouldMarkMandatoryGain =
			usageType === 'gain' || usageType === 'both'
				? shouldShowInBothLists || Boolean(isMandatoryGain)
				: false;

		await setDoc(tagRef, {
			name: tagName,
			personId,
			usageType,
			isMandatoryExpense: shouldMarkMandatoryExpense,
			isMandatoryGain: shouldMarkMandatoryGain,
			showInBothLists: shouldShowInBothLists,
			iconFamily,
			iconName,
			iconStyle,
			createdAt: new Date(),
			updatedAt: new Date(),
		});

		return { success: true, tagId: tagRef.id };
	} catch (error) {
		console.error('Erro ao adicionar tag:', error);
		return { success: false, error };
	}
}

export async function updateTagFirebase({
	tagId,
	tagName,
	usageType,
	isMandatoryExpense,
	isMandatoryGain,
	showInBothLists,
	iconFamily,
	iconName,
	iconStyle,
}: UpdateTagParams) {
	try {
		const tagRef = doc(db, 'tags', tagId);
		const updates: Record<string, unknown> = {
			updatedAt: new Date(),
		};

		if (typeof tagName === 'string') {
			updates.name = tagName;
		}

		if (usageType === 'expense' || usageType === 'gain' || usageType === 'both') {
			updates.usageType = usageType;
			if (usageType === 'gain') {
				updates.isMandatoryExpense = false;
			}
			if (usageType === 'expense') {
				updates.isMandatoryGain = false;
			}
		}

		if (typeof showInBothLists === 'boolean') {
			updates.showInBothLists = showInBothLists;
		}

		if (typeof isMandatoryExpense === 'boolean') {
			const isGainTag = usageType === 'gain';
			updates.isMandatoryExpense = isGainTag ? false : showInBothLists === true ? true : isMandatoryExpense;
		} else if ((usageType === 'expense' || usageType === 'both') && showInBothLists === true) {
			updates.isMandatoryExpense = true;
		}

		if (typeof isMandatoryGain === 'boolean') {
			const isExpenseTag = usageType === 'expense';
			updates.isMandatoryGain = isExpenseTag ? false : showInBothLists === true ? true : isMandatoryGain;
		} else if ((usageType === 'gain' || usageType === 'both') && showInBothLists === true) {
			updates.isMandatoryGain = true;
		}

		if (typeof iconFamily === 'string' && typeof iconName === 'string') {
			updates.iconFamily = iconFamily;
			updates.iconName = iconName;
			updates.iconStyle = typeof iconStyle === 'string' ? iconStyle : null;
		}

		await setDoc(tagRef, updates, { merge: true });

		return { success: true };
	} catch (error) {
		console.error('Erro ao atualizar tag:', error);
		return { success: false, error };
	}
}

// Função para deletar uma tag registrada no Firestore
export async function deleteTagFirebase(tagId: string) {
	try {
		await deleteDoc(doc(db, 'tags', tagId));
		return { success: true };
	} catch (error) {
		console.error('Erro ao deletar tag:', error);
		return { success: false, error };
	}
}

export async function getTagReferenceSummary(tagId: string) {
	try {
		const personId = auth.currentUser?.uid;
		if (!personId) return { success: false, error: 'Usuário não autenticado.' };
		const related = await getRelatedUsersIDsFirebase(personId);
		if (!related.success) return related;
		const personIds = Array.from(new Set([personId, ...(Array.isArray(related.data) ? related.data : [])]));
		const collections = ['expenses', 'gains', 'mandatoryExpenses', 'mandatoryGains'] as const;
		const counts = await Promise.all(
			collections.map(async collectionName => {
				const chunks = Array.from({ length: Math.ceil(personIds.length / 30) }, (_, index) => personIds.slice(index * 30, index * 30 + 30));
				const results = await Promise.all(chunks.map(personIdChunk => getCountFromServer(
					query(collection(db, collectionName), where('tagId', '==', tagId), where('personId', 'in', personIdChunk)),
				)));
				return results.reduce((total, result) => total + result.data().count, 0);
			}),
		);

		const [expenses, gains, mandatoryExpenses, mandatoryGains] = counts;
		const summary = createTagReferenceSummary({
			expenses,
			gains,
			mandatoryExpenses,
			mandatoryGains,
		});

		return { success: true, data: summary };
	} catch (error) {
		console.error('Erro ao verificar usos da categoria:', error);
		return { success: false, error };
	}
}

// =========================================== Funções de Consulta ================================================== //

// Função para obter todas as tags registradas no Firestore
export async function getAllTagsFirebase() {
	try {
		const personId = auth.currentUser?.uid;
		if (!personId) {
			return { success: false, error: 'Usuário não autenticado.' };
		}

		// Firestore Rules are not filters: use the same user/relationship scope
		// as the tag rule before reading resource.data.personId.
		const scopedResult = await getTagsWithUsersByPersonFirebase(personId);
		if (!scopedResult.success || !Array.isArray(scopedResult.data)) {
			return scopedResult;
		}
		const tags = scopedResult.data;

		return { success: true, data: tags };
	} catch (error) {
		console.error('Erro ao obter todas as tags:', error);
		return { success: false, error };
	}
}

/** Scoped reference-data query. Use this in authenticated screens instead of a collection scan. */
export async function getTagsWithUsersByPersonFirebase(personId: string) {
	try {
		const related = await getRelatedUsersIDsFirebase(personId);
		if (!related.success) return related;
		const relatedIds = Array.isArray(related.data) ? related.data : [];
		const personIds = Array.from(new Set([personId, ...relatedIds]));
		const snapshots = await Promise.all(
			Array.from({ length: Math.ceil(personIds.length / 30) }, (_, index) =>
				getDocs(query(collection(db, 'tags'), where('personId', 'in', personIds.slice(index * 30, index * 30 + 30)))),
			),
		);
		return { success: true, data: snapshots.flatMap(snapshot => snapshot.docs.map(tagDoc => ({ id: tagDoc.id, ...tagDoc.data() }))) };
	} catch (error) {
		console.error('Erro ao obter categorias do grupo:', error);
		return { success: false, error };
	}
}

// Função para obter os dados de uma tag específica do Firestore
export async function getTagDataFirebase(tagId: string) {
	try {
		const tagDoc = await getDoc(doc(db, 'tags', tagId));

		if (tagDoc.exists()) {
			return { success: true, data: tagDoc.data() };
		}

		return { success: false, error: 'Tag não encontrada' };
	} catch (error) {
		console.error('Erro ao obter dados da tag:', error);
		return { success: false, error };
	}
}

// ================================================================================================================= //
