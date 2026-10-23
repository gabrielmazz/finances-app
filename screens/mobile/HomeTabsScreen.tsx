import { useCallback } from 'react';
import { BackHandler } from 'react-native';
import { Redirect, useFocusEffect, useLocalSearchParams } from 'expo-router';

import { useRouteVisibility } from '@/contexts/RouteVisibilityContext';
import AddRegisterExpensesScreen from '@/screens/mobile/AddRegisterExpensesScreen';
import ConfigurationsScreen from '@/screens/mobile/ConfigurationsScreen';
import HomeScreen from '@/screens/mobile/HomeScreen';
import {
	createHomeHref,
	getVisibleHomeTab,
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

	// [[Visibilidade de Rotas]]: nunca montar Dashboard/Controle ocultos, nem por link direto.
	const visibleTab = getVisibleHomeTab(activeTabIndex, isRouteVisible);
	if (visibleTab !== activeTabIndex) {
		return <Redirect href={createHomeHref(visibleTab)} />;
	}

	const ActiveScreen = TAB_SCREENS[activeTabIndex];
	return <ActiveScreen />;
}
