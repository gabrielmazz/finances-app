import { z } from 'zod';

import {
	ASSISTANT_ACTION_KINDS,
	type AssistantActionKind,
	type AssistantCatalogType,
	type AssistantFieldKind,
	type AssistantMissingField,
	type AssistantModelActionProposal,
} from '@/types/lumusAssistant';

const shortText = z.string().trim().min(1).max(120);
const longText = z.string().trim().max(800).nullable().optional();
const opaqueRef = z.string().trim().min(1).max(120);
const moneyInCents = z.number().int().safe().positive();
const nonNegativeMoneyInCents = z.number().int().safe().nonnegative();
const isoDate = z.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/)
	.refine(value => {
		const [year, month, day] = value.split('-').map(Number);
		const candidate = new Date(Date.UTC(year!, month! - 1, day!, 12));
		return candidate.getUTCFullYear() === year &&
			candidate.getUTCMonth() === month! - 1 &&
			candidate.getUTCDate() === day;
	}, 'Data civil inválida.');
const cycleKey = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional();
const dueDay = z.number().int().min(1).max(31);
const installments = z.number().int().min(1).max(600).nullable().optional();
const reminderDaysBefore = z.number().int().min(1).max(3).optional();

const movementCreateShape = {
	name: shortText,
	valueInCents: moneyInCents,
	date: isoDate,
	time,
	bankRef: opaqueRef,
	categoryRef: opaqueRef,
	explanation: longText,
};

const movementUpdateShape = {
	recordRef: opaqueRef,
	name: shortText.optional(),
	valueInCents: moneyInCents.optional(),
	date: isoDate.optional(),
	time,
	bankRef: opaqueRef.optional(),
	categoryRef: opaqueRef.optional(),
	explanation: longText,
};

const recurringCreateShape = {
	name: shortText,
	valueInCents: moneyInCents,
	dueDay,
	usesBusinessDays: z.boolean().optional(),
	categoryRef: opaqueRef,
	description: longText,
	reminderEnabled: z.boolean().optional(),
	reminderDaysBefore,
	reminderOnDueDate: z.boolean().optional(),
	reminderTime: time,
	installmentTotal: installments,
	installmentStartDate: isoDate.nullable().optional(),
	installmentEndDate: isoDate.nullable().optional(),
};

const recurringUpdateShape = {
	recordRef: opaqueRef,
	name: shortText.optional(),
	valueInCents: moneyInCents.optional(),
	dueDay: dueDay.optional(),
	usesBusinessDays: z.boolean().optional(),
	categoryRef: opaqueRef.optional(),
	description: longText,
	reminderEnabled: z.boolean().optional(),
	reminderDaysBefore,
	reminderOnDueDate: z.boolean().optional(),
	reminderTime: time,
	installmentTotal: installments,
	installmentStartDate: isoDate.nullable().optional(),
	installmentEndDate: isoDate.nullable().optional(),
};

