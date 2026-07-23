import React from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StatusBar, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
	Accordion,
	AccordionContent,
	AccordionHeader,
	AccordionIcon,
	AccordionItem,
	AccordionTitleText,
	AccordionTrigger,
} from '@/components/ui/accordion';
import { Box } from '@/components/ui/box';
import { ChevronDownIcon, ChevronUpIcon } from '@/components/ui/icon';
import { Heading } from '@/components/ui/heading';
import { HStack } from '@/components/ui/hstack';
import { Image } from '@/components/ui/image';
import { Input, InputField } from '@/components/ui/input';
import {
	Actionsheet,
	ActionsheetBackdrop,
	ActionsheetContent,
	ActionsheetDragIndicator,
	ActionsheetDragIndicatorWrapper,
	ActionsheetItem,
	ActionsheetItemText,
	ActionsheetScrollView,
} from '@/components/ui/actionsheet';
import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import Navigator from '@/components/uiverse/navigator';
import {
	POST_SUBMIT_DESTINATION_OPTIONS,
	type PostSubmitBehaviorMode,
	type PostSubmitDestinationKey,
	type PostSubmitScreenKey,
	usePostSubmitBehaviorPreferences,
} from '@/contexts/PostSubmitBehaviorContext';
import { useRouteVisibility } from '@/contexts/RouteVisibilityContext';
import { useScreenStyles } from '@/hooks/useScreenStyle';
import {
	getPostSubmitDestinationPath,
	getRouteVisibilityKeyForPath,
	navigateToHomeConfigurations,
} from '@/utils/navigation';
import LoginWallpaper from '@/assets/Background/wallpaper01.png';
import AddFinancialScreenIllustration from '@/assets/UnDraw/addFinancialScreen.svg';
import AddMandatoryExpensesScreenIllustration from '@/assets/UnDraw/addMandatoryExpensesScreen.svg';
import AddMandatoryGainsScreenIllustration from '@/assets/UnDraw/addMandatoryGainsScreen.svg';
import AddRegisterBankScreenIllustration from '@/assets/UnDraw/addRegisterBankScreen.svg';
import AddRegisterExpensesScreenIllustration from '@/assets/UnDraw/addRegisterExpanseScreen.svg';
import AddRegisterGainScreenIllustration from '@/assets/UnDraw/addRegisterGainScreen.svg';
import AddRegisterMonthlyBalanceScreenIllustration from '@/assets/UnDraw/addRegisterMonthlyBalanceScreen.svg';
import AddRegisterTagScreenIllustration from '@/assets/UnDraw/addRegisterTagScreen.svg';
import AddRegisterUserScreenIllustration from '@/assets/UnDraw/addRegisterUserScreen.svg';
import AddRescueScreenIllustration from '@/assets/UnDraw/addRescue.svg';
import AddUserRelationScreenIllustration from '@/assets/UnDraw/addUserRelationScreen.svg';
import CategoryAnalysisScreenIllustration from '@/assets/UnDraw/analyzeGainExpensesTag.svg';
import ConfigurationsScreenIllustration from '@/assets/UnDraw/configurationsScreen.svg';
import FinancialListScreenIllustration from '@/assets/UnDraw/financialListScreen.svg';
import HomeScreenIllustration from '@/assets/UnDraw/homeScreen.svg';
import LumusAssistantScreenIllustration from '@/assets/UnDraw/lumusAssistantScreen.svg';
import MandatoryExpensesListScreenIllustration from '@/assets/UnDraw/mandatoryExpensesListScreen.svg';
import MandatoryGainsListScreenIllustration from '@/assets/UnDraw/mandatoryGainsListScreen.svg';
import ScreenSettingsIllustration from '@/assets/UnDraw/screenConfigurationsSettings.svg';
import TransferScreenIllustration from '@/assets/UnDraw/transferScreen.svg';

type ScreenSettingsItem = {
	key: PostSubmitScreenKey;
	mode: PostSubmitBehaviorMode;
	label: string;
	description: string;
	Illustration: React.ComponentType<any>;
};

