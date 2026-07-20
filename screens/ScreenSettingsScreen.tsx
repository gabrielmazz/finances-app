import React from 'react';
import { ScrollView, StatusBar, View } from 'react-native';
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
	Select,
	SelectBackdrop,
	SelectContent,
	SelectDragIndicator,
	SelectDragIndicatorWrapper,
	SelectIcon,
	SelectInput,
	SelectItem,
	SelectPortal,
	SelectTrigger,
} from '@/components/ui/select';
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
import { useScreenStyles } from '@/hooks/useScreenStyle';
import { navigateToHomeConfigurations } from '@/utils/navigation';
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
				description: 'Escolha apenas se deve retornar à Home depois de atualizar uma despesa.',
				Illustration: AddRegisterExpensesScreenIllustration,
			},
			{
				key: 'addRegisterGain',
				mode: 'edit',
				label: 'Editar ganho',
				description: 'Escolha apenas se deve retornar à Home depois de atualizar uma receita.',
				Illustration: AddRegisterGainScreenIllustration,
			},
			{
				key: 'addMandatoryExpenses',
				mode: 'edit',
				label: 'Editar gasto obrigatório',
				description: 'Escolha apenas se deve retornar à Home depois de atualizar uma despesa fixa.',
				Illustration: AddMandatoryExpensesScreenIllustration,
			},
			{
				key: 'addMandatoryGains',
				mode: 'edit',
				label: 'Editar ganho obrigatório',
				description: 'Escolha apenas se deve retornar à Home depois de atualizar uma receita fixa.',
				Illustration: AddMandatoryGainsScreenIllustration,
			},
			{
				key: 'registerMonthlyBalance',
				mode: 'edit',
				label: 'Editar saldo mensal',
				description: 'Escolha apenas se deve retornar à Home depois de atualizar o saldo do mês.',
				Illustration: AddRegisterMonthlyBalanceScreenIllustration,
			},
			{
				key: 'addRegisterBank',
				mode: 'edit',
				label: 'Editar banco',
				description: 'Escolha apenas se deve retornar à Home depois de atualizar um banco.',
				Illustration: AddRegisterBankScreenIllustration,
			},
			{
				key: 'addRegisterTag',
				mode: 'edit',
				label: 'Editar categoria',
				description: 'Escolha apenas se deve retornar à Home depois de atualizar uma categoria.',
				Illustration: AddRegisterTagScreenIllustration,
			},
		],
	},
];

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
	const [screenSearch, setScreenSearch] = React.useState('');

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

	const handleReturnToggle = React.useCallback(
		(screenKey: PostSubmitScreenKey, mode: PostSubmitBehaviorMode, value: boolean) => {
			updateBehaviorForScreen(screenKey, mode, current => ({
				...current,
				shouldReturnAfterSubmit: value,
				returnDestination: mode === 'edit' ? 'homeDashboard' : current.returnDestination,
				shouldClearFieldsAfterSubmit: mode === 'create' ? !value : false,
			}));
		},
		[updateBehaviorForScreen],
	);

	const handleDestinationChange = React.useCallback(
		(screenKey: PostSubmitScreenKey, destination: string) => {
			updateBehaviorForScreen(screenKey, 'create', {
				returnDestination: destination as PostSubmitDestinationKey,
			});
		},
		[updateBehaviorForScreen],
	);

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
																		<AccordionTitleText className="font-semibold leading-5">
																			{item.label}
																		</AccordionTitleText>
																		<Text className={`${helperText} text-xs`} numberOfLines={1}>
																			{isEditing
																				? behavior.shouldReturnAfterSubmit
																					? 'Volta para a Home após atualizar'
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
																			<Text className={`${bodyText} text-sm font-semibold`}>Voltar após salvar</Text>
																			{isEditing ? (
																					<Text className={`${helperText} text-xs`}>
																						Quando ativado, a edição retorna para a Home.
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

																{!isEditing ? (
																	<VStack className="gap-4">
																		<VStack className="gap-2">
																			<Text className={`${bodyText} text-sm font-semibold`}>Tela de retorno</Text>
																			<Select
																				selectedValue={behavior.returnDestination}
																				onValueChange={value => handleDestinationChange(item.key, value)}
																				isDisabled={!behavior.shouldReturnAfterSubmit || isLoadingPostSubmitBehavior}
																			>
																				<SelectTrigger
																					variant="outline"
																					size="md"
																					className={`${fieldContainerClassName} ${!behavior.shouldReturnAfterSubmit ? 'opacity-50' : ''}`}
																				>
																					<SelectInput
																						placeholder="Selecione a tela de retorno"
																						className={inputField}
																						value={selectedDestinationLabel}
																					/>
																					<SelectIcon />
																				</SelectTrigger>
																				<SelectPortal>
																					<SelectBackdrop />
																					<SelectContent>
																						<SelectDragIndicatorWrapper>
																							<SelectDragIndicator />
																						</SelectDragIndicatorWrapper>
																						{POST_SUBMIT_DESTINATION_OPTIONS.map(destinationOption => (
																							<SelectItem
																								key={destinationOption.key}
																								label={destinationOption.label}
																								value={destinationOption.key}
																							/>
																						))}
																					</SelectContent>
																				</SelectPortal>
																			</Select>
																		</VStack>

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
																	</VStack>
																) : null}
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

						{filteredCategories.length === 0 ? (
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

				<View style={{ marginHorizontal: -18, paddingBottom: 0, flexShrink: 0 }}>
					<Navigator defaultValue={2} onHardwareBack={handleBackToConfigurations} />
				</View>
			</View>
		</SafeAreaView>
	);
}
