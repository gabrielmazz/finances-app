import { Keyboard } from 'react-native';
import { router } from 'expo-router';

export const HOME_DASHBOARD_ROUTE = {
	pathname: '/home',
	params: { tab: '0' },
} as const;

const dismissStackIfPossible = () => {
	try {
		if (router.canDismiss()) {
			router.dismissAll();
		}
	} catch {
		// O retorno documentado em Arquitetura/Navegação.md não pode depender do POP_TO em produção.
	}
};

export const navigateToHomeDashboard = () => {
	Keyboard.dismiss();
	// Fluxo documentado em Arquitetura/Navegação.md: submits e retornos de telas de controle sempre finalizam na Home.
	dismissStackIfPossible();
	router.replace(HOME_DASHBOARD_ROUTE);
};

export const navigateBackOrHomeDashboard = () => {
	Keyboard.dismiss();

	if (router.canGoBack()) {
		router.back();
		return;
	}

	dismissStackIfPossible();
	router.replace(HOME_DASHBOARD_ROUTE);
};
