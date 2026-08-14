import React from 'react';
import { useLocalSearchParams, usePathname } from 'expo-router';
import { signOut } from 'firebase/auth';
import {
	ArrowLeftRight,
	BadgeDollarSign,
	BanknoteArrowDown,
	BarChart3,
	Building2,
	CircleMinus,
	CirclePlus,
	ClipboardList,
	FileText,
	Home,
	LogOut,
	NotebookPen,
	PiggyBank,
	Settings2,
	Sparkles,
	Tags,
	TrendingUp,
	UserPlus,
	UsersRound,
} from 'lucide-react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';

import StaggeredMenu from '@/components/web/StaggeredMenu';
import { auth } from '@/FirebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import { type RouteVisibilityKey, useRouteVisibility } from '@/contexts/RouteVisibilityContext';
import { useAppTheme } from '@/contexts/ThemeContext';
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
	navigateToHomeConfigurations,
	navigateToHomeDashboard,
	navigateToRoute,
	normalizeHomeTabIndex,
	type AppRoutePath,
} from '@/utils/navigation';
import { isWebDesktopLayout } from '@/utils/webLayout';

export type NavigatorProps = {
	defaultValue?: number;
	onHardwareBack?: () => boolean;
};

type NavigatorOption = {
	id: string;
	label: string;
	icon: React.ReactNode;
	visibilityKey?: RouteVisibilityKey;
	matchPaths?: AppRoutePath[];
	onSelect: () => void;
};

type NavigatorGroup = {
	label: string;
	value: number;
	options: NavigatorOption[];
};

type RouteParams = Record<string, string | string[] | undefined>;

const normalizePathname = (pathname?: string | null) => {
	if (!pathname) return '/';
	const normalized = pathname.replace(/\/+/g, '/').replace(/\/$/, '');
	return normalized || '/';
};

const hasRouteParamValue = (value?: string | string[]) =>
	Array.isArray(value) ? value.some(item => item.trim().length > 0) : Boolean(value?.trim());

const getWebLink = (option: NavigatorOption) => {
	if (option.id === 'home-start') return '/home?tab=0';
	if (option.id === 'settings') return '/home?tab=2';
	return option.matchPaths?.[0] ?? '/home?tab=0';
};

// Segue o fluxo de logout de [[Navegação]]: somente encerra a sessão depois de
// limpar os lembretes vinculados à conta que iniciou a ação.
const logoutUser = async (isDarkMode: boolean, userId?: string | null, displayName?: string | null) => {
	const accountId = userId?.trim();
	if (!accountId || auth.currentUser?.uid !== accountId) return;

	let userName = displayName?.trim() || null;
	try {
		const result = await getUserDataFirebase(accountId);
		const storedName = result.success ? (result.data as { name?: unknown }).name : null;
		if (typeof storedName === 'string' && storedName.trim()) {
			userName = storedName.trim().split(/\s+/)[0] ?? userName;
		}
	} catch {
		// O nome exibido é somente um detalhe do feedback de saída.
	}

	const restoreCurrentAccountReminders = async () => {
		if (auth.currentUser?.uid !== accountId) return false;
		try {
			return (await synchronizeMandatoryReminderAccount(accountId)).complete;
		} catch {
			return false;
		}
	};

	let remindersCleared = false;
	try {
		remindersCleared = await clearMandatoryReminderAccount(accountId);
	} catch {
		remindersCleared = false;
	}

	if (!remindersCleared) {
		const restored = await restoreCurrentAccountReminders();
		showNotifierAlert({
			description: restored
				? 'Não foi possível concluir a limpeza. A sessão e os lembretes foram restaurados; tente sair novamente.'
				: 'Não foi possível limpar os lembretes deste dispositivo. Por segurança, a sessão continua ativa; verifique a conexão e tente novamente.',
			type: 'error',
			isDarkMode,
		});
		return;
	}

	if (auth.currentUser?.uid !== accountId) return;

	try {
		await signOut(auth);
		try {
			await finalizeMandatoryReminderAccountCleanup(accountId);
		} catch {
			// O estado local é finalizado por melhor esforço depois do signOut.
		}
		showNotifierAlert({
			description: userName ? `Até mais, ${userName}!` : 'Até mais!',
			type: 'info',
			isDarkMode,
		});
	} catch {
		const restored = await restoreCurrentAccountReminders();
		showNotifierAlert({
			description: restored
				? 'Não foi possível encerrar a sessão. Os lembretes foram restaurados; tente sair novamente.'
				: 'Não foi possível encerrar a sessão nem restaurar os lembretes agora. Verifique a conexão e tente novamente.',
			type: 'error',
			isDarkMode,
		});
	}
};

