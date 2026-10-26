import React from 'react';
const mockLoad = jest.fn(), mockSave = jest.fn(), mockCopy = jest.fn(), mockAlert = jest.fn();
let mockUid = 'owner', mockWeb = false;
const mockApply = jest.fn(), mockBack = jest.fn();
const mockHost = (name: string, extra: Record<string, unknown> = {}) => ({ children, ...props }: any) => React.createElement(mockWeb ? 'div' : name, mockWeb ? { className: props.className } : { ...extra, ...props }, children);
const mockInput = React.forwardRef((props: any, ref: any) => { React.useImperativeHandle(ref, () => ({ focus: jest.fn() })); return React.createElement('TextInput', props); });
jest.mock('react-native-css-interop', () => ({ createInteropElement: require('react').createElement }));
jest.mock('react-native-css-interop/jsx-runtime', () => require('react/jsx-runtime'));
jest.doMock('react-native', () => ({ View: mockHost('View'), Image: () => null, ScrollView: mockHost('ScrollView'), KeyboardAvoidingView: mockHost('View'), TextInput: mockHost('TextInput'), Keyboard: { dismiss: jest.fn() }, Platform: { OS: 'android' }, useWindowDimensions: () => ({ height: 844, width: 390 }), StyleSheet: { flatten: (style: unknown) => style } }));
jest.doMock('react-native-safe-area-context', () => ({ SafeAreaView: mockHost('View'), useSafeAreaInsets: () => ({ top: 0 }) }));
jest.doMock('expo-router', () => ({ useIsFocused: () => true, useLocalSearchParams: () => ({ fromProfile: '1' }), useFocusEffect: (effect: any) => React.useEffect(effect, [effect]), Link: () => null }));
jest.doMock('@/FirebaseConfig', () => ({ auth: { get currentUser() { return { uid: mockUid }; } } }));
jest.doMock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { uid: mockUid } }) }));
jest.doMock('@/contexts/ThemeContext', () => ({ useAppTheme: () => ({ isDarkMode: false }) }));
jest.doMock('@/contexts/RouteVisibilityContext', () => ({ useRouteVisibility: () => ({ isRouteVisible: () => false }) }));
jest.doMock('expo-clipboard', () => ({ setStringAsync: (...args: unknown[]) => mockCopy(...args) }));
jest.doMock('@/functions/UserRelationshipFirebase', () => ({ loadUserRelationshipsFirebase: mockLoad, runUserRelationshipFirebase: mockSave }));
jest.doMock('@/hooks/useKeyboardAwareScroll', () => ({ useKeyboardAwareScroll: () => ({ contentBottomPadding: 0, handleInputFocus: jest.fn() }) }));
jest.doMock('@/components/uiverse/feedback/notifier-alert', () => ({ showNotifierAlert: mockAlert }));
jest.doMock('@/components/uiverse/shared/screen-dismiss-keyboard', () => ({ ScreenDismissKeyboard: mockHost('View') }));
jest.doMock('@/components/mobile/navigation/navigator.native', () => () => null);
jest.doMock('@/components/mobile/navigation/web-screen-hero.native', () => () => null);
jest.doMock('@/components/web/navigation/navigator.web', () => () => null);
jest.doMock('@/components/web/navigation/web-screen-hero.web', () => () => null);
for (const [module, exports] of [
  ['text', { Text: mockHost('Text') }], ['heading', { Heading: mockHost('Text') }], ['hstack', { HStack: mockHost('View') }],
  ['input', { Input: mockHost('View'), InputField: mockInput }],
  ['button', { Button: mockHost('Button', { testID: 'profile-button' }), ButtonText: mockHost('Text'), ButtonIcon: () => null }], ['icon', { CopyIcon: () => null }],
] as const) jest.doMock(`@/components/ui/${module}`, () => exports);
jest.doMock('lucide-react', () => ({ Copy: () => null, UsersRound: () => null }));
jest.doMock('@/utils/navigation', () => ({ APP_ROUTE_PATHS: {}, createAppHref: jest.fn(), navigateToHomeDashboard: jest.fn(), navigateToRoute: jest.fn() }));
jest.doMock('@/components/uiverse/navigation/navigator', () => () => null);
jest.doMock('@/components/uiverse/navigation/web-screen-hero', () => () => null);
jest.doMock('@/components/ui/image', () => ({ Image: () => null }));
jest.doMock('@/hooks/useScreenStyle', () => ({ useScreenStyles: () => ({ isDarkMode: false, heroHeight: 250, insets: { top: 0 }, webDashboardClassNames: {} }) }));
jest.doMock('@/hooks/usePostSubmitBehavior', () => ({ usePostSubmitBehavior: () => mockApply }));
jest.doMock('@/utils/navigation', () => ({ APP_ROUTE_PATHS: { profile: 'profile' }, navigateBackOrRoute: mockBack, replaceToRoute: mockBack }));
const { render, act, fireEvent, within } = require('@testing-library/react-native') as typeof import('@testing-library/react-native');
const Mobile = require('@/screens/mobile/AddUserRelationScreen').default;
const Web = require('@/screens/web/AddUserRelationScreen.web').default;
const button = (view: any, label: string) => view.getAllByTestId('profile-button').find((node: any) => within(node).queryByText(label))!;
const preview = { relatedUserName: 'Bia', hasIncomingInvite: true, fingerprint: 'snapshot' };
beforeEach(() => { mockUid = 'owner'; mockWeb = false; mockLoad.mockReset().mockResolvedValue({ incoming: [{ id: 'target', name: 'Bia' }], outgoing: [], linked: [] }); mockSave.mockReset().mockImplementation(async (_uid: string, request: any) => request.action === 'preview' ? preview : { status: 'linked' }); mockApply.mockClear(); mockAlert.mockClear(); mockBack.mockClear(); });
for (const [platform, Screen] of [['mobile', Mobile], ['web', Web]] as const) describe(`vínculos ${platform}`, () => {
  test('revisa convite, confirma uma vez e conserva o retorno ao perfil', async () => {
    const view = await render(React.createElement(Screen));
    await act(async () => button(view, 'Voltar ao perfil').props.onPress()); expect(mockBack).toHaveBeenCalledWith('profile');
    await act(async () => button(view, 'Revisar convite de Bia').props.onPress()); expect(mockSave).toHaveBeenCalledTimes(1); expect(mockApply).not.toHaveBeenCalled();
    expect(view.getByText(/Aceitar o convite de Bia/)).toBeTruthy();
    await act(async () => button(view, 'Confirmar aceite').props.onPress()); expect(mockSave).toHaveBeenCalledTimes(2); expect(mockAlert).toHaveBeenCalledTimes(1); expect(mockApply).toHaveBeenCalledTimes(1); await view.unmount();
  });
  test('falha de leitura oferece retry e não mostra lista vazia como confirmação', async () => {
    mockLoad.mockRejectedValueOnce(new Error('offline')); const view = await render(React.createElement(Screen));
    expect(view.getByText(/Não foi possível carregar seus vínculos/)).toBeTruthy(); expect(view.queryByText('Nenhum convite recebido.')).toBeNull();
    expect(button(view, 'Conferir convite').props.isDisabled).toBe(true);
    await act(async () => button(view, 'Tentar novamente').props.onPress()); expect(view.getByText('Bia')).toBeTruthy(); await view.unmount();
  });
  test('confirmação incerta bloqueia campos e recupera a mesma operação', async () => {
    const view = await render(React.createElement(Screen)); await act(async () => button(view, 'Revisar convite de Bia').props.onPress());
    mockSave.mockRejectedValueOnce(new Error('response lost')); await act(async () => button(view, 'Confirmar aceite').props.onPress());
    expect(view.getByLabelText('ID do usuário').props.editable).toBe(false); expect(button(view, 'Atualizar vínculos').props.isDisabled).toBe(true); expect(button(view, 'Cancelar revisão').props.isDisabled).toBe(true);
    await act(async () => button(view, 'Confirmar operação anterior').props.onPress()); expect(mockSave.mock.calls[2][1].clientActionId).toBe(mockSave.mock.calls[1][1].clientActionId); expect(mockAlert).toHaveBeenCalledTimes(1); await view.unmount();
  });
  test('resposta após saída não notifica nem aplica pós-submit', async () => {
    const view = await render(React.createElement(Screen)); await act(async () => button(view, 'Revisar convite de Bia').props.onPress());
    let finish!: (value: any) => void; mockSave.mockReturnValueOnce(new Promise(done => { finish = done; }));
    await act(async () => button(view, 'Confirmar aceite').props.onPress()); await view.unmount();
    await act(async () => finish({ status: 'linked' })); expect(mockAlert).not.toHaveBeenCalled(); expect(mockApply).not.toHaveBeenCalled();
  });
});
