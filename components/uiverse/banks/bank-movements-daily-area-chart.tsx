'use dom';

import '@mantine/core/styles.css';
import '@mantine/charts/styles.css';
import { AreaChart } from '@mantine/charts';
import { MantineProvider } from '@mantine/core';
import type { DOMProps } from 'expo/dom';
import { LUMUS_RUNTIME_COLORS } from '@/design-system/tokens';

type BankMovementsDailyAreaChartDatum = {
	day: string;
	gainsInCents: number;
	expensesInCents: number;
};

type BankMovementsDailyAreaChartProps = {
	data: BankMovementsDailyAreaChartDatum[];
	isDarkMode: boolean;
	shouldHideValues: boolean;
	dom?: DOMProps;
};

const formatCurrency = (valueInCents: number) =>
	new Intl.NumberFormat('pt-BR', {
		style: 'currency',
		currency: 'BRL',
		minimumFractionDigits: 2,
	}).format(valueInCents / 100);

export default function BankMovementsDailyAreaChart({
	data,
	isDarkMode,
	shouldHideValues,
}: BankMovementsDailyAreaChartProps) {
	const palette = isDarkMode ? LUMUS_RUNTIME_COLORS.dark : LUMUS_RUNTIME_COLORS.light;
	const chartData = shouldHideValues
		? data.map(point => ({ ...point, gainsInCents: 1, expensesInCents: 1 }))
		: data;
	const interval = Math.max(0, Math.floor(data.length / 8) - 1);
	const chartWidth = data.length > 45 ? Math.max(640, data.length * 30) : undefined;
	const showDots = data.length <= 24;

	return (
		<MantineProvider forceColorScheme={isDarkMode ? 'dark' : 'light'}>
			<style>{'html, body { background-color: transparent; }'}</style>
			<div
				role="img"
				aria-label={
					shouldHideValues
						? 'Gráfico diário de ganhos e despesas. Valores ocultos.'
						: 'Gráfico diário de ganhos e despesas no período selecionado.'
				}
				style={{
					height: 286,
					width: '100%',
					backgroundColor: 'transparent',
					outline: 'none',
					overflowX: chartWidth ? 'auto' : 'hidden',
					overflowY: 'hidden',
					padding: '8px 2px 0',
					boxSizing: 'border-box',
				}}
			>
				<div style={{ height: '100%', width: chartWidth ?? '100%' }}>
					<AreaChart
						h={266}
						data={chartData}
						dataKey="day"
						series={[
							{ name: 'gainsInCents', label: 'Ganhos', color: palette.income },
							{ name: 'expensesInCents', label: 'Despesas', color: palette.expense },
						]}
						curveType="natural"
						withGradient={false}
						fillOpacity={0.18}
						strokeWidth={2.5}
						withDots={showDots}
						dotProps={{ r: 3, strokeWidth: 1.5 }}
						activeDotProps={{ r: 5, strokeWidth: 2 }}
						withLegend
						withTooltip={!shouldHideValues}
						withYAxis={!shouldHideValues}
						tickLine="none"
						gridAxis="y"
						strokeDasharray="4 4"
						gridColor={palette.border}
						styles={{ root: { '--chart-text-color': palette.textMuted } }}
						valueFormatter={formatCurrency}
						xAxisProps={{ axisLine: false, tickLine: false, interval, minTickGap: 12 }}
						yAxisProps={{ axisLine: false, tickLine: false, width: 92 }}
						legendProps={{ verticalAlign: 'bottom', height: 30 }}
						tooltipProps={{
							cursor: { stroke: palette.border, strokeWidth: 1 },
						}}
					/>
				</div>
			</div>
		</MantineProvider>
	);
}
