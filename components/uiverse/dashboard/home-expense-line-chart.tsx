'use dom';

import '@mantine/core/styles.css';
import '@mantine/charts/styles.css';
import { LineChart } from '@mantine/charts';
import { MantineProvider } from '@mantine/core';
import type { DOMProps } from 'expo/dom';

type HomeExpenseChartMonth = {
	key: string;
	label: string;
	daysInMonth: number;
	dailyExpensesInCents: Record<string, number>;
};

type HomeExpenseLineChartProps = {
	months: HomeExpenseChartMonth[];
	isDarkMode: boolean;
	shouldHideValues: boolean;
	dom?: DOMProps;
};

type ChartDatum = Record<string, string | number | null>;

const MONTH_COLORS = ['#38BDF8', '#A78BFA', '#FACC15'];

const formatCurrency = (valueInCents: number) =>
	new Intl.NumberFormat('pt-BR', {
		style: 'currency',
		currency: 'BRL',
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	}).format(valueInCents / 100);

export default function HomeExpenseLineChart({
	months,
	isDarkMode,
	shouldHideValues,
}: HomeExpenseLineChartProps) {
	const maxDays = Math.max(...months.map(month => month.daysInMonth), 31);
	const data = Array.from({ length: maxDays }, (_, index) => {
		const day = index + 1;

		return months.reduce<ChartDatum>(
			(chartDay, month) => ({
				...chartDay,
				[month.key]: month.dailyExpensesInCents[String(day)] ?? null,
			}),
			{ day: String(day).padStart(2, '0') },
		);
	});
	const series = months.map((month, index) => ({
		name: month.key,
		label: month.label,
		color: MONTH_COLORS[index % MONTH_COLORS.length],
	}));

	return (
		<MantineProvider forceColorScheme={isDarkMode ? 'dark' : 'light'}>
			<style>{'html, body { background-color: transparent !important; }'}</style>
			<div
				role="img"
				aria-label="Gastos por dia nos últimos três meses, com uma linha para cada mês"
				style={{
					height: 326,
					width: '100%',
					backgroundColor: 'transparent',
					boxSizing: 'border-box',
				}}
			>
				<LineChart
					h={310}
					data={data}
					dataKey="day"
					series={series}
					curveType="linear"
					connectNulls={false}
					strokeWidth={2.5}
					withDots
					dotProps={{ r: 4, strokeWidth: 2 }}
					activeDotProps={{ r: 6, strokeWidth: 2 }}
					withLegend
					withTooltip={!shouldHideValues}
					withYAxis={!shouldHideValues}
					tickLine="none"
					gridAxis="y"
					strokeDasharray="4 4"
					textColor={isDarkMode ? 'gray.4' : 'gray.6'}
					gridColor={isDarkMode ? 'dark.4' : 'gray.2'}
					valueFormatter={value =>
						shouldHideValues ? '••••' : formatCurrency(value)
					}
					xAxisProps={{ axisLine: false, tickLine: false, interval: 2 }}
					yAxisProps={{ axisLine: false, tickLine: false, width: 78 }}
					legendProps={{ verticalAlign: 'bottom', height: 34 }}
					tooltipProps={{
						cursor: {
							stroke: isDarkMode ? '#475569' : '#CBD5E1',
							strokeWidth: 1,
						},
					}}
				/>
			</div>
		</MantineProvider>
	);
}
