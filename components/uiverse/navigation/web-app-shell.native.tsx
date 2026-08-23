import React from 'react';
import { StyleSheet, View } from 'react-native';
type WebAppShellProps = React.PropsWithChildren<{
	isAuthenticated: boolean;
}>;

/**
 * Mantém o Stack no workspace Web sem afetar a composição nativa. O navigator
 * continua centralizando rotas e visibilidade, agora em painel sobreposto.
 */
export default function WebAppShell({ children }: WebAppShellProps) {
	return (
		<View style={styles.frame}>
			<View style={styles.workspace}>
				<View style={styles.content}>{children}</View>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	frame: {
		flex: 1,
	},
	workspace: {
		flex: 1,
		minWidth: 0,
	},
	content: {
		flex: 1,
		minWidth: 0,
	},
});
