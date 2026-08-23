import React from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BarChart, LineChart, PieChart } from 'react-native-gifted-charts';

import { Input, InputField } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import type {
	AssistantDraftAction,
	AssistantMessage,
	AssistantMissingField,
	AssistantReport,
	AssistantResolvedCatalog,
} from '@/types/lumusAssistant';
import { ASSISTANT_ACTION_LABELS, getFieldDefinition } from '@/utils/lumusAssistantSchemas';
import {
	formatCents,
	maskFinancialValuesInText,
	normalizeAssistantDateInput,
	parseMoneyToCents,
} from '@/utils/lumusAssistant';

const MONEY_FIELDS = new Set([
	'valueInCents',
	'initialValueInCents',
	'currentValueInCents',
	'syncedValueInCents',
	'initialBalanceInCents',
]);

const FIELD_LABELS: Record<string, string> = {
	name: 'Nome',
	valueInCents: 'Valor',
	date: 'Data',
	time: 'Horário',
	bankRef: 'Banco',
	sourceBankRef: 'Banco de origem',
	targetBankRef: 'Banco de destino',
	categoryRef: 'Categoria',
	recordRef: 'Registro',
	investmentRef: 'Investimento',
	explanation: 'Observação',
	description: 'Descrição',
	cycle: 'Mês',
	dueDay: 'Vencimento',
	usesBusinessDays: 'Somente dias úteis',
	reminderEnabled: 'Lembrete',
	reminderDaysBefore: 'Dias antes',
	reminderOnDueDate: 'Lembrar no vencimento',
	reminderTime: 'Horário do lembrete',
	installmentTotal: 'Parcelas',
	initialValueInCents: 'Valor inicial',
	currentValueInCents: 'Valor atual',
	syncedValueInCents: 'Valor sincronizado',
	cdiPercentageInBasisPoints: '% do CDI',
	annualRateInBasisPoints: 'Taxa CDI anual',
	effectiveFrom: 'Vigência da taxa',
	assetType: 'Tipo de investimento',
	valuationMethod: 'Forma de valorização',
	redemptionTerm: 'Prazo de resgate',
	bankName: 'Nome do banco',
	initialBalanceInCents: 'Saldo inicial',
	initialBalanceCycle: 'Mês do saldo',
	categoryName: 'Nome da categoria',
	usageType: 'Uso da categoria',
	installmentStartDate: 'Início das parcelas',
	installmentEndDate: 'Fim das parcelas',
	paymentFormats: 'Tipo do ganho',
	isMandatoryExpense: 'Usar em gastos obrigatórios',
	isMandatoryGain: 'Usar em ganhos obrigatórios',
	showInBothLists: 'Mostrar nas listas obrigatórias',
	colorHex: 'Cor',
	iconKey: 'Ícone',
};

const STATIC_CHOICES: Record<string, Array<{ value: unknown; label: string }>> = {
	usageType: [
		{ value: 'expense', label: 'Despesas' },
		{ value: 'gain', label: 'Ganhos' },
		{ value: 'both', label: 'Despesas e ganhos' },
	],
	redemptionTerm: [
		{ value: 'anytime', label: 'A qualquer momento' },
		{ value: '1m', label: '1 mês' },
		{ value: '3m', label: '3 meses' },
		{ value: '6m', label: '6 meses' },
		{ value: '1y', label: '1 ano' },
		{ value: '2y', label: '2 anos' },
		{ value: '3y', label: '3 anos' },
	],
	assetType: [
		{ value: 'fixed_income', label: 'Renda fixa' },
		{ value: 'treasury', label: 'Tesouro' },
		{ value: 'stock', label: 'Ações' },
		{ value: 'fund', label: 'Fundo' },
	],
	valuationMethod: [
		{ value: 'cdi', label: 'CDI' },
		{ value: 'manual', label: 'Atualização manual' },
	],
	reminderDaysBefore: [1, 2, 3].map(value => ({ value, label: `${value} dia${value > 1 ? 's' : ''} antes` })),
	paymentFormats: [
		{ value: ['Variable'], label: 'Renda variável' },
		{ value: ['External'], label: 'Pagamento externo' },
		{ value: [], label: 'Nenhum tipo especial' },
	],
};

