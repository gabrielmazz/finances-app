'use dom';

import '@mantine/core/styles.css';
import '@mantine/charts/styles.css';
import { ScatterChart } from '@mantine/charts';
import { MantineProvider } from '@mantine/core';
import type { DOMProps } from 'expo/dom';

type MandatoryExpensesScatterPoint = {
	weekday: number;
	dayOfMonth: number;
};

type MandatoryExpensesScatterSeries = {
	name: string;
	color: string;
	data: MandatoryExpensesScatterPoint[];
};

type MandatoryExpensesScatterChartProps = {
	data: MandatoryExpensesScatterSeries[];
	isDarkMode: boolean;
	subjectLabel?: string;
	dom?: DOMProps;
};

const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export default function MandatoryExpensesScatterChart({
	data,
	isDarkMode,
	subjectLabel = 'vencimentos de gastos obrigatórios',
}: MandatoryExpensesScatterChartProps) {
	const textColor = isDarkMode ? '#CBD5E1' : '#475569';
	const gridColor = isDarkMode ? '#334155' : '#CBD5E1';
	const pointCount = data.reduce((total, series) => total + series.data.length, 0);

	return (
		<MantineProvider forceColorScheme={isDarkMode ? 'dark' : 'light'}>
			<style>{'html, body { background-color: transparent !important; }'}</style>
			<div
				role="img"
				aria-label={`Concentração dos ${subjectLabel} por dia da semana e dia do mês.`}
				style={{
					height: 320,
					width: '100%',
					backgroundColor: 'transparent',
					boxSizing: 'border-box',
				}}
			>
				{pointCount > 0 ? (
					<ScatterChart
						h={320}
						data={data}
						dataKey={{ x: 'weekday', y: 'dayOfMonth' }}
						labels={{ x: 'Dia da semana', y: 'Dia do mês' }}
						withLegend
						withTooltip
						textColor={textColor}
						gridColor={gridColor}
						strokeDasharray="4 4"
						xAxisProps={{
							type: 'number',
							domain: [0, 6],
							ticks: [0, 1, 2, 3, 4, 5, 6],
							allowDecimals: false,
							axisLine: false,
							tickLine: false,
						}}
						yAxisProps={{
							type: 'number',
							domain: [1, 31],
							ticks: [1, 5, 10, 15, 20, 25, 31],
							allowDecimals: false,
							axisLine: false,
							tickLine: false,
						}}
						valueFormatter={{
							x: value => WEEKDAY_LABELS[Math.round(value)] ?? String(value),
							y: value => `Dia ${value}`,
						}}
						legendProps={{ verticalAlign: 'bottom', height: 24 }}
						scatterProps={{ shape: <circle r={5} /> }}
					/>
				) : (
					<div style={{ color: textColor, fontSize: 13, padding: '130px 16px', textAlign: 'center' }}>
						Nenhum cadastro disponível.
					</div>
				)}
			</div>
		</MantineProvider>
	);
}
