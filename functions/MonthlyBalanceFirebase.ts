import { db } from '@/FirebaseConfig';
import { addDoc, collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';

// Importação das funções auxiliares
import { getRelatedUsersIDsFirebase } from '@/functions/RegisterUserFirebase';


const COLLECTION_NAME = 'monthlyBalances';

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

		// Resgata os usuarios relacionados ao personId
		const usersRelatedResponse = await getRelatedUsersIDsFirebase(personId);

		// Verifica se no banco, existem dados dos usuários relacionados
		const relatedIds =
			usersRelatedResponse.success && Array.isArray(usersRelatedResponse.data)
				? [...usersRelatedResponse.data]
				: [];

		// Realiza uma consulta incluindo o personId e os IDs relacionados para voltar todos os saldos mensais
		// relacionados ao usuário 
		const idsSet = new Set<string>([personId, ...relatedIds.filter(id => typeof id === 'string' && id.length > 0)]);

		// Na lista de IDs, realiza a consulta no Firestore com base nesse Array de IDs
		const balancesCol = collection(db, COLLECTION_NAME);
		const q = query(
			balancesCol,
			where('personId', 'in', Array.from(idsSet)),
			where('bankId', '==', bankId),
			where('year', '==', year),
			where('month', '==', month)
		);

		// Executa a consulta
		const snapshot = await getDocs(q);

		// Se não existir nenhum registro, cria um novo
		if (snapshot.empty) {

			// Cria um novo registro
			const newDocRef = await addDoc(balancesCol, {
				personId,
				bankId,
				year,
				month,
				valueInCents,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			return { success: true, id: newDocRef.id };

		} else {

			// Atualiza o registro existente (considera o primeiro encontrado)
			const docSnap = snapshot.docs[0];
			const docRef = doc(db, COLLECTION_NAME, docSnap.id);
			await setDoc(
				docRef,
				{
					valueInCents,
					updatedAt: new Date(),
				},
				{ merge: true }
			);
			return { success: true, id: docSnap.id };
		}

	} catch (error) {
		console.error('Erro ao inserir/atualizar saldo mensal:', error);
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

// Função para obter o saldo mensal de uma pessoa em um banco específico
export async function getMonthlyBalanceFirebase({ personId, bankId, year, month }: GetMonthlyBalanceParams): Promise<GetMonthlyBalanceResponse> {

	try {
		const balancesCol = collection(db, COLLECTION_NAME);
		const q = query(
			balancesCol,
			where('personId', '==', personId),
			where('bankId', '==', bankId),
			where('year', '==', year),
			where('month', '==', month)
		);
		const snapshot = await getDocs(q);

		if (snapshot.empty) {
			return { success: true, data: null };
		}

		const docSnap = snapshot.docs[0];
		const payload = docSnap.data() as Omit<MonthlyBalanceRecord, 'id'>;
		return { success: true, data: { id: docSnap.id, ...payload } };
	} catch (error) {
		console.error('Erro ao obter saldo mensal:', error);
		return { success: false, error };
	}

}

// Função para obter o saldo mensal de uma pessoa relacionada ao usuário autenticado
export async function getMonthlyBalanceFirebaseRelatedToUser({ personId, bankId, year, month }: GetMonthlyBalanceParams): Promise<GetMonthlyBalanceResponse> {

	try {

		// Resgata os usuarios relacionados ao personId
		const usersRelatedResponse = await getRelatedUsersIDsFirebase(personId);

		// Verifica se no banco, existem dados dos usuários relacionados
		const relatedIds =
			usersRelatedResponse.success && Array.isArray(usersRelatedResponse.data)
				? [...usersRelatedResponse.data]
				: [];

		// Realiza uma consulta incluindo o personId e os IDs relacionados para voltar todos os saldos mensais
		// relacionados ao usuário 
		const idsSet = new Set<string>([personId, ...relatedIds.filter(id => typeof id === 'string' && id.length > 0)]);

		// Na lista de IDs, realiza a consulta no Firestore com base nesse Array de IDs
		const balancesCol = collection(db, COLLECTION_NAME);
		const q = query(
			balancesCol,
			where('personId', 'in', Array.from(idsSet)),
			where('bankId', '==', bankId),
			where('year', '==', year),
			where('month', '==', month)
		);

		// Executa a consulta
		const snapshot = await getDocs(q);

		if (snapshot.empty) {
			return { success: true, data: null };
		} else {
			// Retorna o primeiro saldo mensal encontrado
			const docSnap = snapshot.docs[0];
			const payload = docSnap.data() as Omit<MonthlyBalanceRecord, 'id'>;
			return { success: true, data: { id: docSnap.id, ...payload } };
		}

	} catch (error) {

		console.error('Erro ao obter saldo mensal relacionado ao usuário:', error);
		return { success: false, error };

	}

}