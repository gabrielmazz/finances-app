'use dom';

import '@mantine/core/styles.css';
import '@mantine/charts/styles.css';
import { DonutChart } from '@mantine/charts';
import { MantineProvider } from '@mantine/core';
import type { DOMProps } from 'expo/dom';
import { LUMUS_FONT_STACKS, LUMUS_RUNTIME_COLORS } from '@/design-system/tokens';

type CategoryAnalysisBankDonutItem = {
	name: string;
	valueInCents: number;
	color: string;
};

type CategoryAnalysisBankDonutChartProps = {
	data: CategoryAnalysisBankDonutItem[];
	size: number;
	totalInCents: number;
	isDarkMode: boolean;
	shouldHideValues: boolean;
	strokeColor: string;
	accessibilityLabel: string;
	dom?: DOMProps;
};

const formatCurrency = (valueInCents: number) =>
	new Intl.NumberFormat('pt-BR', {
		style: 'currency',
		currency: 'BRL',
		minimumFractionDigits: 2,
	}).format(valueInCents / 100);

export default function CategoryAnalysisBankDonutChart({
	data,
	size,
	totalInCents,
	isDarkMode,
	shouldHideValues,
	strokeColor,
	accessibilityLabel,
}: CategoryAnalysisBankDonutChartProps) {
	const colors = isDarkMode ? LUMUS_RUNTIME_COLORS.dark : LUMUS_RUNTIME_COLORS.light;

	return (
		<MantineProvider forceColorScheme={isDarkMode ? 'dark' : 'light'}>
			<style>{'html, body { background-color: transparent; }'}</style>
			<div
				role="img"
				aria-label={accessibilityLabel}
				style={{
					position: 'relative',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					height: size,
					width: size,
					fontFamily: LUMUS_FONT_STACKS.sans,
				}}
			>
				<DonutChart
					data={data.map(item => ({
						name: item.name,
						value: item.valueInCents,
						color: item.color,
					}))}
					size={size}
					thickness={30}
					strokeWidth={5}
					strokeColor={strokeColor}
					paddingAngle={1}
					withTooltip={!shouldHideValues}
					accessibilityLayer={!shouldHideValues}
					tooltipDataSource="segment"
					valueFormatter={value => (shouldHideValues ? '••••' : formatCurrency(value))}
				/>
				<div
					aria-hidden="true"
					style={{
						position: 'absolute',
						inset: 0,
						display: 'flex',
						flexDirection: 'column',
						alignItems: 'center',
						justifyContent: 'center',
						gap: 4,
						pointerEvents: 'none',
					}}
				>
					<span style={{ color: colors.textMuted, fontSize: 12, fontWeight: 700 }}>
						Total
					</span>
					<span style={{ color: colors.text, fontSize: 14, fontWeight: 700 }}>
						{shouldHideValues ? '••••' : formatCurrency(totalInCents)}
					</span>
				</div>
			</div>
		</MantineProvider>
	);
}
