import React from 'react';

import { AssistantRouteBoundary } from '@/components/uiverse/assistant-route-boundary';
import { LumusAssistantProvider } from '@/contexts/LumusAssistantContext';
import LumusAssistantScreen from '@/screens/LumusAssistantScreen';

export default function LumusAssistantRoute() {
	return (
		<AssistantRouteBoundary>
			{/* [[Assistente Lumus]]: a rota monta a tela de imediato; a disponibilidade da IA é resolvida dentro do painel. */}
			<LumusAssistantProvider>
				<LumusAssistantScreen />
			</LumusAssistantProvider>
		</AssistantRouteBoundary>
	);
}
