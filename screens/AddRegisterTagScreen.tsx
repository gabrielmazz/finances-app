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
	Pressable,
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

import { showNotifierAlert } from '@/components/uiverse/notifier-alert';
import Navigator from '@/components/uiverse/navigator';
import { Switch } from '@/components/ui/switch';

import { addTagFirebase, updateTagFirebase } from '@/functions/TagFirebase';
import { auth } from '@/FirebaseConfig';
import LoginWallpaper from '@/assets/Background/wallpaper01.png';
import { setPendingCreatedTag } from '@/utils/pendingCreatedTag';
import { normalizeTagUsageType, type TagUsageType } from '@/utils/tagUsage';
import { navigateBackOrHomeDashboard, navigateToHomeDashboard } from '@/utils/navigation';

import AddRegisterTagScreenIllustration from '../assets/UnDraw/addRegisterTagScreen.svg';

import { useScreenStyles } from '@/hooks/useScreenStyle';
import { TagIcon, useTagIcons } from '@/hooks/useTagIcons';
import { useKeyboardAwareScroll } from '@/hooks/useKeyboardAwareScroll';

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
	const [isSharedBetweenUsageTypes, setIsSharedBetweenUsageTypes] = React.useState(false);
	const [isExpenseTag, setIsExpenseTag] = React.useState(false);
	const [isGainTag, setIsGainTag] = React.useState(false);
	const [isMandatoryExpense, setIsMandatoryExpense] = React.useState(false);
	const [isMandatoryGain, setIsMandatoryGain] = React.useState(false);
	const [showInBothLists, setShowInBothLists] = React.useState(false);
	const [selectedTagIcon, setSelectedTagIcon] = React.useState(defaultTagIcon);
	const [isTagIconSheetOpen, setIsTagIconSheetOpen] = React.useState(false);
	const [tagIconSearch, setTagIconSearch] = React.useState('');
	const tagNameInputRef = React.useRef<TextInput | null>(null);
	const tagIconSearchInputRef = React.useRef<TextInput | null>(null);
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

	const initialUsageType = React.useMemo<TagUsageType | null>(() => {
		const value = Array.isArray(params.usageType) ? params.usageType[0] : params.usageType;
		if (!value) {
			return null;
		}

		try {
			const decoded = decodeURIComponent(value);
			return normalizeTagUsageType(decoded) ?? null;
		} catch {
			return normalizeTagUsageType(value) ?? null;
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
	// Segue [[Gerenciamento de Tags]]: fluxos inline comuns travam apenas a escolha exclusiva do tipo, mas ainda podem ampliar a tag para ambos os usos.
	const isSharedUsageSelectionLocked = isMandatorySelectionLocked;
	const selectedUsageType: TagUsageType | null = isSharedBetweenUsageTypes
		? 'both'
		: isExpenseTag
			? 'expense'
			: isGainTag
				? 'gain'
				: null;
	const isMandatorySwitchEnabled = selectedUsageType !== null;
	const resolvedIsMandatoryExpense =
		selectedUsageType === 'expense' || selectedUsageType === 'both'
			? showInBothLists ||
			isMandatoryExpense ||
			(isMandatorySelectionLocked &&
				(initialUsageType === 'expense' || initialUsageType === 'both'))
			: false;
	const resolvedIsMandatoryGain =
		selectedUsageType === 'gain' || selectedUsageType === 'both'
			? showInBothLists ||
			isMandatoryGain ||
			(isMandatorySelectionLocked &&
				(initialUsageType === 'gain' || initialUsageType === 'both'))
			: false;
	const isMandatorySelected =
		selectedUsageType === 'expense'
			? resolvedIsMandatoryExpense
			: selectedUsageType === 'gain'
				? resolvedIsMandatoryGain
				: selectedUsageType === 'both'
					? resolvedIsMandatoryExpense && resolvedIsMandatoryGain
					: false;
	const initialUsageLabel =
		initialUsageType === 'expense'
			? 'despesas'
			: initialUsageType === 'gain'
				? 'ganhos'
				: initialUsageType === 'both'
					? 'ganhos e despesas'
					: null;
	const hasHydratedInitialParamsRef = React.useRef(false);

	React.useEffect(() => {
		if (hasHydratedInitialParamsRef.current) {
			return;
		}

		hasHydratedInitialParamsRef.current = true;
		setTagName(initialTagName);
		setSelectedTagIcon(
			resolveTagIcon({
				iconFamily: initialTagIconFamily as any,
				iconName: initialTagIconName,
				iconStyle: initialTagIconStyle as any,
			}),
		);
		if (initialUsageType === 'both') {
			const isMandatoryForBothUsage =
				initialShowInBothLists || initialIsMandatoryExpense || initialIsMandatoryGain;
			setIsSharedBetweenUsageTypes(true);
			setIsExpenseTag(true);
			setIsGainTag(true);
			setIsMandatoryExpense(isMandatoryForBothUsage);
			setIsMandatoryGain(isMandatoryForBothUsage);
			setShowInBothLists(isMandatoryForBothUsage);
		} else if (initialUsageType === 'expense') {
			const shouldAppearInMandatoryLists = initialShowInBothLists || initialIsMandatoryExpense;
			setIsSharedBetweenUsageTypes(false);
			setIsExpenseTag(true);
			setIsGainTag(false);
			setIsMandatoryExpense(shouldAppearInMandatoryLists);
			setIsMandatoryGain(false);
			setShowInBothLists(shouldAppearInMandatoryLists);
		} else if (initialUsageType === 'gain') {
			const shouldAppearInMandatoryLists = initialShowInBothLists || initialIsMandatoryGain;
			setIsSharedBetweenUsageTypes(false);
			setIsGainTag(true);
			setIsExpenseTag(false);
			setIsMandatoryExpense(false);
			setIsMandatoryGain(shouldAppearInMandatoryLists);
			setShowInBothLists(shouldAppearInMandatoryLists);
		} else {
			setIsSharedBetweenUsageTypes(false);
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

	const handleSharedBetweenUsageTypesSelection = React.useCallback(
		(nextValue: boolean) => {
			if (isSharedUsageSelectionLocked) {
				return;
			}

			setIsSharedBetweenUsageTypes(nextValue);

			if (nextValue) {
				const shouldShowInMandatoryLists = showInBothLists || isMandatoryExpense || isMandatoryGain;
				setIsExpenseTag(true);
				setIsGainTag(true);
				setShowInBothLists(shouldShowInMandatoryLists);
				setIsMandatoryExpense(shouldShowInMandatoryLists);
				setIsMandatoryGain(shouldShowInMandatoryLists);
				return;
			}

			if (isUsageSelectionLocked && initialUsageType === 'expense') {
				setIsExpenseTag(true);
				setIsGainTag(false);
				setIsMandatoryGain(false);
				return;
			}

			if (isUsageSelectionLocked && initialUsageType === 'gain') {
				setIsGainTag(true);
				setIsExpenseTag(false);
				setIsMandatoryExpense(false);
				return;
			}

			setIsExpenseTag(false);
			setIsGainTag(false);
			setIsMandatoryExpense(false);
			setIsMandatoryGain(false);
			setShowInBothLists(false);
		},
		[
			initialUsageType,
			isMandatoryExpense,
			isMandatoryGain,
			isSharedUsageSelectionLocked,
			isUsageSelectionLocked,
			showInBothLists,
		],
	);

	const handleUsageSelection = React.useCallback((nextValue: string) => {
		if (isUsageSelectionLocked) {
			return;
		}

		const shouldAppearInMandatoryLists = showInBothLists || isMandatoryExpense || isMandatoryGain;

		if (nextValue === 'expense') {
			setIsSharedBetweenUsageTypes(false);
			setIsExpenseTag(true);
			setIsGainTag(false);
			setShowInBothLists(shouldAppearInMandatoryLists);
			setIsMandatoryExpense(shouldAppearInMandatoryLists);
			setIsMandatoryGain(false);
			return;
		}

		if (nextValue === 'gain') {
			setIsSharedBetweenUsageTypes(false);
			setIsGainTag(true);
			setIsExpenseTag(false);
			setShowInBothLists(shouldAppearInMandatoryLists);
			setIsMandatoryExpense(false);
			setIsMandatoryGain(shouldAppearInMandatoryLists);
			return;
		}

		setIsSharedBetweenUsageTypes(false);
		setIsExpenseTag(false);
		setIsGainTag(false);
		setIsMandatoryExpense(false);
		setIsMandatoryGain(false);
		setShowInBothLists(false);
	}, [isMandatoryExpense, isMandatoryGain, isUsageSelectionLocked, showInBothLists]);

	const handleMandatoryVisibilitySelection = React.useCallback(
		(nextValue: boolean) => {
			if (isMandatorySelectionLocked) {
				return;
			}

			if (selectedUsageType === 'both') {
				setShowInBothLists(nextValue);
				setIsMandatoryExpense(nextValue);
				setIsMandatoryGain(nextValue);
				return;
			}

			setShowInBothLists(nextValue);

			if (selectedUsageType === 'expense') {
				setIsMandatoryExpense(nextValue);
				setIsMandatoryGain(false);
				return;
			}

			if (selectedUsageType === 'gain') {
				setIsMandatoryExpense(false);
				setIsMandatoryGain(nextValue);
				return;
			}

			setIsMandatoryExpense(false);
			setIsMandatoryGain(false);
		},
		[isMandatorySelectionLocked, selectedUsageType],
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
				description: 'Informe se a categoria será utilizada para despesas, ganhos ou ambos.',
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
					isMandatoryExpense: resolvedIsMandatoryExpense,
					isMandatoryGain: resolvedIsMandatoryGain,
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
						navigateBackOrHomeDashboard();
					} else {
						navigateToHomeDashboard();
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
				isMandatoryExpense: resolvedIsMandatoryExpense,
				isMandatoryGain: resolvedIsMandatoryGain,
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
					navigateBackOrHomeDashboard();
					return;
				}

				navigateToHomeDashboard();
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

	const {
		scrollViewRef,
		contentBottomPadding,
		handleInputFocus,
		handleScroll,
		scrollEventThrottle,
	} = useKeyboardAwareScroll<FocusableInputKey>({
		getInputRef,
		keyboardScrollOffset,
	});
	const screenTitle = isEditing
		? 'Editar tag'
		: shouldReturnAfterCreate && initialUsageLabel
			? initialUsageType === 'both'
				? 'Nova categoria para ganhos e despesas'
				: `Nova categoria de ${initialUsageLabel.slice(0, -1)}`
			: 'Adição de nova categoria';
	const sharedBetweenUsageTypesHelperText = isUsageSelectionLocked
		? isSharedUsageSelectionLocked
			? 'Este fluxo já definiu um tipo único de utilização para manter o retorno da categoria no contexto de origem.'
			: 'Este fluxo já definiu o tipo de origem, mas a categoria ainda pode ser ampliada para ganhos e despesas.'
		: 'Ative esta opção para usar a mesma categoria nas telas de ganhos e despesas ao mesmo tempo.';
	const mandatoryVisibilityLabel =
		selectedUsageType === 'expense'
			? 'Aparecer também nas despesas obrigatórias'
			: selectedUsageType === 'gain'
				? 'Aparecer também nos ganhos obrigatórios'
				: selectedUsageType === 'both'
					? 'Aparecer também nos gastos e ganhos obrigatórios'
					: 'Aparecer também nas telas com obrigatoriedade';
	const mandatoryVisibilityHelperText =
		selectedUsageType === 'expense'
			? 'Ative esta opção para que a categoria também fique disponível na tela de gastos obrigatórios.'
			: selectedUsageType === 'gain'
				? 'Ative esta opção para que a categoria também fique disponível na tela de ganhos obrigatórios.'
				: selectedUsageType === 'both'
					? 'Ative esta opção para que a categoria apareça também nas telas de gastos obrigatórios e ganhos obrigatórios.'
					: 'Selecione o tipo de utilização acima para definir se a categoria também aparecerá nas telas com obrigatoriedade.';
	const usageTypePopoverText = isSharedBetweenUsageTypes
		? 'Com a opção acima ativa, a categoria passa a valer para ganhos e despesas ao mesmo tempo e não precisa de uma escolha exclusiva abaixo.'
		: 'Selecione o tipo de utilização da tag para que ela seja listada corretamente nas telas de registro de ganhos ou despesas. Essa informação é importante para organizar suas tags e facilitar a categorização dos seus registros financeiros.';
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

	const handleBackNavigation = React.useCallback(() => {
		if (shouldReturnAfterCreate) {
			navigateBackOrHomeDashboard();
			return true;
		}

		navigateToHomeDashboard();
		return true;
	}, [shouldReturnAfterCreate]);

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
								onScroll={handleScroll}
								scrollEventThrottle={scrollEventThrottle}
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
											<Text className={`${bodyText} text-sm`}>Ganhos e despesas</Text>
										</HStack>
										<View className={`${fieldContainerCardClassName} px-4`}>
											<HStack className="items-center justify-between gap-6">
												<HStack className="ml-1 gap-1 flex-1">
													<Text className={`${bodyText} text-sm`}>
														Categoria para ganhos e despesas
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
																accessibilityLabel="Informações sobre a categoria aparecer também nos obrigatórios"
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
																	{sharedBetweenUsageTypesHelperText}
																</Text>
															</PopoverBody>
														</PopoverContent>
													</Popover>
												</HStack>
												<Switch
													value={isSharedBetweenUsageTypes}
													onValueChange={handleSharedBetweenUsageTypesSelection}
													isDisabled={isSharedUsageSelectionLocked}
													trackColor={switchTrackColor}
													thumbColor={switchThumbColor}
													ios_backgroundColor={switchIosBackgroundColor}
												/>
											</HStack>
										</View>
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
															{usageTypePopoverText}
														</Text>
													</PopoverBody>
												</PopoverContent>
											</Popover>
										</HStack>
										<View className={`${fieldContainerCardClassName} px-4`}>
											{!isSharedBetweenUsageTypes && (
												<RadioGroup
													value={selectedUsageType === 'both' ? '' : selectedUsageType ?? ''}
													onChange={handleUsageSelection}
												>
													<HStack className="justify-between gap-4 py-4">
														<Radio
															value="expense"
															isDisabled={isUsageSelectionLocked}
															className={`${switchRadioClassName} flex-1`}
														>
															<RadioIndicator className={switchRadioIndicatorClassName}>
																<RadioIcon as={CircleIcon} className={switchRadioIconClassName} />
															</RadioIndicator>
															<RadioLabel className={`${switchRadioLabelClassName} text-sm`}>
																Categoria para despesas
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
																Categoria para ganhos
															</RadioLabel>
														</Radio>
													</HStack>
												</RadioGroup>
											)}

											{selectedUsageType && (
												<View className={isSharedBetweenUsageTypes ? '' : ''}>
													<HStack className="items-center justify-between gap-6">
														<HStack className="ml-1 gap-1 flex-1">
															<Text className={`${bodyText} text-sm`}>
																{mandatoryVisibilityLabel}
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
																		accessibilityLabel="Informações sobre a categoria aparecer também nas telas obrigatórias"
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
																			{mandatoryVisibilityHelperText}
																		</Text>
																	</PopoverBody>
																</PopoverContent>
															</Popover>
														</HStack>
														<Switch
															value={isMandatorySelected}
															onValueChange={handleMandatoryVisibilitySelection}
															isDisabled={!isMandatorySwitchEnabled || isMandatorySelectionLocked}
															trackColor={switchTrackColor}
															thumbColor={switchThumbColor}
															ios_backgroundColor={switchIosBackgroundColor}
														/>
													</HStack>
												</View>
											)}
										</View>
									</VStack>

									<Button
										className={submitButtonClassName}
										onPress={registerTag}
										isDisabled={isSubmitting || !tagName.trim() || !selectedUsageType}
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

							<KeyboardAvoidingView
								behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
								keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
								style={{ width: '100%', flex: 1 }}
							>
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
							</KeyboardAvoidingView>
						</ActionsheetContent>
					</Actionsheet>

					<View
						style={{
							marginHorizontal: -18,
							paddingBottom: 0,
							flexShrink: 0,
						}}
					>
						<Navigator defaultValue={2} onHardwareBack={handleBackNavigation} />
					</View>
				</View>
			</SafeAreaView>
		</TouchableWithoutFeedback>
	);
}
