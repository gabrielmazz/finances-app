import { useMemo } from 'react';
import { useLocalSearchParams } from 'expo-router';

import HomeScreen from '@/screens/HomeScreen';
import AddRegisterExpensesScreen from '@/screens/AddRegisterExpensesScreen';
import ConfigurationsScreen from '@/screens/ConfigurationsScreen';

const TAB_ITEMS = [
	{
		key: 'home',
		component: HomeScreen,
	},
	{
		key: 'control',
		component: AddRegisterExpensesScreen,
	},
	{
		key: 'configurations',
		component: ConfigurationsScreen,
	},
] as const;

export default function HomeRoute() {
	const { tab } = useLocalSearchParams<{ tab?: string }>();
	const tabCount = TAB_ITEMS.length;

	const parsedTabFromParams = useMemo(() => {
		const parsed = Number(tab);
		if (Number.isFinite(parsed)) {
			return Math.min(Math.max(Math.trunc(parsed), 0), tabCount - 1);
		}
		return 0;
	}, [tab, tabCount]);

	const normalizedIndex = Math.min(Math.max(parsedTabFromParams, 0), tabCount - 1);
	const ActiveComponent =
		TAB_ITEMS[normalizedIndex]?.component ?? TAB_ITEMS[0].component;

	return <ActiveComponent />;
}
