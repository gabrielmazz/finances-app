import React from 'react';
const mockHost = (name: string, extra: Record<string, unknown> = {}) => ({ children, ...props }: Record<string, any>) => React.createElement(name, { ...extra, ...props }, typeof children === 'function' ? children({ isExpanded: false }) : children);
const mockRetry = jest.fn(), mockReload = jest.fn(), mockRates = jest.fn(), mockActivity = jest.fn();
const mockSubmit = jest.fn(), mockReset = jest.fn(), mockApply = jest.fn(), mockAlert = jest.fn(), mockRows = jest.fn(), mockLegacy = jest.fn();
let mockUid = 'owner', mockUncertain = false;
const mockParams: Record<string, string> = {};
let mockData: Record<string, any>;
const mockStyles = new Proxy({}, { get: (_target, key) => key === 'isDarkMode' ? false : key === 'insets' ? { top: 0 } : key === 'heroHeight' ? 180 : key === 'webDashboardClassNames' || key === 'webExpenseClassNames' ? {} : '' });
jest.doMock('react-native', () => ({ useWindowDimensions: () => ({ height: 844, width: 390 }), Image: mockHost('Image'), RefreshControl: mockHost('RefreshControl'), TouchableOpacity: mockHost('Pressable', { testID: 'investment-card' }), View: mockHost('View'), Text: mockHost('Text'), TextInput: mockHost('TextInput'), Pressable: mockHost('Pressable'), ScrollView: mockHost('ScrollView'), KeyboardAvoidingView: mockHost('View'), StatusBar: () => null,
  Appearance: { getColorScheme: () => 'light', addChangeListener: () => ({ remove: jest.fn() }) }, Keyboard: { dismiss: jest.fn() }, BackHandler: { addEventListener: () => ({ remove: jest.fn() }) }, Platform: { OS: 'android', select: (options: any) => options.android ?? options.default }, StyleSheet: { flatten: (style: unknown) => style } }));
