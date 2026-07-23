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
const LumusAssistantScreen = React.lazy(() => import('@/screens/LumusAssistantScreen'));

export default function LumusAssistantRoute() {
	return (
		<AssistantRouteBoundary>
			<React.Suspense fallback={<AssistantRouteLoading />}>
				<LumusAssistantProvider>
					<LumusAssistantScreen />
				</LumusAssistantProvider>
			</React.Suspense>
		</AssistantRouteBoundary>
	);
}
