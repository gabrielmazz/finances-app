import React from 'react';
const mockHost = (name: string, extra: Record<string, unknown> = {}) => ({ children, ...props }: Record<string, any>) => React.createElement(name, { ...extra, ...props }, children);
const mockSubmit = jest.fn(), mockReset = jest.fn(), mockApply = jest.fn(), mockAlert = jest.fn(), mockTags = jest.fn(), mockLoad = jest.fn(), mockInitialize = jest.fn(), mockRows = jest.fn(), mockSync = jest.fn(), mockAction = jest.fn(), mockLegacy = jest.fn();
let mockUid = 'owner', mockUncertain = false, mockActionUncertain = false;
const mockParams: Record<string, string> = {};
const mockPending = () => mockActionUncertain;
let mockData: Record<string, any>;
const mockStyles = new Proxy({}, { get: (_target, key) => key === 'isDarkMode' ? false : key === 'insets' ? { top: 0 } : key === 'heroHeight' ? 180 : key === 'webDashboardClassNames' || key === 'webExpenseClassNames' ? {} : '' });
jest.doMock('react-native', () => ({ useWindowDimensions: () => ({ height: 844, width: 390 }), Image: mockHost('Image'), RefreshControl: mockHost('RefreshControl'), TouchableOpacity: mockHost('Pressable'), View: mockHost('View'), Text: mockHost('Text'), TextInput: mockHost('TextInput'), Pressable: mockHost('Pressable'), ScrollView: mockHost('ScrollView'), KeyboardAvoidingView: mockHost('View'), StatusBar: () => null,
  Appearance: { getColorScheme: () => 'light', addChangeListener: () => ({ remove: jest.fn() }) }, Keyboard: { dismiss: jest.fn() }, BackHandler: { addEventListener: () => ({ remove: jest.fn() }) }, Platform: { OS: 'android', select: (options: any) => options.android ?? options.default }, StyleSheet: { flatten: (style: unknown) => style } }));
