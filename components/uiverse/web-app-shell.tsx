import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { useAppTheme } from '@/contexts/ThemeContext';
type WebAppShellProps = React.PropsWithChildren<{
	isAuthenticated: boolean;
}>;

/**
 * Mantém o Stack no workspace Web sem afetar a composição nativa. O navigator
 * continua centralizando rotas e visibilidade, agora em painel sobreposto.
 */
export default function WebAppShell({ children, isAuthenticated }: WebAppShellProps) {
	const { isDarkMode } = useAppTheme();
	const usesWorkspaceBackground = isAuthenticated && Platform.OS === 'web';

	return (
		<View
			style={[
				styles.frame,
				usesWorkspaceBackground && { backgroundColor: isDarkMode ? '#020617' : '#f8fafc' },
			]}
		>
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
