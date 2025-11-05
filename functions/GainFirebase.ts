// O arquivo GainFirebase.ts é responsável por gerenciar as operações relacionadas
// aos ganhos registrados no aplicativo.

import { db } from '@/FirebaseConfig';
import { collection, deleteDoc, doc, getDoc, getDocs, limit as limitQuery, orderBy, query, setDoc, where } from 'firebase/firestore';

interface AddGainParams {
	name: string;
	valueInCents: number;
	paymentFormats?: string[];
	explanation?: string | null;
	tagId: string;
	bankId: string;
	date: Date;
	personId: string;
}

// =========================================== Funções de Registro ================================================== //

// Função para registrar um novo ganho no Firestore
export async function addGainFirebase({
	name,
	valueInCents,
	paymentFormats,
	explanation,
	tagId,
	bankId,
	date,
	personId,
}: AddGainParams) {
	try {
		const gainRef = doc(collection(db, 'gains'));

		await setDoc(gainRef, {
			name,
			valueInCents,
			paymentFormats,
			explanation: explanation || null,
			tagId,
			bankId,
			date,
			personId,
			createdAt: new Date(),
		});

		return { success: true, gainId: gainRef.id };
	} catch (error) {
		console.error('Erro ao adicionar ganho:', error);
		return { success: false, error };
	}
}

// Função para deletar um ganho registrado no Firestore
export async function deleteGainFirebase(gainId: string) {
	try {
		await deleteDoc(doc(db, 'gains', gainId));
		return { success: true };
	} catch (error) {
		console.error('Erro ao deletar ganho:', error);
		return { success: false, error };
	}
}

// =========================================== Funções de Consulta ================================================== //

// Função para obter todos os ganhos registrados no Firestore
export async function getAllGainsFirebase() {
	try {
		const gainsSnapshot = await getDocs(collection(db, 'gains'));
		const gains = gainsSnapshot.docs.map(gainDoc => ({
			id: gainDoc.id,
			...gainDoc.data(),
		}));

		return { success: true, data: gains };
	} catch (error) {
		console.error('Erro ao obter todos os ganhos:', error);
		return { success: false, error };
	}
}

// Função para obter os dados de um ganho específico do Firestore
export async function getGainDataFirebase(gainId: string) {
	try {
		const gainDoc = await getDoc(doc(db, 'gains', gainId));

		if (gainDoc.exists()) {
			return { success: true, data: gainDoc.data() };
		}

		return { success: false, error: 'Ganho não encontrado' };
	} catch (error) {
		console.error('Erro ao obter dados do ganho:', error);
		return { success: false, error };
	}
}

interface GetLimitedGainsParams {
	limit: number;
	personId?: string;
}

// Função para obter um limite de ganhos registrados no Firestore, ordenados por data de criação (mais recentes primeiro)
export async function getLimitedGainsFirebase({ limit, personId }: GetLimitedGainsParams) {
	try {
		const gainsCollection = collection(db, 'gains');

		const gainsQuery = personId
			? query(gainsCollection, where('personId', '==', personId), orderBy('createdAt', 'desc'), limitQuery(limit))
			: query(gainsCollection, orderBy('createdAt', 'desc'), limitQuery(limit));

		const gainsSnapshot = await getDocs(gainsQuery);
		const gains = gainsSnapshot.docs.map(gainDoc => ({
			id: gainDoc.id,
			...gainDoc.data(),
		}));

		return { success: true, data: gains };
	} catch (error) {
		console.error('Erro ao obter ganhos limitados:', error);
		return { success: false, error };
	}
}

// ================================================================================================================= //
