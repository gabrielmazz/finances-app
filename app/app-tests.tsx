import React from 'react';

import {
	AssistantRouteBoundary,
	AssistantRouteLoading,
} from '@/components/uiverse/assistant-route-boundary';

const LumusAssistantProvider = React.lazy(() =>
	import('@/contexts/LumusAssistantContext').then(module => ({
		default: module.LumusAssistantProvider,
	})),
);
const AppTestsScreen = React.lazy(() => import('@/screens/AppTestsScreen'));

export default function AppTestsRoute() {
	return (
		<AssistantRouteBoundary>
			<React.Suspense fallback={<AssistantRouteLoading />}>
				<LumusAssistantProvider>
					<AppTestsScreen />
				</LumusAssistantProvider>
			</React.Suspense>
		</AssistantRouteBoundary>
	);
}
