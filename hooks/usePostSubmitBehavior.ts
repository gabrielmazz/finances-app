import React from 'react';
import { useIsFocused } from '@react-navigation/native';

import {
	type PostSubmitDestinationKey,
	type PostSubmitScreenKey,
	usePostSubmitBehaviorPreferences,
} from '@/contexts/PostSubmitBehaviorContext';
import {
	APP_ROUTE_PATHS,
	HOME_TAB_INDEX,
	redirectToHomeTab,
	redirectToRoute,
} from '@/utils/navigation';

type ApplyPostSubmitBehaviorOptions = {
	resetForm?: () => void;
};

const navigateToPostSubmitDestination = (destination: PostSubmitDestinationKey) => {
	switch (destination) {
		case 'homeDashboard':
			redirectToHomeTab(HOME_TAB_INDEX.dashboard);
			return;
		case 'homeControl':
			redirectToHomeTab(HOME_TAB_INDEX.control);
			return;
		case 'homeConfigurations':
			redirectToHomeTab(HOME_TAB_INDEX.config);
			return;
		case 'categoryAnalysis':
			redirectToRoute(APP_ROUTE_PATHS.categoryAnalysis);
			return;
		case 'addRegisterExpenses':
			redirectToRoute(APP_ROUTE_PATHS.addRegisterExpenses);
			return;
		case 'addRegisterGain':
			redirectToRoute(APP_ROUTE_PATHS.addRegisterGain);
			return;
		case 'registerMonthlyBalance':
			redirectToRoute(APP_ROUTE_PATHS.registerMonthlyBalance);
			return;
		case 'transferScreen':
			redirectToRoute(APP_ROUTE_PATHS.transferScreen);
			return;
		case 'addRescue':
			redirectToRoute(APP_ROUTE_PATHS.addRescue);
			return;
		case 'mandatoryExpenses':
			redirectToRoute(APP_ROUTE_PATHS.mandatoryExpenses);
			return;
		case 'mandatoryGains':
			redirectToRoute(APP_ROUTE_PATHS.mandatoryGains);
			return;
		case 'financialList':
			redirectToRoute(APP_ROUTE_PATHS.financialList);
			return;
		case 'addRegisterBank':
			redirectToRoute(APP_ROUTE_PATHS.addRegisterBank);
			return;
		case 'addRegisterTag':
			redirectToRoute(APP_ROUTE_PATHS.addRegisterTag);
			return;
		case 'addRegisterUser':
			redirectToRoute(APP_ROUTE_PATHS.addRegisterUser);
			return;
		case 'addUserRelation':
			redirectToRoute(APP_ROUTE_PATHS.addUserRelation);
			return;
		default:
			redirectToHomeTab(HOME_TAB_INDEX.dashboard);
	}
};

export const usePostSubmitBehavior = (screenKey: PostSubmitScreenKey) => {
	const { getBehaviorForScreen } = usePostSubmitBehaviorPreferences();
	const isFocused = useIsFocused();
	const isFocusedRef = React.useRef(isFocused);

	React.useEffect(() => {
		isFocusedRef.current = isFocused;

		return () => {
			isFocusedRef.current = false;
		};
	}, [isFocused]);

	return React.useCallback(
		(options: ApplyPostSubmitBehaviorOptions = {}) => {
			// Uma requisição concluída depois que a tela perdeu foco não pode
			// sequestrar a rota atual nem limpar estado de um formulário desmontado.
			if (!isFocusedRef.current) {
				return;
			}

			const behavior = getBehaviorForScreen(screenKey);

			if (behavior.shouldReturnAfterSubmit) {
				navigateToPostSubmitDestination(behavior.returnDestination);
				return;
			}

			if (behavior.shouldClearFieldsAfterSubmit) {
				options.resetForm?.();
			}
		},
		[getBehaviorForScreen, screenKey],
	);
};
