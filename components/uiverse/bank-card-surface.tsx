import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, {
	Circle,
	Defs,
	LinearGradient as SvgLinearGradient,
	RadialGradient as SvgRadialGradient,
	Rect,
	Stop,
} from 'react-native-svg';

export type BankCardPalette = {
	baseColor: string;
	glowColor: string;
	highlightColor: string;
	textPrimary: string;
	textSecondary: string;
	expenseColor: string;
	gainColor: string;
	shadowColor: string;
};

type BankCardSurfaceProps = {
	palette: BankCardPalette;
	children: React.ReactNode;
	style?: StyleProp<ViewStyle>;
	contentContainerStyle?: StyleProp<ViewStyle>;
};

export const CASH_CARD_COLOR = '#525252';

export const normalizeHexColor = (value: string | null | undefined) => {
	if (!value) {
		return null;
	}

	const trimmedValue = value.trim();
	if (!trimmedValue) {
		return null;
	}

	const prefixedValue = trimmedValue.startsWith('#') ? trimmedValue : `#${trimmedValue}`;
	const isShortHex = /^#([0-9a-fA-F]{3})$/.test(prefixedValue);
	const isLongHex = /^#([0-9a-fA-F]{6})$/.test(prefixedValue);

	if (isLongHex) {
		return prefixedValue;
	}

	if (!isShortHex) {
		return null;
	}

	const [, shortHex] = prefixedValue.match(/^#([0-9a-fA-F]{3})$/) ?? [];
	if (!shortHex) {
		return null;
	}

	return `#${shortHex
		.split('')
		.map(char => `${char}${char}`)
		.join('')}`;
};

const hexToRgba = (hexColor: string, alpha: number) => {
	const normalizedHex = normalizeHexColor(hexColor);
	if (!normalizedHex) {
		return null;
	}

	const red = Number.parseInt(normalizedHex.slice(1, 3), 16);
	const green = Number.parseInt(normalizedHex.slice(3, 5), 16);
	const blue = Number.parseInt(normalizedHex.slice(5, 7), 16);
	return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
};

const hexToRgb = (hexColor: string) => {
	const normalizedHex = normalizeHexColor(hexColor);
	if (!normalizedHex) {
		return null;
	}

	return {
		red: Number.parseInt(normalizedHex.slice(1, 3), 16),
		green: Number.parseInt(normalizedHex.slice(3, 5), 16),
		blue: Number.parseInt(normalizedHex.slice(5, 7), 16),
	};
};

const rgbToHex = (red: number, green: number, blue: number) =>
	`#${[red, green, blue]
		.map(value => Math.min(255, Math.max(0, Math.round(value))).toString(16).padStart(2, '0'))
		.join('')}`;

export const mixHexColors = (sourceHex: string, targetHex: string, weight: number) => {
	const source = hexToRgb(sourceHex);
	const target = hexToRgb(targetHex);
	if (!source || !target) {
		return null;
	}

	const safeWeight = Math.min(1, Math.max(0, weight));

	return rgbToHex(
		source.red + (target.red - source.red) * safeWeight,
		source.green + (target.green - source.green) * safeWeight,
		source.blue + (target.blue - source.blue) * safeWeight,
	);
};

const getRelativeLuminance = (hexColor: string) => {
	const rgb = hexToRgb(hexColor);
	if (!rgb) {
		return 0;
	}

	const toLinear = (channel: number) => {
		const normalizedChannel = channel / 255;
		return normalizedChannel <= 0.03928
			? normalizedChannel / 12.92
			: ((normalizedChannel + 0.055) / 1.055) ** 2.4;
	};

	return 0.2126 * toLinear(rgb.red) + 0.7152 * toLinear(rgb.green) + 0.0722 * toLinear(rgb.blue);
};

export const buildBankCardPalette = (
	colorHex: string | null | undefined,
	isDarkMode: boolean,
): BankCardPalette => {
	const accentColor = normalizeHexColor(colorHex) ?? (isDarkMode ? '#1D4ED8' : '#7C3AED');
	const baseColor =
		mixHexColors(accentColor, isDarkMode ? '#020617' : '#0F172A', isDarkMode ? 0.58 : 0.5) ??
		(isDarkMode ? '#172033' : '#1E293B');
	const glowColor = mixHexColors(accentColor, '#FFFFFF', isDarkMode ? 0.22 : 0.3) ?? accentColor;
	const highlightColor = mixHexColors(accentColor, '#FDE68A', 0.38) ?? glowColor;
	const textPrimary = getRelativeLuminance(baseColor) > 0.45 ? '#0F172A' : '#FFFFFF';
	const textSecondary = textPrimary === '#FFFFFF' ? 'rgba(255,255,255,0.72)' : 'rgba(15,23,42,0.72)';

	return {
		baseColor,
		glowColor,
		highlightColor,
		textPrimary,
		textSecondary,
		expenseColor: '#FFFFFF',
		gainColor: '#FFFFFF',
		shadowColor: hexToRgba(accentColor, isDarkMode ? 0.38 : 0.28) ?? accentColor,
	};
};

const BankCardPattern = React.memo(({ palette }: { palette: BankCardPalette }) => {
	const rawGradientId = React.useId();
	const rawGlowId = React.useId();
	const gradientId = React.useMemo(
		() => `bank-card-gradient-${rawGradientId.replace(/[^a-zA-Z0-9_-]/g, '')}`,
		[rawGradientId],
	);
	const glowId = React.useMemo(
		() => `bank-card-glow-${rawGlowId.replace(/[^a-zA-Z0-9_-]/g, '')}`,
		[rawGlowId],
	);

	return (
		<View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
			<Svg width="100%" height="100%" viewBox="0 0 800 400" preserveAspectRatio="xMidYMid slice">
				<Defs>
					<SvgRadialGradient id={gradientId} cx="396" cy="281" r="514" gradientUnits="userSpaceOnUse">
						<Stop offset="0" stopColor={palette.glowColor} />
						<Stop offset="1" stopColor={palette.baseColor} />
					</SvgRadialGradient>

					<SvgLinearGradient id={glowId} x1="400" y1="148" x2="400" y2="333" gradientUnits="userSpaceOnUse">
						<Stop offset="0" stopColor={palette.highlightColor} stopOpacity={0} />
						<Stop offset="1" stopColor={palette.highlightColor} stopOpacity={0.52} />
					</SvgLinearGradient>
				</Defs>

				<Rect width="800" height="400" fill={palette.baseColor} />
				<Rect width="800" height="400" fill={`url(#${gradientId})`} />
				<Circle fill={`url(#${glowId})`} fillOpacity={0.42} cx="267.5" cy="61" r="300" />
				<Circle fill={`url(#${glowId})`} fillOpacity={0.42} cx="532.5" cy="61" r="300" />
				<Circle fill={`url(#${glowId})`} fillOpacity={0.42} cx="400" cy="30" r="300" />
				<Rect width="800" height="400" fill="rgba(255,255,255,0.04)" />
			</Svg>
		</View>
	);
});

export const BankCardSurface = ({
	palette,
	children,
	style,
	contentContainerStyle,
}: BankCardSurfaceProps) => (
	<View
		style={[
			styles.card,
			{
				backgroundColor: palette.baseColor,
				shadowColor: palette.shadowColor,
			},
			style,
		]}
	>
		<BankCardPattern palette={palette} />
		<View style={[styles.contentContainer, contentContainerStyle]}>{children}</View>
	</View>
);

const styles = StyleSheet.create({
	card: {
		borderRadius: 20,
		overflow: 'hidden',
		position: 'relative',
		shadowOffset: { width: 0, height: 12 },
		shadowOpacity: 0.24,
		shadowRadius: 18,
		elevation: 8,
	},
	contentContainer: {
		flex: 1,
		paddingHorizontal: 18,
		paddingVertical: 18,
	},
});
