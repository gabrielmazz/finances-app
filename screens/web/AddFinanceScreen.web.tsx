import React from 'react';
import {
	Image as RNImage,
	KeyboardAvoidingView,
	Platform,
	ScrollView,
	StatusBar,
	Text,
	useWindowDimensions,
	View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';

import { Button, ButtonSpinner, ButtonText } from '@/components/ui/button';
import { HStack } from '@/components/ui/hstack';
import { Input, InputField } from '@/components/ui/input';
import { VStack } from '@/components/ui/vstack';
import BankActionsheetSelector, { type BankActionsheetOption } from '@/components/uiverse/banks/bank-actionsheet-selector';
import DatePickerField from '@/components/uiverse/shared/date-picker';
import Navigator from '@/components/uiverse/navigation/navigator';
import { showNotifierAlert, type NotifierAlertType } from '@/components/uiverse/feedback/notifier-alert';
import AnimatedContent from '@/components/web/motion/AnimatedContent';
import Grainient from '@/components/web/visuals/Grainient';
import StrokeText from '@/components/web/visuals/StrokeText';
import WebSelectField from '@/components/web/shared/web-select-field';
import AddFinancialIllustration from '../../assets/UnDraw/addFinancialScreen.svg';
import LoginWallpaper from '@/assets/Background/wallpaper01.png';
import {
	LUMUS_CLASS_NAMES,
	LUMUS_FONT_STACKS,
	LUMUS_FORM_CLASS_NAMES,
	LUMUS_HERO_COLORS,
	LUMUS_LAYOUT_TOKENS,
	LUMUS_RUNTIME_COLORS,
} from '@/design-system/tokens';
import { WEB_DASHBOARD_CLASS_NAMES } from '@/design-system/web-dashboard';
import { WEB_EXPENSE_CLASS_NAMES } from '@/design-system/web-forms';
import { auth } from '@/FirebaseConfig';
import { getBanksWithUsersByPersonFirebase, getLegacyBankBalanceInCentsFirebase } from '@/functions/BankFirebase';
import { addFinanceInvestmentFirebase } from '@/functions/FinancesFirebase';
import { useKeyboardAwareScroll } from '@/hooks/useKeyboardAwareScroll';
import { usePostSubmitBehavior } from '@/hooks/usePostSubmitBehavior';
import { useAppTheme } from '@/contexts/ThemeContext';
import { redemptionTermLabels, type RedemptionTerm } from '@/utils/finance';
import { parsePercentageToBasisPoints } from '@/utils/investmentPortfolio';
import { APP_ROUTE_PATHS, navigateToHomeDashboard, navigateToRoute } from '@/utils/navigation';

const redemptionOptions: ReadonlyArray<{ value: RedemptionTerm; label: string }> = [
	{ value: 'anytime', label: redemptionTermLabels.anytime },
	{ value: '1m', label: redemptionTermLabels['1m'] },
	{ value: '3m', label: redemptionTermLabels['3m'] },
	{ value: '6m', label: redemptionTermLabels['6m'] },
	{ value: '1y', label: redemptionTermLabels['1y'] },
	{ value: '2y', label: redemptionTermLabels['2y'] },
	{ value: '3y', label: redemptionTermLabels['3y'] },
];

type FocusableInputKey = 'investment-name' | 'initial-value' | 'cdi';

const formatCurrencyBRL = (valueInCents: number) =>
	new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valueInCents / 100);