export const assistantActionSchemas = {
	create_expense: z.object(movementCreateShape),
	update_expense: z.object(movementUpdateShape),
	delete_expense: z.object({ recordRef: opaqueRef }),
	create_gain: z.object({
		...movementCreateShape,
		paymentFormats: z.array(shortText).max(8).optional(),
	}),
	update_gain: z.object({
		...movementUpdateShape,
		paymentFormats: z.array(shortText).max(8).optional(),
	}),
	delete_gain: z.object({ recordRef: opaqueRef }),
	upsert_monthly_balance: z.object({
		bankRef: opaqueRef,
		cycle: cycleKey,
		valueInCents: nonNegativeMoneyInCents,
	}),
	create_transfer: z
		.object({
			sourceBankRef: opaqueRef,
			targetBankRef: opaqueRef,
			valueInCents: moneyInCents,
			date: isoDate,
			time,
			description: longText,
		})
		.refine(value => value.sourceBankRef !== value.targetBankRef, {
			message: 'O banco de origem e o banco de destino precisam ser diferentes.',
			path: ['targetBankRef'],
		}),
	create_cash_withdrawal: z.object({
		bankRef: opaqueRef,
		valueInCents: moneyInCents,
		date: isoDate,
		time,
		description: longText,
	}),
	undo_cash_withdrawal: z.object({ recordRef: opaqueRef }),
	create_mandatory_expense: z.object(recurringCreateShape),
	update_mandatory_expense: z.object(recurringUpdateShape),
	delete_mandatory_expense: z.object({ recordRef: opaqueRef }),
	pay_mandatory_expense: z.object({
		recordRef: opaqueRef,
		bankRef: opaqueRef,
		date: isoDate,
		time,
		valueInCents: moneyInCents.optional(),
		explanation: longText,
	}),
	undo_mandatory_expense_payment: z.object({ recordRef: opaqueRef }),
	create_mandatory_gain: z.object(recurringCreateShape),
	update_mandatory_gain: z.object(recurringUpdateShape),
	delete_mandatory_gain: z.object({ recordRef: opaqueRef }),
	receive_mandatory_gain: z.object({
		recordRef: opaqueRef,
		bankRef: opaqueRef,
		date: isoDate,
		time,
		valueInCents: moneyInCents.optional(),
		explanation: longText,
	}),
	undo_mandatory_gain_receipt: z.object({ recordRef: opaqueRef }),
	create_investment: z.object({
		name: shortText,
		initialValueInCents: nonNegativeMoneyInCents,
		currentValueInCents: nonNegativeMoneyInCents.optional(),
		cdiPercentageInBasisPoints: z.number().int().min(0).max(1_000_000),
		assetType: z.enum(['fixed_income', 'treasury', 'stock', 'fund']).optional(),
		valuationMethod: z.enum(['cdi', 'manual']).optional(),
		redemptionTerm: z.enum(['anytime', '1m', '3m', '6m', '1y', '2y', '3y']),
		bankRef: opaqueRef,
		date: isoDate,
		description: longText,
	}),
	update_investment: z.object({
		recordRef: opaqueRef,
		name: shortText.optional(),
		initialValueInCents: nonNegativeMoneyInCents.optional(),
		currentValueInCents: nonNegativeMoneyInCents.optional(),
		cdiPercentageInBasisPoints: z.number().int().min(0).max(1_000_000).optional(),
		assetType: z.enum(['fixed_income', 'treasury', 'stock', 'fund']).optional(),
		valuationMethod: z.enum(['cdi', 'manual']).optional(),
		redemptionTerm: z.enum(['anytime', '1m', '3m', '6m', '1y', '2y', '3y']).optional(),
		bankRef: opaqueRef.optional(),
		description: longText,
	}),
	delete_investment: z.object({ recordRef: opaqueRef }),
	deposit_investment: z.object({
		investmentRef: opaqueRef,
		valueInCents: moneyInCents,
		date: isoDate,
		time,
		description: longText,
	}),
	redeem_investment: z.object({
		investmentRef: opaqueRef,
		valueInCents: moneyInCents,
		date: isoDate,
		time,
		description: longText,
	}),
	sync_investment: z.object({
		investmentRef: opaqueRef,
		syncedValueInCents: nonNegativeMoneyInCents,
		date: isoDate,
		description: longText,
	}),
	undo_investment_deposit: z.object({ recordRef: opaqueRef }),
	undo_investment_redemption: z.object({ recordRef: opaqueRef }),
	undo_investment_sync: z.object({ recordRef: opaqueRef }),
	upsert_cdi_rate: z.object({
		annualRateInBasisPoints: z.number().int().positive().max(100_000),
		effectiveFrom: isoDate,
	}),
	create_bank: z.object({
		bankName: shortText,
		initialBalanceInCents: z.number().int().safe(),
		initialBalanceCycle: cycleKey,
		colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
		iconKey: shortText.nullable().optional(),
	}),
	update_bank: z.object({
		recordRef: opaqueRef,
		bankName: shortText.optional(),
		colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
		iconKey: shortText.nullable().optional(),
	}),
	delete_bank: z.object({ recordRef: opaqueRef }),
	create_category: z.object({
		categoryName: shortText,
		usageType: z.enum(['expense', 'gain', 'both']),
		isMandatoryExpense: z.boolean().optional(),
		isMandatoryGain: z.boolean().optional(),
		showInBothLists: z.boolean().optional(),
	}),
	update_category: z.object({
		recordRef: opaqueRef,
		categoryName: shortText.optional(),
		usageType: z.enum(['expense', 'gain', 'both']).optional(),
		isMandatoryExpense: z.boolean().optional(),
		isMandatoryGain: z.boolean().optional(),
		showInBothLists: z.boolean().optional(),
	}),
	delete_category: z.object({ recordRef: opaqueRef }),
} satisfies Record<AssistantActionKind, z.ZodType>;

type FieldDefinition = {
	label: string;
	kind: AssistantFieldKind;
	question: string;
	choiceSource?: AssistantCatalogType;
	allowApplyToSimilar?: boolean;
};

