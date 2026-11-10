import { useBankAccountForm } from '@/hooks/useBankAccountForm';
import BankAccountFields from '@/components/uiverse/banks/bank-account-fields';
import BankFormFeedback from '@/components/uiverse/banks/bank-form-feedback';
import { Button,ButtonSpinner,ButtonText } from '@/components/ui/button';
import { Image } from '@/components/ui/image';
import { Input,InputField } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import BankActionsheetSelector,{ type BankActionsheetOption } from '@/components/uiverse/banks/bank-actionsheet-selector';
import Navigator from '@/components/uiverse/navigation/navigator';
import WebScreenHero from '@/components/uiverse/navigation/web-screen-hero';
import { ScreenDismissKeyboard } from '@/components/uiverse/shared/screen-dismiss-keyboard';
import WebSelectField from '@/components/web/shared/web-select-field';
import React from 'react';
import {
KeyboardAvoidingView,
Platform,
ScrollView,
StatusBar,
TextInput,
useWindowDimensions,
View,
} from 'react-native';
import { SafeAreaView,useSafeAreaInsets } from 'react-native-safe-area-context';

import LoginWallpaper from '@/assets/Background/wallpaper01.png';
import AddRegisterBankScreenIllustration from '@/assets/UnDraw/addRegisterBankScreen.svg';
import { useAppTheme } from '@/contexts/ThemeContext';
import {
LUMUS_BANK_COLOR_PRESETS,
LUMUS_CLASS_NAMES,
LUMUS_FORM_CLASS_NAMES,
LUMUS_LAYOUT_TOKENS,
} from '@/design-system/tokens';
import { WEB_DASHBOARD_CLASS_NAMES } from '@/design-system/web-dashboard';
import { WEB_EXPENSE_CLASS_NAMES } from '@/design-system/web-forms';

import { useBankIcons,type BankIconOption } from '@/hooks/useBankIcons';
import { useKeyboardAwareScroll } from '@/hooks/useKeyboardAwareScroll';

import BankOpeningBalanceFields from '@/components/uiverse/banks/bank-opening-balance-fields';
import { navigateToHomeDashboard } from '@/utils/navigation';

