import React from 'react';
const mockLoad = jest.fn(), mockSave = jest.fn(), mockCopy = jest.fn(), mockAlert = jest.fn();
let mockUid = 'owner', mockWeb = false;
let mockState: any = null;
const mockHost = (name: string, extra: Record<string, unknown> = {}) => ({ children, ...props }: any) => React.createElement(mockWeb ? 'div' : name, mockWeb ? { className: props.className } : { ...extra, ...props }, children);
const mockInput = React.forwardRef((props: any, ref: any) => { React.useImperativeHandle(ref, () => ({ focus: jest.fn() })); return React.createElement('TextInput', props); });
jest.mock('react-native-css-interop', () => ({ createInteropElement: require('react').createElement }));
jest.mock('react-native-css-interop/jsx-runtime', () => require('react/jsx-runtime'));
jest.doMock('react-native', () => ({ View: mockHost('View'), Image: () => null, ScrollView: mockHost('ScrollView'), KeyboardAvoidingView: mockHost('View'), TextInput: mockHost('TextInput'), Keyboard: { dismiss: jest.fn() }, Platform: { OS: 'android' }, useWindowDimensions: () => ({ height: 844, width: 390 }), StyleSheet: { flatten: (style: unknown) => style } }));
jest.doMock('react-native-safe-area-context', () => ({ SafeAreaView: mockHost('View'), useSafeAreaInsets: () => ({ top: 0 }) }));
jest.doMock('expo-router', () => ({ useFocusEffect: (effect: any) => React.useEffect(effect, [effect]), Link: () => null }));
jest.doMock('@/FirebaseConfig', () => ({ auth: { get currentUser() { return { uid: mockUid }; } } }));
jest.doMock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { uid: mockUid } }) }));
jest.doMock('@/contexts/ThemeContext', () => ({ useAppTheme: () => ({ isDarkMode: false }) }));
jest.doMock('@/contexts/RouteVisibilityContext', () => ({ useRouteVisibility: () => ({ isRouteVisible: () => false }) }));
jest.doMock('expo-clipboard', () => ({ setStringAsync: (...args: unknown[]) => mockCopy(...args) }));
jest.doMock('@/functions/UserProfileFirebase', () => ({ getUserProfileFirebase: mockLoad, updateUserProfileFirebase: mockSave, getProfileNameError: (name: string) => name.trim() ? null : 'Informe seu nome.', getUserProfileAccessSummaryFirebase: async () => ({ isAdmin: false, monitoredRecordsCount: 0 }) }));
jest.doMock('@/functions/RegisterUserFirebase', () => ({ getRelatedUsersFirebase: async () => ({ success: true, data: [] }) }));
jest.doMock('@/hooks/useUserProfile', () => { const actual = jest.requireActual('@/hooks/useUserProfile'); return { useUserProfile: () => mockState ?? actual.useUserProfile() }; });
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
const { render, act, fireEvent, within } = require('@testing-library/react-native') as typeof import('@testing-library/react-native');
const Mobile = require('@/screens/mobile/PerfilPersonScreen').default;
const Web = require('@/screens/web/PerfilPersonScreen.web').default;
const { renderToStaticMarkup } = require('react-dom/server.node');
const profile = { uid: 'owner', name: 'Maria', email: 'maria@example.com', createdAt: null, adminUser: false };
const button = (view: any, label: string) => view.getAllByTestId('profile-button').find((node: any) => within(node).queryByText(label))!;
beforeEach(() => { mockUid = 'owner'; mockWeb = false; mockState = null; mockLoad.mockReset().mockResolvedValue(profile); mockSave.mockReset().mockImplementation(async (_uid: string, name: string) => name.trim()); mockCopy.mockReset().mockResolvedValue(true); mockAlert.mockClear(); });

test('mobile atualiza sem apagar o nome em edição e salva contra a nova versão', async () => {
  const view = await render(React.createElement(Mobile));
  expect(view.queryByText('Relacionar usuário')).toBeNull();
  expect(view.getByDisplayValue('maria@example.com').props.editable).toBe(false);
  await fireEvent.changeText(view.getByLabelText('Nome'), 'Maria Silva');
  mockLoad.mockResolvedValueOnce({ ...profile, name: 'Maria remota' });
  await act(async () => button(view, 'Atualizar perfil').props.onPress());
  expect(view.getByLabelText('Nome').props.value).toBe('Maria Silva');
  await act(async () => button(view, 'Salvar alterações').props.onPress());
  expect(mockSave).toHaveBeenCalledWith('owner', 'Maria Silva', expect.objectContaining({ expectedName: 'Maria remota' }));
  expect(view.getByText('Perfil atualizado.')).toBeTruthy(); await view.unmount();
});

test('mobile mostra conflito, mantém rascunho e permite descartar', async () => {
  const view = await render(React.createElement(Mobile));
  await fireEvent.changeText(view.getByLabelText('Nome'), 'Rascunho');
  mockSave.mockRejectedValueOnce(new Error('Seu nome mudou. Confira o perfil e confirme novamente.'));
  await act(async () => button(view, 'Salvar alterações').props.onPress());
  expect(view.getByText(/seu rascunho será preservado/)).toBeTruthy();
  expect(view.getByLabelText('Nome').props.value).toBe('Rascunho');
  await act(async () => button(view, 'Descartar alterações').props.onPress());
  expect(view.getByLabelText('Nome').props.value).toBe('Maria'); await view.unmount();
});

test('mobile não notifica cópia que termina após desmontar a tela', async () => {
  let finish!: (value: boolean) => void;
  mockCopy.mockReturnValueOnce(new Promise(done => { finish = done; }));
  const view = await render(React.createElement(Mobile));
  await act(async () => view.getByLabelText('Copiar meu ID').props.onPress());
  await view.unmount(); await act(async () => finish(true));
  expect(mockAlert).not.toHaveBeenCalled();
});

function webMarkup(extra: Record<string, unknown> = {}) {
  mockWeb = true;
  mockState = { profile, name: profile.name, loading: false, saving: false, dirty: true, loadError: '', accessSummaryLoading: false, accessSummaryError: false, accessSummary: { isAdmin: false, monitoredRecordsCount: 0 }, relatedUsersLoading: false, relatedUsersError: false, relatedUsers: [], reload: jest.fn(), ...extra };
  return renderToStaticMarkup(React.createElement(Web));
}
test('HTML Web mantém edição com resumo indisponível, campos de leitura e vínculo oculto', () => {
  const html = webMarkup({ accessSummaryError: true, accessSummary: null });
  expect(html).toContain('Indisponível'); expect(html).toContain('Atualizar perfil');
  expect(html).toMatch(/<input[^>]*id="profile-name"[^>]*value="Maria"/);
  expect(html).toMatch(/<input[^>]*id="profile-email"[^>]*readOnly=""/);
  expect(html).not.toContain('Relacionar usuário'); expect(html).toContain('Salvar alterações');
});
test('HTML Web bloqueia recarga e edição durante salvamento', () => {
  const html = webMarkup({ saving: true });
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Atualizar perfil/);
  expect(html).toMatch(/<input[^>]*id="profile-name"[^>]*disabled=""/);
  expect(html).toContain('Salvando…');
});
test('HTML Web oferece retry após falha de leitura sem expor formulário antigo', () => {
  const html = webMarkup({ loadError: 'Não foi possível carregar seu perfil.' });
  expect(html).toContain('Tentar novamente'); expect(html).not.toContain('<form');
});