const createGroups = (): NavigatorGroup[] => [
	{
		label: 'Home',
		value: HOME_TAB_INDEX.dashboard,
		options: [
			{ id: 'home-start', label: 'Início', icon: <Home size={18} />, matchPaths: [APP_ROUTE_PATHS.home], onSelect: navigateToHomeDashboard },
			{ id: 'lumus-assistant', label: 'Lumus IA', icon: <Sparkles size={18} />, visibilityKey: 'lumusAssistant', matchPaths: [APP_ROUTE_PATHS.lumusAssistant], onSelect: () => navigateToRoute(APP_ROUTE_PATHS.lumusAssistant) },
			{ id: 'category-analysis', label: 'Análise por categoria', icon: <BarChart3 size={18} />, matchPaths: [APP_ROUTE_PATHS.categoryAnalysis], onSelect: () => navigateToRoute(APP_ROUTE_PATHS.categoryAnalysis) },
			{ id: 'financial-forecast', label: 'Previsão financeira', icon: <TrendingUp size={18} />, matchPaths: [APP_ROUTE_PATHS.financialForecast], onSelect: () => navigateToRoute(APP_ROUTE_PATHS.financialForecast) },
			{ id: 'annotations', label: 'Anotações', icon: <NotebookPen size={18} />, visibilityKey: 'annotations', matchPaths: [APP_ROUTE_PATHS.annotations], onSelect: () => navigateToRoute(APP_ROUTE_PATHS.annotations) },
		],
	},
	{
		label: 'Controle',
		value: HOME_TAB_INDEX.control,
		options: [
			{ id: 'register-expense', label: 'Registrar despesa', icon: <CircleMinus size={18} />, visibilityKey: 'addRegisterExpenses', matchPaths: [APP_ROUTE_PATHS.addRegisterExpenses], onSelect: () => navigateToRoute(APP_ROUTE_PATHS.addRegisterExpenses) },
			{ id: 'register-gain', label: 'Registrar ganho', icon: <CirclePlus size={18} />, visibilityKey: 'addRegisterGain', matchPaths: [APP_ROUTE_PATHS.addRegisterGain], onSelect: () => navigateToRoute(APP_ROUTE_PATHS.addRegisterGain) },
			{ id: 'monthly-balance', label: 'Saldo mensal', icon: <ClipboardList size={18} />, visibilityKey: 'registerMonthlyBalance', matchPaths: [APP_ROUTE_PATHS.registerMonthlyBalance], onSelect: () => navigateToRoute(APP_ROUTE_PATHS.registerMonthlyBalance) },
			{ id: 'transfer', label: 'Transferência', icon: <ArrowLeftRight size={18} />, visibilityKey: 'transferScreen', matchPaths: [APP_ROUTE_PATHS.transferScreen], onSelect: () => navigateToRoute(APP_ROUTE_PATHS.transferScreen) },
			{ id: 'register-rescue', label: 'Registrar saque', icon: <BanknoteArrowDown size={18} />, visibilityKey: 'addRescue', matchPaths: [APP_ROUTE_PATHS.addRescue], onSelect: () => navigateToRoute(APP_ROUTE_PATHS.addRescue) },
			{ id: 'mandatory-expenses', label: 'Gastos obrigatórios', icon: <FileText size={18} />, visibilityKey: 'addMandatoryExpenses', matchPaths: [APP_ROUTE_PATHS.mandatoryExpenses, APP_ROUTE_PATHS.addMandatoryExpenses], onSelect: () => navigateToRoute(APP_ROUTE_PATHS.mandatoryExpenses) },
			{ id: 'mandatory-gains', label: 'Ganhos obrigatórios', icon: <TrendingUp size={18} />, visibilityKey: 'addMandatoryGains', matchPaths: [APP_ROUTE_PATHS.mandatoryGains, APP_ROUTE_PATHS.addMandatoryGains], onSelect: () => navigateToRoute(APP_ROUTE_PATHS.mandatoryGains) },
			{ id: 'financial-list', label: 'Investimentos', icon: <PiggyBank size={18} />, visibilityKey: 'addFinance', matchPaths: [APP_ROUTE_PATHS.financialList, APP_ROUTE_PATHS.addFinance], onSelect: () => navigateToRoute(APP_ROUTE_PATHS.financialList) },
		],
	},
	{
		label: 'Config',
		value: HOME_TAB_INDEX.config,
		options: [
			{ id: 'settings', label: 'Configurações', icon: <Settings2 size={18} />, matchPaths: [APP_ROUTE_PATHS.home], onSelect: navigateToHomeConfigurations },
			{ id: 'register-user', label: 'Novo usuário', icon: <UserPlus size={18} />, visibilityKey: 'addRegisterUser', matchPaths: [APP_ROUTE_PATHS.addRegisterUser], onSelect: () => navigateToRoute(APP_ROUTE_PATHS.addRegisterUser) },
			{ id: 'register-bank', label: 'Novo banco', icon: <Building2 size={18} />, visibilityKey: 'addRegisterBank', matchPaths: [APP_ROUTE_PATHS.addRegisterBank], onSelect: () => navigateToRoute(APP_ROUTE_PATHS.addRegisterBank) },
			{ id: 'register-tag', label: 'Nova categoria', icon: <Tags size={18} />, visibilityKey: 'addRegisterTag', matchPaths: [APP_ROUTE_PATHS.addRegisterTag], onSelect: () => navigateToRoute(APP_ROUTE_PATHS.addRegisterTag) },
			{ id: 'add-user-relation', label: 'Relacionar usuário', icon: <UsersRound size={18} />, visibilityKey: 'addUserRelation', matchPaths: [APP_ROUTE_PATHS.addUserRelation], onSelect: () => navigateToRoute(APP_ROUTE_PATHS.addUserRelation) },
			{ id: 'app-tests', label: 'Testes do app', icon: <BadgeDollarSign size={18} />, visibilityKey: 'appTests', matchPaths: [APP_ROUTE_PATHS.appTests], onSelect: () => navigateToRoute(APP_ROUTE_PATHS.appTests) },
			{ id: 'screen-settings', label: 'Config. das telas', icon: <Settings2 size={18} />, matchPaths: [APP_ROUTE_PATHS.screenSettings], onSelect: () => navigateToRoute(APP_ROUTE_PATHS.screenSettings) },
			{ id: 'logout', label: 'Sair', icon: <LogOut size={18} />, onSelect: () => {} },
		],
	},
];