const COMMON_FIELDS: Record<string, FieldDefinition> = {
	name: { label: 'Nome', kind: 'text', question: 'Como você quer chamar este registro?' },
	valueInCents: { label: 'Valor', kind: 'money', question: 'Qual é o valor?' },
	initialValueInCents: { label: 'Valor inicial', kind: 'money', question: 'Qual é o valor inicial?' },
	currentValueInCents: { label: 'Valor atual', kind: 'money', question: 'Qual é o valor atual?' },
	syncedValueInCents: { label: 'Valor atualizado', kind: 'money', question: 'Qual é o valor atual do investimento?' },
	date: { label: 'Data', kind: 'date', question: 'Em qual data isso aconteceu?' },
	time: { label: 'Horário', kind: 'time', question: 'Qual horário você quer usar?' },
	cycle: { label: 'Mês', kind: 'month', question: 'Para qual mês é esse saldo?' },
	initialBalanceCycle: { label: 'Mês do saldo inicial', kind: 'month', question: 'A qual mês pertence o saldo inicial?' },
	bankRef: {
		label: 'Banco ou dinheiro',
		kind: 'bank',
		question: 'Onde você quer registrar?',
		choiceSource: 'banks',
		allowApplyToSimilar: true,
	},
	sourceBankRef: {
		label: 'Banco de origem',
		kind: 'bank',
		question: 'De qual banco o dinheiro vai sair?',
		choiceSource: 'banks',
	},
	targetBankRef: {
		label: 'Banco de destino',
		kind: 'bank',
		question: 'Para qual banco o dinheiro vai?',
		choiceSource: 'banks',
	},
	categoryRef: {
		label: 'Categoria',
		kind: 'category',
		question: 'Qual categoria combina com este registro?',
		allowApplyToSimilar: true,
	},
	investmentRef: {
		label: 'Investimento',
		kind: 'investment',
		question: 'Qual investimento você quer usar?',
		choiceSource: 'investments',
	},
	recordRef: {
		label: 'Registro',
		kind: 'record',
		question: 'Qual registro você quer usar?',
	},
	dueDay: { label: 'Dia de vencimento', kind: 'number', question: 'Qual é o dia do vencimento?' },
	usesBusinessDays: {
		label: 'Dias úteis',
		kind: 'boolean',
		question: 'O vencimento deve considerar somente dias úteis?',
	},
	reminderEnabled: { label: 'Lembrete', kind: 'boolean', question: 'Você quer receber um lembrete?' },
	reminderDaysBefore: { label: 'Antecedência', kind: 'choice', question: 'Quantos dias antes devo lembrar?' },
	reminderOnDueDate: { label: 'Lembrar no vencimento', kind: 'boolean', question: 'Também devo lembrar no dia do vencimento?' },
	reminderTime: { label: 'Horário do lembrete', kind: 'time', question: 'Em qual horário devo lembrar?' },
	installmentTotal: { label: 'Parcelas', kind: 'number', question: 'Quantas parcelas existem?' },
	redemptionTerm: { label: 'Prazo de resgate', kind: 'choice', question: 'Qual é o prazo para resgatar esse investimento?' },
	cdiPercentageInBasisPoints: { label: 'Percentual do CDI', kind: 'number', question: 'Qual percentual do CDI esse investimento rende?' },
	annualRateInBasisPoints: { label: 'Taxa CDI anual', kind: 'number', question: 'Qual é a taxa anual do CDI?' },
	effectiveFrom: { label: 'Início da taxa', kind: 'date', question: 'A partir de qual data essa taxa vale?' },
	bankName: { label: 'Nome do banco', kind: 'text', question: 'Qual será o nome do banco?' },
	initialBalanceInCents: { label: 'Saldo inicial', kind: 'money', question: 'Qual é o saldo inicial desse banco?' },
	categoryName: { label: 'Nome da categoria', kind: 'text', question: 'Qual será o nome da categoria?' },
	usageType: { label: 'Uso da categoria', kind: 'choice', question: 'Essa categoria será usada em despesas, ganhos ou nos dois?' },
};

const RECORD_CATALOG_BY_ACTION: Partial<Record<AssistantActionKind, AssistantCatalogType>> = {
	update_expense: 'expenses',
	delete_expense: 'expenses',
	update_gain: 'gains',
	delete_gain: 'gains',
	undo_cash_withdrawal: 'cashWithdrawals',
	update_mandatory_expense: 'mandatoryExpenses',
	delete_mandatory_expense: 'mandatoryExpenses',
	pay_mandatory_expense: 'mandatoryExpenses',
	undo_mandatory_expense_payment: 'mandatoryExpenses',
	update_mandatory_gain: 'mandatoryGains',
	delete_mandatory_gain: 'mandatoryGains',
	receive_mandatory_gain: 'mandatoryGains',
	undo_mandatory_gain_receipt: 'mandatoryGains',
	update_investment: 'investments',
	delete_investment: 'investments',
	undo_investment_deposit: 'investmentDeposits',
	undo_investment_redemption: 'investmentRedemptions',
	undo_investment_sync: 'investmentSyncs',
	update_bank: 'banks',
	delete_bank: 'banks',
	update_category: 'categories',
	delete_category: 'categories',
};

