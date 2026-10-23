import React from 'react';
const mockHost = (name: string, extra: Record<string, unknown> = {}) => ({ children, ...props }: Record<string, any>) => React.createElement(name, { ...extra, ...props }, children);
const mockSubmit = jest.fn(), mockReset = jest.fn(), mockReload = jest.fn(), mockApply = jest.fn(), mockAlert = jest.fn();
let mockUid = 'owner', mockUncertain = false;
let mockData: Record<string, any>;
const mockStyles = new Proxy({}, { get: (_target, key) => key === 'isDarkMode' ? false : key === 'insets' ? { top: 0 } : key === 'heroHeight' ? 180 : key === 'webDashboardClassNames' || key === 'webExpenseClassNames' ? {} : '' });
jest.doMock('react-native', () => ({ View: mockHost('View'), Text: mockHost('Text'), TextInput: mockHost('TextInput'), Pressable: mockHost('Pressable'), ScrollView: mockHost('ScrollView'), KeyboardAvoidingView: mockHost('View'), StatusBar: () => null,
  Appearance: { getColorScheme: () => 'light', addChangeListener: () => ({ remove: jest.fn() }) }, Keyboard: { dismiss: jest.fn() }, BackHandler: { addEventListener: () => ({ remove: jest.fn() }) }, Platform: { OS: 'android', select: (options: any) => options.android ?? options.default }, StyleSheet: { flatten: (style: unknown) => style } }));
