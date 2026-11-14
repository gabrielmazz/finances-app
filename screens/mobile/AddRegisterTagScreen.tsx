import { errorMessage } from '@/application/errors';
import { useCategoryMutations } from '@/hooks/useCategoryMutations';
import { usePostSubmitBehavior } from '@/hooks/usePostSubmitBehavior';
import { showNotifierAlert } from '@/components/uiverse/feedback/notifier-alert';
import type { CategorySource } from '@/domain/categories';
import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import {
KeyboardAvoidingView,
Platform,
Pressable,
ScrollView,
StatusBar,
TextInput,
View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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
import { Button,ButtonSpinner,ButtonText } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { HStack } from '@/components/ui/hstack';
import { Image } from '@/components/ui/image';
import { Input,InputField } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import CategoryAvailabilitySelector from '@/components/uiverse/categories/category-availability-selector';
import Navigator from '@/components/uiverse/navigation/navigator';
import WebScreenHero from '@/components/uiverse/navigation/web-screen-hero';

import LoginWallpaper from '@/assets/Background/wallpaper01.png';
import AddRegisterTagScreenIllustration from '../../assets/UnDraw/addRegisterTagScreen.svg';

import { ScreenDismissKeyboard } from '@/components/uiverse/shared/screen-dismiss-keyboard';
import { LUMUS_FORM_CLASS_NAMES } from '@/design-system/tokens';
import { useCategoryFormRecord } from '@/hooks/useCategoryFormRecord';
import { useKeyboardAwareScroll } from '@/hooks/useKeyboardAwareScroll';
import { useScreenStyles } from '@/hooks/useScreenStyle';
import { TagIcon,useTagIcons } from '@/hooks/useTagIcons';
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
isAppRoutePath,
navigateToHomeDashboard,
redirectBackOrRoute,
type AppRoutePath,
} from '@/utils/navigation';
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
		webDashboardClassNames,
	} = useScreenStyles();
	const { iconOptions, defaultTagIcon, resolveTagIcon, serializeTagIcon } = useTagIcons();
	const { scope, create, update } = useCategoryMutations();
	const applyPostSubmitBehavior = usePostSubmitBehavior('addRegisterTag');
	const submissionLock = React.useRef(false);
	const params = useLocalSearchParams<{
		tagId?: string | string[];
		tagSource?: string | string[];
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
	const [iconChanged, setIconChanged] = React.useState(false);
	const [selectedCreationPreset, setSelectedCreationPreset] =
		React.useState<CategoryAvailabilityPreset | null>(null);
	const [selectedAvailabilityPreset, setSelectedAvailabilityPreset] =
		React.useState<CategoryAvailabilityPreset | null>(null);
	const [savedAvailability, setSavedAvailability] = React.useState<CategoryAvailabilityFields | null>(null);
	const rawSource = getFirstParam(params.tagSource);
	const source: CategorySource = rawSource === 'new' || rawSource === 'group-legacy' || rawSource === 'group-root' ? rawSource : 'legacy';
	const { record: existingTag, isLoading: isLoadingExisting, error: categoryLoadError, reload: reloadCategory } = useCategoryFormRecord(editingTagId, source);
	const isExistingTagAvailable = !editingTagId || Boolean(existingTag && !isLoadingExisting && !categoryLoadError);
	const [isSubmitting, setIsSubmitting] = React.useState(false);
	const [isPlacementSelectorOpen, setIsPlacementSelectorOpen] = React.useState(false);
	const [isPresetSelectorOpen, setIsPresetSelectorOpen] = React.useState(false);
	const [isTagIconSheetOpen, setIsTagIconSheetOpen] = React.useState(false);
	const [tagIconSearch, setTagIconSearch] = React.useState('');
	const intentRef = React.useRef<{ signature: string; id: string } | null>(null);
	const tagNameInputRef = React.useRef<import('react').ComponentRef<typeof TextInput> | null>(null);
	const tagIconSearchInputRef = React.useRef<import('react').ComponentRef<typeof TextInput> | null>(null);
	const keyboardScrollOffset = React.useCallback((_key: FocusableInputKey) => 140, []);

	React.useEffect(() => {
		if (!isEditing && routeCreationPreset) {
			setSelectedCreationPreset(routeCreationPreset);
		}
	}, [isEditing, routeCreationPreset]);

	React.useEffect(() => {
		if (!existingTag) return;
		const tag = existingTag;
		intentRef.current = null;
		setTagName(typeof tag.name === 'string' ? tag.name : '');
		setIconChanged(false);
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
	}, [existingTag, resolveTagIcon]);

	const activeCreationPreset = routeCreationPreset ?? selectedCreationPreset;
	const creationFields = activeCreationPreset
		? getCategoryAvailabilityFields(activeCreationPreset)
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
	const isIconSelectionEnabled = tagName.trim().length > 0 && !isSubmitting && !isLoadingExisting && isExistingTagAvailable;
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
		setIconChanged(true);
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
		if (submissionLock.current || !scope) return;
		const availability = isEditing
			? selectedAvailabilityPreset ? getCategoryAvailabilityFields(selectedAvailabilityPreset) : savedAvailability
			: creationFields;
		if (!isEditing && !availability) return;
		const icon = serializeTagIcon(selectedTagIcon);
		const fields = {
			name: tagName, usageType: availability?.usageType ?? null,
			isMandatoryExpense: availability?.isMandatoryExpense ?? existingTag?.isMandatoryExpense ?? false,
			isMandatoryGain: availability?.isMandatoryGain ?? existingTag?.isMandatoryGain ?? false,
			showInBothLists: availability?.showInBothLists ?? existingTag?.showInBothLists ?? false,
			iconFamily: isEditing && !iconChanged ? existingTag?.iconFamily ?? null : icon.iconFamily ?? null,
			iconName: isEditing && !iconChanged ? existingTag?.iconName ?? null : icon.iconName ?? null,
			iconStyle: isEditing && !iconChanged ? existingTag?.iconStyle ?? null : icon.iconStyle ?? null,
		};
		submissionLock.current = true;
		setIsSubmitting(true);
		try {
			if (isEditing) {
				if (!existingTag) throw Error('categories/not-found');
				await update(existingTag, fields);
				reloadCategory();
			} else {
				if (!fields.usageType) throw Error('categories/invalid-type');
				const pending = await create({ ...fields, usageType: fields.usageType }, intentRef.current);
				intentRef.current = pending.operation;
				await pending.run();
			}
			showNotifierAlert({ type: 'success', description: isEditing ? 'Categoria atualizada.' : 'Categoria cadastrada.' });
			if (shouldReturnAfterCreate) navigateBackToInlineSource();
			else applyPostSubmitBehavior({ isEditing, resetForm: () => { setTagName(''); setSelectedTagIcon(defaultTagIcon); intentRef.current = null; } });
		} catch (error) {
			showNotifierAlert({ type: 'error', description: errorMessage(error) });
		} finally {
			submissionLock.current = false;
			setIsSubmitting(false);
		}
	}, [scope, isEditing, selectedAvailabilityPreset, savedAvailability, creationFields, serializeTagIcon, selectedTagIcon, iconChanged, tagName, existingTag, shouldReturnAfterCreate, navigateBackToInlineSource, applyPostSubmitBehavior, defaultTagIcon, reloadCategory, create, update]);

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
									illustrationWidth="36%"
									illustrationHeight="36%"
								/>
							</View>

							<ScrollView
								ref={scrollViewRef}
								className={`flex-1 rounded-t-3xl ${cardBackground} px-6 pb-1 ${webDashboardClassNames.webSheet}`}
								style={{ marginTop: heroHeight - 64 }}
								contentContainerStyle={{ paddingBottom: Math.max(32, contentBottomPadding - 108) }}
								keyboardShouldPersistTaps="handled"
								keyboardDismissMode="on-drag"
								onScroll={handleScroll}
								scrollEventThrottle={scrollEventThrottle}
							>
								<VStack className={`mt-4 gap-4 ${webDashboardClassNames.webContentFrame} ${webDashboardClassNames.webContentPadding}`}>
									{isLoadingExisting ? (
										<VStack className={`${fieldContainerCardClassName} px-4 py-5`}>
											<Text className={`${helperText} text-sm`}>Carregando a categoria…</Text>
										</VStack>
									) : null}

									{categoryLoadError ? (
										<VStack className={`${fieldContainerCardClassName} gap-3 px-4 py-5`}>
											<Text accessibilityRole="alert" className={`${helperText} text-sm`}>{categoryLoadError}</Text>
											<Button variant="outline" onPress={reloadCategory} accessibilityLabel="Tentar carregar a categoria novamente">
												<ButtonText>Tentar novamente</ButtonText>
											</Button>
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
												disabled={!isEditing || isSubmitting || isLoadingExisting || !isExistingTagAvailable}
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

											<VStack className="gap-2">
												<Text className={`${LUMUS_FORM_CLASS_NAMES.inlineLabel} ml-1`}>Nome da categoria</Text>
												<Input className={fieldContainerClassName}>
													<InputField
														ref={tagNameInputRef as any}
														value={tagName}
														editable={!isSubmitting && !isLoadingExisting && isExistingTagAvailable}
														maxLength={160}
														onChangeText={setTagName}
														placeholder="Ex.: mercado, aluguel, salário..."
														className={inputField}
														autoCapitalize="sentences"
														onFocus={() => handleInputFocus('tag-name')}
														accessibilityLabel="Nome da categoria"
													/>
												</Input>
											</VStack>

											<VStack className="gap-2">
												<Text className={`${LUMUS_FORM_CLASS_NAMES.inlineLabel} ml-1`}>Ícone da categoria</Text>
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
