import { useCallback, useMemo } from 'react';
import { BackHandler } from 'react-native';
import { Redirect, useFocusEffect, useLocalSearchParams } from 'expo-router';

import HomeScreen from '@/screens/HomeScreen';
import AddRegisterExpensesScreen from '@/screens/AddRegisterExpensesScreen';
import ConfigurationsScreen from '@/screens/ConfigurationsScreen';
import { useRouteVisibility } from '@/contexts/RouteVisibilityContext';
import { HOME_DASHBOARD_ROUTE } from '@/utils/navigation';

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
	const { isRouteVisible } = useRouteVisibility();
	const tabCount = TAB_ITEMS.length;

	useFocusEffect(
		useCallback(() => {
			const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
				BackHandler.exitApp();
				return true;
			});

			return () => subscription.remove();
		}, []),
	);

	const parsedTabFromParams = useMemo(() => {
		const parsed = Number(tab);
		if (Number.isFinite(parsed)) {
			return Math.min(Math.max(Math.trunc(parsed), 0), tabCount - 1);
		}
		return 0;
	}, [tab, tabCount]);

	const normalizedIndex = Math.min(Math.max(parsedTabFromParams, 0), tabCount - 1);

	// [[Visibilidade de Rotas]]: a aba Controle reutiliza o formulário de
	// despesas e não pode oferecer uma rota que foi ocultada neste aparelho.
	if (normalizedIndex === 1 && !isRouteVisible('addRegisterExpenses')) {
		return <Redirect href={HOME_DASHBOARD_ROUTE} />;
	}

	const ActiveComponent =
		TAB_ITEMS[normalizedIndex]?.component ?? TAB_ITEMS[0].component;

	return <ActiveComponent />;
}
