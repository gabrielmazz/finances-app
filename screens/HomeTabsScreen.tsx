import { useCallback } from 'react';
import { BackHandler } from 'react-native';
import { Redirect, useFocusEffect, useLocalSearchParams } from 'expo-router';

import { useRouteVisibility } from '@/contexts/RouteVisibilityContext';
import AddRegisterExpensesScreen from '@/screens/AddRegisterExpensesScreen';
import ConfigurationsScreen from '@/screens/ConfigurationsScreen';
import HomeScreen from '@/screens/HomeScreen';
import {
	HOME_DASHBOARD_ROUTE,
	normalizeHomeTabIndex,
} from '@/utils/navigation';

const TAB_SCREENS = [HomeScreen, AddRegisterExpensesScreen, ConfigurationsScreen] as const;

export default function HomeTabsScreen() {
	const { tab } = useLocalSearchParams<{ tab?: string | string[] }>();
	const { isRouteVisible } = useRouteVisibility();
	const activeTabIndex = normalizeHomeTabIndex(tab);

	useFocusEffect(
		useCallback(() => {
			const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
				BackHandler.exitApp();
				return true;
			});

			return () => subscription.remove();
		}, []),
	);

	// [[Visibilidade de Rotas]]: a aba Controle reutiliza o formulário de
	// despesas e não pode oferecer uma rota que foi ocultada neste aparelho.
	if (activeTabIndex === 1 && !isRouteVisible('addRegisterExpenses')) {
		return <Redirect href={HOME_DASHBOARD_ROUTE} />;
	}

	const ActiveScreen = TAB_SCREENS[activeTabIndex];
	return <ActiveScreen />;
}