jest.mock('react-native-css-interop', () => ({ createInteropElement: require('react').createElement }));
jest.mock('react-native-css-interop/jsx-runtime', () => require('react/jsx-runtime'));
jest.doMock('react-native-safe-area-context', () => ({ SafeAreaView: mockHost('View'), useSafeAreaInsets: () => ({ top: 0 }) }));
jest.doMock('expo-router', () => ({ useFocusEffect: () => {} }));
jest.doMock('lucide-react-native', () => ({ Info: () => null }));
for (const [module, exports] of [
  ['text', { Text: mockHost('Text') }], ['heading', { Heading: mockHost('Text') }], ['image', { Image: () => null }],
  ['input', { Input: mockHost('View'), InputField: mockHost('TextInput') }], ['button', { Button: mockHost('Button', { testID: 'transfer-button' }), ButtonText: mockHost('Text'), ButtonSpinner: () => null }],
  ['vstack', { VStack: mockHost('View') }], ['hstack', { HStack: mockHost('View') }], ['textarea', { Textarea: mockHost('View'), TextareaInput: mockHost('TextInput') }],
  ['popover', { Popover: () => null, PopoverBackdrop: () => null, PopoverBody: mockHost('View'), PopoverContent: mockHost('View') }],
] as const) jest.doMock(`@/components/ui/${module}`, () => exports);
jest.doMock('@/components/uiverse/navigation/navigator', () => () => null);
jest.doMock('@/components/uiverse/navigation/web-screen-hero', () => () => null);
jest.doMock('@/components/uiverse/feedback/notifier-alert', () => ({ showNotifierAlert: mockAlert }));
jest.doMock('@/components/uiverse/banks/bank-actionsheet-selector', () => mockHost('BankSelector', { testID: 'bank-selector' }));
jest.doMock('@/components/uiverse/banks/bank-balance-attached-panel', () => mockHost('View'));
jest.doMock('@/components/uiverse/shared/date-picker', () => mockHost('DatePicker', { testID: 'date-picker' }));
jest.doMock('@/FirebaseConfig', () => ({ auth: { get currentUser() { return { uid: mockUid }; } } }));
jest.doMock('@/functions/BankFirebase', () => ({ addCashRescueFirebase: () => { throw new Error('Não deve cair no legado.'); } }));
jest.doMock('@/utils/navigation', () => ({ navigateToHomeDashboard: jest.fn() }));
jest.doMock('@/hooks/useScreenStyle', () => ({ useScreenStyles: () => mockStyles }));
jest.doMock('@/hooks/useKeyboardAwareScroll', () => ({ useKeyboardAwareScroll: () => ({ contentBottomPadding: 0, handleInputFocus: jest.fn() }) }));
jest.doMock('@/hooks/usePostSubmitBehavior', () => ({ usePostSubmitBehavior: () => mockApply }));
jest.doMock('@/hooks/useSparkPairForm', () => ({ useSparkPairForm: () => ({ submit: mockSubmit, reset: mockReset, isUncertain: mockUncertain }) }));
jest.doMock('@/hooks/useRescueFormData', () => ({ useRescueFormData: () => mockData }));
const { render, fireEvent, act } = require('@testing-library/react-native') as typeof import('@testing-library/react-native');
jest.doMock('@/functions/FinancialLedgerFirebase', () => ({ createFinancialClientActionId: () => 'rescue-test', transferFundsFinancialLedgerFirebase: () => { throw new Error('Não deve cair no razão anterior.'); } }));
const mobile = require('@/screens/mobile/AddRescueScreen').default;
const web = require('@/screens/web/AddRescueScreen.web').default;
beforeEach(() => {
  mockUid = 'owner'; mockUncertain = false; jest.clearAllMocks(); mockSubmit.mockResolvedValue(true);
  mockData = { personId: 'owner', banks: [{ id: 'a', name: 'Banco A' }], isSparkMode: true, financialLedgerContext: null, cashAccountId: 'cash',
    isLoadingBanks: false, banksError: null, currentBankBalanceInCents: 100000, isLoadingBankBalance: false, error: null, needsBank: false, reload: mockReload };
});
for (const [name, Screen] of [['mobile', mobile], ['web', web]] as const) describe(`saque ${name}`, () => {
  const valuePlaceholder = 'Ex: R$ 150,00';
  const notePlaceholder = '(Opcional) Informe detalhes relevantes sobre este saque...';
  const fill = async (view: Awaited<ReturnType<typeof render>>) => {
    await act(async () => view.getByTestId('bank-selector').props.onSelect({ id: 'a' }));
    await fireEvent.changeText(view.getByPlaceholderText(valuePlaceholder), '15000');
  };
  const submitButton = (view: Awaited<ReturnType<typeof render>>) => view.getAllByTestId('transfer-button').find(button => button.props.isDisabled !== undefined)!;
  test('sucesso envia centavos ao Caixa, recarrega os dados e aplica o retorno uma vez', async () => {
    const view = await render(React.createElement(Screen)); await fill(view);
    await act(async () => submitButton(view).props.onPress());
    expect(mockSubmit).toHaveBeenCalledTimes(1);
    expect(mockSubmit).toHaveBeenCalledWith(expect.objectContaining({ actorId: 'owner', mode: 'withdrawal', fromAccountId: 'a', amountInCents: 15000 }));
    expect(mockReload).toHaveBeenCalledTimes(1); expect(mockApply).toHaveBeenCalledTimes(1); await view.unmount();
  });
  test('resultado incerto bloqueia campos e permite confirmar com falha de leitura e saldo já debitado', async () => {
    const view = await render(React.createElement(Screen)); await fill(view);
    mockUncertain = true; mockData.currentBankBalanceInCents = null; mockData.error = 'Falha ao confirmar saldo';
    await view.rerender(React.createElement(Screen));
    expect(view.getByTestId('bank-selector').props.isDisabled).toBe(true);
    expect(view.getByPlaceholderText(valuePlaceholder).props.editable).toBe(false);
    expect(view.getByPlaceholderText(notePlaceholder).props.editable).toBe(false);
    expect(view.getByTestId('date-picker').props.isDisabled).toBe(true); expect(submitButton(view).props.isDisabled).toBe(false);
    await act(async () => submitButton(view).props.onPress());
    expect(mockSubmit).toHaveBeenCalledWith(expect.objectContaining({ mode: 'withdrawal', fromAccountId: 'a', amountInCents: 15000 })); await view.unmount();
  });
  test('falha de saldo bloqueia novo saque e oferece recarga explícita', async () => {
    const view = await render(React.createElement(Screen)); await fill(view);
    mockData.error = 'Falha ao confirmar saldo'; mockData.currentBankBalanceInCents = null;
    await view.rerender(React.createElement(Screen)); expect(submitButton(view).props.isDisabled).toBe(true);
    await act(async () => submitButton(view).props.onPress()); expect(mockSubmit).not.toHaveBeenCalled();
    await act(async () => view.getAllByTestId('transfer-button').find(button => button.props.variant === 'outline')!.props.onPress());
    expect(mockReload).toHaveBeenCalledTimes(1); await view.unmount();
  });
  test('banco negativo exige justificativa Spark de 3 a 500 caracteres', async () => {
    mockData.currentBankBalanceInCents = 10000;
    const view = await render(React.createElement(Screen)); await fill(view);
    expect(submitButton(view).props.isDisabled).toBe(true);
    expect(view.getByText(/Este saque deixa o banco negativo/)).toBeTruthy();
    await fireEvent.changeText(view.getByPlaceholderText(notePlaceholder), 'ab'); expect(submitButton(view).props.isDisabled).toBe(true);
    await fireEvent.changeText(view.getByPlaceholderText(notePlaceholder), 'a'.repeat(501)); expect(submitButton(view).props.isDisabled).toBe(true);
    await fireEvent.changeText(view.getByPlaceholderText(notePlaceholder), 'Reserva emergencial'); expect(submitButton(view).props.isDisabled).toBe(false);
    await act(async () => submitButton(view).props.onPress());
    expect(mockSubmit).toHaveBeenCalledWith(expect.objectContaining({ overdraftReason: 'Reserva emergencial', note: 'Reserva emergencial' })); await view.unmount();
  });
  test('troca de sessão durante envio suprime confirmação e navegação do usuário anterior', async () => {
    let resolve!: (value: boolean) => void;
    mockSubmit.mockImplementationOnce(() => new Promise<boolean>(done => { resolve = done; }));
    const view = await render(React.createElement(Screen)); await fill(view);
    let submission!: Promise<void>;
    await act(async () => { submission = submitButton(view).props.onPress(); });
    mockUid = 'other'; mockData = { ...mockData, personId: 'other' }; await view.rerender(React.createElement(Screen));
    await act(async () => { resolve(true); await submission; });
    expect(mockReload).not.toHaveBeenCalled(); expect(mockApply).not.toHaveBeenCalled(); expect(mockAlert).not.toHaveBeenCalled(); await view.unmount();
  });
});