type ScreenSettingsCategory = {
	id: string;
	label: string;
	description: string;
	items: ScreenSettingsItem[];
};

type ReturnDestinationSelection = {
	screenKey: PostSubmitScreenKey;
	mode: PostSubmitBehaviorMode;
};

const normalizeSearchText = (value: string) =>
	value
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.trim();

const screenSettingsCategories: ScreenSettingsCategory[] = [
	{
		id: 'financial-records',
		label: 'Lançamentos e movimentações',
		description: 'Defina o que acontece depois de registrar uma movimentação financeira.',
		items: [
			{
				key: 'addRegisterExpenses',
				mode: 'create',
				label: 'Registrar despesa',
				description: 'Configure o comportamento após incluir uma despesa comum.',
				Illustration: AddRegisterExpensesScreenIllustration,
			},
			{
				key: 'addRegisterGain',
				mode: 'create',
				label: 'Registrar ganho',
				description: 'Configure o comportamento após incluir uma receita comum.',
				Illustration: AddRegisterGainScreenIllustration,
			},
			{
				key: 'transferScreen',
				mode: 'create',
				label: 'Registrar transferência',
				description: 'Configure o comportamento após concluir uma transferência.',
				Illustration: TransferScreenIllustration,
			},
			{
				key: 'addRescue',
				mode: 'create',
				label: 'Registrar saque em dinheiro',
				description: 'Configure o comportamento após registrar um saque.',
				Illustration: AddRescueScreenIllustration,
			},
			{
				key: 'registerMonthlyBalance',
				mode: 'create',
				label: 'Registrar saldo mensal',
				description: 'Configure o comportamento após salvar um saldo para o mês.',
				Illustration: AddRegisterMonthlyBalanceScreenIllustration,
			},
		],
	},
	{
		id: 'planning',
		label: 'Planejamento e investimentos',
		description: 'Ajuste os formulários de itens recorrentes e investimentos.',
		items: [
			{
				key: 'addMandatoryExpenses',
				mode: 'create',
				label: 'Registrar gasto obrigatório',
				description: 'Configure o comportamento após cadastrar uma despesa fixa.',
				Illustration: AddMandatoryExpensesScreenIllustration,
			},
			{
				key: 'addMandatoryGains',
				mode: 'create',
				label: 'Registrar ganho obrigatório',
				description: 'Configure o comportamento após cadastrar uma receita fixa.',
				Illustration: AddMandatoryGainsScreenIllustration,
			},
			{
				key: 'addFinance',
				mode: 'create',
				label: 'Registrar investimento',
				description: 'Configure o comportamento após cadastrar um investimento.',
				Illustration: AddFinancialScreenIllustration,
			},
		],
	},
	{
		id: 'registrations',
		label: 'Cadastros e vínculos',
		description: 'Organize o comportamento dos cadastros de apoio ao controle financeiro.',
		items: [
			{
				key: 'addRegisterBank',
				mode: 'create',
				label: 'Cadastrar banco',
				description: 'Configure o comportamento após cadastrar um banco.',
				Illustration: AddRegisterBankScreenIllustration,
			},
			{
				key: 'addRegisterTag',
				mode: 'create',
				label: 'Cadastrar categoria',
				description: 'Configure o comportamento após cadastrar uma categoria fora de um fluxo inline.',
				Illustration: AddRegisterTagScreenIllustration,
			},
			{
				key: 'addRegisterUser',
				mode: 'create',
				label: 'Cadastrar usuário',
				description: 'Configure o comportamento após cadastrar um usuário.',
				Illustration: AddRegisterUserScreenIllustration,
			},
			{
				key: 'addUserRelation',
				mode: 'create',
				label: 'Relacionar usuário',
				description: 'Configure o comportamento após criar um vínculo de usuário.',
				Illustration: AddUserRelationScreenIllustration,
			},
		],
	},
	{
		id: 'editing',
		label: 'Edições',
		description: 'Após uma edição, a tela nunca limpa os dados já carregados.',
		items: [
			{
				key: 'addRegisterExpenses',
				mode: 'edit',
				label: 'Editar despesa',
				description: 'Escolha a tela para abrir depois de atualizar uma despesa.',
				Illustration: AddRegisterExpensesScreenIllustration,
			},
			{
				key: 'addRegisterGain',
				mode: 'edit',
				label: 'Editar ganho',
				description: 'Escolha a tela para abrir depois de atualizar uma receita.',
				Illustration: AddRegisterGainScreenIllustration,
			},
			{
				key: 'addMandatoryExpenses',
				mode: 'edit',
				label: 'Editar gasto obrigatório',
				description: 'Escolha a tela para abrir depois de atualizar uma despesa fixa.',
				Illustration: AddMandatoryExpensesScreenIllustration,
			},
			{
				key: 'addMandatoryGains',
				mode: 'edit',
				label: 'Editar ganho obrigatório',
				description: 'Escolha a tela para abrir depois de atualizar uma receita fixa.',
				Illustration: AddMandatoryGainsScreenIllustration,
			},
			{
				key: 'registerMonthlyBalance',
				mode: 'edit',
				label: 'Editar saldo mensal',
				description: 'Escolha a tela para abrir depois de atualizar o saldo do mês.',
				Illustration: AddRegisterMonthlyBalanceScreenIllustration,
			},
			{
				key: 'addRegisterBank',
				mode: 'edit',
				label: 'Editar banco',
				description: 'Escolha a tela para abrir depois de atualizar um banco.',
				Illustration: AddRegisterBankScreenIllustration,
			},
			{
				key: 'addRegisterTag',
				mode: 'edit',
				label: 'Editar categoria',
				description: 'Escolha a tela para abrir depois de atualizar uma categoria.',
				Illustration: AddRegisterTagScreenIllustration,
			},
		],
	},
];

