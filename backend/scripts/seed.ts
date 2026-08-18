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

	const currentDate = new Date();
	const currentYear = currentDate.getFullYear();
	const currentMonth = currentDate.getMonth();
	const currentMonthLabel = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
	const now = Timestamp.fromDate(currentDate);
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
		put(`tags/demo-category-${index + 1}`, { personId: 'demo-user', userId: 'demo-user', name, type: 'both', color: '#2563EB', createdAt: now });
	});
	for (let index = 1; index <= 3; index += 1) {
		put(`cards/demo-card-${index}`, { personId: 'demo-user', userId: 'demo-user', name: `Cartão Demo ${index}`, lastFourDigits: `${1000 + index}`, brand: index === 1 ? 'Visa' : index === 2 ? 'Mastercard' : 'Elo', creditLimitInCents: 300000, createdAt: now });
	}
	for (let index = 1; index <= 2; index += 1) {
		put(`monthlyBalances/demo-balance-${index}`, {
			personId: 'demo-user', bankId: `demo-bank-${index}`, year: currentYear, month: currentMonth + 1,
			valueInCents: index === 1 ? 125000 : 45000, createdAt: now, updatedAt: now,
		});
	}
	const mandatoryDate = (day: number) => Timestamp.fromDate(new Date(currentYear, currentMonth, day, 12, 0, 0));
	put('mandatoryExpenses/demo-mandatory-expense-monthly', {
		personId: 'demo-user', name: 'Aluguel Demo', valueInCents: 180000, dueDay: 5, usesBusinessDays: false,
		tagId: 'demo-category-2', description: 'Despesa obrigatória mensal sem parcelas', reminderEnabled: false,
		reminderConfigVersion: 1, reminderDaysBefore: 1, reminderOnDueDate: false, reminderHour: 9, reminderMinute: 0,
		installmentTotal: null, installmentsCompleted: 0, installmentStartDate: null, installmentEndDate: null,
		lastPaymentExpenseId: null, lastPaymentCycle: null, lastPaymentDate: null, createdAt: now, updatedAt: now,
	});
	put('mandatoryExpenses/demo-mandatory-expense-installments', {
		personId: 'demo-user', name: 'Curso Demo Parcelado', valueInCents: 75000, dueDay: 10, usesBusinessDays: false,
		tagId: 'demo-category-5', description: 'Despesa obrigatória com parcelas', reminderEnabled: false,
		reminderConfigVersion: 1, reminderDaysBefore: 1, reminderOnDueDate: false, reminderHour: 9, reminderMinute: 0,
		installmentTotal: 6, installmentsCompleted: 0, installmentStartDate: mandatoryDate(1), installmentEndDate: mandatoryDate(1),
		lastPaymentExpenseId: null, lastPaymentCycle: null, lastPaymentDate: null, createdAt: now, updatedAt: now,
	});
	const extraMandatoryExpenseDays = [1, 2, 2, 4, 7, 7, 10, 12, 15, 15, 18, 20, 25];
	extraMandatoryExpenseDays.forEach((dueDay, index) => {
		const number = index + 3;
		const isInstallment = number === 8;
		put(`mandatoryExpenses/demo-mandatory-expense-${String(number).padStart(2, '0')}`, {
			personId: 'demo-user', name: `Despesa Obrigatória Demo ${number}`, valueInCents: 3000 + number * 1250,
			dueDay, usesBusinessDays: false, tagId: `demo-category-${(index % 8) + 1}`,
			description: isInstallment ? 'Despesa obrigatória parcelada de demonstração' : 'Despesa obrigatória de demonstração',
			reminderEnabled: false, reminderConfigVersion: 1, reminderDaysBefore: 1, reminderOnDueDate: false,
			reminderHour: 9, reminderMinute: 0, installmentTotal: isInstallment ? 4 : null,
			installmentsCompleted: 0, installmentStartDate: isInstallment ? mandatoryDate(1) : null,
			installmentEndDate: isInstallment ? mandatoryDate(1) : null, lastPaymentExpenseId: null,
			lastPaymentCycle: null, lastPaymentDate: null, createdAt: now, updatedAt: now,
		});
	});
	put('mandatoryGains/demo-mandatory-gain-monthly', {
		personId: 'demo-user', name: 'Salário Demo', valueInCents: 520000, dueDay: 5, usesBusinessDays: false,
		tagId: 'demo-category-9', description: 'Ganho obrigatório mensal sem parcelas', reminderEnabled: false,
		reminderConfigVersion: 1, reminderDaysBefore: 0, reminderOnDueDate: true, reminderHour: 9, reminderMinute: 0,
		installmentTotal: null, installmentsCompleted: 0, installmentStartDate: null, installmentEndDate: null,
		lastReceiptGainId: null, lastReceiptCycle: null, lastReceiptDate: null, createdAt: now, updatedAt: now,
	});
	put('mandatoryGains/demo-mandatory-gain-installments', {
		personId: 'demo-user', name: 'Projeto Demo Parcelado', valueInCents: 90000, dueDay: 15, usesBusinessDays: false,
		tagId: 'demo-category-9', description: 'Ganho obrigatório com parcelas', reminderEnabled: false,
		reminderConfigVersion: 1, reminderDaysBefore: 0, reminderOnDueDate: true, reminderHour: 9, reminderMinute: 0,
		installmentTotal: 4, installmentsCompleted: 0, installmentStartDate: mandatoryDate(1), installmentEndDate: mandatoryDate(1),
		lastReceiptGainId: null, lastReceiptCycle: null, lastReceiptDate: null, createdAt: now, updatedAt: now,
	});
	put('financeInvestments/demo-investment', {
		personId: 'demo-user', bankId: 'demo-bank-1', bankNameSnapshot: 'Conta Demo 1', name: 'CDB Demo',
		initialValueInCents: 300000, initialInvestedInCents: 300000, currentValueInCents: 306500,
		lastManualSyncValueInCents: 306500, lastManualSyncAt: now, cdiPercentage: 100,
		cdiPercentageInBasisPoints: 10000, assetType: 'fixed_income', valuationMethod: 'cdi',
		redemptionTerm: 'anytime', description: 'Investimento de demonstração', date: mandatoryDate(3), createdAt: now, updatedAt: now,
	});
	put('financeInvestments/demo-investment-tesouro', {
		personId: 'demo-user', bankId: 'demo-bank-2', bankNameSnapshot: 'Conta Demo 2', name: 'Tesouro Demo',
		initialValueInCents: 180000, initialInvestedInCents: 180000, currentValueInCents: 183200,
		lastManualSyncValueInCents: 183200, lastManualSyncAt: now, cdiPercentage: 0, cdiPercentageInBasisPoints: 0,
		assetType: 'treasury', valuationMethod: 'manual', redemptionTerm: '1m', description: 'Tesouro de demonstração',
		date: mandatoryDate(5), createdAt: now, updatedAt: now,
	});
	put('financeInvestments/demo-investment-fund', {
		personId: 'demo-user', bankId: 'demo-bank-1', bankNameSnapshot: 'Conta Demo 1', name: 'Fundo Demo',
		initialValueInCents: 95000, initialInvestedInCents: 95000, currentValueInCents: 94250,
		lastManualSyncValueInCents: 94250, lastManualSyncAt: now, cdiPercentage: 0, cdiPercentageInBasisPoints: 0,
		assetType: 'fund', valuationMethod: 'manual', redemptionTerm: '3m', description: 'Fundo de demonstração',
		date: mandatoryDate(9), createdAt: now, updatedAt: now,
	});
	put('expenses/demo-investment-deposit', {
		personId: 'demo-user', name: 'Aporte no CDB Demo', valueInCents: 300000, tagId: null, bankId: 'demo-bank-1',
		date: mandatoryDate(3), explanation: 'Aporte de demonstração', moneyFormat: false, isInvestmentDeposit: true,
		investmentId: 'demo-investment', investmentNameSnapshot: 'CDB Demo', isBankTransfer: false,
		bankTransferPairId: null, createdAt: now, updatedAt: now,
	});
	put('bankTransfers/demo-bank-transfer', {
		personId: 'demo-user', sourceBankId: 'demo-bank-1', targetBankId: 'demo-bank-2', valueInCents: 25000,
		date: mandatoryDate(6), description: 'Transferência Demo entre bancos', sourceBankNameSnapshot: 'Conta Demo 1',
		targetBankNameSnapshot: 'Conta Demo 2', expenseId: 'demo-transfer-expense', gainId: 'demo-transfer-gain', createdAt: now, updatedAt: now,
	});
	put('expenses/demo-transfer-expense', {
		personId: 'demo-user', name: 'Transferência para Conta Demo 2', valueInCents: 25000, tagId: null, bankId: 'demo-bank-1',
		date: mandatoryDate(6), explanation: 'Transferência Demo entre bancos', moneyFormat: false, isInvestmentDeposit: false,
		isBankTransfer: true, bankTransferPairId: 'demo-bank-transfer', bankTransferDirection: 'outgoing',
		bankTransferSourceBankId: 'demo-bank-1', bankTransferTargetBankId: 'demo-bank-2', bankTransferExpenseId: 'demo-transfer-expense',
		bankTransferGainId: 'demo-transfer-gain', createdAt: now, updatedAt: now,
	});
	put('gains/demo-transfer-gain', {
		personId: 'demo-user', name: 'Transferência recebida da Conta Demo 1', valueInCents: 25000, paymentFormats: ['transferencia-bancaria'],
		tagId: null, bankId: 'demo-bank-2', date: mandatoryDate(6), explanation: 'Transferência Demo entre bancos', moneyFormat: false,
		isInvestmentRedemption: false, isBankTransfer: true, bankTransferPairId: 'demo-bank-transfer', bankTransferDirection: 'incoming',
		bankTransferSourceBankId: 'demo-bank-1', bankTransferTargetBankId: 'demo-bank-2', bankTransferExpenseId: 'demo-transfer-expense',
		bankTransferGainId: 'demo-transfer-gain', createdAt: now, updatedAt: now,
	});
	put('cashRescues/demo-cash-rescue', {
		name: 'Saque em dinheiro', bankId: 'demo-bank-2', bankNameSnapshot: 'Conta Demo 2', valueInCents: 30000,
		date: mandatoryDate(8), personId: 'demo-user', description: 'Dinheiro físico fora dos bancos', createdAt: now, updatedAt: now,
	});
	let expenseCount = 0;
	let gainCount = 0;
	for (let index = 1; index <= 100; index += 1) {
		const day = String(((index - 1) % 28) + 1).padStart(2, '0');
		const isGain = index % 4 === 0;
		const collectionName = isGain ? 'gains' : 'expenses';
		if (isGain) gainCount += 1;
		else expenseCount += 1;
		put(`${collectionName}/demo-${collectionName.slice(0, -1)}-${String(index).padStart(3, '0')}`, {
			personId: 'demo-user', userId: 'demo-user', bankId: `demo-bank-${index % 2 === 0 ? 2 : 1}`,
			tagId: `demo-category-${((index - 1) % 10) + 1}`, name: `${isGain ? 'Ganho' : 'Despesa'} Demo ${index}`,
			valueInCents: index % 5 === 0 ? 250000 : 1250 + index * 10,
			date: Timestamp.fromDate(new Date(currentYear, currentMonth, Number(day), 12, 0, 0)), createdAt: now, updatedAt: now,
			...(isGain ? { paymentFormats: [], isInvestmentRedemption: false } : { isInvestmentDeposit: false }),
		});
	}
	await batch.commit();
	const [users, categories, expenses, gains, accounts, cards, balances, mandatoryExpenses, mandatoryGains, investments, transfers, cashRescues] = await Promise.all([
		database.collection('users').get(), database.collection('tags').get(),
		database.collection('expenses').get(), database.collection('gains').get(), database.collection('banks').get(), database.collection('cards').get(),
		database.collection('monthlyBalances').get(), database.collection('mandatoryExpenses').get(), database.collection('mandatoryGains').get(),
		database.collection('financeInvestments').get(), database.collection('bankTransfers').get(), database.collection('cashRescues').get(),
	]);
	if (users.size !== 1 || categories.size !== 10 || expenses.size !== expenseCount + 2 || gains.size !== gainCount + 1 || accounts.size !== 2 || cards.size !== 3 || balances.size !== 2 || mandatoryExpenses.size !== 15 || mandatoryGains.size !== 2 || investments.size !== 3 || transfers.size !== 1 || cashRescues.size !== 1) {
		throw new Error(`Seed inconsistente: users=${users.size}, categories=${categories.size}, expenses=${expenses.size}, gains=${gains.size}, accounts=${accounts.size}, cards=${cards.size}, balances=${balances.size}, mandatoryExpenses=${mandatoryExpenses.size}, mandatoryGains=${mandatoryGains.size}, investments=${investments.size}, transfers=${transfers.size}, cashRescues=${cashRescues.size}`);
	}
	console.log(`Seed concluído para ${projectId} no mês ${currentMonthLabel}: ${expenses.size} despesas, ${gains.size} ganhos, 2 saldos, 2 obrigatórias de cada tipo, 1 investimento, 1 transferência e 1 saque.`);
}

seed().catch((error) => { console.error(error); process.exitCode = 1; });
