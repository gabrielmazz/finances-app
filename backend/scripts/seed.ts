import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const projectId = process.env.FIREBASE_PROJECT_ID;
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;

if (!firestoreHost || !authHost || !projectId?.startsWith('demo-')) {
	throw new Error('Seed recusado: FIRESTORE_EMULATOR_HOST, FIREBASE_AUTH_EMULATOR_HOST e FIREBASE_PROJECT_ID demo-* são obrigatórios.');
}

if (!getApps().length) initializeApp({ projectId });
const database = getFirestore();
const auth = getAuth();

async function reset() {
	const response = await fetch(`http://${firestoreHost}/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' });
	if (!response.ok) throw new Error(`Não foi possível limpar Firestore Emulator: ${response.status}`);
	const authResponse = await fetch(`http://${authHost}/emulator/v1/projects/${projectId}/accounts`, { method: 'DELETE' });
	if (!authResponse.ok) throw new Error(`Não foi possível limpar Auth Emulator: ${authResponse.status}`);
}

async function createUser(uid: string, email: string, displayName: string) {
	await auth.createUser({ uid, email, password: 'lumus-demo-123', displayName, emailVerified: true });
}

async function seed() {
	await reset();
	await createUser('demo-user', 'usuario@demo.lumus.local', 'Usuário Demo');

	const now = Timestamp.fromDate(new Date('2025-01-15T12:00:00.000Z'));
	const batch = database.batch();
	const put = (path: string, data: Record<string, unknown>) => batch.set(database.doc(path), data);
	put('users/demo-user', {
		name: 'Usuário Demo', email: 'usuario@demo.lumus.local', relatedIdUsers: [],
		// Null keeps the user in the legacy layout while satisfying rules that inspect the field.
		financialGroupId: null, financialGroupRole: null, createdAt: now,
	});

	for (let index = 1; index <= 2; index += 1) {
		put(`banks/demo-bank-${index}`, { personId: 'demo-user', userId: 'demo-user', name: `Conta Demo ${index}`, amount: index === 1 ? 125000 : 45000, color: index === 1 ? '#2563EB' : '#059669', createdAt: now });
	}
	const categoryNames = ['Alimentação', 'Moradia', 'Transporte', 'Saúde', 'Educação', 'Lazer', 'Mercado', 'Assinaturas', 'Trabalho', 'Outros'];
	categoryNames.forEach((name, index) => {
		put(`tags/demo-category-${index + 1}`, { personId: 'demo-user', userId: 'demo-user', name, type: 'expense', color: '#2563EB', createdAt: now });
	});
	for (let index = 1; index <= 3; index += 1) {
		put(`cards/demo-card-${index}`, { personId: 'demo-user', userId: 'demo-user', name: `Cartão Demo ${index}`, lastFourDigits: `${1000 + index}`, brand: index === 1 ? 'Visa' : index === 2 ? 'Mastercard' : 'Elo', creditLimitInCents: 300000, createdAt: now });
	}
	for (let index = 1; index <= 100; index += 1) {
		const day = String(((index - 1) % 28) + 1).padStart(2, '0');
		put(`finances/demo-transaction-${String(index).padStart(3, '0')}`, {
			personId: 'demo-user', userId: 'demo-user', bankId: `demo-bank-${index % 2 === 0 ? 2 : 1}`,
			tagId: `demo-category-${((index - 1) % 10) + 1}`, description: `Transação Demo ${index}`,
			amount: index % 5 === 0 ? 250000 : 1250 + index * 10, type: index % 4 === 0 ? 'gain' : 'expense',
			date: Timestamp.fromDate(new Date(`2025-01-${day}T12:00:00.000Z`)), createdAt: now,
		});
	}
	await batch.commit();
	const [users, categories, transactions, accounts, cards] = await Promise.all([
		database.collection('users').get(), database.collection('tags').get(), database.collection('finances').get(),
		database.collection('banks').get(), database.collection('cards').get(),
	]);
	if (users.size !== 1 || categories.size !== 10 || transactions.size !== 100 || accounts.size !== 2 || cards.size !== 3) {
		throw new Error(`Seed inconsistente: users=${users.size}, categories=${categories.size}, transactions=${transactions.size}, accounts=${accounts.size}, cards=${cards.size}`);
	}
	console.log(`Seed concluído para ${projectId}: 1 usuário, 10 categorias, 100 transações, 2 contas e 3 cartões.`);
}

seed().catch((error) => { console.error(error); process.exitCode = 1; });
