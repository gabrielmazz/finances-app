// O arquivo TagFirebase.ts é responsável por gerenciar as operações relacionadas às tags
// registradas para uso no aplicativo.

import { db } from '@/FirebaseConfig';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';

interface AddTagParams {
	tagName: string;
	personId: string;
	usageType: 'expense' | 'gain';
}

// =========================================== Funções de Registro ================================================== //

// Função para registrar uma nova tag no Firestore
export async function addTagFirebase({ tagName, personId, usageType }: AddTagParams) {
	try {
		const tagRef = doc(collection(db, 'tags'));

		await setDoc(tagRef, {
			name: tagName,
			personId,
			usageType,
			createdAt: new Date(),
		});

		return { success: true, tagId: tagRef.id };
	} catch (error) {
		console.error('Erro ao adicionar tag:', error);
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