const returnDestinationIllustrationByKey: Record<PostSubmitDestinationKey, React.ComponentType<any>> = {
	homeDashboard: HomeScreenIllustration,
	// A aba Controle abre o formulário de despesa dentro da Home.
	homeControl: AddRegisterExpensesScreenIllustration,
	homeConfigurations: ConfigurationsScreenIllustration,
	categoryAnalysis: CategoryAnalysisScreenIllustration,
	addRegisterExpenses: AddRegisterExpensesScreenIllustration,
	addRegisterGain: AddRegisterGainScreenIllustration,
	registerMonthlyBalance: AddRegisterMonthlyBalanceScreenIllustration,
	transferScreen: TransferScreenIllustration,
	addRescue: AddRescueScreenIllustration,
	mandatoryExpenses: MandatoryExpensesListScreenIllustration,
	mandatoryGains: MandatoryGainsListScreenIllustration,
	financialList: FinancialListScreenIllustration,
	addRegisterBank: AddRegisterBankScreenIllustration,
	addRegisterTag: AddRegisterTagScreenIllustration,
	addRegisterUser: AddRegisterUserScreenIllustration,
	addUserRelation: AddUserRelationScreenIllustration,
};

const getDestinationLabel = (destinationKey: PostSubmitDestinationKey) =>
	POST_SUBMIT_DESTINATION_OPTIONS.find(option => option.key === destinationKey)?.label ?? 'Home';

