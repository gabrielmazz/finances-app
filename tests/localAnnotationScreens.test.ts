import React from 'react';
const mockLoad = jest.fn(), mockSave = jest.fn(), mockAlert = jest.fn();
let mockUid = 'owner';
const mockHost = (name: string) => ({ children, ...props }: any) => React.createElement(name, props, children);
jest.mock('react-native-css-interop', () => ({ createInteropElement: require('react').createElement }));
jest.mock('react-native-css-interop/jsx-runtime', () => require('react/jsx-runtime'));
jest.doMock('react-native', () => ({ StyleSheet: { flatten: (style: unknown) => style }, View: mockHost('View'), StatusBar: () => null, useWindowDimensions: () => ({ height: 844 }), FlatList: ({ data, renderItem, ListEmptyComponent }: any) => React.createElement('View', null, data.length ? data.map((item: any) => React.createElement(React.Fragment, { key: item.id }, renderItem({ item }))) : ListEmptyComponent) }));
jest.doMock('react-native-safe-area-context', () => ({ SafeAreaView: mockHost('View') }));
jest.doMock('expo-router', () => ({ useFocusEffect: (effect: any) => React.useEffect(effect, [effect]) }));
jest.doMock('@/FirebaseConfig', () => ({ auth: { get currentUser() { return { uid: mockUid }; } } }));
jest.doMock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { uid: mockUid } }) }));
jest.doMock('@/hooks/useScreenStyle', () => ({ useScreenStyles: () => ({ insets: { top: 0, bottom: 0 }, heroHeight: 200, isDarkMode: false }) }));
jest.doMock('@/assets/UnDraw/annotationScreen.svg', () => () => null);
jest.doMock('@/components/uiverse/navigation/navigator', () => () => null);
jest.doMock('@/components/uiverse/feedback/notifier-alert', () => ({ showNotifierAlert: mockAlert }));
jest.doMock('@/components/uiverse/annotations/annotation-markdown-editor', () => (props: any) => React.createElement('View', { ...props, testID: 'annotation-editor' }));
jest.doMock('@/utils/localAnnotations', () => ({ ...jest.requireActual('@/utils/localAnnotations'), loadLocalAnnotations: mockLoad, saveLocalAnnotation: mockSave }));
for (const [module, exports] of [
 ['text', { Text: mockHost('Text') }], ['heading', { Heading: mockHost('Text') }], ['box', { Box: mockHost('View') }], ['vstack', { VStack: mockHost('View') }], ['hstack', { HStack: mockHost('View') }], ['image', { Image: () => null }], ['input', { Input: mockHost('View'), InputField: mockHost('TextInput') }], ['button', { Button: mockHost('Button'), ButtonText: mockHost('Text'), ButtonSpinner: () => null, ButtonIcon: () => null }], ['icon', { ArrowLeftIcon: () => null, AddIcon: () => null }],
] as const) jest.doMock(`@/components/ui/${module}`, () => exports);
const { render, act, fireEvent } = require('@testing-library/react-native') as typeof import('@testing-library/react-native');
const Screen = require('@/screens/mobile/LocalAnnotationsScreen').default;
const { createLocalAnnotation } = require('@/utils/localAnnotations');
const note = { ...createLocalAnnotation(), id: 'one', title: 'Compras', markdown: 'café' };
const button = (view: any, label: string) => { let node = view.getByText(label); while (!node.props.onPress) node = node.parent; return node; };
const press = async (view: any, label: string) => act(async () => { await button(view, label).props.onPress(); });
beforeEach(() => { globalThis.requestAnimationFrame = callback => { callback(0); return 0; }; mockUid = 'owner'; mockLoad.mockReset().mockResolvedValue([note]); mockSave.mockReset().mockResolvedValue({ annotation: note, annotations: [note] }); mockAlert.mockClear(); });

afterEach(() => { delete (globalThis as any).requestAnimationFrame; jest.restoreAllMocks(); });

