import { useBankAccountForm } from '@/hooks/useBankAccountForm';
import BankAccountFields from '@/components/uiverse/banks/bank-account-fields';
import BankFormFeedback from '@/components/uiverse/banks/bank-form-feedback';
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
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';

import Navigator from '@/components/uiverse/navigation/navigator';
import WebScreenHero from '@/components/uiverse/navigation/web-screen-hero';
import { BANK_ICON_OPTIONS,BankIcon } from '@/hooks/useBankIcons';

import LoginWallpaper from '@/assets/Background/wallpaper01.png';
import { navigateToHomeDashboard } from '@/utils/navigation';

import AddRegisterBankScreenIllustration from '../../assets/UnDraw/addRegisterBankScreen.svg';

import { LUMUS_BANK_COLOR_PRESETS,LUMUS_CLASS_NAMES,LUMUS_FORM_CLASS_NAMES } from '@/design-system/tokens';
import { useKeyboardAwareScroll } from '@/hooks/useKeyboardAwareScroll';
import { useScreenStyles } from '@/hooks/useScreenStyle';

import BankOpeningBalanceFields from '@/components/uiverse/banks/bank-opening-balance-fields';
import { ScreenDismissKeyboard } from '@/components/uiverse/shared/screen-dismiss-keyboard';
import { Check,ChevronDown } from 'lucide-react-native';

type FocusableInputKey = 'bank-name';

