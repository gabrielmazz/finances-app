import React from 'react';
const mockHost = (name: string, extra: Record<string, unknown> = {}) => ({ children, ...props }: Record<string, any>) => React.createElement(name, { ...extra, ...props }, children);
const mockSubmit = jest.fn(), mockRetry = jest.fn(), mockBack = jest.fn();
let mockHidden = false;
let mockData: Record<string, any>;
const mockStyles = new Proxy({}, { get: (_target, key) => key === 'isDarkMode' ? false : key === 'insets' ? { top: 0 } : key === 'heroHeight' ? 180 : key === 'webDashboardClassNames' || key === 'webExpenseClassNames' ? {} : '' });
jest.doMock('react-native', () => ({ useWindowDimensions: () => ({ height: 844, width: 390 }), Image: mockHost('Image'), View: mockHost('View'), Text: mockHost('Text'), TextInput: mockHost('TextInput'), Pressable: mockHost('Pressable'), ScrollView: mockHost('ScrollView'), KeyboardAvoidingView: mockHost('View'), StatusBar: () => null,
  Appearance: { getColorScheme: () => 'light', addChangeListener: () => ({ remove: jest.fn() }) }, Keyboard: { dismiss: jest.fn() }, BackHandler: { addEventListener: () => ({ remove: jest.fn() }) }, Platform: { OS: 'android', select: (options: any) => options.android ?? options.default }, StyleSheet: { flatten: (style: unknown) => style } }));
