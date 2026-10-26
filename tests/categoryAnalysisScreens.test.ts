import React from 'react';
import type { CategoryAnalysisData } from '@/functions/CategoryAnalysisFirebase';
const mockHost = (name: string, extra: Record<string, unknown> = {}) => ({ children, ...props }: Record<string, any>) => React.createElement(name, { ...extra, ...props }, children);
const mockLoad = jest.fn(), mockExport = jest.fn(), mockAlert = jest.fn(), mockDonut = jest.fn((_props: any) => null);
let mockUid = 'owner', mockHidden = false;
const mockStyles = new Proxy({}, { get: (_target, key) => key === 'isDarkMode' ? false : key === 'insets' ? { top: 0 } : key === 'heroHeight' ? 180 : key === 'webDashboardClassNames' ? { webSheet: '', sheet: '' } : '' });
jest.doMock('react-native', () => ({ View: mockHost('View'), Text: mockHost('Text'), Image: () => null, Pressable: mockHost('Pressable'), ScrollView: mockHost('ScrollView'), StatusBar: () => null, RefreshControl: mockHost('RefreshControl'), useWindowDimensions: () => ({ width: 390, height: 844 }), Platform: { OS: 'android', select: (options: any) => options.android ?? options.default }, Appearance: { getColorScheme: () => 'light', addChangeListener: () => ({ remove: jest.fn() }) }, StyleSheet: { flatten: (value: unknown) => value } }));
jest.mock('react-native-css-interop', () => ({ createInteropElement: require('react').createElement }));
jest.mock('react-native-css-interop/jsx-runtime', () => require('react/jsx-runtime'));
jest.doMock('expo-router', () => ({ useFocusEffect: (callback: any) => React.useEffect(callback, [callback]) }));
jest.doMock('react-native-safe-area-context', () => ({ SafeAreaView: mockHost('View') }));
jest.doMock('expo-linear-gradient', () => ({ LinearGradient: mockHost('View') }));
jest.doMock('lucide-react-native', () => ({ Download: () => null, Info: () => null, TrendingDown: () => null, TrendingUp: () => null }));
jest.doMock('react-native-gifted-charts', () => ({ PieChart: mockHost('Pie', { testID: 'bank-pie' }) }));
for (const [module, exports] of [
  ['box', { Box: mockHost('View') }], ['text', { Text: mockHost('Text') }], ['heading', { Heading: mockHost('Text') }], ['image', { Image: () => null }],
  ['button', { Button: mockHost('Button', { testID: 'analysis-button' }), ButtonText: mockHost('Text'), ButtonSpinner: () => null }],
  ['vstack', { VStack: mockHost('View') }], ['hstack', { HStack: mockHost('View') }], ['divider', { Divider: () => null }],
  ['popover', { Popover: () => null, PopoverBackdrop: () => null, PopoverBody: mockHost('View'), PopoverContent: mockHost('View') }], ['skeleton', { Skeleton: mockHost('View') }],
] as const) jest.doMock(`@/components/ui/${module}`, () => exports);
jest.doMock('@/components/ui/tabs', () => ({ Tabs: mockHost('View', { testID: 'movement-tabs' }), TabsIndicator: () => null, TabsList: mockHost('View'), TabsTrigger: mockHost('View'), TabsTriggerIcon: () => null, TabsTriggerText: mockHost('Text') }));
jest.doMock('@mantine/core', () => ({ Divider: () => null, MantineProvider: mockHost('View'), Tabs: Object.assign(mockHost('View', { testID: 'movement-tabs' }), { List: mockHost('View'), Tab: mockHost('Text') }) }));
jest.mock('@mantine/core/styles.css', () => ({}));
jest.doMock('@/components/uiverse/navigation/navigator', () => () => null);
jest.doMock('@/components/uiverse/navigation/web-screen-hero', () => () => null);
jest.doMock('@/components/uiverse/categories/tag-actionsheet-selector', () => mockHost('TagSelector', { testID: 'tag-selector' }));
jest.mock('@/components/uiverse/categories/category-analysis-bank-donut-chart', () => ({ __esModule: true, default: (props: unknown) => mockDonut(props) }));
jest.mock('@/components/uiverse/categories/category-analysis-monthly-line-chart', () => () => null);
jest.doMock('@/components/uiverse/categories/category-analysis-period-fields', () => mockHost('View', { testID: 'period-fields' }));
jest.doMock('@/components/uiverse/categories/category-analysis-movement-pagination', () => () => null);
jest.doMock('@/hooks/useTagIcons', () => ({ TagIcon: () => null }));
jest.doMock('@/hooks/useScreenStyle', () => ({ useScreenStyles: () => mockStyles }));
jest.doMock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { uid: mockUid } }) }));
jest.doMock('@/FirebaseConfig', () => ({ auth: { get currentUser() { return { uid: mockUid }; } } }));
jest.doMock('@/contexts/ValueVisibilityContext', () => ({ useValueVisibility: () => ({ shouldHideValues: mockHidden }), HIDDEN_VALUE_PLACEHOLDER: '****' }));
jest.doMock('@/functions/CategoryAnalysisFirebase', () => ({ getCategoryAnalysisFirebase: (...args: unknown[]) => mockLoad(...args) }));
jest.doMock('@/utils/pdfFileName', () => ({ buildPdfFileName: () => 'analise.pdf' }));
jest.doMock('@/utils/reportExport', () => ({ exportHtmlReport: (...args: unknown[]) => mockExport(...args) }));
jest.doMock('@/components/uiverse/feedback/notifier-alert', () => ({ showNotifierAlert: mockAlert }));
const { render, act, within, waitFor } = require('@testing-library/react-native') as typeof import('@testing-library/react-native');
const mobile = require('@/screens/mobile/CategoryAnalysisScreen').default, web = require('@/screens/web/CategoryAnalysisScreen.web').default;
const button = (view: Awaited<ReturnType<typeof render>>, label: string) => view.getAllByTestId('analysis-button').find(node => within(node).queryByText(label))!;
const snapshot = (): CategoryAnalysisData => {
  const expense = { currentInCents: 10000, historicalAverageInCents: 5000, deltaInCents: 5000, deltaPercent: 100, status: 'above' as const, currentCount: 2, historicalCount: 3 };
  const gain = { ...expense, currentInCents: 5000, historicalAverageInCents: 0, deltaInCents: 5000, deltaPercent: null, status: 'no-history' as const, currentCount: 1 };
  const tag = { id: 'food', name: 'Alimentação do grupo', usageType: 'both' as const, isMandatoryExpense: false, isMandatoryGain: false, icon: null, currentExpenseInCents: 10000, currentGainInCents: 5000, movementCount: 3 };
  const flow = (id: string, name: string, valueInCents: number) => ({ id, name, type: 'expense' as const, valueInCents, date: new Date(), bankId: 'bank', bankName: 'Banco', isCash: false, explanation: null });
  return { tags: [tag], defaultTagId: 'food', baselineMonthCount: 3, generatedAt: new Date(), reportsByTagId: { food: { tagId: 'food', tagName: tag.name, currentMonthLabel: 'Mês atual', baselineMonthCount: 3, months: [], expense, gain, historyPeriodLabel: 'Histórico de teste', comparisonLabel: 'Dias equivalentes', currentPeriodLabel: 'Parcial de teste', movements: [flow('original', 'Compra original', 20000), flow('reverse', 'Estorno: Mercado', -10000), { ...flow('gain', 'Receita recebida', 5000), type: 'gain' }], bankBreakdown: [{ id: 'bank', name: 'Banco A', colorHex: null, isCash: false, expenseInCents: 20000, gainInCents: 5000, movementCount: 1 }, { id: 'other', name: 'Banco B', colorHex: null, isCash: false, expenseInCents: -10000, gainInCents: 0, movementCount: 1 }] } } };
};
beforeEach(() => { mockUid = 'owner'; mockHidden = false; jest.clearAllMocks(); mockLoad.mockReset().mockImplementation(async () => ({ success: true, data: snapshot() })); mockExport.mockReset().mockResolvedValue({ status: 'printed' }); });
for (const [platform, Screen] of [['mobile', mobile], ['web', web]] as const) describe(`análise ${platform}`, () => {
  test('atualiza, remove relatório em falha e permite retry', async () => {
    const view = await render(React.createElement(Screen)); expect(view.getByTestId('tag-selector').props.options[0].name).toBe('Alimentação do grupo');
    mockLoad.mockRejectedValueOnce(new Error('Falha da leitura')); await act(async () => button(view, 'Atualizar análise').props.onPress()); expect(view.getByText('Falha da leitura')).toBeTruthy(); expect(view.queryByTestId('tag-selector')).toBeNull(); expect(button(view, 'Baixar análise em PDF')).toBeUndefined();
    await act(async () => button(view, 'Tentar novamente').props.onPress()); expect(view.getByTestId('tag-selector')).toBeTruthy(); await view.unmount();
  });
  test('conserva estorno negativo, muda o tipo e exporta o recorte correto', async () => {
    const view = await render(React.createElement(Screen)); expect(view.getByText('Estorno: Mercado')).toBeTruthy(); expect(view.queryByTestId('bank-pie')).toBeNull(); expect(mockDonut).not.toHaveBeenCalled(); const previousExport = button(view, 'Baixar análise em PDF').props.onPress; await act(async () => button(view, 'Baixar análise em PDF').props.onPress());
    expect(mockExport.mock.calls[0][0].html).toContain('Estorno: Mercado'); expect(mockExport.mock.calls[0][0].html).not.toContain('Receita recebida');
    await act(async () => { const tabs = view.getByTestId('movement-tabs'); (platform === 'web' ? tabs.props.onChange : tabs.props.onValueChange)('gain'); });
    await act(async () => previousExport()); expect(mockExport).toHaveBeenCalledTimes(1);
    await act(async () => button(view, 'Baixar análise em PDF').props.onPress()); expect(mockExport.mock.calls[1][0].html).toContain('Receita recebida'); expect(mockExport.mock.calls[1][0].html).not.toContain('Estorno: Mercado'); await view.unmount();
  });
  test('PDF respeita privacidade e impede exportação simultânea', async () => {
    mockHidden = true; let finish!: (value: any) => void; mockExport.mockReturnValueOnce(new Promise(done => { finish = done; }));
    const view = await render(React.createElement(Screen)); const click = button(view, 'Baixar análise em PDF').props.onPress; let pending!: Promise<unknown>;
    await act(async () => { pending = click(); click(); }); expect(mockExport).toHaveBeenCalledTimes(1); expect(mockExport.mock.calls[0][0].html).toContain('****'); expect(mockExport.mock.calls[0][0].html).not.toContain('200,00');
    mockUid = 'other'; await view.rerender(React.createElement(Screen)); await act(async () => finish({ status: 'printed' })); await pending; expect(mockAlert).not.toHaveBeenCalled(); await view.unmount();
  });
  test('troca de sessão descarta consulta anterior e usa o novo UID', async () => {
    let finish!: (value: any) => void; mockLoad.mockReturnValueOnce(new Promise(done => { finish = done; })); const view = await render(React.createElement(Screen)); mockUid = 'other'; await view.rerender(React.createElement(Screen));
    await waitFor(() => expect(view.getByTestId('tag-selector')).toBeTruthy()); expect(mockLoad.mock.calls.at(-1)[0]).toBe('other'); await act(async () => finish({ success: true, data: { ...snapshot(), tags: [] } })); expect(view.getByTestId('tag-selector')).toBeTruthy(); await view.unmount();
  });
});