export default function Navigator({ defaultValue = HOME_TAB_INDEX.dashboard }: NavigatorProps) {
	const pathname = normalizePathname(usePathname());
	const params = useLocalSearchParams() as RouteParams;
	const { user } = useAuth();
	const { isDarkMode } = useAppTheme();
	const { isRouteVisible } = useRouteVisibility();
	const { width } = useWindowDimensions();
	const [openMobileGroup, setOpenMobileGroup] = React.useState<number | null>(null);
	const [profileName, setProfileName] = React.useState(user?.displayName?.trim() || '');
	const logoutInFlightRef = React.useRef(false);
	const isDesktopWeb = isWebDesktopLayout('web', width);
	const homeTab = normalizeHomeTabIndex(params.tab, defaultValue as 0 | 1 | 2);

	React.useEffect(() => {
		let isMounted = true;
		const fallbackName = user?.displayName?.trim() || '';
		setProfileName(fallbackName);

		if (!user?.uid) return () => { isMounted = false; };

		const loadProfileName = async () => {
			const result = await getUserDataFirebase(user.uid);
			if (!isMounted || !result.success) return;
			const storedName = (result.data as { name?: unknown })?.name;
			if (typeof storedName === 'string' && storedName.trim()) {
				setProfileName(storedName.trim());
			}
		};

		void loadProfileName();
		return () => { isMounted = false; };
	}, [user?.displayName, user?.uid]);

	const groups = React.useMemo(() => {
		const visibleGroups = createGroups().map(group => ({
			...group,
			options: group.options.filter(option => !option.visibilityKey || isRouteVisible(option.visibilityKey)),
		}));

		if (pathname !== APP_ROUTE_PATHS.bankMovements) return visibleGroups;

		return visibleGroups.map(group =>
			group.value === HOME_TAB_INDEX.dashboard
				? {
						...group,
						options: [
							group.options[0],
							{
								id: 'bank-movements',
								label: 'Movimentos do banco',
								icon: <Landmark size={18} />,
								matchPaths: [APP_ROUTE_PATHS.bankMovements],
								onSelect: () => {},
							},
							...group.options.slice(1),
						].filter((option): option is NavigatorOption => Boolean(option)),
					}
				: group,
		);
	}, [isRouteVisible, pathname]);
	const resolvedGroups = React.useMemo(
		() =>
			groups.map(group => ({
				...group,
				options: group.options.map(option => {
					if (option.id === 'mandatory-expenses' && pathname === APP_ROUTE_PATHS.addMandatoryExpenses) {
						return {
							...option,
							label: hasRouteParamValue(params.expenseId)
								? 'Editar gasto obrigatório'
								: 'Registrar gasto obrigatório',
						};
					}
					if (option.id === 'mandatory-gains' && pathname === APP_ROUTE_PATHS.addMandatoryGains) {
						return {
							...option,
							label: hasRouteParamValue(params.gainTemplateId)
								? 'Editar ganho obrigatório'
								: 'Registrar ganho obrigatório',
						};
					}
					if (option.id === 'financial-list' && pathname === APP_ROUTE_PATHS.addFinance) {
						return { ...option, label: 'Registrar investimento' };
					}
					return option;
				}),
			})),
		[groups, params.expenseId, params.gainTemplateId, pathname],
	);

	const isActive = React.useCallback(
		(option: NavigatorOption, group: NavigatorGroup) => {
			if (option.id === 'settings') return pathname === APP_ROUTE_PATHS.home && homeTab === HOME_TAB_INDEX.config;
			if (pathname === APP_ROUTE_PATHS.home) {
				return group.value === homeTab && option.id === resolvedGroups.find(item => item.value === group.value)?.options[0]?.id;
			}
			return option.matchPaths?.includes(pathname as AppRoutePath) ?? false;
		},
		[homeTab, pathname, resolvedGroups],
	);

	const handleSelect = React.useCallback(
		(option: NavigatorOption) => {
			setOpenMobileGroup(null);
			if (option.id === 'logout') {
				if (logoutInFlightRef.current) return;
				logoutInFlightRef.current = true;
				void logoutUser(isDarkMode, user?.uid, user?.displayName).finally(() => {
					logoutInFlightRef.current = false;
				});
				return;
			}
			option.onSelect();
		},
		[isDarkMode, user?.displayName, user?.uid],
	);

	const items = React.useMemo(
		() =>
			resolvedGroups.flatMap(group => [
				{ type: 'section', label: group.label },
				...group.options.map(option => ({
					type: option.id === 'logout' ? 'action' : undefined,
					label: option.label,
					icon: option.icon,
					link: getWebLink(option),
					isActive: isActive(option, group),
					onSelect: () => handleSelect(option),
				})),
			]),
		[handleSelect, isActive, resolvedGroups],
	);

	if (isDesktopWeb) {
		return (
			<StaggeredMenu
				className="finance-menu"
				position="left"
				isFixed
				colors={['#1f1808', '#8a6a0a', '#facc15']}
				accentColor="#facc15"
				menuButtonColor="#e2e8f0"
				openMenuButtonColor="#fef08a"
				brandName="Lumus"
				brandSubtitle="Finanças"
				profile={{
					name: profileName || user?.email?.split('@')[0] || 'Usuário',
					subtitle: user?.email || '',
					imageUrl: user?.photoURL || '',
					initials: (profileName || user?.email || 'U').trim().charAt(0).toUpperCase(),
				}}
				collapsedRail
				displayItemNumbering={false}
				displaySocials={false}
				items={items}
			/>
		);
	}

	const activeMobileGroup = resolvedGroups.find(group => group.value === openMobileGroup) ?? null;
	return (
		<View accessibilityRole="navigation" accessibilityLabel="Navegação principal" style={{ backgroundColor: '#030617' }}>
			{activeMobileGroup ? (
				<View style={{ borderTopWidth: 1, borderTopColor: '#1e293b', padding: 10, gap: 4 }}>
					{activeMobileGroup.options.map(option => (
						<Pressable
							key={option.id}
							onPress={() => handleSelect(option)}
							accessibilityRole="button"
							accessibilityState={{ selected: isActive(option, activeMobileGroup) }}
							style={({ pressed }) => ({
								minHeight: 48,
								paddingHorizontal: 14,
								borderRadius: 12,
								justifyContent: 'center',
								backgroundColor: isActive(option, activeMobileGroup) ? 'rgba(250, 204, 21, 0.13)' : 'transparent',
								opacity: pressed ? 0.78 : 1,
							})}
						>
							<Text style={{ color: isActive(option, activeMobileGroup) ? '#fde047' : '#e2e8f0', fontWeight: '700' }}>
								{option.label}
							</Text>
						</Pressable>
					))}
				</View>
			) : null}
			<View style={{ flexDirection: 'row', minHeight: 62, paddingHorizontal: 12 }}>
				{resolvedGroups.map(group => (
					<Pressable
						key={group.value}
						onPress={() => setOpenMobileGroup(current => (current === group.value ? null : group.value))}
						accessibilityRole="button"
						accessibilityState={{ expanded: openMobileGroup === group.value, selected: group.value === homeTab && pathname === APP_ROUTE_PATHS.home }}
						style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
					>
						<Text style={{ color: '#cbd5e1', fontSize: 12, fontWeight: '800' }}>{group.label}</Text>
					</Pressable>
				))}
			</View>
		</View>
	);
}
