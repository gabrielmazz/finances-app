import React from 'react';
import { FontAwesome6, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import type { StyleProp, TextStyle } from 'react-native';

import { TAG_ICON_OPTIONS, DEFAULT_TAG_ICON, resolveTagIconSelection, serializeTagIconSelection, type TagIconSelection } from '@/utils/tagIconCatalog';
export { TAG_ICON_OPTIONS, DEFAULT_TAG_ICON, buildTagIconKey, resolveTagIconSelection, serializeTagIconSelection } from '@/utils/tagIconCatalog';
export type { TagIconFamily, TagIconStyle, TagIconSelection, TagIconOption } from '@/utils/tagIconCatalog';

type TagIconProps = TagIconSelection & {
	size?: number;
	color?: string;
	style?: StyleProp<TextStyle>;
};

export function TagIcon({
	iconFamily,
	iconName,
	iconStyle,
	size = 20,
	color = '#0F172A',
	style,
}: TagIconProps) {
	const resolved = resolveTagIconSelection({
		iconFamily,
		iconName,
		iconStyle,
	});

	if (resolved.iconFamily === 'material-community') {
		return (
			<MaterialCommunityIcons
				name={resolved.iconName as React.ComponentProps<typeof MaterialCommunityIcons>['name']}
				size={size}
				color={color}
				style={style}
			/>
		);
	}

	if (resolved.iconFamily === 'font-awesome-6') {
		return (
			<FontAwesome6
				name={resolved.iconName as React.ComponentProps<typeof FontAwesome6>['name']}
				size={size}
				color={color}
				style={style}
				brand={resolved.iconStyle === 'brand'}
				regular={resolved.iconStyle === 'regular'}
				solid={resolved.iconStyle === 'solid'}
			/>
		);
	}

	return (
		<Ionicons
			name={resolved.iconName as React.ComponentProps<typeof Ionicons>['name']}
			size={size}
			color={color}
			style={style}
		/>
	);
}

export function useTagIcons() {
	const iconOptions = React.useMemo(() => TAG_ICON_OPTIONS, []);

	const resolveTagIcon = React.useCallback((selection?: TagIconSelection | null) => {
		return resolveTagIconSelection(selection);
	}, []);

	const getTagIconLabel = React.useCallback((selection?: TagIconSelection | null) => {
		return resolveTagIconSelection(selection).label;
	}, []);

	const serializeTagIcon = React.useCallback((selection?: TagIconSelection | null) => {
		return serializeTagIconSelection(selection);
	}, []);

	return {
		iconOptions,
		defaultTagIcon: DEFAULT_TAG_ICON,
		resolveTagIcon,
		getTagIconLabel,
		serializeTagIcon,
	};
}
