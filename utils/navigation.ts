import { Keyboard } from 'react-native';
import { router } from 'expo-router';

export const HOME_DASHBOARD_ROUTE = '/home?tab=0' as const;

export const navigateToHomeDashboard = () => {
	Keyboard.dismiss();
	// Fluxo documentado em Arquitetura/Navegação.md: submits e retornos de telas de controle voltam para a Home sem depender de router.back().
	router.dismissTo(HOME_DASHBOARD_ROUTE);
};

export const navigateBackOrHomeDashboard = () => {
	Keyboard.dismiss();

	if (router.canGoBack()) {
		router.back();
		return;
	}

	router.dismissTo(HOME_DASHBOARD_ROUTE);
};
