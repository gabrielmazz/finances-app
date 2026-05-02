import React from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, View, TouchableOpacity, StatusBar, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

// Componentes de UI
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { Image } from '@/components/ui/image';
import { HStack } from '@/components/ui/hstack';
import { VStack } from '@/components/ui/vstack';
import { Button, ButtonSpinner, ButtonText } from '@/components/ui/button';
import { Input, InputField } from '@/components/ui/input';
import { Textarea, TextareaInput } from '@/components/ui/textarea';
import { Popover, PopoverBackdrop, PopoverBody, PopoverContent } from '@/components/ui/popover';
import {
	Select,
	SelectBackdrop,
	SelectContent,
	SelectDragIndicator,
	SelectDragIndicatorWrapper,
	SelectIcon,
	SelectInput,
	SelectItem,
	SelectPortal,
	SelectTrigger,
} from '@/components/ui/select';
import {
	Modal,
	ModalBackdrop,
	ModalBody,
	ModalCloseButton,
	ModalContent,
	ModalFooter,
	ModalHeader,
	ModalTitle,
} from '@/components/ui/modal';
import {
	ArrowDownIcon,
	ArrowUpIcon,
	CalendarDaysIcon,
	ChevronDownIcon,
	ChevronUpIcon,
	ChevronsUpDownIcon,
	DownloadIcon,
	EditIcon,
	Icon,
	RepeatIcon,
	TrashIcon,
} from '@/components/ui/icon';

import Navigator from '@/components/uiverse/navigator';
import { showNotifierAlert } from '@/components/uiverse/notifier-alert';
import { auth } from '@/FirebaseConfig';
import { useValueVisibility, HIDDEN_VALUE_PLACEHOLDER } from '@/contexts/ValueVisibilityContext';
import LoginWallpaper from '@/assets/Background/wallpaper01.png';

// Funções para buscar gastos/ganhos obrigatórios no firebase
import { getMandatoryExpensesWithRelationsFirebase } from '@/functions/MandatoryExpenseFirebase';
import { getMandatoryGainsWithRelationsFirebase } from '@/functions/MandatoryGainFirebase';
import { isCycleKeyCurrent } from '@/utils/mandatoryExpenses';
import {
	getBankMovementsByPeriodFirebase,
	getBankDataFirebase,
	getCashMovementsByPeriodFirebase,
	deleteCashRescueFirebase,
	getBanksWithUsersByPersonFirebase,
} from '@/functions/BankFirebase';
import { getMonthlyBalanceFirebaseRelatedToUser } from '@/functions/MonthlyBalanceFirebase';
import { deleteExpenseFirebase } from '@/functions/ExpenseFirebase';
import { deleteGainFirebase } from '@/functions/GainFirebase';
import { getTagDataFirebase } from '@/functions/TagFirebase';
import {
	deleteFinanceInvestmentFirebase,
	getFinanceInvestmentSyncEventsByPeriodFirebase,
	getFinanceInvestmentsByPeriodFirebase,
	revertFinanceInvestmentDepositFirebase,
	revertFinanceInvestmentRedemptionFirebase,
	revertFinanceInvestmentSyncFirebase,
	updateFinanceInvestmentFirebase,
} from '@/functions/FinancesFirebase';
import DatePickerField from '@/components/uiverse/date-picker';
import {
	BankCardSurface,
	CASH_CARD_COLOR,
	buildBankCardPalette,
} from '@/components/uiverse/bank-card-surface';
import { shouldIncludeMovementInGainExpenseTotals } from '@/utils/monthlyBalance';
import { navigateToHomeDashboard } from '@/utils/navigation';
import { useScreenStyles } from '@/hooks/useScreenStyle';
import { TagIcon } from '@/hooks/useTagIcons';
import type { TagIconSelection } from '@/hooks/useTagIcons';
import { redemptionTermLabels, RedemptionTerm } from '@/utils/finance';
import { buildPdfFileName, copyPdfToNamedCacheFile } from '@/utils/pdfFileName';
import { Info, Tags as TagsIcon } from 'lucide-react-native';

// Importação do SVG de ilustração
import BankMovementsIllustration from '../assets/UnDraw/bankMovementsScreen.svg';


type FirestoreLikeTimestamp = {
	toDate?: () => Date;
};

type MovementRecord = {
	id: string;
	name: string;
	valueInCents: number;
	type: 'expense' | 'gain' | 'sync';
	date: Date | null;
	tagId?: string | null;
	bankId?: string | null;
	personId?: string | null;
	explanation?: string | null;
	paymentFormats?: string[] | null;
	moneyFormat?: boolean | null;
	// true se esta movimentação for a ligada a um Gasto/Ganho Obrigatório do ciclo atual
	isFromMandatory?: boolean;
	isCashRescue?: boolean;
	cashRescueSourceBankName?: string | null;
	isBankTransfer?: boolean;
	bankTransferPairId?: string | null;
	bankTransferDirection?: 'incoming' | 'outgoing' | null;
	bankTransferSourceBankId?: string | null;
	bankTransferTargetBankId?: string | null;
	bankTransferSourceBankNameSnapshot?: string | null;
	bankTransferTargetBankNameSnapshot?: string | null;
	bankTransferExpenseId?: string | null;
	bankTransferGainId?: string | null;
	isFinanceInvestment?: boolean;
	investmentId?: string | null;
	investmentBankNameSnapshot?: string | null;
	isInvestmentRedemption?: boolean;
	isInvestmentDeposit?: boolean;
	investmentNameSnapshot?: string | null;
	isFinanceInvestmentSync?: boolean;
	investmentSyncPreviousValueInCents?: number | null;
	investmentSyncReason?: 'manual' | 'deposit' | 'withdrawal' | null;
	investmentCdiPercentage?: number | null;
	investmentRedemptionTerm?: RedemptionTerm | null;
};

type PendingMovementAction =
	| { type: 'edit-standard-movement'; movement: MovementRecord }
	| { type: 'delete-standard-movement'; movement: MovementRecord }
	| { type: 'delete-finance-investment'; movement: MovementRecord }
	| { type: 'revert-cash-rescue'; movement: MovementRecord }
	| { type: 'revert-investment-deposit'; movement: MovementRecord }
	| { type: 'revert-investment-redemption'; movement: MovementRecord }
	| { type: 'revert-investment-sync'; movement: MovementRecord };

type MovementFilter = 'all' | 'expense' | 'gain';
type TimelineMovementToneKey =
	| 'gain'
	| 'expense'
	| 'mandatoryGain'
	| 'mandatoryExpense'
	| 'bankTransfer'
	| 'investmentRedemption'
	| 'investmentDeposit'
	| 'cashRescue'
	| 'investmentSync';

type TimelineMovementTone = {
	accentColor: string;
	amountColor: string;
	lineColor: string;
	iconGradient: [string, string];
	cardGradient: [string, string];
};

type MovementTagMetadata = {
	name: string | null;
	icon: TagIconSelection | null;
};

type AvailableTagFilterOption = {
	id: string;
	label: string;
	icon: TagIconSelection | null;
	movementCount: number;
};

type BankOption = {
	id: string;
	name: string;
};

const movementFilterOptions: Array<{
	value: MovementFilter;
	label: string;
	icon: typeof ChevronsUpDownIcon;
}> = [
	{ value: 'gain', label: 'Ganhos', icon: ArrowUpIcon },
	{ value: 'expense', label: 'Gastos', icon: ArrowDownIcon },
	{ value: 'all', label: 'Todos', icon: ChevronsUpDownIcon },
];

const redemptionOptions: { value: RedemptionTerm; label: string }[] = [
	{ value: 'anytime', label: redemptionTermLabels.anytime },
	{ value: '1m', label: redemptionTermLabels['1m'] },
	{ value: '3m', label: redemptionTermLabels['3m'] },
	{ value: '6m', label: redemptionTermLabels['6m'] },
	{ value: '1y', label: redemptionTermLabels['1y'] },
	{ value: '2y', label: redemptionTermLabels['2y'] },
	{ value: '3y', label: redemptionTermLabels['3y'] },
];

const formatCurrencyBRLBase = (valueInCents: number) =>
	new Intl.NumberFormat('pt-BR', {
		style: 'currency',
		currency: 'BRL',
		minimumFractionDigits: 2,
	}).format((valueInCents ?? 0) / 100);

const formatMovementDate = (value: Date | null) => {
	if (!value) {
		return 'Data indisponível';
	}

	return new Intl.DateTimeFormat('pt-BR', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	}).format(value);
};

const extractDigits = (value: string) => value.replace(/\D/g, '');

const formatCurrencyInputValue = (value: string) => {
	const digits = extractDigits(value);
	if (!digits) {
		return { display: '', cents: null as number | null };
	}

	const cents = Number(digits);
	return {
		display: formatCurrencyBRLBase(cents),
		cents,
	};
};

const parseCurrencyInputToCents = (value: string) => {
	const digits = extractDigits(value);
	if (!digits) {
		return null;
	}

	return Number(digits);
};

const sanitizeNumberInput = (value: string) => value.replace(/[^\d.,]/g, '');

const parseStringToNumber = (value: string) => {
	if (!value.trim()) {
		return NaN;
	}

	const normalized = value.replace(/\./g, '').replace(',', '.');
	const parsed = Number(normalized);
	return Number.isFinite(parsed) ? parsed : NaN;
};

