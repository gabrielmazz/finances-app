import React from 'react';
import {
	Keyboard,
	KeyboardAvoidingView,
	Platform,
	Pressable,
	ScrollView,
	StatusBar,
	TextInput,
	View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';

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
import { Button, ButtonSpinner, ButtonText } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { Image } from '@/components/ui/image';
import { Input, InputField } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { HStack } from '@/components/ui/hstack';
import { VStack } from '@/components/ui/vstack';
import CategoryAvailabilitySelector from '@/components/uiverse/category-availability-selector';
import Navigator from '@/components/uiverse/navigator';
import WebScreenHero from '@/components/uiverse/web-screen-hero';
import { showNotifierAlert } from '@/components/uiverse/notifier-alert';

import LoginWallpaper from '@/assets/Background/wallpaper01.png';
import AddRegisterTagScreenIllustration from '../assets/UnDraw/addRegisterTagScreen.svg';
import { auth } from '@/FirebaseConfig';
import { addTagFirebase, getTagDataFirebase, updateTagFirebase } from '@/functions/TagFirebase';
import { useKeyboardAwareScroll } from '@/hooks/useKeyboardAwareScroll';
import { useScreenStyles } from '@/hooks/useScreenStyle';
import { TagIcon, useTagIcons } from '@/hooks/useTagIcons';
import { usePostSubmitBehavior } from '@/hooks/usePostSubmitBehavior';
import { ScreenDismissKeyboard } from '@/components/uiverse/screen-dismiss-keyboard';
import {
	getCategoryAvailabilityFields,
	getCategoryAvailabilityPreset,
	getCategoryAvailabilityPresetOption,
	getCategoryAvailabilitySummary,
	isCategoryAvailabilityPreset,
	isCategoryPlacement,
	type CategoryAvailabilityFields,
	type CategoryAvailabilityPreset,
	type CategoryPlacement,
} from '@/utils/categoryAvailability';
import {
	APP_ROUTE_PATHS,
	type AppRoutePath,
	isAppRoutePath,
	navigateToHomeDashboard,
	redirectBackOrRoute,
} from '@/utils/navigation';
import { setPendingCreatedTag } from '@/utils/pendingCreatedTag';
import { normalizeTagUsageType } from '@/utils/tagUsage';

type FocusableInputKey = 'tag-name';

const normalizeSearchText = (value: string | null | undefined) =>
	String(value ?? '')
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.trim();

const getFirstParam = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

const decodeParam = (value: string | string[] | undefined) => {
	const firstValue = getFirstParam(value);
	if (!firstValue) {
		return null;
	}

	try {
		return decodeURIComponent(firstValue);
	} catch {
		return firstValue;
	}
};

const getBooleanParam = (value: string | string[] | undefined) => {
	const normalized = getFirstParam(value);
	return normalized === '1' || normalized === 'true';
};

export default function AddRegisterTagScreen() {
	const {
		isDarkMode,
		surfaceBackground,
		cardBackground,
		bodyText,
		helperText,
		inputField,
		fieldContainerClassName,
		fieldContainerCardClassName,
		submitButtonClassName,
		submitButtonTextClassName,
		heroHeight,
		insets,
	} = useScreenStyles();
	const { iconOptions, defaultTagIcon, resolveTagIcon, serializeTagIcon } = useTagIcons();
	const applyPostSubmitBehavior = usePostSubmitBehavior('addRegisterTag');
	const params = useLocalSearchParams<{
		tagId?: string | string[];
		placement?: string | string[];
		availabilityPreset?: string | string[];
		usageType?: string | string[];
		isMandatoryExpense?: string | string[];
		isMandatoryGain?: string | string[];
		showInBothLists?: string | string[];
		returnAfterCreate?: string | string[];
		returnToRoute?: string | string[];
	}>();

	const editingTagId = React.useMemo(() => {
		const value = getFirstParam(params.tagId);
		return value?.trim() ? value : null;
	}, [params.tagId]);
	const isEditing = Boolean(editingTagId);
	const routeCreationPreset = React.useMemo<CategoryAvailabilityPreset | null>(() => {
		const explicitPreset = decodeParam(params.availabilityPreset);
		if (isCategoryAvailabilityPreset(explicitPreset)) {
			return explicitPreset;
		}

		const explicitPlacement = decodeParam(params.placement);
		if (isCategoryPlacement(explicitPlacement)) {
			return explicitPlacement;
		}

		const legacyPreset = getCategoryAvailabilityPreset({
			usageType: normalizeTagUsageType(decodeParam(params.usageType)),
			isMandatoryExpense: getBooleanParam(params.isMandatoryExpense),
			isMandatoryGain: getBooleanParam(params.isMandatoryGain),
			showInBothLists: getBooleanParam(params.showInBothLists),
		});

		return legacyPreset;
	}, [params.availabilityPreset, params.isMandatoryExpense, params.isMandatoryGain, params.placement, params.showInBothLists, params.usageType]);
	const shouldReturnAfterCreate = getBooleanParam(params.returnAfterCreate);
	const returnToRoute = React.useMemo<AppRoutePath | null>(() => {
		const value = getFirstParam(params.returnToRoute);
		return isAppRoutePath(value) ? value : null;
	}, [params.returnToRoute]);

	const [tagName, setTagName] = React.useState('');
	const [selectedTagIcon, setSelectedTagIcon] = React.useState(defaultTagIcon);
	const [selectedCreationPreset, setSelectedCreationPreset] =
		React.useState<CategoryAvailabilityPreset | null>(null);
	const [selectedAvailabilityPreset, setSelectedAvailabilityPreset] =
		React.useState<CategoryAvailabilityPreset | null>(null);
	const [savedAvailability, setSavedAvailability] = React.useState<CategoryAvailabilityFields | null>(null);
	const [isLoadingExisting, setIsLoadingExisting] = React.useState(Boolean(editingTagId));
	const [isExistingTagAvailable, setIsExistingTagAvailable] = React.useState(!editingTagId);
	const [isSubmitting, setIsSubmitting] = React.useState(false);
	const [isPlacementSelectorOpen, setIsPlacementSelectorOpen] = React.useState(false);
	const [isPresetSelectorOpen, setIsPresetSelectorOpen] = React.useState(false);
	const [isTagIconSheetOpen, setIsTagIconSheetOpen] = React.useState(false);
	const [tagIconSearch, setTagIconSearch] = React.useState('');
	const submitLockRef = React.useRef(false);
	const tagNameInputRef = React.useRef<TextInput | null>(null);
	const tagIconSearchInputRef = React.useRef<TextInput | null>(null);
	const keyboardScrollOffset = React.useCallback((_key: FocusableInputKey) => 140, []);

	React.useEffect(() => {
		if (!isEditing && routeCreationPreset) {
			setSelectedCreationPreset(routeCreationPreset);
		}
	}, [isEditing, routeCreationPreset]);

	React.useEffect(() => {
		if (!editingTagId) {
			setIsLoadingExisting(false);
			setIsExistingTagAvailable(true);
			return;
		}

		let isMounted = true;
		setIsLoadingExisting(true);
		setIsExistingTagAvailable(false);

		void (async () => {
			const result = await getTagDataFirebase(editingTagId);
			if (!isMounted) {
				return;
			}

			if (!result.success) {
				showNotifierAlert({
					title: 'Categoria indisponível',
					description: 'Não foi possível carregar a categoria para edição.',
					type: 'error',
					isDarkMode,
					duration: 4000,
				});
				setIsLoadingExisting(false);
				return;
			}

			const tag = result.data as Record<string, unknown>;
			setTagName(typeof tag.name === 'string' ? tag.name : '');
			setSelectedTagIcon(
				resolveTagIcon({
					iconFamily: typeof tag.iconFamily === 'string' ? tag.iconFamily as any : null,
					iconName: typeof tag.iconName === 'string' ? tag.iconName : null,
					iconStyle: typeof tag.iconStyle === 'string' ? tag.iconStyle as any : null,
				}),
			);

			const usageType = normalizeTagUsageType(tag.usageType);
			setSavedAvailability(
				usageType
					? {
						usageType,
						isMandatoryExpense: Boolean(tag.isMandatoryExpense),
						isMandatoryGain: Boolean(tag.isMandatoryGain),
						showInBothLists: Boolean(tag.showInBothLists),
					}
					: null,
			);
			setSelectedAvailabilityPreset(null);
			setIsExistingTagAvailable(true);
			setIsLoadingExisting(false);
		})();

		return () => {
			isMounted = false;
		};
	}, [editingTagId, isDarkMode, resolveTagIcon]);

	const activeCreationPreset = routeCreationPreset ?? selectedCreationPreset;
	const creationFields = activeCreationPreset
		? getCategoryAvailabilityFields(activeCreationPreset)
		: null;
	const selectedEditFields = selectedAvailabilityPreset
		? getCategoryAvailabilityFields(selectedAvailabilityPreset)
		: null;
	const currentAvailabilitySummary = selectedAvailabilityPreset
		? getCategoryAvailabilityPresetOption(selectedAvailabilityPreset).label
		: getCategoryAvailabilitySummary(savedAvailability ?? {});
	const isLegacyCustomAvailability =
		isEditing &&
		selectedAvailabilityPreset === null &&
		getCategoryAvailabilityPreset(savedAvailability ?? {}) === null;
	const availabilityPreviewText = isLegacyCustomAvailability
		? 'Esta categoria mantém um uso personalizado existente.'
		: `Esta categoria aparecerá em ${currentAvailabilitySummary.toLocaleLowerCase('pt-BR')}.`;
	const currentCreationPresetOption = activeCreationPreset
		? getCategoryAvailabilityPresetOption(activeCreationPreset)
		: null;
	const isIconSelectionEnabled = tagName.trim().length > 0;
	const selectedTagIconColor = isDarkMode ? '#FCD34D' : '#D97706';
	const filteredIconOptions = React.useMemo(() => {
		const query = normalizeSearchText(tagIconSearch);
		if (!query) {
			return iconOptions;
		}

		const terms = query.split(/\s+/).filter(Boolean);
		return iconOptions.filter(iconOption => {
			const searchable = normalizeSearchText(
				[iconOption.label, iconOption.iconName, iconOption.iconFamily, iconOption.iconStyle]
					.filter(Boolean)
					.join(' '),
			);
			return terms.every(term => searchable.includes(term));
		});
	}, [iconOptions, tagIconSearch]);

	const getInputRef = React.useCallback((key: FocusableInputKey) => {
		return key === 'tag-name' ? tagNameInputRef : null;
	}, []);
	const { scrollViewRef, contentBottomPadding, handleInputFocus, handleScroll, scrollEventThrottle } =
		useKeyboardAwareScroll<FocusableInputKey>({ getInputRef, keyboardScrollOffset });

	const closeIconSheet = React.useCallback(() => {
		setTagIconSearch('');
		setIsTagIconSheetOpen(false);
	}, []);
	const selectIcon = React.useCallback((icon: (typeof iconOptions)[number]) => {
		setSelectedTagIcon(icon);
		closeIconSheet();
	}, [closeIconSheet]);
	const navigateBackToInlineSource = React.useCallback(() => {
		redirectBackOrRoute(returnToRoute ?? APP_ROUTE_PATHS.home);
	}, [returnToRoute]);
	const handleBackNavigation = React.useCallback(() => {
		if (shouldReturnAfterCreate) {
			navigateBackToInlineSource();
			return true;
		}

		navigateToHomeDashboard();
		return true;
	}, [navigateBackToInlineSource, shouldReturnAfterCreate]);

	const selectCreationPreset = React.useCallback((value: CategoryPlacement | CategoryAvailabilityPreset) => {
		if (!isCategoryAvailabilityPreset(value)) {
			return;
		}

		setSelectedCreationPreset(value);
		setIsPlacementSelectorOpen(false);
	}, []);
	const selectAvailabilityPreset = React.useCallback((value: CategoryPlacement | CategoryAvailabilityPreset) => {
		if (!isCategoryAvailabilityPreset(value)) {
			return;
		}

		setSelectedAvailabilityPreset(value);
		setIsPresetSelectorOpen(false);
	}, []);

	const saveCategory = React.useCallback(async () => {
		if (submitLockRef.current || isSubmitting || isLoadingExisting || (isEditing && !isExistingTagAvailable)) {
			return;
		}

		const trimmedName = tagName.trim();
		if (!trimmedName) {
			showNotifierAlert({
				title: 'Informe um nome',
				description: 'Digite o nome da categoria antes de salvar.',
				type: 'error',
				isDarkMode,
				duration: 4000,
			});
			return;
		}

		if (!isEditing && !creationFields) {
			setIsPlacementSelectorOpen(true);
			return;
		}

		submitLockRef.current = true;
		setIsSubmitting(true);
		const iconPayload = serializeTagIcon(selectedTagIcon);

		try {
			if (isEditing && editingTagId) {
				const result = await updateTagFirebase({
					tagId: editingTagId,
					tagName: trimmedName,
					...(selectedEditFields ?? {}),
					...iconPayload,
				});

				if (!result.success) {
					showNotifierAlert({
						title: 'Não foi possível atualizar',
						description: 'Tente novamente em alguns instantes.',
						type: 'error',
						isDarkMode,
						duration: 4000,
					});
					return;
				}

				showNotifierAlert({
					title: 'Categoria atualizada',
					description: `A categoria “${trimmedName}” foi atualizada.`,
					type: 'success',
					isDarkMode,
					duration: 4000,
				});
				applyPostSubmitBehavior({ isEditing: true });
				return;
			}

			const personId = auth.currentUser?.uid;
			if (!personId || !creationFields) {
				showNotifierAlert({
					title: 'Não foi possível salvar',
					description: 'Não foi possível identificar o usuário ou o contexto da categoria.',
					type: 'error',
					isDarkMode,
					duration: 4000,
				});
				return;
			}

			const result = await addTagFirebase({
				tagName: trimmedName,
				personId,
				...creationFields,
				...iconPayload,
			});

			if (!result.success || !result.tagId) {
				showNotifierAlert({
					title: 'Não foi possível salvar',
					description: 'Tente novamente em alguns instantes.',
					type: 'error',
					isDarkMode,
					duration: 4000,
				});
				return;
			}

			showNotifierAlert({
				title: 'Categoria criada',
				description: `A categoria “${trimmedName}” já está pronta para uso.`,
				type: 'success',
				isDarkMode,
				duration: 4000,
			});

			if (shouldReturnAfterCreate) {
				setPendingCreatedTag({
					tagId: result.tagId,
					tagName: trimmedName,
					usageType: creationFields.usageType,
					...iconPayload,
				});
				navigateBackToInlineSource();
				return;
			}

			applyPostSubmitBehavior({
				resetForm: () => {
					setTagName('');
					setSelectedTagIcon(defaultTagIcon);
				},
			});
		} catch (error) {
			console.error('Erro ao salvar categoria:', error);
			showNotifierAlert({
				title: 'Erro inesperado',
				description: 'Tente novamente.',
				type: 'error',
				isDarkMode,
				duration: 4000,
			});
		} finally {
			submitLockRef.current = false;
			setIsSubmitting(false);
		}
	}, [
		applyPostSubmitBehavior,
		creationFields,
		defaultTagIcon,
		editingTagId,
		isDarkMode,
		isEditing,
		isExistingTagAvailable,
		isLoadingExisting,
		isSubmitting,
		navigateBackToInlineSource,
		selectedEditFields,
		selectedTagIcon,
		serializeTagIcon,
		shouldReturnAfterCreate,
		tagName,
	]);

	const screenTitle = isEditing
		? 'Editar categoria'
		: currentCreationPresetOption
			? `Nova categoria para ${currentCreationPresetOption.label.toLocaleLowerCase('pt-BR')}`
			: 'Nova categoria';
	const visibleAvailability = isEditing
		? currentAvailabilitySummary
		: currentCreationPresetOption?.label ?? 'Escolha onde a categoria aparecerá';
	const canSave =
		Boolean(tagName.trim()) &&
		!isSubmitting &&
		!isLoadingExisting &&
		(!isEditing || isExistingTagAvailable) &&
		(isEditing || Boolean(creationFields));

	return (
		<ScreenDismissKeyboard>
			<SafeAreaView className="flex-1 web:w-screen" edges={['left', 'right', 'bottom']} style={{ backgroundColor: surfaceBackground }}>
				<StatusBar
					translucent
					backgroundColor="transparent"
					barStyle={isDarkMode ? 'light-content' : 'dark-content'}
				/>

				<View className="flex-1 web:w-screen" style={{ backgroundColor: surfaceBackground }}>
					<KeyboardAvoidingView
						behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
						keyboardVerticalOffset={Platform.OS === 'ios' ? 120 : 0}
						className="flex-1"
					>
						<View className="flex-1 web:w-screen">
							<View className={`absolute left-0 right-0 top-0 web:w-screen ${cardBackground}`} style={{ height: heroHeight }}>
								<Image
									source={LoginWallpaper}
									alt="Cabeçalho da categoria"
									className="absolute h-full w-full rounded-b-3xl"
									resizeMode="cover"
								/>
								<WebScreenHero
					title={screenTitle}
					Illustration={AddRegisterTagScreenIllustration}
					isDarkMode={isDarkMode}
					topPadding={insets.top + 24}
				/>
							</View>

							<ScrollView
								ref={scrollViewRef}
								className={`flex-1 rounded-t-3xl ${cardBackground} px-6 pb-1 web:w-full web:px-8 web:relative web:z-[3]`}
								style={{ marginTop: heroHeight - 64 }}
								contentContainerStyle={{ paddingBottom: Math.max(32, contentBottomPadding - 108) }}
								keyboardShouldPersistTaps="handled"
								keyboardDismissMode="on-drag"
								onScroll={handleScroll}
								scrollEventThrottle={scrollEventThrottle}
							>
								<VStack className="mt-4 gap-4 web:w-full web:max-w-[1180px] web:self-center web:rounded-[28px] web:p-8">
									{isLoadingExisting ? (
										<VStack className={`${fieldContainerCardClassName} px-4 py-5`}>
											<Text className={`${helperText} text-sm`}>Carregando a categoria…</Text>
										</VStack>
									) : null}

									{!isEditing && !activeCreationPreset ? (
										<Pressable
											onPress={() => setIsPlacementSelectorOpen(true)}
											accessibilityRole="button"
											accessibilityLabel="Escolher onde usar a nova categoria"
											className={`${fieldContainerCardClassName} px-4 py-5`}
										>
											<VStack className="gap-1">
												<Text className={`${bodyText} text-base font-semibold`}>Escolha onde a categoria aparecerá</Text>
												<Text className={`${helperText} text-sm leading-5`}>
													Você pode usar somente em um contexto ou compartilhar entre despesas e ganhos.
												</Text>
												<Text className="mt-2 text-sm font-semibold text-amber-500">Escolher disponibilidade</Text>
											</VStack>
										</Pressable>
									) : (
										<>
											<Pressable
												onPress={isEditing ? () => setIsPresetSelectorOpen(true) : undefined}
												disabled={!isEditing}
												accessibilityRole={isEditing ? 'button' : undefined}
												accessibilityLabel={isEditing ? 'Alterar disponibilidade da categoria' : undefined}
												className={`${fieldContainerCardClassName} px-4 py-4 ${isEditing ? '' : 'opacity-95'}`}
											>
												<HStack className="items-center gap-3">
													<View className={`h-12 w-12 items-center justify-center rounded-2xl ${isDarkMode ? 'bg-slate-900' : 'bg-slate-100'}`}>
														<TagIcon
															iconFamily={selectedTagIcon.iconFamily}
															iconName={selectedTagIcon.iconName}
															iconStyle={selectedTagIcon.iconStyle}
															size={23}
															color={selectedTagIconColor}
														/>
													</View>
													<VStack className="min-w-0 flex-1 gap-1">
														<Text className={`${bodyText} text-sm font-semibold`} numberOfLines={1}>
															{tagName.trim() || 'Sua nova categoria'}
														</Text>
												<Text className={`${helperText} text-xs`} numberOfLines={2}>
													{isEditing ? availabilityPreviewText : `Esta categoria aparecerá em ${visibleAvailability.toLocaleLowerCase('pt-BR')}.`}
												</Text>
													</VStack>
													{isEditing ? <Text className="text-sm font-semibold text-amber-500">Alterar</Text> : null}
												</HStack>
											</Pressable>

											<VStack className="gap-1">
												<Text className={`${bodyText} ml-1 text-sm`}>Nome da categoria</Text>
												<Input className={fieldContainerClassName}>
													<InputField
														ref={tagNameInputRef as any}
														value={tagName}
														onChangeText={setTagName}
														placeholder="Ex.: mercado, aluguel, salário..."
														className={inputField}
														autoCapitalize="sentences"
														onFocus={() => handleInputFocus('tag-name')}
														accessibilityLabel="Nome da categoria"
													/>
												</Input>
											</VStack>

											<VStack className="gap-1">
												<Text className={`${bodyText} ml-1 text-sm`}>Ícone da categoria</Text>
												<Pressable
													onPress={() => isIconSelectionEnabled && setIsTagIconSheetOpen(true)}
													disabled={!isIconSelectionEnabled}
													accessibilityRole="button"
													accessibilityLabel="Escolher ícone da categoria"
													className={`${fieldContainerCardClassName} px-4 py-3 ${!isIconSelectionEnabled ? 'opacity-50' : ''}`}
												>
													<HStack className="items-center justify-between gap-3">
														<HStack className="min-w-0 flex-1 items-center gap-3">
															<View className={`h-11 w-11 items-center justify-center rounded-2xl ${isDarkMode ? 'bg-slate-900' : 'bg-slate-100'}`}>
																<TagIcon
																	iconFamily={selectedTagIcon.iconFamily}
																	iconName={selectedTagIcon.iconName}
																	iconStyle={selectedTagIcon.iconStyle}
																	size={21}
																	color={selectedTagIconColor}
																/>
															</View>
															<VStack className="min-w-0 flex-1 gap-1">
																<Text className={`${bodyText} text-sm font-medium`} numberOfLines={1}>{selectedTagIcon.label}</Text>
																<Text className={`${helperText} text-xs`} numberOfLines={1}>
																	{isIconSelectionEnabled ? 'Opcional — toque para alterar.' : 'Digite o nome para escolher um ícone.'}
																</Text>
															</VStack>
														</HStack>
														<Text className={`${helperText} text-xs`}>{isIconSelectionEnabled ? 'Alterar' : 'Bloqueado'}</Text>
													</HStack>
												</Pressable>
											</VStack>

											<Button className={`${submitButtonClassName} web:mt-2 web:h-12`} onPress={saveCategory} isDisabled={!canSave}>
												{isSubmitting ? <ButtonSpinner /> : <ButtonText className={submitButtonTextClassName}>{isEditing ? 'Salvar alterações' : 'Salvar categoria'}</ButtonText>}
											</Button>
										</>
									)}
								</VStack>
							</ScrollView>
						</View>
					</KeyboardAvoidingView>

					<CategoryAvailabilitySelector
						mode="preset"
						isOpen={isPlacementSelectorOpen}
						onClose={() => setIsPlacementSelectorOpen(false)}
						onSelect={selectCreationPreset}
						selectedValue={activeCreationPreset}
						isDarkMode={isDarkMode}
					/>
					<CategoryAvailabilitySelector
						mode="preset"
						isOpen={isPresetSelectorOpen}
						onClose={() => setIsPresetSelectorOpen(false)}
						onSelect={selectAvailabilityPreset}
						selectedValue={selectedAvailabilityPreset ?? getCategoryAvailabilityPreset(savedAvailability ?? {})}
						isDarkMode={isDarkMode}
					/>

					<Actionsheet
						isOpen={isTagIconSheetOpen && isIconSelectionEnabled}
						onClose={closeIconSheet}
						initialFocusRef={tagIconSearchInputRef as React.RefObject<any>}
						snapPoints={[86]}
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
								<VStack className="w-full px-4 pb-3 pt-6 gap-3">
									<Heading size="lg" className={isDarkMode ? 'text-slate-100' : 'text-slate-900'}>
										Escolha um ícone
									</Heading>
									<Input className={fieldContainerClassName}>
										<InputField
											ref={tagIconSearchInputRef as any}
											value={tagIconSearch}
											onChangeText={setTagIconSearch}
											placeholder="Buscar ícone"
											className={inputField}
											autoCapitalize="none"
											autoCorrect={false}
											returnKeyType="search"
											accessibilityLabel="Buscar ícone"
										/>
									</Input>
								</VStack>
								<ActionsheetScrollView className="w-full flex-1" keyboardShouldPersistTaps="handled">
									<VStack className="px-2 pb-24">
										{filteredIconOptions.length === 0 ? (
											<Text className={`${helperText} px-4 py-8 text-center text-sm`}>Nenhum ícone encontrado.</Text>
										) : null}
										{filteredIconOptions.map(iconOption => {
											const isSelected = iconOption.key === selectedTagIcon.key;
											return (
												<ActionsheetItem
													key={iconOption.key}
													onPress={() => selectIcon(iconOption)}
													className={isSelected ? (isDarkMode ? 'rounded-2xl bg-slate-900' : 'rounded-2xl bg-amber-50') : ''}
												>
													<HStack className="w-full items-center gap-3">
														<View className={`h-11 w-11 items-center justify-center rounded-2xl ${isDarkMode ? 'bg-slate-900' : 'bg-slate-100'}`}>
															<TagIcon iconFamily={iconOption.iconFamily} iconName={iconOption.iconName} iconStyle={iconOption.iconStyle} size={20} color={selectedTagIconColor} />
														</View>
														<VStack className="flex-1">
															<ActionsheetItemText className={isDarkMode ? 'text-slate-100' : 'text-slate-900'}>{iconOption.label}</ActionsheetItemText>
															{isSelected ? <Text className="text-xs text-amber-500">Selecionado</Text> : null}
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
						<Navigator defaultValue={2} onHardwareBack={handleBackNavigation} />
					</View>
				</View>
			</SafeAreaView>
		</ScreenDismissKeyboard>
	);
}
