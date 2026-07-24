import React from 'react';
import { useLocalSearchParams, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { signOut } from 'firebase/auth';
import { BackHandler, Pressable, View } from 'react-native';

import { Menu as GluestackMenu, MenuItem, MenuItemLabel } from '@/components/ui/menu';
import { Text } from '@/components/ui/text';
import { auth } from '@/FirebaseConfig';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { type RouteVisibilityKey, useRouteVisibility } from '@/contexts/RouteVisibilityContext';
import { showNotifierAlert } from '@/components/uiverse/notifier-alert';
import { getUserDataFirebase } from '@/functions/RegisterUserFirebase';
import {
	clearMandatoryReminderAccount,
	finalizeMandatoryReminderAccountCleanup,
} from '@/utils/mandatoryReminderNotifications';
import { synchronizeMandatoryReminderAccount } from '@/utils/mandatoryReminderAccountSync';
import {
	APP_ROUTE_PATHS,
	HOME_TAB_INDEX,
	type AppRoutePath,
	type HomeTabIndex,
	navigateToHomeConfigurations,
	navigateToHomeDashboard,
	navigateToRoute,
	normalizeHomeTabIndex,
} from '@/utils/navigation';

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
	visibilityKey?: RouteVisibilityKey;
	matchPaths?: AppRoutePath[];
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
	const accountId = userId?.trim();
	if (!accountId || auth.currentUser?.uid !== accountId) {
		return;
	}

	// Busca o nome no Firestore (fonte primária) com fallback para displayName do Auth
	let userName = displayName?.trim() || null;
	try {
		const userData = await getUserDataFirebase(accountId);
		if (userData.success) {
			const storedName = (userData.data as { name?: unknown })?.name;
			if (typeof storedName === 'string' && storedName.trim()) {
				userName = storedName.trim().split(/\s+/)[0] ?? userName;
			}
		}
	} catch {
		// Fallback silencioso para displayName do Auth
	}

	if (auth.currentUser?.uid !== accountId) {
		return;
	}

	const restoreCurrentAccountReminders = async () => {
		if (auth.currentUser?.uid !== accountId) {
			return false;
		}

		try {
			const result = await synchronizeMandatoryReminderAccount(accountId);
			return result.complete;
		} catch (restoreError) {
			console.error('Erro ao restaurar lembretes após falha no logout:', restoreError);
			return false;
		}
	};

	let remindersCleared = false;
	try {
		remindersCleared = await clearMandatoryReminderAccount(accountId);
	} catch (error) {
		console.error('Erro ao limpar lembretes locais durante o logout:', error);
	}

	if (!remindersCleared) {
		if (auth.currentUser?.uid === accountId) {
			const remindersRestored = await restoreCurrentAccountReminders();
			showNotifierAlert({
				description: remindersRestored
					? 'Não foi possível concluir a limpeza. A sessão e os lembretes foram restaurados; tente sair novamente.'
					: 'Não foi possível limpar os lembretes deste dispositivo. Por segurança, a sessão continua ativa; verifique a conexão e tente novamente.',
				type: 'error',
				isDarkMode,
			});
		}
		return;
	}

	if (auth.currentUser?.uid !== accountId) {
		return;
	}

	try {
		await signOut(auth);
		try {
			await finalizeMandatoryReminderAccountCleanup(accountId);
		} catch (finalizeError) {
			console.error('Erro ao finalizar a limpeza local após logout:', finalizeError);
		}
		showNotifierAlert({
			description: userName ? `Até mais, ${userName}!` : 'Até mais!',
			type: 'info',
			isDarkMode,
		});
	} catch (error) {
		console.error('Erro ao deslogar usuário:', error);
		const remindersRestored = await restoreCurrentAccountReminders();
		showNotifierAlert({
			description: remindersRestored
				? 'Não foi possível encerrar a sessão. Os lembretes foram restaurados; tente sair novamente.'
				: 'Não foi possível encerrar a sessão nem restaurar os lembretes agora. Verifique a conexão e tente novamente.',
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
				matchPaths: [APP_ROUTE_PATHS.home],
				onSelect: () => navigateToHomeDashboard(),
			},
			{
				id: 'lumus-assistant',
				label: 'Lumus IA',
				value: 0,
				icon: 'sparkles-outline',
				visibilityKey: 'lumusAssistant',
				matchPaths: [APP_ROUTE_PATHS.lumusAssistant],
				onSelect: () => navigateToRoute(APP_ROUTE_PATHS.lumusAssistant),
			},
			{
				id: 'category-analysis',
				label: 'Análise por Categoria',
				value: 0,
				icon: 'analytics-outline',
				matchPaths: [APP_ROUTE_PATHS.categoryAnalysis],
				onSelect: () => navigateToRoute(APP_ROUTE_PATHS.categoryAnalysis),
			},
			{
				id: 'financial-forecast',
				label: 'Previsão Financeira',
				value: 0,
				icon: 'trending-up-outline',
				matchPaths: [APP_ROUTE_PATHS.financialForecast],
				onSelect: () => navigateToRoute(APP_ROUTE_PATHS.financialForecast),
			},
			{
				id: 'annotations',
				label: 'Anotações',
				value: 0,
				icon: 'document-text-outline',
				visibilityKey: 'annotations',
				matchPaths: [APP_ROUTE_PATHS.annotations],
				onSelect: () => navigateToRoute(APP_ROUTE_PATHS.annotations),
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
				visibilityKey: 'addRegisterExpenses',
				matchPaths: [APP_ROUTE_PATHS.addRegisterExpenses],
				onSelect: () => navigateToRoute(APP_ROUTE_PATHS.addRegisterExpenses),
			},
			{
				id: 'register-gain',
				label: 'Registrar ganho',
				value: 1,
				icon: 'add-circle-outline',
				visibilityKey: 'addRegisterGain',
				matchPaths: [APP_ROUTE_PATHS.addRegisterGain],
				onSelect: () => navigateToRoute(APP_ROUTE_PATHS.addRegisterGain),
			},
			{
				id: 'monthly-balance',
				label: 'Saldo mensal',
				value: 1,
				icon: 'calendar-outline',
				visibilityKey: 'registerMonthlyBalance',
				matchPaths: [APP_ROUTE_PATHS.registerMonthlyBalance],
				onSelect: () => navigateToRoute(APP_ROUTE_PATHS.registerMonthlyBalance),
			},
			{
				id: 'transfer',
				label: 'Transferência',
				value: 1,
				icon: 'swap-horizontal-outline',
				visibilityKey: 'transferScreen',
				matchPaths: [APP_ROUTE_PATHS.transferScreen],
				onSelect: () => navigateToRoute(APP_ROUTE_PATHS.transferScreen),
			},
			{
				id: 'register-rescue',
				label: 'Registrar saque',
				value: 1,
				icon: 'cash-outline',
				visibilityKey: 'addRescue',
				matchPaths: [APP_ROUTE_PATHS.addRescue],
				onSelect: () => navigateToRoute(APP_ROUTE_PATHS.addRescue),
			},
			{
				id: 'mandatory-expenses',
				label: 'Gastos obrigatórios',
				value: 1,
				icon: 'document-text-outline',
				visibilityKey: 'addMandatoryExpenses',
				matchPaths: [APP_ROUTE_PATHS.mandatoryExpenses, APP_ROUTE_PATHS.addMandatoryExpenses],
				onSelect: () => navigateToRoute(APP_ROUTE_PATHS.mandatoryExpenses),
			},
			{
				id: 'mandatory-gains',
				label: 'Ganhos obrigatórios',
				value: 1,
				icon: 'trending-up-outline',
				visibilityKey: 'addMandatoryGains',
				matchPaths: [APP_ROUTE_PATHS.mandatoryGains, APP_ROUTE_PATHS.addMandatoryGains],
				onSelect: () => navigateToRoute(APP_ROUTE_PATHS.mandatoryGains),
			},
			{
				id: 'financial-list',
				label: 'Investimentos',
				value: 1,
				icon: 'wallet-outline',
				visibilityKey: 'addFinance',
				matchPaths: [APP_ROUTE_PATHS.financialList, APP_ROUTE_PATHS.addFinance],
				onSelect: () => navigateToRoute(APP_ROUTE_PATHS.financialList),
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
				matchPaths: [APP_ROUTE_PATHS.home],
				onSelect: () => navigateToHomeConfigurations(),
			},
			{
				id: 'register-user',
				label: 'Novo usuário',
				value: 2,
				icon: 'person-add-outline',
				visibilityKey: 'addRegisterUser',
				matchPaths: [APP_ROUTE_PATHS.addRegisterUser],
				onSelect: () => navigateToRoute(APP_ROUTE_PATHS.addRegisterUser),
			},
			{
				id: 'register-bank',
				label: 'Novo banco',
				value: 2,
				icon: 'business-outline',
				visibilityKey: 'addRegisterBank',
				matchPaths: [APP_ROUTE_PATHS.addRegisterBank],
				onSelect: () => navigateToRoute(APP_ROUTE_PATHS.addRegisterBank),
			},
			{
				id: 'register-tag',
				label: 'Nova categoria',
				value: 2,
				icon: 'pricetag-outline',
				visibilityKey: 'addRegisterTag',
				matchPaths: [APP_ROUTE_PATHS.addRegisterTag],
				onSelect: () => navigateToRoute(APP_ROUTE_PATHS.addRegisterTag),
			},
			{
				id: 'add-user-relation',
				label: 'Relacionar usuário',
				value: 2,
				icon: 'people-outline',
				visibilityKey: 'addUserRelation',
				matchPaths: [APP_ROUTE_PATHS.addUserRelation],
				onSelect: () => navigateToRoute(APP_ROUTE_PATHS.addUserRelation),
			},
			{
				id: 'screen-settings',
				label: 'Config. das telas',
				value: 2,
				icon: 'options-outline',
				matchPaths: [APP_ROUTE_PATHS.screenSettings],
				onSelect: () => navigateToRoute(APP_ROUTE_PATHS.screenSettings),
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
	const selectedGroup = groups.find((item) => item.value === value) ?? groups[0];
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
		return value.some((item) => typeof item === 'string' && item.trim().length > 0);
	}

	return typeof value === 'string' && value.trim().length > 0;
};

const getActiveRoute = (
	pathname: string,
	groups: NavigatorGroup[],
	defaultValue: number,
	tabParam?: string | string[],
) => {
	if (pathname === APP_ROUTE_PATHS.home) {
		const groupValue = normalizeHomeTabIndex(tabParam, normalizeValue(defaultValue) as HomeTabIndex);

		return {
			groupValue,
			optionId: getDefaultOption(groupValue, groups)?.id ?? null,
		};
	}

	for (const group of groups) {
		for (const option of group.options) {
			if (option.matchPaths?.some((matchPath) => normalizePathname(matchPath) === pathname)) {
				return {
					groupValue: group.value,
					optionId: option.id,
				};
			}
		}
	}

	return null;
};

export const Navigator: React.FC<NavigatorProps> = ({ defaultValue = 0, onHardwareBack }) => {
	const { isDarkMode } = useAppTheme();
	const { user } = useAuth();
	const { isRouteVisible } = useRouteVisibility();
	const pathname = usePathname();
	const routeParams = useLocalSearchParams() as RouteParams;
	const logoutInFlightRef = React.useRef(false);
	const normalizedDefault = React.useMemo(() => normalizeValue(defaultValue), [defaultValue]);
	const [openGroupValue, setOpenGroupValue] = React.useState<number | null>(null);
	const normalizedPathname = React.useMemo(() => normalizePathname(pathname), [pathname]);
	const mandatoryExpensesState = React.useMemo(() => {
		if (normalizedPathname !== APP_ROUTE_PATHS.addMandatoryExpenses) {
			return null;
		}

		return {
			label: hasRouteParamValue(routeParams.expenseId) ? 'Editar gasto obrigatório' : 'Registrar gasto obrigatório',
			icon: (hasRouteParamValue(routeParams.expenseId) ? 'create-outline' : 'add-circle-outline') as IoniconName,
			onSelect: () => {},
		};
	}, [normalizedPathname, routeParams.expenseId]);
	const mandatoryGainsState = React.useMemo(() => {
		if (normalizedPathname !== APP_ROUTE_PATHS.addMandatoryGains) {
			return null;
		}

		return {
			label: hasRouteParamValue(routeParams.gainTemplateId)
				? 'Editar ganho obrigatório'
				: 'Registrar ganho obrigatório',
			icon: (hasRouteParamValue(routeParams.gainTemplateId) ? 'create-outline' : 'add-circle-outline') as IoniconName,
			onSelect: () => {},
		};
	}, [normalizedPathname, routeParams.gainTemplateId]);
	const financialListState = React.useMemo(() => {
		if (normalizedPathname !== APP_ROUTE_PATHS.addFinance) {
			return null;
		}

		return {
			label: 'Registrar investimento',
			icon: 'add-circle-outline' as IoniconName,
			onSelect: () => {},
		};
	}, [normalizedPathname]);
	const bankMovementsOption = React.useMemo<NavigatorOption | null>(() => {
		if (normalizedPathname !== APP_ROUTE_PATHS.bankMovements) {
			return null;
		}

		return {
			id: 'bank-movements',
			label: 'Movimentos do banco',
			value: 0,
			icon: 'list-outline',
			matchPaths: [APP_ROUTE_PATHS.bankMovements],
			onSelect: () => {},
		};
	}, [normalizedPathname]);
	// Mantém o estado ativo do navigator alinhado com a rota corrente, conforme o fluxo documentado em Arquitetura/Navegação.md, Arquitetura/Gerenciamento de Bancos.md e Arquitetura/Investimentos.md.
	const resolvedGroups = React.useMemo(
		() =>
			NAV_GROUPS.map((group) => {
				const groupOptions =
					group.value === HOME_TAB_INDEX.dashboard && bankMovementsOption
						? [group.options[0], bankMovementsOption, ...group.options.slice(1)].filter(
								(option): option is NavigatorOption => Boolean(option),
							)
						: group.options;

				const optionsWithCurrentState = groupOptions.map((option) => {
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
				});

				return {
					...group,
					options: optionsWithCurrentState.filter(
						(option) => !option.visibilityKey || isRouteVisible(option.visibilityKey),
					),
				};
			}),
		[bankMovementsOption, financialListState, isRouteVisible, mandatoryExpensesState, mandatoryGainsState],
	);
	const activeRoute = React.useMemo(
		() => getActiveRoute(normalizedPathname, resolvedGroups, normalizedDefault, routeParams.tab),
		[normalizedPathname, resolvedGroups, normalizedDefault, routeParams.tab],
	);
	const activeValue = activeRoute?.groupValue ?? normalizedDefault;
	const activeOptionId = activeRoute?.optionId ?? getDefaultOption(activeValue, resolvedGroups)?.id ?? null;
	const navigationItemWidth: `${number}%` = `${100 / resolvedGroups.length}%`;

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

	const handleSelect = React.useCallback(
		(option: NavigatorOption) => {
			setOpenGroupValue(null);
			if (option.id === 'logout') {
				if (logoutInFlightRef.current) {
					return;
				}
				logoutInFlightRef.current = true;
				void logoutUser(isDarkMode, user?.uid, user?.displayName).finally(() => {
					logoutInFlightRef.current = false;
				});
				return;
			}

			if (option.id === activeOptionId) {
				return;
			}

			option.onSelect();
		},
		[activeOptionId, isDarkMode, user?.uid, user?.displayName],
	);

	const handleMenuOpen = React.useCallback((groupValue: number) => {
		setOpenGroupValue(groupValue);
	}, []);

	const handleMenuClose = React.useCallback((groupValue: number) => {
		setOpenGroupValue((currentValue) => (currentValue === groupValue ? null : currentValue));
	}, []);

	React.useEffect(() => {
		if (typeof onHardwareBack !== 'function') {
			return;
		}

		const backHandler = BackHandler.addEventListener('hardwareBackPress', onHardwareBack);

		return () => {
			backHandler.remove();
		};
	}, [onHardwareBack]);

	return (
		<View
			style={{
				paddingHorizontal: 16,
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
				{resolvedGroups.map((group) => {
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
							trigger={(triggerProps) => (
								<Pressable
									{...(triggerProps as Record<string, unknown>)}
									hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
									pressRetentionOffset={{ top: 12, right: 12, bottom: 12, left: 12 }}
									style={({ pressed }) => ({
										width: navigationItemWidth,
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