jest.mock('react-native-css-interop', () => ({ createInteropElement: require('react').createElement }));
jest.mock('react-native-css-interop/jsx-runtime', () => require('react/jsx-runtime'));
jest.doMock('react-native-safe-area-context', () => ({ SafeAreaView: mockHost('View'), useSafeAreaInsets: () => ({ top: 0 }) }));
jest.doMock('expo-router', () => ({ useLocalSearchParams: () => mockParams, useFocusEffect: (effect: any) => React.useEffect(effect, [effect]) }));
jest.doMock('lucide-react-native', () => ({ Info: () => null }));
for (const [module, exports] of [
  ['box', { Box: mockHost('View') }], ['text', { Text: mockHost('Text') }], ['heading', { Heading: mockHost('Text') }], ['image', { Image: () => null }],
  ['input', { Input: mockHost('View', { testID: 'input-shell' }), InputField: mockHost('TextInput') }], ['button', { Button: mockHost('Button', { testID: 'recurring-button' }), ButtonText: mockHost('Text'), ButtonSpinner: () => null }],
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
] as const) jest.doMock(`@/components/ui/${module}`, () => Object.fromEntries(names.map(name => [name, name === 'Modal' ? ({ isOpen, children }: any) => isOpen ? React.createElement('View', {}, children) : null : mockHost(name === 'ModalTitle' ? 'Text' : 'View')])));
jest.doMock('@/components/ui/button', () => ({ Button: mockHost('Button', { testID: 'recurring-button' }), ButtonText: mockHost('Text'), ButtonSpinner: () => null, ButtonIcon: () => null }));
jest.doMock('expo-linear-gradient', () => ({ LinearGradient: mockHost('View') }));
jest.doMock('lucide-react', () => ({ CalendarDays: () => null, ChevronDown: () => null, ChevronUp: () => null }));
jest.doMock('@mantine/core', () => ({ Divider: () => null, MantineProvider: mockHost('View'), NumberInput: mockHost('TextInput') }));
jest.doMock('@/design-system/mantine', () => ({ getMantineNumberInputClassNames: () => ({}) }));
jest.doMock('@/components/uiverse/shared/screen-dismiss-keyboard', () => ({ ScreenDismissKeyboard: mockHost('View') }));
jest.doMock('@/components/web/shared/web-select-field', () => mockHost('Select'));
jest.doMock('@/components/uiverse/categories/tag-actionsheet-selector', () => mockHost('TagSelector', { testID: 'tag-selector' }));
jest.doMock('@/components/uiverse/recurring/time-picker-field', () => mockHost('TimePicker'));
jest.doMock('@/components/uiverse/recurring/date-calendar', () => mockHost('Calendar', { testID: 'calendar' }));
jest.mock('@/components/uiverse/recurring/retained-recurring-plans', () => () => null);
jest.mock('@/components/uiverse/recurring/spark-recurring-contracts', () => () => null);
jest.mock('@/components/uiverse/recurring/mandatory-expense-payment-bullet-chart', () => () => null);
jest.mock('@/components/uiverse/recurring/mandatory-expenses-radar-chart', () => () => null);
jest.mock('@/components/uiverse/recurring/mandatory-expenses-scatter-chart', () => () => null);
jest.doMock('@/components/web/motion/AnimatedContent', () => mockHost('View'));
jest.doMock('@/components/web/visuals/Grainient', () => () => null);
jest.doMock('@/hooks/useTagIcons', () => ({ TagIcon: () => null }));
jest.doMock('@/FirebaseConfig', () => ({ auth: { get currentUser() { return { uid: mockUid }; } } }));
jest.doMock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { uid: mockUid } }) }));
jest.doMock('@/contexts/ValueVisibilityContext', () => ({ useValueVisibility: () => ({ shouldHideValues: false }), HIDDEN_VALUE_PLACEHOLDER: '••••' }));
jest.doMock('@/functions/TagFirebase', () => ({ getTagsWithUsersByPersonFirebase: (...args: unknown[]) => mockTags(...args), getTagDataFirebase: jest.fn().mockResolvedValue({ success: false }) }));
jest.doMock('@/functions/MandatoryExpenseFirebase', () => ({ addMandatoryExpenseFirebase: mockLegacy, updateMandatoryExpenseFirebase: mockLegacy, getMandatoryExpenseFirebase: mockLegacy, getMandatoryExpensesWithRelationsFirebase: (...args: unknown[]) => mockRows(...args), clearMandatoryExpensePaymentFirebase: mockLegacy, deleteMandatoryExpenseFirebase: mockLegacy }));
jest.doMock('@/functions/ExpenseFirebase', () => ({ deleteExpenseFirebase: mockLegacy }));
jest.doMock('@/utils/pdfFileName', () => ({ buildPdfFileName: () => 'resumo.pdf' }));
jest.doMock('@/utils/reportExport', () => ({ exportHtmlReport: jest.fn() }));
jest.doMock('@/utils/mandatoryExpenseNotifications', () => ({ cancelMandatoryExpenseNotification: jest.fn().mockResolvedValue(undefined), scheduleMandatoryExpenseNotification: jest.fn(), ensureNotificationPermissionForMandatoryExpenses: jest.fn(), syncMandatoryExpenseNotifications: (...args: unknown[]) => mockSync(...args) }));
jest.doMock('@/utils/mandatoryReminderNotifications', () => ({ formatMandatoryReminderNextTrigger: jest.fn() }));
jest.doMock('@/utils/navigation', () => ({ APP_ROUTE_PATHS: {}, navigateToHomeDashboard: jest.fn(), navigateToRoute: jest.fn() }));
jest.doMock('@/hooks/useScreenStyle', () => ({ useScreenStyles: () => mockStyles }));
jest.doMock('@/hooks/useKeyboardAwareScroll', () => ({ useKeyboardAwareScroll: () => ({ contentBottomPadding: 0, handleInputFocus: jest.fn() }) }));
jest.doMock('@/hooks/usePostSubmitBehavior', () => ({ usePostSubmitBehavior: () => mockApply }));
jest.doMock('@/hooks/useSparkRecurringForm', () => ({ useSparkRecurringForm: () => ({ load: mockLoad, initialize: mockInitialize, submit: mockSubmit, reset: mockReset, isSpark: true, isUncertain: mockUncertain }), useSparkRecurringAction: () => ({ submit: mockAction, isUncertain: mockActionUncertain, hasPending: mockPending }) }));
const { render, act, fireEvent, waitFor, within } = require('@testing-library/react-native') as typeof import('@testing-library/react-native');
const mobileForm = require('@/screens/mobile/AddMandatoryExpensesScreen').default, webForm = require('@/screens/web/AddMandatoryExpensesScreen.web').default;
const mobileList = require('@/screens/mobile/MandatoryExpensesListScreen').default, webList = require('@/screens/web/MandatoryExpensesListScreen.web').default;
const row = () => ({ id: 'plan', name: 'Aluguel de teste', personId: 'owner', valueInCents: 10000, dueDay: 25, tagId: 'group-category', sparkPlan: true, sparkPlanActive: true });
const button = (view: Awaited<ReturnType<typeof render>>, label: string | RegExp) => view.getAllByTestId('recurring-button').find(node => within(node).queryByText(label))!;
beforeEach(() => {
  mockUid = 'owner'; mockUncertain = false; mockActionUncertain = false; delete mockParams.expenseId; jest.clearAllMocks();
  mockInitialize.mockReset().mockResolvedValue(true); mockLoad.mockReset().mockResolvedValue({ success: true, data: row() }); mockSubmit.mockReset().mockResolvedValue({ success: true, id: 'plan' });
  mockTags.mockReset().mockResolvedValue({ success: true, data: [{ id: 'group-category', personId: 'group-member', name: 'Categoria do grupo', usageType: 'expense', isMandatoryExpense: true }] });
  mockRows.mockReset().mockResolvedValue({ success: true, data: [row()] }); mockSync.mockReset().mockResolvedValue(undefined); mockAction.mockReset().mockResolvedValue({ success: true });
});
for (const [name, Screen] of [['mobile', mobileForm], ['web', webForm]] as const) describe(`cadastro recorrente ${name}`, () => {
  const fill = async (view: Awaited<ReturnType<typeof render>>) => {
    await fireEvent.changeText(view.getByPlaceholderText(/Aluguel/), 'Aluguel'); await fireEvent.changeText(view.getByPlaceholderText(/700,00/), '10000');
    await fireEvent.changeText(view.getByPlaceholderText(/Informe um dia entre/), '25');
    await act(async () => view.getByTestId('tag-selector').props.onSelect({ id: 'group-category', name: 'Categoria do grupo' }));
  };
  test('aceita categoria autorizada do grupo, envia centavos e aplica pós-submit uma vez', async () => {
    const view = await render(React.createElement(Screen)); expect(view.getByTestId('tag-selector').props.options).toHaveLength(1); await fill(view);
    await act(async () => button(view, 'Registrar gasto').props.onPress());
    expect(mockSubmit).toHaveBeenCalledWith(expect.objectContaining({ actorId: 'owner', valueInCents: 10000, tagId: 'group-category', installmentsCompleted: 0 })); expect(mockLegacy).not.toHaveBeenCalled(); expect(mockApply).toHaveBeenCalledTimes(1); await view.unmount();
  });
  test('falha de edição bloqueia envio vazio, conserva erro e oferece retry', async () => {
    mockParams.expenseId = 'plan'; mockLoad.mockRejectedValueOnce(new Error('Falha da edição'));
    const view = await render(React.createElement(Screen)); expect(view.getByText('Falha da edição')).toBeTruthy(); expect(button(view, 'Atualizar gasto').props.isDisabled).toBe(true);
    await act(async () => button(view, 'Tentar novamente').props.onPress()); await waitFor(() => expect(view.getByPlaceholderText(/Aluguel/).props.value).toBe('Aluguel de teste')); expect(mockLegacy).not.toHaveBeenCalled(); await view.unmount();
  });
  test('cadastro incerto mantém campos bloqueados e permite confirmar o mesmo material', async () => {
    const view = await render(React.createElement(Screen)); await fill(view); mockUncertain = true; await view.rerender(React.createElement(Screen));
    expect(view.getAllByTestId('input-shell').every(node => node.props.isDisabled)).toBe(true); expect(view.getByTestId('tag-selector').props.isDisabled).toBe(true);
    const confirm = button(view, 'Confirmar cadastro anterior'); expect(confirm.props.isDisabled).toBe(false); await act(async () => confirm.props.onPress()); expect(mockSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: 'Aluguel', valueInCents: 10000, tagId: 'group-category' })); await view.unmount();
  });
});
for (const [name, Screen] of [['mobile', mobileList], ['web', webList]] as const) describe(`lista recorrente ${name}`, () => {
  test('falha de leitura oculta resumo antigo e permite recarregar', async () => {
    const view = await render(React.createElement(Screen)); expect(view.getByTestId('calendar').props.items).toHaveLength(1);
    mockRows.mockResolvedValueOnce({ success: false }); await act(async () => button(view, 'Atualizar despesas recorrentes').props.onPress());
    expect(view.queryByTestId('calendar')).toBeNull(); expect(view.getByText('Erro ao obter os gastos obrigatórios.')).toBeTruthy();
    await act(async () => button(view, 'Tentar novamente').props.onPress()); expect(view.getByTestId('calendar').props.items).toHaveLength(1); await view.unmount();
  });
  test('falha de agenda não apaga dados financeiros confirmados', async () => {
    mockSync.mockResolvedValueOnce({ scheduled: 0, failed: 1 }); const view = await render(React.createElement(Screen));
    expect(view.getByTestId('calendar').props.items).toHaveLength(1); expect(view.getByText(/Dados carregados/)).toBeTruthy(); await view.unmount();
  });
  test('ação Spark incerta permanece no modal e confirma a mesma operação', async () => {
    mockAction.mockImplementationOnce(async () => { mockActionUncertain = true; throw new Error('Resposta perdida'); }).mockImplementationOnce(async () => { mockActionUncertain = false; return { success: true }; });
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const view = await render(React.createElement(Screen)); await act(async () => view.getByTestId('calendar').props.onAction('delete', row()));
      const confirm = view.getAllByTestId('recurring-button').find(node => node.props.action === 'negative')!;
      await act(async () => confirm.props.onPress()); expect(view.getByText('Resposta perdida')).toBeTruthy(); expect(button(view, 'Confirmar ação anterior')).toBeTruthy();
      await act(async () => button(view, 'Confirmar ação anterior').props.onPress()); expect(mockAction).toHaveBeenCalledTimes(2); expect(mockAction.mock.calls[1]).toEqual(mockAction.mock.calls[0]); await view.unmount();
    } finally { error.mockRestore(); }
  });
});
