import React from 'react';

import { AssistantRouteBoundary } from '@/components/uiverse/assistant/assistant-route-boundary';
import LumusAssistantScreen from '@/screens/web/LumusAssistantScreen.web';

export default function LumusAssistantRoute() {
	return (
		<AssistantRouteBoundary>
			{/* [[Assistente Lumus]]: a sessão no AppRoot preserva a conversa ao navegar; esta rota apenas apresenta a tela. */}
			<LumusAssistantScreen />
		</AssistantRouteBoundary>
	);
}