const formatDateToBR = (date: Date) => {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${day}/${month}/${year}`;
};

const parseDateFromBR = (value: string) => {
	const [day, month, year] = value.split('/').map(Number);
	if (!day || !month || !year || month > 12 || year < 1900) return null;
	const date = new Date(year, month - 1, day);
	return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
};

const mergeDateWithCurrentTime = (date: Date) => {
	const now = new Date();
	const result = new Date(date);
	result.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
	return result;
};

export default function AddFinanceScreenWeb() {
	const { width, height } = useWindowDimensions();
	const compact = width < 720;
	const isDesktop = width >= 1024;
	const { isDarkMode } = useAppTheme();
	const insets = useSafeAreaInsets();
	const runtimeColors = isDarkMode ? LUMUS_RUNTIME_COLORS.dark : LUMUS_RUNTIME_COLORS.light;
	const surfaceBackground = runtimeColors.canvas;
	const heroHeight = Math.max(
		Math.max(height * LUMUS_LAYOUT_TOKENS.heroViewportRatio, LUMUS_LAYOUT_TOKENS.heroMinimumHeight),
		LUMUS_LAYOUT_TOKENS.heroMinimumHeight,
	) + insets.top;
	const cardBackground = 'bg-white dark:bg-slate-950';
	const bodyText = LUMUS_CLASS_NAMES.body;
	const helperText = LUMUS_CLASS_NAMES.helper;
	const inputField = LUMUS_CLASS_NAMES.inputText;
	const fieldContainerClassName = LUMUS_FORM_CLASS_NAMES.input;
	const fieldBankContainerClassName = `${LUMUS_CLASS_NAMES.control} ${LUMUS_CLASS_NAMES.focusRing}`;
	const submitButtonClassName = LUMUS_CLASS_NAMES.primaryButton;
	const submitButtonTextClassName = LUMUS_CLASS_NAMES.primaryButtonText;
	const applyPostSubmitBehavior = usePostSubmitBehavior('addFinance');
	const [investmentName, setInvestmentName] = React.useState('');
	const [initialValueInput, setInitialValueInput] = React.useState('');
	const [initialValueInCents, setInitialValueInCents] = React.useState<number | null>(null);
	const [cdiInput, setCdiInput] = React.useState('');
	const [investmentDate, setInvestmentDate] = React.useState(formatDateToBR(new Date()));
	const [selectedRedemptionTerm, setSelectedRedemptionTerm] = React.useState<RedemptionTerm>('anytime');
	const [isSaving, setIsSaving] = React.useState(false);
	const [hasSavedOnce, setHasSavedOnce] = React.useState(false);
	const [bankOptions, setBankOptions] = React.useState<BankActionsheetOption[]>([]);
	const [isLoadingBanks, setIsLoadingBanks] = React.useState(false);
	const [selectedBankId, setSelectedBankId] = React.useState<string | null>(null);
	const [currentBankBalanceInCents, setCurrentBankBalanceInCents] = React.useState<number | null>(null);
	const [isLoadingBankBalance, setIsLoadingBankBalance] = React.useState(false);
	const submitLockRef = React.useRef(false);
	const investmentNameInputRef = React.useRef<any>(null);
	const initialValueInputRef = React.useRef<any>(null);
	const cdiInputRef = React.useRef<any>(null);

	const getInputRef = React.useCallback((key: FocusableInputKey) => {
		if (key === 'investment-name') return investmentNameInputRef;
		if (key === 'initial-value') return initialValueInputRef;
		return cdiInputRef;
	}, []);
	const keyboardScrollOffset = React.useCallback((key: FocusableInputKey) => (key === 'cdi' ? 140 : 120), []);
	const { scrollViewRef, contentBottomPadding, handleInputFocus, handleScroll, scrollEventThrottle } =
		useKeyboardAwareScroll<FocusableInputKey>({
			getInputRef,
			keyboardScrollOffset,
			minBottomPadding: 32,
		});

	const showScreenAlert = React.useCallback(
		(description: string, type: NotifierAlertType = 'error') => {
			showNotifierAlert({ description, type, isDarkMode });
		},
		[isDarkMode],
	);
	const parsedInvestmentDate = React.useMemo(() => parseDateFromBR(investmentDate), [investmentDate]);
	const parsedCdiInBasisPoints = React.useMemo(() => parsePercentageToBasisPoints(cdiInput), [cdiInput]);
	const parsedCdi = React.useMemo(
		() => (typeof parsedCdiInBasisPoints === 'number' ? parsedCdiInBasisPoints / 100 : NaN),
		[parsedCdiInBasisPoints],
	);
	const hasInvestmentName = investmentName.trim().length > 0;
	const hasInitialValue = typeof initialValueInCents === 'number' && initialValueInCents > 0;
	const hasValidInvestmentDate = Boolean(parsedInvestmentDate);
	const hasValidCdi = typeof parsedCdiInBasisPoints === 'number' && parsedCdiInBasisPoints > 0;
	const isInitialValueDisabled = !hasInvestmentName || isSaving;
	const isInvestmentDateDisabled = !hasInvestmentName || !hasInitialValue || isSaving;
	const isCdiDisabled = !hasInvestmentName || !hasInitialValue || !hasValidInvestmentDate || isSaving;
	const isRedemptionTermDisabled = !hasInvestmentName || !hasInitialValue || !hasValidInvestmentDate || !hasValidCdi || isSaving;
	const isBankSelectionDisabled =
		isLoadingBanks || bankOptions.length === 0 || !hasInvestmentName || !hasInitialValue || !hasValidInvestmentDate || !hasValidCdi || isSaving;
	const isBankBalanceNegative = typeof currentBankBalanceInCents === 'number' && currentBankBalanceInCents < 0;
	const isInitialValueAboveCurrentBalance =
		typeof currentBankBalanceInCents === 'number' && typeof initialValueInCents === 'number' && initialValueInCents > currentBankBalanceInCents;
	const hasValidBalance = React.useMemo(() => {
		if (!hasInitialValue || (selectedBankId && isLoadingBankBalance)) return false;
		return typeof currentBankBalanceInCents !== 'number' || (currentBankBalanceInCents >= 0 && !isInitialValueAboveCurrentBalance);
	}, [currentBankBalanceInCents, hasInitialValue, isInitialValueAboveCurrentBalance, isLoadingBankBalance, selectedBankId]);
	const isFormValid = hasInvestmentName && hasInitialValue && hasValidInvestmentDate && hasValidCdi && Boolean(selectedBankId) && hasValidBalance;

	const resetForm = React.useCallback(() => {
		setInvestmentName('');
		setInitialValueInput('');
		setInitialValueInCents(null);
		setCdiInput('');
		setInvestmentDate(formatDateToBR(new Date()));
		setSelectedRedemptionTerm('anytime');
		setSelectedBankId(null);
		setCurrentBankBalanceInCents(null);
		setHasSavedOnce(false);
	}, []);
	const handleInitialValueChange = React.useCallback((value: string) => {
		const digitsOnly = value.replace(/\D/g, '');
		if (!digitsOnly) {
			setInitialValueInput('');
			setInitialValueInCents(null);
			setHasSavedOnce(false);
			return;
		}
		const valueInCents = Number.parseInt(digitsOnly, 10);
		setInitialValueInCents(valueInCents);
		setInitialValueInput(formatCurrencyBRL(valueInCents));
		setHasSavedOnce(false);
	}, []);

	const loadBanks = React.useCallback(async () => {
		const currentUser = auth.currentUser;
		if (!currentUser) {
			showScreenAlert('Usuário não autenticado. Faça login novamente.');
			return;
		}
		setIsLoadingBanks(true);
		try {
			const response = await getBanksWithUsersByPersonFirebase(currentUser.uid);
			if (!response.success || !Array.isArray(response.data)) throw new Error('Erro ao carregar bancos.');
			const options = (response.data as Array<Record<string, unknown>>).map(bank => ({
				id: String(bank.id),
				name: typeof bank.name === 'string' && bank.name.trim() ? bank.name.trim() : 'Banco sem nome',
				iconKey: typeof bank.iconKey === 'string' ? bank.iconKey : null,
				colorHex: typeof bank.colorHex === 'string' ? bank.colorHex : null,
			}));
			setBankOptions(options);
			setSelectedBankId(current => (current && options.some(bank => bank.id === current) ? current : null));
			if (options.length === 0) showScreenAlert('Cadastre um banco antes de registrar investimentos.', 'warn');
		} catch (error) {
			console.error('Erro ao carregar bancos:', error);
			showScreenAlert('Não foi possível carregar os bancos.');
		} finally {
			setIsLoadingBanks(false);
		}
	}, [showScreenAlert]);

	useFocusEffect(React.useCallback(() => {
		void loadBanks();
	}, [loadBanks]));

	React.useEffect(() => {
		if (!selectedBankId) {
			setCurrentBankBalanceInCents(null);
			setIsLoadingBankBalance(false);
			return;
		}
		let isMounted = true;
		setIsLoadingBankBalance(true);
		setCurrentBankBalanceInCents(null);
		void (async () => {
			try {
				const currentUser = auth.currentUser;
				if (!currentUser) throw new Error('Usuário não autenticado.');
				const result = await getLegacyBankBalanceInCentsFirebase({ personId: currentUser.uid, bankId: selectedBankId });
				if (!result.success) throw result.error;
				if (isMounted) setCurrentBankBalanceInCents(result.data);
			} catch (error) {
				console.error('Erro ao carregar saldo do banco:', error);
				if (isMounted) showScreenAlert('Não foi possível carregar o saldo atual do banco.');
			} finally {
				if (isMounted) setIsLoadingBankBalance(false);
			}
		})();
		return () => {
			isMounted = false;
		};
	}, [selectedBankId, showScreenAlert]);

	const handleSaveInvestment = React.useCallback(async () => {
		if (submitLockRef.current || isSaving || !isFormValid || !selectedBankId) return;
		const currentUser = auth.currentUser;
		if (!currentUser) {
			showScreenAlert('Usuário não autenticado. Faça login novamente.');
			return;
		}
		if (isLoadingBankBalance) {
			showScreenAlert('Aguarde o saldo do banco terminar de carregar.', 'warn');
			return;
		}
		if (isBankBalanceNegative || isInitialValueAboveCurrentBalance) {
			showScreenAlert('Saldo insuficiente para registrar este investimento.', 'warn');
			return;
		}
		if (!initialValueInCents || !parsedInvestmentDate || !parsedCdiInBasisPoints || !Number.isFinite(parsedCdi)) {
			showScreenAlert('Revise os dados do investimento antes de salvar.', 'warn');
			return;
		}
		submitLockRef.current = true;
		setIsSaving(true);
		try {
			const result = await addFinanceInvestmentFirebase({
				name: investmentName.trim(),
				initialValueInCents,
				currentValueInCents: initialValueInCents,
				cdiPercentage: parsedCdi,
				cdiPercentageInBasisPoints: parsedCdiInBasisPoints,
				redemptionTerm: selectedRedemptionTerm,
				bankId: selectedBankId,
				personId: currentUser.uid,
				date: mergeDateWithCurrentTime(parsedInvestmentDate),
				bankNameSnapshot: bankOptions.find(bank => bank.id === selectedBankId)?.name ?? null,
			});
			if (!result.success) throw new Error('Erro ao registrar investimento no Firebase.');
			setHasSavedOnce(true);
			showScreenAlert('Investimento salvo com sucesso!', 'success');
			applyPostSubmitBehavior({ resetForm });
		} catch (error) {
			console.error(error);
			showScreenAlert('Não foi possível salvar o investimento agora. Tente novamente.');
		} finally {
			submitLockRef.current = false;
			setIsSaving(false);
		}
	}, [applyPostSubmitBehavior, bankOptions, initialValueInCents, investmentName, isBankBalanceNegative, isFormValid, isInitialValueAboveCurrentBalance, isLoadingBankBalance, isSaving, parsedCdi, parsedCdiInBasisPoints, parsedInvestmentDate, resetForm, selectedBankId, selectedRedemptionTerm, showScreenAlert]);

	const selectedBankOption = bankOptions.find(bank => bank.id === selectedBankId) ?? null;
	const bankBalanceDisplayValue = !selectedBankId
		? 'Selecione um banco para visualizar o saldo'
		: isLoadingBankBalance
			? 'Carregando saldo atual do banco...'
			: typeof currentBankBalanceInCents === 'number'
				? formatCurrencyBRL(currentBankBalanceInCents)
				: 'Saldo indisponível';
	const bankHint = isLoadingBanks
		? 'Carregando bancos disponíveis...'
		: bankOptions.length === 0
			? 'Cadastre um banco para vincular o investimento.'
			: isBankSelectionDisabled
				? 'Preencha nome, valor, data e CDI para liberar a escolha.'
				: 'Escolha o banco de onde sairá o aporte inicial.';
	const fieldColumn = isDesktop ? WEB_EXPENSE_CLASS_NAMES.fieldHalf : WEB_EXPENSE_CLASS_NAMES.fieldFull;
	const inputClassName = `${fieldContainerClassName} ${WEB_EXPENSE_CLASS_NAMES.fieldInput}`;

	return (
		<SafeAreaView className={WEB_DASHBOARD_CLASS_NAMES.screen} style={{ backgroundColor: surfaceBackground }} edges={['left', 'right', 'bottom']}>
			<StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
			<KeyboardAvoidingView className={WEB_DASHBOARD_CLASS_NAMES.fill} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
				<ScrollView
					ref={scrollViewRef}
					className={WEB_DASHBOARD_CLASS_NAMES.fill}
					contentContainerStyle={{ flexGrow: 1, paddingBottom: Math.max(110, contentBottomPadding) }}
					showsVerticalScrollIndicator={false}
					keyboardShouldPersistTaps="handled"
					keyboardDismissMode="on-drag"
					onScroll={handleScroll}
					scrollEventThrottle={scrollEventThrottle}
				>
					<View className={WEB_DASHBOARD_CLASS_NAMES.fill} style={{ backgroundColor: surfaceBackground, position: 'relative' }}>
						<View className={WEB_DASHBOARD_CLASS_NAMES.hero} style={{ height: heroHeight, backgroundColor: surfaceBackground }}>
							<RNImage source={LoginWallpaper} accessibilityLabel="Background da tela de investimento" className={WEB_DASHBOARD_CLASS_NAMES.heroImage} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%', zIndex: 0 }} resizeMode="cover" />
							<View className="pointer-events-none" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: heroHeight, opacity: 0.62, zIndex: 1 }}>
								<Grainient className="add-finance-hero-grainient" timeSpeed={0.12} colorBalance={isDarkMode ? 0.08 : -0.12} warpStrength={0.8} warpFrequency={3.5} warpSpeed={1.8} warpAmplitude={100} blendSoftness={0.18} grainAmount={0.08} grainScale={3} grainAnimated contrast={1.08} zoom={0.9} color1={isDarkMode ? LUMUS_HERO_COLORS.dark[0] : LUMUS_HERO_COLORS.light[0]} color2={isDarkMode ? LUMUS_HERO_COLORS.dark[1] : LUMUS_HERO_COLORS.light[1]} color3={isDarkMode ? LUMUS_HERO_COLORS.dark[2] : LUMUS_HERO_COLORS.light[2]} />
							</View>
							<View className={WEB_DASHBOARD_CLASS_NAMES.heroContent} style={{ paddingTop: insets.top + 24, zIndex: 2 }}>
								<StrokeText text="Novo investimento" strokeColor={LUMUS_HERO_COLORS.text} fillColor={LUMUS_HERO_COLORS.text} strokeWidth={1.5} drawDuration={2} fillDelay={1} fontSize={40} fontWeight={600} letterSpacing={-0.5} fontFamily={LUMUS_FONT_STACKS.sans} ease="power3.out" trigger="mount" className={WEB_DASHBOARD_CLASS_NAMES.heroTitle} />
								<AnimatedContent distance={100} direction="vertical" reverse={false} duration={2} ease="power3.out" initialOpacity={0} animateOpacity scale={1} threshold={0.1} delay={0} className={WEB_DASHBOARD_CLASS_NAMES.heroIllustrationAnimation}>
									<AddFinancialIllustration width="40%" height="100%" className="opacity-90" />
								</AnimatedContent>
							</View>
						</View>
						<View className={`${WEB_DASHBOARD_CLASS_NAMES.sheet} ${compact ? WEB_DASHBOARD_CLASS_NAMES.sheetCompact : ''}`} style={{ marginTop: heroHeight - 64, backgroundColor: surfaceBackground, position: 'relative', zIndex: 3 }}>
							<View className={WEB_DASHBOARD_CLASS_NAMES.sheetInner}>
								<View className={`${WEB_EXPENSE_CLASS_NAMES.formSurface} ${cardBackground} rounded-card`} style={{ display: 'flex', flex: 1, flexDirection: 'column' }}>
									<View className={WEB_EXPENSE_CLASS_NAMES.formScroll}>
										<View className={WEB_EXPENSE_CLASS_NAMES.fieldGrid}>
											<VStack className={fieldColumn}>
												<Text className={`${WEB_EXPENSE_CLASS_NAMES.fieldLabel} ${bodyText}`}>Nome do investimento</Text>
												<Input isDisabled={isSaving} className={inputClassName}><InputField accessibilityLabel="Nome do investimento" ref={investmentNameInputRef} placeholder="Ex.: CDB Banco X…" autoComplete="off" value={investmentName} onChangeText={value => { setInvestmentName(value); setHasSavedOnce(false); }} onFocus={() => handleInputFocus('investment-name')} onSubmitEditing={() => initialValueInputRef.current?.focus?.()} autoCapitalize="sentences" autoCorrect={false} returnKeyType="next" className={inputField} /></Input>
											</VStack>
											<VStack className={fieldColumn}>
												<Text className={`${WEB_EXPENSE_CLASS_NAMES.fieldLabel} ${bodyText}`}>Valor inicial investido</Text>
												<Input isDisabled={isInitialValueDisabled} className={inputClassName}><InputField accessibilityLabel="Valor inicial investido" ref={initialValueInputRef} placeholder="Ex.: R$ 0,00…" autoComplete="off" keyboardType="numeric" value={initialValueInput} onChangeText={handleInitialValueChange} onFocus={() => handleInputFocus('initial-value')} returnKeyType="next" className={inputField} /></Input>
											</VStack>
											<VStack className={fieldColumn}>
												<Text className={`${WEB_EXPENSE_CLASS_NAMES.fieldLabel} ${bodyText}`}>Dia do investimento</Text>
												<DatePickerField accessibilityLabel="Selecionar dia do investimento" value={investmentDate} onChange={value => { setInvestmentDate(value); setHasSavedOnce(false); }} triggerClassName={`${fieldContainerClassName} ${WEB_EXPENSE_CLASS_NAMES.fieldInput}`} inputClassName={inputField} isDisabled={isInvestmentDateDisabled} />
											</VStack>
											<VStack className={fieldColumn}>
												<Text className={`${WEB_EXPENSE_CLASS_NAMES.fieldLabel} ${bodyText}`}>CDI (%)</Text>
												<Input isDisabled={isCdiDisabled} className={inputClassName}><InputField accessibilityLabel="Percentual do CDI" ref={cdiInputRef} placeholder="Ex.: 110…" autoComplete="off" keyboardType="decimal-pad" value={cdiInput} onChangeText={value => { setCdiInput(value.replace(/[^\d.,]/g, '')); setHasSavedOnce(false); }} onFocus={() => handleInputFocus('cdi')} returnKeyType="done" className={inputField} /></Input>
											</VStack>
											<VStack className={WEB_EXPENSE_CLASS_NAMES.fieldFull}>
												<Text className={`${WEB_EXPENSE_CLASS_NAMES.fieldLabel} ${bodyText}`}>Prazo para resgate</Text>
												<WebSelectField options={redemptionOptions} value={selectedRedemptionTerm} onChange={value => { setSelectedRedemptionTerm(value as RedemptionTerm); setHasSavedOnce(false); }} isDisabled={isRedemptionTermDisabled} accessibilityLabel="Prazo para resgate" />
											</VStack>
											<VStack className={WEB_EXPENSE_CLASS_NAMES.fieldFull}>
												<Text className={`${WEB_EXPENSE_CLASS_NAMES.fieldLabel} ${bodyText}`}>Banco vinculado</Text>
												<BankActionsheetSelector options={bankOptions} selectedId={selectedBankId} selectedLabel={selectedBankOption?.name ?? ''} selectedOption={selectedBankOption} onSelect={bank => { setSelectedBankId(bank.id); setHasSavedOnce(false); }} isDisabled={isBankSelectionDisabled} isDarkMode={isDarkMode} bodyTextClassName={bodyText} helperTextClassName={helperText} triggerClassName={fieldBankContainerClassName} placeholder={isLoadingBanks ? 'Carregando bancos disponíveis...' : 'Selecione o banco vinculado'} sheetTitle="Escolha o banco do investimento" emptyMessage="Nenhum banco disponível." triggerHint={bankHint} disabledHint={bankHint} accessibilityLabel="Selecionar banco do investimento" />
											</VStack>
											<VStack className={WEB_EXPENSE_CLASS_NAMES.fieldFull}>
												<Text className={`${WEB_EXPENSE_CLASS_NAMES.fieldLabel} ${bodyText}`}>Saldo disponível do banco</Text>
												<Input isDisabled className={inputClassName}><InputField accessibilityLabel="Saldo disponível do banco" value={bankBalanceDisplayValue} className={inputField} /></Input>
											</VStack>
										</View>
										<Button className={`${submitButtonClassName} ${WEB_EXPENSE_CLASS_NAMES.submit}`} onPress={() => void handleSaveInvestment()} isDisabled={!isFormValid || isSaving}>
											{isSaving ? <><ButtonSpinner /><ButtonText className={submitButtonTextClassName}>Salvando…</ButtonText></> : <ButtonText className={submitButtonTextClassName}>Salvar investimento</ButtonText>}
										</Button>
										{hasSavedOnce ? <HStack className="mt-4 items-center justify-between gap-3 rounded-control border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900 dark:bg-emerald-950"><Text className="flex-1 text-sm text-emerald-700 dark:text-emerald-300">Investimento salvo e disponível na sua carteira.</Text><Button variant="link" onPress={() => navigateToRoute(APP_ROUTE_PATHS.financialList)}><ButtonText>Ver carteira</ButtonText></Button></HStack> : null}
									</View>
								</View>
							</View>
						</View>
					</View>
				</ScrollView>
				<Navigator defaultValue={1} onHardwareBack={() => { navigateToHomeDashboard(); return true; }} />
			</KeyboardAvoidingView>
		</SafeAreaView>
	);
}
