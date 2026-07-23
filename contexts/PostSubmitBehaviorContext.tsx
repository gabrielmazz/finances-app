import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type PostSubmitScreenKey =
	| 'addRegisterExpenses'
	| 'addRegisterGain'
	| 'addMandatoryExpenses'
	| 'addMandatoryGains'
	| 'addFinance'
	| 'addRescue'
	| 'transferScreen'
	| 'registerMonthlyBalance'
	| 'addRegisterBank'
	| 'addRegisterTag'
	| 'addRegisterUser'
	| 'addUserRelation';

export type PostSubmitDestinationKey =
	| 'homeDashboard'
	| 'homeControl'
	| 'homeConfigurations'
	| 'categoryAnalysis'
	| 'addRegisterExpenses'
	| 'addRegisterGain'
	| 'registerMonthlyBalance'
	| 'transferScreen'
	| 'addRescue'
	| 'mandatoryExpenses'
	| 'mandatoryGains'
	| 'financialList'
	| 'addRegisterBank'
	| 'addRegisterTag'
	| 'addRegisterUser'
	| 'addUserRelation';

export type PostSubmitBehaviorMode = 'create' | 'edit';

export type PostSubmitBehavior = {
	shouldReturnAfterSubmit: boolean;
	returnDestination: PostSubmitDestinationKey;
	shouldClearFieldsAfterSubmit: boolean;
};

type PostSubmitBehaviorContextValue = {
	behaviorByScreen: Record<PostSubmitScreenKey, Record<PostSubmitBehaviorMode, PostSubmitBehavior>>;
	getBehaviorForScreen: (
		screenKey: PostSubmitScreenKey,
		mode?: PostSubmitBehaviorMode,
	) => PostSubmitBehavior;
	updateBehaviorForScreen: (
		screenKey: PostSubmitScreenKey,
		mode: PostSubmitBehaviorMode,
		patch:
			| Partial<PostSubmitBehavior>
			| ((current: PostSubmitBehavior) => PostSubmitBehavior),
	) => void;
	isLoadingPostSubmitBehavior: boolean;
};

export const POST_SUBMIT_SCREEN_OPTIONS: Array<{
	key: PostSubmitScreenKey;
	label: string;
	description: string;
}> = [
	{
		key: 'addRegisterExpenses',
		label: 'Registrar despesa',
		description: 'Define o destino depois de criar uma despesa comum.',
	},
	{
		key: 'addRegisterGain',
		label: 'Registrar ganho',
		description: 'Define o destino depois de criar uma receita comum.',
	},
	{
		key: 'addMandatoryExpenses',
		label: 'Gastos obrigatórios',
		description: 'Define o destino depois de salvar templates de despesas fixas.',
	},
	{
		key: 'addMandatoryGains',
		label: 'Ganhos obrigatórios',
		description: 'Define o destino depois de salvar templates de receitas fixas.',
	},
	{
		key: 'addFinance',
		label: 'Investimentos',
		description: 'Define o destino depois de cadastrar um investimento.',
	},
	{
		key: 'addRescue',
		label: 'Saque em dinheiro',
		description: 'Define o destino depois de registrar um saque.',
	},
	{
		key: 'transferScreen',
		label: 'Transferência',
		description: 'Define o destino depois de concluir uma transferência.',
	},
	{
		key: 'registerMonthlyBalance',
		label: 'Saldo mensal',
		description: 'Define o destino depois de salvar um saldo mensal.',
	},
	{
		key: 'addRegisterBank',
		label: 'Bancos',
		description: 'Define o destino depois de cadastrar um banco.',
	},
	{
		key: 'addRegisterTag',
		label: 'Categorias',
		description: 'Define o destino depois de cadastrar uma categoria fora dos fluxos inline.',
	},
	{
		key: 'addRegisterUser',
		label: 'Usuários',
		description: 'Define o destino depois de cadastrar um usuário.',
	},
	{
		key: 'addUserRelation',
		label: 'Vínculos de usuário',
		description: 'Define o destino depois de vincular usuários.',
	},
];

