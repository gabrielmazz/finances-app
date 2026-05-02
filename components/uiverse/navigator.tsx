import React from 'react';
import { router, useLocalSearchParams, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { signOut } from 'firebase/auth';
import { BackHandler, Pressable, View } from 'react-native';

import { Menu as GluestackMenu, MenuItem, MenuItemLabel } from '@/components/ui/menu';
import { Text } from '@/components/ui/text';
import { auth } from '@/FirebaseConfig';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { showNotifierAlert } from '@/components/uiverse/notifier-alert';
import { getUserDataFirebase } from '@/functions/RegisterUserFirebase';
import { navigateToHomeDashboard } from '@/utils/navigation';

export type NavigatorProps = {
	defaultValue?: number;
	onHardwareBack?: () => boolean;
};

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

type RouteParams = Record<string, string | string[] | undefined>;

type NavigatorOption = {
	id: string;
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

// Logout dispara onAuthStateChanged → AuthContext atualiza → _layout.tsx redireciona para '/' automaticamente.
// Conforme documentado em [[Autenticação]] e [[Navegação]].
const logoutUser = async (isDarkMode = false, userId?: string | null, displayName?: string | null) => {
	// Busca o nome no Firestore (fonte primária) com fallback para displayName do Auth
	let userName = displayName?.trim() || null;
	if (userId) {
		try {
			const userData = await getUserDataFirebase(userId);
			if (userData.success) {
				const storedName = (userData.data as { name?: unknown })?.name;
				if (typeof storedName === 'string' && storedName.trim()) {
					userName = storedName.trim().split(/\s+/)[0] ?? userName;
				}
			}
		} catch {
			// Fallback silencioso para displayName do Auth
		}
	}

	try {
		showNotifierAlert({
			description: userName ? `Até mais, ${userName}!` : 'Até mais!',
			type: 'info',
			isDarkMode,
		});
		await signOut(auth);
	} catch (error) {
		console.error('Erro ao deslogar usuário:', error);
		showNotifierAlert({
			description: 'Não foi possível encerrar a sessão. Tente novamente.',
			type: 'error',
			isDarkMode,
		});
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
				id: 'home-start',
				label: 'Início',
				value: 0,
				icon: 'home-outline',
				matchPaths: ['/home'],
				onSelect: () => navigateToHomeDashboard(),
			},
			{
				id: 'category-analysis',
				label: 'Análise por Categoria',
				value: 0,
				icon: 'analytics-outline',
				matchPaths: ['/category-analysis'],
				onSelect: () => router.push('/category-analysis'),
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
				id: 'register-expense',
				label: 'Registrar despesa',
				value: 1,
				icon: 'remove-circle-outline',
				matchPaths: ['/add-register-expenses'],
				onSelect: () => router.push('/add-register-expenses'),
			},
			{
				id: 'register-gain',
				label: 'Registrar ganho',
				value: 1,
				icon: 'add-circle-outline',
				matchPaths: ['/add-register-gain'],
				onSelect: () => router.push('/add-register-gain'),
			},
			{
				id: 'monthly-balance',
				label: 'Saldo mensal',
				value: 1,
				icon: 'calendar-outline',
				matchPaths: ['/register-monthly-balance'],
				onSelect: () => router.push('/register-monthly-balance'),
			},
			{
				id: 'transfer',
				label: 'Transferência',
				value: 1,
				icon: 'swap-horizontal-outline',
				matchPaths: ['/transfer-screen'],
				onSelect: () => router.push('/transfer-screen'),
			},
			{
				id: 'register-rescue',
				label: 'Registrar saque',
				value: 1,
				icon: 'cash-outline',
				matchPaths: ['/add-rescue'],
				onSelect: () => router.push('/add-rescue'),
			},
			{
				id: 'mandatory-expenses',
				label: 'Gastos obrigatórios',
				value: 1,
				icon: 'document-text-outline',
				matchPaths: ['/mandatory-expenses', '/add-mandatory-expenses'],
				onSelect: () => router.push('/mandatory-expenses'),
			},
			{
				id: 'mandatory-gains',
				label: 'Ganhos obrigatórios',
				value: 1,
				icon: 'trending-up-outline',
				matchPaths: ['/mandatory-gains', '/add-mandatory-gains'],
				onSelect: () => router.push('/mandatory-gains'),
			},
			{
				id: 'financial-list',
				label: 'Investimentos',
				value: 1,
				icon: 'wallet-outline',
				matchPaths: ['/financial-list', '/add-finance'],
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
				id: 'settings',
				label: 'Configurações',
				value: 2,
				icon: 'settings-outline',
				onSelect: () => router.replace('/home?tab=2'),
			},
			{
				id: 'register-user',
				label: 'Novo usuário',
				value: 2,
				icon: 'person-add-outline',
				matchPaths: ['/add-register-user'],
				onSelect: () => router.push('/add-register-user'),
			},
			{
				id: 'register-bank',
				label: 'Novo banco',
				value: 2,
				icon: 'business-outline',
				matchPaths: ['/add-register-bank'],
				onSelect: () => router.push('/add-register-bank'),
			},
			{
				id: 'register-tag',
				label: 'Nova tag',
				value: 2,
				icon: 'pricetag-outline',
				matchPaths: ['/add-register-tag'],
				onSelect: () => router.push('/add-register-tag'),
			},
			{
				id: 'add-user-relation',
				label: 'Relacionar usuário',
				value: 2,
				icon: 'people-outline',
				matchPaths: ['/add-user-relation'],
				onSelect: () => router.push('/add-user-relation'),
			},
			{
				id: 'logout',
				label: 'Sair',
				icon: 'log-out-outline',
				onSelect: () => {},
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

const getDefaultOption = (value: number, groups: NavigatorGroup[]) => {
	const selectedGroup = groups.find(item => item.value === value) ?? groups[0];
	return selectedGroup?.options[0] ?? null;
};

const normalizePathname = (pathname?: string | null) => {
	if (!pathname) {
		return '/';
	}

	const normalized = pathname.replace(/\/+/g, '/').replace(/\/$/, '');
	return normalized.length > 0 ? normalized : '/';
};

const hasRouteParamValue = (value?: string | string[]) => {
	if (Array.isArray(value)) {
		return value.some(item => typeof item === 'string' && item.trim().length > 0);
	}

	return typeof value === 'string' && value.trim().length > 0;
};

const getActiveRoute = (pathname: string, groups: NavigatorGroup[]) => {
	for (const group of groups) {
		for (const option of group.options) {
			if (option.matchPaths?.some(matchPath => normalizePathname(matchPath) === pathname)) {
				return {
					groupValue: group.value,
					optionId: option.id,
				};
			}
		}
	}

	return null;
};

export const Navigator: React.FC<NavigatorProps> = ({
	defaultValue = 0,
	onHardwareBack,
}) => {
	const { isDarkMode } = useAppTheme();
	const { user } = useAuth();
	const pathname = usePathname();
	const routeParams = useLocalSearchParams() as RouteParams;
	const normalizedDefault = React.useMemo(() => normalizeValue(defaultValue), [defaultValue]);
	const [openGroupValue, setOpenGroupValue] = React.useState<number | null>(null);
	const normalizedPathname = React.useMemo(() => normalizePathname(pathname), [pathname]);
	const mandatoryExpensesState = React.useMemo(() => {
		if (normalizedPathname !== '/add-mandatory-expenses') {
			return null;
		}

		return {
			label: hasRouteParamValue(routeParams.expenseId)
				? 'Editar gasto obrigatório'
				: 'Registrar gasto obrigatório',
			icon: (hasRouteParamValue(routeParams.expenseId)
				? 'create-outline'
				: 'add-circle-outline') as IoniconName,
			onSelect: () => {},
		};
	}, [normalizedPathname, routeParams.expenseId]);
	const mandatoryGainsState = React.useMemo(() => {
		if (normalizedPathname !== '/add-mandatory-gains') {
			return null;
		}

		return {
			label: hasRouteParamValue(routeParams.gainTemplateId)
				? 'Editar ganho obrigatório'
				: 'Registrar ganho obrigatório',
			icon: (hasRouteParamValue(routeParams.gainTemplateId)
				? 'create-outline'
				: 'add-circle-outline') as IoniconName,
			onSelect: () => {},
		};
	}, [normalizedPathname, routeParams.gainTemplateId]);
	const financialListState = React.useMemo(() => {
		if (normalizedPathname !== '/add-finance') {
			return null;
		}

		return {
			label: 'Registrar investimento',
			icon: 'add-circle-outline' as IoniconName,
			onSelect: () => {},
		};
	}, [normalizedPathname]);
	// Mantém o estado ativo do navigator alinhado com a rota corrente, conforme o fluxo documentado em Arquitetura/Navegação.md e Arquitetura/Investimentos.md.
	const resolvedGroups = React.useMemo(
		() =>
			NAV_GROUPS.map(group => ({
				...group,
				options: group.options.map(option => {
					if (option.id === 'mandatory-expenses' && mandatoryExpensesState) {
						return { ...option, ...mandatoryExpensesState };
					}

					if (option.id === 'mandatory-gains' && mandatoryGainsState) {
						return { ...option, ...mandatoryGainsState };
					}

					if (option.id === 'financial-list' && financialListState) {
						return { ...option, ...financialListState };
					}

					return option;
				}),
			})),
		[mandatoryExpensesState, mandatoryGainsState, financialListState],
	);
	const activeRoute = React.useMemo(
		() => getActiveRoute(normalizedPathname, resolvedGroups),
		[normalizedPathname, resolvedGroups],
	);
	const activeValue = activeRoute?.groupValue ?? normalizedDefault;
	const activeOptionId = activeRoute?.optionId ?? getDefaultOption(activeValue, resolvedGroups)?.id ?? null;

	const palette = React.useMemo(
		() => ({
			activeColor: '#facc15',
			activeSurface: isDarkMode ? 'rgba(255, 204, 0, 0.12)' : 'rgba(250, 204, 21, 0.16)',
			inactiveColor: isDarkMode ? '#94a3b8' : '#64748b',
			menuSurface: 'border-transparent',
			menuSurfaceStyle: isDarkMode
				? {
					backgroundColor: '#030417',
					borderWidth: 0,
					borderRadius: 18,
					shadowColor: '#020617',
					shadowOpacity: 0.42,
					shadowRadius: 24,
					shadowOffset: {
						width: 0,
						height: 18,
					},
					elevation: 18,
				}
				: {
					backgroundColor: '#FFFFFF',
					borderWidth: 0,
					borderRadius: 18,
					shadowColor: '#0F172A',
					shadowOpacity: 0.1,
					shadowRadius: 16,
					shadowOffset: {
						width: 0,
						height: 10,
					},
					elevation: 8,
				},
			menuItem: isDarkMode
				? 'min-w-[176px] rounded-2xl bg-transparent data-[hover=true]:bg-[#101a2c] data-[active=true]:bg-[#101a2c] data-[focus=true]:bg-[#101a2c]'
				: 'min-w-[176px] rounded-2xl bg-transparent data-[hover=true]:bg-yellow-50 data-[active=true]:bg-yellow-50 data-[focus=true]:bg-yellow-50',
			menuItemText: isDarkMode ? 'text-slate-100' : 'text-slate-700',
			menuItemActive: isDarkMode ? 'text-yellow-300' : 'text-slate-900',
			menuIcon: isDarkMode ? '#cbd5e1' : '#64748b',
			menuIconActive: isDarkMode ? '#fde047' : '#f59e0b',
		}),
		[isDarkMode],
	);

	const handleSelect = React.useCallback((option: NavigatorOption) => {
		setOpenGroupValue(null);
		if (option.id === 'logout') {
			void logoutUser(isDarkMode, user?.uid, user?.displayName);
			return;
		}
		option.onSelect();
	}, [isDarkMode, user?.uid, user?.displayName]);

	const handleMenuOpen = React.useCallback((groupValue: number) => {
		setOpenGroupValue(groupValue);
	}, []);

	const handleMenuClose = React.useCallback((groupValue: number) => {
		setOpenGroupValue(currentValue => (currentValue === groupValue ? null : currentValue));
	}, []);

	React.useEffect(() => {
		if (typeof onHardwareBack !== 'function') {
			return;
		}

		const backHandler = BackHandler.addEventListener(
			'hardwareBackPress',
			onHardwareBack,
		);

		return () => {
			backHandler.remove();
		};
	}, [onHardwareBack]);

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
				{resolvedGroups.map(group => {
					const isActive = group.value === activeValue;

					return (
						<GluestackMenu
							key={group.value}
							isOpen={openGroupValue === group.value}
							onOpen={() => handleMenuOpen(group.value)}
							onClose={() => handleMenuClose(group.value)}
							placement="top"
							offset={-23}
							closeOnSelect
							className={palette.menuSurface}
							style={palette.menuSurfaceStyle}
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
								const isActiveOption = activeOptionId === option.id;
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