const formatDateToBR = (date: Date) => {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${day}/${month}/${year}`;
};

const parseDateFromBR = (value: string) => {
	const [day, month, year] = value.split('/');
	if (!day || !month || !year) {
		return null;
	}

	const parsedDay = Number(day);
	const parsedMonth = Number(month);
	const parsedYear = Number(year);

	if (
		Number.isNaN(parsedDay) ||
		Number.isNaN(parsedMonth) ||
		Number.isNaN(parsedYear) ||
		parsedDay <= 0 ||
		parsedMonth <= 0 ||
		parsedMonth > 12 ||
		parsedYear < 1900
	) {
		return null;
	}

	const dateInstance = new Date(parsedYear, parsedMonth - 1, parsedDay);

	if (
		dateInstance.getDate() !== parsedDay ||
		dateInstance.getMonth() + 1 !== parsedMonth ||
		dateInstance.getFullYear() !== parsedYear
	) {
		return null;
	}

	return dateInstance;
};

const normalizeDate = (value: unknown): Date | null => {
	if (!value) {
		return null;
	}

	if (value instanceof Date) {
		return value;
	}

	if (typeof value === 'object' && value !== null) {
		const timestamp = value as FirestoreLikeTimestamp;
		if (typeof timestamp.toDate === 'function') {
			return timestamp.toDate() ?? null;
		}
	}

	if (typeof value === 'string' || typeof value === 'number') {
		const parsed = new Date(value);
		if (!Number.isNaN(parsed.getTime())) {
			return parsed;
		}
	}

	return null;
};

const normalizeTransferDirection = (value: unknown): 'incoming' | 'outgoing' | null => {
	if (value === 'incoming' || value === 'outgoing') {
		return value;
	}
	return null;
};

const getCurrentMonthBounds = () => {
	const now = new Date();
	const start = new Date(now.getFullYear(), now.getMonth(), 1);
	const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
	return {
		start,
		end,
	};
};

const computeMovementTotals = (movementList: MovementRecord[]) => {
	return movementList.reduce(
		(acc, movement) => {
			if (!shouldIncludeMovementInGainExpenseTotals(movement)) {
				return acc;
			}

			if (movement.type === 'gain') {
				acc.totalGains += movement.valueInCents;
			} else {
				acc.totalExpenses += movement.valueInCents;
			}

			return acc;
		},
		{ totalExpenses: 0, totalGains: 0 },
	);
};

type PeriodSummaryPdfMetric = {
	label: string;
	value: string;
	helper?: string;
	tone?: 'gain' | 'expense' | 'neutral';
};

type PeriodSummaryPdfMovement = {
	id: string;
	name: string;
	typeLabel: string;
	dateLabel: string;
	tagLabel: string;
	sourceLabel: string;
	description: string;
	amountLabel: string;
	amountTone: 'gain' | 'expense' | 'neutral';
};

type PeriodSummaryPdfParams = {
	accountKindLabel: string;
	accountName: string;
	periodLabel: string;
	generatedAtLabel: string;
	filterLabel: string;
	filterDescription: string;
	summaryPrimaryBalanceLabel: string;
	summaryPrimaryBalanceValue: string;
	summaryPrimaryBalanceHelper: string;
	generalMetrics: PeriodSummaryPdfMetric[];
	filteredMetrics: PeriodSummaryPdfMetric[];
	movements: PeriodSummaryPdfMovement[];
	cardBaseColor: string;
	cardGlowColor: string;
	cardHighlightColor: string;
	privacyNotice: string | null;
};

const escapeHtml = (value: string | number | null | undefined) =>
	String(value ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');

const buildPeriodSummaryPdfHtml = ({
	accountKindLabel,
	accountName,
	periodLabel,
	generatedAtLabel,
	filterLabel,
	filterDescription,
	summaryPrimaryBalanceLabel,
	summaryPrimaryBalanceValue,
	summaryPrimaryBalanceHelper,
	generalMetrics,
	filteredMetrics,
	movements,
	cardBaseColor,
	cardGlowColor,
	cardHighlightColor,
	privacyNotice,
}: PeriodSummaryPdfParams) => {
	const renderMetricCard = (metric: PeriodSummaryPdfMetric) => `
		<div class="metric-card ${metric.tone ?? 'neutral'}">
			<div class="metric-label">${escapeHtml(metric.label)}</div>
			<div class="metric-value">${escapeHtml(metric.value)}</div>
			${metric.helper ? `<div class="metric-helper">${escapeHtml(metric.helper)}</div>` : ''}
		</div>
	`;

	const renderMovementRow = (movement: PeriodSummaryPdfMovement, index: number) => `
		<tr>
			<td class="index-cell">${String(index + 1).padStart(2, '0')}</td>
			<td>
				<div class="movement-title">${escapeHtml(movement.name)}</div>
				<div class="movement-description">${escapeHtml(movement.description)}</div>
			</td>
			<td>
				<div class="table-main">${escapeHtml(movement.typeLabel)}</div>
				<div class="table-muted">${escapeHtml(movement.tagLabel)}</div>
			</td>
			<td>
				<div class="table-main">${escapeHtml(movement.dateLabel)}</div>
				<div class="table-muted">${escapeHtml(movement.sourceLabel)}</div>
			</td>
			<td class="amount-cell ${movement.amountTone}">${escapeHtml(movement.amountLabel)}</td>
		</tr>
	`;

	return `
		<!doctype html>
		<html lang="pt-BR">
		<head>
			<meta charset="utf-8" />
			<meta name="viewport" content="width=device-width, initial-scale=1" />
			<style>
				@page {
					size: A4;
					margin: 24px;
				}

				* {
					box-sizing: border-box;
				}

				body {
					margin: 0;
					background: #f8fafc;
					color: #0f172a;
					font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
					font-size: 12px;
					line-height: 1.45;
				}

				.report {
					background: #ffffff;
					border: 1px solid #e2e8f0;
					border-radius: 24px;
					overflow: hidden;
				}

				.hero {
					position: relative;
					padding: 28px 30px 30px;
					color: #ffffff;
					background:
						radial-gradient(circle at 85% 8%, ${cardHighlightColor} 0, transparent 34%),
						radial-gradient(circle at 18% 0%, ${cardGlowColor} 0, transparent 28%),
						linear-gradient(135deg, ${cardBaseColor}, #0f172a);
				}

				.hero-grid {
					display: grid;
					grid-template-columns: 1.4fr 0.8fr;
					gap: 22px;
					align-items: end;
				}

				.eyebrow {
					margin: 0 0 8px;
					color: rgba(255,255,255,0.74);
					font-size: 10px;
					font-weight: 800;
					text-transform: uppercase;
				}

				h1 {
					margin: 0;
					font-size: 28px;
					line-height: 1.08;
				}

				.hero-detail {
					margin-top: 10px;
					color: rgba(255,255,255,0.78);
					font-size: 12px;
				}

				.hero-panel {
					border: 1px solid rgba(255,255,255,0.22);
					border-radius: 18px;
					background: rgba(255,255,255,0.12);
					padding: 16px;
				}

				.hero-panel .label {
					color: rgba(255,255,255,0.74);
					font-size: 10px;
					font-weight: 800;
					text-transform: uppercase;
				}

				.hero-panel .value {
					margin-top: 5px;
					font-size: 22px;
					font-weight: 800;
				}

				.hero-panel .helper {
					margin-top: 6px;
					color: rgba(255,255,255,0.78);
					font-size: 11px;
				}

				.content {
					padding: 24px 30px 30px;
				}

				.notice {
					margin-bottom: 16px;
					border: 1px solid #fde68a;
					border-radius: 14px;
					background: #fffbeb;
					color: #92400e;
					padding: 11px 13px;
					font-size: 11px;
					font-weight: 700;
				}

				.section {
					margin-top: 22px;
				}

				.section:first-child {
					margin-top: 0;
				}

				.section-header {
					display: flex;
					justify-content: space-between;
					gap: 16px;
					align-items: flex-end;
					margin-bottom: 11px;
				}

				h2 {
					margin: 0;
					font-size: 15px;
					letter-spacing: 0;
				}

				.section-caption {
					margin: 3px 0 0;
					color: #64748b;
					font-size: 11px;
				}

				.badge {
					display: inline-block;
					border: 1px solid #e2e8f0;
					border-radius: 999px;
					background: #f8fafc;
					color: #334155;
					padding: 7px 10px;
					font-size: 10px;
					font-weight: 800;
				}

				.metric-grid {
					display: grid;
					grid-template-columns: repeat(3, 1fr);
					gap: 10px;
				}

				.metric-card {
					min-height: 82px;
					border: 1px solid #e2e8f0;
					border-radius: 16px;
					background: #f8fafc;
					padding: 13px;
				}

				.metric-card.gain {
					background: #ecfdf5;
					border-color: #bbf7d0;
				}

				.metric-card.expense {
					background: #fef2f2;
					border-color: #fecaca;
				}

				.metric-label {
					color: #64748b;
					font-size: 10px;
					font-weight: 800;
					text-transform: uppercase;
				}

				.metric-value {
					margin-top: 7px;
					color: #0f172a;
					font-size: 17px;
					font-weight: 850;
				}

				.metric-card.gain .metric-value,
				.amount-cell.gain {
					color: #047857;
				}

				.metric-card.expense .metric-value,
				.amount-cell.expense {
					color: #b91c1c;
				}

				.metric-helper {
					margin-top: 4px;
					color: #64748b;
					font-size: 10px;
				}

				table {
					width: 100%;
					border-collapse: separate;
					border-spacing: 0;
					border: 1px solid #e2e8f0;
					border-radius: 16px;
					overflow: hidden;
				}

				thead th {
					background: #f1f5f9;
					color: #475569;
					font-size: 10px;
					font-weight: 850;
					padding: 10px 11px;
					text-align: left;
					text-transform: uppercase;
				}

				tbody td {
					border-top: 1px solid #e2e8f0;
					padding: 12px 11px;
					vertical-align: top;
				}

				tr {
					page-break-inside: avoid;
				}

				.index-cell {
					width: 42px;
					color: #94a3b8;
					font-weight: 800;
				}

				.movement-title {
					font-size: 12px;
					font-weight: 850;
					color: #0f172a;
				}

				.movement-description,
				.table-muted {
					margin-top: 3px;
					color: #64748b;
					font-size: 10px;
				}

				.table-main {
					font-weight: 750;
					color: #0f172a;
				}

				.amount-cell {
					width: 108px;
					text-align: right;
					white-space: nowrap;
					font-size: 12px;
					font-weight: 850;
					color: #0f172a;
				}

				.empty-state {
					border: 1px dashed #cbd5e1;
					border-radius: 16px;
					background: #f8fafc;
					color: #64748b;
					padding: 18px;
					text-align: center;
				}

				.footer {
					margin-top: 26px;
					border-top: 1px solid #e2e8f0;
					padding-top: 13px;
					color: #94a3b8;
					font-size: 10px;
				}
			</style>
		</head>
		<body>
			<main class="report">
				<section class="hero">
					<div class="hero-grid">
						<div>
							<p class="eyebrow">Lumus Finanças · ${escapeHtml(accountKindLabel)}</p>
							<h1>${escapeHtml(accountName)}</h1>
							<div class="hero-detail">
								${escapeHtml(periodLabel)} · Gerado em ${escapeHtml(generatedAtLabel)}
							</div>
						</div>

						<div class="hero-panel">
							<div class="label">${escapeHtml(summaryPrimaryBalanceLabel)}</div>
							<div class="value">${escapeHtml(summaryPrimaryBalanceValue)}</div>
							<div class="helper">${escapeHtml(summaryPrimaryBalanceHelper)}</div>
						</div>
					</div>
				</section>

				<section class="content">
					${privacyNotice ? `<div class="notice">${escapeHtml(privacyNotice)}</div>` : ''}

					<section class="section">
						<div class="section-header">
							<div>
								<h2>Resumo geral do período</h2>
								<p class="section-caption">Totais do banco ou dinheiro para todo o período selecionado.</p>
							</div>
							<span class="badge">${escapeHtml(periodLabel)}</span>
						</div>
						<div class="metric-grid">
							${generalMetrics.map(renderMetricCard).join('')}
						</div>
					</section>

					<section class="section">
						<div class="section-header">
							<div>
								<h2>Resumo filtrado</h2>
								<p class="section-caption">${escapeHtml(filterDescription)}</p>
							</div>
							<span class="badge">${escapeHtml(filterLabel)}</span>
						</div>
						<div class="metric-grid">
							${filteredMetrics.map(renderMetricCard).join('')}
						</div>
					</section>

					<section class="section">
						<div class="section-header">
							<div>
								<h2>Movimentações incluídas</h2>
								<p class="section-caption">Lista gerada a partir do mesmo filtro aplicado na tela.</p>
							</div>
							<span class="badge">${movements.length} item(ns)</span>
						</div>

						${movements.length > 0
							? `
								<table>
									<thead>
										<tr>
											<th>#</th>
											<th>Movimentação</th>
											<th>Tipo / Tag</th>
											<th>Data / Origem</th>
											<th>Valor</th>
										</tr>
									</thead>
									<tbody>
										${movements.map(renderMovementRow).join('')}
									</tbody>
								</table>
							`
							: '<div class="empty-state">Nenhuma movimentação foi registrada para o período e filtros informados.</div>'}
					</section>

					<div class="footer">
						Relatório gerado localmente pelo app. Movimentos internos seguem as regras de totalização documentadas no vault do Lumus Finanças.
					</div>
				</section>
			</main>
		</body>
		</html>
	`;
};

const MANDATORY_SETTLED_TONE: TimelineMovementTone = {
	accentColor: '#10B981',
	amountColor: '#10B981',
	lineColor: 'rgba(16, 185, 129, 0.28)',
	iconGradient: ['#047857', '#34D399'],
	cardGradient: ['#065F46', '#10B981'],
};

const TIMELINE_MOVEMENT_TONES: Record<TimelineMovementToneKey, TimelineMovementTone> = {
	gain: {
		accentColor: '#10B981',
		amountColor: '#10B981',
		lineColor: 'rgba(16, 185, 129, 0.28)',
		iconGradient: ['#047857', '#34D399'],
		cardGradient: ['#065F46', '#10B981'],
	},
	expense: {
		accentColor: '#EF4444',
		amountColor: '#EF4444',
		lineColor: 'rgba(239, 68, 68, 0.28)',
		iconGradient: ['#B91C1C', '#EF4444'],
		cardGradient: ['#7F1D1D', '#EF4444'],
	},
	mandatoryExpense: MANDATORY_SETTLED_TONE,
	mandatoryGain: MANDATORY_SETTLED_TONE,
	bankTransfer: {
		accentColor: '#F59E0B',
		amountColor: '#F59E0B',
		lineColor: 'rgba(245, 158, 11, 0.3)',
		iconGradient: ['#92400E', '#F59E0B'],
		cardGradient: ['#78350F', '#F59E0B'],
	},
	investmentRedemption: {
		accentColor: '#38BDF8',
		amountColor: '#38BDF8',
		lineColor: 'rgba(56, 189, 248, 0.3)',
		iconGradient: ['#0C4A6E', '#38BDF8'],
		cardGradient: ['#075985', '#67E8F9'],
	},
	investmentDeposit: {
		accentColor: '#7C3AED',
		amountColor: '#7C3AED',
		lineColor: 'rgba(124, 58, 237, 0.3)',
		iconGradient: ['#312E81', '#7C3AED'],
		cardGradient: ['#312E81', '#7C3AED'],
	},
	cashRescue: {
		accentColor: '#06B6D4',
		amountColor: '#06B6D4',
		lineColor: 'rgba(6, 182, 212, 0.3)',
		iconGradient: ['#0E7490', '#22D3EE'],
		cardGradient: ['#0E7490', '#22D3EE'],
	},
	investmentSync: {
		accentColor: '#14B8A6',
		amountColor: '#14B8A6',
		lineColor: 'rgba(20, 184, 166, 0.28)',
		iconGradient: ['#0F766E', '#2DD4BF'],
		cardGradient: ['#115E59', '#14B8A6'],
	},
};

const resolveTimelineMovementToneKey = (movement: MovementRecord): TimelineMovementToneKey => {
	if (movement.isFinanceInvestmentSync) {
		return 'investmentSync';
	}

	if (movement.isCashRescue) {
		return 'cashRescue';
	}

	if (movement.isBankTransfer) {
		return 'bankTransfer';
	}

	if (movement.isInvestmentRedemption) {
		return 'investmentRedemption';
	}

	if (movement.isInvestmentDeposit || movement.isFinanceInvestment) {
		return 'investmentDeposit';
	}

	if (movement.isFromMandatory) {
		return movement.type === 'gain' ? 'mandatoryGain' : 'mandatoryExpense';
	}

	return movement.type === 'gain' ? 'gain' : 'expense';
};

export default function BankMovementsScreen() {

	const {
		isDarkMode,
		surfaceBackground,
		cardBackground,
		bodyText,
		helperText,
		inputField,
		fieldContainerClassName,
		fieldContainerCardClassName,
		textareaContainerClassName,
		submitButtonClassName,
		submitButtonCancelClassName,
		heroHeight,
		insets,
		infoCardStyle,
		modalContentClassName,
	} = useScreenStyles();
	const searchParams = useLocalSearchParams<{
		bankId?: string | string[];
		bankName?: string | string[];
		cashView?: string | string[];
	}>();

	const bankId = React.useMemo(() => {
		const value = searchParams.bankId;
		if (Array.isArray(value)) {
			return value[0] ?? '';
		}
		return value ?? '';
	}, [searchParams.bankId]);

	const cashViewParam = React.useMemo(() => {
		const value = searchParams.cashView;
		if (Array.isArray(value)) {
			return value[0] ?? '';
		}
		return value ?? '';
	}, [searchParams.cashView]);

	const isCashView = React.useMemo(() => {
		const normalized = typeof cashViewParam === 'string' ? cashViewParam.toLowerCase() : '';
		if (normalized) {
			return ['true', '1', 'cash', 'yes'].includes(normalized);
		}
		return bankId === 'cash' || bankId === 'cash-transactions';
	}, [bankId, cashViewParam]);

	const bankName = React.useMemo(() => {
		if (isCashView) {
			return 'Transações em dinheiro';
		}
		const value = Array.isArray(searchParams.bankName) ? searchParams.bankName[0] : searchParams.bankName;
		if (!value) {
			return 'Banco selecionado';
		}

		try {
			return decodeURIComponent(value);
		} catch {
			return value;
		}
	}, [searchParams.bankName, isCashView]);

	const { start, end } = React.useMemo(() => getCurrentMonthBounds(), []);

	const [startDateInput, setStartDateInput] = React.useState(formatDateToBR(start));
	const [endDateInput, setEndDateInput] = React.useState(formatDateToBR(end));

	const [movements, setMovements] = React.useState<MovementRecord[]>([]);
	const [isLoading, setIsLoading] = React.useState(false);
	const [isRefreshing, setIsRefreshing] = React.useState(false);
	const [isExportingPdf, setIsExportingPdf] = React.useState(false);
	const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
	const [pendingAction, setPendingAction] = React.useState<PendingMovementAction | null>(null);
	const [isProcessingAction, setIsProcessingAction] = React.useState(false);
	const { shouldHideValues } = useValueVisibility();
	const [movementFilter, setMovementFilter] = React.useState<MovementFilter>('all');
	const [selectedTagFilterId, setSelectedTagFilterId] = React.useState<string | null>(null);
	const [monthlyInitialBalanceInCents, setMonthlyInitialBalanceInCents] = React.useState<number | null>(null);
	const [bankAccentColorHex, setBankAccentColorHex] = React.useState<string | null>(
		isCashView ? CASH_CARD_COLOR : null,
	);
	const [isPeriodTimelineExpanded, setIsPeriodTimelineExpanded] = React.useState(true);
	const [expandedMovementIds, setExpandedMovementIds] = React.useState<string[]>([]);
	const [tagMetadataById, setTagMetadataById] = React.useState<Record<string, MovementTagMetadata>>({});
	const [bankOptions, setBankOptions] = React.useState<BankOption[]>([]);
	const [editingFinanceMovement, setEditingFinanceMovement] = React.useState<MovementRecord | null>(null);
	const [editInvestmentName, setEditInvestmentName] = React.useState('');
	const [editInvestmentInitialInput, setEditInvestmentInitialInput] = React.useState('');
	const [editInvestmentCdiInput, setEditInvestmentCdiInput] = React.useState('');
	const [editInvestmentTerm, setEditInvestmentTerm] = React.useState<RedemptionTerm>('anytime');
	const [editInvestmentBankId, setEditInvestmentBankId] = React.useState<string | null>(null);
	const [editInvestmentDescription, setEditInvestmentDescription] = React.useState('');
	const [isSavingFinanceMovement, setIsSavingFinanceMovement] = React.useState(false);

	const showScreenAlert = React.useCallback(
		(
			message: string,
			action: 'success' | 'error' | 'warning' | 'info' | 'muted' = 'error',
			title?: string,
		) => {
			showNotifierAlert({
				title,
				description: message,
				type:
					action === 'warning'
						? 'warn'
						: action === 'muted'
							? 'info'
							: action,
				isDarkMode,
			});
		},
		[isDarkMode],
	);

	const formatCurrencyBRL = React.useCallback(
		(valueInCents: number) => {
			if (shouldHideValues) {
				return HIDDEN_VALUE_PLACEHOLDER;
			}
			return formatCurrencyBRLBase(valueInCents);
		},
		[shouldHideValues],
	);

	const formatSignedCurrencyBRL = React.useCallback(
		(movement: MovementRecord) => {
			if (shouldHideValues) {
				return HIDDEN_VALUE_PLACEHOLDER;
			}

			if (movement.type === 'sync') {
				return formatCurrencyBRLBase(movement.valueInCents);
			}

			return `${movement.type === 'gain' ? '+' : '-'}${formatCurrencyBRLBase(movement.valueInCents)}`;
		},
		[shouldHideValues],
	);

	const formatDeltaCurrencyBRL = React.useCallback(
		(valueInCents: number | null | undefined) => {
			if (shouldHideValues) {
				return HIDDEN_VALUE_PLACEHOLDER;
			}

			if (typeof valueInCents !== 'number') {
				return 'Sem variação';
			}

			const prefix = valueInCents >= 0 ? '+' : '-';
			return `${prefix}${formatCurrencyBRLBase(Math.abs(valueInCents))}`;
		},
		[shouldHideValues],
	);

	const getInvestmentSyncReasonLabel = React.useCallback(
		(reason: MovementRecord['investmentSyncReason']) => {
			if (reason === 'deposit') {
				return 'Sincronização antes do aporte';
			}

			if (reason === 'withdrawal') {
				return 'Sincronização antes do resgate';
			}

			return 'Sincronização manual';
		},
		[],
	);

	const formatMovementCompactDate = React.useCallback((value: Date | null) => {
		if (!value) {
			return 'Sem data';
		}

		return new Intl.DateTimeFormat('pt-BR', {
			day: '2-digit',
			month: '2-digit',
		}).format(value);
	}, []);

	const resolveMovementTypeLabel = React.useCallback((movement?: MovementRecord | null) => {
		if (!movement) {
			return '';
		}
		if (movement.isBankTransfer) {
			if (movement.bankTransferDirection === 'outgoing') {
				return 'Transferência enviada';
			}
			if (movement.bankTransferDirection === 'incoming') {
				return 'Transferência recebida';
			}
			return 'Transferência entre bancos';
		}
		if (movement.isFinanceInvestment) {
			return 'Investimento';
		}
		if (movement.isFinanceInvestmentSync) {
			return 'Sincronização de investimento';
		}
		if (movement.isInvestmentDeposit) {
			return 'Aporte de investimento';
		}
		if (movement.isInvestmentRedemption) {
			return 'Resgate de investimento';
		}
		return movement.type === 'gain' ? 'Ganho' : 'Despesa';
	}, []);

	const timelinePalette = React.useMemo(
		() => ({
			title: isDarkMode ? '#F8FAFC' : '#0F172A',
			subtitle: isDarkMode ? '#94A3B8' : '#64748B',
			cardBorder: isDarkMode ? 'rgba(148, 163, 184, 0.18)' : 'rgba(226, 232, 240, 1)',
			emptySurface: isDarkMode ? '#020617' : '#F8FAFC',
			timelineBase: isDarkMode ? '#243041' : '#CBD5E1',
		}),
		[isDarkMode],
	);

	const movementFilterPalette = React.useMemo(
		() => ({
			selectedBackground: '#FACC15',
			selectedBorder: '#FACC15',
			selectedIconClassName: isDarkMode ? 'text-slate-900' : 'text-white',
			selectedTextClassName: isDarkMode ? 'text-slate-900' : 'text-white',
			unselectedBackground: isDarkMode ? 'transparent' : '#FFFFFF',
			unselectedBorder: isDarkMode ? '#1E293B' : '#E2E8F0',
			unselectedIconClassName: isDarkMode ? 'text-slate-400' : 'text-slate-500',
			unselectedTextClassName: isDarkMode ? 'text-slate-400' : 'text-slate-500',
		}),
		[isDarkMode],
	);

	const periodSummaryPalette = React.useMemo(
		() => ({
			title: isDarkMode ? '#F8FAFC' : '#0F172A',
			subtitle: isDarkMode ? '#94A3B8' : '#64748B',
			neutralSurface: isDarkMode ? 'rgba(15, 23, 42, 0.92)' : '#F8FAFC',
			neutralBorder: isDarkMode ? 'rgba(148, 163, 184, 0.16)' : 'rgba(226, 232, 240, 1)',
			gainSurface: isDarkMode ? 'rgba(16, 185, 129, 0.12)' : '#ECFDF5',
			gainBorder: isDarkMode ? 'rgba(16, 185, 129, 0.28)' : '#A7F3D0',
			gainText: '#10B981',
			expenseSurface: isDarkMode ? 'rgba(239, 68, 68, 0.12)' : '#FEF2F2',
			expenseBorder: isDarkMode ? 'rgba(248, 113, 113, 0.26)' : '#FECACA',
			expenseText: '#EF4444',
		}),
		[isDarkMode],
	);

	const getMovementTone = React.useCallback(
		(movement: MovementRecord) => TIMELINE_MOVEMENT_TONES[resolveTimelineMovementToneKey(movement)],
		[],
	);

	const getFallbackMovementIcon = React.useCallback((movement: MovementRecord): TagIconSelection => {
		if (movement.isFinanceInvestmentSync) {
			return { iconFamily: 'ionicons', iconName: 'sync-outline' };
		}

		if (movement.isCashRescue) {
			return { iconFamily: 'ionicons', iconName: 'cash-outline' };
		}

		if (movement.isBankTransfer) {
			return { iconFamily: 'ionicons', iconName: 'swap-horizontal-outline' };
		}

		if (movement.isInvestmentRedemption) {
			return { iconFamily: 'ionicons', iconName: 'arrow-down-circle-outline' };
		}

		if (movement.isInvestmentDeposit || movement.isFinanceInvestment) {
			return { iconFamily: 'ionicons', iconName: 'arrow-up-circle-outline' };
		}

		if (movement.isFromMandatory) {
			return { iconFamily: 'ionicons', iconName: 'shield-checkmark-outline' };
		}

		return movement.type === 'gain'
			? { iconFamily: 'ionicons', iconName: 'trending-up-outline' }
			: { iconFamily: 'ionicons', iconName: 'trending-down-outline' };
	}, []);

	const getMovementSummarySubtitle = React.useCallback(
		(movement: MovementRecord) => {
			if (movement.isCashRescue) {
				return `Saque do banco ${movement.cashRescueSourceBankName ?? 'não identificado'}`;
			}

			if (movement.isBankTransfer) {
				return movement.bankTransferDirection === 'outgoing'
					? `Transferência para ${movement.bankTransferTargetBankNameSnapshot ?? 'banco de destino'}`
					: `Transferência de ${movement.bankTransferSourceBankNameSnapshot ?? 'banco de origem'}`;
			}

			if (movement.isInvestmentRedemption) {
				return movement.investmentNameSnapshot
					? `Resgate de ${movement.investmentNameSnapshot}`
					: 'Resgate de investimento';
			}

			if (movement.isInvestmentDeposit) {
				return movement.investmentNameSnapshot
					? `Aporte em ${movement.investmentNameSnapshot}`
					: 'Aporte de investimento';
			}

			if (movement.isFinanceInvestmentSync) {
				return movement.investmentNameSnapshot
					? `${getInvestmentSyncReasonLabel(movement.investmentSyncReason)} em ${movement.investmentNameSnapshot}`
					: getInvestmentSyncReasonLabel(movement.investmentSyncReason);
			}

			if (movement.isFinanceInvestment) {
				return movement.investmentBankNameSnapshot
					? `Aplicado via ${movement.investmentBankNameSnapshot}`
					: `Aplicado via ${bankName}`;
			}

			if (movement.isFromMandatory) {
				return movement.type === 'gain'
					? 'Recebimento obrigatório concluído'
					: 'Pagamento obrigatório concluído';
			}

			if (movement.moneyFormat || isCashView) {
				return 'Movimentação em dinheiro';
			}

			return resolveMovementTypeLabel(movement);
		},
		[bankName, getInvestmentSyncReasonLabel, isCashView, resolveMovementTypeLabel],
	);

	const getMovementDetailMessage = React.useCallback(
		(movement: MovementRecord) => {
			if (movement.isFromMandatory) {
				return movement.type === 'gain'
					? 'Este lançamento marcou como recebido o ganho obrigatório do ciclo atual.'
					: 'Este lançamento marcou como pago o gasto obrigatório do ciclo atual.';
			}

			if (movement.isCashRescue) {
				return `Este registro representa um saque em dinheiro vindo do banco ${movement.cashRescueSourceBankName ?? 'não identificado'}.`;
			}

			if (movement.isBankTransfer) {
				return movement.bankTransferDirection === 'outgoing'
					? `Transferência enviada para ${movement.bankTransferTargetBankNameSnapshot ?? 'o banco de destino'}.`
					: `Transferência recebida de ${movement.bankTransferSourceBankNameSnapshot ?? 'o banco de origem'}.`;
			}

			if (movement.isFinanceInvestmentSync) {
				const investmentName = movement.investmentNameSnapshot ?? 'este investimento';
				if (movement.investmentSyncReason === 'deposit') {
					return `Valor real conferido antes do aporte em "${investmentName}".`;
				}

				if (movement.investmentSyncReason === 'withdrawal') {
					return `Valor real conferido antes do resgate em "${investmentName}".`;
				}

				return `Sincronização manual registrada para "${investmentName}".`;
			}

			if (movement.isFinanceInvestment) {
				return 'Este valor representa o cadastro inicial do investimento. Você pode editar os dados ou excluir o investimento por aqui.';
			}

			if (movement.isInvestmentRedemption) {
				return movement.investmentNameSnapshot
					? `Resgate automático do investimento "${movement.investmentNameSnapshot}".`
					: 'Resgate automático registrado para este investimento.';
			}

			if (movement.isInvestmentDeposit) {
				return movement.investmentNameSnapshot
					? `Aporte automático no investimento "${movement.investmentNameSnapshot}".`
					: 'Aporte automático registrado para este investimento.';
			}

			if (movement.explanation?.trim()) {
				return movement.explanation.trim();
			}

			return 'Lançamento registrado normalmente dentro do período filtrado.';
		},
		[],
	);

	const getMovementPrimarySourceLabel = React.useCallback(
		(movement: MovementRecord) => {
			if (movement.isFinanceInvestmentSync) {
				return movement.investmentBankNameSnapshot?.trim() || bankName;
			}

			if (movement.isCashRescue) {
				return movement.cashRescueSourceBankName ?? 'Banco não identificado';
			}

			if (movement.moneyFormat || isCashView) {
				return 'Dinheiro em espécie';
			}

			if (movement.investmentBankNameSnapshot?.trim()) {
				return movement.investmentBankNameSnapshot.trim();
			}

			return bankName;
		},
		[bankName, isCashView],
	);

	const getMovementTagLabel = React.useCallback(
		(movement: MovementRecord) => {
			if (!movement.tagId) {
				return 'Sem tag associada';
			}

			return tagMetadataById[movement.tagId]?.name?.trim() || movement.tagId;
		},
		[tagMetadataById],
	);

	const handleDateSelect = React.useCallback((formatted: string, type: 'start' | 'end') => {
		if (type === 'start') {
			setStartDateInput(formatted);
		} else {
			setEndDateInput(formatted);
		}
	}, []);

	const fetchMovements = React.useCallback(async (asRefresh = false) => {
		if (!bankId && !isCashView) {
			setErrorMessage('Nenhum banco foi informado.');
			setMovements([]);
			return;
		}

		const parsedStart = parseDateFromBR(startDateInput);
		const parsedEnd = parseDateFromBR(endDateInput);

		if (!parsedStart || !parsedEnd) {
			setErrorMessage('Informe datas válidas para o período.');
			setMovements([]);
			return;
		}

		const normalizedStart = new Date(parsedStart);
		normalizedStart.setHours(0, 0, 0, 0);

		const normalizedEnd = new Date(parsedEnd);
		normalizedEnd.setHours(23, 59, 59, 999);

		if (normalizedEnd < normalizedStart) {
			setErrorMessage('A data final deve ser maior ou igual à data inicial.');
			setMovements([]);
			return;
		}

		const currentUser = auth.currentUser;
		if (!currentUser) {
			setErrorMessage('Nenhum usuário autenticado foi identificado.');
			setMovements([]);
			return;
		}

		if (asRefresh) {
			setIsRefreshing(true);
		} else {
			setIsLoading(true);
		}
		setErrorMessage(null);

		try {
			// Buscamos em paralelo as movimentações do banco e os obrigatórios
			const movementsPromise = isCashView
				? getCashMovementsByPeriodFirebase({
					personId: currentUser.uid,
					startDate: normalizedStart,
					endDate: normalizedEnd,
				})
				: getBankMovementsByPeriodFirebase({
					personId: currentUser.uid,
					bankId,
					startDate: normalizedStart,
					endDate: normalizedEnd,
				});

			const investmentsPromise = isCashView
				? Promise.resolve(null)
				: getFinanceInvestmentsByPeriodFirebase({
					personId: currentUser.uid,
					bankId,
					startDate: normalizedStart,
					endDate: normalizedEnd,
				});

			const investmentSyncsPromise = isCashView
				? Promise.resolve(null)
				: getFinanceInvestmentSyncEventsByPeriodFirebase({
					personId: currentUser.uid,
					bankId,
					startDate: normalizedStart,
					endDate: normalizedEnd,
				});

			const now = new Date();
			const balancePromise = isCashView
				? Promise.resolve(null)
				: getMonthlyBalanceFirebaseRelatedToUser({
					personId: currentUser.uid,
					bankId,
					year: now.getFullYear(),
					month: now.getMonth() + 1,
				});

			const [result, investmentsRes, investmentSyncsRes, mandatoryExpensesRes, mandatoryGainsRes, monthlyBalanceRes] = await Promise.all([
				movementsPromise,
				investmentsPromise,
				investmentSyncsPromise,
				getMandatoryExpensesWithRelationsFirebase(currentUser.uid),
				getMandatoryGainsWithRelationsFirebase(currentUser.uid),
				balancePromise,
			]);
			if (!result?.success || !result.data) {
				setMovements([]);
				setErrorMessage(
					typeof result?.error === 'string'
						? result.error
						: 'Erro ao carregar as movimentações do período selecionado.',
				);
				return;
			}

			const expensesArray: any[] = Array.isArray(result.data.expenses) ? result.data.expenses : [];
			const gainsArray: any[] = Array.isArray(result.data.gains) ? result.data.gains : [];
			const investmentsArray: any[] =
				!isCashView && investmentsRes?.success && Array.isArray(investmentsRes.data)
					? investmentsRes.data
					: [];
			const investmentSyncsArray: any[] =
				!isCashView && investmentSyncsRes?.success && Array.isArray(investmentSyncsRes.data)
					? investmentSyncsRes.data
					: [];

			// Mapeia os IDs de despesas/ganhos que estão vinculados a obrigatórios no ciclo atual
			const lockedExpenseIds = new Set<string>(
				mandatoryExpensesRes?.success && Array.isArray(mandatoryExpensesRes.data)
					? (mandatoryExpensesRes.data as Array<Record<string, any>>)
						.filter(item =>
							item &&
							typeof item.lastPaymentExpenseId === 'string' &&
							isCycleKeyCurrent(typeof item.lastPaymentCycle === 'string' ? item.lastPaymentCycle : undefined),
						)
						.map(item => item.lastPaymentExpenseId as string)
					: [],
			);

			const lockedGainIds = new Set<string>(
				mandatoryGainsRes?.success && Array.isArray(mandatoryGainsRes.data)
					? (mandatoryGainsRes.data as Array<Record<string, any>>)
						.filter(item =>
							item &&
							typeof item.lastReceiptGainId === 'string' &&
							isCycleKeyCurrent(typeof item.lastReceiptCycle === 'string' ? item.lastReceiptCycle : undefined),
						)
						.map(item => item.lastReceiptGainId as string)
					: [],
			);

			const expenseMovements: MovementRecord[] = expensesArray.map(expense => ({
				id: typeof expense?.id === 'string' ? expense.id : `expense-${Math.random()}`,
				name:
					typeof expense?.name === 'string' && expense.name.trim().length > 0
						? expense.name.trim()
						: 'Despesa sem nome',
				valueInCents: typeof expense?.valueInCents === 'number' ? expense.valueInCents : 0,
				type: 'expense',
				date: normalizeDate(expense?.date ?? expense?.createdAt ?? null),
				tagId: typeof expense?.tagId === 'string' ? expense.tagId : null,
				bankId: typeof expense?.bankId === 'string' ? expense.bankId : null,
				personId: typeof expense?.personId === 'string' ? expense.personId : null,
				explanation: typeof expense?.explanation === 'string' ? expense.explanation : null,
				moneyFormat: typeof expense?.moneyFormat === 'boolean' ? expense.moneyFormat : null,
				isFromMandatory: typeof expense?.id === 'string' ? lockedExpenseIds.has(expense.id) : false,
				isCashRescue: Boolean(expense?.isCashRescue),
				cashRescueSourceBankName:
					typeof expense?.bankNameSnapshot === 'string' ? expense.bankNameSnapshot : null,
				isBankTransfer: Boolean(expense?.isBankTransfer),
				bankTransferPairId:
					typeof expense?.bankTransferPairId === 'string' ? expense.bankTransferPairId : null,
				bankTransferDirection: normalizeTransferDirection(expense?.bankTransferDirection),
				bankTransferSourceBankId:
					typeof expense?.bankTransferSourceBankId === 'string' ? expense.bankTransferSourceBankId : null,
				bankTransferTargetBankId:
					typeof expense?.bankTransferTargetBankId === 'string' ? expense.bankTransferTargetBankId : null,
				bankTransferSourceBankNameSnapshot:
					typeof expense?.bankTransferSourceBankNameSnapshot === 'string'
						? expense.bankTransferSourceBankNameSnapshot
						: null,
				bankTransferTargetBankNameSnapshot:
					typeof expense?.bankTransferTargetBankNameSnapshot === 'string'
						? expense.bankTransferTargetBankNameSnapshot
						: null,
				bankTransferExpenseId:
					typeof expense?.bankTransferExpenseId === 'string' ? expense.bankTransferExpenseId : null,
				bankTransferGainId:
					typeof expense?.bankTransferGainId === 'string' ? expense.bankTransferGainId : null,
				isInvestmentDeposit: Boolean(expense?.isInvestmentDeposit),
				investmentId: typeof expense?.investmentId === 'string' ? expense.investmentId : null,
				investmentNameSnapshot:
					typeof expense?.investmentNameSnapshot === 'string' ? expense.investmentNameSnapshot : null,
			}));

			const gainMovements: MovementRecord[] = gainsArray.map(gain => ({
				id: typeof gain?.id === 'string' ? gain.id : `gain-${Math.random()}`,
				name:
					typeof gain?.name === 'string' && gain.name.trim().length > 0
						? gain.name.trim()
						: 'Ganho sem nome',
				valueInCents: typeof gain?.valueInCents === 'number' ? gain.valueInCents : 0,
				type: 'gain',
				date: normalizeDate(gain?.date ?? gain?.createdAt ?? null),
				tagId: typeof gain?.tagId === 'string' ? gain.tagId : null,
				bankId: typeof gain?.bankId === 'string' ? gain.bankId : null,
				personId: typeof gain?.personId === 'string' ? gain.personId : null,
				explanation: typeof gain?.explanation === 'string' ? gain.explanation : null,
				paymentFormats: Array.isArray(gain?.paymentFormats)
					? (gain?.paymentFormats as unknown[]).filter(item => typeof item === 'string') as string[]
					: null,
				moneyFormat: typeof gain?.moneyFormat === 'boolean' ? gain.moneyFormat : null,
				isFromMandatory: typeof gain?.id === 'string' ? lockedGainIds.has(gain.id) : false,
				isCashRescue: Boolean(gain?.isCashRescue),
				cashRescueSourceBankName:
					typeof gain?.bankNameSnapshot === 'string' ? gain.bankNameSnapshot : null,
				isBankTransfer: Boolean(gain?.isBankTransfer),
				bankTransferPairId: typeof gain?.bankTransferPairId === 'string' ? gain.bankTransferPairId : null,
				bankTransferDirection: normalizeTransferDirection(gain?.bankTransferDirection),
				bankTransferSourceBankId:
					typeof gain?.bankTransferSourceBankId === 'string' ? gain.bankTransferSourceBankId : null,
				bankTransferTargetBankId:
					typeof gain?.bankTransferTargetBankId === 'string' ? gain.bankTransferTargetBankId : null,
				bankTransferSourceBankNameSnapshot:
					typeof gain?.bankTransferSourceBankNameSnapshot === 'string'
						? gain.bankTransferSourceBankNameSnapshot
						: null,
				bankTransferTargetBankNameSnapshot:
					typeof gain?.bankTransferTargetBankNameSnapshot === 'string'
						? gain.bankTransferTargetBankNameSnapshot
						: null,
				bankTransferExpenseId:
					typeof gain?.bankTransferExpenseId === 'string' ? gain.bankTransferExpenseId : null,
				bankTransferGainId: typeof gain?.bankTransferGainId === 'string' ? gain.bankTransferGainId : null,
				isInvestmentRedemption: Boolean(gain?.isInvestmentRedemption),
				investmentNameSnapshot:
					typeof gain?.investmentNameSnapshot === 'string' ? gain.investmentNameSnapshot : null,
				investmentId: typeof gain?.investmentId === 'string' ? gain.investmentId : null,
			}));

			const investmentMovements: MovementRecord[] = investmentsArray.map(investment => ({
				id: typeof investment?.id === 'string' ? investment.id : `investment-${Math.random()}`,
				name:
					typeof investment?.name === 'string' && investment.name.trim().length > 0
						? investment.name.trim()
						: 'Investimento registrado',
				valueInCents:
					typeof investment?.initialValueInCents === 'number' ? investment.initialValueInCents : 0,
				type: 'expense',
				date: normalizeDate(investment?.date ?? investment?.createdAt ?? null),
				tagId: null,
				bankId: typeof investment?.bankId === 'string' ? investment.bankId : null,
				personId: typeof investment?.personId === 'string' ? investment.personId : null,
				explanation:
					typeof investment?.description === 'string' && investment.description.trim().length > 0
						? investment.description
						: null,
				moneyFormat: null,
				isFromMandatory: false,
				isCashRescue: false,
				cashRescueSourceBankName: null,
				isFinanceInvestment: true,
				investmentId: typeof investment?.id === 'string' ? investment.id : null,
				investmentBankNameSnapshot:
					typeof investment?.bankNameSnapshot === 'string' ? investment.bankNameSnapshot : null,
				investmentCdiPercentage:
					typeof investment?.cdiPercentage === 'number' ? investment.cdiPercentage : null,
				investmentRedemptionTerm:
					typeof investment?.redemptionTerm === 'string'
						? (investment.redemptionTerm as RedemptionTerm)
						: null,
			}));

			const investmentSyncMovements: MovementRecord[] = investmentSyncsArray.map(syncEvent => ({
				id: typeof syncEvent?.id === 'string' ? syncEvent.id : `investment-sync-${Math.random()}`,
				name:
					typeof syncEvent?.name === 'string' && syncEvent.name.trim().length > 0
						? syncEvent.name.trim()
						: 'Sincronização de investimento',
				valueInCents:
					typeof syncEvent?.syncedValueInCents === 'number' ? syncEvent.syncedValueInCents : 0,
				type: 'sync',
				date: normalizeDate(syncEvent?.date ?? syncEvent?.createdAt ?? null),
				tagId: null,
				bankId: typeof syncEvent?.bankId === 'string' ? syncEvent.bankId : null,
				personId: typeof syncEvent?.personId === 'string' ? syncEvent.personId : null,
				explanation: null,
				moneyFormat: null,
				isFromMandatory: false,
				isCashRescue: false,
				cashRescueSourceBankName: null,
				isFinanceInvestmentSync: true,
				investmentId: typeof syncEvent?.investmentId === 'string' ? syncEvent.investmentId : null,
				investmentNameSnapshot:
					typeof syncEvent?.investmentNameSnapshot === 'string'
						? syncEvent.investmentNameSnapshot
						: null,
				investmentBankNameSnapshot:
					typeof syncEvent?.bankNameSnapshot === 'string' ? syncEvent.bankNameSnapshot : null,
				investmentSyncPreviousValueInCents:
					typeof syncEvent?.previousValueInCents === 'number'
						? syncEvent.previousValueInCents
						: null,
				investmentSyncReason:
					syncEvent?.reason === 'manual' ||
					syncEvent?.reason === 'deposit' ||
					syncEvent?.reason === 'withdrawal'
						? syncEvent.reason
						: 'manual',
			}));

			const combinedMovements = [
				...expenseMovements,
				...gainMovements,
				...investmentMovements,
				...investmentSyncMovements,
			].sort((a, b) => {
				const dateA = a.date ? a.date.getTime() : 0;
				const dateB = b.date ? b.date.getTime() : 0;
				return dateB - dateA;
			});

			setMovements(combinedMovements);
			if (!isCashView) {
				const initialBalanceValue =
					monthlyBalanceRes && monthlyBalanceRes.success && monthlyBalanceRes.data
						? monthlyBalanceRes.data.valueInCents
						: null;
				setMonthlyInitialBalanceInCents(
					typeof initialBalanceValue === 'number' ? initialBalanceValue : null,
				);
			} else {
				setMonthlyInitialBalanceInCents(null);
			}
		} catch (error) {
			console.error('Erro ao buscar movimentações do banco:', error);
			setErrorMessage('Erro inesperado ao carregar as movimentações.');
			setMovements([]);
			setMonthlyInitialBalanceInCents(null);
		} finally {
			setIsLoading(false);
			setIsRefreshing(false);
		}
	}, [bankId, endDateInput, isCashView, startDateInput]);

	useFocusEffect(
		React.useCallback(() => {
			void fetchMovements();
		}, [fetchMovements]),
	);

	// Busca a cor do banco selecionado para renderizar o card-resumo com a mesma
	// paleta visual usada no card da tela inicial.
	React.useEffect(() => {
		let isMounted = true;

		if (isCashView) {
			setBankAccentColorHex(CASH_CARD_COLOR);
			return () => {
				isMounted = false;
			};
		}

		if (!bankId) {
			setBankAccentColorHex(null);
			return () => {
				isMounted = false;
			};
		}

		const fetchBankAccentColor = async () => {
			try {
				const bankResult = await getBankDataFirebase(bankId);
				if (!isMounted) {
					return;
				}

				if (bankResult.success && bankResult.data) {
					const colorHex =
						typeof bankResult.data.colorHex === 'string' && bankResult.data.colorHex.trim().length > 0
							? bankResult.data.colorHex
							: null;
					setBankAccentColorHex(colorHex);
				} else {
					setBankAccentColorHex(null);
				}
			} catch (error) {
				console.error('Erro ao buscar a cor do banco:', error);
				if (isMounted) {
					setBankAccentColorHex(null);
				}
			}
		};

		void fetchBankAccentColor();

		return () => {
			isMounted = false;
		};
	}, [bankId, isCashView]);

	React.useEffect(() => {
		let isMounted = true;
		const currentUser = auth.currentUser;

		if (isCashView || !currentUser) {
			setBankOptions([]);
			return () => {
				isMounted = false;
			};
		}

		const loadBankOptions = async () => {
			try {
				const result = await getBanksWithUsersByPersonFirebase(currentUser.uid);
				if (!isMounted) {
					return;
				}

				if (!result.success || !Array.isArray(result.data)) {
					setBankOptions([]);
					return;
				}

				const nextOptions = (result.data as Array<Record<string, unknown>>)
					.map((bankItem) => ({
						id: typeof bankItem.id === 'string' ? bankItem.id : '',
						name:
							typeof bankItem.name === 'string' && bankItem.name.trim().length > 0
								? bankItem.name.trim()
								: 'Banco sem nome',
					}))
					.filter((bankItem) => bankItem.id.trim().length > 0)
					.sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'));

				setBankOptions(nextOptions);
			} catch (error) {
				console.error('Erro ao carregar bancos para edição do investimento:', error);
				if (isMounted) {
					setBankOptions([]);
				}
			}
		};

		void loadBankOptions();

		return () => {
			isMounted = false;
		};
	}, [isCashView]);

	React.useEffect(() => {
		let isMounted = true;
		const uniqueTagIds = Array.from(
			new Set(
				movements
					.map(movement => movement.tagId)
					.filter((tagId): tagId is string => typeof tagId === 'string' && tagId.trim().length > 0),
			),
		);
		const missingTagIds = uniqueTagIds.filter(tagId => tagMetadataById[tagId] === undefined);

		if (missingTagIds.length === 0) {
			return () => {
				isMounted = false;
			};
		}

		const fetchMissingTags = async () => {
			const fetchedTags = await Promise.all(
				missingTagIds.map(async tagId => {
					try {
						const tagResult = await getTagDataFirebase(tagId);
						if (tagResult.success && tagResult.data) {
							return [
								tagId,
								{
									name: typeof tagResult.data.name === 'string' ? tagResult.data.name : null,
									icon: {
										iconFamily:
											typeof tagResult.data.iconFamily === 'string'
												? tagResult.data.iconFamily
												: null,
										iconName:
											typeof tagResult.data.iconName === 'string'
												? tagResult.data.iconName
												: null,
										iconStyle:
											typeof tagResult.data.iconStyle === 'string'
												? tagResult.data.iconStyle
												: null,
									},
								},
							] as const;
						}
					} catch (error) {
						console.error('Erro ao buscar dados da tag:', error);
					}

					return [tagId, { name: null, icon: null }] as const;
				}),
			);

			if (!isMounted) {
				return;
			}

			setTagMetadataById(previousState => {
				const nextState = { ...previousState };
				for (const [tagId, metadata] of fetchedTags) {
					nextState[tagId] = metadata;
				}
				return nextState;
			});
		};

		void fetchMissingTags();

		return () => {
			isMounted = false;
		};
	}, [movements, tagMetadataById]);

	const movementsMatchingMovementFilter = React.useMemo(() => {
		if (movementFilter === 'all') {
			return movements;
		}
		return movements.filter(movement => movement.type === movementFilter);
	}, [movementFilter, movements]);

	// Mantém o filtro de tags alinhado às próprias movimentações carregadas, conforme [[Gerenciamento de Tags]].
	const availableTagFilters = React.useMemo<AvailableTagFilterOption[]>(() => {
		const tagCounts = new Map<string, number>();

		movementsMatchingMovementFilter.forEach(movement => {
			if (typeof movement.tagId !== 'string' || movement.tagId.trim().length === 0) {
				return;
			}

			tagCounts.set(movement.tagId, (tagCounts.get(movement.tagId) ?? 0) + 1);
		});

		return Array.from(tagCounts.entries())
			.map(([tagId, movementCount]) => ({
				id: tagId,
				label: tagMetadataById[tagId]?.name?.trim() || tagId,
				icon: tagMetadataById[tagId]?.icon ?? null,
				movementCount,
			}))
			.sort((left, right) => left.label.localeCompare(right.label, 'pt-BR'));
	}, [movementsMatchingMovementFilter, tagMetadataById]);

	React.useEffect(() => {
		if (!selectedTagFilterId) {
			return;
		}

		const tagStillAvailable = availableTagFilters.some(option => option.id === selectedTagFilterId);
		if (!tagStillAvailable) {
			setSelectedTagFilterId(null);
		}
	}, [availableTagFilters, selectedTagFilterId]);

	const selectedTagFilterOption = React.useMemo(
		() => availableTagFilters.find(option => option.id === selectedTagFilterId) ?? null,
		[availableTagFilters, selectedTagFilterId],
	);

	const visibleMovements = React.useMemo(() => {
		if (!selectedTagFilterId) {
			return movementsMatchingMovementFilter;
		}

		return movementsMatchingMovementFilter.filter(movement => movement.tagId === selectedTagFilterId);
	}, [movementsMatchingMovementFilter, selectedTagFilterId]);

	React.useEffect(() => {
		const visibleIds = new Set(visibleMovements.map(movement => movement.id));
		setExpandedMovementIds(previousState => previousState.filter(id => visibleIds.has(id)));
	}, [visibleMovements]);

	// Separa os totais fixos do banco dos totais filtrados do período, seguindo [[Gerenciamento de Bancos]].
	const allMovementsTotals = React.useMemo(() => computeMovementTotals(movements), [movements]);
	const filteredTotals = React.useMemo(() => computeMovementTotals(visibleMovements), [visibleMovements]);
	const allMovementsBalanceInCents = allMovementsTotals.totalGains - allMovementsTotals.totalExpenses;
	const filteredBalanceInCents = filteredTotals.totalGains - filteredTotals.totalExpenses;

	const totalDeltaAllMovementsInCents = React.useMemo(() => {
		return movements.reduce((acc, movement) => {
			if (movement.type === 'gain') {
				return acc + movement.valueInCents;
			}

			if (movement.type === 'expense') {
				return acc - movement.valueInCents;
			}

			return acc;
		}, 0);
	}, [movements]);

	const bankCurrentBalanceInCents = React.useMemo(() => {
		if (typeof monthlyInitialBalanceInCents !== 'number') {
			return null;
		}
		return monthlyInitialBalanceInCents + totalDeltaAllMovementsInCents;
	}, [monthlyInitialBalanceInCents, totalDeltaAllMovementsInCents]);

	const summaryCardPalette = React.useMemo(
		() => buildBankCardPalette(isCashView ? CASH_CARD_COLOR : bankAccentColorHex, isDarkMode),
		[bankAccentColorHex, isCashView, isDarkMode],
	);

	const summaryPrimaryBalanceLabel = isCashView ? 'Saldo do período' : 'Saldo atual';

	const summaryPrimaryBalanceValue = React.useMemo(() => {
		if (isCashView) {
			return formatCurrencyBRL(allMovementsBalanceInCents);
		}

		if (typeof bankCurrentBalanceInCents === 'number') {
			return formatCurrencyBRL(bankCurrentBalanceInCents);
		}

		return 'Saldo não registrado';
	}, [allMovementsBalanceInCents, bankCurrentBalanceInCents, formatCurrencyBRL, isCashView]);

	const summaryPrimaryBalanceHelper = React.useMemo(() => {
		if (isCashView) {
			return 'Ganhos menos despesas de todas as movimentações do período selecionado.';
		}

		if (typeof monthlyInitialBalanceInCents === 'number') {
			return `Saldo inicial do mês: ${formatCurrencyBRL(monthlyInitialBalanceInCents)}`;
		}

		return 'Sem saldo registrado para este mês.';
	}, [formatCurrencyBRL, isCashView, monthlyInitialBalanceInCents]);

	const filteredSummaryTitle = React.useMemo(() => {
		if (selectedTagFilterOption) {
			return `Resumo de ${selectedTagFilterOption.label}`;
		}

		if (movementFilter === 'gain') {
			return 'Resumo de ganhos';
		}

		if (movementFilter === 'expense') {
			return 'Resumo de despesas';
		}

		return 'Resumo do período';
	}, [movementFilter, selectedTagFilterOption]);

	const filteredSummaryDescription = React.useMemo(() => {
		const movementCountLabel =
			visibleMovements.length === 1 ? '1 movimentação encontrada.' : `${visibleMovements.length} movimentações encontradas.`;

		if (selectedTagFilterOption && movementFilter !== 'all') {
			return `${movementCountLabel} Filtro ativo: ${movementFilter === 'gain' ? 'ganhos' : 'gastos'} com a tag ${selectedTagFilterOption.label}.`;
		}

		if (selectedTagFilterOption) {
			return `${movementCountLabel} Filtro ativo: tag ${selectedTagFilterOption.label}.`;
		}

		if (movementFilter === 'gain') {
			return `${movementCountLabel} Exibindo apenas ganhos no período selecionado.`;
		}

		if (movementFilter === 'expense') {
			return `${movementCountLabel} Exibindo apenas gastos no período selecionado.`;
		}

		return `${movementCountLabel} Exibindo todas as movimentações do período selecionado.`;
	}, [movementFilter, selectedTagFilterOption, visibleMovements.length]);

	const handleExportPeriodSummaryPdf = React.useCallback(async () => {
		if (isExportingPdf || isLoading) {
			return;
		}

		const parsedStart = parseDateFromBR(startDateInput);
		const parsedEnd = parseDateFromBR(endDateInput);

		if (!parsedStart || !parsedEnd) {
			showScreenAlert('Informe datas válidas antes de baixar o resumo em PDF.', 'warning');
			return;
		}

		if (parsedEnd < parsedStart) {
			showScreenAlert('A data final deve ser maior ou igual à data inicial.', 'warning');
			return;
		}

		const movementFilterLabel =
			movementFilter === 'all'
				? 'Todos os tipos'
				: movementFilter === 'gain'
					? 'Ganhos'
					: 'Gastos';
		const tagFilterLabel = selectedTagFilterOption
			? `Tag: ${selectedTagFilterOption.label}`
			: 'Todas as tags';
		const periodLabel = `${startDateInput} a ${endDateInput}`;
		const generatedAtLabel = new Intl.DateTimeFormat('pt-BR', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
		}).format(new Date());

		const generalMetrics: PeriodSummaryPdfMetric[] = [
			{
				label: 'Ganhos totais',
				value: formatCurrencyBRL(allMovementsTotals.totalGains),
				tone: 'gain',
			},
			{
				label: 'Despesas totais',
				value: formatCurrencyBRL(allMovementsTotals.totalExpenses),
				tone: 'expense',
			},
			{
				label: 'Saldo geral',
				value: formatCurrencyBRL(allMovementsBalanceInCents),
				tone: allMovementsBalanceInCents >= 0 ? 'gain' : 'expense',
			},
			{
				label: 'Movimentações carregadas',
				value: String(movements.length),
				helper: 'Antes dos filtros de tipo e tag.',
			},
		];

		if (!isCashView) {
			generalMetrics.push({
				label: 'Saldo inicial do mês',
				value:
					typeof monthlyInitialBalanceInCents === 'number'
						? formatCurrencyBRL(monthlyInitialBalanceInCents)
						: 'Não registrado',
				helper: 'Snapshot mensal usado como base do saldo atual.',
			});
		}

		const filteredMetrics: PeriodSummaryPdfMetric[] = [
			{
				label: 'Ganhos filtrados',
				value: formatCurrencyBRL(filteredTotals.totalGains),
				tone: 'gain',
			},
			{
				label: 'Despesas filtradas',
				value: formatCurrencyBRL(filteredTotals.totalExpenses),
				tone: 'expense',
			},
			{
				label: 'Saldo do filtro',
				value: formatCurrencyBRL(filteredBalanceInCents),
				tone: filteredBalanceInCents >= 0 ? 'gain' : 'expense',
			},
			{
				label: 'Movimentações no filtro',
				value: String(visibleMovements.length),
				helper: `${movementFilterLabel} · ${tagFilterLabel}`,
			},
		];

		const pdfMovements: PeriodSummaryPdfMovement[] = visibleMovements.map(movement => ({
			id: movement.id,
			name: movement.name,
			typeLabel: resolveMovementTypeLabel(movement),
			dateLabel: formatMovementDate(movement.date),
			tagLabel: getMovementTagLabel(movement),
			sourceLabel: getMovementPrimarySourceLabel(movement),
			description: getMovementDetailMessage(movement),
			amountLabel: formatSignedCurrencyBRL(movement),
			amountTone:
				movement.type === 'gain'
					? 'gain'
					: movement.type === 'expense'
						? 'expense'
						: 'neutral',
		}));

		const pdfHtml = buildPeriodSummaryPdfHtml({
			accountKindLabel: isCashView ? 'Dinheiro em espécie' : 'Banco',
			accountName: bankName,
			periodLabel,
			generatedAtLabel,
			filterLabel: `${movementFilterLabel} · ${tagFilterLabel}`,
			filterDescription: filteredSummaryDescription,
			summaryPrimaryBalanceLabel,
			summaryPrimaryBalanceValue,
			summaryPrimaryBalanceHelper,
			generalMetrics,
			filteredMetrics,
			movements: pdfMovements,
			cardBaseColor: summaryCardPalette.baseColor,
			cardGlowColor: summaryCardPalette.glowColor,
			cardHighlightColor: summaryCardPalette.highlightColor,
			privacyNotice: shouldHideValues
				? 'Os valores foram ocultados porque a preferência de privacidade está ativa.'
				: null,
		});

		setIsExportingPdf(true);
		try {
			// Exporta o resumo do período seguindo [[Gerenciamento de Bancos]] e [[Privacidade de Valores]].
			const { uri } = await Print.printToFileAsync({ html: pdfHtml });
			const pdfFileName = buildPdfFileName([
				isCashView ? 'Movimentos Dinheiro' : 'Movimentos Banco',
				bankName,
				startDateInput,
				endDateInput,
			]);
			const namedPdfUri = await copyPdfToNamedCacheFile(uri, pdfFileName);
			const canShare = await Sharing.isAvailableAsync();

			if (!canShare) {
				await Print.printAsync({ html: pdfHtml });
				showScreenAlert(
					'O resumo foi aberto na impressão do dispositivo. Use a opção de salvar como PDF.',
					'info',
					'Resumo pronto',
				);
				return;
			}

			await Sharing.shareAsync(namedPdfUri, {
				dialogTitle: `Baixar resumo de ${bankName}`,
				mimeType: 'application/pdf',
				UTI: 'com.adobe.pdf',
			});

			showScreenAlert('Resumo em PDF gerado com sucesso.', 'success', 'PDF pronto');
		} catch (error) {
			console.error('Erro ao gerar resumo em PDF:', error);
			showScreenAlert('Não foi possível gerar o PDF do resumo agora.', 'error');
		} finally {
			setIsExportingPdf(false);
		}
	}, [
		allMovementsBalanceInCents,
		allMovementsTotals.totalExpenses,
		allMovementsTotals.totalGains,
		bankName,
		endDateInput,
		filteredBalanceInCents,
		filteredSummaryDescription,
		filteredTotals.totalExpenses,
		filteredTotals.totalGains,
		formatCurrencyBRL,
		formatSignedCurrencyBRL,
		getMovementDetailMessage,
		getMovementPrimarySourceLabel,
		getMovementTagLabel,
		isCashView,
		isExportingPdf,
		isLoading,
		monthlyInitialBalanceInCents,
		movementFilter,
		movements.length,
		resolveMovementTypeLabel,
		selectedTagFilterOption,
		shouldHideValues,
		showScreenAlert,
		startDateInput,
		summaryCardPalette.baseColor,
		summaryCardPalette.glowColor,
		summaryCardPalette.highlightColor,
		summaryPrimaryBalanceHelper,
		summaryPrimaryBalanceLabel,
		summaryPrimaryBalanceValue,
		visibleMovements,
	]);

	const handleBackToHome = React.useCallback(() => {
		navigateToHomeDashboard();
		return true;
	}, []);

	const handleCloseActionModal = React.useCallback(() => {
		if (isProcessingAction) {
			return;
		}
		setPendingAction(null);
	}, [isProcessingAction]);

	const handleCloseFinanceEditModal = React.useCallback(() => {
		if (isSavingFinanceMovement) {
			return;
		}

		setEditingFinanceMovement(null);
		setEditInvestmentName('');
		setEditInvestmentInitialInput('');
		setEditInvestmentCdiInput('');
		setEditInvestmentTerm('anytime');
		setEditInvestmentBankId(null);
		setEditInvestmentDescription('');
	}, [isSavingFinanceMovement]);

	const handleTogglePeriodTimeline = React.useCallback(() => {
		setIsPeriodTimelineExpanded(previousState => !previousState);
	}, []);

	const handleToggleMovementCard = React.useCallback((movementId: string) => {
		setExpandedMovementIds(previousState =>
			previousState.includes(movementId)
				? previousState.filter(id => id !== movementId)
				: [...previousState, movementId],
		);
	}, []);

	const handleInvestmentInitialInputChange = React.useCallback((value: string) => {
		setEditInvestmentInitialInput(formatCurrencyInputValue(value).display);
	}, []);

	const handleOpenFinanceEditModal = React.useCallback((movement: MovementRecord) => {
		if (!movement.isFinanceInvestment || !movement.investmentId) {
			showScreenAlert('Não foi possível abrir a edição deste investimento.', 'warning');
			return;
		}

		setEditingFinanceMovement(movement);
		setEditInvestmentName(movement.name);
		setEditInvestmentInitialInput(formatCurrencyBRLBase(movement.valueInCents));
		setEditInvestmentCdiInput(
			typeof movement.investmentCdiPercentage === 'number'
				? movement.investmentCdiPercentage.toString()
				: '',
		);
		setEditInvestmentTerm(movement.investmentRedemptionTerm ?? 'anytime');
		setEditInvestmentBankId(movement.bankId ?? null);
		setEditInvestmentDescription(movement.explanation ?? '');
	}, [showScreenAlert]);

	const handleSubmitFinanceEdit = React.useCallback(async () => {
		if (!editingFinanceMovement?.investmentId || !editInvestmentBankId) {
			return;
		}

		const parsedInitialValueInCents = parseCurrencyInputToCents(editInvestmentInitialInput);
		const parsedCdi = parseStringToNumber(editInvestmentCdiInput);

		if (
			editInvestmentName.trim().length === 0 ||
			parsedInitialValueInCents === null ||
			parsedInitialValueInCents <= 0
		) {
			showScreenAlert('Informe um nome e um valor inicial válidos.', 'warning');
			return;
		}

		if (!Number.isFinite(parsedCdi) || parsedCdi <= 0) {
			showScreenAlert('Informe um CDI válido para editar.', 'warning');
			return;
		}

		setIsSavingFinanceMovement(true);
		try {
			const resolvedBankName =
				bankOptions.find((bankItem) => bankItem.id === editInvestmentBankId)?.name ?? null;
			const result = await updateFinanceInvestmentFirebase({
				investmentId: editingFinanceMovement.investmentId,
				name: editInvestmentName.trim(),
				initialValueInCents: parsedInitialValueInCents,
				cdiPercentage: parsedCdi,
				redemptionTerm: editInvestmentTerm,
				bankId: editInvestmentBankId,
				bankNameSnapshot: resolvedBankName,
				description: editInvestmentDescription.trim()
					? editInvestmentDescription.trim()
					: null,
			});

			if (!result.success) {
				throw new Error(
					typeof result.error === 'string'
						? result.error
						: 'Não foi possível salvar este investimento agora.',
				);
			}

			showScreenAlert('Investimento atualizado com sucesso!', 'success');
			navigateToHomeDashboard();
		} catch (error) {
			console.error('Erro ao editar investimento pela tela de movimentações:', error);
			showScreenAlert(
				error instanceof Error && error.message
					? error.message
					: 'Não foi possível salvar este investimento agora.',
				'error',
			);
		} finally {
			setIsSavingFinanceMovement(false);
		}
	}, [
		bankOptions,
		editInvestmentBankId,
		editInvestmentCdiInput,
		editInvestmentDescription,
		editInvestmentInitialInput,
		editInvestmentName,
		editInvestmentTerm,
		editingFinanceMovement,
		showScreenAlert,
	]);

	const handleRequestMovementAction = React.useCallback(
		(action: 'edit' | 'delete' | 'revert-cash-rescue', movement: MovementRecord) => {
			if (action === 'revert-cash-rescue') {
				setPendingAction({ type: 'revert-cash-rescue', movement });
				return;
			}

			if (movement.isFromMandatory) {
				showScreenAlert(
					action === 'edit'
						? movement.type === 'gain'
							? 'Este ganho pertence a um ganho obrigatório deste mês. Para alterar, use a tela de Ganhos obrigatórios.'
							: 'Esta despesa pertence a um gasto obrigatório deste mês. Para alterar, use a tela de Gastos obrigatórios.'
						: movement.type === 'gain'
							? 'Este ganho está vinculado a um ganho obrigatório deste mês. Use "Reivindicar" na tela de Ganhos obrigatórios para desfazer.'
							: 'Esta despesa está vinculada a um gasto obrigatório deste mês. Use "Reivindicar" na tela de Gastos obrigatórios para desfazer.',
					'warning',
				);
				return;
			}

			if (movement.isCashRescue) {
				showScreenAlert(
					action === 'edit'
						? 'Este lançamento representa um saque em dinheiro e não pode ser editado manualmente.'
						: 'Este lançamento representa um saque em dinheiro e não pode ser removido manualmente.',
					'warning',
				);
				return;
			}

			if (movement.isBankTransfer) {
				showScreenAlert(
					action === 'edit'
						? 'Transferências são registradas automaticamente e não podem ser editadas manualmente.'
						: 'Transferências não podem ser removidas manualmente para manter os saldos alinhados.',
					'warning',
				);
				return;
			}

			if (movement.isFinanceInvestment) {
				if (action === 'edit') {
					handleOpenFinanceEditModal(movement);
					return;
				}

				setPendingAction({ type: 'delete-finance-investment', movement });
				return;
			}

			if (movement.isFinanceInvestmentSync) {
				if (action === 'edit') {
					showScreenAlert('Sincronizações não são editadas. Use a ação de desfazer quando necessário.', 'warning');
					return;
				}

				setPendingAction({ type: 'revert-investment-sync', movement });
				return;
			}

			if (movement.isInvestmentDeposit) {
				if (action === 'edit') {
					showScreenAlert('Aportes de investimento não são editados. Desfaça a ação e registre novamente se necessário.', 'warning');
					return;
				}

				setPendingAction({ type: 'revert-investment-deposit', movement });
				return;
			}

			if (movement.isInvestmentRedemption) {
				if (action === 'edit') {
					showScreenAlert('Resgates de investimento não são editados. Desfaça a ação e registre novamente se necessário.', 'warning');
					return;
				}

				setPendingAction({ type: 'revert-investment-redemption', movement });
				return;
			}

			setPendingAction({
				type: action === 'edit' ? 'edit-standard-movement' : 'delete-standard-movement',
				movement,
			});
		},
		[handleOpenFinanceEditModal, showScreenAlert],
	);

	const handleConfirmAction = React.useCallback(async () => {
		if (!pendingAction) {
			return;
		}

		if (pendingAction.movement.isBankTransfer) {
			showScreenAlert(
				'Transferências entre bancos são criadas automaticamente e não podem ser editadas ou excluídas manualmente.',
				'warning',
			);
			setPendingAction(null);
			return;
		}

		if (pendingAction.type === 'edit-standard-movement') {
			const encodedId = encodeURIComponent(pendingAction.movement.id);
			if (pendingAction.movement.type === 'gain') {
				router.push({
					pathname: '/add-register-gain',
					params: { gainId: encodedId },
				});
			} else {
				router.push({
					pathname: '/add-register-expenses',
					params: { expenseId: encodedId },
				});
			}
			setPendingAction(null);
			return;
		}

		if (pendingAction.type === 'revert-cash-rescue') {
			setIsProcessingAction(true);
			try {
				const result = await deleteCashRescueFirebase(pendingAction.movement.id);
				if (!result.success) {
					showScreenAlert('Não foi possível reivindicar o saque. Tente novamente.', 'error');
					return;
				}

				showScreenAlert('Saque reivindicado e removido com sucesso!', 'success', 'Saque atualizado');
				await fetchMovements();
			} catch (error) {
				console.error('Erro ao reivindicar saque em dinheiro:', error);
				showScreenAlert('Erro inesperado ao reivindicar o saque.', 'error');
			} finally {
				setIsProcessingAction(false);
				setPendingAction(null);
			}
			return;
		}

		try {
			setIsProcessingAction(true);

			if (pendingAction.type === 'delete-standard-movement') {
				let result: { success: boolean; error?: unknown } | undefined;
				if (pendingAction.movement.type === 'gain') {
					result = await deleteGainFirebase(pendingAction.movement.id);
				} else {
					result = await deleteExpenseFirebase(pendingAction.movement.id);
				}

				if (!result?.success) {
					throw new Error('Não foi possível excluir a movimentação. Tente novamente.');
				}

				showScreenAlert('Movimentação excluída com sucesso!', 'success', 'Movimentação removida');
			}

			if (pendingAction.type === 'delete-finance-investment') {
				const investmentId = pendingAction.movement.investmentId ?? pendingAction.movement.id;
				const result = await deleteFinanceInvestmentFirebase(investmentId);

				if (!result.success) {
					throw new Error(
						typeof result.error === 'string'
							? result.error
							: 'Não foi possível excluir este investimento agora.',
					);
				}

				showScreenAlert('Investimento removido com sucesso!', 'success', 'Investimento removido');
			}

			if (pendingAction.type === 'revert-investment-deposit') {
				const result = await revertFinanceInvestmentDepositFirebase(pendingAction.movement.id);

				if (!result.success) {
					throw new Error(
						typeof result.error === 'string'
							? result.error
							: 'Não foi possível desfazer este aporte agora.',
					);
				}

				showScreenAlert('Aporte desfeito com sucesso!', 'success', 'Investimento atualizado');
			}

			if (pendingAction.type === 'revert-investment-redemption') {
				const result = await revertFinanceInvestmentRedemptionFirebase(pendingAction.movement.id);

				if (!result.success) {
					throw new Error(
						typeof result.error === 'string'
							? result.error
							: 'Não foi possível desfazer este resgate agora.',
					);
				}

				showScreenAlert('Resgate desfeito com sucesso!', 'success', 'Investimento atualizado');
			}

			if (pendingAction.type === 'revert-investment-sync') {
				const result = await revertFinanceInvestmentSyncFirebase(pendingAction.movement.id);

				if (!result.success) {
					throw new Error(
						typeof result.error === 'string'
							? result.error
							: 'Não foi possível desfazer esta sincronização agora.',
					);
				}

				showScreenAlert('Sincronização desfeita com sucesso!', 'success', 'Investimento atualizado');
			}

			await fetchMovements();
		} catch (error) {
			console.error('Erro ao processar ação da movimentação:', error);
			showScreenAlert(
				error instanceof Error && error.message
					? error.message
					: 'Erro inesperado ao processar esta movimentação.',
				'error',
			);
		} finally {
			setIsProcessingAction(false);
			setPendingAction(null);
		}
	}, [fetchMovements, pendingAction, showScreenAlert]);

	const actionModalCopy = React.useMemo(() => {
		if (!pendingAction) {
			return {
				title: '',
				message: '',
				confirmLabel: 'Confirmar',
				confirmAction: 'primary' as 'primary' | 'negative',
			};
		}

		const movementName = pendingAction.movement.name || 'movimentação selecionada';
		const movementTypeLabel = pendingAction.movement.isBankTransfer
			? 'transferência'
			: pendingAction.movement.type === 'sync'
				? 'sincronização'
			: pendingAction.movement.type === 'gain'
				? 'ganho'
				: 'despesa';

		if (pendingAction.type === 'edit-standard-movement') {
			return {
				title: 'Editar movimentação',
				message: `Deseja editar o ${movementTypeLabel} "${movementName}"?`,
				confirmLabel: 'Editar',
				confirmAction: 'primary' as const,
			};
		}

		if (pendingAction.type === 'revert-cash-rescue') {
			const bankName = pendingAction.movement.cashRescueSourceBankName ?? 'não identificado';
			return {
				title: 'Reivindicar saque',
				message: `Deseja reivindicar o saque realizado no banco ${bankName}?`,
				confirmLabel: 'Reivindicar',
				confirmAction: 'primary' as const,
			};
		}

		if (pendingAction.type === 'delete-finance-investment') {
			return {
				title: 'Excluir investimento',
				message: `Tem certeza de que deseja excluir o investimento "${movementName}"? Se existirem aportes ou resgates vinculados, a exclusão será bloqueada até você desfazer essas movimentações.`,
				confirmLabel: 'Excluir investimento',
				confirmAction: 'negative' as const,
			};
		}

		if (pendingAction.type === 'revert-investment-deposit') {
			return {
				title: 'Desfazer aporte',
				message: `Deseja desfazer o aporte "${movementName}"? O valor será removido do histórico e o saldo do investimento será ajustado automaticamente.`,
				confirmLabel: 'Desfazer aporte',
				confirmAction: 'primary' as const,
			};
		}

		if (pendingAction.type === 'revert-investment-redemption') {
			return {
				title: 'Desfazer resgate',
				message: `Deseja desfazer o resgate "${movementName}"? O valor será devolvido ao investimento e o lançamento será removido do histórico.`,
				confirmLabel: 'Desfazer resgate',
				confirmAction: 'primary' as const,
			};
		}

		if (pendingAction.type === 'revert-investment-sync') {
			return {
				title: 'Desfazer sincronização',
				message: `Deseja desfazer a sincronização "${movementName}"? O valor do investimento voltará ao estado anterior a esta conferência.`,
				confirmLabel: 'Desfazer sincronização',
				confirmAction: 'primary' as const,
			};
		}

		return {
			title: 'Excluir movimentação',
			message: `Tem certeza de que deseja excluir o ${movementTypeLabel} "${movementName}"? Essa ação não pode ser desfeita.`,
			confirmLabel: 'Excluir',
			confirmAction: 'negative' as const,
		};
	}, [pendingAction]);

	const isModalOpen = Boolean(pendingAction);
	const confirmButtonAction = actionModalCopy.confirmAction;
	const screenTitle = isCashView ? 'Movimentações em dinheiro' : `Movimentações do banco ${bankName}`;

	return (
		<SafeAreaView
			className="flex-1"
			edges={['left', 'right', 'bottom']}
			style={{ backgroundColor: surfaceBackground }}
		>
			<StatusBar
				translucent
				backgroundColor="transparent"
				barStyle={isDarkMode ? 'light-content' : 'dark-content'}
			/>
			<GestureHandlerRootView style={{ flex: 1, width: '100%', backgroundColor: surfaceBackground }}>
				<View className="flex-1" style={{ backgroundColor: surfaceBackground }}>
					<View className="flex-1" style={{ backgroundColor: surfaceBackground }}>
						<View
							className={`absolute top-0 left-0 right-0 ${cardBackground}`}
							style={{ height: heroHeight }}
						>
							<Image
								source={LoginWallpaper}
								alt="Background da tela de movimentações do banco"
								className="w-full h-full rounded-b-3xl absolute"
								resizeMode="cover"
							/>

							<VStack
								className="w-full h-full items-center justify-start px-6 gap-4"
								style={{ paddingTop: insets.top + 24 }}
							>
								<Heading size="xl" className="text-white text-center">
									{screenTitle}
								</Heading>
								<BankMovementsIllustration width="40%" height="40%" className="opacity-90" />
							</VStack>
						</View>

						<ScrollView
							keyboardShouldPersistTaps="handled"
							keyboardDismissMode="on-drag"
							className={`flex-1 rounded-t-3xl ${cardBackground} px-6 pb-1`}
							style={{ marginTop: heroHeight - 64 }}
							contentContainerStyle={{ paddingBottom: 32 }}
							refreshControl={
								<RefreshControl
									refreshing={isRefreshing}
									onRefresh={() => void fetchMovements(true)}
									tintColor="#FACC15"
								/>
							}
						>
							<VStack className="justify-between mt-4">

								<VStack className="mb-4">
									<BankCardSurface palette={summaryCardPalette}>
										<VStack className="flex-1 gap-5">
											<HStack className="items-start justify-between gap-4">
												<VStack className="flex-1 gap-1">
													<Text
														className="text-xs uppercase tracking-wide"
														style={{ color: summaryCardPalette.textSecondary }}
													>
														{isCashView ? 'Carteira' : 'Banco'}
													</Text>
													<Heading size="lg" style={{ color: summaryCardPalette.textPrimary }}>
														{bankName}
													</Heading>
												</VStack>

												<VStack className="items-end gap-1">
													<Text
														className="text-xs uppercase tracking-wide"
														style={{ color: summaryCardPalette.textSecondary }}
													>
														Período
													</Text>
													<Text
														className="text-xs font-medium text-right"
														style={{ color: summaryCardPalette.textPrimary }}
													>
														{startDateInput} a {endDateInput}
													</Text>
												</VStack>
											</HStack>

											<VStack className="gap-1">
												<Text
													className="text-xs uppercase tracking-wide"
													style={{ color: summaryCardPalette.textSecondary }}
												>
													{summaryPrimaryBalanceLabel}
												</Text>
												<Heading size="xl" style={{ color: summaryCardPalette.textPrimary }}>
													{summaryPrimaryBalanceValue}
												</Heading>
												<Text
													className="text-xs"
													style={{ color: summaryCardPalette.textSecondary }}
												>
													{summaryPrimaryBalanceHelper}
												</Text>
											</VStack>

											<View>
												<VStack className="gap-1">
													<HStack className="justify-between">
														<Text style={{ color: summaryCardPalette.textSecondary }}>Ganhos totais</Text>
														<Text
															className="font-semibold"
															style={{ color: summaryCardPalette.gainColor }}
														>
															{formatCurrencyBRL(allMovementsTotals.totalGains)}
														</Text>
													</HStack>
													<HStack className="justify-between">
														<Text style={{ color: summaryCardPalette.textSecondary }}>Despesas totais</Text>
														<Text
															className="font-semibold"
															style={{ color: summaryCardPalette.expenseColor }}
														>
															{formatCurrencyBRL(allMovementsTotals.totalExpenses)}
														</Text>
													</HStack>
													<HStack className="justify-between">
														<Text style={{ color: summaryCardPalette.textSecondary }}>
															Saldo geral do período
														</Text>
														<Text
															className="font-semibold"
															style={{ color: summaryCardPalette.textPrimary }}
														>
															{formatCurrencyBRL(allMovementsBalanceInCents)}
														</Text>
													</HStack>
												</VStack>
											</View>
										</VStack>
									</BankCardSurface>
								</VStack>

								<VStack className="mb-4">
									<Text className={`${bodyText} mb-1 ml-1 text-sm`}>Filtros do período</Text>
									<View className={`${fieldContainerCardClassName} px-4 py-4`}>
										<VStack className="gap-4">
											<HStack className="w-full gap-4">
												<VStack className="flex-1">
													<Text className={`${bodyText} mb-1 ml-1 text-sm`}>Data inicial</Text>
													<DatePickerField
														value={startDateInput}
														onChange={formatted => handleDateSelect(formatted, 'start')}
														triggerClassName={fieldContainerClassName}
														inputClassName={inputField}
														placeholder="Selecione a data inicial"
														isDisabled={isLoading}
													/>
												</VStack>

												<VStack className="flex-1">
													<Text className={`${bodyText} mb-1 ml-1 text-sm`}>Data final</Text>
													<DatePickerField
														value={endDateInput}
														onChange={formatted => handleDateSelect(formatted, 'end')}
														triggerClassName={fieldContainerClassName}
														inputClassName={inputField}
														placeholder="Selecione a data final"
														isDisabled={isLoading}
													/>
												</VStack>
											</HStack>
											<VStack>
												<Text className={`${bodyText} mb-1 ml-1 text-sm`}>
													Tipo de movimentação
												</Text>
												<HStack className="gap-2 justify-center">
													{movementFilterOptions.map(option => {
														const isSelected = movementFilter === option.value;
														const iconClassName = isSelected
															? movementFilterPalette.selectedIconClassName
															: movementFilterPalette.unselectedIconClassName;
														const textClassName = isSelected
															? movementFilterPalette.selectedTextClassName
															: movementFilterPalette.unselectedTextClassName;

														return (
															<TouchableOpacity
																key={option.value}
																onPress={() => setMovementFilter(option.value)}
																disabled={isLoading}
																activeOpacity={0.85}
																style={{
																	flex: 1,
																	maxWidth: 104,
																	height: 55,
																	borderRadius: 20,
																	alignItems: 'center',
																	justifyContent: 'center',
																	borderWidth: 1,
																	borderColor: isSelected
																		? movementFilterPalette.selectedBorder
																		: movementFilterPalette.unselectedBorder,
																	backgroundColor: isSelected
																		? movementFilterPalette.selectedBackground
																		: movementFilterPalette.unselectedBackground,
																	opacity: isLoading ? 0.45 : 1,
																}}
															>
																<VStack className="items-center gap-1">
																	<Icon as={option.icon} size="sm" className={iconClassName} />
																	<Text className={`text-xs font-medium ${textClassName}`}>
																		{option.label}
																	</Text>
																</VStack>
															</TouchableOpacity>
														);
													})}
												</HStack>
											</VStack>

											<VStack>
												<HStack className="items-center justify-between gap-3">
													<Text className={`${bodyText} mb-1 ml-1 text-sm`}>Tags</Text>
													<Text className={`${helperText} text-xs`}>
														{selectedTagFilterOption
															? `${selectedTagFilterOption.movementCount} item(ns)`
															: availableTagFilters.length === 0
																? 'Sem tags neste filtro'
																: `${availableTagFilters.length} tag(ns)`}
													</Text>
												</HStack>

												{availableTagFilters.length > 0 ? (
													<ScrollView
														horizontal
														showsHorizontalScrollIndicator={false}
														contentContainerStyle={{ paddingRight: 4 }}
													>
														<HStack className="gap-2">
															{[
																{
																	id: null,
																	label: 'Todas as tags',
																	icon: null,
																	movementCount: movementsMatchingMovementFilter.length,
																},
																...availableTagFilters,
															].map(option => {
																const isSelected = selectedTagFilterId === option.id;
																const iconColor = isSelected
																	? isDarkMode
																		? '#0F172A'
																		: '#FFFFFF'
																	: isDarkMode
																		? '#CBD5E1'
																		: '#475569';
																const labelColor = isSelected
																	? isDarkMode
																		? '#0F172A'
																		: '#FFFFFF'
																	: periodSummaryPalette.title;

																return (
																	<TouchableOpacity
																		key={option.id ?? 'all-tags'}
																		activeOpacity={0.85}
																		onPress={() => setSelectedTagFilterId(option.id)}
																		disabled={isLoading}
																		style={{
																			flexDirection: 'row',
																			alignItems: 'center',
																			gap: 8,
																			borderRadius: 999,
																			borderWidth: 1,
																			paddingHorizontal: 14,
																			paddingVertical: 10,
																			borderColor: isSelected
																				? movementFilterPalette.selectedBorder
																				: movementFilterPalette.unselectedBorder,
																			backgroundColor: isSelected
																				? movementFilterPalette.selectedBackground
																				: movementFilterPalette.unselectedBackground,
																			opacity: isLoading ? 0.45 : 1,
																		}}
																	>
																		{option.icon?.iconName ? (
																			<TagIcon
																				iconFamily={option.icon.iconFamily}
																				iconName={option.icon.iconName}
																				iconStyle={option.icon.iconStyle}
																				size={14}
																				color={iconColor}
																			/>
																		) : (
																			<TagsIcon size={14} color={iconColor} />
																		)}

																		<Text
																			numberOfLines={1}
																			style={{
																				maxWidth: 132,
																				color: labelColor,
																				fontSize: 12,
																				fontWeight: '600',
																			}}
																		>
																			{option.label}
																		</Text>

																		<View
																			style={{
																				minWidth: 24,
																				paddingHorizontal: 7,
																				paddingVertical: 2,
																				borderRadius: 999,
																				backgroundColor: isSelected
																					? 'rgba(15, 23, 42, 0.12)'
																					: isDarkMode
																						? 'rgba(148, 163, 184, 0.12)'
																						: '#E2E8F0',
																			}}
																		>
																			<Text
																				className="text-center text-[11px] font-semibold"
																				style={{
																					color: isSelected
																						? isDarkMode
																							? '#0F172A'
																							: '#FFFFFF'
																						: isDarkMode
																							? '#CBD5E1'
																							: '#475569',
																				}}
																			>
																				{option.movementCount}
																			</Text>
																		</View>
																	</TouchableOpacity>
																);
															})}
														</HStack>
													</ScrollView>
												) : (
													<View
														style={{
															borderRadius: 18,
															borderWidth: 1,
															borderColor: periodSummaryPalette.neutralBorder,
															paddingHorizontal: 14,
															paddingVertical: 12,
														}}
													>
														<Text className={`${helperText} text-xs`}>
															As tags disponíveis aparecem aqui conforme o tipo e o período carregados.
														</Text>
													</View>
												)}
											</VStack>

											<Button
												className={submitButtonClassName}
												onPress={() => {
													if (!isLoading) {
														void fetchMovements();
													}
												}}
												isDisabled={
													isLoading ||
													!parseDateFromBR(startDateInput) ||
													!parseDateFromBR(endDateInput)
												}
											>
												{isLoading ? (
													<>
														<ButtonSpinner />
														<ButtonText>Carregando movimentações</ButtonText>
													</>
												) : (
													<ButtonText>Buscar movimentações</ButtonText>
												)}
											</Button>
										</VStack>
									</View>
								</VStack>

								{errorMessage && (
									<View className={`${fieldContainerCardClassName} px-4 py-4 mb-4`}>
										<Text className="text-sm text-red-600 dark:text-red-400">{errorMessage}</Text>
									</View>
								)}

								<VStack className="mb-5">
									<VStack className="px-2 pb-3 gap-1">
										<Heading className="text-lg uppercase tracking-widest" size="lg">
											{filteredSummaryTitle}
										</Heading>
									</VStack>

									<HStack className="gap-3">
										<View
											style={{
												flex: 1,
												minHeight: 100,
												borderRadius: 24,
												borderWidth: 1,
												borderColor: periodSummaryPalette.neutralBorder,
												paddingHorizontal: 16,
												paddingVertical: 12,
											}}
										>
											<VStack className="flex-1 justify-between">
												<HStack className="items-center justify-between gap-2">
													<Text
														className="text-xs uppercase tracking-wide"
														style={{ color: periodSummaryPalette.subtitle }}
													>
														Ganhos
													</Text>
													<Icon as={ArrowUpIcon} size="sm" className="text-emerald-500" />
												</HStack>
												<Heading size="md" style={{ color: periodSummaryPalette.gainText }}>
													{formatCurrencyBRL(filteredTotals.totalGains)}
												</Heading>
											</VStack>
										</View>

										<View
											style={{
												flex: 1,
												minHeight: 100,
												borderRadius: 24,
												borderWidth: 1,
												borderColor: periodSummaryPalette.neutralBorder,
												paddingHorizontal: 16,
												paddingVertical: 12,
											}}
										>
											<VStack className="flex-1 justify-between">
												<HStack className="items-center justify-between gap-2">
													<Text
														className="text-xs uppercase tracking-wide"
														style={{ color: periodSummaryPalette.subtitle }}
													>
														Despesas
													</Text>
													<Icon as={ArrowDownIcon} size="sm" className="text-rose-500" />
												</HStack>
												<Heading size="md" style={{ color: periodSummaryPalette.expenseText }}>
													{formatCurrencyBRL(filteredTotals.totalExpenses)}
												</Heading>
											</VStack>
										</View>
									</HStack>

									<View
										style={{
											marginTop: 12,
											borderRadius: 24,
											borderWidth: 1,
											borderColor: periodSummaryPalette.neutralBorder,
											paddingHorizontal: 16,
											paddingVertical: 14,
										}}
									>
										<VStack className="gap-3">
											<HStack className="items-center justify-between gap-3">
												<VStack className="flex-1 gap-1">
													<Text
														className="text-xs uppercase tracking-wide"
														style={{ color: periodSummaryPalette.subtitle }}
													>
														Saldo do filtro
													</Text>
													<Heading
														size="sm"
														style={{
															color:
																filteredBalanceInCents >= 0
																	? periodSummaryPalette.gainText
																	: periodSummaryPalette.expenseText,
														}}
													>
														{formatCurrencyBRL(filteredBalanceInCents)}
													</Heading>
												</VStack>

												<VStack className="items-end gap-1">
													<Text
														className="text-xs uppercase tracking-wide"
														style={{ color: periodSummaryPalette.subtitle }}
													>
														Movimentações
													</Text>
													<Text
														style={{
															color: periodSummaryPalette.title,
															fontSize: 20,
															fontWeight: '700',
														}}
													>
														{visibleMovements.length}
													</Text>
												</VStack>
											</HStack>
										</VStack>
									</View>

									<Button
										className={`${submitButtonClassName} mt-4`}
										onPress={() => {
											void handleExportPeriodSummaryPdf();
										}}
										isDisabled={
											isLoading ||
											isExportingPdf ||
											!parseDateFromBR(startDateInput) ||
											!parseDateFromBR(endDateInput)
										}
									>
										{isExportingPdf ? (
											<>
												<ButtonSpinner />
												<ButtonText>Gerando PDF</ButtonText>
											</>
										) : (
											<>
												<Icon
													as={DownloadIcon}
													size="sm"
													className={isDarkMode ? 'text-slate-900' : 'text-white'}
												/>
												<ButtonText>Baixar resumo em PDF</ButtonText>
											</>
										)}
									</Button>
								</VStack>


								<VStack className="mb-4 mt-6">
									<HStack className="items-start justify-between gap-3">
										<TouchableOpacity
											activeOpacity={0.85}
											onPress={handleTogglePeriodTimeline}
											style={{ flex: 1 }}
										>
										
											<VStack className="px-2 pb-3">
												<HStack className="gap-1 items-center">
													<Heading
														className="text-lg uppercase tracking-widest "
														size="lg"
													>
														Movimentações do período
													</Heading>

													<Popover
														placement="bottom"
														size="md"
														offset={0}
														shouldFlip
														focusScope={false}
														trapFocus={false}
														trigger={triggerProps => (
															<Pressable
																{...triggerProps}
																hitSlop={8}
																accessibilityRole="button"
																accessibilityLabel="Informações sobre o formato de pagamento"
															>
																<Info
																	size={14}
																	color={isDarkMode ? '#94A3B8' : '#64748B'}
																	style={{ marginLeft: 4 }}
																/>
															</Pressable>
														)}
													>
														<PopoverBackdrop className="bg-transparent" />
														<PopoverContent className="max-w-[260px]" style={infoCardStyle}>
															<PopoverBody className="px-3 py-3">
																<Text className={`${bodyText} text-xs leading-5`}>
																	Exibimos aqui um resumo dos seus bancos e do dinheiro em espécie que você registrou. Toque em cada cartão para ver detalhes e movimentações específicas de cada um.
																	Se você não vê um banco ou valor que espera, verifique se eles estão registrados corretamente na seção de movimentações bancárias. Os dados aqui refletem o que foi registrado lá.
																</Text>
															</PopoverBody>
														</PopoverContent>
													</Popover>
												</HStack>
											</VStack>
										</TouchableOpacity>

										<TouchableOpacity
											activeOpacity={0.85}
											onPress={handleTogglePeriodTimeline}
											style={{
												minWidth: 28,
												paddingLeft: 8,
												paddingVertical: 4,
												alignItems: 'center',
												justifyContent: 'center',
												flexShrink: 0,
											}}
										>
											<Icon
												as={isPeriodTimelineExpanded ? ChevronUpIcon : ChevronDownIcon}
												size="sm"
												className={isDarkMode ? 'text-slate-400' : 'text-slate-500'}
											/>
										</TouchableOpacity>
									</HStack>

									{isPeriodTimelineExpanded ? (
										isLoading ? (
											<View
												style={{
													marginTop: 10,
													borderRadius: 18,
													borderWidth: 1,
													borderColor: timelinePalette.cardBorder,
													backgroundColor: timelinePalette.emptySurface,
													paddingHorizontal: 16,
													paddingVertical: 18,
												}}
											>
												<Text style={{ color: timelinePalette.subtitle }}>
													Carregando movimentações...
												</Text>
											</View>
										) : visibleMovements.length === 0 ? (
											<View
												style={{
													marginTop: 10,
													borderRadius: 18,
													borderWidth: 1,
													borderColor: timelinePalette.cardBorder,
													backgroundColor: timelinePalette.emptySurface,
													paddingHorizontal: 16,
													paddingVertical: 18,
												}}
											>
												<Text style={{ color: timelinePalette.subtitle }}>
													Nenhuma movimentação foi registrada para o período informado.
												</Text>
											</View>
										) : (
											<View style={{ marginTop: 14 }}>
												{visibleMovements.map((movement, index) => {
													const movementTone = getMovementTone(movement);
													const tagMetadata = movement.tagId ? tagMetadataById[movement.tagId] : null;
													const movementIcon =
														tagMetadata?.icon && tagMetadata.icon.iconName
															? tagMetadata.icon
															: getFallbackMovementIcon(movement);
													const isExpanded = expandedMovementIds.includes(movement.id);
													const counterpartyLabel = movement.isBankTransfer
														? movement.bankTransferDirection === 'outgoing'
															? movement.bankTransferTargetBankNameSnapshot ?? 'Banco de destino'
															: movement.bankTransferSourceBankNameSnapshot ?? 'Banco de origem'
														: null;
													const detailItems = [
														{
															label: 'Tipo',
															value: resolveMovementTypeLabel(movement),
														},
														{
															label: 'Data',
															value: formatMovementDate(movement.date),
														},
														{
															label: 'Tag',
															value:
																tagMetadata?.name ??
																(movement.tagId ? movement.tagId : 'Sem tag associada'),
														},
														{
															label: movement.moneyFormat || isCashView ? 'Origem' : 'Banco',
															value: getMovementPrimarySourceLabel(movement),
														},
													];
													const syncMetadataItems = movement.isFinanceInvestmentSync
														? [
															{
																label: 'Valor anterior',
																value:
																	typeof movement.investmentSyncPreviousValueInCents === 'number'
																		? formatCurrencyBRL(movement.investmentSyncPreviousValueInCents)
																		: 'Não disponível',
															},
															{
																label: 'Valor sincronizado',
																value: formatCurrencyBRL(movement.valueInCents),
															},
															{
																label: 'Variação',
																value: formatDeltaCurrencyBRL(
																	typeof movement.investmentSyncPreviousValueInCents === 'number'
																		? movement.valueInCents - movement.investmentSyncPreviousValueInCents
																		: null,
																),
															},
															{
																label: 'Motivo',
																value: getInvestmentSyncReasonLabel(movement.investmentSyncReason),
															},
														]
														: [];
													const investmentMetadataItems = movement.isFinanceInvestment
														? [
															{
																label: 'Prazo',
																value: movement.investmentRedemptionTerm
																	? redemptionTermLabels[movement.investmentRedemptionTerm]
																	: 'Não informado',
															},
															{
																label: 'CDI',
																value:
																	typeof movement.investmentCdiPercentage === 'number'
																		? `${movement.investmentCdiPercentage}%`
																		: 'Não informado',
															},
														]
														: [];
													const metadataItems = [
														...detailItems,
														...(counterpartyLabel
															? [{ label: 'Contraparte', value: counterpartyLabel }]
															: []),
														...investmentMetadataItems,
														...syncMetadataItems,
													];
													const canEditMovement = !(
														movement.isFromMandatory ||
														movement.isCashRescue ||
														movement.isBankTransfer ||
														movement.isInvestmentRedemption ||
														movement.isInvestmentDeposit ||
														movement.isFinanceInvestmentSync
													);
													const usesUndoAction =
														movement.isInvestmentDeposit ||
														movement.isInvestmentRedemption ||
														movement.isFinanceInvestmentSync;
													const canDeleteMovement = !(
														movement.isFromMandatory ||
														movement.isCashRescue ||
														movement.isBankTransfer
													);
													const secondaryActionLabel = movement.isInvestmentDeposit
														? 'Desfazer aporte'
														: movement.isInvestmentRedemption
															? 'Desfazer resgate'
															: movement.isFinanceInvestmentSync
																? 'Desfazer sync'
																: 'Excluir';
													const secondaryActionIcon = usesUndoAction ? RepeatIcon : TrashIcon;

													return (
														<View key={movement.id} style={{ flexDirection: 'row' }}>
															<View
																style={{
																	alignItems: 'center',
																	width: '7%',
																	paddingTop: 6,
																}}
															>
																<View
																	style={{
																		width: 14,
																		height: 14,
																		borderRadius: 999,
																		backgroundColor: movementTone.accentColor,
																		borderWidth: 2,
																		borderColor: isDarkMode ? '#020617' : '#FFFFFF',
																		shadowColor: movementTone.accentColor,
																		shadowOpacity: isDarkMode ? 0.26 : 0.14,
																		shadowRadius: 8,
																		shadowOffset: { width: 0, height: 4 },
																		elevation: 2,
																	}}
																/>
																{index < visibleMovements.length - 1 ? (
																	<View
																		style={{
																			flex: 1,
																			width: 3,
																			borderRadius: 999,
																			marginVertical: 2,
																			backgroundColor: movementTone.lineColor,
																		}}
																	/>
																) : (
																	<View />
																)}
															</View>

															<View style={{ width: '93%', paddingBottom: 14 }}>
																<TouchableOpacity
																	activeOpacity={0.85}
																	onPress={() => handleToggleMovementCard(movement.id)}
																	style={{ width: '100%' }}
																>
																	<HStack className="items-center justify-between gap-3">
																		<HStack className="items-center gap-3" style={{ flex: 1 }}>
																			<LinearGradient
																				colors={movementTone.iconGradient}
																				start={{ x: 0, y: 0 }}
																				end={{ x: 1, y: 1 }}
																				style={{
																					width: 44,
																					height: 44,
																					borderRadius: 16,
																					alignItems: 'center',
																					justifyContent: 'center',
																					flexShrink: 0,
																				}}
																			>
																				<TagIcon
																					iconFamily={movementIcon.iconFamily}
																					iconName={movementIcon.iconName}
																					iconStyle={movementIcon.iconStyle}
																					size={18}
																					color="#FFFFFF"
																				/>
																			</LinearGradient>

																			<View style={{ flex: 1 }}>
																				<Text
																					numberOfLines={1}
																					style={{
																						color: timelinePalette.title,
																						fontSize: 15,
																						fontWeight: '700',
																					}}
																				>
																					{movement.name}
																				</Text>
																				<Text
																					numberOfLines={1}
																					style={{
																						marginTop: 2,
																						color: timelinePalette.subtitle,
																						fontSize: 12,
																						lineHeight: 18,
																					}}
																				>
																					{getMovementSummarySubtitle(movement)}
																				</Text>
																			</View>
																		</HStack>

																		<HStack className="items-center gap-2">
																			<VStack className="items-end">
																				<Text
																					style={{
																						color: movementTone.amountColor,
																						fontSize: 15,
																						fontWeight: '700',
																					}}
																				>
																					{formatSignedCurrencyBRL(movement)}
																				</Text>
																				{movement.isFinanceInvestmentSync ? (
																					<Text
																						style={{
																							marginTop: 2,
																							color: timelinePalette.subtitle,
																							fontSize: 11,
																						}}
																					>
																						{formatDeltaCurrencyBRL(
																							typeof movement.investmentSyncPreviousValueInCents === 'number'
																								? movement.valueInCents - movement.investmentSyncPreviousValueInCents
																								: null,
																						)}
																					</Text>
																				) : null}
																				<HStack className="mt-1 items-center gap-1">
																					<Icon
																						as={CalendarDaysIcon}
																						size="xs"
																						className={
																							isDarkMode
																								? 'text-slate-500'
																								: 'text-slate-400'
																						}
																					/>
																					<Text
																						style={{
																							color: timelinePalette.subtitle,
																							fontSize: 11,
																						}}
																					>
																						{formatMovementCompactDate(movement.date)}
																					</Text>
																				</HStack>
																			</VStack>

																			<Icon
																				as={isExpanded ? ChevronUpIcon : ChevronDownIcon}
																				size="sm"
																				className={isDarkMode ? 'text-slate-400' : 'text-slate-500'}
																			/>
																		</HStack>
																	</HStack>
																</TouchableOpacity>

																{isExpanded ? (
																	<LinearGradient
																		colors={movementTone.cardGradient}
																		start={{ x: 0, y: 0 }}
																		end={{ x: 1, y: 1 }}
																		style={{
																			marginTop: 10,
																			marginRight: 16,
																			borderRadius: 20,
																			paddingHorizontal: 16,
																			paddingVertical: 14,
																		}}
																	>
																		<VStack className="gap-3">
																			<HStack className="items-start justify-between gap-4">
																				<VStack className="flex-1">
																					<Text
																						style={{
																							fontSize: 10,
																							fontWeight: '700',
																							letterSpacing: 0.4,
																							color: 'rgba(255,255,255,0.74)',
																							textTransform: 'uppercase',
																						}}
																					>
																						Resumo
																					</Text>
																					<Text
																						style={{
																							fontSize: 13,
																							lineHeight: 19,
																							color: '#FFFFFF',
																						}}
																					>
																						{getMovementDetailMessage(movement)}
																					</Text>
																				</VStack>

																				<VStack className="items-end">
																					<Text
																						style={{
																							fontSize: 10,
																							fontWeight: '700',
																							letterSpacing: 0.4,
																							color: 'rgba(255,255,255,0.74)',
																							textTransform: 'uppercase',
																						}}
																					>
																						Valor
																					</Text>
																					<Heading size="sm" style={{ color: '#FFFFFF' }}>
																						{formatSignedCurrencyBRL(movement)}
																					</Heading>
																				</VStack>
																			</HStack>

																			<View
																				style={{
																					flexDirection: 'row',
																					flexWrap: 'wrap',
																					columnGap: 14,
																					rowGap: 10,
																				}}
																			>
																				{metadataItems.map(item => (
																					<View
																						key={`${movement.id}-${item.label}`}
																						style={{
																							width: '46%',
																							minWidth: 128,
																						}}
																					>
																						<Text
																							style={{
																								fontSize: 10,
																								fontWeight: '700',
																								letterSpacing: 0.4,
																								color: 'rgba(255,255,255,0.72)',
																								textTransform: 'uppercase',
																							}}
																						>
																							{item.label}
																						</Text>
																						<Text
																							style={{
																								marginTop: 3,
																								fontSize: 13,
																								lineHeight: 18,
																								color: '#FFFFFF',
																							}}
																						>
																							{item.value}
																						</Text>
																					</View>
																				))}
																			</View>

																			{movement.explanation?.trim() &&
																				getMovementDetailMessage(movement) !== movement.explanation.trim() ? (
																				<View
																					style={{
																						paddingTop: 2,
																					}}
																				>
																					<Text
																						style={{
																							fontSize: 10,
																							fontWeight: '700',
																							letterSpacing: 0.4,
																							color: 'rgba(255,255,255,0.72)',
																							textTransform: 'uppercase',
																						}}
																					>
																						Descrição
																					</Text>
																					<Text
																						style={{
																							marginTop: 6,
																							fontSize: 13,
																							lineHeight: 18,
																							color: '#FFFFFF',
																						}}
																					>
																						{movement.explanation.trim()}
																					</Text>
																				</View>
																			) : null}

																			<HStack
																				className="flex-wrap gap-4"
																				style={{
																					paddingTop: 2,
																				}}
																			>
																				{canEditMovement ? (
																					<TouchableOpacity
																						activeOpacity={0.85}
																						onPress={() => handleRequestMovementAction('edit', movement)}
																						style={{
																							flexDirection: 'row',
																							alignItems: 'center',
																							gap: 8,
																							paddingVertical: 8,
																						}}
																					>
																						<Icon as={EditIcon} size="sm" className="text-white" />
																						<Text className="text-xs font-semibold text-white">Editar</Text>
																					</TouchableOpacity>
																				) : null}

																				{movement.isCashRescue ? (
																					<TouchableOpacity
																						activeOpacity={0.85}
																						onPress={() =>
																							handleRequestMovementAction(
																								'revert-cash-rescue',
																								movement,
																							)
																						}
																						style={{
																							flexDirection: 'row',
																							alignItems: 'center',
																							gap: 8,
																							paddingVertical: 8,
																						}}
																					>
																						<Icon as={RepeatIcon} size="sm" className="text-white" />
																						<Text className="text-xs font-semibold text-white">
																							Reivindicar
																						</Text>
																					</TouchableOpacity>
																				) : null}

																				<TouchableOpacity
																					activeOpacity={0.85}
																					onPress={() => handleRequestMovementAction('delete', movement)}
																					style={{
																						flexDirection: 'row',
																						alignItems: 'center',
																						gap: 8,
																						paddingVertical: 8,
																						opacity:
																							usesUndoAction || canDeleteMovement ? 1 : 0.72,
																					}}
																				>
																					<Icon as={secondaryActionIcon} size="sm" className="text-white" />
																					<Text className="text-xs font-semibold text-white">
																						{secondaryActionLabel}
																					</Text>
																				</TouchableOpacity>
																			</HStack>
																		</VStack>
																	</LinearGradient>
																) : null}
															</View>
														</View>
													);
												})}
											</View>
										)
									) : null}
								</VStack>
							</VStack>
						</ScrollView>
					</View>

					<View
						style={{
							marginHorizontal: -18,
							paddingBottom: 0,
							flexShrink: 0,
						}}
					>
						<Navigator defaultValue={0} onHardwareBack={handleBackToHome} />
					</View>

					<Modal
						isOpen={Boolean(editingFinanceMovement)}
						onClose={handleCloseFinanceEditModal}
					>
						<ModalBackdrop />
						<KeyboardAvoidingView
							behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
							keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
						>
							<ModalContent className={`max-w-[380px] ${modalContentClassName}`}>
								<ModalHeader>
									<ModalTitle>Editar investimento</ModalTitle>
									<ModalCloseButton onPress={handleCloseFinanceEditModal} />
								</ModalHeader>
								<ModalBody>
									<ScrollView
										keyboardShouldPersistTaps="handled"
										keyboardDismissMode="on-drag"
										contentContainerStyle={{ paddingBottom: 24 }}
									>
										<Text className={`${bodyText} mb-4 text-sm`}>
											Ajuste os dados do investimento sem sair da tela de movimentações.
										</Text>
										<VStack>
									<VStack className="mb-4">
										<Text className={`${bodyText} mb-1 ml-1 text-sm`}>
											Nome do investimento
										</Text>
										<Input
											className={fieldContainerClassName}
											isDisabled={isSavingFinanceMovement}
										>
											<InputField
												value={editInvestmentName}
												onChangeText={setEditInvestmentName}
												placeholder="Digite o nome do investimento"
												className={inputField}
											/>
										</Input>
									</VStack>

									<VStack className="mb-4">
										<Text className={`${bodyText} mb-1 ml-1 text-sm`}>
											Valor inicial
										</Text>
										<Input
											className={fieldContainerClassName}
											isDisabled={isSavingFinanceMovement}
										>
											<InputField
												value={editInvestmentInitialInput}
												onChangeText={handleInvestmentInitialInputChange}
												placeholder="Digite o valor inicial"
												keyboardType="numeric"
												className={inputField}
											/>
										</Input>
									</VStack>

									<VStack className="mb-4">
										<Text className={`${bodyText} mb-1 ml-1 text-sm`}>
											CDI (%)
										</Text>
										<Input
											className={fieldContainerClassName}
											isDisabled={isSavingFinanceMovement}
										>
											<InputField
												value={editInvestmentCdiInput}
												onChangeText={(text) =>
													setEditInvestmentCdiInput(sanitizeNumberInput(text))
												}
												placeholder="Digite o percentual do CDI"
												keyboardType="decimal-pad"
												className={inputField}
											/>
										</Input>
									</VStack>

									<VStack className="mb-4">
										<Text className={`${bodyText} mb-1 ml-1 text-sm`}>
											Prazo de resgate
										</Text>
										<Select
											selectedValue={editInvestmentTerm}
											onValueChange={(value) =>
												setEditInvestmentTerm(value as RedemptionTerm)
											}
											isDisabled={isSavingFinanceMovement}
										>
											<SelectTrigger
												variant="outline"
												size="md"
												className={fieldContainerClassName}
											>
												<SelectInput
													value={redemptionTermLabels[editInvestmentTerm]}
													className={inputField}
												/>
												<SelectIcon />
											</SelectTrigger>
											<SelectPortal>
												<SelectBackdrop />
												<SelectContent>
													<SelectDragIndicatorWrapper>
														<SelectDragIndicator />
													</SelectDragIndicatorWrapper>
													{redemptionOptions.map((option) => (
														<SelectItem
															key={option.value}
															label={option.label}
															value={option.value}
														/>
													))}
												</SelectContent>
											</SelectPortal>
										</Select>
									</VStack>

									<VStack className="mb-4">
										<Text className={`${bodyText} mb-1 ml-1 text-sm`}>
											Banco
										</Text>
										<Select
											selectedValue={editInvestmentBankId ?? undefined}
											onValueChange={(value) => setEditInvestmentBankId(value)}
											isDisabled={
												isSavingFinanceMovement || bankOptions.length === 0
											}
										>
											<SelectTrigger
												variant="outline"
												size="md"
												className={fieldContainerClassName}
											>
												<SelectInput
													placeholder="Selecione o banco"
													value={
														editInvestmentBankId
															? (bankOptions.find(
																(bankItem) => bankItem.id === editInvestmentBankId,
															)?.name ?? '')
															: ''
													}
													className={inputField}
												/>
												<SelectIcon />
											</SelectTrigger>
											<SelectPortal>
												<SelectBackdrop />
												<SelectContent>
													<SelectDragIndicatorWrapper>
														<SelectDragIndicator />
													</SelectDragIndicatorWrapper>
													{bankOptions.length > 0 ? (
														bankOptions.map((bankItem) => (
															<SelectItem
																key={bankItem.id}
																label={bankItem.name}
																value={bankItem.id}
															/>
														))
													) : (
														<SelectItem
															label="Nenhum banco disponível"
															value="no-bank"
															isDisabled
														/>
													)}
												</SelectContent>
											</SelectPortal>
										</Select>
									</VStack>

									<VStack className="mb-1">
										<Text className={`${bodyText} mb-1 ml-1 text-sm`}>
											Descrição
										</Text>
										<Textarea
											className={textareaContainerClassName}
											isDisabled={isSavingFinanceMovement}
										>
											<TextareaInput
												value={editInvestmentDescription}
												onChangeText={setEditInvestmentDescription}
												placeholder="Adicione um contexto para este investimento"
												className={inputField}
											/>
										</Textarea>
									</VStack>
										</VStack>
									</ScrollView>
								</ModalBody>
								<ModalFooter className="gap-3">
									<Button
										variant="outline"
										onPress={handleCloseFinanceEditModal}
										isDisabled={isSavingFinanceMovement}
										className={submitButtonCancelClassName}
									>
										<ButtonText>Cancelar</ButtonText>
									</Button>
									<Button
										onPress={handleSubmitFinanceEdit}
										isDisabled={isSavingFinanceMovement}
										className={submitButtonClassName}
									>
										{isSavingFinanceMovement ? (
											<>
												<ButtonSpinner />
												<ButtonText>Salvando</ButtonText>
											</>
										) : (
											<ButtonText>Salvar alterações</ButtonText>
										)}
									</Button>
								</ModalFooter>
							</ModalContent>
						</KeyboardAvoidingView>
					</Modal>

					<Modal isOpen={isModalOpen} onClose={handleCloseActionModal}>
						<ModalBackdrop />
						<ModalContent className={`max-w-[360px] ${modalContentClassName}`}>
							<ModalHeader>
								<ModalTitle>{actionModalCopy.title}</ModalTitle>
								<ModalCloseButton onPress={handleCloseActionModal} />
							</ModalHeader>
							<ModalBody>
								<Text className={bodyText}>{actionModalCopy.message}</Text>
							</ModalBody>
							<ModalFooter className="gap-3">
								<Button
									variant="outline"
									onPress={handleCloseActionModal}
									isDisabled={isProcessingAction}
									className={submitButtonCancelClassName}
								>
									<ButtonText>Cancelar</ButtonText>
								</Button>
								<Button
									variant="solid"
									action={confirmButtonAction}
									onPress={handleConfirmAction}
									isDisabled={isProcessingAction}
									className={submitButtonClassName}
								>
									{isProcessingAction ? (
										<>
											<ButtonSpinner />
											<ButtonText>Processando</ButtonText>
										</>
									) : (
										<ButtonText>{actionModalCopy.confirmLabel}</ButtonText>
									)}
								</Button>
							</ModalFooter>
						</ModalContent>
					</Modal>
				</View>
			</GestureHandlerRootView>
		</SafeAreaView>
	);
}
