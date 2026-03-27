import React from 'react';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { signOut } from 'firebase/auth';
import { Alert, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Menu as GluestackMenu, MenuItem, MenuItemLabel } from '@/components/ui/menu';
import { Text } from '@/components/ui/text';
import { auth } from '@/FirebaseConfig';
import { useAppTheme } from '@/contexts/ThemeContext';

export type NavigatorProps = {
	defaultValue?: number;
};

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

type NavigatorOption = {
	label: string;
	value?: number;
	icon: IoniconName;
	onSelect: () => void;
};

type NavigatorGroup = {
	label: string;
	value: number;
	activeIcon: IoniconName;
	inactiveIcon: IoniconName;
	options: NavigatorOption[];
};

const logoutUser = async () => {
	try {
		await signOut(auth);
		router.replace('/');
	} catch (error) {
		console.error('Erro ao deslogar usuário:', error);
		Alert.alert('Erro ao deslogar', 'Não foi possível encerrar a sessão. Tente novamente.');
	}
};

const NAV_GROUPS: NavigatorGroup[] = [
	{
		label: 'Home',
		value: 0,
		activeIcon: 'home',
		inactiveIcon: 'home-outline',
		options: [
			{
				label: 'Início',
				value: 0,
				icon: 'home-outline',
				onSelect: () => router.replace('/home?tab=0'),
			},
		],
	},
	{
		label: 'Controle',
		value: 1,
		activeIcon: 'grid',
		inactiveIcon: 'grid-outline',
		options: [
			{
				label: 'Registrar despesa',
				value: 1,
				icon: 'remove-circle-outline',
				onSelect: () => router.push('/add-register-expenses'),
			},
			{
				label: 'Registrar ganho',
				value: 1,
				icon: 'add-circle-outline',
				onSelect: () => router.push('/add-register-gain'),
			},
			{
				label: 'Saldo mensal',
				value: 1,
				icon: 'calendar-outline',
				onSelect: () => router.push('/register-monthly-balance'),
			},
			{
				label: 'Resumo bancário',
				value: 1,
				icon: 'stats-chart-outline',
				onSelect: () => router.push('/bank-summary'),
			},
			{
				label: 'Transferência',
				value: 1,
				icon: 'swap-horizontal-outline',
				onSelect: () => router.push('/transfer-screen'),
			},
			{
				label: 'Registrar saque',
				value: 1,
				icon: 'cash-outline',
				onSelect: () => router.push('/add-rescue'),
			},
			{
				label: 'Gastos obrigatórios',
				value: 1,
				icon: 'document-text-outline',
				onSelect: () => router.push('/mandatory-expenses'),
			},
			{
				label: 'Ganhos obrigatórios',
				value: 1,
				icon: 'trending-up-outline',
				onSelect: () => router.push('/mandatory-gains'),
			},
			{
				label: 'Investimentos',
				value: 1,
				icon: 'wallet-outline',
				onSelect: () => router.push('/financial-list'),
			},
		],
	},
	{
		label: 'Config',
		value: 2,
		activeIcon: 'settings',
		inactiveIcon: 'settings-outline',
		options: [
			{
				label: 'Configurações',
				value: 2,
				icon: 'settings-outline',
				onSelect: () => router.replace('/home?tab=2'),
			},
			{
				label: 'Sair',
				icon: 'log-out-outline',
				onSelect: () => {
					void logoutUser();
				},
			},
		],
	},
];

const normalizeValue = (value?: number) => {
	if (typeof value !== 'number' || Number.isNaN(value)) {
		return 0;
	}

	return Math.min(Math.max(Math.trunc(value), 0), NAV_GROUPS.length - 1);
};

const getDefaultLabel = (value: number) => {
	const selectedGroup = NAV_GROUPS.find(item => item.value === value) ?? NAV_GROUPS[0];
	return selectedGroup?.options[0]?.label ?? '';
};

