// O arquivo TagFirebase.ts é responsável por gerenciar as operações relacionadas às tags
// registradas para uso no aplicativo.

import { auth, db } from '@/FirebaseConfig';
import { getFinancialLedgerContextFirebase, manageFinancialMetadataFirebase } from '@/functions/FinancialLedgerFirebase';
import { createAssistantRecordFingerprint } from '@/utils/assistantRecordFingerprint';
import {
	collection,
	doc,
	getCountFromServer,
	getDoc,
	getDocFromServer,
	getDocs,
	query,
	setDoc,
	where,
} from 'firebase/firestore';
import type { TagIconFamily, TagIconStyle } from '@/hooks/useTagIcons';
import { createTagReferenceSummary } from '@/utils/categoryReferenceSummary';
import { getRelatedUsersIDsFirebase } from '@/functions/RegisterUserFirebase';
import type { TagUsageType } from '@/utils/tagUsage';
import { getSparkContextFirebase } from './SparkContextFirebase';
import { executeSparkMetadataCommandFirebase } from './SparkMetadataCommandFirebase';
import { getSparkCategoryReferencesFirebase } from './SparkCategoryReferencesFirebase';

interface AddTagParams {
	clientActionId?: string;
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
	clientActionId?: string;
	expectedFingerprint?: string;
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
	clientActionId,
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
		const spark = await getSparkContextFirebase(db, personId);
		if (spark) {
			const saved = await executeSparkMetadataCommandFirebase(db, { ...spark, clientActionId: clientActionId ?? `category_${tagRef.id}`, domain: 'category', action: 'create',
				fields: { name: tagName, usageType, isMandatoryExpense: shouldMarkMandatoryExpense, isMandatoryGain: shouldMarkMandatoryGain,
					showInBothLists: shouldShowInBothLists, iconFamily, iconName, iconStyle } });
			return { success: true, tagId: saved.recordId };
		}

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
	clientActionId,
	expectedFingerprint,
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

		const personId = auth.currentUser?.uid;
		if (!personId) throw new Error('Usuário não autenticado.');
		const spark = await getSparkContextFirebase(db, personId);
		if (spark) {
			const { updatedAt: _, ...fields } = updates;
			await executeSparkMetadataCommandFirebase(db, { ...spark, clientActionId: clientActionId ?? `category_${doc(collection(db, 'tags')).id}`,
				domain: 'category', action: 'update', recordId: tagId, expectedFingerprint, fields });
		} else await setDoc(tagRef, updates, { merge: true });

		return { success: true };
	} catch (error) {
		console.error('Erro ao atualizar tag:', error);
		return { success: false, error };
	}
}

// Função para deletar uma tag registrada no Firestore
export async function deleteTagFirebase(tagId: string) {
	try {
		const personId = auth.currentUser?.uid;
		if (!personId) return { success: false, error: 'Usuário não autenticado.' };
		const category = (await getDoc(doc(db, 'tags', tagId))).data();
		if (!category || category.personId !== personId) return { success: false, error: 'Categoria indisponível para esta conta.' };
		if (category.deleted === true) return { success: true };
		const spark = await getSparkContextFirebase(db, personId);
		if (spark) {
			await executeSparkMetadataCommandFirebase(db, { ...spark, clientActionId: `category_delete_${doc(collection(db, 'tags')).id}`,
				domain: 'category', action: 'delete', recordId: tagId, expectedFingerprint: createAssistantRecordFingerprint(category), fields: {} });
			return { success: true };
		}
		const ledger = await getFinancialLedgerContextFirebase(personId);
		await manageFinancialMetadataFirebase({ ...(ledger ? { groupId: ledger.groupId } : {}), expectedActorId: personId, domain: 'category', action: 'delete', recordId: tagId, fields: {}, assistantRequestFingerprint: createAssistantRecordFingerprint({ kind: 'delete_category', tagId, category }), expectedFingerprint: createAssistantRecordFingerprint(category), clientActionId: 'form_' + doc(collection(db, 'tags')).id });
		return { success: true };
	} catch {
		return { success: false, error: 'Não foi possível excluir a categoria. Confira autorização e registros vinculados.' };
	}
}

export async function getTagReferenceSummary(tagId: string) {
	try {
		const personId = auth.currentUser?.uid;
		if (!personId) return { success: false, error: 'Usuário não autenticado.' };
		const spark = await getSparkContextFirebase(db, personId);
		if (spark) return { success: true, data: await getSparkCategoryReferencesFirebase(db, spark.groupId, tagId) };
		const related = await getRelatedUsersIDsFirebase(personId);
		if (!related.success) return { success: false, error: related.error };
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
export async function getTagsWithUsersByPersonFirebase(personId: string): Promise<{ success: boolean; data?: ({ id: string } & Record<string, any>)[]; error?: unknown }> {
	try {
		const spark = await getSparkContextFirebase(db, personId);
		const related = await getRelatedUsersIDsFirebase(personId);
		if (!related.success) return { success: false, error: related.error };
		const relatedIds = Array.isArray(related.data) ? related.data : [];
		const personIds = Array.from(new Set([personId, ...relatedIds]));
		const snapshots = await Promise.all(
			[...Array.from({ length: Math.ceil(personIds.length / 30) }, (_, index) =>
				getDocs(query(collection(db, 'tags'), where('personId', 'in', personIds.slice(index * 30, index * 30 + 30)))),
			), ...(spark ? [getDocs(query(collection(db, 'tags'), where('groupId', '==', spark.groupId)))] : [])],
		);
		const documents = new Map(snapshots.flatMap(snapshot => snapshot.docs.map(tagDoc => [tagDoc.id, tagDoc] as const)));
		const owners = new Map<string, string | null>();
		if (spark) {
			const ids = [...new Set([...documents.values()].map(tagDoc => tagDoc.data()).filter(data => data.schemaVersion !== 1
				&& data.groupId !== spark.groupId && data.personId !== personId && typeof data.personId === 'string').map(data => data.personId as string))];
			await Promise.all(ids.map(async id => { owners.set(id, (await getDocFromServer(doc(db, 'users', id))).data()?.financialGroupId ?? null); }));
			if ((await getSparkContextFirebase(db, personId))?.groupId !== spark.groupId) throw new Error('O acesso financeiro mudou.');
		}
		return { success: true, data: [...documents.values()].filter(tagDoc => {
			const tag = tagDoc.data();
			return tag.deleted !== true && (!spark || (tag.schemaVersion !== 1 || tag.groupId === spark.groupId)
				&& (tag.groupId === spark.groupId || tag.personId === personId || owners.get(tag.personId) === spark.groupId)
				&& [undefined, 'both', 'expense', 'gain'].includes(tag.usageType));
		}).map(tagDoc => ({ id: tagDoc.id, ...tagDoc.data() })) };
	} catch (error) {
		console.error('Erro ao obter categorias do grupo:', error);
		return { success: false, error };
	}
}

// Função para obter os dados de uma tag específica do Firestore
export async function getTagDataFirebase(tagId: string, options: { fromServer?: boolean } = {}) {
	try {
		const tagRef = doc(db, 'tags', tagId);
		const tagDoc = await (options.fromServer ? getDocFromServer(tagRef) : getDoc(tagRef));

		if (tagDoc.exists() && tagDoc.data().deleted !== true) {
			return { success: true, data: tagDoc.data() };
		}

		return { success: false, error: 'Tag não encontrada' };
	} catch (error) {
		console.error('Erro ao obter dados da tag:', error);
		return { success: false, error };
	}
}

// ================================================================================================================= //