const normalizeMonth = (value: string) => {
	const trimmed = value.trim();
	if (/^\d{4}-(0[1-9]|1[0-2])$/.test(trimmed)) return trimmed;
	const match = /^(0?[1-9]|1[0-2])\/(\d{4})$/.exec(trimmed);
	return match ? `${match[2]}-${String(Number(match[1])).padStart(2, '0')}` : null;
};

const parseFieldInput = (field: AssistantMissingField, raw: string): unknown => {
	if (field.kind === 'money') return parseMoneyToCents(raw);
	if (field.kind === 'date') return normalizeAssistantDateInput(raw);
	if (field.kind === 'month') return normalizeMonth(raw);
	if (field.kind === 'number') {
		const parsed = Number(raw.replace(',', '.'));
		if (!Number.isFinite(parsed)) return null;
		if (field.key === 'annualRateInBasisPoints' || field.key === 'cdiPercentageInBasisPoints') {
			return Math.round(parsed * 100);
		}
		return Math.trunc(parsed);
	}
	if (field.kind === 'boolean') return raw === 'true';
	return raw.trim() || null;
};

const findCatalogLabel = (catalog: AssistantResolvedCatalog, value: unknown) => {
	if (typeof value !== 'string') return null;
	for (const items of Object.values(catalog)) {
		const item = items?.find(candidate => candidate.handle === value);
		if (item) return item.label;
	}
	return null;
};

const formatPayloadValue = (
	key: string,
	value: unknown,
	catalog: AssistantResolvedCatalog,
	hideValues: boolean,
) => {
	if (MONEY_FIELDS.has(key) && typeof value === 'number') {
		return hideValues ? '••••' : formatCents(value);
	}
	if ((key === 'cdiPercentageInBasisPoints' || key === 'annualRateInBasisPoints') && typeof value === 'number') {
		return hideValues ? '••••' : `${(value / 100).toLocaleString('pt-BR')}%`;
	}
	if (typeof value === 'string' && value.startsWith('action:')) {
		return 'Será definido depois da ação anterior';
	}
	const catalogLabel = findCatalogLabel(catalog, value);
	if (catalogLabel) return catalogLabel;
	if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
	if (Array.isArray(value)) return value.join(', ');
	if (value === null || value === undefined || value === '') return 'Não informado';
	return String(value);
};

const cardPalette = (isDarkMode: boolean) => ({
	card: isDarkMode ? '#0f172a' : '#ffffff',
	border: isDarkMode ? '#1e293b' : '#e2e8f0',
	text: isDarkMode ? '#f1f5f9' : '#0f172a',
	muted: isDarkMode ? '#94a3b8' : '#64748b',
	yellow: '#facc15',
	input: isDarkMode ? '#020617' : '#f8fafc',
});