export default function AddRegisterBankScreen() {

    const {
		isDarkMode,
		surfaceBackground,
		cardBackground,
		bodyText,
		helperText,
		inputField,
		fieldBankContainerClassName,
		fieldContainerClassName,
		submitButtonClassName,
		heroHeight,
		insets,
		webDashboardClassNames,
	} = useScreenStyles();

    const form = useBankAccountForm();
    const {nameBank,setNameBank,isSubmitting,selectedColor,setSelectedColor,selectedBankIconKey,setSelectedBankIconKey,editingBankId,isEditing,loadedBankId,bankLoadError,isLoadingBank,retryBankLoad,openingBalanceInCents,setOpeningBalanceInCents,overdraftReason,setOverdraftReason,registerBank,nameValidationError,setNameValidationError}=form;
    const [isBankIconSheetOpen,setIsBankIconSheetOpen]=React.useState(false);
    const bankNameInputRef=React.useRef<import('react').ComponentRef<typeof TextInput>|null>(null);
    const keyboardScrollOffset=React.useCallback((_key:FocusableInputKey)=>140,[]);
    const initialColorHex=selectedColor;
    const colorOptions=React.useMemo(()=>{
        const options:Array<{label:string;value:string}>=LUMUS_BANK_COLOR_PRESETS.map(option=>({label:option.label,value:option.value}));
        if(selectedColor&&!options.some(option=>option.value===selectedColor))options.push({label:'Cor atual',value:selectedColor});
        return options;
    },[selectedColor]);
    const handleBackToHome=React.useCallback(()=>{navigateToHomeDashboard();return true;},[]);
    const selectedBankIcon=React.useMemo(()=>BANK_ICON_OPTIONS.find(option=>option.key===selectedBankIconKey)??BANK_ICON_OPTIONS.find(option=>option.key==='outro-banco')!,[selectedBankIconKey]);
    const handleBankIconSelect=React.useCallback((iconKey:string)=>{
        if(iconKey!==selectedBankIconKey){setSelectedColor(null);form.setInstitutionName(iconKey==='outro-banco'?'':BANK_ICON_OPTIONS.find(option=>option.key===iconKey)?.label??'');}
        setSelectedBankIconKey(iconKey);
    },[selectedBankIconKey,form.setInstitutionName]);

    const getInputRef = React.useCallback(
        (key: FocusableInputKey) => {
            switch (key) {
                case 'bank-name':
                    return bankNameInputRef;
                default:
                    return null;
            }
        },
        [],
    );

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
    const screenTitle = isEditing ? 'Editar banco' : 'Adição de um novo banco';

    return (
        <ScreenDismissKeyboard>
        <SafeAreaView
            className="flex-1 web:w-screen"
            edges={['left', 'right', 'bottom']}
            style={{ backgroundColor: surfaceBackground }}
        >
			<StatusBar
                barStyle={isDarkMode ? 'light-content' : 'dark-content'}
            />
			<View className="flex-1 web:w-screen" style={{ backgroundColor: surfaceBackground }}>
				<KeyboardAvoidingView
					behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
					keyboardVerticalOffset={Platform.OS === 'ios' ? 120 : 0}
					className="flex-1"
				>
                    <View className="flex-1 web:w-screen" style={{ backgroundColor: surfaceBackground }}>
                        <View
                            className={`absolute top-0 left-0 right-0 web:w-screen ${cardBackground}`}
                            style={{ height: heroHeight }}
                        >
                            <Image
                                source={LoginWallpaper}
                                alt="Background da tela de cadastro de banco"
                                className="w-full h-full rounded-b-3xl absolute"
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
                            keyboardShouldPersistTaps="handled"
                            keyboardDismissMode="on-drag"
                            className={`flex-1 rounded-t-3xl ${cardBackground} px-6 pb-1 ${webDashboardClassNames.webSheet}`}
                            style={{ marginTop: heroHeight - 64 }}
                            contentContainerStyle={{ paddingBottom: Math.max(32, contentBottomPadding - 108) }}
                            onScroll={handleScroll}
                            scrollEventThrottle={scrollEventThrottle}
                        >
                            <VStack className={`justify-between mt-4 ${webDashboardClassNames.webContentFrame} ${webDashboardClassNames.webContentPadding}`}>
                                {bankLoadError ? <Text className={LUMUS_CLASS_NAMES.errorText}>{bankLoadError} Confira o cadastro antes de enviar.</Text> : isEditing && loadedBankId !== editingBankId ? <Text className={LUMUS_CLASS_NAMES.helper}>Carregando cadastro atual...</Text> : null}
                                <VStack className="mb-4">
                                    <Text className={LUMUS_FORM_CLASS_NAMES.label}>Nome da conta</Text>
                                    <Input isDisabled={isSubmitting||isLoadingBank||(!isEditing&&!!form.saved)} className={fieldContainerClassName}>
                                        <InputField
                                            ref={bankNameInputRef as any}
                                            accessibilityLabel="Nome da conta"
                                            placeholder="Ex: Conta principal"
                                            value={nameBank}
                                            onChangeText={setNameBank}
                                            className={inputField}
                                            onFocus={() => handleInputFocus('bank-name')}
                                        />
                                    </Input>
                                </VStack>

                                <VStack className="mb-4">
                                    <Text className={LUMUS_FORM_CLASS_NAMES.label}>Instituição financeira</Text>
                                    <Pressable
                                        onPress={() => setIsBankIconSheetOpen(true)}
                                        disabled={isSubmitting||isLoadingBank||(!isEditing&&!!form.saved)}
                                        accessibilityRole="button"
                                        accessibilityLabel="Escolher ícone do banco"
                                        className={`${fieldBankContainerClassName} px-4 py-3`}
                                    >
                                        <HStack className="items-center justify-between gap-3">
                                            <HStack className="min-w-0 flex-1 items-center gap-3">
                                                <View className="h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                                                    <BankIcon
                                                        iconKey={selectedBankIcon?.key}
                                                        name={nameBank}
                                                        colorHex={selectedColor}
                                                        size={32}
                                                    />
                                                </View>
                                                <VStack className="min-w-0 flex-1">
                                                    <Text className={`${bodyText} text-sm font-medium`} numberOfLines={1}>
                                                        {selectedBankIcon?.label ?? 'Outro banco'}
                                                    </Text>
                                                    <Text className={`${helperText} text-xs`} numberOfLines={1}>
                                                        Toque para escolher um ícone brasileiro.
                                                    </Text>
                                                </VStack>
                                            </HStack>
                                            <ChevronDown size={18} color={isDarkMode ? '#FCD34D' : '#D97706'} />
                                        </HStack>
                                    </Pressable>
                                </VStack>

                                {selectedBankIconKey === 'outro-banco' ? (
                                    <VStack className="mb-4">
                                        <Text className={LUMUS_FORM_CLASS_NAMES.label}>Cor do banco (Opcional)</Text>
                                        <Select
                                            selectedValue={selectedColor ?? undefined}
                                            onValueChange={value => setSelectedColor(value === 'no-color' ? null : value)}
                                        >
                                            <SelectTrigger variant="outline" size="md" className={fieldContainerClassName}>
                                                <SelectInput
                                                    placeholder="Cor do banco (opcional), apenas para fins visuais"
                                                    className={inputField}
                                                />
                                                <SelectIcon />
                                            </SelectTrigger>
                                            <SelectPortal>
                                                <SelectBackdrop />
                                                <SelectContent>
                                                    <SelectDragIndicatorWrapper>
                                                        <SelectDragIndicator />
                                                    </SelectDragIndicatorWrapper>
                                                    <SelectItem label="Sem cor" value="no-color" />
                                                    {colorOptions.map(option => (
                                                        <SelectItem
                                                            key={option.value}
                                                            label={`${option.label} (${option.value})`}
                                                            value={option.value}
                                                        />
                                                    ))}
                                                </SelectContent>
                                            </SelectPortal>
                                        </Select>
                                    </VStack>
                                ) : null}

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
                                    isDisabled={isSubmitting||isLoadingBank||!form.canWrite||!!bankLoadError||(!isEditing&&!!form.saved)||(isEditing&&loadedBankId!==editingBankId)}
                                >
                                    {isSubmitting ? (
                                        <ButtonSpinner />
                                    ) : (
                                        <ButtonText>
                                            {isEditing ? 'Atualizar Banco' : 'Registrar Banco'}
                                        </ButtonText>
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
                    <Navigator defaultValue={2} onHardwareBack={handleBackToHome} />
                </View>
            </View>

            <Actionsheet
                isOpen={isBankIconSheetOpen}
                onClose={() => setIsBankIconSheetOpen(false)}
                snapPoints={[72]}
            >
                <ActionsheetBackdrop />
                <ActionsheetContent className={isDarkMode ? 'bg-slate-950' : 'bg-white'}>
                    <ActionsheetDragIndicatorWrapper>
                        <ActionsheetDragIndicator />
                    </ActionsheetDragIndicatorWrapper>
                    <VStack className="w-full px-4 pb-3 pt-6 gap-1">
                        <Heading size="lg" className={isDarkMode ? 'text-slate-100' : 'text-slate-900'}>
                            Escolha o ícone do banco
                        </Heading>
                        <Text className={`${helperText} text-sm`}>
                            Selecione uma instituição ou use a opção genérica.
                        </Text>
                    </VStack>
                    <ActionsheetScrollView
                        className="w-full flex-1"
                        keyboardShouldPersistTaps="handled"
                        contentContainerStyle={{ paddingBottom: Math.max(96, insets.bottom + 72) }}
                    >
                        <VStack className="px-2 pb-2">
                            {BANK_ICON_OPTIONS.map(option => {
                                const isSelected = option.key === selectedBankIconKey;
                                return (
                                    <ActionsheetItem
                                        key={option.key}
                                        onPress={() => {
                                            handleBankIconSelect(option.key);
                                            setIsBankIconSheetOpen(false);
                                        }}
                                        className={isSelected ? (isDarkMode ? 'bg-slate-900 rounded-2xl' : 'bg-amber-50 rounded-2xl') : ''}
                                    >
                                        <HStack className="items-center gap-3 w-full">
                                            <View className="h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                                                <BankIcon iconKey={option.key} size={32} />
                                            </View>
                                            <VStack className="min-w-0 flex-1 items-start justify-center">
                                                <ActionsheetItemText className={isDarkMode ? 'mx-0 text-slate-100' : 'mx-0 text-slate-900'}>
                                                    {option.label}
                                                </ActionsheetItemText>
                                                {isSelected ? (
                                                    <Text className="text-xs text-amber-500 dark:text-amber-300">
                                                        Selecionado atualmente
                                                    </Text>
                                                ) : null}
                                            </VStack>
                                            {isSelected ? <Check size={18} color={isDarkMode ? '#FCD34D' : '#D97706'} /> : null}
                                        </HStack>
                                    </ActionsheetItem>
                                );
                            })}
                        </VStack>
                    </ActionsheetScrollView>
                </ActionsheetContent>
            </Actionsheet>
		</SafeAreaView>
        </ScreenDismissKeyboard>
    );
}