export const POST_SUBMIT_DESTINATION_OPTIONS: Array<{
	key: PostSubmitDestinationKey;
	label: string;
	description: string;
}> = [
	{
		key: 'homeDashboard',
		label: 'Home',
		description: 'Volta para o dashboard principal.',
	},
	{
		key: 'homeControl',
		label: 'Controle',
		description: 'Volta para a aba de controle.',
	},
	{
		key: 'homeConfigurations',
		label: 'Configurações',
		description: 'Volta para a aba de configurações.',
	},
	{
		key: 'categoryAnalysis',
		label: 'Análise por categoria',
		description: 'Abre o relatório por categorias.',
	},
	{
		key: 'addRegisterExpenses',
		label: 'Registrar despesa',
		description: 'Abre o formulário de despesas.',
	},
	{
		key: 'addRegisterGain',
		label: 'Registrar ganho',
		description: 'Abre o formulário de receitas.',
	},
	{
		key: 'registerMonthlyBalance',
		label: 'Saldo mensal',
		description: 'Abre o registro de saldo mensal.',
	},
	{
		key: 'transferScreen',
		label: 'Transferência',
		description: 'Abre a tela de transferência.',
	},
	{
		key: 'addRescue',
		label: 'Saque em dinheiro',
		description: 'Abre o registro de saque.',
	},
	{
		key: 'mandatoryExpenses',
		label: 'Lista de gastos obrigatórios',
		description: 'Abre a listagem de despesas fixas.',
	},
	{
		key: 'mandatoryGains',
		label: 'Lista de ganhos obrigatórios',
		description: 'Abre a listagem de receitas fixas.',
	},
	{
		key: 'financialList',
		label: 'Lista de investimentos',
		description: 'Abre a carteira de investimentos.',
	},
	{
		key: 'addRegisterBank',
		label: 'Novo banco',
		description: 'Abre o cadastro de banco.',
	},
	{
		key: 'addRegisterTag',
		label: 'Nova categoria',
		description: 'Abre o cadastro de categoria.',
	},
	{
		key: 'addRegisterUser',
		label: 'Novo usuário',
		description: 'Abre o cadastro de usuário.',
	},
	{
		key: 'addUserRelation',
		label: 'Relacionar usuário',
		description: 'Abre a tela de vínculo entre usuários.',
	},
];

const STORAGE_KEY = '@finances/post-submit-behavior';

export const DEFAULT_POST_SUBMIT_BEHAVIOR: PostSubmitBehavior = {
	shouldReturnAfterSubmit: true,
	returnDestination: 'homeDashboard',
	shouldClearFieldsAfterSubmit: false,
};

const screenKeys = POST_SUBMIT_SCREEN_OPTIONS.map(item => item.key);
const destinationKeys = POST_SUBMIT_DESTINATION_OPTIONS.map(item => item.key);

const createDefaultBehaviorMap = (): Record<
	PostSubmitScreenKey,
	Record<PostSubmitBehaviorMode, PostSubmitBehavior>
> =>
	screenKeys.reduce(
		(acc, key) => ({
			...acc,
			[key]: {
				create: { ...DEFAULT_POST_SUBMIT_BEHAVIOR },
				edit: { ...DEFAULT_POST_SUBMIT_BEHAVIOR },
			},
		}),
		{} as Record<PostSubmitScreenKey, Record<PostSubmitBehaviorMode, PostSubmitBehavior>>,
	);

const isPostSubmitScreenKey = (value: unknown): value is PostSubmitScreenKey =>
	typeof value === 'string' && screenKeys.includes(value as PostSubmitScreenKey);

const isPostSubmitDestinationKey = (value: unknown): value is PostSubmitDestinationKey =>
	typeof value === 'string' && destinationKeys.includes(value as PostSubmitDestinationKey);

export const normalizePostSubmitBehavior = (value: unknown, mode: PostSubmitBehaviorMode): PostSubmitBehavior => {
	if (!value || typeof value !== 'object') {
		return { ...DEFAULT_POST_SUBMIT_BEHAVIOR };
	}

	const rawBehavior = value as Partial<PostSubmitBehavior>;
	const shouldReturnAfterSubmit =
		typeof rawBehavior.shouldReturnAfterSubmit === 'boolean'
			? rawBehavior.shouldReturnAfterSubmit
			: DEFAULT_POST_SUBMIT_BEHAVIOR.shouldReturnAfterSubmit;
	// [[Comportamento Pós-Registro]]: edições também usam o destino escolhido.
	// Preferências antigas, sem esse campo, continuam retornando para a Home.
	const returnDestination = isPostSubmitDestinationKey(rawBehavior.returnDestination)
		? rawBehavior.returnDestination
		: DEFAULT_POST_SUBMIT_BEHAVIOR.returnDestination;
	const shouldClearFieldsAfterSubmit =
		typeof rawBehavior.shouldClearFieldsAfterSubmit === 'boolean'
			? rawBehavior.shouldClearFieldsAfterSubmit
			: DEFAULT_POST_SUBMIT_BEHAVIOR.shouldClearFieldsAfterSubmit;

	return {
		shouldReturnAfterSubmit,
		returnDestination,
		shouldClearFieldsAfterSubmit: mode === 'edit' || shouldReturnAfterSubmit
			? false
			: shouldClearFieldsAfterSubmit,
	};
};

