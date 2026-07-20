'use dom';

import '@mantine/core/styles.css';
import '@mantine/charts/styles.css';
import { MantineProvider } from '@mantine/core';
import { LineChart } from '@mantine/charts';
import type { DOMProps } from 'expo/dom';

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
	const textColor = isDarkMode ? 'gray.4' : 'gray.6';
	const gridColor = isDarkMode ? 'dark.4' : 'gray.2';
	const chartWidth = data.length > 7 ? Math.max(520, 82 + data.length * 64) : undefined;
	const tooltipValueFormatter = (value: number) =>
		shouldHideValues ? '••••' : formatCurrency(value);

	return (
		<MantineProvider forceColorScheme={isDarkMode ? 'dark' : 'light'}>
			<style>{'html, body { background-color: transparent !important; } html, body, #root, #root * { outline: none !important; }'}</style>
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
				<div style={{ height: '100%', width: chartWidth ?? '100%' }}>
					<LineChart
						h={260}
						data={data}
						dataKey="label"
						series={[{ name: 'balanceInCents', label: 'Saldo previsto', color: 'yellow.5' }]}
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
						textColor={textColor}
						gridColor={gridColor}
						valueFormatter={tooltipValueFormatter}
						xAxisProps={{ axisLine: false, tickLine: false }}
						yAxisProps={{ axisLine: false, tickLine: false, width: 78 }}
						tooltipProps={{ cursor: { stroke: isDarkMode ? '#475569' : '#CBD5E1', strokeWidth: 1 } }}
					/>
				</div>
			</div>
		</MantineProvider>
	);
}
