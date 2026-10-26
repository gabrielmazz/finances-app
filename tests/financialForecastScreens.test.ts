import React from 'react';
import { buildFinancialForecast, type FinancialForecastPeriod } from '@/utils/financialForecast';
const mockHost = (name: string, extra: Record<string, unknown> = {}) => ({ children, ...props }: Record<string, any>) => React.createElement(name, { ...extra, ...props }, children);
const mockLoad = jest.fn(), mockChart = jest.fn((_props: any) => null);
let mockUid = 'owner', mockHidden = false;
const mockStyles = new Proxy({}, { get: (_target, key) => key === 'isDarkMode' ? false : key === 'insets' ? { top: 0 } : key === 'heroHeight' ? 180 : key === 'webDashboardClassNames' ? { webSheet: '', sheet: '' } : '' });
jest.doMock('react-native', () => ({ View: mockHost('View'), Text: mockHost('Text'), Image: () => null, Pressable: mockHost('Pressable'), ScrollView: mockHost('ScrollView'), StatusBar: () => null, RefreshControl: mockHost('RefreshControl'), useWindowDimensions: () => ({ width: 390, height: 844 }), Platform: { OS: 'android', select: (options: any) => options.android ?? options.default }, Appearance: { getColorScheme: () => 'light', addChangeListener: () => ({ remove: jest.fn() }) }, StyleSheet: { flatten: (value: unknown) => value } }));
jest.mock('react-native-css-interop', () => ({ createInteropElement: require('react').createElement }));
jest.mock('react-native-css-interop/jsx-runtime', () => require('react/jsx-runtime'));
jest.doMock('expo-router', () => ({ useFocusEffect: (callback: any) => React.useEffect(callback, [callback]) }));
jest.doMock('react-native-safe-area-context', () => ({ SafeAreaView: mockHost('View') }));
jest.doMock('expo-linear-gradient', () => ({ LinearGradient: mockHost('View') }));
jest.doMock('lucide-react-native', () => ({ WalletCards: () => null, ChevronDown: () => null, ChevronUp: () => null, Info: () => null, TrendingDown: () => null, TrendingUp: () => null }));
for (const [module, exports] of [
  ['box', { Box: mockHost('View') }], ['text', { Text: mockHost('Text') }], ['heading', { Heading: mockHost('Text') }], ['image', { Image: () => null }],
  ['button', { Button: mockHost('Button', { testID: 'forecast-button' }), ButtonText: mockHost('Text'), ButtonSpinner: () => null }],
  ['vstack', { VStack: mockHost('View') }], ['hstack', { HStack: mockHost('View') }], ['divider', { Divider: () => null }],
  ['popover', { Popover: () => null, PopoverBackdrop: () => null, PopoverBody: mockHost('View'), PopoverContent: mockHost('View') }], ['skeleton', { Skeleton: mockHost('View') }],
] as const) jest.doMock(`@/components/ui/${module}`, () => exports);
jest.doMock('@/components/ui/tabs', () => ({ Tabs: mockHost('View', { testID: 'movement-tabs' }), TabsIndicator: () => null, TabsList: mockHost('View'), TabsTrigger: mockHost('View'), TabsTriggerIcon: () => null, TabsTriggerText: mockHost('Text') }));
jest.doMock('@mantine/core', () => ({ Divider: () => null, MantineProvider: mockHost('View'), Tabs: Object.assign(mockHost('View', { testID: 'movement-tabs' }), { List: mockHost('View'), Tab: mockHost('Text') }) }));
jest.mock('@mantine/core/styles.css', () => ({}));
jest.doMock('@/components/uiverse/navigation/navigator', () => () => null);
jest.doMock('@/components/uiverse/navigation/web-screen-hero', () => () => null);
jest.doMock('@/hooks/useScreenStyle', () => ({ useScreenStyles: () => mockStyles }));
jest.doMock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { uid: mockUid } }) }));
jest.doMock('@/FirebaseConfig', () => ({ auth: { get currentUser() { return { uid: mockUid }; } } }));
jest.doMock('@/contexts/ValueVisibilityContext', () => ({ useValueVisibility: () => ({ shouldHideValues: mockHidden }), HIDDEN_VALUE_PLACEHOLDER: '****' }));
jest.doMock('@/functions/FinancialForecastFirebase', () => ({ getFinancialForecastFirebase: (...args: unknown[]) => mockLoad(...args) }));
jest.mock('@/components/uiverse/reports/financial-forecast-chart', () => ({ __esModule: true, default: (props: unknown) => mockChart(props) }));
jest.doMock('@/utils/navigation', () => ({ APP_ROUTE_PATHS: {}, navigateToRoute: jest.fn() }));
jest.doMock('@/components/ui/accordion', () => Object.fromEntries(['Accordion', 'AccordionContent', 'AccordionHeader', 'AccordionItem', 'AccordionTrigger'].map(name => [name, mockHost('View')])));
const { render, act, within, waitFor } = require('@testing-library/react-native') as typeof import('@testing-library/react-native');
const mobile = require('@/screens/mobile/FinancialForecastScreen').default, web = require('@/screens/web/FinancialForecastScreen.web').default;
const button = (view: Awaited<ReturnType<typeof render>>, text: string) => view.getAllByTestId('forecast-button').find(node => within(node).queryByText(text))!;
const snapshot = (period: FinancialForecastPeriod, openingBalanceInCents = 100000) => ({ ...buildFinancialForecast({
  asOfDate: new Date('2026-10-24T12:00:00Z'), periodInMonths: period, openingBalanceInCents,
  movements: [], mandatoryTemplates: Array.from({ length: 4 }, (_, i) => ({ id: `fixed-${i}`, type: 'expense' as const, name: `Despesa ${i + 1}`, valueInCents: 100, dueDay: 25, usesBusinessDays: false, tagId: 'food', tagName: 'Mercado', lastCompletedCycle: null, installmentTotal: null, installmentsCompleted: 0, installmentStartDate: null, installmentEndDate: null })),
  investments: [{ id: 'asset', name: 'CDB disponível', initialValueInCents: 200000, currentValueInCents: 200000, bankId: 'bank', date: new Date('2026-10-01T12:00:00Z'), redemptionTerm: '1m' }],
}), hasScheduledMonthlyOpenings: true });
beforeEach(() => { mockUid = 'owner'; mockHidden = false; jest.clearAllMocks(); mockLoad.mockReset().mockImplementation(async (_uid, period) => ({ success: true, data: snapshot(period) })); });
for (const [platform, Screen] of [['mobile', mobile], ['web', web]] as const) describe(`previsão ${platform}`, () => {
  const selectPeriod = async (view: Awaited<ReturnType<typeof render>>, period: number) => act(async () => { const tabs = view.getByTestId('movement-tabs'); (platform === 'web' ? tabs.props.onChange : tabs.props.onValueChange)(String(period)); });
  test('atualiza e recupera falha com seletor acessível, sem cenário antigo', async () => {
    const view = await render(React.createElement(Screen)); expect(view.getByText('Evolução do saldo')).toBeTruthy(); mockLoad.mockRejectedValueOnce(new Error('Falha da previsão'));
    await act(async () => button(view, 'Atualizar previsão').props.onPress()); expect(view.getByText('Falha da previsão')).toBeTruthy(); expect(view.queryByText('Evolução do saldo')).toBeNull(); expect(view.getByTestId('movement-tabs')).toBeTruthy();
    await selectPeriod(view, 6); expect(mockLoad.mock.calls.at(-1)).toEqual(['owner', 6]); expect(view.getByText('Evolução do saldo')).toBeTruthy(); expect(mockChart.mock.calls.at(-1)![0].data).toHaveLength(7); await view.unmount();
  });
  test('resposta atrasada de 3 meses não substitui o horizonte de 12', async () => {
    let finish!: (value: any) => void; mockLoad.mockReturnValueOnce(new Promise(done => { finish = done; })); const view = await render(React.createElement(Screen)); await selectPeriod(view, 12);
    expect(mockChart.mock.calls.at(-1)![0].data).toHaveLength(13); await act(async () => finish({ success: true, data: snapshot(3, 999999) })); expect(mockChart.mock.calls.at(-1)![0].data).toHaveLength(13); expect(mockChart.mock.calls.at(-1)![0].data[0].balanceInCents).toBe(100000); await view.unmount();
  });
  test('sinais de liquidez e contagem mensal não viram dinheiro; detalhes são reiniciados na recarga', async () => {
    const view = await render(React.createElement(Screen)); const chart = mockChart.mock.calls.at(-1)![0]; expect(chart.data[0].balanceInCents).toBe(100000); expect(chart.data.at(-1).balanceInCents).toBeLessThan(100000);
    expect(view.getByText(/Há saldos mensais agendados/)).toBeTruthy(); expect(view.getByText(/Informativo: não entra como resgate automático/)).toBeTruthy();
    const more = view.getAllByTestId('forecast-button').find(node => within(node).queryByText(/Mostrar mais/))!; await act(async () => more.props.onPress()); expect(view.getAllByText('Despesa 4').length).toBeGreaterThan(0);
    await act(async () => button(view, 'Atualizar previsão').props.onPress()); expect(view.queryAllByText('Mostrar menos compromissos')).toHaveLength(0); await view.unmount();
  });
  test('troca de UID descarta resultado anterior e preserva privacidade', async () => {
    mockHidden = true; let finish!: (value: any) => void; mockLoad.mockReturnValueOnce(new Promise(done => { finish = done; })); const view = await render(React.createElement(Screen)); mockUid = 'other'; await view.rerender(React.createElement(Screen));
    await waitFor(() => expect(mockChart).toHaveBeenCalled()); expect(mockLoad.mock.calls.at(-1)[0]).toBe('other'); expect(mockChart.mock.calls.at(-1)![0].shouldHideValues).toBe(true); expect(view.getAllByText('****').length).toBeGreaterThan(0);
    await act(async () => finish({ success: true, data: snapshot(3, 999999) })); expect(mockChart.mock.calls.at(-1)![0].data[0].balanceInCents).toBe(100000); await view.unmount();
  });
});
