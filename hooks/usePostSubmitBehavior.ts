import React from 'react';
import { Keyboard } from 'react-native';

import {
	type PostSubmitDestinationKey,
	type PostSubmitScreenKey,
	usePostSubmitBehaviorPreferences,
} from '@/contexts/PostSubmitBehaviorContext';
import {
	APP_ROUTE_PATHS,
	HOME_TAB_INDEX,
	dismissToRoute,
	navigateToHomeTab,
} from '@/utils/navigation';

type ApplyPostSubmitBehaviorOptions = {
	resetForm?: () => void;
};

const navigateToPostSubmitDestination = (destination: PostSubmitDestinationKey) => {
	Keyboard.dismiss();

	switch (destination) {
		case 'homeDashboard':
			navigateToHomeTab(HOME_TAB_INDEX.dashboard);
			return;
		case 'homeControl':
			navigateToHomeTab(HOME_TAB_INDEX.control);
			return;
		case 'homeConfigurations':
			navigateToHomeTab(HOME_TAB_INDEX.config);
			return;
		case 'categoryAnalysis':
			dismissToRoute(APP_ROUTE_PATHS.categoryAnalysis);
			return;
		case 'addRegisterExpenses':
			dismissToRoute(APP_ROUTE_PATHS.addRegisterExpenses);
			return;
		case 'addRegisterGain':
			dismissToRoute(APP_ROUTE_PATHS.addRegisterGain);
			return;
		case 'registerMonthlyBalance':
			dismissToRoute(APP_ROUTE_PATHS.registerMonthlyBalance);
			return;
		case 'transferScreen':
			dismissToRoute(APP_ROUTE_PATHS.transferScreen);
			return;
		case 'addRescue':
			dismissToRoute(APP_ROUTE_PATHS.addRescue);
			return;
		case 'mandatoryExpenses':
			dismissToRoute(APP_ROUTE_PATHS.mandatoryExpenses);
			return;
		case 'mandatoryGains':
			dismissToRoute(APP_ROUTE_PATHS.mandatoryGains);
			return;
		case 'financialList':
			dismissToRoute(APP_ROUTE_PATHS.financialList);
			return;
		case 'addRegisterBank':
			dismissToRoute(APP_ROUTE_PATHS.addRegisterBank);
			return;
		case 'addRegisterTag':
			dismissToRoute(APP_ROUTE_PATHS.addRegisterTag);
			return;
		case 'addRegisterUser':
			dismissToRoute(APP_ROUTE_PATHS.addRegisterUser);
			return;
		case 'addUserRelation':
			dismissToRoute(APP_ROUTE_PATHS.addUserRelation);
			return;
		default:
			navigateToHomeTab(HOME_TAB_INDEX.dashboard);
	}
};

export const usePostSubmitBehavior = (screenKey: PostSubmitScreenKey) => {
	const { getBehaviorForScreen } = usePostSubmitBehaviorPreferences();

	return React.useCallback(
		(options: ApplyPostSubmitBehaviorOptions = {}) => {
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
