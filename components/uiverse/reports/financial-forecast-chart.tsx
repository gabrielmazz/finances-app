'use dom';

import '@mantine/core/styles.css';
import '@mantine/charts/styles.css';
import { MantineProvider } from '@mantine/core';
import { LineChart } from '@mantine/charts';
import type { DOMProps } from 'expo/dom';
import { LUMUS_RUNTIME_COLORS } from '@/design-system/tokens';

type FinancialForecastChartDatum = {
	label: string;
	balanceInCents: number;
};

type FinancialForecastChartProps = {
	data: FinancialForecastChartDatum[];
	isDarkMode: boolean;
	shouldHideValues: boolean;
	dom?: DOMProps;
};

const formatCurrency = (valueInCents: number) =>
	new Intl.NumberFormat('pt-BR', {
		style: 'currency',
		currency: 'BRL',
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	}).format(valueInCents / 100);

export default function FinancialForecastChart({
	data,
	isDarkMode,
	shouldHideValues,
}: FinancialForecastChartProps) {
	const runtimeColors = isDarkMode ? LUMUS_RUNTIME_COLORS.dark : LUMUS_RUNTIME_COLORS.light;
	const chartWidth = data.length > 7 ? Math.max(520, 82 + data.length * 64) : undefined;
	const tooltipValueFormatter = (value: number) =>
		shouldHideValues ? '••••' : formatCurrency(value);

	return (
		<MantineProvider forceColorScheme={isDarkMode ? 'dark' : 'light'}>
			<style>{'html, body { background-color: transparent; }'}</style>
			<div
				style={{
					height: 280,
					width: '100%',
					backgroundColor: 'transparent',
					outline: 'none',
					overflowX: chartWidth ? 'auto' : 'hidden',
					overflowY: 'hidden',
					padding: '8px 2px 0',
					boxSizing: 'border-box',
				}}
			>
				<div style={{ height: '100%', width: chartWidth ?? '100%', minWidth: 1, minHeight: 1 }}>
					<LineChart
						h={260}
						styles={{ root: { minWidth: 1, minHeight: 1 } }}
						data={data}
						dataKey="label"
						series={[{ name: 'balanceInCents', label: 'Saldo previsto', color: runtimeColors.accent }]}
						curveType="monotone"
						strokeWidth={3}
						withDots
						dotProps={{ r: 4, strokeWidth: 2 }}
						activeDotProps={{ r: 6, strokeWidth: 2 }}
						withLegend={false}
						withTooltip={!shouldHideValues}
						withYAxis={!shouldHideValues}
						tickLine="none"
						gridAxis="y"
						strokeDasharray="4 4"
						textColor={runtimeColors.textMuted}
						gridColor={runtimeColors.border}
						valueFormatter={tooltipValueFormatter}
						xAxisProps={{ axisLine: false, tickLine: false }}
						yAxisProps={{ axisLine: false, tickLine: false, width: 78 }}
						tooltipProps={{ cursor: { stroke: runtimeColors.border, strokeWidth: 1 } }}
					/>
				</div>
			</div>
		</MantineProvider>
	);
}