export default function ScreenSettingsScreen() {
	const {
		isDarkMode,
		surfaceBackground,
		cardBackground,
		bodyText,
		helperText,
		inputField,
		fieldContainerClassName,
		notTintedCardClassName,
		fieldContainerCardClassName,
		heroHeight,
		insets,
		switchTrackColor,
		switchThumbColor,
		switchIosBackgroundColor,
	} = useScreenStyles();
	const { getBehaviorForScreen, updateBehaviorForScreen, isLoadingPostSubmitBehavior } =
		usePostSubmitBehaviorPreferences();
	const { isRouteVisible, setRouteVisibility, isLoadingRouteVisibility } = useRouteVisibility();
	const [screenSearch, setScreenSearch] = React.useState('');
	const [returnDestinationSelection, setReturnDestinationSelection] =
		React.useState<ReturnDestinationSelection | null>(null);
	const [returnDestinationSearch, setReturnDestinationSearch] = React.useState('');
	const returnDestinationSheetSnapPoints = React.useMemo(() => [86], []);

	const filteredCategories = React.useMemo(() => {
		const normalizedSearch = normalizeSearchText(screenSearch);

		if (!normalizedSearch) {
			return screenSettingsCategories;
		}

		const searchTerms = normalizedSearch.split(/\s+/).filter(Boolean);

		return screenSettingsCategories
			.map(category => ({
				...category,
				items: category.items.filter(item => {
					const searchableText = normalizeSearchText(
						[category.label, category.description, item.label, item.description].join(' '),
					);

					return searchTerms.every(term => searchableText.includes(term));
				}),
			}))
			.filter(category => category.items.length > 0);
	}, [screenSearch]);

	const isLumusAssistantSearchMatch = React.useMemo(() => {
		const normalizedSearch = normalizeSearchText(screenSearch);

		if (!normalizedSearch) {
			return true;
		}

		const searchTerms = normalizedSearch.split(/\s+/).filter(Boolean);
		const searchableText = normalizeSearchText('Lumus IA Assistente inteligente Configure o acesso ao assistente');

		return searchTerms.every(term => searchableText.includes(term));
	}, [screenSearch]);
	const isLumusAssistantVisible = isRouteVisible('lumusAssistant');

	const handleReturnToggle = React.useCallback(
		(screenKey: PostSubmitScreenKey, mode: PostSubmitBehaviorMode, value: boolean) => {
			updateBehaviorForScreen(screenKey, mode, current => ({
				...current,
				shouldReturnAfterSubmit: value,
				shouldClearFieldsAfterSubmit: mode === 'create' ? !value : false,
			}));
		},
		[updateBehaviorForScreen],
	);

	const handleRouteVisibilityChange = React.useCallback(
		(screenKey: PostSubmitScreenKey | 'lumusAssistant', isVisible: boolean) => {
			setRouteVisibility(screenKey, isVisible);
		},
		[setRouteVisibility],
	);

	const handleDestinationChange = React.useCallback(
		(screenKey: PostSubmitScreenKey, mode: PostSubmitBehaviorMode, destination: PostSubmitDestinationKey) => {
			updateBehaviorForScreen(screenKey, mode, {
				returnDestination: destination,
			});
		},
		[updateBehaviorForScreen],
	);

	const handleCloseReturnDestinationSheet = React.useCallback(() => {
		setReturnDestinationSearch('');
		setReturnDestinationSelection(null);
	}, []);

	const handleOpenReturnDestinationSheet = React.useCallback(
		(screenKey: PostSubmitScreenKey, mode: PostSubmitBehaviorMode) => {
			if (isLoadingPostSubmitBehavior) {
				return;
			}

			setReturnDestinationSearch('');
			setReturnDestinationSelection({ screenKey, mode });
		},
		[isLoadingPostSubmitBehavior],
	);

	const handleSelectReturnDestination = React.useCallback(
		(destination: PostSubmitDestinationKey) => {
			if (!returnDestinationSelection) {
				return;
			}

			handleDestinationChange(
				returnDestinationSelection.screenKey,
				returnDestinationSelection.mode,
				destination,
			);
			handleCloseReturnDestinationSheet();
		},
		[handleCloseReturnDestinationSheet, handleDestinationChange, returnDestinationSelection],
	);

	const filteredReturnDestinationOptions = React.useMemo(() => {
		const normalizedSearch = normalizeSearchText(returnDestinationSearch);
		const searchTerms = normalizedSearch.split(/\s+/).filter(Boolean);

		return POST_SUBMIT_DESTINATION_OPTIONS.filter(option => {
			const searchableText = normalizeSearchText(`${option.label} ${option.description}`);
			const destinationPath = getPostSubmitDestinationPath(option.key);
			const routeVisibilityKey = destinationPath
				? getRouteVisibilityKeyForPath(destinationPath)
				: null;

			return (
				(!routeVisibilityKey || isRouteVisible(routeVisibilityKey)) &&
				searchTerms.every(term => searchableText.includes(term))
			);
		});
	}, [isRouteVisible, returnDestinationSearch]);

	const selectedReturnDestination = returnDestinationSelection
		? getBehaviorForScreen(returnDestinationSelection.screenKey, returnDestinationSelection.mode).returnDestination
		: null;

	const handleClearFieldsToggle = React.useCallback(
		(screenKey: PostSubmitScreenKey, value: boolean) => {
			updateBehaviorForScreen(screenKey, 'create', current => {
				if (current.shouldReturnAfterSubmit) {
					return current;
				}

				return {
					...current,
					shouldClearFieldsAfterSubmit: value,
				};
			});
		},
		[updateBehaviorForScreen],
	);

	const handleBackToConfigurations = React.useCallback(() => {
		navigateToHomeConfigurations();
		return true;
	}, []);

	return (
		<SafeAreaView className="flex-1" edges={['left', 'right', 'bottom']} style={{ backgroundColor: surfaceBackground }}>
			<StatusBar translucent backgroundColor="transparent" barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
			<View className="flex-1" style={{ backgroundColor: surfaceBackground }}>
				<View className={`absolute left-0 right-0 top-0 ${cardBackground}`} style={{ height: heroHeight }}>
					<Image
						source={LoginWallpaper}
						alt="Background da tela de configurações das telas"
						className="absolute h-full w-full rounded-b-3xl"
						resizeMode="cover"
					/>

					<VStack
						className="h-full w-full items-center justify-start gap-4 px-6"
						style={{ paddingTop: insets.top + 24 }}
					>
						<Heading size="xl" className="text-center text-white">
							Configurações das telas
						</Heading>
						<ScreenSettingsIllustration width="40%" height="40%" className="opacity-90" />
					</VStack>
				</View>

				<ScrollView
					keyboardShouldPersistTaps="handled"
					keyboardDismissMode="on-drag"
					nestedScrollEnabled
					showsVerticalScrollIndicator={false}
					className={`flex-1 rounded-t-3xl ${cardBackground} px-6 pb-1`}
					style={{ marginTop: heroHeight - 64 }}
					contentContainerStyle={{ paddingBottom: 48 }}
				>
					<VStack className="mt-4 gap-4">
						<VStack className="gap-1">
							<Text className={`${bodyText} ml-1 text-sm font-semibold`}>Encontrar tela</Text>
							<Input className={fieldContainerClassName}>
								<InputField
									value={screenSearch}
									onChangeText={setScreenSearch}
									placeholder="Busque pelo nome da tela"
									autoCapitalize="none"
									autoCorrect={false}
									returnKeyType="search"
									accessibilityLabel="Buscar configurações por nome da tela"
									className={inputField}
								/>
							</Input>
						</VStack>

						{filteredCategories.map(category => (
							<Box key={category.id} className={`${notTintedCardClassName} px-4 py-4`}>
								<VStack className="gap-3">
									<VStack className="gap-1">
										<Heading size="md" className={bodyText}>
											{category.label}
										</Heading>
										<Text className={`${helperText} text-sm leading-5`}>{category.description}</Text>
									</VStack>

									<Accordion size="md" variant="unfilled" type="single" isCollapsible className="w-full">
										{category.items.map(item => {
											const behavior = getBehaviorForScreen(item.key, item.mode);
											const isEditing = item.mode === 'edit';
											const isScreenVisible = isRouteVisible(item.key);
											const isClearFieldsDisabled =
												isEditing || behavior.shouldReturnAfterSubmit || isLoadingPostSubmitBehavior;
											const selectedDestinationLabel = getDestinationLabel(behavior.returnDestination);
											const Illustration = item.Illustration;

											return (
												<AccordionItem key={`${item.mode}-${item.key}`} value={`${item.mode}-${item.key}`}>
													<AccordionHeader>
														<AccordionTrigger className="px-0 py-3">
															{({ isExpanded }: { isExpanded: boolean }) => (
																<View className="w-full flex-row items-center justify-between gap-3">
																	<View className="h-[64px] w-[64px] shrink-0 items-center justify-center rounded-2xl">
																		<Illustration width={64} height={64} className="opacity-90" />
																	</View>
																	<VStack className="min-w-0 flex-1 gap-1">
																		<AccordionTitleText className="flex-none font-semibold leading-5">
																			{item.label}
																		</AccordionTitleText>
																		<Text className={`${helperText} text-xs`} numberOfLines={1}>
																					{!isScreenVisible
																						? 'Oculta do navigator e sem acesso neste aparelho'
																						: isEditing
																							? behavior.shouldReturnAfterSubmit
																								? `Volta para ${selectedDestinationLabel} após atualizar`
																								: 'Permanece na edição com os dados atuais'
																							: behavior.shouldReturnAfterSubmit
																								? `Volta para ${selectedDestinationLabel}`
																								: behavior.shouldClearFieldsAfterSubmit
																									? 'Permanece na tela e limpa campos'
																									: 'Permanece na tela mantendo campos'}
																		</Text>
																	</VStack>
																	<AccordionIcon as={isExpanded ? ChevronUpIcon : ChevronDownIcon} className={helperText} />
																</View>
															)}
														</AccordionTrigger>
													</AccordionHeader>

													<AccordionContent className="px-0 pb-3">
														<Box className={`${notTintedCardClassName} px-4 py-4`}>
																				<VStack className="gap-4">
																					<Text className={`${helperText} text-sm leading-5`}>{item.description}</Text>

																					<View className={`${fieldContainerCardClassName} px-4 py-3`}>
																						<HStack className="items-center justify-between gap-4">
																							<VStack className="min-w-0 flex-1 gap-1">
																								<Text className={`${bodyText} text-sm font-semibold`}>Mostrar no app</Text>
																								<Text className={`${helperText} text-xs`}>
																									Quando desativada, a tela sai do navigator e não pode ser aberta neste aparelho.
																								</Text>
																							</VStack>
																							<Switch
																								value={isScreenVisible}
																								onValueChange={value => handleRouteVisibilityChange(item.key, value)}
																								isDisabled={isLoadingRouteVisibility}
																								trackColor={switchTrackColor}
																								thumbColor={switchThumbColor}
																								ios_backgroundColor={switchIosBackgroundColor}
																							/>
																						</HStack>
																					</View>

																					<View className={`${fieldContainerCardClassName} px-4 py-3`}>
																	<HStack className="items-center justify-between gap-4">
																		<VStack className="min-w-0 flex-1 gap-1">
																			<Text className={`${bodyText} text-sm font-semibold`}>Voltar após salvar</Text>
																			{isEditing ? (
																					<Text className={`${helperText} text-xs`}>
																						Depois de atualizar, a edição abre a tela escolhida.
																					</Text>
																				) : null}
																		</VStack>
																		<Switch
																			value={behavior.shouldReturnAfterSubmit}
																			onValueChange={value => handleReturnToggle(item.key, item.mode, value)}
																			isDisabled={isLoadingPostSubmitBehavior}
																			trackColor={switchTrackColor}
																			thumbColor={switchThumbColor}
																			ios_backgroundColor={switchIosBackgroundColor}
																		/>
																	</HStack>
																</View>

																<VStack className="gap-4">
																	<VStack className="gap-2">
																		<Text className={`${bodyText} text-sm font-semibold`}>Tela de retorno</Text>
																		<Pressable
																			onPress={() => handleOpenReturnDestinationSheet(item.key, item.mode)}
																			disabled={!behavior.shouldReturnAfterSubmit || isLoadingPostSubmitBehavior}
																			accessibilityRole="button"
																			accessibilityLabel="Escolher tela de retorno"
																			className={`${fieldContainerClassName} flex-row items-center justify-between gap-3 px-4 ${!behavior.shouldReturnAfterSubmit ? 'opacity-50' : ''}`}
																		>
																			<Text className={`${inputField} min-w-0 flex-1`} numberOfLines={1}>
																				{selectedDestinationLabel}
																			</Text>
																			<Text className={`${helperText} text-xs`}>Alterar</Text>
																		</Pressable>
																	</VStack>

																	{!isEditing ? (
																		<HStack className={`items-center justify-between gap-4 ${isClearFieldsDisabled ? 'opacity-50' : ''}`}>
																			<VStack className="min-w-0 flex-1">
																				<Text className={`${bodyText} text-sm font-semibold`}>Limpar campos</Text>
																				<Text className={`${helperText} text-xs`}>
																					Disponível apenas quando a tela não volta automaticamente.
																				</Text>
																			</VStack>
																			<Switch
																				value={!behavior.shouldReturnAfterSubmit && behavior.shouldClearFieldsAfterSubmit}
																				onValueChange={value => handleClearFieldsToggle(item.key, value)}
																				isDisabled={isClearFieldsDisabled}
																				trackColor={switchTrackColor}
																				thumbColor={switchThumbColor}
																				ios_backgroundColor={switchIosBackgroundColor}
																			/>
																		</HStack>
																	) : null}
																	</VStack>
															</VStack>
														</Box>
													</AccordionContent>
												</AccordionItem>
											);
										})}
									</Accordion>
								</VStack>
								</Box>
							))}

						{isLumusAssistantSearchMatch ? (
							<Box className={`${notTintedCardClassName} px-4 py-4`}>
								<Accordion size="md" variant="unfilled" type="single" isCollapsible className="w-full">
									<AccordionItem value="lumus-assistant">
										<AccordionHeader>
											<AccordionTrigger className="px-0 py-3">
												{({ isExpanded }: { isExpanded: boolean }) => (
													<View className="w-full flex-row items-center justify-between gap-3">
														<View className="h-[64px] w-[64px] shrink-0 items-center justify-center rounded-2xl">
															<LumusAssistantScreenIllustration width={64} height={64} className="opacity-90" />
														</View>
														<VStack className="min-w-0 flex-1 gap-1">
															<AccordionTitleText className="flex-none font-semibold leading-5">
																Assistente Lumus
															</AccordionTitleText>
															<Text className={`${helperText} text-xs`} numberOfLines={1}>
																{isLumusAssistantVisible
																	? 'Visível no navigator deste aparelho'
																	: 'Oculto do navigator e sem acesso neste aparelho'}
															</Text>
														</VStack>
														<AccordionIcon as={isExpanded ? ChevronUpIcon : ChevronDownIcon} className={helperText} />
													</View>
												)}
											</AccordionTrigger>
										</AccordionHeader>

										<AccordionContent className="px-0 pb-3">
											<Box className={`${notTintedCardClassName} px-4 py-4`}>
												<VStack className="gap-4">
													<Text className={`${helperText} text-sm leading-5`}>
														Defina se o assistente inteligente fica disponível neste aparelho.
													</Text>

													<View className={`${fieldContainerCardClassName} px-4 py-3`}>
														<HStack className="items-center justify-between gap-4">
															<VStack className="min-w-0 flex-1 gap-1">
																<Text className={`${bodyText} text-sm font-semibold`}>Mostrar no app</Text>
																<Text className={`${helperText} text-xs`}>
																	Quando desativado, o Lumus sai do navigator e a rota fica bloqueada neste aparelho.
																</Text>
															</VStack>
															<Switch
																value={isLumusAssistantVisible}
																onValueChange={value => handleRouteVisibilityChange('lumusAssistant', value)}
																isDisabled={isLoadingRouteVisibility}
																trackColor={switchTrackColor}
																thumbColor={switchThumbColor}
																ios_backgroundColor={switchIosBackgroundColor}
															/>
														</HStack>
													</View>
												</VStack>
											</Box>
										</AccordionContent>
									</AccordionItem>
								</Accordion>
							</Box>
						) : null}

						{filteredCategories.length === 0 && !isLumusAssistantSearchMatch ? (
							<Box className={`${notTintedCardClassName} px-4 py-6`}>
								<VStack className="items-center gap-1">
									<Text className={`${bodyText} text-center text-sm font-semibold`}>Nenhuma tela encontrada</Text>
									<Text className={`${helperText} text-center text-xs`}>
										Tente buscar por outro nome ou parte do nome da tela.
									</Text>
								</VStack>
							</Box>
						) : null}
					</VStack>
				</ScrollView>

				<Actionsheet
					isOpen={Boolean(returnDestinationSelection)}
					onClose={handleCloseReturnDestinationSheet}
					snapPoints={returnDestinationSheetSnapPoints}
				>
					<ActionsheetBackdrop />
					<ActionsheetContent className={isDarkMode ? 'bg-slate-950' : 'bg-white'}>
						<ActionsheetDragIndicatorWrapper>
							<ActionsheetDragIndicator />
						</ActionsheetDragIndicatorWrapper>

						<KeyboardAvoidingView
							behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
							keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
							style={{ width: '100%', flex: 1 }}
						>
							<VStack className="w-full gap-1 px-4 pb-3 pt-6">
								<Heading size="lg" className={isDarkMode ? 'text-slate-100' : 'text-slate-900'}>
									Escolha a tela de retorno
								</Heading>
								<Text className={`${helperText} text-sm`}>
									Após salvar, o formulário abrirá a tela selecionada.
								</Text>
							</VStack>

							<VStack className="w-full px-2 pb-3">
								<Text className={`${bodyText} mb-1 ml-1 text-sm`}>Buscar tela</Text>
								<Input className={fieldContainerClassName}>
									<InputField
										value={returnDestinationSearch}
										onChangeText={setReturnDestinationSearch}
										placeholder="Digite o nome da tela"
										autoCapitalize="none"
										autoCorrect={false}
										returnKeyType="search"
										accessibilityLabel="Buscar tela de retorno"
										className={inputField}
									/>
								</Input>
							</VStack>

							<ActionsheetScrollView
								className="w-full flex-1"
								keyboardShouldPersistTaps="handled"
								keyboardDismissMode="on-drag"
								contentContainerStyle={{ paddingBottom: Math.max(96, insets.bottom + 72) }}
							>
								<VStack className="w-full px-2 pb-2">
									{filteredReturnDestinationOptions.length === 0 ? (
										<VStack className="items-center px-4 py-8">
											<Text className={`${bodyText} text-center text-sm`}>
												Nenhuma tela encontrada para &quot;{returnDestinationSearch.trim()}&quot;.
											</Text>
											<Text className={`${helperText} mt-1 text-center text-xs`}>
												Tente buscar por outro nome ou parte do nome.
											</Text>
										</VStack>
									) : null}

									{filteredReturnDestinationOptions.map(destinationOption => {
										const isSelected = destinationOption.key === selectedReturnDestination;
										const DestinationIllustration = returnDestinationIllustrationByKey[destinationOption.key];

										return (
											<ActionsheetItem
												key={destinationOption.key}
												onPress={() => handleSelectReturnDestination(destinationOption.key)}
												className={isSelected ? (isDarkMode ? 'rounded-2xl bg-slate-900' : 'rounded-2xl bg-amber-50') : 'rounded-2xl'}
											>
												<HStack className="w-full items-center gap-3">
													<View className="h-11 w-11 items-center justify-center rounded-2xl">
														<DestinationIllustration width={44} height={44} className="opacity-90" />
													</View>
													<VStack className="min-w-0 flex-1 items-start gap-1">
														<ActionsheetItemText className={isDarkMode ? 'mx-0 text-slate-100' : 'mx-0 text-slate-900'}>
															{destinationOption.label}
														</ActionsheetItemText>
														<Text className={`${helperText} text-xs leading-4`}>
															{destinationOption.description}
														</Text>
														{isSelected ? (
															<Text className="text-xs text-amber-500 dark:text-amber-300">Selecionada atualmente</Text>
														) : null}
													</VStack>
												</HStack>
											</ActionsheetItem>
										);
									})}
								</VStack>
							</ActionsheetScrollView>
						</KeyboardAvoidingView>
					</ActionsheetContent>
				</Actionsheet>

				<View style={{ marginHorizontal: -18, paddingBottom: 0, flexShrink: 0 }}>
					<Navigator defaultValue={2} onHardwareBack={handleBackToConfigurations} />
				</View>
			</View>
		</SafeAreaView>
	);
}