export const Navigator: React.FC<NavigatorProps> = ({ defaultValue = 0 }) => {
	const { isDarkMode } = useAppTheme();
	const insets = useSafeAreaInsets();
	const containerBackground = isDarkMode ? '#020617' : '#ffffff';
	const normalizedDefault = React.useMemo(() => normalizeValue(defaultValue), [defaultValue]);
	const [activeValue, setActiveValue] = React.useState(normalizedDefault);
	const [activeLabel, setActiveLabel] = React.useState(() => getDefaultLabel(normalizedDefault));
	const [openGroupValue, setOpenGroupValue] = React.useState<number | null>(null);

	React.useEffect(() => {
		setActiveValue(normalizedDefault);
		setActiveLabel(getDefaultLabel(normalizedDefault));
		setOpenGroupValue(null);
	}, [normalizedDefault]);

	const palette = React.useMemo(
		() => ({
			activeColor: '#facc15',
			activeSurface: isDarkMode ? 'rgba(250, 204, 21, 0.12)' : 'rgba(250, 204, 21, 0.16)',
			inactiveColor: isDarkMode ? '#94a3b8' : '#64748b',
			menuSurface: isDarkMode
				? 'bg-slate-900 border-amber-100/30 shadow-lg'
				: 'bg-white border-amber-100 shadow-md',
			menuItem: isDarkMode
				? 'min-w-[176px] bg-slate-900 data-[hover=true]:bg-slate-800 data-[active=true]:bg-slate-800 data-[focus=true]:bg-slate-800'
				: 'min-w-[176px] bg-white data-[hover=true]:bg-yellow-50 data-[active=true]:bg-yellow-50 data-[focus=true]:bg-yellow-50',
			menuItemText: isDarkMode ? 'text-slate-100' : 'text-slate-700',
			menuItemActive: isDarkMode ? 'text-yellow-300' : 'text-slate-900',
			menuIcon: isDarkMode ? '#cbd5e1' : '#64748b',
			menuIconActive: isDarkMode ? '#fde047' : '#f59e0b',
		}),
		[isDarkMode],
	);

	const handleSelect = React.useCallback((group: NavigatorGroup, option: NavigatorOption) => {
		setOpenGroupValue(null);
		setActiveValue(typeof option.value === 'number' ? option.value : group.value);
		setActiveLabel(option.label);
		option.onSelect();
	}, []);

	const handleMenuOpen = React.useCallback((groupValue: number) => {
		setOpenGroupValue(groupValue);
	}, []);

	const handleMenuClose = React.useCallback((groupValue: number) => {
		setOpenGroupValue(currentValue => (currentValue === groupValue ? null : currentValue));
	}, []);

	return (
			<View
				style={{
					paddingHorizontal: 0,
					paddingTop: 8,
					paddingBottom: insets.bottom,
					backgroundColor: containerBackground,
					borderTopLeftRadius: 16,
					borderTopRightRadius: 16,
					borderTopWidth: 2,
					borderTopColor: palette.activeColor,
					borderRightWidth: 2,
					borderRightColor: palette.activeColor,
					borderLeftWidth: 2,
					borderLeftColor: palette.activeColor,
				}}
			>
			<View
				style={{
					width: '100%',
					maxWidth: 280,
					alignSelf: 'center',
					flexDirection: 'row',
					alignItems: 'center',
					justifyContent: 'space-between',
					paddingHorizontal: 0,
					paddingVertical: 2,
				}}
			>
				{NAV_GROUPS.map(group => {
					const isActive = group.value === activeValue;

					return (
						<GluestackMenu
							key={group.value}
							isOpen={openGroupValue === group.value}
							onOpen={() => handleMenuOpen(group.value)}
							onClose={() => handleMenuClose(group.value)}
							placement="top"
							offset={-8}
							closeOnSelect
							className={palette.menuSurface}
							trigger={triggerProps => (
								<Pressable
									{...(triggerProps as Record<string, unknown>)}
									hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
									pressRetentionOffset={{ top: 12, right: 12, bottom: 12, left: 12 }}
									style={({ pressed }) => ({
										width: `${100 / NAV_GROUPS.length}%`,
										minHeight: 56,
										minWidth: 0,
										paddingHorizontal: 8,
										paddingVertical: 6,
										justifyContent: 'center',
										alignItems: 'center',
										borderRadius: 22,
										backgroundColor: isActive ? palette.activeSurface : 'transparent',
										opacity: pressed ? 0.78 : 1,
									})}
								>
									<View
										style={{
											width: '100%',
											alignItems: 'center',
											justifyContent: 'center',
										}}
									>
										<Ionicons
											name={isActive ? group.activeIcon : group.inactiveIcon}
											size={22}
											color={isActive ? palette.activeColor : palette.inactiveColor}
										/>
										<Text
											numberOfLines={1}
											style={{
												marginTop: 2,
												width: '100%',
												fontSize: 11,
												fontWeight: '700',
												textAlign: 'center',
												color: isActive ? palette.activeColor : palette.inactiveColor,
											}}
										>
											{group.label}
										</Text>
									</View>
								</Pressable>
							)}
						>
							{group.options.flatMap((option, optionIndex) => {
								const isActiveOption = activeLabel === option.label;
								return (
									<MenuItem
										key={`item-${group.label}-${option.label}-${optionIndex}`}
										onPress={() => handleSelect(group, option)}
										textValue={option.label}
										className={palette.menuItem}
									>
										<Ionicons
											name={option.icon}
											size={16}
											color={isActiveOption ? palette.menuIconActive : palette.menuIcon}
											style={{ marginRight: 10 }}
										/>
										<MenuItemLabel
											bold={isActiveOption}
											className={isActiveOption ? palette.menuItemActive : palette.menuItemText}
										>
											{option.label}
										</MenuItemLabel>
									</MenuItem>
								);
							})}
						</GluestackMenu>
					);
				})}
			</View>
		</View>
	);
};

export default Navigator;
