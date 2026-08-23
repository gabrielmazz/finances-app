'use dom';

import '@mantine/core/styles.css';
import '@mantine/charts/styles.css';
import { DonutChart } from '@mantine/charts';
import { MantineProvider } from '@mantine/core';
import type { DOMProps } from 'expo/dom';

type HomeInvestmentChartItem = {
	name: string;
	valueInCents: number;
	color: string;
};

type HomeInvestmentChartProps = {
	items: HomeInvestmentChartItem[];
	investmentCount: number;
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

export default function HomeInvestmentChart({
	items,
	investmentCount,
	isDarkMode,
	shouldHideValues,
}: HomeInvestmentChartProps) {
	const textColor = isDarkMode ? '#F8FAFC' : '#0F172A';

	return (
		<MantineProvider forceColorScheme={isDarkMode ? 'dark' : 'light'}>
			<style>{'html, body { background-color: transparent !important; }'}</style>
			<div
				role="img"
				aria-label={`Distribuição de ${investmentCount} ${investmentCount === 1 ? 'investimento' : 'investimentos'}`}
				style={{
					height: 224,
					width: 224,
					backgroundColor: 'transparent',
					color: textColor,
				}}
			>
				<DonutChart
					data={items.map(item => ({
						name: item.name,
						value: item.valueInCents,
						color: item.color,
					}))}
					size={224}
					thickness={42}
					strokeWidth={5}
					strokeColor={isDarkMode ? '#1E293B' : '#FFFFFF'}
					paddingAngle={1}
					chartLabel={`${investmentCount} ${investmentCount === 1 ? 'ativo' : 'ativos'}`}
					withTooltip={!shouldHideValues}
					tooltipDataSource="segment"
					valueFormatter={value => (shouldHideValues ? '••••' : formatCurrency(value))}
					styles={{
						label: { fill: textColor, fontSize: 12, fontWeight: 700 },
					}}
				/>
			</div>
		</MantineProvider>
	);
}
