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
	useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';

import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { Image } from '@/components/ui/image';
import { Input, InputField } from '@/components/ui/input';
import { Button, ButtonSpinner, ButtonText } from '@/components/ui/button';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import {
	Checkbox,
	CheckboxGroup,
	CheckboxIndicator,
	CheckboxIcon,
	CheckboxLabel,
} from '@/components/ui/checkbox';
import { CheckIcon } from '@/components/ui/icon';

import FloatingAlertViewport, { showFloatingAlert } from '@/components/uiverse/floating-alert';
import Navigator from '@/components/uiverse/navigator';
import { Switch } from '@/components/ui/switch';

import { addTagFirebase, updateTagFirebase } from '@/functions/TagFirebase';
import { auth } from '@/FirebaseConfig';
import LoginWallpaper from '@/assets/Background/wallpaper01.png';
import { useAppTheme } from '@/contexts/ThemeContext';

import AddRegisterTagScreenIllustration from '../assets/UnDraw/addRegisterTagScreen.svg';

type FocusableInputKey = 'tag-name';

export default function AddRegisterTagScreen() {
	const { isDarkMode } = useAppTheme();
	const insets = useSafeAreaInsets();
	const { height: windowHeight } = useWindowDimensions();

	const surfaceBackground = isDarkMode ? '#020617' : '#FFFFFF';
	const cardBackground = isDarkMode ? 'bg-slate-950' : 'bg-white';
	const bodyText = isDarkMode ? 'text-slate-300' : 'text-slate-700';
	const helperText = isDarkMode ? 'text-slate-400' : 'text-slate-500';
	const inputField = isDarkMode
		? 'text-slate-100 placeholder:text-slate-500'
		: 'text-slate-900 placeholder:text-slate-500';
	const focusFieldClassName =
		'data-[focus=true]:border-[#FFE000] dark:data-[focus=true]:border-yellow-300';
	const fieldContainerClassName = `h-10 rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 ${focusFieldClassName}`;
	const fieldContainerCardClassName = `rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 ${focusFieldClassName}`;
	const submitButtonClassName = isDarkMode
		? 'bg-yellow-300/80 text-slate-900 hover:bg-yellow-300 rounded-2xl'
		: 'bg-yellow-400 text-white hover:bg-yellow-500 rounded-2xl';
	const checkboxClassName = 'items-center gap-3';
	const checkboxIndicatorClassName = isDarkMode
		? 'rounded-md border-slate-500 data-[checked=true]:border-yellow-300 data-[checked=true]:bg-yellow-300'
		: 'rounded-md border-slate-300 data-[checked=true]:border-yellow-400 data-[checked=true]:bg-yellow-400';
	const checkboxIconClassName = isDarkMode ? 'text-slate-950' : 'text-white';
	const checkboxLabelClassName = isDarkMode
		? 'text-slate-300 data-[checked=true]:text-slate-100'
		: 'text-slate-700 data-[checked=true]:text-slate-900';
	const heroHeight = Math.max(windowHeight * 0.28, 250) + insets.top;

	const [tagName, setTagName] = React.useState('');
	const [isSubmitting, setIsSubmitting] = React.useState(false);
	const [isExpenseTag, setIsExpenseTag] = React.useState(false);
	const [isGainTag, setIsGainTag] = React.useState(false);
	const [isMandatoryExpense, setIsMandatoryExpense] = React.useState(false);
	const [isMandatoryGain, setIsMandatoryGain] = React.useState(false);
	const scrollViewRef = React.useRef<ScrollView | null>(null);
	const tagNameInputRef = React.useRef<TextInput | null>(null);
	const lastFocusedInputKey = React.useRef<FocusableInputKey | null>(null);
	const [keyboardHeight, setKeyboardHeight] = React.useState(0);
	const keyboardScrollOffset = React.useCallback((_key: FocusableInputKey) => 140, []);

	const params = useLocalSearchParams<{
		tagId?: string | string[];
		tagName?: string | string[];
		usageType?: string | string[];
		isMandatoryExpense?: string | string[];
		isMandatoryGain?: string | string[];
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

	const isEditing = Boolean(editingTagId);

	React.useEffect(() => {
		if (!isEditing) {
			return;
		}

		setTagName(initialTagName);
		if (initialUsageType === 'expense') {
			setIsExpenseTag(true);
			setIsGainTag(false);
			setIsMandatoryExpense(initialIsMandatoryExpense);
			setIsMandatoryGain(false);
		} else if (initialUsageType === 'gain') {
			setIsGainTag(true);
			setIsExpenseTag(false);
			setIsMandatoryExpense(false);
			setIsMandatoryGain(initialIsMandatoryGain);
		} else {
			setIsExpenseTag(false);
			setIsGainTag(false);
			setIsMandatoryExpense(false);
			setIsMandatoryGain(false);
		}
	}, [initialTagName, initialUsageType, initialIsMandatoryExpense, initialIsMandatoryGain, isEditing]);

	const handleUsageSelection = React.useCallback((values: string[]) => {
		if (values.includes('expense')) {
			setIsExpenseTag(true);
			setIsGainTag(false);
			setIsMandatoryGain(false);
			return;
		}

		if (values.includes('gain')) {
			setIsGainTag(true);
			setIsExpenseTag(false);
			setIsMandatoryExpense(false);
			return;
		}

		setIsExpenseTag(false);
		setIsGainTag(false);
		setIsMandatoryExpense(false);
		setIsMandatoryGain(false);
	}, []);

	const registerTag = React.useCallback(async () => {
		const trimmedName = tagName.trim();

		if (!trimmedName) {
			showFloatingAlert({
				message: 'Informe o nome da tag antes de registrar.',
				action: 'error',
				position: 'bottom',
				offset: 40,
			});
			return;
		}

		const selectedUsageType = isExpenseTag ? 'expense' : isGainTag ? 'gain' : null;

		if (!selectedUsageType) {
			showFloatingAlert({
				message: 'Informe se a tag será utilizada para ganhos ou despesas.',
				action: 'error',
				position: 'bottom',
				offset: 40,
			});
			return;
		}

		setIsSubmitting(true);

		try {

			const personId = auth.currentUser?.uid;

			if (!personId) {
				showFloatingAlert({
					message: 'Não foi possível identificar o usuário atual.',
					action: 'error',
					position: 'bottom',
					offset: 40,
				});
				setIsSubmitting(false);
				return;
			}

			if (isEditing && editingTagId) {
				const result = await updateTagFirebase({
					tagId: editingTagId,
					tagName: trimmedName,
					usageType: selectedUsageType,
					isMandatoryExpense: selectedUsageType === 'expense' ? isMandatoryExpense : false,
					isMandatoryGain: selectedUsageType === 'gain' ? isMandatoryGain : false,
				});

				if (result.success) {
					showFloatingAlert({
						message: 'Tag atualizada com sucesso!',
						action: 'success',
						position: 'bottom',
						offset: 40,
					});
					Keyboard.dismiss();
					router.back();
				} else {
					showFloatingAlert({
						message: 'Erro ao atualizar tag. Tente novamente mais tarde.',
						action: 'error',
						position: 'bottom',
						offset: 40,
					});
				}

				return;
			}

			const result = await addTagFirebase({
				tagName: trimmedName,
				personId,
				usageType: selectedUsageType,
				isMandatoryExpense: selectedUsageType === 'expense' ? isMandatoryExpense : false,
				isMandatoryGain: selectedUsageType === 'gain' ? isMandatoryGain : false,
			});

			if (result.success) {
				showFloatingAlert({
					message: 'Tag registrada com sucesso!',
					action: 'success',
					position: 'bottom',
					offset: 40,
				});
				setTagName('');
				setIsExpenseTag(true);
				setIsGainTag(false);
				setIsMandatoryExpense(false);
				Keyboard.dismiss();
			} else {
				showFloatingAlert({
					message: 'Erro ao registrar tag. Tente novamente mais tarde.',
					action: 'error',
					position: 'bottom',
					offset: 40,
				});
			}
		} catch (error) {
			console.error('Erro ao registrar tag:', error);
			showFloatingAlert({
				message: 'Erro inesperado ao registrar tag. Tente novamente.',
				action: 'error',
				position: 'bottom',
				offset: 40,
			});
		} finally {
			setIsSubmitting(false);

			// Limpar os campos após o registro
			setTagName('');
			setIsExpenseTag(false);
			setIsGainTag(false);
			setIsMandatoryExpense(false);
			setIsMandatoryGain(false);
		}
	}, [editingTagId, isExpenseTag, isGainTag, isEditing, tagName, isMandatoryExpense, isMandatoryGain]);

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
					() => {},
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
	const screenTitle = isEditing ? 'Editar tag' : 'Adição de nova tag';

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
									<View className={`${fieldContainerCardClassName} px-4 py-4 mb-4`}>
										<Text className={`${bodyText} text-sm leading-6`}>
											{isEditing
												? 'Atualize as informações da tag selecionada. As alterações serão aplicadas imediatamente.'
												: 'Registre uma nova tag para categorizar ganhos ou despesas. Ela ficará disponível para seleção nas demais telas do aplicativo.'}
										</Text>
									</View>

									<VStack className="mb-4">
										<Text className={`${bodyText} mb-1 ml-1 text-sm`}>
											Nome da tag que será registrada
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
										<Text className={`${bodyText} mb-1 ml-1 text-sm`}>Tipo de utilização</Text>
										<View className={`${fieldContainerCardClassName} px-4 py-4`}>
											<Text className={`${helperText} text-sm leading-6`}>
												Selecione se essa tag será usada para ganhos ou despesas. Apenas uma
												opção pode ficar ativa.
											</Text>
											<CheckboxGroup
												value={isExpenseTag ? ['expense'] : isGainTag ? ['gain'] : []}
												onChange={handleUsageSelection}
											>
												<VStack className="mt-4 gap-4">
													<Checkbox
														value="expense"
														isDisabled={isGainTag}
														className={checkboxClassName}
													>
														<CheckboxIndicator className={checkboxIndicatorClassName}>
															<CheckboxIcon as={CheckIcon} className={checkboxIconClassName} />
														</CheckboxIndicator>
														<CheckboxLabel className={`${checkboxLabelClassName} text-sm`}>
															Tag para despesas
														</CheckboxLabel>
													</Checkbox>

													<Checkbox
														value="gain"
														isDisabled={isExpenseTag}
														className={checkboxClassName}
													>
														<CheckboxIndicator className={checkboxIndicatorClassName}>
															<CheckboxIcon as={CheckIcon} className={checkboxIconClassName} />
														</CheckboxIndicator>
														<CheckboxLabel className={`${checkboxLabelClassName} text-sm`}>
															Tag para ganhos
														</CheckboxLabel>
													</Checkbox>
												</VStack>
											</CheckboxGroup>
										</View>
									</VStack>

									{isExpenseTag && (
										<VStack className="mb-4">
											<Text className={`${bodyText} mb-1 ml-1 text-sm`}>Gasto obrigatório</Text>
											<View className={`${fieldContainerCardClassName} px-4 py-4`}>
												<Text className={`${helperText} text-sm leading-6`}>
													Ative esta opção para que a tag seja listada na tela de gastos
													obrigatórios.
												</Text>
												<HStack className="items-center justify-between mt-4">
													<Text className={`${bodyText} text-sm`}>Marcar como obrigatório</Text>
													<Switch
														value={isMandatoryExpense}
														onValueChange={setIsMandatoryExpense}
														trackColor={{ false: '#CBD5E1', true: '#FACC15' }}
														thumbColor={isDarkMode ? '#020617' : '#FFFFFF'}
														ios_backgroundColor="#CBD5E1"
													/>
												</HStack>
											</View>
										</VStack>
									)}

									{isGainTag && (
										<VStack className="mb-4">
											<Text className={`${bodyText} mb-1 ml-1 text-sm`}>Ganho obrigatório</Text>
											<View className={`${fieldContainerCardClassName} px-4 py-4`}>
												<Text className={`${helperText} text-sm leading-6`}>
													Ative esta opção para que a tag seja listada na tela de ganhos
													obrigatórios.
												</Text>
												<HStack className="items-center justify-between mt-4">
													<Text className={`${bodyText} text-sm`}>Marcar como obrigatório</Text>
													<Switch
														value={isMandatoryGain}
														onValueChange={setIsMandatoryGain}
														trackColor={{ false: '#CBD5E1', true: '#FACC15' }}
														thumbColor={isDarkMode ? '#020617' : '#FFFFFF'}
														ios_backgroundColor="#CBD5E1"
													/>
												</HStack>
											</View>
										</VStack>
									)}

									<Button
										className={submitButtonClassName}
										onPress={registerTag}
										isDisabled={isSubmitting || !tagName.trim() || (!isExpenseTag && !isGainTag)}
									>
										{isSubmitting ? (
											<ButtonSpinner />
										) : (
											<ButtonText>{isEditing ? 'Atualizar Tag' : 'Registrar Tag'}</ButtonText>
										)}
									</Button>
								</VStack>
							</ScrollView>
						</View>
					</KeyboardAvoidingView>

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