const CATEGORY_CATALOG_BY_ACTION: Partial<Record<AssistantActionKind, AssistantCatalogType>> = {
	create_expense: 'expenseCategories',
	update_expense: 'expenseCategories',
	create_gain: 'gainCategories',
	update_gain: 'gainCategories',
	create_mandatory_expense: 'mandatoryExpenseCategories',
	update_mandatory_expense: 'mandatoryExpenseCategories',
	create_mandatory_gain: 'mandatoryGainCategories',
	update_mandatory_gain: 'mandatoryGainCategories',
};

export const ASSISTANT_ACTION_LABELS: Record<AssistantActionKind, string> = {
	create_expense: 'Registrar despesa',
	update_expense: 'Editar despesa',
	delete_expense: 'Excluir despesa',
	create_gain: 'Registrar ganho',
	update_gain: 'Editar ganho',
	delete_gain: 'Excluir ganho',
	upsert_monthly_balance: 'Salvar saldo mensal',
	create_transfer: 'Fazer transferência',
	create_cash_withdrawal: 'Registrar saque',
	undo_cash_withdrawal: 'Desfazer saque',
	create_mandatory_expense: 'Criar gasto obrigatório',
	update_mandatory_expense: 'Editar gasto obrigatório',
	delete_mandatory_expense: 'Excluir gasto obrigatório',
	pay_mandatory_expense: 'Pagar gasto obrigatório',
	undo_mandatory_expense_payment: 'Desfazer pagamento obrigatório',
	create_mandatory_gain: 'Criar ganho obrigatório',
	update_mandatory_gain: 'Editar ganho obrigatório',
	delete_mandatory_gain: 'Excluir ganho obrigatório',
	receive_mandatory_gain: 'Receber ganho obrigatório',
	undo_mandatory_gain_receipt: 'Desfazer recebimento obrigatório',
	create_investment: 'Criar investimento',
	update_investment: 'Editar investimento',
	delete_investment: 'Excluir investimento',
	deposit_investment: 'Fazer aporte',
	redeem_investment: 'Resgatar investimento',
	sync_investment: 'Sincronizar investimento',
	undo_investment_deposit: 'Desfazer aporte',
	undo_investment_redemption: 'Desfazer resgate',
	undo_investment_sync: 'Desfazer sincronização',
	upsert_cdi_rate: 'Salvar taxa CDI',
	create_bank: 'Criar banco',
	update_bank: 'Editar banco',
	delete_bank: 'Excluir banco',
	create_category: 'Criar categoria',
	update_category: 'Editar categoria',
	delete_category: 'Excluir categoria',
};

export const isAssistantActionKind = (value: unknown): value is AssistantActionKind =>
	typeof value === 'string' && (ASSISTANT_ACTION_KINDS as readonly string[]).includes(value);

export const getActionSchema = (kind: AssistantActionKind): z.ZodType => assistantActionSchemas[kind];

export const getFieldDefinition = (
	kind: AssistantActionKind,
	fieldKey: string,
): AssistantMissingField => {
	const base = COMMON_FIELDS[fieldKey] ?? {
		label: fieldKey,
		kind: 'text' as const,
		question: `Qual informação devo usar em ${fieldKey}?`,
	};

	let choiceSource = base.choiceSource;
	if (fieldKey === 'recordRef') {
		choiceSource = RECORD_CATALOG_BY_ACTION[kind];
	}
	if (fieldKey === 'categoryRef') {
		choiceSource = CATEGORY_CATALOG_BY_ACTION[kind];
	}

	return {
		key: fieldKey,
		label: base.label,
		kind: base.kind,
		question: base.question,
		choiceSource,
		allowApplyToSimilar: base.allowApplyToSimilar,
	};
};

export const getActionValidation = (
	proposal: AssistantModelActionProposal,
): {
	payload: Record<string, unknown>;
	missingFields: AssistantMissingField[];
	warnings: string[];
	valid: boolean;
} => {
	const rawPayload =
		proposal.payload && typeof proposal.payload === 'object' && !Array.isArray(proposal.payload)
			? proposal.payload
			: {};
	const result = assistantActionSchemas[proposal.kind].safeParse(rawPayload);

	if (result.success) {
		return {
			payload: result.data as Record<string, unknown>,
			missingFields: [],
			warnings: [],
			valid: true,
		};
	}

	const invalidFieldKeys = Array.from(
		new Set(
			result.error.issues
				.map(issue => issue.path[0])
				.filter((field): field is string => typeof field === 'string'),
		),
	);
	const missingFields = invalidFieldKeys.map(field => getFieldDefinition(proposal.kind, field));
	const warnings = result.error.issues
		.filter(issue => issue.path.length === 0)
		.map(issue => issue.message);

	return {
		payload: { ...rawPayload },
		missingFields,
		warnings,
		valid: false,
	};
};