jest.mock('react-native-css-interop', () => ({ createInteropElement: require('react').createElement }));
jest.mock('react-native-css-interop/jsx-runtime', () => require('react/jsx-runtime'));
jest.doMock('react-native-safe-area-context', () => ({ SafeAreaView: mockHost('View'), useSafeAreaInsets: () => ({ top: 0 }) }));
jest.doMock('expo-router', () => ({ useFocusEffect: () => {} }));
jest.doMock('lucide-react-native', () => ({ Info: () => null }));
for (const [module, exports] of [
  ['box', { Box: mockHost('View') }], ['text', { Text: mockHost('Text') }], ['heading', { Heading: mockHost('Text') }], ['image', { Image: () => null }],
  ['input', { Input: mockHost('View'), InputField: mockHost('TextInput'), InputSlot: mockHost('Pressable') }], ['button', { Button: mockHost('Button', { testID: 'adjustment-button' }), ButtonText: mockHost('Text'), ButtonSpinner: () => null }],
  ['vstack', { VStack: mockHost('View') }], ['hstack', { HStack: mockHost('View') }], ['textarea', { Textarea: mockHost('View'), TextareaInput: mockHost('TextInput') }],
  ['popover', { Popover: () => null, PopoverBackdrop: () => null, PopoverBody: mockHost('View'), PopoverContent: mockHost('View') }],
] as const) jest.doMock(`@/components/ui/${module}`, () => exports);
jest.doMock('@/components/uiverse/navigation/navigator', () => () => null);
jest.doMock('@/components/uiverse/navigation/web-screen-hero', () => () => null);
jest.doMock('@/components/uiverse/banks/bank-actionsheet-selector', () => mockHost('BankSelector', { testID: 'bank-selector' }));
jest.doMock('@/components/uiverse/banks/bank-balance-attached-panel', () => mockHost('View'));
jest.doMock('@/components/uiverse/shared/date-picker', () => mockHost('DatePicker', { testID: 'date-picker' }));
jest.doMock('@/contexts/ThemeContext', () => ({ useAppTheme: () => ({ isDarkMode: false }) }));
jest.doMock('@/contexts/ValueVisibilityContext', () => ({ useValueVisibility: () => ({ shouldHideValues: mockHidden }), HIDDEN_VALUE_PLACEHOLDER: '••••' }));
jest.doMock('@/hooks/useKeyboardAwareScroll', () => ({ useKeyboardAwareScroll: () => ({ contentBottomPadding: 0, handleInputFocus: jest.fn() }) }));
jest.doMock('@/hooks/useBankBalanceAdjustmentForm', () => ({ useBankBalanceAdjustmentForm: () => mockData, formatAdjustmentMoney: (cents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100) }));
const { render, act, within } = require('@testing-library/react-native') as typeof import('@testing-library/react-native');
const mobile = require('@/screens/mobile/BankBalanceAdjustmentScreen').default;
const web = require('@/screens/web/BankBalanceAdjustmentScreen.web').default;
beforeEach(() => {
  jest.clearAllMocks(); mockHidden = false;
  mockData = { banks: [{ id: 'bank', name: 'Banco' }], bankId: 'bank', date: '23/10/2026', value: 'R$ 120,00', target: 12000, description: 'Conferência',
    base: 10000, difference: 2000, loading: false, previewLoading: false, submitting: false, error: null, previewError: null, submitError: null, valueError: null,
    dateError: null, descriptionError: null, noDifference: false, submitDisabled: false, retryPending: false, fieldsLocked: false, completed: false,
    submit: mockSubmit, retry: mockRetry, back: mockBack, setBankId: jest.fn(), setDate: jest.fn(), setDescription: jest.fn(), onValueChange: jest.fn() };
});
for (const [name, Screen] of [['mobile', mobile], ['web', web]] as const) describe(`ajuste de saldo ${name}`, () => {
  const buttonWithText = (view: Awaited<ReturnType<typeof render>>, label: string) => view.getAllByTestId('adjustment-button').find(button => within(button).queryByText(label))!;
  test('resultado incerto bloqueia banco, valor, sinal, data e descrição e mostra confirmação explícita', async () => {
    mockData = { ...mockData, retryPending: true, fieldsLocked: true };
    const view = await render(React.createElement(Screen));
    expect(view.getByTestId('bank-selector').props.isDisabled).toBe(true); expect(view.getByPlaceholderText('R$ 0,00').props.editable).toBe(false);
    expect(view.getByLabelText('Alternar saldo positivo ou negativo').props.disabled).toBe(true);
    expect(view.getByTestId('date-picker').props.isDisabled).toBe(true); expect(view.getByPlaceholderText('Explique o motivo da diferença').props.editable).toBe(false);
    expect(view.getByText('Confirmar ajuste anterior')).toBeTruthy(); const button = view.getByLabelText('Confirmar ajuste anterior'); expect(button.props.isDisabled).toBe(false);
    await act(async () => button.props.onPress()); expect(mockSubmit).toHaveBeenCalledTimes(1); await view.unmount();
  });
  test('atualização manual aparece na prévia pronta e erro de leitura oferece nova tentativa', async () => {
    const view = await render(React.createElement(Screen));
    const update = () => buttonWithText(view, 'Atualizar prévia');
    await act(async () => update().props.onPress()); expect(mockRetry).toHaveBeenCalledTimes(1);
    mockData = { ...mockData, base: null, difference: null, previewError: 'Falha na leitura', submitDisabled: true };
    await view.rerender(React.createElement(Screen)); expect(view.getByText('Falha na leitura')).toBeTruthy();
    expect(view.getByLabelText('Salvar ajuste de saldo').props.isDisabled).toBe(true);
    await act(async () => update().props.onPress()); expect(mockRetry).toHaveBeenCalledTimes(2); await view.unmount();
  });
  test('carregamento, erro de abertura e catálogo vazio têm estados explícitos', async () => {
    mockData.loading = true; const view = await render(React.createElement(Screen)); expect(view.getByText(/Carregando bancos e ajuste/)).toBeTruthy();
    mockData = { ...mockData, loading: false, error: 'Sem acesso' }; await view.rerender(React.createElement(Screen));
    await act(async () => buttonWithText(view, 'Tentar novamente').props.onPress()); expect(mockRetry).toHaveBeenCalledTimes(1);
    mockData = { ...mockData, error: null, banks: [], bankId: null, base: null, difference: null, submitDisabled: true }; await view.rerender(React.createElement(Screen));
    expect(view.getByText('Cadastre um banco ativo para ajustar o saldo.')).toBeTruthy();
    await act(async () => buttonWithText(view, 'Atualizar bancos').props.onPress()); expect(mockRetry).toHaveBeenCalledTimes(2); await view.unmount();
  });
  test('confirmação permanece visível até abrir o extrato e não oferece outro envio', async () => {
    mockData.completed = true; const view = await render(React.createElement(Screen)); expect(view.queryByTestId('bank-selector')).toBeNull();
    await act(async () => buttonWithText(view, 'Ver extrato').props.onPress()); expect(mockBack).toHaveBeenCalledTimes(1); expect(mockSubmit).not.toHaveBeenCalled(); await view.unmount();
  });
  test('privacidade oculta saldo calculado e diferença sem remover orientação temporal', async () => {
    mockHidden = true; const view = await render(React.createElement(Screen));
    expect(view.getByText('Saldo no Lumus: ••••')).toBeTruthy(); expect(view.getByText('Diferença a registrar: ••••')).toBeTruthy();
    expect(view.getByText(/Para datas passadas/)).toBeTruthy(); await view.unmount();
  });
});
