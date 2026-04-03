import React from 'react';
import {
	Keyboard,
	TouchableWithoutFeedback,
	View,
	StatusBar,
	ScrollView,
	KeyboardAvoidingView,
	Platform,
	TextInput,
	findNodeHandle,
	Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';

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
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { Image } from '@/components/ui/image';
import { Input, InputField } from '@/components/ui/input';
import { Button, ButtonSpinner, ButtonText } from '@/components/ui/button';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import {
	Radio,
	RadioGroup,
	RadioIndicator,
	RadioIcon,
	RadioLabel,
} from '@/components/ui/radio';
import {
	Popover,
	PopoverBackdrop,
	PopoverBody,
	PopoverContent,
} from '@/components/ui/popover';
import { CircleIcon } from '@/components/ui/icon';
import { Info } from 'lucide-react-native';

import FloatingAlertViewport, { showFloatingAlert } from '@/components/uiverse/floating-alert';
import { showNotifierAlert } from '@/components/uiverse/notifier-alert';
import Navigator from '@/components/uiverse/navigator';
import { Switch } from '@/components/ui/switch';

import { addTagFirebase, updateTagFirebase } from '@/functions/TagFirebase';
import { auth } from '@/FirebaseConfig';
import LoginWallpaper from '@/assets/Background/wallpaper01.png';
import { setPendingCreatedTag } from '@/utils/pendingCreatedTag';

import AddRegisterTagScreenIllustration from '../assets/UnDraw/addRegisterTagScreen.svg';

import { useScreenStyles } from '@/hooks/useScreenStyle';
import { TagIcon, useTagIcons } from '@/hooks/useTagIcons';

type FocusableInputKey = 'tag-name';
type UsageTypeRadioValue = 'expense' | 'gain';

const normalizeTagIconSearchText = (value: string | null | undefined) =>
	String(value ?? '')
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.trim();

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
		switchRadioClassName,
		switchRadioIndicatorClassName,
		switchRadioIconClassName,
		switchRadioLabelClassName,
		infoCardStyle,
		switchTrackColor,
		switchThumbColor,
		switchIosBackgroundColor,
	} = useScreenStyles();
	const { iconOptions, defaultTagIcon, resolveTagIcon, serializeTagIcon } = useTagIcons();

	const [tagName, setTagName] = React.useState('');
	const [isSubmitting, setIsSubmitting] = React.useState(false);
	const [isExpenseTag, setIsExpenseTag] = React.useState(false);
	const [isGainTag, setIsGainTag] = React.useState(false);
	const [isMandatoryExpense, setIsMandatoryExpense] = React.useState(false);
	const [isMandatoryGain, setIsMandatoryGain] = React.useState(false);
	const [showInBothLists, setShowInBothLists] = React.useState(false);
	const [selectedTagIcon, setSelectedTagIcon] = React.useState(defaultTagIcon);
	const [isTagIconSheetOpen, setIsTagIconSheetOpen] = React.useState(false);
	const [tagIconSearch, setTagIconSearch] = React.useState('');
	const scrollViewRef = React.useRef<ScrollView | null>(null);
	const tagNameInputRef = React.useRef<TextInput | null>(null);
	const tagIconSearchInputRef = React.useRef<TextInput | null>(null);
	const lastFocusedInputKey = React.useRef<FocusableInputKey | null>(null);
	const [keyboardHeight, setKeyboardHeight] = React.useState(0);
	const keyboardScrollOffset = React.useCallback((_key: FocusableInputKey) => 140, []);

	const params = useLocalSearchParams<{
		tagId?: string | string[];
		tagName?: string | string[];
		usageType?: string | string[];
		isMandatoryExpense?: string | string[];
		isMandatoryGain?: string | string[];
		showInBothLists?: string | string[];
		returnAfterCreate?: string | string[];
		lockUsageType?: string | string[];
		lockMandatorySelection?: string | string[];
		tagIconFamily?: string | string[];
		tagIconName?: string | string[];
		tagIconStyle?: string | string[];
	}>();

	const editingTagId = React.useMemo(() => {
		const value = Array.isArray(params.tagId) ? params.tagId[0] : params.tagId;
		return value && value.trim().length > 0 ? value : null;
	}, [params.tagId]);

	const initialTagName = React.useMemo(() => {
		const value = Array.isArray(params.tagName) ? params.tagName[0] : params.tagName;
		if (!value) {
			return '';
		}

		try {
			return decodeURIComponent(value);
		} catch {
			return value;
		}
	}, [params.tagName]);

	const initialUsageType = React.useMemo(() => {
		const value = Array.isArray(params.usageType) ? params.usageType[0] : params.usageType;
		if (!value) {
			return null;
		}

		try {
			const decoded = decodeURIComponent(value);
			return decoded ?? null;
		} catch {
			return value;
		}
	}, [params.usageType]);

	const initialIsMandatoryExpense = React.useMemo(() => {
		const value = Array.isArray(params.isMandatoryExpense) ? params.isMandatoryExpense[0] : params.isMandatoryExpense;
		if (!value) {
			return false;
		}

		if (value === 'true') {
			return true;
		}

		if (value === 'false') {
			return false;
		}

		return value === '1';
	}, [params.isMandatoryExpense]);

	const initialIsMandatoryGain = React.useMemo(() => {
		const value = Array.isArray(params.isMandatoryGain) ? params.isMandatoryGain[0] : params.isMandatoryGain;
		if (!value) {
			return false;
		}

		if (value === 'true') {
			return true;
		}

		if (value === 'false') {
			return false;
		}

		return value === '1';
	}, [params.isMandatoryGain]);
	const initialShowInBothLists = React.useMemo(() => {
		const value = Array.isArray(params.showInBothLists) ? params.showInBothLists[0] : params.showInBothLists;
		if (!value) {
			return false;
		}

		if (value === 'true') {
			return true;
		}

		if (value === 'false') {
			return false;
		}

		return value === '1';
	}, [params.showInBothLists]);
	const initialTagIconFamily = React.useMemo(() => {
		const value = Array.isArray(params.tagIconFamily) ? params.tagIconFamily[0] : params.tagIconFamily;
		if (!value) {
			return null;
		}

		try {
			return decodeURIComponent(value);
		} catch {
			return value;
		}
	}, [params.tagIconFamily]);

	const initialTagIconName = React.useMemo(() => {
		const value = Array.isArray(params.tagIconName) ? params.tagIconName[0] : params.tagIconName;
		if (!value) {
			return null;
		}

		try {
			return decodeURIComponent(value);
		} catch {
			return value;
		}
	}, [params.tagIconName]);

	const initialTagIconStyle = React.useMemo(() => {
		const value = Array.isArray(params.tagIconStyle) ? params.tagIconStyle[0] : params.tagIconStyle;
		if (!value) {
			return null;
		}

		try {
			return decodeURIComponent(value);
		} catch {
			return value;
		}
	}, [params.tagIconStyle]);
	const shouldReturnAfterCreate = React.useMemo(() => {
		const value = Array.isArray(params.returnAfterCreate)
			? params.returnAfterCreate[0]
			: params.returnAfterCreate;

		return value === '1' || value === 'true';
	}, [params.returnAfterCreate]);
	const shouldLockUsageType = React.useMemo(() => {
		const value = Array.isArray(params.lockUsageType) ? params.lockUsageType[0] : params.lockUsageType;

		return value === '1' || value === 'true';
	}, [params.lockUsageType]);
	const shouldLockMandatorySelection = React.useMemo(() => {
		const value = Array.isArray(params.lockMandatorySelection)
			? params.lockMandatorySelection[0]
			: params.lockMandatorySelection;

		return value === '1' || value === 'true';
	}, [params.lockMandatorySelection]);

	const isEditing = Boolean(editingTagId);
	const isUsageSelectionLocked = shouldLockUsageType && !isEditing && Boolean(initialUsageType);
	// Segue [[Gerenciamento de Tags]]: fluxos inline podem travar a obrigatoriedade para evitar retorno com uma categoria fora do filtro de origem.
	const isMandatorySelectionLocked = shouldLockMandatorySelection && !isEditing && Boolean(initialUsageType);
	const selectedUsageType: UsageTypeRadioValue | null = isExpenseTag ? 'expense' : isGainTag ? 'gain' : null;
	const isMandatorySwitchEnabled = selectedUsageType !== null;
	const resolvedIsMandatoryExpense =
		selectedUsageType === 'expense'
			? showInBothLists || isMandatoryExpense || (isMandatorySelectionLocked && initialUsageType === 'expense')
			: false;
	const resolvedIsMandatoryGain =
		selectedUsageType === 'gain'
			? showInBothLists || isMandatoryGain || (isMandatorySelectionLocked && initialUsageType === 'gain')
			: false;
	const isMandatorySelected =
		selectedUsageType === 'expense'
			? resolvedIsMandatoryExpense
			: selectedUsageType === 'gain'
				? resolvedIsMandatoryGain
				: false;
	const initialUsageLabel =
		initialUsageType === 'expense'
			? 'despesas'
			: initialUsageType === 'gain'
				? 'ganhos'
				: null;
	const hasHydratedInitialParamsRef = React.useRef(false);

	React.useEffect(() => {
		if (hasHydratedInitialParamsRef.current) {
			return;
		}

		hasHydratedInitialParamsRef.current = true;
		setTagName(initialTagName);
		setShowInBothLists(initialShowInBothLists);
		setSelectedTagIcon(
			resolveTagIcon({
				iconFamily: initialTagIconFamily as any,
				iconName: initialTagIconName,
				iconStyle: initialTagIconStyle as any,
			}),
		);
		if (initialUsageType === 'expense') {
			setIsExpenseTag(true);
			setIsGainTag(false);
			setIsMandatoryExpense(initialShowInBothLists || initialIsMandatoryExpense);
			setIsMandatoryGain(false);
		} else if (initialUsageType === 'gain') {
			setIsGainTag(true);
			setIsExpenseTag(false);
			setIsMandatoryExpense(false);
			setIsMandatoryGain(initialShowInBothLists || initialIsMandatoryGain);
		} else {
			setIsExpenseTag(false);
			setIsGainTag(false);
			setIsMandatoryExpense(false);
			setIsMandatoryGain(false);
			setShowInBothLists(false);
		}
	}, [
		initialTagName,
		initialUsageType,
		initialIsMandatoryExpense,
		initialIsMandatoryGain,
		initialShowInBothLists,
		initialTagIconFamily,
		initialTagIconName,
		initialTagIconStyle,
		resolveTagIcon,
	]);

	const handleUsageSelection = React.useCallback((nextValue: string) => {
		if (isUsageSelectionLocked) {
			return;
		}

		if (nextValue === 'expense') {
			setIsExpenseTag(true);
			setIsGainTag(false);
			setIsMandatoryGain(false);
			if (showInBothLists) {
				setIsMandatoryExpense(true);
			}
			return;
		}

		if (nextValue === 'gain') {
			setIsGainTag(true);
			setIsExpenseTag(false);
			setIsMandatoryExpense(false);
			if (showInBothLists) {
				setIsMandatoryGain(true);
			}
			return;
		}

		setIsExpenseTag(false);
		setIsGainTag(false);
		setIsMandatoryExpense(false);
		setIsMandatoryGain(false);
		setShowInBothLists(false);
	}, [isUsageSelectionLocked, showInBothLists]);

	const handleMandatorySelection = React.useCallback(
		(nextValue: boolean) => {
			if (isMandatorySelectionLocked) {
				return;
			}

			if (selectedUsageType === 'expense') {
				setIsMandatoryExpense(nextValue);
				return;
			}

			if (selectedUsageType === 'gain') {
				setIsMandatoryGain(nextValue);
			}
		},
		[isMandatorySelectionLocked, selectedUsageType],
	);
	const handleShowInBothListsSelection = React.useCallback(
		(nextValue: boolean) => {
			setShowInBothLists(nextValue);
			
			if (showInBothLists === false) {
				setIsMandatoryExpense(false);
				setIsMandatoryGain(false);
				return
			}

			if (!nextValue) {
				return;
			}

			if (selectedUsageType === 'expense') {
				setIsMandatoryExpense(true);
				return;
			}

			if (selectedUsageType === 'gain') {
				setIsMandatoryGain(true);
				return
			}

		},
		[selectedUsageType],
	);

	const handleCloseTagIconSheet = React.useCallback(() => {
		setTagIconSearch('');
		setIsTagIconSheetOpen(false);
	}, []);

	const handleSelectTagIcon = React.useCallback((iconOption: (typeof iconOptions)[number]) => {
		setSelectedTagIcon(iconOption);
		setTagIconSearch('');
		setIsTagIconSheetOpen(false);
	}, []);

	const registerTag = React.useCallback(async () => {
		const trimmedName = tagName.trim();
		const persistedTagIcon = serializeTagIcon(selectedTagIcon);

		if (!trimmedName) {
			showNotifierAlert({
				title: 'Erro ao registrar categoria',
				description: 'Informe o nome da categoria antes de registrar.',
				type: 'error',
				isDarkMode,
				duration: 4000,
			});
			return;
		}

		if (!selectedUsageType) {
			showNotifierAlert({
				title: 'Erro ao registrar categoria',
				description: 'Informe se a categoria será utilizada para ganhos ou despesas.',
				type: 'error',
				isDarkMode,
				duration: 4000,
			});
			return;
		}

		setIsSubmitting(true);

		try {

			const personId = auth.currentUser?.uid;

			if (!personId) {
				showNotifierAlert({
					title: 'Erro ao registrar categoria',
					description: 'Não foi possível identificar o usuário atual.',
					type: 'error',
					isDarkMode,
					duration: 4000,
				});
				setIsSubmitting(false);
				return;
			}

			if (isEditing && editingTagId) {
				const result = await updateTagFirebase({
					tagId: editingTagId,
					tagName: trimmedName,
					usageType: selectedUsageType,
					isMandatoryExpense: selectedUsageType === 'expense' ? resolvedIsMandatoryExpense : false,
					isMandatoryGain: selectedUsageType === 'gain' ? resolvedIsMandatoryGain : false,
					showInBothLists,
					...persistedTagIcon,
				});

				if (result.success) {
					showNotifierAlert({
						title: 'Categoria atualizada',
						description: `A categoria "${trimmedName}" foi atualizada com sucesso.`,
						type: 'success',
						isDarkMode,
						duration: 4000,
					});
					Keyboard.dismiss();
					if (shouldReturnAfterCreate) {
						router.back();
					} else {
						router.replace('/home?tab=0');
					}
				} else {
					showNotifierAlert({
						title: 'Erro ao atualizar categoria',
						description: 'Tente novamente mais tarde.',
						type: 'error',
						isDarkMode,
						duration: 4000,
					});
				}

				return;
			}

			const result = await addTagFirebase({
				tagName: trimmedName,
				personId,
				usageType: selectedUsageType,
				isMandatoryExpense: selectedUsageType === 'expense' ? resolvedIsMandatoryExpense : false,
				isMandatoryGain: selectedUsageType === 'gain' ? resolvedIsMandatoryGain : false,
				showInBothLists,
				...persistedTagIcon,
			});

			if (result.success) {
				showNotifierAlert({
					title: 'Categoria registrada',
					description: `A categoria "${trimmedName}" foi registrada com sucesso.`,
					type: 'success',
					isDarkMode,
					duration: 4000,
				});
				Keyboard.dismiss();

				if (shouldReturnAfterCreate && result.tagId) {
					setPendingCreatedTag({
						tagId: result.tagId,
						tagName: trimmedName,
						usageType: selectedUsageType,
						...persistedTagIcon,
					});
					router.back();
					return;
				}

				router.replace('/home?tab=0');
			} else {
				showNotifierAlert({
					title: 'Erro ao registrar categoria',
					description: 'Tente novamente mais tarde.',
					type: 'error',
					isDarkMode,
					duration: 4000,
				});
			}
		} catch (error) {
			console.error('Erro ao registrar categoria:', error);
			showNotifierAlert({
				title: 'Erro inesperado ao registrar categoria',
				description: 'Tente novamente.',
				type: 'error',
				isDarkMode,
				duration: 4000,
			});
		} finally {
			setIsSubmitting(false);
		}
	}, [
		isDarkMode,
		editingTagId,
		isEditing,
		tagName,
		isMandatoryExpense,
		isMandatoryGain,
		showInBothLists,
		resolvedIsMandatoryExpense,
		resolvedIsMandatoryGain,
		selectedUsageType,
		selectedTagIcon,
		serializeTagIcon,
		shouldReturnAfterCreate,
	]);

	const getInputRef = React.useCallback((key: FocusableInputKey) => {
		switch (key) {
			case 'tag-name':
				return tagNameInputRef;
			default:
				return null;
		}
	}, []);

	const scrollToInput = React.useCallback(
		(key: FocusableInputKey) => {
			const inputRef = getInputRef(key);
			if (!inputRef?.current) {
				return;
			}

			const nodeHandle = findNodeHandle(inputRef.current);
			const scrollResponder = scrollViewRef.current?.getScrollResponder?.();
			const offset = keyboardScrollOffset(key);

			if (scrollResponder && nodeHandle) {
				scrollResponder.scrollResponderScrollNativeHandleToKeyboard(nodeHandle, offset, true);
				return;
			}

			const scrollViewNode = scrollViewRef.current;
			const innerViewNode = scrollViewNode?.getInnerViewNode?.();

			if (scrollViewNode && innerViewNode && typeof inputRef.current.measureLayout === 'function') {
				inputRef.current.measureLayout(
					innerViewNode,
					(_x, y) =>
						scrollViewNode.scrollTo({
							y: Math.max(0, y - keyboardScrollOffset(key)),
							animated: true,
						}),
					() => { },
				);
			}
		},
		[getInputRef, keyboardScrollOffset],
	);

	const handleInputFocus = React.useCallback(
		(key: FocusableInputKey) => {
			lastFocusedInputKey.current = key;
			scrollToInput(key);
		},
		[scrollToInput],
	);

	React.useEffect(() => {
		const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
		const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

		const showSub = Keyboard.addListener(showEvent, e => {
			setKeyboardHeight(e.endCoordinates?.height ?? 0);
			const focusedKey = lastFocusedInputKey.current;
			if (focusedKey) {
				setTimeout(() => {
					scrollToInput(focusedKey);
				}, 50);
			}
		});
		const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));

		return () => {
			showSub.remove();
			hideSub.remove();
		};
	}, [scrollToInput]);

	const contentBottomPadding = React.useMemo(() => Math.max(140, keyboardHeight + 120), [keyboardHeight]);
	const screenTitle = isEditing
		? 'Editar tag'
		: shouldReturnAfterCreate && initialUsageLabel
			? `Nova categoria de ${initialUsageLabel.slice(0, -1)}`
			: 'Adição de nova categoria';
	const showInBothListsLabel =
		selectedUsageType === 'expense'
			? 'Categoria nas despesas e nas obrigatórias'
			: selectedUsageType === 'gain'
				? 'Categoria nos ganhos e nos obrigatórios'
				: 'Categoria nas duas listas';
	const showInBothListsHelperText =
		selectedUsageType === 'expense'
			? 'Ative esta opção para que a categoria fique disponível tanto na lista de despesas quanto na lista de gastos obrigatórios.'
			: selectedUsageType === 'gain'
				? 'Ative esta opção para que a categoria fique disponível tanto na lista de ganhos quanto na lista de ganhos obrigatórios.'
				: 'Selecione o tipo de utilização acima para definir se a categoria ficará disponível nas duas listas.';
	const mandatoryUsageLabel =
		selectedUsageType === 'expense'
			? 'Despesa apenas obrigatória'
			: selectedUsageType === 'gain'
				? 'Ganho apenas obrigatório'
				: 'Marcar como obrigatório';
	const mandatoryHelperText =
		selectedUsageType === 'expense'
			? 'Ative esta opção para que a categoria seja listada na tela de gastos obrigatórios.'
			: selectedUsageType === 'gain'
				? 'Ative esta opção para que a categoria seja listada na tela de ganhos obrigatórios.'
				: 'Selecione o tipo de utilização acima para liberar a opção de obrigatoriedade.';
	const isTagIconSelectionEnabled = tagName.trim().length > 0;
	const selectedTagIconColor = isDarkMode ? '#FCD34D' : '#D97706';
	const selectedTagIconSurfaceClassName = isDarkMode
		? ''
		: '';
	const tagIconSheetSnapPoints = React.useMemo(() => [86], []);
	const filteredIconOptions = React.useMemo(
		() => {
			const normalizedQuery = normalizeTagIconSearchText(tagIconSearch);

			if (!normalizedQuery) {
				return iconOptions;
			}

			const searchTerms = normalizedQuery.split(/\s+/).filter(Boolean);

			return iconOptions.filter(iconOption => {
				const searchableContent = normalizeTagIconSearchText(
					[
						iconOption.label,
						iconOption.iconName,
						iconOption.iconFamily,
						iconOption.iconStyle,
					]
						.filter(Boolean)
						.join(' '),
				);

				return searchTerms.every(term => searchableContent.includes(term));
			});
		},
		[iconOptions, tagIconSearch],
	);
	const handleOpenTagIconSheet = React.useCallback(() => {
		if (!isTagIconSelectionEnabled) {
			return;
		}

		setTagIconSearch('');
		setIsTagIconSheetOpen(true);
	}, [isTagIconSelectionEnabled]);

	React.useEffect(() => {
		if (!isTagIconSelectionEnabled && isTagIconSheetOpen) {
			setTagIconSearch('');
			setIsTagIconSheetOpen(false);
		}
	}, [isTagIconSelectionEnabled, isTagIconSheetOpen]);

	return (
		<TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
			<SafeAreaView
				className="flex-1"
				edges={['left', 'right', 'bottom']}
				style={{ backgroundColor: surfaceBackground }}
			>
				<StatusBar
					translucent
					backgroundColor="transparent"
					barStyle={isDarkMode ? 'light-content' : 'dark-content'}
				/>

				<View className="flex-1" style={{ backgroundColor: surfaceBackground }}>
					<FloatingAlertViewport />

					<KeyboardAvoidingView
						behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
						keyboardVerticalOffset={Platform.OS === 'ios' ? 120 : 0}
						className="flex-1"
					>
						<View className="flex-1" style={{ backgroundColor: surfaceBackground }}>
							<View
								className={`absolute top-0 left-0 right-0 ${cardBackground}`}
								style={{ height: heroHeight }}
							>
								<Image
									source={LoginWallpaper}
									alt="Background da tela de cadastro de tag"
									className="w-full h-full rounded-b-3xl absolute"
									resizeMode="cover"
								/>

								<VStack
									className="w-full h-full items-center justify-start px-6 gap-4"
									style={{ paddingTop: insets.top + 24 }}
								>
									<Heading size="xl" className="text-white text-center">
										{screenTitle}
									</Heading>
									<AddRegisterTagScreenIllustration width="40%" height="40%" className="opacity-90" />
								</VStack>
							</View>

							<ScrollView
								ref={scrollViewRef}
								keyboardShouldPersistTaps="handled"
								keyboardDismissMode="on-drag"
								className={`flex-1 rounded-t-3xl ${cardBackground} px-6 pb-1`}
								style={{ marginTop: heroHeight - 64 }}
								contentContainerStyle={{ paddingBottom: Math.max(32, contentBottomPadding - 108) }}
							>
								<VStack className="justify-between mt-4">

									<VStack className="mb-4">
										<Text className={`${bodyText} mb-1 ml-1 text-sm`}>
											Nome da categoria que será registrada
										</Text>
										<Input className={fieldContainerClassName}>
											<InputField
												ref={tagNameInputRef as any}
												placeholder="Ex: investimento, mercado, conta de casa..."
												value={tagName}
												onChangeText={setTagName}
												autoCapitalize="sentences"
												className={inputField}
												onFocus={() => handleInputFocus('tag-name')}
											/>
										</Input>
									</VStack>

									<VStack className="mb-4">
										<Text className={`${bodyText} mb-1 ml-1 text-sm`}>
											Icone da categoria
										</Text>
										<Pressable
											onPress={handleOpenTagIconSheet}
											disabled={!isTagIconSelectionEnabled}
											accessibilityRole="button"
											accessibilityLabel="Escolher icone da categoria"
											className={`${fieldContainerCardClassName} px-4 py-3 ${!isTagIconSelectionEnabled ? 'opacity-50' : ''}`}
										>
											<HStack className="items-center justify-between gap-4">
												<HStack className="items-center gap-3 flex-1">
													<View
														className={`h-12 w-12 items-center justify-center rounded-2xl ${selectedTagIconSurfaceClassName}`}
													>
														<TagIcon
															iconFamily={selectedTagIcon.iconFamily}
															iconName={selectedTagIcon.iconName}
															iconStyle={selectedTagIcon.iconStyle}
															size={24}
															color={selectedTagIconColor}
														/>
													</View>
													<VStack className="flex-1">
														<Text className={`${bodyText} text-sm font-medium`}>
															{selectedTagIcon.label}
														</Text>
														<Text className={`${helperText} text-xs`}>
															{isTagIconSelectionEnabled
																? 'Toque para escolher entre varios icones e marcas.'
																: 'Preencha o nome da categoria para liberar a escolha do icone.'}
														</Text>
													</VStack>
												</HStack>
												<Text className={`${helperText} text-xs`}>
													{isTagIconSelectionEnabled ? 'Alterar' : 'Bloqueado'}
												</Text>
											</HStack>
										</Pressable>
									</VStack>

									<VStack className="mb-4">
										<HStack className="mb-1 ml-1">
											<Text className={`${bodyText} text-sm`}>Tipo de utilização</Text>
											<Popover
												placement="bottom"
												size="md"
												offset={0}
												shouldFlip
												focusScope={false}
												trapFocus={false}
												trigger={triggerProps => (
													<Pressable
														{...triggerProps}
														hitSlop={8}
														accessibilityRole="button"
														accessibilityLabel="Informações sobre a observação da despesa"
													>
														<Info
															size={14}
															color={isDarkMode ? '#94A3B8' : '#64748B'}
															style={{ marginLeft: 4 }}
														/>
													</Pressable>
												)}
											>
												<PopoverBackdrop className="bg-transparent" />
												<PopoverContent className="max-w-[260px]" style={infoCardStyle}>
													<PopoverBody className="px-3 py-3">
														<Text className={`${bodyText} text-xs leading-5`}>
															Selecione o tipo de utilização da tag para que ela seja listada corretamente nas telas de registro de ganhos ou despesas. Essa informação é importante para organizar suas tags e facilitar a categorização dos seus registros financeiros.
														</Text>
													</PopoverBody>
												</PopoverContent>
											</Popover>
										</HStack>
										<View className={`${fieldContainerCardClassName} px-4 py-4`}>
											<RadioGroup
												value={selectedUsageType ?? ''}
												onChange={handleUsageSelection}
											>
												<HStack className="justify-between gap-4">
													<Radio
														value="expense"
														isDisabled={isUsageSelectionLocked}
														className={`${switchRadioClassName} flex-1`}
													>
														<RadioIndicator className={switchRadioIndicatorClassName}>
															<RadioIcon as={CircleIcon} className={switchRadioIconClassName} />
														</RadioIndicator>
														<RadioLabel className={`${switchRadioLabelClassName} text-sm`}>
															Tag para despesas
														</RadioLabel>
													</Radio>

													<Radio
														value="gain"
														isDisabled={isUsageSelectionLocked}
														className={`${switchRadioClassName} flex-1`}
													>
														<RadioIndicator className={switchRadioIndicatorClassName}>
															<RadioIcon as={CircleIcon} className={switchRadioIconClassName} />
														</RadioIndicator>
														<RadioLabel className={`${switchRadioLabelClassName} text-sm`}>
															Tag para ganhos
														</RadioLabel>
													</Radio>
												</HStack>
											</RadioGroup>

											{selectedUsageType && (
												<>
													<View className="mt-4">
														<HStack className="items-center justify-between gap-6">
															<HStack className="ml-1 gap-1 flex-1">
																<Text className={`text-base font-semibold`}>
																	{showInBothListsLabel}
																</Text>
																<Popover
																	placement="bottom"
																	size="md"
																	offset={0}
																	shouldFlip
																	focusScope={false}
																	trapFocus={false}
																	trigger={triggerProps => (
																		<Pressable
																			{...triggerProps}
																			hitSlop={8}
																			accessibilityRole="button"
																			accessibilityLabel="Informações sobre a categoria aparecer nas duas listas"
																		>
																			<Info
																				size={14}
																				color={isDarkMode ? '#94A3B8' : '#64748B'}
																				style={{ marginLeft: 4 }}
																			/>
																		</Pressable>
																	)}
																>
																	<PopoverBackdrop className="bg-transparent" />
																	<PopoverContent className="max-w-[260px]" style={infoCardStyle}>
																		<PopoverBody className="px-3 py-3">
																			<Text className={`${bodyText} text-xs leading-5`}>
																				{showInBothListsHelperText}
																			</Text>
																		</PopoverBody>
																	</PopoverContent>
																</Popover>
															</HStack>
															<Switch
																value={showInBothLists}
																onValueChange={handleShowInBothListsSelection}
																isDisabled={!selectedUsageType}
																trackColor={switchTrackColor}
																thumbColor={switchThumbColor}
																ios_backgroundColor={switchIosBackgroundColor}
															/>
														</HStack>
													</View>

													{!showInBothLists && (
														<View className="">
															<HStack className="items-center justify-between gap-6">
																<HStack className="ml-1 gap-1">
																	<Text className={`text-base font-semibold`}>
																		{mandatoryUsageLabel}
																	</Text>
																	<Popover
																		placement="bottom"
																		size="md"
																		offset={0}
																		shouldFlip
																		focusScope={false}
																		trapFocus={false}
																		trigger={triggerProps => (
																			<Pressable
																				{...triggerProps}
																				hitSlop={8}
																				accessibilityRole="button"
																				accessibilityLabel="Informações sobre a observação da despesa"
																			>
																				<Info
																					size={14}
																					color={isDarkMode ? '#94A3B8' : '#64748B'}
																					style={{ marginLeft: 4 }}
																				/>
																			</Pressable>
																		)}
																	>
																		<PopoverBackdrop className="bg-transparent" />
																		<PopoverContent className="max-w-[260px]" style={infoCardStyle}>
																			<PopoverBody className="px-3 py-3">
																				<Text className={`${bodyText} text-xs leading-5`}>
																					{mandatoryHelperText}
																				</Text>
																			</PopoverBody>
																		</PopoverContent>
																	</Popover>
																</HStack>
																<Switch
																	value={isMandatorySelected}
																	onValueChange={handleMandatorySelection}
																	isDisabled={!isMandatorySwitchEnabled || isMandatorySelectionLocked}
																	trackColor={switchTrackColor}
																	thumbColor={switchThumbColor}
																	ios_backgroundColor={switchIosBackgroundColor}
																/>
															</HStack>
														</View>
													)}
												</>
											)}
										</View>
									</VStack>

									<Button
										className={submitButtonClassName}
										onPress={registerTag}
										isDisabled={isSubmitting || !tagName.trim() || (!isExpenseTag && !isGainTag)}
									>
										{isSubmitting ? (
											<ButtonSpinner />
										) : (
											<ButtonText className={submitButtonTextClassName}>
												{isEditing ? 'Atualizar Tag' : 'Registrar Tag'}
											</ButtonText>
										)}
									</Button>
								</VStack>
							</ScrollView>
						</View>
					</KeyboardAvoidingView>

					<Actionsheet
						isOpen={isTagIconSheetOpen && isTagIconSelectionEnabled}
						onClose={handleCloseTagIconSheet}
						initialFocusRef={tagIconSearchInputRef as React.RefObject<any>}
						snapPoints={tagIconSheetSnapPoints}
						className=""
					>
						<ActionsheetBackdrop />
						<ActionsheetContent className={isDarkMode ? 'bg-slate-950' : 'bg-white'}>
							<ActionsheetDragIndicatorWrapper>
								<ActionsheetDragIndicator />
							</ActionsheetDragIndicatorWrapper>

							<VStack className="w-full px-4 pb-3 pt-6 gap-3">
								<Heading size="lg" className={isDarkMode ? 'text-slate-100' : 'text-slate-900'}>
									Escolha um ícone para a categoria {selectedTagIcon.label}
								</Heading>
							</VStack>

							<VStack className="px-2 pb-3 w-full">
								<HStack className="mb-1 ml-1 gap-2">
									<Text className={`${bodyText} text-sm`}>Busca de ícones</Text>
									<Popover
										placement="bottom"
										size="md"
										offset={0}
										shouldFlip
										focusScope={false}
										trapFocus={false}
										trigger={triggerProps => (
											<Pressable
												{...triggerProps}
												hitSlop={8}
												accessibilityRole="button"
												accessibilityLabel="Informações sobre o formato de pagamento"
											>
												<Info
													size={14}
													color={isDarkMode ? '#94A3B8' : '#64748B'}
													style={{ marginLeft: 4 }}
												/>
											</Pressable>
										)}
									>
										<PopoverBackdrop className="bg-transparent" />
										<PopoverContent className="max-w-[260px]" style={infoCardStyle}>
											<PopoverBody className="px-3 py-3">
												<Text className={`${bodyText} text-xs leading-5`}>
													Use a busca para encontrar o ícone ideal para sua categoria. Você pode buscar por nome do ícone, família ou estilo. Por exemplo, para encontrar um carrinho de compras, tente buscar por "cart", "shopping" ou "bag".
												</Text>
											</PopoverBody>
										</PopoverContent>
									</Popover>
								</HStack>
								<Input className={fieldContainerClassName}>
									<InputField
										ref={tagIconSearchInputRef as any}
										value={tagIconSearch}
										onChangeText={setTagIconSearch}
										placeholder="Digite para buscar um icone"
										accessibilityLabel="Buscar icone"
										autoCapitalize="none"
										autoCorrect={false}
										returnKeyType="search"
										clearButtonMode="while-editing"
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
								<VStack className="px-2 pb-2">

									{filteredIconOptions.length === 0 ? (
										<VStack className="items-center px-4 py-8">
											<Text className={`${bodyText} text-center text-sm`}>
												Nenhum icone encontrado para "{tagIconSearch.trim()}".
											</Text>
											<Text className={`${helperText} mt-1 text-center text-xs`}>
												Tente buscar por outro nome ou parte do nome.
											</Text>
										</VStack>
									) : null}
									{filteredIconOptions.map(iconOption => {
										const isSelected = iconOption.key === selectedTagIcon.key;

										return (
											<ActionsheetItem
												key={iconOption.key}
												onPress={() => handleSelectTagIcon(iconOption)}
												className={isSelected ? (isDarkMode ? 'bg-slate-900 rounded-2xl' : 'bg-amber-50 rounded-2xl') : ''}
											>
												<HStack className="items-center gap-1 w-full gap-2">
													<View
														className={`h-11 w-11 items-center justify-center rounded-2xl ${selectedTagIconSurfaceClassName}`}
													>
														<TagIcon
															iconFamily={iconOption.iconFamily}
															iconName={iconOption.iconName}
															iconStyle={iconOption.iconStyle}
															size={20}
															color={selectedTagIconColor}
														/>
													</View>
													<VStack className="flex-1 items-start justify-center">
														<ActionsheetItemText
															className={isDarkMode ? 'mx-0 text-slate-100' : 'mx-0 text-slate-900'}
														>
															{iconOption.label}
														</ActionsheetItemText>
														{isSelected ? (
															<Text className="text-xs text-amber-500 dark:text-amber-300">
																Selecionado atualmente
															</Text>
														) : null}
													</VStack>
												</HStack>
											</ActionsheetItem>
										);
									})}
								</VStack>
							</ActionsheetScrollView>
						</ActionsheetContent>
					</Actionsheet>

					<View
						style={{
							marginHorizontal: -18,
							paddingBottom: 0,
							flexShrink: 0,
						}}
					>
						<Navigator defaultValue={2} />
					</View>
				</View>
			</SafeAreaView>
		</TouchableWithoutFeedback>
	);
}
