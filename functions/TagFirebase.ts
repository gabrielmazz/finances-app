// O arquivo TagFirebase.ts é responsável por gerenciar as operações relacionadas às tags
// registradas para uso no aplicativo.

import { db } from '@/FirebaseConfig';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import type { TagIconFamily, TagIconStyle } from '@/hooks/useTagIcons';
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

// =========================================== Funções de Consulta ================================================== //

// Função para obter todas as tags registradas no Firestore
export async function getAllTagsFirebase() {
	try {
		const tagsSnapshot = await getDocs(collection(db, 'tags'));
		const tags = tagsSnapshot.docs.map(tagDoc => ({
			id: tagDoc.id,
			...tagDoc.data(),
		}));

		return { success: true, data: tags };
	} catch (error) {
		console.error('Erro ao obter todas as tags:', error);
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
