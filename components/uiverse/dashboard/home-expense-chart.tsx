'use dom';

import '@mantine/core/styles.css';
import '@mantine/charts/styles.css';
import { MantineProvider } from '@mantine/core';
import { Sparkline } from '@mantine/charts';
import type { DOMProps } from 'expo/dom';

type HomeExpenseChartProps = {
	data: number[];
	label: string;
	color: string;
	isDarkMode: boolean;
	dom?: DOMProps;
};

export default function HomeExpenseChart({
	data,
	label,
	color,
	isDarkMode,
}: HomeExpenseChartProps) {
	return (
		<MantineProvider forceColorScheme={isDarkMode ? 'dark' : 'light'}>
			<style>{'html, body { background-color: transparent !important; }'}</style>
			<div
				role="img"
				aria-label={label}
				style={{
					height: 52,
					width: 112,
					backgroundColor: 'transparent',
					boxSizing: 'border-box',
				}}
			>
				<Sparkline
					w={112}
					h={52}
					data={data}
					curveType="linear"
					color={color}
					fillOpacity={0.18}
					strokeWidth={2}
				/>
			</div>
		</MantineProvider>
	);
}
