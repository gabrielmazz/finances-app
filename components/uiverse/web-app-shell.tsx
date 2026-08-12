import React from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';

import { useAppTheme } from '@/contexts/ThemeContext';
import {
	isWebDesktopLayout,
	WEB_SIDEBAR_GUTTER,
	WEB_SIDEBAR_WIDTH,
} from '@/utils/webLayout';

const WEB_CONTENT_MAX_WIDTH = 1440;

type WebAppShellProps = React.PropsWithChildren<{
	isAuthenticated: boolean;
}>;

/**
 * Mantém o Stack dentro de uma área de trabalho no navegador sem afetar a
 * composição nativa. A sidebar em si continua sendo renderizada pelo
 * navigator, que já centraliza as rotas e a visibilidade do domínio.
 */
export default function WebAppShell({ children, isAuthenticated }: WebAppShellProps) {
	const { isDarkMode } = useAppTheme();
	const { width } = useWindowDimensions();
	const isDesktopWeb = isWebDesktopLayout(Platform.OS, width);
	const usesDesktopWorkspace = isAuthenticated && isDesktopWeb;

	return (
		<View
			style={[
				styles.frame,
				usesDesktopWorkspace && { backgroundColor: isDarkMode ? '#020617' : '#f8fafc' },
			]}
		>
			<View style={[styles.workspace, usesDesktopWorkspace && styles.desktopWorkspace]}>
				<View style={[styles.content, usesDesktopWorkspace && styles.desktopContent]}>{children}</View>
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
	desktopWorkspace: {
		marginLeft: WEB_SIDEBAR_WIDTH + WEB_SIDEBAR_GUTTER * 2,
		marginRight: WEB_SIDEBAR_GUTTER,
	},
	content: {
		flex: 1,
		minWidth: 0,
	},
	desktopContent: {
		width: '100%',
		maxWidth: WEB_CONTENT_MAX_WIDTH,
		alignSelf: 'center',
	},
});