test('erro de leitura bloqueia criação, não mostra vazio e permite retry', async () => {
 mockLoad.mockRejectedValueOnce(new Error('Dados preservados'));
 const view = await render(React.createElement(Screen));
 expect(view.getByText('Dados preservados')).toBeTruthy();
 expect(button(view, 'Nova anotação').props.isDisabled).toBe(true);
 expect(view.queryByText('Sua primeira página começa aqui')).toBeNull();
 await press(view, 'Tentar novamente'); expect(view.getByText('Compras')).toBeTruthy(); await view.unmount();
});
test('falha ao salvar preserva título e markdown e permite retry', async () => {
 const view = await render(React.createElement(Screen)); await press(view, 'Compras');
 await fireEvent.changeText(view.getByLabelText('Título da anotação'), 'Rascunho');
 mockSave.mockRejectedValueOnce(new Error('Sem espaço local'));
 await press(view, 'Salvar');
 expect(view.getByText('Sem espaço local')).toBeTruthy(); expect(view.getByLabelText('Título da anotação').props.value).toBe('Rascunho');
 expect(view.getByTestId('annotation-editor').props.markdown).toBe('café');
 await press(view, 'Salvar'); expect(mockSave).toHaveBeenCalledTimes(2); await view.unmount();
});
test('salvamento trava editor, campos e segundo clique', async () => {
 let finish!: (value: any) => void; mockSave.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
 const view = await render(React.createElement(Screen)); await press(view, 'Compras');
 let pending!: Promise<void>; await act(async () => { pending = button(view, 'Salvar').props.onPress(); await new Promise(resolve => setTimeout(resolve, 40)); });
 expect(view.getByLabelText('Título da anotação').props.editable).toBe(false);
 expect(view.getByTestId('annotation-editor').props.readOnly).toBe(true);
 await act(async () => button(view, 'Salvando').props.onPress()); expect(mockSave).toHaveBeenCalledTimes(1);
 await act(async () => { finish({ annotation: note, annotations: [note] }); await pending; }); await view.unmount();
});
test('leitura antiga não expõe notas depois de trocar UID', async () => {
 let finish!: (value: any) => void; mockLoad.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
 const view = await render(React.createElement(Screen)); mockUid = 'other'; mockLoad.mockResolvedValue([]); await view.rerender(React.createElement(Screen));
 await act(async () => finish([note])); expect(view.queryByText('Compras')).toBeNull(); await view.unmount();
});
test('atualização explícita recarrega a lista', async () => {
 const view = await render(React.createElement(Screen)); mockLoad.mockResolvedValue([]); await press(view, 'Atualizar anotações');
 expect(view.queryByText('Compras')).toBeNull(); expect(view.getByText('Sua primeira página começa aqui')).toBeTruthy(); await view.unmount();
});

test('conflito mantém rascunho até recarregar por escolha explícita', async () => {
 const view = await render(React.createElement(Screen)); await press(view, 'Compras');
 await fireEvent.changeText(view.getByLabelText('Título da anotação'), 'Meu rascunho');
 mockSave.mockRejectedValueOnce(new Error('A anotação mudou. Confira novamente.')); await press(view, 'Salvar');
 expect(view.getByLabelText('Título da anotação').props.value).toBe('Meu rascunho');
 mockLoad.mockResolvedValueOnce([{ ...note, title: 'Versão atual' }]); await press(view, 'Descartar rascunho e recarregar');
 expect(view.getByLabelText('Título da anotação').props.value).toBe('Versão atual'); await view.unmount();
});
test('não notifica salvamento finalizado depois da desmontagem', async () => {
 let finish!: (value: any) => void; mockSave.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
 const view = await render(React.createElement(Screen)); await press(view, 'Compras');
 let pending!: Promise<void>; await act(async () => { pending = button(view, 'Salvar').props.onPress(); await new Promise(resolve => setTimeout(resolve, 40)); });
 await view.unmount(); await act(async () => { finish({ annotation: note, annotations: [note] }); await pending; });
 expect(mockAlert).not.toHaveBeenCalled();
});
