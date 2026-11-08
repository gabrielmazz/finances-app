import React from 'react';
import { View } from 'react-native';

import WebRouteTransition from '@/components/uiverse/navigation/web-route-transition';
type WebAppShellProps = React.PropsWithChildren<{
	showWorkspace: boolean;
}>;

/**
 * Mantém o Stack no workspace Web sem afetar a composição nativa. O navigator
 * continua centralizando rotas e visibilidade, agora em painel sobreposto.
 */
export default function WebAppShell({ children, showWorkspace }: WebAppShellProps) {
	const usesWorkspaceBackground = showWorkspace;

	return (
		<View
			className={`flex-1 ${usesWorkspaceBackground ? 'bg-slate-50 dark:bg-slate-950' : ''}`}
		>
			<View className="min-w-0 flex-1">
				<View className="min-w-0 flex-1">{children}</View>
			</View>
			{usesWorkspaceBackground ? <WebRouteTransition /> : null}
		</View>
	);
}
