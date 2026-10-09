'use dom';

import '@mantine/core/styles.css';
import '@mantine/charts/styles.css';
import { LineChart } from '@mantine/charts';
import { Box, MantineProvider } from '@mantine/core';
import type { DOMProps } from 'expo/dom';
import { LUMUS_MONTH_SERIES_COLORS, LUMUS_RUNTIME_COLORS } from '@/design-system/tokens';
import type {
	CategoryAnalysisMonthBucket,
	CategoryAnalysisMovementType,
} from '@/functions/CategoryAnalysisFirebase';

type CategoryAnalysisMonthlyLineChartProps = {
	months: CategoryAnalysisMonthBucket[];
	type: CategoryAnalysisMovementType;
	currentDayOfMonth: number;
	isDarkMode: boolean;
	shouldHideValues: boolean;
	accessibilityLabel: string;
	dom?: DOMProps;
};

type ChartDatum = Record<string, string | number | null>;

const formatCurrency = (valueInCents: number) =>
	new Intl.NumberFormat('pt-BR', {
		style: 'currency',
		currency: 'BRL',
		minimumFractionDigits: 2,
	}).format(valueInCents / 100);

export default function CategoryAnalysisMonthlyLineChart({
	months,
	type,
	currentDayOfMonth,
	isDarkMode,
	shouldHideValues,
	accessibilityLabel,
}: CategoryAnalysisMonthlyLineChartProps) {
	const colors = isDarkMode ? LUMUS_RUNTIME_COLORS.dark : LUMUS_RUNTIME_COLORS.light;
	const monthColors = isDarkMode
		? LUMUS_MONTH_SERIES_COLORS.dark
		: LUMUS_MONTH_SERIES_COLORS.light;
	const cumulativeTotalsByMonth = months.map(month => {
		let cumulativeTotalInCents = 0;

		return Array.from({ length: 31 }, (_, index) => {
			const day = index + 1;
			const isBeyondMonth = day > month.daysInMonth || day < month.firstDay || day > month.lastDay;
			const isFutureDay = month.isCurrentMonth && day > currentDayOfMonth;

			if (isBeyondMonth || isFutureDay) {
				return null;
			}

			if (shouldHideValues) {
				return 1;
			}

			const dailyTotals = month.dailyMovementsByDay[String(day)];
			cumulativeTotalInCents += type === 'expense'
				? dailyTotals?.expenseInCents ?? 0
				: dailyTotals?.gainInCents ?? 0;

			return cumulativeTotalInCents;
		});
	});
	const chartData = Array.from({ length: 31 }, (_, index) => {
		const day = index + 1;

		return months.reduce<ChartDatum>((point, month, monthIndex) => {
			return {
				...point,
				[month.key]: cumulativeTotalsByMonth[monthIndex][index],
			};
		}, { day: String(day).padStart(2, '0') });
	});
	const series = months.map((month, index) => ({
		name: month.key,
		label: month.label,
		color: monthColors[index % monthColors.length],
	}));

	return (
		<MantineProvider forceColorScheme={isDarkMode ? 'dark' : 'light'}>
			<style>{'html, body { background-color: transparent; }'}</style>
			<Box
				role="img"
				aria-label={accessibilityLabel}
				h={330}
				w="100%"
			>
				<LineChart
					h={320}
					data={chartData}
					dataKey="day"
					series={series}
					curveType="stepAfter"
					connectNulls={false}
					strokeWidth={2.5}
					withDots={false}
					withTooltip={!shouldHideValues}
					withYAxis={!shouldHideValues}
					accessibilityLayer={!shouldHideValues}
					withLegend
					tickLine="none"
					gridAxis="y"
					strokeDasharray="4 4"
					gridColor={colors.border}
					styles={{ root: { '--chart-text-color': colors.textMuted } }}
					valueFormatter={formatCurrency}
					xAxisProps={{ axisLine: false, tickLine: false, interval: 4, minTickGap: 8 }}
					yAxisProps={{ axisLine: false, tickLine: false, width: 78 }}
					legendProps={{ verticalAlign: 'bottom', height: months.length > 8 ? 112 : months.length > 4 ? 78 : 34 }}
					tooltipProps={{ cursor: { stroke: colors.border, strokeWidth: 1 } }}
				/>
			</Box>
		</MantineProvider>
	);
}
