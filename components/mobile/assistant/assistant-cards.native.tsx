import React from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BarChart, LineChart, PieChart } from 'react-native-gifted-charts';

import { Input, InputField } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { AssistantInlineField } from '@/components/uiverse/assistant/assistant-inline-field';
import { ASSISTANT_CLASS_NAMES } from '@/design-system/assistant';
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
const DATE_FIELDS = new Set(['date', 'effectiveFrom', 'installmentStartDate', 'installmentEndDate']);

const formatAssistantDate = (value: string) => {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
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
	if (DATE_FIELDS.has(key) && typeof value === 'string') return formatAssistantDate(value);
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
		<View className={ASSISTANT_CLASS_NAMES.cardAttention}>
			<View className={ASSISTANT_CLASS_NAMES.cardBody}>
			<View className={ASSISTANT_CLASS_NAMES.cardHeader}>
				<Ionicons name="help-circle" size={20} color={palette.yellow} />
				<Text className={ASSISTANT_CLASS_NAMES.cardTitle}>{message.text}</Text>
			</View>
			{message.answeredAt ? (
				<View className={ASSISTANT_CLASS_NAMES.mutedInset}>
					<Text className={ASSISTANT_CLASS_NAMES.cardMeta}>Resposta: {shouldMaskAnswer ? '••••' : message.answerLabel}</Text>
				</View>
			) : (
				<>
					{choices.length > 0 ? (
						<View className={ASSISTANT_CLASS_NAMES.choiceRow}>
							{choices.map(choice => (
								<Pressable
									key={choice.value}
									disabled={submitting || choice.disabled}
									onPress={() => void submit(choice.value, choice.label)}
									className={ASSISTANT_CLASS_NAMES.choice}
								>
									<Text className={ASSISTANT_CLASS_NAMES.choiceText}>{choice.label}</Text>
									{choice.description ? <Text className={ASSISTANT_CLASS_NAMES.cardMeta}>{choice.description}</Text> : null}
								</Pressable>
							))}
						</View>
					) : (
						<View className="flex-row items-center gap-2">
							<Input
								isDisabled={submitting}
								className="min-h-control flex-1 rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950"
							>
								<InputField
									value={input}
									onChangeText={setInput}
									placeholder={message.field.kind === 'money' ? 'Ex.: 50,00' : message.field.kind === 'date' ? 'Ex.: 18/07/2026' : 'Digite aqui'}
									placeholderTextColor={palette.muted}
									keyboardType={message.field.kind === 'money' || message.field.kind === 'number' ? 'decimal-pad' : 'default'}
									className="px-3 text-slate-900 dark:text-slate-100"
								/>
							</Input>
							<Pressable
								accessibilityLabel="Enviar resposta"
								disabled={submitting}
								onPress={() => void submit(input)}
								className={ASSISTANT_CLASS_NAMES.sendButton}
							>
								<Ionicons name="arrow-forward" size={20} color="#0f172a" />
							</Pressable>
						</View>
					)}
					{message.field.allowApplyToSimilar && message.targetActionIds.length > 1 ? (
						<Pressable onPress={() => setApplyToSimilar(value => !value)} className="min-h-touch flex-row items-center gap-2">
							<Ionicons name={applyToSimilar ? 'checkbox' : 'square-outline'} size={20} color={palette.yellow} />
							<Text className={ASSISTANT_CLASS_NAMES.cardMeta}>Aplicar também aos {message.targetActionIds.length - 1} semelhantes</Text>
						</Pressable>
					) : null}
					{error ? <Text className="text-xs text-error-600 dark:text-error-400">{error}</Text> : null}
				</>
			)}
			</View>
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
	const [editingKey, setEditingKey] = React.useState<string | null>(null);
	const [editValue, setEditValue] = React.useState('');
	const [editError, setEditError] = React.useState<string | null>(null);
	const [isSavingEdit, setIsSavingEdit] = React.useState(false);
	const payloadEntries = Object.entries(draft.payload).filter(([, value]) => value !== undefined);
	const statusLabel: Record<AssistantDraftAction['status'], string> = {
		draft: 'Rascunho', needs_input: 'Faltam informações', ready: 'Pronto para revisar', confirming: 'Aguardando sua confirmação',
		executing: 'Salvando', succeeded: 'Concluído', failed: 'Falhou', cancelled: 'Cancelado', stale: 'Dados alterados',
	};
	const saveEdit = async () => {
		if (!editingKey) return;
		const definition = getFieldDefinition(draft.kind, editingKey);
		const parsed = parseFieldInput(definition, editValue);
		if (parsed === null || parsed === undefined) {
			setEditError('Confira o formato deste campo.');
			return;
		}
		setIsSavingEdit(true);
		setEditError(null);
		try {
			await onEdit({ [editingKey]: parsed });
			setEditingKey(null);
			setEditValue('');
		} catch {
			setEditError('Não foi possível atualizar este campo. Confira e tente novamente.');
		} finally {
			setIsSavingEdit(false);
		}
	};
	const saveChoiceEdit = async (value: unknown) => {
		if (!editingKey) return;
		setIsSavingEdit(true);
		setEditError(null);
		try {
			await onEdit({ [editingKey]: value });
			setEditingKey(null);
			setEditValue('');
		} catch {
			setEditError('Não foi possível atualizar este campo. Confira e tente novamente.');
		} finally {
			setIsSavingEdit(false);
		}
	};
	const startEdit = (key: string, value: unknown) => {
		const definition = getFieldDefinition(draft.kind, key);
		const isRate = key === 'cdiPercentageInBasisPoints' || key === 'annualRateInBasisPoints';
		const isMaskedNumber = hideValues && (MONEY_FIELDS.has(key) || isRate);
		setEditingKey(key);
		setEditError(null);
		setEditValue(
			isMaskedNumber
				? ''
				: definition.kind === 'date' && typeof value === 'string'
					? formatAssistantDate(value)
					: typeof value === 'number' && (MONEY_FIELDS.has(key) || isRate)
						? String(value / 100).replace('.', ',')
						: String(value ?? ''),
		);
	};
	const cancelEdit = () => {
		setEditingKey(null);
		setEditValue('');
		setEditError(null);
	};

	return (
		<View className={draft.status === 'confirming' ? ASSISTANT_CLASS_NAMES.cardAttention : ASSISTANT_CLASS_NAMES.card}>
			<View className={ASSISTANT_CLASS_NAMES.cardBody}>
				<View className={ASSISTANT_CLASS_NAMES.cardHeader}>
					<View className={ASSISTANT_CLASS_NAMES.cardMark}>
						<Ionicons name="sparkles" size={19} color={isDarkMode ? '#fde047' : '#ca8a04'} />
					</View>
					<View className="min-w-0 flex-1">
						<Text className={ASSISTANT_CLASS_NAMES.cardTitle}>{ASSISTANT_ACTION_LABELS[draft.kind]}</Text>
						<Text className={ASSISTANT_CLASS_NAMES.cardMeta}>{statusLabel[draft.status]}</Text>
					</View>
				</View>

				{payloadEntries.map(([key, value]) => {
					const definition = getFieldDefinition(draft.kind, key);
					const isEditing = editingKey === key;
					const choices: Array<{ value: unknown; label: string; description?: string }> = definition.choiceSource
						? (catalog[definition.choiceSource] ?? [])
							.filter(item => item.ownerScope !== 'related_read_only')
							.filter(item => !(['sourceBankRef', 'targetBankRef'].includes(definition.key)) || item.realId !== null)
							.map(item => ({ value: item.handle, label: item.label, description: item.description }))
						: definition.kind === 'boolean'
							? [{ value: true, label: 'Sim' }, { value: false, label: 'Não' }]
							: STATIC_CHOICES[key] ?? [];
					return (
						<AssistantInlineField
							key={key}
							definition={{ ...definition, key }}
							valueLabel={formatPayloadValue(key, value, catalog, hideValues)}
							choices={choices}
							canEdit={['ready', 'needs_input', 'failed'].includes(draft.status) && (!editingKey || isEditing)}
							isEditing={isEditing}
							isSaving={isSavingEdit}
							editValue={editValue}
							error={isEditing ? editError : null}
							onStartEdit={() => startEdit(key, value)}
							onChangeEditValue={setEditValue}
							onSave={() => void saveEdit()}
							onSelectChoice={choice => void saveChoiceEdit(choice)}
							onCancel={cancelEdit}
						/>
					);
				})}

				{draft.missingFields.length > 0 ? (
					<View className={ASSISTANT_CLASS_NAMES.mutedInset}>
						<Text className={ASSISTANT_CLASS_NAMES.cardMeta}>Ainda falta: {draft.missingFields.map(field => field.label).join(', ')}</Text>
					</View>
				) : null}
				{draft.warnings.map((warning, index) => <Text key={`${warning}-${index}`} className="text-xs text-amber-700 dark:text-amber-300">{warning}</Text>)}
				{draft.error ? <Text className="text-xs text-error-600 dark:text-error-400">{draft.error}</Text> : null}
				{isDependencyPending ? (
					<View className={ASSISTANT_CLASS_NAMES.mutedInset}>
						<Text className={ASSISTANT_CLASS_NAMES.cardMeta}>Este cartão será liberado depois que a ação necessária for concluída.</Text>
					</View>
				) : null}

				{draft.status === 'confirming' ? (
					<View className="gap-2.5">
						<View className={ASSISTANT_CLASS_NAMES.confirmationInset}>
							<Text className="font-bold text-amber-900 dark:text-amber-100">Confirme somente este registro. Uma resposta “sim” no chat não salva nada.</Text>
						</View>
						<View className={ASSISTANT_CLASS_NAMES.cardActions}>
							<Pressable onPress={onBack} className={ASSISTANT_CLASS_NAMES.secondaryAction}><Text className={ASSISTANT_CLASS_NAMES.choiceText}>Voltar</Text></Pressable>
							<Pressable onPress={() => void onConfirm()} className={ASSISTANT_CLASS_NAMES.primaryAction}><Text className="font-extrabold text-lumus-on-accent">Confirmar agora</Text></Pressable>
						</View>
					</View>
				) : draft.status === 'ready' ? (
					<View className={ASSISTANT_CLASS_NAMES.cardActions}>
						<Pressable onPress={onCancel} className={ASSISTANT_CLASS_NAMES.secondaryAction}><Text className={ASSISTANT_CLASS_NAMES.cardMeta}>Cancelar</Text></Pressable>
						<Pressable disabled={isDependencyPending} onPress={onReview} className={ASSISTANT_CLASS_NAMES.primaryAction}><Text className="text-center font-extrabold text-lumus-on-accent">{isDependencyPending ? 'Aguardando ação anterior' : 'Revisar e confirmar'}</Text></Pressable>
					</View>
				) : draft.status === 'failed' && draft.missingFields.length === 0 ? (
					<View className={ASSISTANT_CLASS_NAMES.cardActions}>
						<Pressable onPress={onCancel} className={ASSISTANT_CLASS_NAMES.secondaryAction}><Text className={ASSISTANT_CLASS_NAMES.cardMeta}>Cancelar</Text></Pressable>
						<Pressable onPress={onReview} className={ASSISTANT_CLASS_NAMES.primaryAction}><Text className="text-center font-extrabold text-lumus-on-accent">Revisar e tentar de novo</Text></Pressable>
					</View>
				) : ['needs_input', 'failed', 'stale'].includes(draft.status) ? (
					<Pressable onPress={onCancel} className="min-h-touch self-start justify-center rounded-xl"><Text className="font-bold text-error-600 dark:text-error-400">Cancelar este rascunho</Text></Pressable>
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
		<View className={`${ASSISTANT_CLASS_NAMES.card} ${ASSISTANT_CLASS_NAMES.cardBody}`}>
			<View>
				<Text className={ASSISTANT_CLASS_NAMES.cardTitle}>{report.title}</Text>
				<Text className={ASSISTANT_CLASS_NAMES.cardMeta}>{report.periodLabel} · atualizado {new Date(report.updatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</Text>
				<Text className={ASSISTANT_CLASS_NAMES.cardMeta}>{report.scopeLabel}</Text>
			</View>
			<View className={ASSISTANT_CLASS_NAMES.metricGrid}>
				{report.metrics.map(metric => (
					<View key={metric.label} className={ASSISTANT_CLASS_NAMES.metric}>
						<Text className={ASSISTANT_CLASS_NAMES.cardMeta}>{metric.label}</Text>
						<Text style={{ color: metric.tone === 'positive' ? '#22c55e' : metric.tone === 'negative' ? '#ef4444' : palette.text, fontWeight: '900' }}>
							{hideValues ? '••••' : metric.valueInCents !== undefined ? formatCents(metric.valueInCents) : metric.displayValue ?? metric.value}
						</Text>
					</View>
				))}
			</View>
			<AssistantChart report={report} hideValues={hideValues} isDarkMode={isDarkMode} />
			{report.narrative ? <Text className="leading-6 text-slate-800 dark:text-slate-200">{hideValues ? maskFinancialValuesInText(report.narrative) : report.narrative}</Text> : null}
			<Text className="leading-6 text-slate-800 dark:text-slate-200">{hideValues ? maskFinancialValuesInText(report.deterministicSummary) : report.deterministicSummary}</Text>
			{report.notes.map(note => <Text key={note} className={ASSISTANT_CLASS_NAMES.cardMeta}>• {note}</Text>)}
			<Pressable accessibilityLabel={isSpeaking ? 'Parar leitura do resumo' : 'Ouvir resumo'} onPress={isSpeaking ? onStop : onSpeak} className={ASSISTANT_CLASS_NAMES.bubbleAction}>
				<Ionicons name={isSpeaking ? 'stop-circle-outline' : 'volume-medium-outline'} size={16} color={palette.muted} />
				<Text className={ASSISTANT_CLASS_NAMES.cardMeta}>{isSpeaking ? 'Parar' : 'Ouvir resumo'}</Text>
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
		<View className={isUser ? ASSISTANT_CLASS_NAMES.userBubble : ASSISTANT_CLASS_NAMES.assistantBubble}>
			<Text className={isUser ? ASSISTANT_CLASS_NAMES.userBubbleText : 'leading-5 text-slate-800 dark:text-slate-200'}>{text}</Text>
			{!isUser ? (
				<View className={ASSISTANT_CLASS_NAMES.bubbleActions}>
					<Pressable accessibilityLabel={isSpeaking ? 'Parar leitura' : 'Ouvir resposta'} onPress={isSpeaking ? onStop : onSpeak} className={ASSISTANT_CLASS_NAMES.bubbleAction}>
						<Ionicons name={isSpeaking ? 'stop-circle-outline' : 'volume-medium-outline'} size={16} color={palette.muted} />
						<Text className={ASSISTANT_CLASS_NAMES.cardMeta}>{isSpeaking ? 'Parar' : 'Ouvir'}</Text>
					</Pressable>
					{onRetry ? (
						<Pressable onPress={onRetry} className={ASSISTANT_CLASS_NAMES.bubbleAction}>
							<Ionicons name="refresh" size={15} color={tone} />
							<Text className="text-xs font-bold text-amber-700 dark:text-amber-300">Tentar lembrete novamente</Text>
						</Pressable>
					) : null}
				</View>
			) : null}
		</View>
	);
};
