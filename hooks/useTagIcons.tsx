import { FontAwesome6,Ionicons,MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import type { StyleProp,TextStyle } from 'react-native';

import { buildTagIconKey,DEFAULT_TAG_ICON,resolveTagIconSelection,serializeTagIconSelection,TAG_ICON_OPTIONS,type TagIconOption,type TagIconSelection } from '@/utils/tagIconCatalog';
export { buildTagIconKey,DEFAULT_TAG_ICON,resolveTagIconSelection,serializeTagIconSelection,TAG_ICON_OPTIONS } from '@/utils/tagIconCatalog';
export type { TagIconFamily,TagIconOption,TagIconSelection,TagIconStyle } from '@/utils/tagIconCatalog';

function resolveStoredIcon(selection?: TagIconSelection | null): TagIconOption {
	const catalog = resolveTagIconSelection(selection);
	const { iconFamily, iconName, iconStyle } = selection ?? {};
	if (catalog !== DEFAULT_TAG_ICON || !iconName) return catalog;
	const supported = iconFamily === 'ionicons' ? Object.prototype.hasOwnProperty.call(Ionicons.getRawGlyphMap(), iconName)
		: iconFamily === 'material-community' ? Object.prototype.hasOwnProperty.call(MaterialCommunityIcons.getRawGlyphMap(), iconName)
		: iconFamily === 'font-awesome-6' && Object.prototype.hasOwnProperty.call(FontAwesome6.getRawGlyphMap(), iconName);
	if (!supported || !['ionicons', 'material-community', 'font-awesome-6'].includes(iconFamily ?? '')) return catalog;
	const family = iconFamily as TagIconOption['iconFamily'];
	const storedStyle = iconStyle === 'brand' || iconStyle === 'regular' || iconStyle === 'solid' ? iconStyle : undefined;
	return { key: buildTagIconKey({ iconFamily: family, iconName, iconStyle: storedStyle }), label: iconName, iconFamily: family, iconName, iconStyle: storedStyle };
}

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
	const resolved = resolveStoredIcon({
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
		return resolveStoredIcon(selection);
	}, []);

	const getTagIconLabel = React.useCallback((selection?: TagIconSelection | null) => {
		return resolveStoredIcon(selection).label;
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
