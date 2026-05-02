import React from 'react';
import {
	Pressable,
	RefreshControl,
	ScrollView,
	StatusBar,
	TouchableOpacity,
	View,
	useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { PieChart } from 'react-native-gifted-charts';
import { Activity, BarChart3, Download, Info, TrendingDown, TrendingUp, WalletCards } from 'lucide-react-native';

import { auth } from '@/FirebaseConfig';
import Navigator from '@/components/uiverse/navigator';
import TagActionsheetSelector, { type TagActionsheetOption } from '@/components/uiverse/tag-actionsheet-selector';
import { Button, ButtonSpinner, ButtonText } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { HStack } from '@/components/ui/hstack';
import { Image } from '@/components/ui/image';
import { Popover, PopoverBackdrop, PopoverBody, PopoverContent } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { HIDDEN_VALUE_PLACEHOLDER, useValueVisibility } from '@/contexts/ValueVisibilityContext';
import {
	type CategoryAnalysisBankBreakdown,
	type CategoryAnalysisData,
	type CategoryAnalysisMetric,
	type CategoryAnalysisMovementType,
	type CategoryAnalysisReport,
	type CategoryAnalysisStatus,
	type CategoryAnalysisTagOption,
	getCategoryAnalysisFirebase,
} from '@/functions/CategoryAnalysisFirebase';
import { TagIcon, type TagIconSelection } from '@/hooks/useTagIcons';
import { useScreenStyles } from '@/hooks/useScreenStyle';
import { showNotifierAlert } from '@/components/uiverse/notifier-alert';
import {
	type CategoryAnalysisPdfMetric,
	buildCategoryAnalysisPdfHtml,
} from '@/utils/categoryAnalysisPdf';
import { buildPdfFileName, copyPdfToNamedCacheFile } from '@/utils/pdfFileName';

import LoginWallpaper from '@/assets/Background/wallpaper01.png';
import CategoryAnalysisIllustration from '../assets/UnDraw/analyzeGainExpensesTag.svg';

const BANK_PIE_COLORS = ['#FACC15', '#22C55E', '#38BDF8', '#F97316', '#A855F7', '#EF4444'];
const CASH_BREAKDOWN_COLOR = '#22C55E';
const DEFAULT_BREAKDOWN_COLOR = '#64748B';
const ANALYSIS_BASELINE_MONTHS = 3;

const formatCurrencyBRLBase = (valueInCents: number) =>
	new Intl.NumberFormat('pt-BR', {
		style: 'currency',
		currency: 'BRL',
		minimumFractionDigits: 2,
	}).format(valueInCents / 100);

const formatCompactMonthDate = (value: Date | null) => {
	if (!value) {
		return 'Sem data';
	}

	return new Intl.DateTimeFormat('pt-BR', {
		day: '2-digit',
		month: 'short',
	}).format(value);
};

const getMovementTypeLabel = (type: CategoryAnalysisMovementType) =>
	type === 'expense' ? 'Gastos' : 'Ganhos';

const getMovementTypeSingularLabel = (type: CategoryAnalysisMovementType) =>
	type === 'expense' ? 'gasto' : 'ganho';

const getStatusLabel = (status: CategoryAnalysisStatus) => {
	if (status === 'above') {
		return 'Acima da média';
	}

	if (status === 'below') {
		return 'Abaixo da média';
	}

	if (status === 'stable') {
		return 'Dentro da média';
	}

	return 'Sem histórico';
};

const getTagFallbackIcon = (type: CategoryAnalysisMovementType): TagIconSelection =>
	type === 'expense'
		? { iconFamily: 'ionicons', iconName: 'trending-down-outline' }
		: { iconFamily: 'ionicons', iconName: 'trending-up-outline' };

const getInitialTypeForTag = (tag: CategoryAnalysisTagOption | null | undefined): CategoryAnalysisMovementType => {
	if (!tag) {
		return 'expense';
	}

	if (tag.usageType === 'gain') {
		return 'gain';
	}

	if (tag.usageType === 'expense') {
		return 'expense';
	}

	return tag.currentGainInCents > tag.currentExpenseInCents ? 'gain' : 'expense';
};

const getCategoryKindLabel = (tag: CategoryAnalysisTagOption | null | undefined) => {
	if (!tag) {
		return 'Categoria';
	}

	if (tag.isMandatoryExpense && tag.isMandatoryGain) {
		return 'Despesa obrigatória e ganho obrigatório';
	}

	if (tag.isMandatoryExpense) {
		return 'Despesa obrigatória';
	}

	if (tag.isMandatoryGain) {
		return 'Ganho obrigatório';
	}

	if (tag.usageType === 'expense') {
		return 'Despesa';
	}

	if (tag.usageType === 'gain') {
		return 'Ganho';
	}

	if (tag.usageType === 'both') {
		return 'Despesa e ganho';
	}

	return 'Categoria';
};

const toTagActionsheetOption = (tag: CategoryAnalysisTagOption): TagActionsheetOption => ({
	id: tag.id,
	name: tag.name,
	description: getCategoryKindLabel(tag),
	iconFamily: tag.icon?.iconFamily ?? null,
	iconName: tag.icon?.iconName ?? null,
	iconStyle: tag.icon?.iconStyle ?? null,
});

const buildInsightMessage = ({
	metric,
	type,
	tagName,
	baselineMonthCount,
}: {
	metric: CategoryAnalysisMetric;
	type: CategoryAnalysisMovementType;
	tagName: string;
	baselineMonthCount: number;
}) => {
	const typeLabel = getMovementTypeSingularLabel(type);
	const percent = typeof metric.deltaPercent === 'number'
		? `${Math.abs(metric.deltaPercent).toLocaleString('pt-BR', {
			minimumFractionDigits: 1,
			maximumFractionDigits: 1,
		})}%`
		: null;

	if (metric.status === 'above' && percent) {
		return `Seu ${typeLabel} com ${tagName} está ${percent} maior que a média dos últimos ${baselineMonthCount} meses.`;
	}

	if (metric.status === 'below' && percent) {
		return `Seu ${typeLabel} com ${tagName} está ${percent} menor que a média dos últimos ${baselineMonthCount} meses.`;
	}

	if (metric.status === 'stable') {
		return `Seu ${typeLabel} com ${tagName} ficou próximo da média dos últimos ${baselineMonthCount} meses.`;
	}

	if (metric.currentInCents > 0) {
		return `Este mês já existe movimentação em ${tagName}, mas ainda não há média histórica suficiente para comparar.`;
	}

	return `Ainda não há movimentação recente em ${tagName} para gerar uma comparação confiável.`;
};

const formatMetricPercentLabel = (metric: CategoryAnalysisMetric) => {
	if (typeof metric.deltaPercent !== 'number') {
		return 'Sem histórico para percentual';
	}

	const formattedPercent = `${Math.abs(metric.deltaPercent).toLocaleString('pt-BR', {
		minimumFractionDigits: 1,
		maximumFractionDigits: 1,
	})}%`;

	if (metric.status === 'stable') {
		return `${formattedPercent} de variação`;
	}

	return metric.deltaInCents > 0
		? `${formattedPercent} acima da média`
		: `${formattedPercent} abaixo da média`;
};

const formatBreakdownShareLabel = (
	item: CategoryAnalysisBankBreakdown,
	itemValue: number,
	totalInCents: number,
	sourceCount: number,
) => {
	if (sourceCount <= 1) {
		return item.movementCount === 1 ? 'Fonte única no mês' : `${item.movementCount} movimentos no mês`;
	}

	const itemPercent = totalInCents > 0 ? (itemValue / totalInCents) * 100 : 0;
	const formattedPercent = itemPercent.toLocaleString('pt-BR', {
		minimumFractionDigits: 1,
		maximumFractionDigits: 1,
	});

	return `${formattedPercent}% do total`;
};

const formatGeneratedAtLabel = (value: Date) =>
	new Intl.DateTimeFormat('pt-BR', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	}).format(value);

