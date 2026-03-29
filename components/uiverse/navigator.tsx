import React from 'react';
import { router, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { signOut } from 'firebase/auth';
import { Alert, Pressable, View } from 'react-native';

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
	matchPaths?: string[];
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
				matchPaths: ['/home'],
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
				matchPaths: ['/add-register-expenses'],
				onSelect: () => router.push('/add-register-expenses'),
			},
			{
				label: 'Registrar ganho',
				value: 1,
				icon: 'add-circle-outline',
				matchPaths: ['/add-register-gain'],
				onSelect: () => router.push('/add-register-gain'),
			},
			{
				label: 'Saldo mensal',
				value: 1,
				icon: 'calendar-outline',
				matchPaths: ['/register-monthly-balance'],
				onSelect: () => router.push('/register-monthly-balance'),
			},
			{
				label: 'Transferência',
				value: 1,
				icon: 'swap-horizontal-outline',
				matchPaths: ['/transfer-screen'],
				onSelect: () => router.push('/transfer-screen'),
			},
			{
				label: 'Registrar saque',
				value: 1,
				icon: 'cash-outline',
				matchPaths: ['/add-rescue'],
				onSelect: () => router.push('/add-rescue'),
			},
			{
				label: 'Gastos obrigatórios',
				value: 1,
				icon: 'document-text-outline',
				matchPaths: ['/mandatory-expenses'],
				onSelect: () => router.push('/mandatory-expenses'),
			},
			{
				label: 'Ganhos obrigatórios',
				value: 1,
				icon: 'trending-up-outline',
				matchPaths: ['/mandatory-gains'],
				onSelect: () => router.push('/mandatory-gains'),
			},
			{
				label: 'Investimentos',
				value: 1,
				icon: 'wallet-outline',
				matchPaths: ['/financial-list'],
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
				label: 'Novo usuário',
				value: 2,
				icon: 'person-add-outline',
				matchPaths: ['/add-register-user'],
				onSelect: () => router.push('/add-register-user'),
			},
			{
				label: 'Novo banco',
				value: 2,
				icon: 'business-outline',
				matchPaths: ['/add-register-bank'],
				onSelect: () => router.push('/add-register-bank'),
			},
			{
				label: 'Nova tag',
				value: 2,
				icon: 'pricetag-outline',
				matchPaths: ['/add-register-tag'],
				onSelect: () => router.push('/add-register-tag'),
			},
			{
				label: 'Relacionar usuário',
				value: 2,
				icon: 'people-outline',
				matchPaths: ['/add-user-relation'],
				onSelect: () => router.push('/add-user-relation'),
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

const normalizePathname = (pathname?: string | null) => {
	if (!pathname) {
		return '/';
	}

	const normalized = pathname.replace(/\/+/g, '/').replace(/\/$/, '');
	return normalized.length > 0 ? normalized : '/';
};

const getActiveRoute = (pathname: string) => {
	for (const group of NAV_GROUPS) {
		for (const option of group.options) {
			if (option.matchPaths?.some(matchPath => normalizePathname(matchPath) === pathname)) {
				return {
					groupValue: group.value,
					label: option.label,
				};
			}
		}
	}

	return null;
};

export const Navigator: React.FC<NavigatorProps> = ({ defaultValue = 0 }) => {
	const { isDarkMode } = useAppTheme();
	const pathname = usePathname();
	const normalizedDefault = React.useMemo(() => normalizeValue(defaultValue), [defaultValue]);
	const [openGroupValue, setOpenGroupValue] = React.useState<number | null>(null);
	const activeRoute = React.useMemo(
		() => getActiveRoute(normalizePathname(pathname)),
		[pathname],
	);
	const activeValue = activeRoute?.groupValue ?? normalizedDefault;
	const activeLabel = activeRoute?.label ?? getDefaultLabel(activeValue);

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

	const handleSelect = React.useCallback((option: NavigatorOption) => {
		setOpenGroupValue(null);
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
				paddingTop: 6,
				paddingBottom: 0,
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
										onPress={() => handleSelect(option)}
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
