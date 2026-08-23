'use dom';

import '@mantine/core/styles.css';
import '@mantine/charts/styles.css';
import { BulletChart } from '@mantine/charts';
import { MantineProvider } from '@mantine/core';
import type { DOMProps } from 'expo/dom';

type MandatoryExpensePaymentBulletChartProps = {
	valueInCents: number;
	targetInCents: number;
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

const finiteOrZero = (value: number) => (Number.isFinite(value) ? value : 0);

export default function MandatoryExpensePaymentBulletChart({
	valueInCents,
	targetInCents,
	isDarkMode,
	shouldHideValues,
}: MandatoryExpensePaymentBulletChartProps) {
	const target = Math.max(1, finiteOrZero(targetInCents));
	const value = Math.min(Math.max(finiteOrZero(valueInCents), 0), target);
	const trackColor = isDarkMode ? '#A16207' : '#FDE047';
	const progressColor = isDarkMode ? '#34D399' : '#16A34A';
	const markerColor = isDarkMode ? '#FEF08A' : '#7C3AED';
	const ranges = [{ value: target, color: trackColor }];
	const accessibilityLabel = shouldHideValues
		? 'Progresso dos pagamentos de despesas obrigatórias. Valores ocultos.'
		: `Progresso dos pagamentos de despesas obrigatórias: ${formatCurrency(value)} de ${formatCurrency(target)}.`;

	return (
		<MantineProvider forceColorScheme={isDarkMode ? 'dark' : 'light'}>
			<style>{'html, body { background-color: transparent !important; }'}</style>
			<div role="img" aria-label={accessibilityLabel} style={{ width: '100%' }}>
				<BulletChart
					value={value}
					target={target}
					ranges={ranges}
					barColor={progressColor}
					targetColor={markerColor}
					size={36}
					barSize={18}
					withTooltip={!shouldHideValues}
					valueFormatter={chartValue =>
						shouldHideValues ? '••••' : formatCurrency(chartValue)
					}
				/>
			</div>
		</MantineProvider>
	);
}
