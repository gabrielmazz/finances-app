import React from 'react';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';

export type BankIconOption = {
	key: string;
	label: string;
	shortLabel: string;
	colorHex: string;
	textColor?: string;
};

export type BankIconSelection = {
	iconKey?: string | null;
	name?: string | null;
	colorHex?: string | null;
};

type BankIconProps = BankIconSelection & {
	size?: number;
	style?: StyleProp<ViewStyle>;
};

const bankIconCollator = new Intl.Collator('pt-BR', {
	sensitivity: 'base',
});

const bankIconOptionsBase: BankIconOption[] = [
	{ key: 'banco-do-brasil', label: 'Banco do Brasil', shortLabel: 'BB', colorHex: '#F8D117', textColor: '#143D8C' },
	{ key: 'bradesco', label: 'Bradesco', shortLabel: 'BRA', colorHex: '#CC092F' },
	{ key: 'btg-pactual', label: 'BTG Pactual', shortLabel: 'BTG', colorHex: '#111827' },
	{ key: 'c6-bank', label: 'C6 Bank', shortLabel: 'C6', colorHex: '#111827' },
	{ key: 'caixa', label: 'Caixa Econômica', shortLabel: 'CEF', colorHex: '#005CA9' },
	{ key: 'inter', label: 'Inter', shortLabel: 'INT', colorHex: '#FF7A00' },
	{ key: 'itau', label: 'Itaú', shortLabel: 'IT', colorHex: '#EC7000' },
	{ key: 'mercado-pago', label: 'Mercado Pago', shortLabel: 'MP', colorHex: '#00AEEF' },
	{ key: 'neon', label: 'Neon', shortLabel: 'NEO', colorHex: '#00AEEF' },
	{ key: 'next', label: 'Next', shortLabel: 'NXT', colorHex: '#00B140' },
	{ key: 'nubank', label: 'Nubank', shortLabel: 'NU', colorHex: '#820AD1' },
	{ key: 'pagbank', label: 'PagBank', shortLabel: 'PAG', colorHex: '#F5C400', textColor: '#0F172A' },
	{ key: 'pan', label: 'Banco PAN', shortLabel: 'PAN', colorHex: '#0057B8' },
	{ key: 'picpay', label: 'PicPay', shortLabel: 'PIC', colorHex: '#11C76F', textColor: '#052E16' },
	{ key: 'safra', label: 'Safra', shortLabel: 'SAF', colorHex: '#003A70' },
	{ key: 'santander', label: 'Santander', shortLabel: 'SAN', colorHex: '#EC0000' },
	{ key: 'sicoob', label: 'Sicoob', shortLabel: 'SIC', colorHex: '#1E7F4B' },
	{ key: 'sicredi', label: 'Sicredi', shortLabel: 'SIC', colorHex: '#3FAE2A', textColor: '#052E16' },
	{ key: 'xp', label: 'XP Investimentos', shortLabel: 'XP', colorHex: '#111827' },
	{ key: 'outro-banco', label: 'Outro banco', shortLabel: 'BCO', colorHex: '#475569' },
];

export const BANK_ICON_OPTIONS = [...bankIconOptionsBase].sort((a, b) =>
	bankIconCollator.compare(a.label, b.label),
);

export const DEFAULT_BANK_ICON =
	BANK_ICON_OPTIONS.find(option => option.key === 'outro-banco') ?? BANK_ICON_OPTIONS[0];

const bankIconOptionsMap = new Map(BANK_ICON_OPTIONS.map(option => [option.key, option]));

const normalizeTextInitials = (name?: string | null) => {
	if (!name?.trim()) {
		return DEFAULT_BANK_ICON.shortLabel;
	}

	const parts = name
		.trim()
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 3);

	if (parts.length === 1) {
		return parts[0].slice(0, 3).toUpperCase();
	}

	return parts.map(part => part[0]).join('').slice(0, 3).toUpperCase();
};

export function resolveBankIconSelection(selection?: BankIconSelection | null): BankIconOption {
	const iconKey = selection?.iconKey ?? null;
	if (iconKey) {
		const matched = bankIconOptionsMap.get(iconKey);
		if (matched) {
			if (matched.key === DEFAULT_BANK_ICON.key) {
				return {
					...matched,
					shortLabel: normalizeTextInitials(selection?.name),
					colorHex: selection?.colorHex ?? matched.colorHex,
				};
			}

			return matched;
		}
	}

	return {
		...DEFAULT_BANK_ICON,
		shortLabel: normalizeTextInitials(selection?.name),
		colorHex: selection?.colorHex ?? DEFAULT_BANK_ICON.colorHex,
	};
}

export function BankIcon({ iconKey, name, colorHex, size = 44, style }: BankIconProps) {
	const resolved = resolveBankIconSelection({ iconKey, name, colorHex });
	const resolvedTextColor = resolved.textColor ?? '#FFFFFF';
	const fontSize = Math.max(10, Math.round(size * 0.31));

	return (
		<View
			style={[
				{
					width: size,
					height: size,
					borderRadius: Math.round(size * 0.36),
					alignItems: 'center',
					justifyContent: 'center',
					backgroundColor: resolved.colorHex,
				},
				style,
			]}
		>
			<Text
				numberOfLines={1}
				allowFontScaling={false}
				style={{
					color: resolvedTextColor,
					fontSize,
					fontWeight: '800',
					letterSpacing: 0,
				}}
			>
				{resolved.shortLabel}
			</Text>
		</View>
	);
}

export function useBankIcons() {
	const iconOptions = React.useMemo(() => BANK_ICON_OPTIONS, []);

	const resolveBankIcon = React.useCallback((selection?: BankIconSelection | null) => {
		return resolveBankIconSelection(selection);
	}, []);

	return {
		iconOptions,
		defaultBankIcon: DEFAULT_BANK_ICON,
		resolveBankIcon,
	};
}
