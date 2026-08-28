'use dom';

import '@mantine/core/styles.css';
import '@mantine/charts/styles.css';
import { RadarChart } from '@mantine/charts';
import { MantineProvider } from '@mantine/core';
import type { DOMProps } from 'expo/dom';

type MandatoryExpensesRadarDatum = {
	category: string;
	valueInCents: number;
};

type MandatoryExpensesRadarChartProps = {
	data: MandatoryExpensesRadarDatum[];
	isDarkMode: boolean;
	shouldHideValues: boolean;
	dom?: DOMProps;
};

const formatCurrency = (valueInReais: number) =>
	new Intl.NumberFormat('pt-BR', {
		style: 'currency',
		currency: 'BRL',
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(valueInReais);

const finiteOrZero = (value: number) => (Number.isFinite(value) ? value : 0);

export default function MandatoryExpensesRadarChart({
	data,
	isDarkMode,
	shouldHideValues,
}: MandatoryExpensesRadarChartProps) {
	const textColor = isDarkMode ? '#CBD5E1' : '#475569';
	const gridColor = isDarkMode ? '#334155' : '#CBD5E1';
	const chartData = data.map(item => ({
		category: item.category,
		valueInReais: shouldHideValues ? 1 : Math.max(0, finiteOrZero(item.valueInCents)) / 100,
	}));

	return (
		<MantineProvider forceColorScheme={isDarkMode ? 'dark' : 'light'}>
			<style>{'html, body { background-color: transparent !important; }'}</style>
			<div
				role="img"
				aria-label={
					shouldHideValues
						? 'Distribuição dos gastos obrigatórios por categoria. Valores ocultos.'
						: 'Distribuição dos gastos obrigatórios por categoria.'
				}
				style={{
					height: 300,
					width: '100%',
					backgroundColor: 'transparent',
					boxSizing: 'border-box',
				}}
			>
				{chartData.length > 0 ? (
					<RadarChart
						h={300}
						data={chartData}
						dataKey="category"
						withPolarRadiusAxis={false}
						withPolarGrid
						withPolarAngleAxis
						withDots
						withTooltip={!shouldHideValues}
						series={[{
							name: 'valueInReais',
							label: 'Gasto obrigatório',
							color: '#F97316',
							strokeColor: '#EA580C',
							opacity: 0.24,
						}]}
						textColor={textColor}
						gridColor={gridColor}
						dotProps={{ r: 3, strokeWidth: 1 }}
						polarAngleAxisProps={{ tick: { fill: textColor, fontSize: 10 } }}
						tooltipProps={{
							formatter: (value: unknown) => formatCurrency(Number(value)),
						}}
					/>
				) : (
					<div style={{ color: textColor, fontSize: 13, padding: '120px 16px', textAlign: 'center' }}>
						Nenhuma categoria disponível.
					</div>
				)}
			</div>
		</MantineProvider>
	);
}