type FocusableInputKey = 'bank-name';
export default function AddRegisterBankScreenWeb() {
	const {
		isDarkMode,
	} = useAppTheme();
	const insets = useSafeAreaInsets();
	const { height: windowHeight } = useWindowDimensions();
	const heroHeight = Math.max(
		windowHeight * LUMUS_LAYOUT_TOKENS.heroViewportRatio,
		LUMUS_LAYOUT_TOKENS.heroMinimumHeight,
	) + insets.top;
	const webDashboardClassNames = WEB_DASHBOARD_CLASS_NAMES;
	const webExpenseClassNames = WEB_EXPENSE_CLASS_NAMES;
	const cardBackground = LUMUS_CLASS_NAMES.surfaceFill;
	const bodyText = LUMUS_CLASS_NAMES.body;
	const helperText = LUMUS_CLASS_NAMES.helper;
	const inputField = LUMUS_CLASS_NAMES.inputText;
	const fieldBankContainerClassName = `${LUMUS_CLASS_NAMES.control} ${LUMUS_CLASS_NAMES.focusRing}`;
	const fieldContainerClassName = LUMUS_FORM_CLASS_NAMES.input;
	const submitButtonClassName = LUMUS_CLASS_NAMES.primaryButton;
	const submitButtonTextClassName = LUMUS_CLASS_NAMES.primaryButtonText;
	const { iconOptions, defaultBankIcon } = useBankIcons();
    const form=useBankAccountForm();
    const {nameBank,setNameBank,isSubmitting,selectedColor,setSelectedColor,selectedBankIconKey,setSelectedBankIconKey,editingBankId,isEditing,loadedBankId,bankLoadError,isLoadingBank,retryBankLoad,openingBalanceInCents,setOpeningBalanceInCents,overdraftReason,setOverdraftReason,registerBank,nameValidationError,setNameValidationError}=form;
    const bankNameInputRef=React.useRef<TextInput|null>(null);
    const colorOptions=React.useMemo(()=>{
        const options:Array<{label:string;value:string}>=LUMUS_BANK_COLOR_PRESETS.map(option=>({label:option.label,value:option.value}));
        if(selectedColor&&!options.some(option=>option.value===selectedColor))options.push({label:'Cor atual',value:selectedColor});
        return options;
    },[selectedColor]);
    const colorSelectOptions=React.useMemo(()=>[{value:'no-color',label:'Sem cor'},...colorOptions],[colorOptions]);
    const selectedBankIcon=React.useMemo<BankIconOption>(()=>iconOptions.find(option=>option.key===selectedBankIconKey)??defaultBankIcon,[iconOptions,selectedBankIconKey,defaultBankIcon]);
    const bankIconSelectorOptions=React.useMemo<BankActionsheetOption[]>(()=>iconOptions.map(option=>({id:option.key,name:option.label,iconKey:option.key})),[iconOptions]);
    const selectedBankIconOption=React.useMemo<BankActionsheetOption>(()=>({id:selectedBankIcon.key,name:selectedBankIcon.label,iconKey:selectedBankIcon.key,colorHex:selectedColor}),[selectedBankIcon,selectedColor]);
    const handleBankIconSelect=React.useCallback((iconKey:string)=>{
        if(iconKey!==selectedBankIconKey){setSelectedColor(null);form.setInstitutionName(iconKey==='outro-banco'?'':iconOptions.find(option=>option.key===iconKey)?.label??'');}
        setSelectedBankIconKey(iconKey);
    },[selectedBankIconKey,iconOptions,form.setInstitutionName]);
    const handleBackToHome=React.useCallback(()=>{navigateToHomeDashboard();return true;},[]);

	const keyboardScrollOffset = React.useCallback((_key: FocusableInputKey) => 140, []);
	const getInputRef = React.useCallback(
		(key: FocusableInputKey) => (key === 'bank-name' ? bankNameInputRef : null),
		[],
	);
	const { scrollViewRef, contentBottomPadding, handleInputFocus, handleScroll, scrollEventThrottle } =
		useKeyboardAwareScroll<FocusableInputKey>({ getInputRef, keyboardScrollOffset });

	const screenTitle = isEditing ? 'Editar banco' : 'Adição de um novo banco';

	return (
		<ScreenDismissKeyboard>
			<SafeAreaView className={`${LUMUS_CLASS_NAMES.screen} web:w-screen`} edges={['left', 'right', 'bottom']}>
				<StatusBar translucent backgroundColor="transparent" barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
				<View className={`${LUMUS_CLASS_NAMES.screen} web:w-screen`}>
					<KeyboardAvoidingView
						behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
						keyboardVerticalOffset={Platform.OS === 'ios' ? 120 : 0}
						className="flex-1"
					>
						<View className="flex-1 web:w-screen">
							<View className={`${webDashboardClassNames.hero} ${cardBackground}`} style={{ height: heroHeight }}>
								<Image
									source={LoginWallpaper}
									alt="Plano de fundo da tela de cadastro de banco"
									className="absolute h-full w-full rounded-b-3xl"
									resizeMode="cover"
								/>
								<WebScreenHero
									title={screenTitle}
									Illustration={AddRegisterBankScreenIllustration}
									isDarkMode={isDarkMode}
									topPadding={insets.top + 24}
								/>
							</View>

							<ScrollView
								ref={scrollViewRef}
								className={`${webDashboardClassNames.sheet} ${webDashboardClassNames.webSheet} ${cardBackground}`}
								style={{ marginTop: heroHeight - 64 }}
								contentContainerStyle={{ paddingBottom: Math.max(40, contentBottomPadding - 96) }}
								keyboardShouldPersistTaps="handled"
								keyboardDismissMode="on-drag"
								onScroll={handleScroll}
								scrollEventThrottle={scrollEventThrottle}
							>
								<VStack className={`${webDashboardClassNames.webContentFrame} ${webDashboardClassNames.webContentPadding} mt-4 gap-4`}>
									{bankLoadError ? <Text className={LUMUS_CLASS_NAMES.errorText}>{bankLoadError} Confira o cadastro antes de enviar.</Text> : isEditing && loadedBankId !== editingBankId ? <Text className={LUMUS_CLASS_NAMES.helper}>Carregando cadastro atual...</Text> : null}
									<View className="w-full flex-row flex-wrap gap-4">
										<VStack className={webExpenseClassNames.fieldFull}>
											<Text className={`${webExpenseClassNames.fieldLabel} ${bodyText}`}>Nome da conta</Text>
											<Input isDisabled={isSubmitting||isLoadingBank||(!isEditing&&!!form.saved)} isInvalid={Boolean(nameValidationError)} className={`${fieldContainerClassName} ${webExpenseClassNames.fieldInput}`}>
												<InputField
													ref={bankNameInputRef as any}
													nativeID="bank-name"
													accessibilityLabel="Nome da conta"
													placeholder="Ex.: Banco do Brasil, Caixa Econômica ou Itaú…"
													autoComplete="off"
													autoCapitalize="words"
													autoCorrect={false}
													value={nameBank}
													onChangeText={value => {
														setNameBank(value);
														setNameValidationError(null);
													}}
													className={inputField}
													onFocus={() => handleInputFocus('bank-name')}
													onSubmitEditing={registerBank}
												/>
											</Input>
											{nameValidationError ? (
												<Text className={LUMUS_CLASS_NAMES.errorText} accessibilityRole="alert">
													{nameValidationError}
												</Text>
											) : null}
										</VStack>

										<VStack className={webExpenseClassNames.fieldFull}>
											<Text className={`${webExpenseClassNames.fieldLabel} ${bodyText}`}>Instituição financeira</Text>
											<BankActionsheetSelector
												options={bankIconSelectorOptions}
												selectedId={selectedBankIconKey}
												selectedLabel={selectedBankIcon.label}
												selectedOption={selectedBankIconOption}
												onSelect={option => handleBankIconSelect(option.id)}
												isDisabled={isSubmitting||isLoadingBank||(!isEditing&&!!form.saved)}
												isDarkMode={isDarkMode}
												bodyTextClassName={bodyText}
												helperTextClassName={helperText}
												triggerClassName={fieldBankContainerClassName}
												placeholder="Selecione o ícone do banco"
												sheetTitle="Escolha o ícone do banco"
												triggerHint="Selecione uma instituição para identificar este banco."
												disabledHint="Aguarde o salvamento do banco."
												accessibilityLabel="Escolher ícone do banco"
											/>
										</VStack>

										{selectedBankIconKey === 'outro-banco' ? (
											<VStack className={webExpenseClassNames.fieldFull}>
												<Text className={`${webExpenseClassNames.fieldLabel} ${bodyText}`}>Cor do banco (opcional)</Text>
												<WebSelectField
													options={colorSelectOptions}
													value={selectedColor ?? 'no-color'}
													onChange={value => setSelectedColor(value === 'no-color' ? null : value)}
													placeholder="Selecione uma cor para o cartão…"
													isDisabled={isSubmitting||isLoadingBank||(!isEditing&&!!form.saved)}
													accessibilityLabel="Cor do banco"
												/>
											</VStack>
										) : null}
									</View>

									{isLoadingBank ? <Text className={helperText}>Conferindo o cadastro bancário...</Text> : null}
									{bankLoadError ? (
										<VStack className="gap-3">
											<Text className={LUMUS_CLASS_NAMES.errorText} accessibilityRole="alert">{bankLoadError}</Text>
											<Button variant="outline" action="secondary" onPress={retryBankLoad}>
												<ButtonText>Tentar carregar novamente</ButtonText>
											</Button>
										</VStack>
									) : null}
									<BankAccountFields institutionName={form.institutionName} onInstitutionName={form.setInstitutionName} accountType={form.accountType} onAccountType={form.setAccountType} date={form.openingDate} onDate={form.setOpeningDate} isEditing={isEditing} customInstitution={selectedBankIconKey==='outro-banco'} disabled={isSubmitting||isLoadingBank||(!isEditing&&!!form.saved)} />
                                {!isEditing && !form.saved ? (
										<BankOpeningBalanceFields valueInCents={openingBalanceInCents} onValueChange={setOpeningBalanceInCents}
											reason={overdraftReason} onReasonChange={setOverdraftReason} disabled={isSubmitting||isLoadingBank||(!isEditing&&!!form.saved)} />
									) : null}
									{isEditing ? <Text className={helperText}>Editar nome, ícone ou cor preserva o saldo e o histórico do banco.</Text> : null}

									<BankFormFeedback error={form.error} saved={form.saved} isEditing={isEditing} busy={isSubmitting} onAnother={form.startAnother} canWrite={form.canWrite}/>
                                <Button
										className={`${submitButtonClassName} web:mt-2 web:h-12`}
										onPress={registerBank}
										isDisabled={isSubmitting || isLoadingBank || !form.canWrite || (!isEditing&&!!form.saved) || Boolean(bankLoadError) || (isEditing && loadedBankId !== editingBankId && !bankLoadError)}
									>
										{isSubmitting ? (
											<>
												<ButtonSpinner />
												<ButtonText className={submitButtonTextClassName}>Salvando…</ButtonText>
											</>
										) : (
											<ButtonText className={submitButtonTextClassName}>
												{isEditing ? 'Atualizar banco' : 'Registrar banco'}
											</ButtonText>
										)}
									</Button>
								</VStack>
							</ScrollView>
						</View>
					</KeyboardAvoidingView>

					<View className="shrink-0">
						<Navigator defaultValue={2} onHardwareBack={handleBackToHome} />
					</View>
				</View>
			</SafeAreaView>
		</ScreenDismissKeyboard>
	);
}