const normalizeBehaviorMap = (
	value: unknown,
): Record<PostSubmitScreenKey, Record<PostSubmitBehaviorMode, PostSubmitBehavior>> => {
	const fallbackMap = createDefaultBehaviorMap();

	if (!value || typeof value !== 'object') {
		return fallbackMap;
	}

	return Object.entries(value as Record<string, unknown>).reduce(
		(acc, [key, rawBehavior]) => {
			if (!isPostSubmitScreenKey(key)) {
				return acc;
			}

			const rawBehaviorByMode =
				rawBehavior && typeof rawBehavior === 'object'
					? (rawBehavior as Partial<Record<PostSubmitBehaviorMode, unknown>>)
					: null;
			const legacyBehavior = rawBehaviorByMode?.create ? null : rawBehavior;

			return {
				...acc,
				[key]: {
					// Preferências salvas antes da separação pertencem aos cadastros.
					create: normalizePostSubmitBehavior(rawBehaviorByMode?.create ?? legacyBehavior, 'create'),
					edit: normalizePostSubmitBehavior(rawBehaviorByMode?.edit, 'edit'),
				},
			};
		},
		fallbackMap,
	);
};

const PostSubmitBehaviorContext = React.createContext<PostSubmitBehaviorContextValue | undefined>(undefined);

export const PostSubmitBehaviorProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
	const [behaviorByScreen, setBehaviorByScreen] = React.useState(createDefaultBehaviorMap);
	const [isLoadingPostSubmitBehavior, setIsLoadingPostSubmitBehavior] = React.useState(true);

	const persistBehaviorMap = React.useCallback(async (nextBehaviorByScreen: Record<
		PostSubmitScreenKey,
		Record<PostSubmitBehaviorMode, PostSubmitBehavior>
	>) => {
		try {
			await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextBehaviorByScreen));
		} catch (error) {
			console.error('Erro ao salvar comportamento pós-registro:', error);
		}
	}, []);

	React.useEffect(() => {
		let isMounted = true;

		const loadBehaviorMap = async () => {
			try {
				const storedValue = await AsyncStorage.getItem(STORAGE_KEY);

				if (!isMounted) {
					return;
				}

				if (!storedValue) {
					setBehaviorByScreen(createDefaultBehaviorMap());
					return;
				}

				setBehaviorByScreen(normalizeBehaviorMap(JSON.parse(storedValue)));
			} catch (error) {
				console.error('Erro ao carregar comportamento pós-registro:', error);
				if (isMounted) {
					setBehaviorByScreen(createDefaultBehaviorMap());
				}
			} finally {
				if (isMounted) {
					setIsLoadingPostSubmitBehavior(false);
				}
			}
		};

		void loadBehaviorMap();

		return () => {
			isMounted = false;
		};
	}, []);

	const getBehaviorForScreen = React.useCallback(
		(screenKey: PostSubmitScreenKey, mode: PostSubmitBehaviorMode = 'create') =>
			behaviorByScreen[screenKey]?.[mode] ?? { ...DEFAULT_POST_SUBMIT_BEHAVIOR },
		[behaviorByScreen],
	);

	const updateBehaviorForScreen = React.useCallback<PostSubmitBehaviorContextValue['updateBehaviorForScreen']>(
		(screenKey, mode, patch) => {
			setBehaviorByScreen(currentMap => {
				const currentBehavior = currentMap[screenKey]?.[mode] ?? { ...DEFAULT_POST_SUBMIT_BEHAVIOR };
				const patchedBehavior =
					typeof patch === 'function'
						? patch(currentBehavior)
						: {
							...currentBehavior,
							...patch,
						};
				const normalizedBehavior = normalizePostSubmitBehavior(patchedBehavior, mode);
				const nextMap = {
					...currentMap,
					[screenKey]: {
						...(currentMap[screenKey] ?? {
							create: { ...DEFAULT_POST_SUBMIT_BEHAVIOR },
							edit: { ...DEFAULT_POST_SUBMIT_BEHAVIOR },
						}),
						[mode]: normalizedBehavior,
					},
				};

				void persistBehaviorMap(nextMap);
				return nextMap;
			});
		},
		[persistBehaviorMap],
	);

	const contextValue = React.useMemo<PostSubmitBehaviorContextValue>(
		() => ({
			behaviorByScreen,
			getBehaviorForScreen,
			updateBehaviorForScreen,
			isLoadingPostSubmitBehavior,
		}),
		[
			behaviorByScreen,
			getBehaviorForScreen,
			isLoadingPostSubmitBehavior,
			updateBehaviorForScreen,
		],
	);

	return (
		<PostSubmitBehaviorContext.Provider value={contextValue}>
			{children}
		</PostSubmitBehaviorContext.Provider>
	);
};

export const usePostSubmitBehaviorPreferences = () => {
	const context = React.useContext(PostSubmitBehaviorContext);

	if (!context) {
		throw new Error('usePostSubmitBehaviorPreferences deve ser utilizado dentro de um PostSubmitBehaviorProvider.');
	}

	return context;
};
