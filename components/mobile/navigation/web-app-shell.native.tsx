import React from 'react';
import { View } from 'react-native';
type WebAppShellProps = React.PropsWithChildren<{
	isAuthenticated: boolean;
}>;

/**
 * Mantém o Stack no workspace Web sem afetar a composição nativa. O navigator
 * continua centralizando rotas e visibilidade, agora em painel sobreposto.
 */
export default function WebAppShell({ children }: WebAppShellProps) {
	return (
		<View className="flex-1">
			<View className="min-w-0 flex-1">
				<View className="min-w-0 flex-1">{children}</View>
			</View>
		</View>
	);
}
