import { hasAmbiguousMovementIds, isIncomeOrExpenseTotal } from '@/domain/movements';
import { sumCents } from '@/domain/money';
import { useBankAccounts } from '@/contexts/BankAccountsContext';
import { useMovementList } from '@/hooks/useMovementList';
import { showFeatureUnavailable } from '@/components/app/feature-unavailable';

import type { MovementRecord } from '@/types/bankMovements';
import { useSession } from '@/hooks/useSession';

import type { RecentMovementsProps } from '@/components/uiverse/banks/recent-movements-types';
import React from 'react';

import { LUMUS_BALANCE_ADJUSTMENT_TONE } from '@/design-system/tokens';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams } from 'expo-router';
import {
KeyboardAvoidingView,
Platform,
Pressable,
RefreshControl,
ScrollView,
StatusBar,
TouchableOpacity,
View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';

// Componentes de UI
import { Button,ButtonSpinner,ButtonText } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { HStack } from '@/components/ui/hstack';
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
import { Image } from '@/components/ui/image';
import { Input,InputField } from '@/components/ui/input';
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
import { Popover,PopoverBackdrop,PopoverBody,PopoverContent } from '@/components/ui/popover';
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
import { Text } from '@/components/ui/text';
import { Textarea,TextareaInput } from '@/components/ui/textarea';
import { VStack } from '@/components/ui/vstack';

import { showNotifierAlert } from '@/components/uiverse/feedback/notifier-alert';
import Navigator from '@/components/uiverse/navigation/navigator';

import LoginWallpaper from '@/assets/Background/wallpaper01.png';
import { HIDDEN_VALUE_PLACEHOLDER,useValueVisibility } from '@/contexts/ValueVisibilityContext';

import BankActionsheetSelector,{ type BankActionsheetOption } from '@/components/uiverse/banks/bank-actionsheet-selector';
import {
CASH_CARD_COLOR,
buildBankCardPalette,
} from '@/components/uiverse/banks/bank-card-surface';
import DatePickerField from '@/components/uiverse/shared/date-picker';

import { LUMUS_FORM_CLASS_NAMES } from '@/design-system/tokens';
import { useBankMovementsRequest } from '@/hooks/useBankMovementsRequest';
import { useScreenStyles } from '@/hooks/useScreenStyle';
import type { TagIconSelection } from '@/hooks/useTagIcons';
import { TagIcon } from '@/hooks/useTagIcons';
import { RedemptionTerm,redemptionTermLabels } from '@/utils/finance';
import { APP_ROUTE_PATHS, navigateToHomeDashboard, navigateToRoute } from '@/utils/navigation';
import { buildPdfFileName } from '@/utils/pdfFileName';
import { exportHtmlReport } from '@/utils/reportExport';
import { Info,Tags as TagsIcon } from 'lucide-react-native';

// Importação do SVG de ilustração
import BankMovementsIllustration from '../../assets/UnDraw/bankMovementsScreen.svg';

type PendingMovementAction =
	| { type: 'reverse-movement'; movement: MovementRecord }
	| { type: 'reverse-adjustment'; movement: MovementRecord }
	| { type: 'reverse-pair'; movement: MovementRecord }
	| { type: 'revert-balance-adjustment'; movement: MovementRecord; clientActionId: string }
	| { type: 'edit-standard-movement'; movement: MovementRecord }
	| { type: 'delete-standard-movement'; movement: MovementRecord }
	| { type: 'delete-finance-investment'; movement: MovementRecord }
	| { type: 'revert-cash-rescue'; movement: MovementRecord }
	| { type: 'revert-investment-deposit'; movement: MovementRecord }
	| { type: 'revert-investment-redemption'; movement: MovementRecord }
	| { type: 'revert-investment-sync'; movement: MovementRecord };

type MovementFilter = 'all' | 'expense' | 'gain';
type TimelineMovementToneKey =
	| 'balanceAdjustment'
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

type BankOption = BankActionsheetOption;

const MOVEMENT_FILTER_ACCENT = '#facc15';

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

const sanitizeNumberInput = (value: string) => value.replace(/[^\d.,]/g, '');

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

const getMovementMonthBounds = (focusDate?: string | string[]) => {
	const now = parseDateFromBR(Array.isArray(focusDate) ? focusDate[0] : focusDate ?? '') ?? new Date();
	const start = new Date(now.getFullYear(), now.getMonth(), 1);
	const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
	return {
		start,
		end,
	};
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

const MANDATORY_EXPENSE_TONE: TimelineMovementTone = {
	accentColor: '#EF4444',
	amountColor: '#EF4444',
	lineColor: 'rgba(239, 68, 68, 0.28)',
	iconGradient: ['#B91C1C', '#EF4444'],
	cardGradient: ['#7F1D1D', '#EF4444'],
};

const TIMELINE_MOVEMENT_TONES: Record<TimelineMovementToneKey, TimelineMovementTone> = {
	balanceAdjustment: LUMUS_BALANCE_ADJUSTMENT_TONE,
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
	mandatoryExpense: MANDATORY_EXPENSE_TONE,
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
	if (movement.isBalanceAdjustment) return 'balanceAdjustment';
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

export default function BankMovementsScreen({ recentMovements }: { recentMovements?: RecentMovementsProps } = {}) {
	const { user } = useSession();
	const {
		isDarkMode,
		surfaceBackground,
		cardBackground,
		bodyText,
		helperText,
		inputField,
		fieldBankContainerClassName,
		fieldContainerClassName,
		fieldContainerCardClassName,
		textareaContainerClassName,
		submitButtonClassName,
		submitButtonCancelClassName,
		heroHeight,
		insets,
		infoCardStyle,
		modalContentClassName,
		webDashboardClassNames,
	} = useScreenStyles();
	const searchParams = useLocalSearchParams<{
		bankId?: string | string[];
		bankName?: string | string[];
		cashView?: string | string[];
		focusDate?: string | string[];
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

	const routeBankName = React.useMemo(() => {
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

	const accountStore = useBankAccounts();
	const bankOptions: BankOption[] = accountStore.active.items.filter(item => !item.blocked).map(item => ({ id: item.id, name: item.name, iconKey: item.institutionKey, colorHex: item.colorHex, description: item.source !== 'new' ? item.issue : undefined }));
	const isLoadingBankOptions = accountStore.active.loading && !accountStore.active.items.length;
	const [selectedBankId, setSelectedBankId] = React.useState(bankId);
	const selectedBankOption = React.useMemo(
		() => bankOptions.find(option => option.id === selectedBankId) ?? null,
		[bankOptions, selectedBankId],
	);
	const activeBankId = selectedBankId;
	const bankName = isCashView ? 'Transações em dinheiro' : selectedBankOption?.name ?? routeBankName;

	React.useEffect(() => {
		setSelectedBankId(bankId);
	}, [bankId]);

	const { start, end } = React.useMemo(() => getMovementMonthBounds(searchParams.focusDate), [searchParams.focusDate]);

	const [startDateInput, setStartDateInput] = React.useState(formatDateToBR(start));
	const [endDateInput, setEndDateInput] = React.useState(formatDateToBR(end));
	React.useEffect(() => {
		setStartDateInput(formatDateToBR(start)); setEndDateInput(formatDateToBR(end));
	}, [start, end]);

	const [isExportingPdf, setIsExportingPdf] = React.useState(false);
	const movementList = useMovementList(selectedBankId, startDateInput, endDateInput, !isCashView && !recentMovements);
	const bankCurrentBalanceInCents = accountStore.active.items.find(item => item.source === 'new' && item.id === selectedBankId)?.balanceInCents ?? null;
	const isRefreshing = movementList.loading;
	const canUseMovementFilters = isCashView || Boolean(activeBankId);

	const movements: MovementRecord[] = recentMovements?.items ?? movementList.items;
	const isLoading = recentMovements?.loading ?? movementList.loading;
	const isMovementFilterDisabled = !canUseMovementFilters || isLoading || isRefreshing;
	const errorMessage = recentMovements?.error ?? movementList.error;
	const [pendingAction, setPendingAction] = React.useState<PendingMovementAction | null>(null);
	const [isProcessingAction, setIsProcessingAction] = React.useState(false);
	const { shouldHideValues } = useValueVisibility();
	const [movementFilter, setMovementFilter] = React.useState<MovementFilter>('all');
	const [selectedTagFilterId, setSelectedTagFilterId] = React.useState<string | null>(null);
	const [monthlyInitialBalanceInCents, setMonthlyInitialBalanceInCents] = React.useState<number | null>(null);

	const [bankAccentColorHex] = React.useState<string | null>(
		isCashView ? CASH_CARD_COLOR : null,
	);
	const [isPeriodTimelineExpanded, setIsPeriodTimelineExpanded] = React.useState(true);
	const [expandedMovementIds, setExpandedMovementIds] = React.useState<string[]>([]);
	const [tagMetadataById, setTagMetadataById] = React.useState<Record<string, MovementTagMetadata>>({});
	React.useEffect(() => {
		const metadata: Record<string, MovementTagMetadata> = {};
		for (const item of movements) if (item.tagId) metadata[item.tagId] = { name: item.tagName ?? null, icon: { iconFamily: item.tagIconFamily ?? null, iconName: item.tagIconName ?? null, iconStyle: item.tagIconStyle ?? null } as TagIconSelection };
		setTagMetadataById(metadata);
	}, [movements]);
	const [editingFinanceMovement, setEditingFinanceMovement] = React.useState<MovementRecord | null>(null);
	const [editInvestmentName, setEditInvestmentName] = React.useState('');
	const [editInvestmentInitialInput, setEditInvestmentInitialInput] = React.useState('');
	const [editInvestmentCdiInput, setEditInvestmentCdiInput] = React.useState('');
	const [editInvestmentTerm, setEditInvestmentTerm] = React.useState<RedemptionTerm>('anytime');
	const [editInvestmentBankId, setEditInvestmentBankId] = React.useState<string | null>(null);
	const [editInvestmentDescription, setEditInvestmentDescription] = React.useState('');
	const [isSavingFinanceMovement] = React.useState(false);

	const { personId, cancelRequest } = useBankMovementsRequest(
		JSON.stringify([activeBankId, isCashView, startDateInput, endDateInput]),
	);
	React.useEffect(() => {
		setPendingAction(null);
		setEditingFinanceMovement(null);
	}, [personId]);

	React.useEffect(() => {
		if (recentMovements?.loading || recentMovements?.error) {
			setPendingAction(null);
			setEditingFinanceMovement(null);
		}
	}, [recentMovements?.loading, recentMovements?.error]);

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
			if (isLoading || isRefreshing || errorMessage || !canUseMovementFilters) return '—';
			if (shouldHideValues) {
				return HIDDEN_VALUE_PLACEHOLDER;
			}
			return formatCurrencyBRLBase(valueInCents);
		},
		[shouldHideValues, isLoading, isRefreshing, errorMessage, canUseMovementFilters],
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
		if (movement.isBalanceAdjustment) return movement.reversesAdjustmentId ? 'Estorno de ajuste de saldo' : 'Ajuste de saldo';
		if (movement.isCashRescue) return 'Saque em dinheiro';
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
		if (movement.isFromMandatory) return movement.type === 'gain' ? 'Receita obrigatória' : 'Despesa obrigatória';
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
			selectedBackground: MOVEMENT_FILTER_ACCENT,
			selectedBorder: MOVEMENT_FILTER_ACCENT,
			selectedIconClassName: 'text-white',
			selectedTextClassName: 'text-white',
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
		(movement: MovementRecord) => {
			const tone = TIMELINE_MOVEMENT_TONES[resolveTimelineMovementToneKey(movement)];
			return movement.isBalanceAdjustment ? { ...tone, amountColor: tone.iconGradient[isDarkMode ? 1 : 0] } : tone;
		},
		[isDarkMode],
	);

	const getFallbackMovementIcon = React.useCallback((movement: MovementRecord): TagIconSelection => {
		if (movement.isBalanceAdjustment) return { iconFamily: 'ionicons', iconName: 'options-outline' };
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
				return `Saque do banco ${movement.cashRescueSourceBankName ?? movement.bankName ?? bankName}`;
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
			if (movement.isBalanceAdjustment) return movement.reversesAdjustmentId ? 'Este estorno cancela a diferença do ajuste original e preserva seu histórico.' : 'Diferença registrada para alinhar o saldo real do banco ao Lumus. Este valor não entra nos totais de ganhos ou gastos.';
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
				return movement.investmentBankNameSnapshot?.trim() || movement.bankName || bankName;
			}

			if (movement.isCashRescue) {
				return movement.cashRescueSourceBankName ?? movement.bankName ?? bankName;
			}

			if (movement.moneyFormat || isCashView) {
				return 'Dinheiro em espécie';
			}

			if (movement.investmentBankNameSnapshot?.trim()) {
				return movement.investmentBankNameSnapshot.trim();
			}

			return movement.bankName?.trim() || bankName;
		},
		[bankName, isCashView],
	);

	const getMovementTagLabel = React.useCallback(
		(movement: MovementRecord) => {
			if (!movement.tagId) {
				return 'Sem categoria associada';
			}

			return tagMetadataById[movement.tagId]?.name?.trim() || movement.tagId;
		},
		[tagMetadataById],
	);

	const handleDateSelect = React.useCallback(
		(formatted: string, type: 'start' | 'end') => {
			if (isMovementFilterDisabled) {
				return;
			}

			if (type === 'start') {
				setStartDateInput(formatted);
			} else {
				setEndDateInput(formatted);
			}
		},
		[isMovementFilterDisabled],
	);

	const handleMovementFilterSelect = React.useCallback(
		(value: MovementFilter) => {
			if (isMovementFilterDisabled) {
				return;
			}

			setMovementFilter(value);
		},
		[isMovementFilterDisabled],
	);

	const handleSelectBank = React.useCallback((bank: BankActionsheetOption) => {
		if (bank.id === activeBankId) {
			return;
		}

		setSelectedBankId(bank.id);
		setSelectedTagFilterId(null);
		setExpandedMovementIds([]);
		setMonthlyInitialBalanceInCents(null);
	}, [activeBankId]);

	const fetchMovements = React.useCallback(async (_asRefresh = false) => { await movementList.refresh(); }, [movementList.refresh]);

	// Busca a cor do banco selecionado para compor a paleta do resumo exportado em PDF.

	const movementsMatchingMovementFilter = React.useMemo(() => {
		if (movementFilter === 'all') {
			return movements;
		}
		return movements.filter(movement => (movement.type) === movementFilter && !movement.isBalanceAdjustment);
	}, [movementFilter, movements]);

	// Mantém o filtro de categorias alinhado às próprias movimentações carregadas, conforme [[Gerenciamento de Tags]].
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
		const visibleIds = new Set(visibleMovements.map(movement => `${movement.type}:${movement.storageSource ?? 'legacy'}:${movement.id}`));
		setExpandedMovementIds(previousState => previousState.filter(id => visibleIds.has(id)));
	}, [visibleMovements]);

	// Separa os totais fixos do banco dos totais filtrados do período, seguindo [[Gerenciamento de Bancos]].
	const sumMovements = (items: MovementRecord[]) => {
		try {
			const totalGains = sumCents(items.filter(item => item.type === 'gain' && isIncomeOrExpenseTotal(item)).map(item => item.valueInCents));
			const totalExpenses = sumCents(items.filter(item => item.type === 'expense' && isIncomeOrExpenseTotal(item)).map(item => item.valueInCents));
			sumCents([totalGains, -totalExpenses]);
			return { totalGains, totalExpenses, valid: true };
		} catch { return { totalGains: 0, totalExpenses: 0, valid: false }; }
	};
	const allMovementsTotals = sumMovements(movements);
	const filteredTotals = sumMovements(visibleMovements);
	const formatPeriodTotal = (amount: number) => !allMovementsTotals.valid || !filteredTotals.valid || hasAmbiguousMovementIds(movements) || (!recentMovements && (movementList.loading || movementList.error || movementList.cursor || movementList.issues > 0)) ? '—' : formatCurrencyBRL(amount);
	const allMovementsBalanceInCents = allMovementsTotals.totalGains - allMovementsTotals.totalExpenses;
	const filteredBalanceInCents = filteredTotals.totalGains - filteredTotals.totalExpenses;

	const summaryCardPalette = React.useMemo(
		() => buildBankCardPalette(isCashView ? CASH_CARD_COLOR : bankAccentColorHex, isDarkMode),
		[bankAccentColorHex, isCashView, isDarkMode],
	);

	const summaryPrimaryBalanceLabel = isCashView ? 'Saldo do período' : 'Saldo atual';
	const summaryPrimaryBalanceInCents = isCashView ? allMovementsBalanceInCents : bankCurrentBalanceInCents;
	const summaryPrimaryBalanceValueClassName = typeof summaryPrimaryBalanceInCents === 'number'
		? summaryPrimaryBalanceInCents >= 0
			? 'text-emerald-500'
			: 'text-red-500'
		: 'text-typography-600';

	const summaryPrimaryBalanceValue = React.useMemo(() => {
		if (isLoading || isRefreshing) return 'Carregando…';
		if (errorMessage || !canUseMovementFilters) return 'Saldo indisponível';
		if (isCashView) {
			return formatPeriodTotal(allMovementsBalanceInCents);
		}

		if (typeof bankCurrentBalanceInCents === 'number') {
			return formatCurrencyBRL(bankCurrentBalanceInCents);
		}

		return 'Saldo indisponível';
	}, [allMovementsBalanceInCents, bankCurrentBalanceInCents, formatCurrencyBRL, isCashView, isLoading, isRefreshing, errorMessage, canUseMovementFilters]);

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
			return `${movementCountLabel} Filtro ativo: ${movementFilter === 'gain' ? 'ganhos' : 'gastos'} com a categoria ${selectedTagFilterOption.label}.`;
		}

		if (selectedTagFilterOption) {
			return `${movementCountLabel} Filtro ativo: categoria ${selectedTagFilterOption.label}.`;
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
		if (isMovementFilterDisabled || isExportingPdf || errorMessage) {
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
			? `Categoria: ${selectedTagFilterOption.label}`
			: 'Todas as categorias';
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
				value: formatPeriodTotal(allMovementsTotals.totalGains),
				tone: 'gain',
			},
			{
				label: 'Despesas totais',
				value: formatPeriodTotal(allMovementsTotals.totalExpenses),
				tone: 'expense',
			},
			{
				label: 'Saldo geral',
				value: formatPeriodTotal(allMovementsBalanceInCents),
				tone: allMovementsBalanceInCents >= 0 ? 'gain' : 'expense',
			},
			{
				label: 'Movimentações carregadas',
				value: String(movements.length),
				helper: 'Antes dos filtros de tipo e categoria.',
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
				value: formatPeriodTotal(filteredTotals.totalGains),
				tone: 'gain',
			},
			{
				label: 'Despesas filtradas',
				value: formatPeriodTotal(filteredTotals.totalExpenses),
				tone: 'expense',
			},
			{
				label: 'Saldo do filtro',
				value: formatPeriodTotal(filteredBalanceInCents),
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
			const pdfFileName = buildPdfFileName([
				isCashView ? 'Movimentos Dinheiro' : 'Movimentos Banco',
				bankName,
				startDateInput,
				endDateInput,
			]);
			const exportResult = await exportHtmlReport({
				html: pdfHtml,
				fileName: pdfFileName,
				dialogTitle: `Baixar resumo de ${bankName}`,
			});

			if (exportResult.status === 'popup-blocked') {
				showScreenAlert(
					'O navegador bloqueou a nova aba do relatório. Permita pop-ups para este site e tente novamente.',
					'error',
					'Permita pop-ups',
				);
				return;
			}

			if (exportResult.status === 'printed') {
				showScreenAlert(
					'O resumo foi aberto para impressão. Use a opção de salvar como PDF.',
					'info',
					'Resumo pronto',
				);
				return;
			}

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
		errorMessage,
		isMovementFilterDisabled,
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

	const handleSubmitFinanceEdit = React.useCallback(async () => { showFeatureUnavailable(); }, []);

	const handleRequestMovementAction = React.useCallback(
		async (action: 'edit' | 'delete' | 'revert-cash-rescue', movement: MovementRecord) => {
			if (action === 'revert-cash-rescue' || movement.type === 'sync') { showFeatureUnavailable(); return; }
			setPendingAction({ type: action === 'edit' ? 'edit-standard-movement' : 'delete-standard-movement', movement });
		}, [],
	);

	const handleConfirmAction = React.useCallback(async () => {
		if (!pendingAction || isProcessingAction) return;
		const movement = pendingAction.movement;
		if (pendingAction.type === 'edit-standard-movement') {
			setPendingAction(null);
			if (movement.type === 'gain') navigateToRoute(APP_ROUTE_PATHS.addRegisterGain, { gainId: movement.id });
			else if (movement.type === 'expense') navigateToRoute(APP_ROUTE_PATHS.addRegisterExpenses, { expenseId: movement.id });
			return;
		}
		if (pendingAction.type !== 'delete-standard-movement') { showFeatureUnavailable(); return; }
		setIsProcessingAction(true);
		try { await movementList.cancel(movement.id); setPendingAction(null); showScreenAlert('Movimentação removida.', 'success'); }
		catch { showScreenAlert('Não foi possível remover a movimentação. Tente novamente.'); }
		finally { setIsProcessingAction(false); }
	}, [pendingAction, isProcessingAction, movementList.cancel, showScreenAlert]);

	const actionModalCopy = React.useMemo(() => {
		if (!pendingAction) {
			return {
				title: '',
				message: '',
				confirmLabel: 'Confirmar',
				confirmAction: 'primary' as 'primary' | 'negative',
			};
		}

		if (pendingAction.type === 'reverse-adjustment') return { title: 'Estornar ajuste de saldo', message: 'A diferença será compensada na data efetiva do ajuste. Uma abertura posterior continua prevalecendo. O histórico será preservado.', confirmLabel: 'Estornar', confirmAction: 'primary' as const };
		if (pendingAction.type === 'reverse-pair') return { title: 'Estornar movimentação entre contas', message: 'As duas contas serão compensadas no momento da confirmação. O histórico original será preservado.', confirmLabel: 'Estornar', confirmAction: 'primary' as const };
		if (pendingAction.type === 'reverse-movement') return { title: 'Estornar lançamento', message: 'O valor será compensado na data de hoje. O lançamento original e seu histórico serão preservados.', confirmLabel: 'Estornar', confirmAction: 'primary' as const };
		if (pendingAction.type === 'revert-balance-adjustment') return { title: 'Reverter ajuste de saldo', message: 'A diferença deste ajuste será cancelada por um estorno. As demais movimentações e o histórico serão mantidos.', confirmLabel: 'Reverter ajuste', confirmAction: 'primary' as const };
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
	const screenTitle = isCashView
		? 'Movimentações em dinheiro'
		: activeBankId
			? `Movimentações do banco ${bankName}`
			: 'Movimentações bancárias';

	const timelineContent = (
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
								className={webDashboardClassNames.sectionHeadingText}
								size="lg"
							>
								{recentMovements ? 'Últimas Movimentações' : 'Movimentações do período'}
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
										accessibilityLabel="Informações sobre movimentações"
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
											Consulte os lançamentos de bancos e dinheiro, incluindo ganhos, despesas, transferências, investimentos e ajustes. Toque em cada movimento para ver seus detalhes e as ações disponíveis.
										{recentMovements ? 'A Home mostra os seis movimentos mais recentes. Abra uma conta para consultar o extrato completo por período.' : 'Os movimentos seguem o período e os filtros selecionados.'}
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

			{isPeriodTimelineExpanded && (recentMovements?.cashIncomplete ?? movementList.cashIncomplete) ? <Text className={helperText}>Alguns saques não puderam ser exibidos. Consulte um período menor no extrato.</Text> : null}
			{isPeriodTimelineExpanded && recentMovements?.incomplete ? <Text className={helperText}>Algumas movimentações não foram carregadas. Consulte o extrato.</Text> : null}
			{isPeriodTimelineExpanded ? (
				isLoading ? (
					<View
						style={{
							marginTop: 10,
							borderRadius: 18,
							borderWidth: 1,
							borderColor: timelinePalette.cardBorder,
							paddingHorizontal: 16,
							paddingVertical: 18,
						}}
					>
						<Text style={{ color: timelinePalette.subtitle }}>
							Carregando movimentações...
						</Text>
					</View>
				) : errorMessage ? (
					<View className="gap-3 py-4">
						<Text className="text-lumus-error">{errorMessage}</Text>
						<Button variant="outline" onPress={() => void fetchMovements()}>
							<ButtonText>Tentar novamente</ButtonText>
						</Button>
					</View>
				) : visibleMovements.length === 0 ? (
					<View
						style={{
							marginTop: 10,
							paddingHorizontal: 8,
							paddingVertical: 18,
						}}
					>
						<Text style={{ color: timelinePalette.subtitle }}>
							{!recentMovements && movementList.cursor ? 'Há mais movimentações para consultar.' : 'Nenhuma movimentação foi registrada para o período informado.'}
						</Text>
						{!recentMovements && movementList.cursor ? (
							<Button variant="outline" onPress={() => void movementList.loadMore()}><ButtonText>Carregar mais</ButtonText></Button>
						) : null}
					</View>
				) : (
					<View style={{ marginTop: 14 }}>
						{visibleMovements.map((movement, index) => {
							const movementTone = getMovementTone(movement);
							const tagMetadata = recentMovements
								? { name: movement.tagName, icon: { iconFamily: movement.tagIconFamily, iconName: movement.tagIconName, iconStyle: movement.tagIconStyle } }
								: movement.tagId ? tagMetadataById[movement.tagId] : null;
							const movementIcon =
								tagMetadata?.icon && tagMetadata.icon.iconName
									? tagMetadata.icon
									: getFallbackMovementIcon(movement);
							const movementKey = `${movement.type}:${movement.storageSource ?? 'legacy'}:${movement.id}`;
							const isExpanded = expandedMovementIds.includes(movementKey);
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
									label: 'Categoria',
									value:
										tagMetadata?.name ??
										(movement.tagId ? movement.tagId : 'Sem categoria associada'),
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
								...(movement.isBalanceAdjustment && typeof movement.adjustmentPreviousBalanceInCents === 'number' ? [{ label: 'Saldo anterior', value: formatCurrencyBRL(movement.adjustmentPreviousBalanceInCents ?? 0) }, { label: 'Saldo informado', value: formatCurrencyBRL(movement.adjustmentTargetBalanceInCents ?? 0) }] : []),
								...(counterpartyLabel
									? [{ label: 'Contraparte', value: counterpartyLabel }]
									: []),
								...investmentMetadataItems,
								...syncMetadataItems,
							];
							const canChangeAdjustment = !movement.isBalanceAdjustment || (movement.adjustmentStatus === 'active' && !movement.reversesAdjustmentId && movement.personId === user?.uid);
							const canChangeAdjustmentRecord = false;
							const canChangeMovementRecord = false;
							const canReverseAccountPair = false;
							const canEditMovement = !recentMovements && movement.storageSource === 'new' && movementList.items.some(item => item.id === movement.id && item.storageSource === 'new');
							const usesUndoAction = canChangeMovementRecord || canChangeAdjustmentRecord || canReverseAccountPair || movement.isBalanceAdjustment ||
								movement.isInvestmentDeposit ||
								movement.isInvestmentRedemption ||
								movement.isFinanceInvestmentSync;
							const canDeleteMovement = canEditMovement;
							const secondaryActionLabel = canChangeMovementRecord || canChangeAdjustmentRecord || canReverseAccountPair ? 'Estornar' : movement.isBalanceAdjustment ? 'Reverter ajuste' : movement.isInvestmentDeposit
								? 'Desfazer aporte'
								: movement.isInvestmentRedemption
									? 'Desfazer resgate'
									: movement.isFinanceInvestmentSync
										? 'Desfazer sync'
										: 'Excluir';
							const secondaryActionIcon = usesUndoAction ? RepeatIcon : TrashIcon;

							return (
								<View key={movementKey} style={{ flexDirection: 'row' }}>
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
											onPress={() => handleToggleMovementCard(movementKey)}
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

																				{movement.isCashRescue && canChangeMovementRecord ? (
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

																				{canDeleteMovement ? (
															<TouchableOpacity
																activeOpacity={0.85}
																disabled={!canChangeAdjustment}
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
																				) : null}
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
	);
	const movementDialogs = (
		<>
			<Modal
				isOpen={Boolean(editingFinanceMovement)}
				onClose={handleCloseFinanceEditModal}
			>
				<ModalBackdrop />
				<KeyboardAvoidingView className="min-h-0 max-h-full w-full shrink items-center"
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
										<Text className={LUMUS_FORM_CLASS_NAMES.label}>
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
										<Text className={LUMUS_FORM_CLASS_NAMES.label}>
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
										<Text className={LUMUS_FORM_CLASS_NAMES.label}>
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
										<Text className={LUMUS_FORM_CLASS_NAMES.label}>
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
										<Text className={LUMUS_FORM_CLASS_NAMES.label}>
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
										<Text className={LUMUS_FORM_CLASS_NAMES.label}>
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
		</>
	);
	if(recentMovements) return <>{timelineContent}{movementDialogs}</>;

	return (
		<SafeAreaView
			className="flex-1"
			edges={['left', 'right', 'bottom']}
			style={{ backgroundColor: surfaceBackground }}
		>
			<StatusBar
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
							scrollEventThrottle={400}
							onScroll={({ nativeEvent }) => {
								if (nativeEvent.layoutMeasurement.height + nativeEvent.contentOffset.y >= nativeEvent.contentSize.height - 160) void movementList.loadMore();
							}}
							keyboardShouldPersistTaps="handled"
							keyboardDismissMode="on-drag"
							className={`flex-1 rounded-t-3xl ${cardBackground} px-6 pb-1 ${webDashboardClassNames.webSheet}`}
							style={{
								marginTop: heroHeight - 64,
							}}
							contentContainerStyle={{ paddingBottom: 32 }}
							refreshControl={
								<RefreshControl
									refreshing={isRefreshing}
									onRefresh={() => void fetchMovements(true)}
									tintColor="#FACC15"
								/>
							}
						>
							<VStack className={`justify-between mt-4 ${webDashboardClassNames.webContentFrame} ${webDashboardClassNames.webContentPadding}`}>


								<VStack className="mb-4">
									<View>
										<VStack className="gap-4">
											{!isCashView ? (
												<VStack className="mb-1">
													<Text className={LUMUS_FORM_CLASS_NAMES.label}>Banco</Text>
													<BankActionsheetSelector
														options={bankOptions}
														selectedId={activeBankId || null}
														selectedLabel={activeBankId ? bankName : null}
														selectedOption={selectedBankOption}
														onSelect={handleSelectBank}
														onEndReached={() => void accountStore.load('active', true)}
														isDisabled={isLoadingBankOptions || isLoading || isRefreshing}
														isDarkMode={isDarkMode}
														bodyTextClassName={bodyText}
														helperTextClassName={helperText}
														triggerClassName={fieldBankContainerClassName}
														placeholder="Escolha o banco para consultar"
														sheetTitle="Escolher banco"
														emptyMessage="Nenhum banco ativo está disponível. Cadastre um banco para consultar movimentos."
														triggerHint="Selecione a conta que deseja consultar."
														disabledHint={
															isLoadingBankOptions ? 'Carregando bancos...' : 'Aguarde o carregamento das movimentações.'
														}
														accessibilityLabel="Escolher banco para consultar movimentações"
													/>
												</VStack>
											) : null}
											<HStack className="w-full gap-4">
												<VStack className="flex-1">
													<Text className={LUMUS_FORM_CLASS_NAMES.label}>Data inicial</Text>
													<DatePickerField
														value={startDateInput}
														onChange={formatted => handleDateSelect(formatted, 'start')}
														triggerClassName={fieldContainerClassName}
														inputClassName={inputField}
														placeholder="Selecione a data inicial"
														isDisabled={isMovementFilterDisabled}
													/>
												</VStack>

												<VStack className="flex-1">
													<Text className={LUMUS_FORM_CLASS_NAMES.label}>Data final</Text>
													<DatePickerField
														value={endDateInput}
														onChange={formatted => handleDateSelect(formatted, 'end')}
														triggerClassName={fieldContainerClassName}
														inputClassName={inputField}
														placeholder="Selecione a data final"
														isDisabled={isMovementFilterDisabled}
													/>
												</VStack>
											</HStack>
											<VStack>
												<Text className={LUMUS_FORM_CLASS_NAMES.label}>
													Tipo de movimentação
												</Text>
												<HStack className="w-full gap-1">
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
																onPress={() => handleMovementFilterSelect(option.value)}
																disabled={isMovementFilterDisabled}
																accessibilityRole="tab"
																accessibilityLabel={option.label}
																accessibilityState={{ selected: isSelected, disabled: isMovementFilterDisabled }}
																activeOpacity={0.85}
																style={{
																	flex: 1,
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
																	opacity: isMovementFilterDisabled ? 0.45 : 1,
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
												<HStack className="mb-2 ml-1 items-center justify-between gap-3">
													<Text className={LUMUS_FORM_CLASS_NAMES.inlineLabel}>Categorias</Text>
													<Text className={`${helperText} text-xs`}>
														{selectedTagFilterOption
															? `${selectedTagFilterOption.movementCount} item(ns)`
															: availableTagFilters.length === 0
																? 'Sem categorias neste filtro'
																: `${availableTagFilters.length} categoria(s)`}
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
																	label: 'Todas as categorias',
																	icon: null,
																	movementCount: movementsMatchingMovementFilter.length,
																},
																...availableTagFilters,
															].map(option => {
																const isSelected = selectedTagFilterId === option.id;
																const iconColor = isSelected
																	? '#FFFFFF'
																	: isDarkMode
																		? '#CBD5E1'
																		: '#475569';
																const labelColor = isSelected
																	? '#FFFFFF'
																	: periodSummaryPalette.title;

																return (
																	<TouchableOpacity
																		key={option.id ?? 'all-categories'}
																		activeOpacity={0.85}
																		onPress={() => {
																			if (!isMovementFilterDisabled) {
																				setSelectedTagFilterId(option.id);
																			}
																		}}
																		disabled={isMovementFilterDisabled}
																		accessibilityRole="button"
																		accessibilityLabel={`Filtrar por ${option.label}`}
																		accessibilityState={{ selected: isSelected, disabled: isMovementFilterDisabled }}
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
																			opacity: isMovementFilterDisabled ? 0.45 : 1,
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
																						? '#FFFFFF'
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
															As categorias disponíveis aparecem aqui conforme o tipo e o período carregados.
														</Text>
													</View>
												)}
											</VStack>

										</VStack>

									</View>
								</VStack>

								{errorMessage && (
									<View className={`${fieldContainerCardClassName} px-4 py-4 mb-4`}>
										<Text accessibilityLiveRegion="polite" className="text-sm text-red-600 dark:text-red-400">{errorMessage}</Text>
										<Button className="mt-3 min-h-touch rounded-control lumus-focus" action="primary" onPress={() => void fetchMovements()}>
											<ButtonText className="text-lumus-on-accent">Tentar novamente</ButtonText>
										</Button>
									</View>
								)}

								<VStack className="mb-5">
									<VStack className="px-2 pb-3 gap-1">
										<Heading className="text-lg uppercase tracking-widest" size="lg">
											{filteredSummaryTitle}
										</Heading>
									</VStack>

									<View accessibilityLiveRegion="polite"
										style={{
											flex: 1,
											minHeight: 100,
											borderRadius: 24,
											borderWidth: 1,
											borderColor: periodSummaryPalette.neutralBorder,
											paddingHorizontal: 16,
											paddingVertical: 12,
										}}
										className="mb-3 min-h-24 rounded-section px-4 py-3"
									>
										<VStack className="flex-1 justify-between">
											<Text className="text-xs uppercase tracking-wide" style={{ color: periodSummaryPalette.subtitle }}>
												{summaryPrimaryBalanceLabel}
											</Text>
											<Heading size="md" className={`tabular-nums ${summaryPrimaryBalanceValueClassName}`}>
												{summaryPrimaryBalanceValue}
											</Heading>
										</VStack>
									</View>

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
													{formatPeriodTotal(filteredTotals.totalGains)}
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
													{formatPeriodTotal(filteredTotals.totalExpenses)}
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
														{formatPeriodTotal(filteredBalanceInCents)}
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
										style={{
											backgroundColor: MOVEMENT_FILTER_ACCENT,
											borderColor: MOVEMENT_FILTER_ACCENT,
										}}
										onPress={() => {
											void handleExportPeriodSummaryPdf();
										}}
										isDisabled={
											isMovementFilterDisabled ||
											Boolean(errorMessage) || isExportingPdf ||
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
													className="text-white"
												/>
												<ButtonText>Baixar resumo em PDF</ButtonText>
											</>
										)}
									</Button>
								</VStack>

								{timelineContent}
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

					{movementDialogs}
				</View>
			</GestureHandlerRootView>
		</SafeAreaView>
	);
}