jest.mock('react-native-css-interop', () => ({ createInteropElement: require('react').createElement }));
jest.mock('react-native-css-interop/jsx-runtime', () => require('react/jsx-runtime'));
jest.doMock('react-native-safe-area-context', () => ({ SafeAreaView: mockHost('View'), useSafeAreaInsets: () => ({ top: 0 }) }));
jest.doMock('expo-router', () => ({ useLocalSearchParams: () => mockParams, useFocusEffect: (effect: any) => React.useEffect(effect, [effect]) }));
jest.doMock('lucide-react-native', () => ({ Info: () => null }));
for (const [module, exports] of [
  ['box', { Box: mockHost('View') }], ['text', { Text: mockHost('Text') }], ['heading', { Heading: mockHost('Text') }], ['image', { Image: () => null }],
  ['input', { Input: mockHost('View', { testID: 'input-shell' }), InputField: mockHost('TextInput', { testID: 'investment-field' }) }], ['button', { Button: mockHost('Button', { testID: 'recurring-button' }), ButtonText: mockHost('Text'), ButtonSpinner: () => null }],
  ['vstack', { VStack: mockHost('View') }], ['hstack', { HStack: mockHost('View') }], ['textarea', { Textarea: mockHost('View'), TextareaInput: mockHost('TextInput') }],
  ['popover', { Popover: () => null, PopoverBackdrop: () => null, PopoverBody: mockHost('View'), PopoverContent: mockHost('View') }],
] as const) jest.doMock(`@/components/ui/${module}`, () => exports);
jest.doMock('@/components/uiverse/navigation/navigator', () => () => null);
jest.doMock('@/components/uiverse/navigation/web-screen-hero', () => () => null);
jest.doMock('@/components/uiverse/feedback/notifier-alert', () => ({ showNotifierAlert: mockAlert }));
jest.doMock('@/components/uiverse/banks/bank-actionsheet-selector', () => mockHost('BankSelector', { testID: 'bank-selector' }));
jest.doMock('@/components/uiverse/banks/bank-balance-attached-panel', () => mockHost('View'));
jest.doMock('@/components/uiverse/shared/date-picker', () => mockHost('DatePicker', { testID: 'date-picker' }));
for (const [module, names] of [
  ['switch', ['Switch']], ['select', ['Select', 'SelectBackdrop', 'SelectContent', 'SelectDragIndicator', 'SelectDragIndicatorWrapper', 'SelectIcon', 'SelectInput', 'SelectItem', 'SelectPortal', 'SelectTrigger']],
  ['accordion', ['Accordion', 'AccordionContent', 'AccordionHeader', 'AccordionIcon', 'AccordionItem', 'AccordionTitleText', 'AccordionTrigger']],
  ['icon', ['AddIcon', 'CalendarDaysIcon', 'CheckCircleIcon', 'DownloadIcon', 'EditIcon', 'RepeatIcon', 'TrashIcon', 'ChevronDownIcon', 'ChevronUpIcon', 'Icon']],
  ['skeleton', ['Skeleton', 'SkeletonText']], ['modal', ['Modal', 'ModalBackdrop', 'ModalBody', 'ModalCloseButton', 'ModalContent', 'ModalFooter', 'ModalHeader', 'ModalTitle']],
] as const) jest.doMock(`@/components/ui/${module}`, () => Object.fromEntries(names.map(name => [name, name === 'Modal' ? ({ isOpen, children }: any) => isOpen ? React.createElement('View', {}, children) : null : mockHost(['ModalTitle', 'AccordionTitleText'].includes(name) ? 'Text' : 'View')])));
jest.doMock('@/components/ui/button', () => ({ Button: mockHost('Button', { testID: 'recurring-button' }), ButtonText: mockHost('Text'), ButtonSpinner: () => null, ButtonIcon: () => null }));
jest.doMock('expo-linear-gradient', () => ({ LinearGradient: mockHost('View') }));
jest.doMock('lucide-react', () => ({ CalendarDays: () => null, ChevronDown: () => null, ChevronUp: () => null }));
jest.doMock('@mantine/core', () => ({ Divider: () => null, MantineProvider: mockHost('View'), NumberInput: mockHost('TextInput') }));
jest.doMock('@/design-system/mantine', () => ({ getMantineNumberInputClassNames: () => ({}) }));
jest.doMock('@/components/uiverse/shared/screen-dismiss-keyboard', () => ({ ScreenDismissKeyboard: mockHost('View') }));
jest.doMock('@/components/web/shared/web-select-field', () => mockHost('Select'));
jest.doMock('@/components/uiverse/categories/tag-actionsheet-selector', () => mockHost('TagSelector', { testID: 'tag-selector' }));
jest.doMock('@/components/web/motion/AnimatedContent', () => mockHost('View'));
jest.doMock('@/components/web/visuals/Grainient', () => () => null);
jest.doMock('@/FirebaseConfig', () => ({ auth: { get currentUser() { return { uid: mockUid }; } } }));
jest.doMock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { uid: mockUid } }) }));
jest.doMock('@/contexts/ValueVisibilityContext', () => ({ useValueVisibility: () => ({ shouldHideValues: false }), HIDDEN_VALUE_PLACEHOLDER: '••••' }));
jest.doMock('@/utils/navigation', () => ({ APP_ROUTE_PATHS: {}, navigateToHomeDashboard: jest.fn(), navigateToRoute: jest.fn() }));
jest.doMock('@/hooks/useScreenStyle', () => ({ useScreenStyles: () => mockStyles }));
jest.doMock('@/hooks/useKeyboardAwareScroll', () => ({ useKeyboardAwareScroll: () => ({ contentBottomPadding: 0, handleInputFocus: jest.fn() }) }));
jest.doMock('@/hooks/usePostSubmitBehavior', () => ({ usePostSubmitBehavior: () => mockApply }));
jest.doMock('@/contexts/ThemeContext', () => ({ useAppTheme: () => ({ isDarkMode: false }) }));
jest.doMock('@/components/web/visuals/StrokeText', () => () => null);
jest.mock('@/components/uiverse/investments/investment-evolution-chart', () => () => null);
jest.mock('@/components/uiverse/investments/retained-investments', () => () => null);
jest.mock('@/components/uiverse/investments/investment-valuation-undo', () => () => null);
jest.doMock('@/components/ui/tabs', () => ({ Tabs: mockHost('View'), TabsIndicator: () => null, TabsList: mockHost('View'), TabsTrigger: mockHost('View'), TabsTriggerText: mockHost('Text') }));
jest.doMock('@/hooks/useTransferFormData', () => ({ useTransferFormData: () => mockData }));
jest.doMock('@/functions/BankFirebase', () => ({ getBanksWithUsersByPersonFirebase: () => Promise.resolve({ success: true, data: [{ id: 'bank', name: 'Banco' }] }) }));
jest.doMock('@/functions/FinancialLedgerFirebase', () => ({ createFinancialClientActionId: () => 'action_123456' }));
jest.doMock('@/functions/FinancesFirebase', () => ({ addFinanceInvestmentFirebase: mockLegacy, updateFinanceInvestmentFirebase: mockLegacy, deleteFinanceInvestmentFirebase: mockLegacy, moveFinanceInvestmentFirebase: mockLegacy, syncFinanceInvestmentValueFirebase: mockLegacy, getFinanceInvestmentsWithRelationsFirebase: (...args: unknown[]) => mockRows(...args), getFinanceInvestmentPortfolioActivityWithRelationsFirebase: () => mockActivity() }));
jest.doMock('@/functions/InvestmentCdiRateFirebase', () => ({ getInvestmentCdiRatesWithRelationsFirebase: () => mockRates(), upsertInvestmentCdiRateFirebase: mockLegacy }));
jest.doMock('@/hooks/useSparkInvestmentForm', () => ({ useSparkInvestmentForm: () => ({ create: mockSubmit, update: mockSubmit, move: mockSubmit, sync: mockSubmit, archive: mockSubmit, reset: mockReset, retryPending: mockRetry, fieldsLocked: mockUncertain, isPending: mockUncertain, hasPending: () => mockUncertain }) }));
const { render, act, fireEvent, within, waitFor } = require('@testing-library/react-native') as typeof import('@testing-library/react-native');
const mobileForm = require('@/screens/mobile/AddFinanceScreen').default, webForm = require('@/screens/web/AddFinanceScreen.web').default;
const mobileList = require('@/screens/mobile/FinancialListScreen').default, webList = require('@/screens/web/FinancialListScreen.web').default;
const button = (view: Awaited<ReturnType<typeof render>>, text: string) => view.getAllByTestId('recurring-button').find(node => within(node).queryByText(text))!;
const row = (name = 'CDB de teste') => ({ id: 'asset', name, personId: mockUid, bankId: 'bank', initialValueInCents: 30000, currentValueInCents: 30000, cdiPercentageInBasisPoints: 10000, date: new Date(), createdAt: new Date(), sparkNative: true, isActive: true });
beforeEach(() => {
  mockUid = 'owner'; mockUncertain = false; jest.clearAllMocks(); mockReset.mockReturnValue(true); mockSubmit.mockReset().mockResolvedValue({ success: true }); mockRetry.mockReset().mockResolvedValue({ success: true });
  mockData = { personId: 'owner', banks: [{ id: 'bank', name: 'Banco' }], originBalanceInCents: 100000, isLoadingBanks: false, isLoadingBalance: false, banksError: null, error: null, reload: mockReload };
  mockRows.mockReset().mockResolvedValue({ success: true, data: [row()] }); mockRates.mockReset().mockResolvedValue({ success: true, data: [] }); mockActivity.mockReset().mockResolvedValue({ success: true, data: { cashFlows: [], syncs: [] } });
});
for (const [platform, Screen] of [['mobile', mobileForm], ['web', webForm]] as const) describe(`cadastro de investimento ${platform}`, () => {
  const fill = async (view: Awaited<ReturnType<typeof render>>) => {
    const inputs = view.getAllByTestId('input-shell');
    await fireEvent.changeText(within(inputs[0]).getByTestId('investment-field'), 'CDB');
    await fireEvent.changeText(within(inputs[1]).getByTestId('investment-field'), '30000');
    await fireEvent.changeText(within(inputs[2]).getByTestId('investment-field'), '100');
    await act(async () => view.getByTestId('bank-selector').props.onSelect({ id: 'bank' }));
  };
  test('cria em centavos, recarrega o saldo e respeita pós-submit', async () => {
    const view = await render(React.createElement(Screen)); await fill(view); mockReload.mockClear(); await act(async () => button(view, 'Salvar investimento').props.onPress());
    expect(mockSubmit).toHaveBeenCalledWith(expect.objectContaining({ initialValueInCents: 30000, bankId: 'bank', personId: 'owner' })); expect(mockReload).toHaveBeenCalledTimes(1); expect(mockApply).toHaveBeenCalledTimes(1); expect(mockLegacy).not.toHaveBeenCalled(); await view.unmount();
  });
  test('saldo indisponível bloqueia o envio e oferece retry', async () => {
    const view = await render(React.createElement(Screen)); await fill(view); mockData.originBalanceInCents = null; mockData.error = 'Saldo indisponível'; await view.rerender(React.createElement(Screen));
    expect(button(view, 'Salvar investimento').props.isDisabled).toBe(true); await act(async () => button(view, 'Salvar investimento').props.onPress()); expect(mockSubmit).not.toHaveBeenCalled(); await act(async () => button(view, 'Tentar novamente').props.onPress()); expect(mockReload).toHaveBeenCalled(); await view.unmount();
  });
  test('confirma envio incerto com campos bloqueados mesmo após débito', async () => {
    const view = await render(React.createElement(Screen)); await fill(view); mockUncertain = true; mockData.originBalanceInCents = 0; await view.rerender(React.createElement(Screen));
    expect(view.getAllByTestId('input-shell').every(node => node.props.isDisabled)).toBe(true); expect(view.getByTestId('bank-selector').props.isDisabled).toBe(true); expect(button(view, 'Confirmar investimento anterior').props.isDisabled).toBe(false);
    await act(async () => button(view, 'Confirmar investimento anterior').props.onPress()); expect(mockRetry).toHaveBeenCalledTimes(1); expect(mockSubmit).not.toHaveBeenCalled(); await view.unmount();
  });
});
for (const [platform, Screen] of [['mobile', mobileList], ['web', webList]] as const) describe(`carteira ${platform}`, () => {
  test('aporte mostra orientação da conta local e não executa fallback legado após recusa Spark', async () => {
    const message = 'Esta conta ainda não possui um grupo financeiro Spark preparado. Na demonstração local, saia e entre com spark@demo.lumus.local.';
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const view = await render(React.createElement(Screen));
      await act(async () => platform === 'mobile' ? view.getByTestId('investment-card').props.onPress() : view.getByLabelText('Expandir detalhes de CDB de teste').props.onPress());
      await act(async () => platform === 'web' ? view.getByLabelText('Aportar em CDB de teste').props.onPress() : view.getAllByTestId('investment-card').filter(node => within(node).queryByText('Aportar')).at(-1)!.props.onPress());
      mockSubmit.mockResolvedValueOnce({ success: true, currentValueInCents: 30000 });
      await act(async () => button(view, 'Sincronizar e continuar').props.onPress());
      await fireEvent.changeText(view.getByTestId('investment-field'), '1000');
      mockSubmit.mockResolvedValueOnce({ success: false, error: message });
      await act(async () => button(view, 'Adicionar valor').props.onPress());
      expect(view.getByText(message)).toBeTruthy(); expect(mockAlert).toHaveBeenLastCalledWith(expect.objectContaining({ description: message, type: 'error' }));
      expect(mockLegacy).not.toHaveBeenCalled(); expect(button(view, 'Adicionar valor').props.isDisabled).toBe(false); await view.unmount();
    } finally { error.mockRestore(); }
  });
  test('falha ao atualizar remove resumo antigo e permite tentar novamente', async () => {
    const view = await render(React.createElement(Screen)); expect(view.getByText('Patrimônio estimado')).toBeTruthy(); mockRows.mockResolvedValueOnce({ success: false });
    await act(async () => button(view, 'Atualizar carteira').props.onPress()); expect(view.queryByText('Patrimônio estimado')).toBeNull(); expect(view.getByText('Erro ao carregar investimentos.')).toBeTruthy();
    await act(async () => button(view, 'Tentar novamente').props.onPress()); expect(view.getByText('Patrimônio estimado')).toBeTruthy(); await view.unmount();
  });
  test('histórico indisponível não vira carteira com resultado zero', async () => {
    mockActivity.mockResolvedValueOnce({ success: false }); const view = await render(React.createElement(Screen)); expect(view.queryByText('Patrimônio estimado')).toBeNull(); expect(view.getByText(/Não foi possível confirmar taxas/)).toBeTruthy(); await view.unmount();
  });
  test('arquivamento incerto mantém confirmação e permite o mesmo reenvio', async () => {
    mockSubmit.mockImplementationOnce(async () => { mockUncertain = true; return { success: false, error: 'Resposta perdida' }; }).mockImplementationOnce(async () => { mockUncertain = false; return { success: true }; });
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const view = await render(React.createElement(Screen));
      await act(async () => platform === 'mobile' ? view.getByTestId('investment-card').props.onPress() : view.getByLabelText('Expandir detalhes de CDB de teste').props.onPress());
      await act(async () => platform === 'web' ? view.getByLabelText('Arquivar em CDB de teste').props.onPress() : view.getAllByTestId('investment-card').filter(node => within(node).queryByText('Arquivar')).at(-1)!.props.onPress());
      const confirm = () => view.getAllByTestId('recurring-button').find(node => node.props.action === 'negative' && node.props.variant === 'solid')!;
      await act(async () => confirm().props.onPress()); expect(view.getByText('Resposta perdida')).toBeTruthy();
      await act(async () => button(view, 'Cancelar').props.onPress()); expect(view.getByText('Arquivar investimento')).toBeTruthy();
      await act(async () => confirm().props.onPress()); expect(mockSubmit).toHaveBeenCalledTimes(2); expect(mockSubmit.mock.calls[1]).toEqual(mockSubmit.mock.calls[0]); expect(view.queryByText('Arquivar investimento')).toBeNull(); await view.unmount();
    } finally { error.mockRestore(); }
  });
  test('resposta antiga de outro UID é descartada', async () => {
    let finish!: (value: any) => void; mockRows.mockReturnValueOnce(new Promise(done => { finish = done; })).mockResolvedValueOnce({ success: true, data: [row('Carteira nova')] });
    const view = await render(React.createElement(Screen)); mockUid = 'other'; await view.rerender(React.createElement(Screen)); await waitFor(() => expect(view.getByText('Carteira nova')).toBeTruthy());
    await act(async () => finish({ success: true, data: [row('Carteira antiga')] })); expect(view.queryByText('Carteira antiga')).toBeNull(); await view.unmount();
  });
});