const formatMovementDateLabel = (value: Date | null) => {
	if (!value) {
		return 'Sem data';
	}

	return new Intl.DateTimeFormat('pt-BR', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	}).format(value);
};

const CategoryAnalysisSkeleton = () => (
	<VStack className="gap-5">
		<Skeleton className="h-12 w-full rounded-2xl" />
		<Skeleton className="h-40 w-full rounded-3xl" />
		<HStack className="gap-3">
			<Skeleton className="h-24 flex-1 rounded-2xl" />
			<Skeleton className="h-24 flex-1 rounded-2xl" />
		</HStack>
		<Skeleton className="h-48 w-full rounded-3xl" />
		<Skeleton className="h-40 w-full rounded-3xl" />
	</VStack>
);

export default function CategoryAnalysisScreen() {
	const { width: windowWidth } = useWindowDimensions();
	const { shouldHideValues } = useValueVisibility();
	const currentUserId = auth.currentUser?.uid ?? null;
	const [analysis, setAnalysis] = React.useState<CategoryAnalysisData | null>(null);
	const [selectedTagId, setSelectedTagId] = React.useState<string | null>(null);
	const [selectedType, setSelectedType] = React.useState<CategoryAnalysisMovementType>('expense');
	const [isLoading, setIsLoading] = React.useState(false);
	const [isRefreshing, setIsRefreshing] = React.useState(false);
	const [isExportingPdf, setIsExportingPdf] = React.useState(false);
	const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

	const {
		isDarkMode,
		surfaceBackground,
		cardBackground,
		bodyText,
		helperText,
		headingText,
		heroHeight,
		infoCardStyle,
		insets,
		submitButtonClassName,
		submitButtonTextClassName,
		tintedCardClassName,
		notTintedCardClassName,
		sectionCardClassName,
	} = useScreenStyles();

	const chartWidth = React.useMemo(() => Math.max(Math.min(windowWidth - 108, 260), 190), [windowWidth]);
	const chartRadius = React.useMemo(() => Math.max(Math.min(chartWidth / 2 - 16, 104), 78), [chartWidth]);
	const chartInnerRadius = React.useMemo(() => Math.max(chartRadius - 34, 46), [chartRadius]);

	const palette = React.useMemo(
		() => ({
			title: isDarkMode ? '#F8FAFC' : '#0F172A',
			subtitle: isDarkMode ? '#94A3B8' : '#64748B',
			border: isDarkMode ? 'rgba(148, 163, 184, 0.18)' : '#E2E8F0',
			emptySurface: isDarkMode ? '#020617' : '#F8FAFC',
			activeSurface: isDarkMode ? 'rgba(250, 204, 21, 0.14)' : '#FEF9C3',
			activeBorder: isDarkMode ? 'rgba(250, 204, 21, 0.42)' : '#FACC15',
			positive: isDarkMode ? '#34D399' : '#059669',
			negative: isDarkMode ? '#F87171' : '#DC2626',
			warning: isDarkMode ? '#FDE047' : '#CA8A04',
			blue: isDarkMode ? '#38BDF8' : '#0284C7',
			chartTrack: isDarkMode ? 'rgba(51, 65, 85, 0.72)' : '#E2E8F0',
			chartCenter: isDarkMode ? '#081120' : '#FFFFFF',
			activeButtonContent: isDarkMode ? '#FFFFFF' : '#0F172A',
		}),
		[isDarkMode],
	);

	const formatCurrencyBRL = React.useCallback(
		(valueInCents: number) => (shouldHideValues ? HIDDEN_VALUE_PLACEHOLDER : formatCurrencyBRLBase(valueInCents)),
		[shouldHideValues],
	);

	const formatSignedCurrencyBRL = React.useCallback(
		(valueInCents: number) => {
			if (shouldHideValues) {
				return HIDDEN_VALUE_PLACEHOLDER;
			}

			const prefix = valueInCents >= 0 ? '+' : '-';
			return `${prefix}${formatCurrencyBRLBase(Math.abs(valueInCents))}`;
		},
		[shouldHideValues],
	);

	const loadAnalysis = React.useCallback(
		async (asRefresh = false) => {
			if (!currentUserId) {
				setErrorMessage('Nenhum usuário autenticado foi identificado.');
				setAnalysis(null);
				return;
			}

			if (asRefresh) {
				setIsRefreshing(true);
			} else {
				setIsLoading(true);
			}
			setErrorMessage(null);

			const result = await getCategoryAnalysisFirebase(currentUserId, ANALYSIS_BASELINE_MONTHS);

			if (!result.success) {
				setErrorMessage('Não foi possível carregar a análise por categoria.');
				setAnalysis(null);
				setIsLoading(false);
				setIsRefreshing(false);
				return;
			}

			setAnalysis(result.data);
			setSelectedTagId(current => {
				if (current && result.data.reportsByTagId[current]) {
					return current;
				}
				return result.data.defaultTagId;
			});
			setIsLoading(false);
			setIsRefreshing(false);
		},
		[currentUserId],
	);

	useFocusEffect(
		React.useCallback(() => {
			void loadAnalysis(false);
		}, [loadAnalysis]),
	);

	const selectedTag = React.useMemo(
		() => analysis?.tags.find(tag => tag.id === selectedTagId) ?? null,
		[analysis?.tags, selectedTagId],
	);
	const selectedReport: CategoryAnalysisReport | null = selectedTagId
		? analysis?.reportsByTagId[selectedTagId] ?? null
		: null;

	React.useEffect(() => {
		if (!analysis || selectedTagId) {
			return;
		}

		setSelectedTagId(analysis.defaultTagId);
	}, [analysis, selectedTagId]);

	React.useEffect(() => {
		if (!selectedTag) {
			return;
		}

		setSelectedType(currentType => {
			if (selectedTag.usageType === 'gain' && currentType === 'expense') {
				return 'gain';
			}

			if (selectedTag.usageType === 'expense' && currentType === 'gain') {
				return 'expense';
			}

			return currentType;
		});
	}, [selectedTag]);

	const handleSelectTag = React.useCallback((tag: TagActionsheetOption) => {
		const matchingTag = analysis?.tags.find(item => item.id === tag.id) ?? null;
		setSelectedTagId(tag.id);
		setSelectedType(getInitialTypeForTag(matchingTag));
	}, [analysis?.tags]);

	const metric = selectedType === 'expense' ? selectedReport?.expense : selectedReport?.gain;
	const selectedTagIcon = selectedTag?.icon ?? getTagFallbackIcon(selectedType);
	const tagSelectorOptions = React.useMemo(
		() => analysis?.tags.map(toTagActionsheetOption) ?? [],
		[analysis?.tags],
	);
	const selectedTagOption = React.useMemo(
		() => (selectedTag ? toTagActionsheetOption(selectedTag) : null),
		[selectedTag],
	);
	const canSelectExpense = selectedTag?.usageType !== 'gain';
	const canSelectGain = selectedTag?.usageType !== 'expense';
	const typeOptions: CategoryAnalysisMovementType[] = ['expense', 'gain'];
	const activeBreakdown = React.useMemo(() => {
		if (!selectedReport) {
			return [];
		}

		return selectedReport.bankBreakdown.filter(item =>
			selectedType === 'expense' ? item.expenseInCents > 0 : item.gainInCents > 0,
		);
	}, [selectedReport, selectedType]);
	const breakdownTotalInCents = React.useMemo(
		() =>
			activeBreakdown.reduce(
				(accumulator, item) =>
					accumulator + (selectedType === 'expense' ? item.expenseInCents : item.gainInCents),
				0,
			),
		[activeBreakdown, selectedType],
	);
	const bankPieData = React.useMemo(
		() =>
			activeBreakdown.map((item, index) => {
				const valueInCents = selectedType === 'expense' ? item.expenseInCents : item.gainInCents;
				const color =
					item.colorHex ?? (item.isCash ? CASH_BREAKDOWN_COLOR : BANK_PIE_COLORS[index % BANK_PIE_COLORS.length]);

				return {
					value: Number((valueInCents / 100).toFixed(2)),
					color,
					gradientCenterColor: color,
					text: item.name,
				};
			}),
		[activeBreakdown, selectedType],
	);
	const monthChartMax = React.useMemo(() => {
		if (!selectedReport) {
			return 0;
		}

		return Math.max(
			...selectedReport.months.map(month =>
				selectedType === 'expense' ? month.expenseInCents : month.gainInCents,
			),
			1,
		);
	}, [selectedReport, selectedType]);
	const visibleRecentMovements = React.useMemo(
		() => selectedReport?.recentMovements.filter(movement => movement.type === selectedType) ?? [],
		[selectedReport?.recentMovements, selectedType],
	);
	const statusColor = React.useMemo(() => {
		if (!metric) {
			return palette.warning;
		}

		if (metric.status === 'above') {
			return selectedType === 'expense' ? palette.negative : palette.positive;
		}

		if (metric.status === 'below') {
			return selectedType === 'expense' ? palette.positive : palette.negative;
		}

		if (metric.status === 'stable') {
			return palette.blue;
		}

		return palette.warning;
	}, [metric, palette.blue, palette.negative, palette.positive, palette.warning, selectedType]);
	const insightMessage = metric && selectedReport
		? buildInsightMessage({
			metric,
			type: selectedType,
			tagName: selectedReport.tagName,
			baselineMonthCount: selectedReport.baselineMonthCount,
		})
		: 'Selecione uma categoria para gerar o relatório.';

	const handleExportCategoryAnalysisPdf = React.useCallback(async () => {
		if (isExportingPdf) {
			return;
		}

		if (!selectedTag || !selectedReport || !metric) {
			showNotifierAlert({
				description: 'Selecione uma categoria antes de baixar a análise.',
				type: 'info',
				isDarkMode,
			});
			return;
		}

		const movementTone = selectedType === 'expense' ? 'expense' : 'gain';
		const variationTone =
			metric.deltaInCents === 0
				? 'neutral'
				: selectedType === 'expense'
					? metric.deltaInCents > 0
						? 'expense'
						: 'gain'
					: metric.deltaInCents > 0
						? 'gain'
						: 'expense';
		const generatedAtLabel = formatGeneratedAtLabel(new Date());
		const metrics: CategoryAnalysisPdfMetric[] = [
			{
				label: `${getMovementTypeLabel(selectedType)} no mês`,
				value: formatCurrencyBRL(metric.currentInCents),
				helper: `${metric.currentCount} movimentações no mês atual.`,
				tone: movementTone,
			},
			{
				label: 'Média histórica',
				value: formatCurrencyBRL(metric.historicalAverageInCents),
				helper: `${metric.historicalCount} movimentos nos últimos ${selectedReport.baselineMonthCount} meses.`,
				tone: 'neutral',
			},
			{
				label: 'Variação',
				value: formatSignedCurrencyBRL(metric.deltaInCents),
				helper: formatMetricPercentLabel(metric),
				tone: variationTone,
			},
		];

		const pdfHtml = buildCategoryAnalysisPdfHtml({
			title: 'Análise por Categoria',
			categoryLabel: selectedReport.tagName,
			categoryKindLabel: getCategoryKindLabel(selectedTag),
			movementTypeLabel: getMovementTypeLabel(selectedType),
			generatedAtLabel,
			insightMessage,
			statusLabel: getStatusLabel(metric.status),
			primaryMetricLabel: selectedReport.currentMonthLabel,
			primaryMetricValue: formatCurrencyBRL(metric.currentInCents),
			primaryMetricHelper: formatMetricPercentLabel(metric),
			metrics,
			months: selectedReport.months.map(month => {
				const monthValue = selectedType === 'expense' ? month.expenseInCents : month.gainInCents;
				const monthCount = selectedType === 'expense' ? month.expenseCount : month.gainCount;

				return {
					label: month.isCurrentMonth ? 'Este mês' : month.label,
					valueLabel: formatCurrencyBRL(monthValue),
					countLabel: `${monthCount} movimento(s)`,
					isCurrentMonth: month.isCurrentMonth,
				};
			}),
			breakdown: activeBreakdown.map(item => {
				const itemValue = selectedType === 'expense' ? item.expenseInCents : item.gainInCents;

				return {
					name: item.name,
					valueLabel: formatCurrencyBRL(itemValue),
					shareLabel: formatBreakdownShareLabel(
						item,
						itemValue,
						breakdownTotalInCents,
						activeBreakdown.length,
					),
				};
			}),
			movements: visibleRecentMovements.map(movement => ({
				name: movement.name,
				dateLabel: formatMovementDateLabel(movement.date),
				sourceLabel: movement.bankName,
				description:
					movement.explanation?.trim() ||
					`${getMovementTypeLabel(selectedType)} classificado em ${selectedReport.tagName}.`,
				amountLabel: formatCurrencyBRL(movement.valueInCents),
				amountTone: movementTone,
			})),
			emptyBreakdownLabel: 'Nenhuma movimentação deste tipo foi encontrada no mês atual para esta categoria.',
			emptyMovementsLabel: 'Não há movimentos recentes para este recorte.',
			privacyNotice: shouldHideValues
				? 'Os valores foram ocultados porque a preferência de privacidade está ativa.'
				: null,
		});

		setIsExportingPdf(true);
		try {
			// Exporta a análise seguindo [[Análise por Categoria]] e [[Privacidade de Valores]].
			const { uri } = await Print.printToFileAsync({ html: pdfHtml });
			const pdfFileName = buildPdfFileName([
				'Analise por Categoria',
				selectedReport.tagName,
				getMovementTypeLabel(selectedType),
			]);
			const namedPdfUri = await copyPdfToNamedCacheFile(uri, pdfFileName);
			const canShare = await Sharing.isAvailableAsync();

			if (!canShare) {
				await Print.printAsync({ html: pdfHtml });
				showNotifierAlert({
					title: 'Análise pronta',
					description: 'A análise foi aberta na impressão do dispositivo. Use a opção de salvar como PDF.',
					type: 'info',
					isDarkMode,
				});
				return;
			}

			await Sharing.shareAsync(namedPdfUri, {
				dialogTitle: `Baixar análise de ${selectedReport.tagName}`,
				mimeType: 'application/pdf',
				UTI: 'com.adobe.pdf',
			});

			showNotifierAlert({
				title: 'PDF pronto',
				description: 'Análise em PDF gerada com sucesso.',
				type: 'success',
				isDarkMode,
			});
		} catch (error) {
			console.error('Erro ao gerar PDF da análise por categoria:', error);
			showNotifierAlert({
				description: 'Não foi possível gerar o PDF da análise agora.',
				type: 'error',
				isDarkMode,
			});
		} finally {
			setIsExportingPdf(false);
		}
	}, [
		activeBreakdown,
		breakdownTotalInCents,
		formatCurrencyBRL,
		formatSignedCurrencyBRL,
		insightMessage,
		isDarkMode,
		isExportingPdf,
		metric,
		selectedReport,
		selectedTag,
		selectedType,
		shouldHideValues,
		visibleRecentMovements,
	]);

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

			<View className="flex-1" style={{ backgroundColor: surfaceBackground }}>
				<View
					className={`absolute top-0 left-0 right-0 ${cardBackground}`}
					style={{ height: heroHeight }}
				>
					<Image
						source={LoginWallpaper}
						alt="Background da análise por categoria"
						className="w-full h-full rounded-b-3xl absolute"
						resizeMode="cover"
					/>

					<VStack
						className="w-full h-full items-center justify-start px-6 gap-4"
						style={{ paddingTop: insets.top + 24 }}
					>
						<Heading size="xl" className="text-white text-center">
							Análise por Categoria
						</Heading>
						<CategoryAnalysisIllustration width="42%" height="42%" className="opacity-95" />
					</VStack>
				</View>

				<View
					className={`flex-1 rounded-t-3xl ${cardBackground} px-6 pb-1`}
					style={{ marginTop: heroHeight - 64 }}
				>
					<View className="flex-1 w-full">
						<ScrollView
							className="flex-1 w-full"
							contentContainerStyle={{ paddingBottom: 18 }}
							showsVerticalScrollIndicator={false}
							refreshControl={
								<RefreshControl
									refreshing={isRefreshing}
									onRefresh={() => void loadAnalysis(true)}
									tintColor={palette.warning}
								/>
							}
						>
							<View className="mb-5 mt-4">
								<HStack className="items-center gap-2 px-2 pb-3">
									<Heading className={`text-lg uppercase tracking-widest ${headingText}`} size="lg">
										Relatório dinâmico
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
												accessibilityLabel="Informações sobre a análise por categoria"
											>
												<Info
													size={14}
													color={isDarkMode ? '#94A3B8' : '#64748B'}
													style={{ marginLeft: 2 }}
												/>
											</Pressable>
										)}
									>
										<PopoverBackdrop className="bg-transparent" />
										<PopoverContent className="max-w-[270px]" style={infoCardStyle}>
											<PopoverBody className="px-3 py-3">
												<Text className={`${bodyText} text-xs leading-5`}>
													A análise compara o mês atual com a média dos últimos 3 meses fechados.
													Movimentos internos, como investimentos, não entram na comparação de gastos e ganhos.
												</Text>
											</PopoverBody>
										</PopoverContent>
									</Popover>
								</HStack>

								{isLoading && !analysis ? (
									<CategoryAnalysisSkeleton />
								) : errorMessage ? (
									<View className={`${sectionCardClassName} px-5 py-5`}>
										<VStack className="gap-4">
											<Text className={`${bodyText} text-sm leading-5`}>{errorMessage}</Text>
											<Button className={submitButtonClassName} onPress={() => void loadAnalysis(false)}>
												<ButtonText className={submitButtonTextClassName}>Tentar novamente</ButtonText>
											</Button>
										</VStack>
									</View>
								) : !analysis || analysis.tags.length === 0 ? (
									<View className={`${sectionCardClassName} px-5 py-5`}>
										<Text className={`${bodyText} text-sm leading-5`}>
											Nenhuma categoria foi encontrada. Cadastre tags e movimente gastos ou ganhos para gerar o relatório.
										</Text>
									</View>
								) : (
									<VStack className="gap-5">
										<TagActionsheetSelector
											options={tagSelectorOptions}
											selectedId={selectedTagId}
											selectedOption={selectedTagOption}
											onSelect={handleSelectTag}
											isDarkMode={isDarkMode}
											bodyTextClassName={bodyText}
											helperTextClassName={helperText}
											triggerClassName={sectionCardClassName}
											placeholder="Selecione uma categoria"
											sheetTitle="Categorias da análise"
											emptyMessage="Nenhuma categoria disponível para análise."
											triggerHint="Toque para escolher a categoria do relatório."
											disabledHint="Categorias indisponíveis no momento."
											accessibilityLabel="Selecionar categoria para análise"
										/>

										<HStack className="gap-2">
											{typeOptions.map(option => {
												const isDisabled = option === 'expense' ? !canSelectExpense : !canSelectGain;
												const isActive = selectedType === option;

												return (
													<TouchableOpacity
														key={option}
														activeOpacity={0.84}
														disabled={isDisabled}
														onPress={() => setSelectedType(option)}
														style={{
															flex: 1,
															minHeight: 42,
															borderRadius: 16,
															borderWidth: 1,
															borderColor: isActive ? palette.activeBorder : palette.border,
															backgroundColor: isActive ? palette.activeSurface : 'transparent',
															alignItems: 'center',
															justifyContent: 'center',
															opacity: isDisabled ? 0.45 : 1,
														}}
													>
														<HStack className="items-center gap-2">
															{option === 'expense' ? (
																<TrendingDown size={16} color={isActive ? palette.activeButtonContent : palette.subtitle} />
															) : (
																<TrendingUp size={16} color={isActive ? palette.activeButtonContent : palette.subtitle} />
															)}
															<Text
																style={{
																	color: isActive ? palette.activeButtonContent : palette.title,
																	fontSize: 13,
																	fontWeight: '700',
																}}
															>
																{getMovementTypeLabel(option)}
															</Text>
														</HStack>
													</TouchableOpacity>
												);
											})}
										</HStack>

										<LinearGradient
											colors={
												selectedType === 'expense'
													? ['#7F1D1D', '#EF4444']
													: ['#065F46', '#10B981']
											}
											start={{ x: 0, y: 0 }}
											end={{ x: 1, y: 1 }}
											style={{
												borderRadius: 24,
												paddingHorizontal: 18,
												paddingVertical: 18,
											}}
										>
											<VStack className="gap-4">
												<HStack className="items-start justify-between gap-4">
													<HStack className="flex-1 items-center gap-3">
														<View
															style={{
																width: 46,
																height: 46,
																borderRadius: 17,
																alignItems: 'center',
																justifyContent: 'center',
																backgroundColor: 'rgba(255,255,255,0.16)',
															}}
														>
															<TagIcon
																iconFamily={selectedTagIcon.iconFamily}
																iconName={selectedTagIcon.iconName}
																iconStyle={selectedTagIcon.iconStyle}
																size={20}
																color="#FFFFFF"
															/>
														</View>
														<VStack className="flex-1">
															<Text className="text-xs font-bold uppercase text-white/70">
																{metric ? getStatusLabel(metric.status) : 'Selecione uma categoria'}
															</Text>
															<Heading size="lg" className="mt-1 text-white">
																{selectedReport?.tagName ?? 'Categoria'}
															</Heading>
														</VStack>
													</HStack>

													<View
														style={{
															borderRadius: 999,
															backgroundColor: 'rgba(255,255,255,0.16)',
															paddingHorizontal: 10,
															paddingVertical: 6,
														}}
													>
														<Text className="text-xs font-bold text-white">
															{getMovementTypeLabel(selectedType)}
														</Text>
													</View>
												</HStack>

												<Text className="text-sm leading-5 text-white">{insightMessage}</Text>
											</VStack>
										</LinearGradient>

										{metric && selectedReport ? (
											<>
												<HStack className="gap-3">
													<View className={`${notTintedCardClassName} flex-1 px-4 py-4`}>
														<Text className={`${helperText} text-xs font-bold uppercase`}>
															{selectedReport.currentMonthLabel}
														</Text>
														<Text
															className="mt-2 text-lg font-bold"
															style={{ color: selectedType === 'expense' ? palette.negative : palette.positive }}
														>
															{formatCurrencyBRL(metric.currentInCents)}
														</Text>
														<Text className={`${helperText} mt-1 text-xs`}>
															{metric.currentCount} movimentações
														</Text>
													</View>

													<View className={`${notTintedCardClassName} flex-1 px-4 py-4`}>
														<Text className={`${helperText} text-xs font-bold uppercase`}>
															Média 3 meses
														</Text>
														<Text className={`mt-2 text-lg font-bold ${headingText}`}>
															{formatCurrencyBRL(metric.historicalAverageInCents)}
														</Text>
														<Text
															className="mt-1 text-xs font-semibold"
															style={{ color: statusColor }}
														>
															{formatMetricPercentLabel(metric)}
														</Text>
														<Text className={`${helperText} mt-1 text-xs`}>
															{metric.historicalCount} movimentos históricos
														</Text>
													</View>
												</HStack>

												<View className={`${sectionCardClassName} px-5 py-5`}>
													<VStack className="gap-4">
														<HStack className="items-center justify-between gap-3">
															<HStack className="items-center gap-2">
																<BarChart3 size={18} color={palette.warning} />
																<Heading size="sm" className={headingText}>
																	Evolução mensal
																</Heading>
															</HStack>
															<Text style={{ color: statusColor, fontSize: 12, fontWeight: '700' }}>
																{formatSignedCurrencyBRL(metric.deltaInCents)}
															</Text>
														</HStack>

														<VStack className="gap-3">
															{selectedReport.months.map(month => {
																const monthValue = selectedType === 'expense'
																	? month.expenseInCents
																	: month.gainInCents;
																const barWidth = `${Math.max((monthValue / monthChartMax) * 100, monthValue > 0 ? 8 : 0)}%` as `${number}%`;

																return (
																	<View key={month.key}>
																		<HStack className="mb-1 items-center justify-between gap-3">
																			<Text
																				style={{
																					color: month.isCurrentMonth ? palette.title : palette.subtitle,
																					fontSize: 12,
																					fontWeight: month.isCurrentMonth ? '700' : '600',
																				}}
																			>
																				{month.isCurrentMonth ? 'Este mês' : month.label}
																			</Text>
																			<Text className={`${bodyText} text-xs font-semibold`}>
																				{formatCurrencyBRL(monthValue)}
																			</Text>
																		</HStack>
																		<View
																			style={{
																				height: 10,
																				borderRadius: 999,
																				backgroundColor: palette.chartTrack,
																				overflow: 'hidden',
																			}}
																		>
																			<View
																				style={{
																					width: barWidth,
																					height: '100%',
																					borderRadius: 999,
																					backgroundColor: month.isCurrentMonth
																						? statusColor
																						: selectedType === 'expense'
																							? '#F97316'
																							: '#22C55E',
																				}}
																			/>
																		</View>
																	</View>
																);
															})}
														</VStack>
													</VStack>
												</View>

												<View className={`${sectionCardClassName} px-5 py-5`}>
													<VStack className="gap-4">
														<HStack className="items-center gap-2">
															<WalletCards size={18} color={palette.warning} />
															<Heading size="sm" className={headingText}>
																Bancos e dinheiro
															</Heading>
														</HStack>

														{activeBreakdown.length > 0 && breakdownTotalInCents > 0 ? (
															<>
																<View className="items-center justify-center">
																	<PieChart
																		data={bankPieData}
																		donut
																		showGradient
																		showText={false}
																		radius={chartRadius}
																		innerRadius={chartInnerRadius}
																		innerCircleColor={palette.chartCenter}
																		centerLabelComponent={() => (
																			<VStack className="items-center px-2">
																				<Text style={{ color: palette.subtitle, fontSize: 11, fontWeight: '700' }}>
																					Total
																				</Text>
																				<Text
																					style={{
																						marginTop: 3,
																						color: palette.title,
																						fontSize: 14,
																						fontWeight: '700',
																					}}
																				>
																					{formatCurrencyBRL(breakdownTotalInCents)}
																				</Text>
																			</VStack>
																		)}
																	/>
																</View>

																<VStack className="gap-3">
																	{activeBreakdown.map((item, index) => {
																		const itemValue = selectedType === 'expense'
																			? item.expenseInCents
																			: item.gainInCents;
																		const shareLabel = formatBreakdownShareLabel(
																			item,
																			itemValue,
																			breakdownTotalInCents,
																			activeBreakdown.length,
																		);
																		const color =
																			item.colorHex ??
																			(item.isCash
																				? CASH_BREAKDOWN_COLOR
																				: BANK_PIE_COLORS[index % BANK_PIE_COLORS.length] ?? DEFAULT_BREAKDOWN_COLOR);

																		return (
																			<HStack key={item.id} className="items-center gap-3">
																				<View
																					style={{
																						width: 10,
																						height: 10,
																						borderRadius: 999,
																						backgroundColor: color,
																					}}
																				/>
																				<VStack className="flex-1">
																					<Text numberOfLines={1} style={{ color: palette.title, fontSize: 13, fontWeight: '700' }}>
																						{item.name}
																					</Text>
																					<Text className={`${helperText} text-xs`}>
																						{shareLabel}
																					</Text>
																				</VStack>
																				<Text className={`${bodyText} text-sm font-bold`}>
																					{formatCurrencyBRL(itemValue)}
																				</Text>
																			</HStack>
																		);
																	})}
																</VStack>
															</>
														) : (
															<View
																style={{
																	borderRadius: 18,
																	borderWidth: 1,
																	borderColor: palette.border,
																	backgroundColor: palette.emptySurface,
																	paddingHorizontal: 16,
																	paddingVertical: 16,
																}}
															>
																<Text className={`${helperText} text-sm leading-5`}>
																	Nenhuma movimentação deste tipo foi encontrada no mês atual para esta categoria.
																</Text>
															</View>
														)}
													</VStack>
												</View>

												<View className={`${sectionCardClassName} px-5 py-5`}>
													<VStack className="gap-4">
														<HStack className="items-center gap-2">
															<Activity size={18} color={palette.warning} />
															<Heading size="sm" className={headingText}>
																Movimentos recentes
															</Heading>
														</HStack>

														{visibleRecentMovements.length > 0 ? (
															<VStack className="gap-3">
																{visibleRecentMovements.map(movement => (
																	<HStack key={`${movement.type}:${movement.id}`} className="items-center gap-3">
																		<View
																			style={{
																				width: 38,
																				height: 38,
																				borderRadius: 15,
																				alignItems: 'center',
																				justifyContent: 'center',
																				backgroundColor: selectedType === 'expense'
																					? 'rgba(239, 68, 68, 0.14)'
																					: 'rgba(16, 185, 129, 0.14)',
																			}}
																		>
																			{selectedType === 'expense' ? (
																				<TrendingDown size={17} color={palette.negative} />
																			) : (
																				<TrendingUp size={17} color={palette.positive} />
																			)}
																		</View>
																		<VStack className="flex-1">
																			<Text numberOfLines={1} style={{ color: palette.title, fontSize: 13, fontWeight: '700' }}>
																				{movement.name}
																			</Text>
																			<Text numberOfLines={1} className={`${helperText} text-xs`}>
																				{movement.bankName} · {formatCompactMonthDate(movement.date)}
																			</Text>
																		</VStack>
																		<Text
																			style={{
																				color: selectedType === 'expense' ? palette.negative : palette.positive,
																				fontSize: 13,
																				fontWeight: '700',
																			}}
																		>
																			{formatCurrencyBRL(movement.valueInCents)}
																		</Text>
																	</HStack>
																))}
															</VStack>
														) : (
															<View
																style={{
																	borderRadius: 18,
																	borderWidth: 1,
																	borderColor: palette.border,
																	backgroundColor: palette.emptySurface,
																	paddingHorizontal: 16,
																	paddingVertical: 16,
																}}
															>
																<Text className={`${helperText} text-sm leading-5`}>
																	Não há movimentos recentes para este recorte.
																</Text>
															</View>
														)}
													</VStack>
												</View>

												<Button
													className={submitButtonClassName}
													onPress={() => {
														void handleExportCategoryAnalysisPdf();
													}}
													isDisabled={isExportingPdf || isLoading || !selectedReport || !metric}
												>
													{isExportingPdf ? (
														<>
															<ButtonSpinner />
															<ButtonText className={submitButtonTextClassName}>
																Gerando PDF
															</ButtonText>
														</>
													) : (
														<>
															<Download
																size={18}
																color={isDarkMode ? '#0F172A' : '#FFFFFF'}
															/>
															<ButtonText className={submitButtonTextClassName}>
																Baixar análise em PDF
															</ButtonText>
														</>
													)}
												</Button>
											</>
										) : null}
									</VStack>
								)}
							</View>
						</ScrollView>

						<View
							style={{
								marginHorizontal: -18,
								paddingBottom: 0,
							}}
						>
							<Navigator defaultValue={0} />
						</View>
					</View>
				</View>
			</View>
		</SafeAreaView>
	);
}
