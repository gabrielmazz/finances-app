'use dom';

import '@mantine/core/styles.css';
import '@mantine/charts/styles.css';
import { MantineProvider } from '@mantine/core';
import { AreaChart } from '@mantine/charts';
import type { DOMProps } from 'expo/dom';

type InvestmentEvolutionChartDatum = {
	label: string;
	netAppliedInCents: number;
	projectedValueInCents: number;
};

type InvestmentEvolutionChartProps = {
	data: InvestmentEvolutionChartDatum[];
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

export default function InvestmentEvolutionChart({
	data,
	isDarkMode,
	shouldHideValues,
}: InvestmentEvolutionChartProps) {
	const textColor = isDarkMode ? 'gray.4' : 'gray.6';
	const gridColor = isDarkMode ? 'dark.4' : 'gray.2';
	const chartWidth = data.length > 7 ? Math.max(520, 82 + data.length * 64) : undefined;

	return (
		<MantineProvider forceColorScheme={isDarkMode ? 'dark' : 'light'}>
			<style>{'html, body { background-color: transparent !important; } html, body, #root, #root * { outline: none !important; }'}</style>
			<div
				style={{
					height: 292,
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
						h={272}
						data={data}
						dataKey="label"
						series={[
							{ name: 'netAppliedInCents', label: 'Capital líquido', color: 'blue.5' },
							{ name: 'projectedValueInCents', label: 'Patrimônio estimado', color: 'violet.5' },
						]}
						fillOpacity={0}
						curveType="monotone"
						strokeWidth={3}
						withDots
						dotProps={{ r: 4, strokeWidth: 2 }}
						activeDotProps={{ r: 6, strokeWidth: 2 }}
						withLegend
						withTooltip={!shouldHideValues}
						withYAxis={!shouldHideValues}
						tickLine="none"
						gridAxis="y"
						strokeDasharray="4 4"
						textColor={textColor}
						gridColor={gridColor}
						valueFormatter={value => (shouldHideValues ? '••••' : formatCurrency(value))}
						xAxisProps={{ axisLine: false, tickLine: false }}
						yAxisProps={{ axisLine: false, tickLine: false, width: 78 }}
						legendProps={{ verticalAlign: 'bottom', height: 30 }}
						tooltipProps={{
							cursor: { stroke: isDarkMode ? '#475569' : '#CBD5E1', strokeWidth: 1 },
						}}
					/>
				</div>
			</div>
		</MantineProvider>
	);
}