export const AssistantQuestionCard = ({
	message,
	isDarkMode,
	hideValues,
	onAnswer,
}: {
	message: Extract<AssistantMessage, { type: 'question' }>;
	isDarkMode: boolean;
	hideValues: boolean;
	onAnswer(value: unknown, label: string, applyToSimilar: boolean): Promise<void>;
}) => {
	const palette = cardPalette(isDarkMode);
	const [input, setInput] = React.useState('');
	const [applyToSimilar, setApplyToSimilar] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const [submitting, setSubmitting] = React.useState(false);
	const choices = message.field.choices?.length
		? message.field.choices
		: message.field.kind === 'boolean'
				? [{ value: 'true', label: 'Sim' }, { value: 'false', label: 'Não' }]
				: STATIC_CHOICES[message.field.key]?.map(item => ({ value: String(item.value), label: item.label })) ?? [];
	const shouldMaskAnswer = hideValues && (
		message.field.kind === 'money' ||
		message.field.key === 'annualRateInBasisPoints' ||
		message.field.key === 'cdiPercentageInBasisPoints'
	);
	const submit = async (rawValue: string, label = rawValue) => {
		const parsed = choices.length > 0 && message.field.kind !== 'boolean'
			? STATIC_CHOICES[message.field.key]?.find(item => String(item.value) === rawValue)?.value ?? rawValue
			: parseFieldInput(message.field, rawValue);
		if (parsed === null || parsed === undefined || parsed === '') {
			setError('Confira essa informação antes de continuar.');
			return;
		}
		setSubmitting(true);
		setError(null);
		try {
			await onAnswer(parsed, label, applyToSimilar);
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<View style={{ borderRadius: 22, borderWidth: 1, borderColor: palette.yellow, backgroundColor: palette.card, padding: 16, gap: 12 }}>
			<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
				<Ionicons name="help-circle" size={20} color={palette.yellow} />
				<Text style={{ color: palette.text, fontWeight: '800', flex: 1 }}>{message.text}</Text>
			</View>
			{message.answeredAt ? (
				<View style={{ borderRadius: 14, backgroundColor: palette.input, padding: 12 }}>
					<Text style={{ color: palette.muted }}>Resposta: {shouldMaskAnswer ? '••••' : message.answerLabel}</Text>
				</View>
			) : (
				<>
					{choices.length > 0 ? (
						<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
							{choices.map(choice => (
								<Pressable
									key={choice.value}
									disabled={submitting || choice.disabled}
									onPress={() => void submit(choice.value, choice.label)}
									style={({ pressed }) => ({
										borderRadius: 16,
										borderWidth: 1,
										borderColor: palette.border,
										backgroundColor: palette.input,
										paddingHorizontal: 12,
										paddingVertical: 9,
										opacity: pressed || choice.disabled ? 0.6 : 1,
									})}
								>
									<Text style={{ color: palette.text, fontWeight: '700' }}>{choice.label}</Text>
									{choice.description ? <Text style={{ color: palette.muted, fontSize: 11 }}>{choice.description}</Text> : null}
								</Pressable>
							))}
						</View>
					) : (
						<View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
							<Input
								isDisabled={submitting}
								style={{ flex: 1, minHeight: 46, borderRadius: 16, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.input }}
							>
								<InputField
									value={input}
									onChangeText={setInput}
									placeholder={message.field.kind === 'money' ? 'Ex.: 50,00' : message.field.kind === 'date' ? 'Ex.: 18/07/2026' : 'Digite aqui'}
									placeholderTextColor={palette.muted}
									keyboardType={message.field.kind === 'money' || message.field.kind === 'number' ? 'decimal-pad' : 'default'}
									style={{ color: palette.text, paddingHorizontal: 12 }}
								/>
							</Input>
							<Pressable
								disabled={submitting}
								onPress={() => void submit(input)}
								style={{ width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.yellow }}
							>
								<Ionicons name="arrow-forward" size={20} color="#0f172a" />
							</Pressable>
						</View>
					)}
					{message.field.allowApplyToSimilar && message.targetActionIds.length > 1 ? (
						<Pressable onPress={() => setApplyToSimilar(value => !value)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
							<Ionicons name={applyToSimilar ? 'checkbox' : 'square-outline'} size={20} color={palette.yellow} />
							<Text style={{ color: palette.muted }}>Aplicar também aos {message.targetActionIds.length - 1} semelhantes</Text>
						</Pressable>
					) : null}
					{error ? <Text style={{ color: '#ef4444', fontSize: 12 }}>{error}</Text> : null}
				</>
			)}
		</View>
	);
};

export const AssistantDraftCard = ({
	draft,
	catalog,
	isDarkMode,
	hideValues,
	isDependencyPending,
	onEdit,
	onReview,
	onBack,
	onConfirm,
	onCancel,
}: {
	draft: AssistantDraftAction;
	catalog: AssistantResolvedCatalog;
	isDarkMode: boolean;
	hideValues: boolean;
	isDependencyPending: boolean;
	onEdit(patch: Record<string, unknown>): Promise<void>;
	onReview(): void;
	onBack(): void;
	onConfirm(): Promise<void>;
	onCancel(): void;
}) => {
	const palette = cardPalette(isDarkMode);
	const [editingKey, setEditingKey] = React.useState<string | null>(null);
	const [editValue, setEditValue] = React.useState('');
	const payloadEntries = Object.entries(draft.payload).filter(([, value]) => value !== undefined);
	const editingDefinition = editingKey ? getFieldDefinition(draft.kind, editingKey) : null;
	const editingChoices: Array<{ value: unknown; label: string; description?: string }> = editingDefinition?.choiceSource
		? (catalog[editingDefinition.choiceSource] ?? [])
			.filter(item => item.ownerScope !== 'related_read_only')
			.filter(item => !(['sourceBankRef', 'targetBankRef'].includes(editingDefinition.key)) || item.realId !== null)
			.map(item => ({ value: item.handle, label: item.label, description: item.description }))
		: editingDefinition?.kind === 'boolean'
			? [{ value: true, label: 'Sim' }, { value: false, label: 'Não' }]
			: (STATIC_CHOICES[editingKey ?? ''] ?? []);
	const statusLabel: Record<AssistantDraftAction['status'], string> = {
		draft: 'Rascunho', needs_input: 'Faltam informações', ready: 'Pronto para revisar', confirming: 'Aguardando sua confirmação',
		executing: 'Salvando', succeeded: 'Concluído', failed: 'Falhou', cancelled: 'Cancelado', stale: 'Dados alterados',
	};
	const saveEdit = async () => {
		if (!editingKey) return;
		const definition = getFieldDefinition(draft.kind, editingKey);
		const parsed = parseFieldInput(definition, editValue);
		if (parsed === null || parsed === undefined) return;
		await onEdit({ [editingKey]: parsed });
		setEditingKey(null);
		setEditValue('');
	};
	const saveChoiceEdit = async (value: unknown) => {
		if (!editingKey) return;
		await onEdit({ [editingKey]: value });
		setEditingKey(null);
		setEditValue('');
	};

	return (
		<View style={{ borderRadius: 24, borderWidth: 1, borderColor: draft.status === 'confirming' ? palette.yellow : palette.border, backgroundColor: palette.card, overflow: 'hidden' }}>
			<View style={{ padding: 16, gap: 12 }}>
				<View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
					<View style={{ width: 38, height: 38, borderRadius: 14, backgroundColor: isDarkMode ? '#422006' : '#fef9c3', alignItems: 'center', justifyContent: 'center' }}>
						<Ionicons name="sparkles" size={19} color={isDarkMode ? '#fde047' : '#ca8a04'} />
					</View>
					<View style={{ flex: 1 }}>
						<Text style={{ color: palette.text, fontWeight: '900', fontSize: 16 }}>{ASSISTANT_ACTION_LABELS[draft.kind]}</Text>
						<Text style={{ color: palette.muted, fontSize: 12 }}>{statusLabel[draft.status]}</Text>
					</View>
				</View>

				{payloadEntries.map(([key, value]) => (
					<View key={key} style={{ borderBottomWidth: 1, borderBottomColor: palette.border, paddingBottom: 9 }}>
						<Text style={{ color: palette.muted, fontSize: 11, fontWeight: '700' }}>{FIELD_LABELS[key] ?? key}</Text>
						<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
							<Text style={{ color: palette.text, flex: 1 }}>{formatPayloadValue(key, value, catalog, hideValues)}</Text>
							{['ready', 'needs_input', 'failed'].includes(draft.status) ? (
								<Pressable onPress={() => {
									setEditingKey(key);
									const isRate = key === 'cdiPercentageInBasisPoints' || key === 'annualRateInBasisPoints';
									setEditValue(
										typeof value === 'number' && (MONEY_FIELDS.has(key) || isRate)
											? String(value / 100).replace('.', ',')
											: String(value ?? ''),
									);
								}}>
									<Ionicons name="pencil" size={16} color={palette.muted} />
								</Pressable>
							) : null}
						</View>
					</View>
				))}

				{editingKey ? (
					<View style={{ gap: 8, backgroundColor: palette.input, borderRadius: 16, padding: 10 }}>
						<Text style={{ color: palette.text, fontWeight: '700' }}>Editar {FIELD_LABELS[editingKey] ?? editingKey}</Text>
						{editingChoices.length > 0 ? (
							<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
								{editingChoices.map(choice => (
									<Pressable
										key={`${editingKey}-${String(choice.value)}`}
										onPress={() => void saveChoiceEdit(choice.value)}
										style={{ borderRadius: 12, borderWidth: 1, borderColor: palette.border, paddingHorizontal: 10, paddingVertical: 8 }}
									>
										<Text style={{ color: palette.text, fontWeight: '700' }}>{choice.label}</Text>
										{choice.description ? <Text style={{ color: palette.muted, fontSize: 10 }}>{choice.description}</Text> : null}
									</Pressable>
								))}
							</View>
						) : (
							<Input style={{ minHeight: 42, borderRadius: 12, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.input }}>
								<InputField value={editValue} onChangeText={setEditValue} placeholderTextColor={palette.muted} style={{ color: palette.text, paddingHorizontal: 10 }} />
							</Input>
						)}
						<View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
							<Pressable onPress={() => setEditingKey(null)} style={{ padding: 8 }}><Text style={{ color: palette.muted }}>Cancelar</Text></Pressable>
							{editingChoices.length === 0 ? <Pressable onPress={() => void saveEdit()} style={{ borderRadius: 12, backgroundColor: palette.yellow, paddingHorizontal: 14, paddingVertical: 8 }}><Text style={{ color: '#0f172a', fontWeight: '800' }}>Salvar</Text></Pressable> : null}
						</View>
					</View>
				) : null}

				{draft.missingFields.length > 0 ? (
					<View style={{ borderRadius: 14, backgroundColor: isDarkMode ? '#1e293b' : '#f1f5f9', padding: 10 }}>
						<Text style={{ color: palette.muted }}>Ainda falta: {draft.missingFields.map(field => field.label).join(', ')}</Text>
					</View>
				) : null}
				{draft.warnings.map((warning, index) => <Text key={`${warning}-${index}`} style={{ color: '#f59e0b', fontSize: 12 }}>{warning}</Text>)}
				{draft.error ? <Text style={{ color: '#ef4444', fontSize: 12 }}>{draft.error}</Text> : null}
				{isDependencyPending ? (
					<View style={{ borderRadius: 14, backgroundColor: isDarkMode ? '#1e293b' : '#f1f5f9', padding: 10 }}>
						<Text style={{ color: palette.muted }}>Este cartão será liberado depois que a ação necessária for concluída.</Text>
					</View>
				) : null}

				{draft.status === 'confirming' ? (
					<View style={{ gap: 10 }}>
						<View style={{ borderRadius: 16, backgroundColor: isDarkMode ? '#422006' : '#fffbeb', padding: 12 }}>
							<Text style={{ color: isDarkMode ? '#fde68a' : '#92400e', fontWeight: '700' }}>Confirme somente este registro. Uma resposta “sim” no chat não salva nada.</Text>
						</View>
						<View style={{ flexDirection: 'row', gap: 8 }}>
							<Pressable onPress={onBack} style={{ flex: 1, borderRadius: 16, borderWidth: 1, borderColor: palette.border, padding: 12, alignItems: 'center' }}><Text style={{ color: palette.text, fontWeight: '700' }}>Voltar</Text></Pressable>
							<Pressable onPress={() => void onConfirm()} style={{ flex: 1.5, borderRadius: 16, backgroundColor: palette.yellow, padding: 12, alignItems: 'center' }}><Text style={{ color: '#0f172a', fontWeight: '900' }}>Confirmar agora</Text></Pressable>
						</View>
					</View>
				) : draft.status === 'ready' ? (
					<View style={{ flexDirection: 'row', gap: 8 }}>
						<Pressable onPress={onCancel} style={{ flex: 1, borderRadius: 16, borderWidth: 1, borderColor: palette.border, padding: 11, alignItems: 'center' }}><Text style={{ color: palette.muted, fontWeight: '700' }}>Cancelar</Text></Pressable>
						<Pressable disabled={isDependencyPending} onPress={onReview} style={{ flex: 1.6, borderRadius: 16, backgroundColor: palette.yellow, padding: 11, alignItems: 'center', opacity: isDependencyPending ? 0.45 : 1 }}><Text style={{ color: '#0f172a', fontWeight: '900' }}>{isDependencyPending ? 'Aguardando ação anterior' : 'Revisar e confirmar'}</Text></Pressable>
					</View>
				) : draft.status === 'failed' && draft.missingFields.length === 0 ? (
					<View style={{ flexDirection: 'row', gap: 8 }}>
						<Pressable onPress={onCancel} style={{ flex: 1, borderRadius: 16, borderWidth: 1, borderColor: palette.border, padding: 11, alignItems: 'center' }}><Text style={{ color: palette.muted, fontWeight: '700' }}>Cancelar</Text></Pressable>
						<Pressable onPress={onReview} style={{ flex: 1.6, borderRadius: 16, backgroundColor: palette.yellow, padding: 11, alignItems: 'center' }}><Text style={{ color: '#0f172a', fontWeight: '900' }}>Revisar e tentar de novo</Text></Pressable>
					</View>
				) : ['needs_input', 'failed', 'stale'].includes(draft.status) ? (
					<Pressable onPress={onCancel} style={{ alignSelf: 'flex-start', paddingVertical: 6 }}><Text style={{ color: '#ef4444', fontWeight: '700' }}>Cancelar este rascunho</Text></Pressable>
				) : null}
			</View>
		</View>
	);
};

const AssistantChart = ({ report, hideValues, isDarkMode }: { report: AssistantReport; hideValues: boolean; isDarkMode: boolean }) => {
	const { width } = useWindowDimensions();
	if (!report.chart || report.chart.points.length === 0) return null;
	if (hideValues) {
		return (
			<View style={{ height: 150, borderRadius: 18, backgroundColor: isDarkMode ? '#020617' : '#f8fafc', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
				<Ionicons name="eye-off" size={24} color={isDarkMode ? '#94a3b8' : '#64748b'} />
				<Text style={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>Gráfico oculto pelo modo de privacidade</Text>
			</View>
		);
	}
	const chartWidth = Math.max(220, Math.min(width - 90, 540));
	const data = report.chart.points.map(point => ({ value: point.value, label: point.label, color: point.color, frontColor: point.color }));
	return (
		<View style={{ minHeight: 170, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
			{report.chart.kind === 'bar' ? <BarChart data={data} width={chartWidth} height={140} barWidth={24} spacing={28} hideRules yAxisThickness={0} xAxisThickness={1} /> : null}
			{report.chart.kind === 'line' ? <LineChart data={data} width={chartWidth} height={140} color="#facc15" dataPointsColor="#eab308" hideRules yAxisThickness={0} xAxisThickness={1} /> : null}
			{report.chart.kind === 'donut' ? <PieChart data={data} donut radius={70} innerRadius={42} showText textColor={isDarkMode ? '#f8fafc' : '#0f172a'} /> : null}
		</View>
	);
};

export const AssistantReportCard = ({
	report,
	isDarkMode,
	hideValues,
	isSpeaking,
	onSpeak,
	onStop,
}: {
	report: AssistantReport;
	isDarkMode: boolean;
	hideValues: boolean;
	isSpeaking: boolean;
	onSpeak(): void;
	onStop(): void;
}) => {
	const palette = cardPalette(isDarkMode);
	return (
		<View style={{ borderRadius: 24, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card, padding: 16, gap: 14 }}>
			<View>
				<Text style={{ color: palette.text, fontWeight: '900', fontSize: 17 }}>{report.title}</Text>
				<Text style={{ color: palette.muted, fontSize: 12 }}>{report.periodLabel} · atualizado {new Date(report.updatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</Text>
				<Text style={{ color: palette.muted, fontSize: 11 }}>{report.scopeLabel}</Text>
			</View>
			<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
				{report.metrics.map(metric => (
					<View key={metric.label} style={{ minWidth: '46%', flexGrow: 1, borderRadius: 16, backgroundColor: palette.input, padding: 10 }}>
						<Text style={{ color: palette.muted, fontSize: 11 }}>{metric.label}</Text>
						<Text style={{ color: metric.tone === 'positive' ? '#22c55e' : metric.tone === 'negative' ? '#ef4444' : palette.text, fontWeight: '900' }}>
							{hideValues ? '••••' : metric.valueInCents !== undefined ? formatCents(metric.valueInCents) : metric.displayValue ?? metric.value}
						</Text>
					</View>
				))}
			</View>
			<AssistantChart report={report} hideValues={hideValues} isDarkMode={isDarkMode} />
			{report.narrative ? <Text style={{ color: palette.text }}>{hideValues ? maskFinancialValuesInText(report.narrative) : report.narrative}</Text> : null}
			<Text style={{ color: palette.text }}>{hideValues ? maskFinancialValuesInText(report.deterministicSummary) : report.deterministicSummary}</Text>
			{report.notes.map(note => <Text key={note} style={{ color: palette.muted, fontSize: 12 }}>• {note}</Text>)}
			<Pressable onPress={isSpeaking ? onStop : onSpeak} style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5 }}>
				<Ionicons name={isSpeaking ? 'stop-circle-outline' : 'volume-medium-outline'} size={16} color={palette.muted} />
				<Text style={{ color: palette.muted, fontSize: 11 }}>{isSpeaking ? 'Parar' : 'Ouvir resumo'}</Text>
			</Pressable>
		</View>
	);
};

export const AssistantTextBubble = ({
	message,
	isDarkMode,
	hideValues,
	isSpeaking,
	onSpeak,
	onStop,
	onRetry,
}: {
	message: Extract<AssistantMessage, { type: 'text' | 'success' | 'warning' | 'error' }>;
	isDarkMode: boolean;
	hideValues: boolean;
	isSpeaking: boolean;
	onSpeak(): void;
	onStop(): void;
	onRetry?: () => void;
}) => {
	const palette = cardPalette(isDarkMode);
	const isUser = message.role === 'user';
	const tone = message.type === 'error' ? '#ef4444' : message.type === 'warning' ? '#f59e0b' : message.type === 'success' ? '#22c55e' : palette.yellow;
	const text = hideValues ? maskFinancialValuesInText(message.text) : message.text;
	return (
		<View style={{ maxWidth: '88%', alignSelf: isUser ? 'flex-end' : 'flex-start', borderRadius: 22, borderBottomRightRadius: isUser ? 6 : 22, borderBottomLeftRadius: isUser ? 22 : 6, backgroundColor: isUser ? (isDarkMode ? '#854d0e' : '#fef08a') : palette.card, borderWidth: isUser ? 0 : 1, borderColor: message.type === 'text' ? palette.border : tone, padding: 13, gap: 7 }}>
			<Text style={{ color: isUser ? '#422006' : palette.text, lineHeight: 20 }}>{text}</Text>
			{!isUser ? (
				<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
					<Pressable onPress={isSpeaking ? onStop : onSpeak} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
						<Ionicons name={isSpeaking ? 'stop-circle-outline' : 'volume-medium-outline'} size={16} color={palette.muted} />
						<Text style={{ color: palette.muted, fontSize: 11 }}>{isSpeaking ? 'Parar' : 'Ouvir'}</Text>
					</Pressable>
					{onRetry ? (
						<Pressable onPress={onRetry} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
							<Ionicons name="refresh" size={15} color={tone} />
							<Text style={{ color: tone, fontSize: 11, fontWeight: '700' }}>Tentar lembrete novamente</Text>
						</Pressable>
					) : null}
				</View>
			) : null}
		</View>
	);
};
