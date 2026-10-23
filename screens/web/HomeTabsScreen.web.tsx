import { Redirect, useLocalSearchParams } from 'expo-router';

import { useRouteVisibility } from '@/contexts/RouteVisibilityContext';
import AddRegisterExpensesScreen from '@/screens/web/AddRegisterExpensesScreen.web';
import ConfigurationsScreen from '@/screens/web/ConfigurationsScreen.web';
import HomeScreen from '@/screens/web/HomeScreen.web';
import {
	createHomeHref,
	getVisibleHomeTab,
	normalizeHomeTabIndex,
} from '@/utils/navigation';

const TAB_SCREENS = [HomeScreen, AddRegisterExpensesScreen, ConfigurationsScreen] as const;

export default function HomeTabsScreenWeb() {
	const { tab } = useLocalSearchParams<{ tab?: string | string[] }>();
	const { isRouteVisible } = useRouteVisibility();
	const activeTabIndex = normalizeHomeTabIndex(tab);

	// [[Visibilidade de Rotas]]: nunca montar Dashboard/Controle ocultos, nem por link direto.
	const visibleTab = getVisibleHomeTab(activeTabIndex, isRouteVisible);
	if (visibleTab !== activeTabIndex) {
		return <Redirect href={createHomeHref(visibleTab)} />;
	}

	const ActiveScreen = TAB_SCREENS[activeTabIndex];
	return <ActiveScreen />;
}
