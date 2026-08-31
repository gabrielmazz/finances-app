import { Redirect, useLocalSearchParams } from 'expo-router';

import { useRouteVisibility } from '@/contexts/RouteVisibilityContext';
import AddRegisterExpensesScreen from '@/screens/web/AddRegisterExpensesScreen.web';
import ConfigurationsScreen from '@/screens/mobile/ConfigurationsScreen';
import HomeScreen from '@/screens/web/HomeScreen.web';
import {
	HOME_DASHBOARD_ROUTE,
	normalizeHomeTabIndex,
} from '@/utils/navigation';

const TAB_SCREENS = [HomeScreen, AddRegisterExpensesScreen, ConfigurationsScreen] as const;

export default function HomeTabsScreenWeb() {
	const { tab } = useLocalSearchParams<{ tab?: string | string[] }>();
	const { isRouteVisible } = useRouteVisibility();
	const activeTabIndex = normalizeHomeTabIndex(tab);

    // [[Visibilidade de Rotas]]: a aba Controle reutiliza o formulário de
	// despesas e não pode oferecer uma rota que foi ocultada neste aparelho.
	if (activeTabIndex === 1 && !isRouteVisible('addRegisterExpenses')) {
		return <Redirect href={HOME_DASHBOARD_ROUTE} />;
	}

	const ActiveScreen = TAB_SCREENS[activeTabIndex];
	return <ActiveScreen />;
}
