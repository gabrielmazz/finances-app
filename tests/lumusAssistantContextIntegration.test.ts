import React from 'react';
import { act, renderHook } from '@testing-library/react-native';

const mockAuth = { currentUser: { uid: 'owner' } as { uid: string } | null };
let mockPathname = '/web/lumus-assistant';
const mockReadProfile = jest.fn();
const mockUpdateProfile = jest.fn();
const mockInvalidate = jest.fn(async () => undefined);
const mockSpeak = jest.fn();
const mockStop = jest.fn(async () => undefined);
const mockConverse = jest.fn();
const mockTranscribe = jest.fn();
const mockGetConfig = jest.fn(async () => ({ model: 'test-model', enabled: true }));
const mockGetConsent = jest.fn(async () => true);
const mockSetConsent = jest.fn(async (): Promise<void> => undefined);
const mockRevokeConsent = jest.fn(async (): Promise<void> => undefined);
let mockHidden = false;
jest.mock('@/FirebaseConfig', () => ({ get auth() { return mockAuth; } }));
jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: mockAuth.currentUser, isAuthReady: true }) }));
jest.mock('expo-router', () => ({ usePathname: () => mockPathname, router: { push: jest.fn() } }));
jest.mock('expo-speech', () => ({ speak: (...args: unknown[]) => mockSpeak(...args), stop: () => mockStop() }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock('@/utils/secureLogout', () => ({ logoutCurrentUser: jest.fn(async () => { mockAuth.currentUser = null; }) }));
jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: mockInvalidate }) }));
jest.mock('@/contexts/ThemeContext', () => ({ useAppTheme: () => ({ themeMode: 'light', setThemeMode: jest.fn() }) }));
jest.mock('@/contexts/ValueVisibilityContext', () => ({ useValueVisibility: () => ({ shouldHideValues: mockHidden, setShouldHideValues: jest.fn() }) }));
jest.mock('@/contexts/FinanceDataContext', () => ({ useFinanceData: () => ({ trustedDeviceCache: null, setTrustedDeviceCache: jest.fn(async () => undefined) }) }));
jest.mock('@/contexts/RouteVisibilityContext', () => ({ useRouteVisibility: () => ({ isRouteVisible: () => true, setRouteVisibility: jest.fn() }) }));
jest.mock('@/contexts/PostSubmitBehaviorContext', () => ({ usePostSubmitBehaviorPreferences: () => ({ getBehaviorForScreen: () => ({ shouldReturnAfterSubmit: true, returnDestination: 'homeDashboard' }), updateBehaviorForScreen: jest.fn() }) }));
jest.mock('@/functions/UserProfileFirebase', () => ({ getUserProfileFirebase: (...args: unknown[]) => mockReadProfile(...args), updateUserProfileFirebase: (...args: unknown[]) => mockUpdateProfile(...args), getUserProfileAccessSummaryFirebase: jest.fn() }));
jest.mock('@/functions/RegisterUserFirebase', () => ({ getRelatedUsersFirebase: jest.fn(async () => ({ success: true, data: [] })) }));
jest.mock('@/functions/UserRelationshipFirebase', () => ({ runUserRelationshipFirebase: jest.fn() }));
jest.mock('@/services/lumusAssistant/assistantPlatform', () => ({ assistantAiGateway: { getConfig: () => mockGetConfig(), getAvailability: async () => ({ available: true }), converse: (...args: unknown[]) => mockConverse(...args), transcribe: (...args: unknown[]) => mockTranscribe(...args) } }));
jest.mock('@/services/lumusAssistant/financeCommandService', () => ({ financeCommandService: { loadCatalog: jest.fn(async () => ({})), prepareActions: jest.fn(async () => []), retryNotification: jest.fn() } }));
jest.mock('@/services/lumusAssistant/assistantCatalogService', () => ({ resetAssistantCatalogSession: jest.fn(), toAssistantModelCatalog: () => ({}) }));
jest.mock('@/services/lumusAssistant/assistantReportService', () => ({ assistantReportService: { createReport: jest.fn() } }));
jest.mock('@/utils/assistantPreferencesStorage', () => ({ assistantPreferencesStorage: { getConsent: () => mockGetConsent(), getAutoRead: async () => false, setConsent: () => mockSetConsent(), revokeConsent: () => mockRevokeConsent(), setAutoRead: jest.fn() } }));

import { LumusAssistantProvider, useLumusAssistant } from '@/contexts/LumusAssistantContext';
import { loadLocalAnnotations } from '@/utils/localAnnotations';

const wrapper = ({ children }: React.PropsWithChildren) => React.createElement(LumusAssistantProvider, null, children);
const messageText = (messages: ReturnType<typeof useLumusAssistant>['messages']) => messages.filter(item => 'text' in item).map(item => 'text' in item ? item.text : '').join('\n');
beforeEach(() => {
	jest.clearAllMocks();
	mockGetConfig.mockResolvedValue({ model: 'test-model', enabled: true });
	mockGetConsent.mockResolvedValue(true); mockSetConsent.mockResolvedValue(undefined); mockRevokeConsent.mockResolvedValue(undefined);
	mockPathname = '/web/lumus-assistant'; mockHidden = false; mockAuth.currentUser = { uid: 'owner' };
	mockReadProfile.mockResolvedValue({ name: 'Ana', adminUser: false });
	mockUpdateProfile.mockImplementation(async (_uid, name) => name);
	mockConverse.mockResolvedValue({ text: 'Resposta de consulta', actions: [], reportRequests: [] });
	mockTranscribe.mockResolvedValue('minha transcrição');
	(globalThis as any).__resetNotificationMockState();
});

it('preserva uma alteração durante consulta paralela, exige retomar e só confirma a versão ativa', async () => {
	const { result, unmount } = await renderHook(() => useLumusAssistant(), { wrapper });
	await act(async () => { await result.current.sendMessage('Mude meu nome para Maria'); });
	await act(async () => { await result.current.sendMessage('Qual é meu perfil?'); });
	await act(async () => { await result.current.sendMessage('sim'); });
	expect(mockUpdateProfile).not.toHaveBeenCalled();
	await act(async () => { await result.current.sendMessage('Retome meu nome'); });
	expect(messageText(result.current.messages)).toContain('Maria');
	await act(async () => { await result.current.sendMessage('confirmo'); });
	expect(mockUpdateProfile).toHaveBeenCalledWith('owner', 'Maria', expect.objectContaining({ expectedName: 'Ana', isCurrent: expect.any(Function) }));
	expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ['finance', 'owner'] });
	await unmount();
});

it('mantém a conversa ao navegar, prepara IA só na primeira entrada e lê resposta com valores mascarados', async () => {
	mockPathname = '/web/home';
	const { result, rerender, unmount } = await renderHook(() => useLumusAssistant(), { wrapper });
	expect(mockGetConfig).not.toHaveBeenCalled();
	mockPathname = '/web/lumus-assistant'; await rerender({});
	await act(async () => { await result.current.sendMessage('Qual é meu perfil?'); });
	const count = result.current.messages.length;
	mockPathname = '/web/home'; await rerender({});
	mockPathname = '/web/lumus-assistant'; await rerender({});
	expect(result.current.messages).toHaveLength(count);
	expect(mockGetConfig).toHaveBeenCalledTimes(1);
	mockHidden = true; await rerender({});
	await act(async () => { result.current.setAutoReadEnabled(true); });
	mockReadProfile.mockResolvedValue({ name: 'Compra R$ 82,90', adminUser: false });
	await act(async () => { await result.current.sendMessage('Qual é meu perfil?'); });
	expect(mockSpeak).toHaveBeenCalled();
	expect(mockSpeak.mock.calls.at(-1)?.[0]).not.toContain('82,90');
	await act(async () => { await result.current.revokeConsent(); });
	expect(result.current.messages).toHaveLength(0);
	await unmount();
});

it('interrompe a sessão antes de concluir a gravação da revogação e recusa callbacks antigos', async () => {
	let finishRevocation!: () => void;
	mockRevokeConsent.mockReturnValueOnce(new Promise<void>(resolve => { finishRevocation = resolve; }));
	const { result, unmount } = await renderHook(() => useLumusAssistant(), { wrapper });
	await act(async () => { await result.current.sendMessage('Mude meu nome para Maria'); });
	const oldSend = result.current.sendMessage;
	let revoke!: Promise<void>;
	await act(async () => { revoke = result.current.revokeConsent(); });
	expect(result.current.consentGranted).toBe(false);
	expect(result.current.messages).toHaveLength(0);
	await act(async () => { await oldSend('confirmo'); });
	expect(mockUpdateProfile).not.toHaveBeenCalled();
	expect(result.current.messages).toHaveLength(0);
	await act(async () => { finishRevocation(); await revoke; });
	await unmount();
});

it('não restaura consentimento de um bootstrap que terminou depois da revogação', async () => {
	let finishConsent!: (value: boolean) => void;
	mockGetConsent.mockReturnValueOnce(new Promise<boolean>(resolve => { finishConsent = resolve; }));
	const { result, unmount } = await renderHook(() => useLumusAssistant(), { wrapper });
	await act(async () => { await result.current.revokeConsent(); finishConsent(true); });
	expect(result.current.consentGranted).toBe(false);
	await unmount();
});

it('mantém comandos locais autorizados quando a preparação do modelo falha', async () => {
	mockGetConfig.mockRejectedValueOnce(new Error('modelo indisponível'));
	const { result, unmount } = await renderHook(() => useLumusAssistant(), { wrapper });
	expect(result.current.consentGranted).toBe(true);
	await act(async () => { await result.current.sendMessage('Qual é meu perfil?'); });
	expect(mockReadProfile).toHaveBeenCalledWith('owner');
	expect(mockConverse).not.toHaveBeenCalled();
	await unmount();
});

it('retoma envios e grava a anotação depois da limpeza de efeitos com o provider ainda montado', async () => {
	const cleanups: Array<() => void> = [];
	const originalUseEffect = React.useEffect;
	const effectSpy = jest.spyOn(React, 'useEffect').mockImplementation((effect, dependencies) => originalUseEffect(() => {
		const cleanup = effect();
		if (dependencies?.length === 0 && cleanup) cleanups.push(cleanup);
		return cleanup;
	}, dependencies));
	const { result, unmount } = await renderHook(() => useLumusAssistant(), { wrapper });
	try {
		await act(async () => { await result.current.sendMessage('Qual é meu perfil?'); });
		expect(cleanups).toHaveLength(1);
		await act(async () => { cleanups[0]!(); });
		await act(async () => { await result.current.sendMessage('Crie anotação Compras: arroz e feijão'); });
		expect(messageText(result.current.messages)).toContain('Crie anotação Compras: arroz e feijão');
		expect(await loadLocalAnnotations('owner')).toEqual([expect.objectContaining({ title: 'Compras', markdown: 'arroz e feijão' })]);
	} finally {
		await unmount();
		effectSpy.mockRestore();
	}
});

it('descarta concessão de consentimento concluída depois de trocar de conta', async () => {
	let finishGrant!: () => void;
	mockSetConsent.mockReturnValueOnce(new Promise<void>(resolve => { finishGrant = resolve; }));
	const { result, rerender, unmount } = await renderHook(() => useLumusAssistant(), { wrapper });
	await act(async () => { await result.current.revokeConsent(); });
	let grant!: Promise<void>;
	await act(async () => { grant = result.current.grantConsent(); });
	mockGetConsent.mockResolvedValue(false); mockAuth.currentUser = { uid: 'another-owner' };
	await rerender({});
	await act(async () => { finishGrant(); await grant; });
	expect(result.current.consentGranted).toBe(false);
	await unmount();
});

it('recusa alteração canônica proposta pelo modelo em uma pergunta sobre perfil', async () => {
	mockConverse.mockResolvedValueOnce({ text: 'Proposta', actions: [], reportRequests: [], applicationCommands: ['Mude meu nome para Maria'] });
	const { result, unmount } = await renderHook(() => useLumusAssistant(), { wrapper });
	await act(async () => { await result.current.sendMessage('Como posso mudar meu nome?'); });
	expect(mockUpdateProfile).not.toHaveBeenCalled();
	expect(messageText(result.current.messages)).toContain('Nenhuma alteração');
	await act(async () => { await result.current.sendMessage('confirmo'); });
	expect(mockUpdateProfile).not.toHaveBeenCalled();
	await unmount();
});

it('não usa uma confirmação enviada enquanto o resumo ainda estava sendo preparado', async () => {
	let finishRead!: (profile: { name: string; adminUser: boolean }) => void;
	mockReadProfile.mockReturnValueOnce(new Promise(resolve => { finishRead = resolve; }));
	const { result, unmount } = await renderHook(() => useLumusAssistant(), { wrapper });
	let request!: Promise<void>; let prematureConfirmation!: Promise<void>;
	await act(async () => {
		request = result.current.sendMessage('Mude meu nome para Maria');
		prematureConfirmation = result.current.sendMessage('sim');
	});
	await act(async () => { finishRead({ name: 'Ana', adminUser: false }); await Promise.all([request, prematureConfirmation]); });
	expect(mockUpdateProfile).not.toHaveBeenCalled();
	expect(messageText(result.current.messages)).toContain('quando sua resposta foi enviada');
	await act(async () => { await result.current.sendMessage('confirmo'); });
	expect(mockUpdateProfile).toHaveBeenCalledTimes(1);
	await unmount();
});

it('uma negação na confirmação cancela somente o pedido local ativo', async () => {
	const { result, unmount } = await renderHook(() => useLumusAssistant(), { wrapper });
	await act(async () => { await result.current.sendMessage('Mude meu nome para Maria'); });
	await act(async () => { await result.current.sendMessage('não'); });
	await act(async () => { await result.current.sendMessage('confirmo'); });
	expect(mockUpdateProfile).not.toHaveBeenCalled();
	expect(messageText(result.current.messages)).toContain('pedido local foi cancelado');
	await unmount();
});

it('não transforma um pedido de navegação em escrita local de outro domínio', async () => {
	mockConverse.mockResolvedValueOnce({ text: 'Proposta', actions: [], reportRequests: [], applicationCommands: ['Crie anotação Inventada: conteúdo não solicitado'] });
	const { result, unmount } = await renderHook(() => useLumusAssistant(), { wrapper });
	await act(async () => { await result.current.sendMessage('Abra minha carteira de investimentos'); });
	expect(await loadLocalAnnotations('owner')).toHaveLength(0);
	expect(messageText(result.current.messages)).toContain('Nenhuma alteração');
	await unmount();
});

it('um preparo concluído depois da revogação não reinstala a intenção em uma sessão concedida novamente', async () => {
	let finishRead!: (profile: { name: string; adminUser: boolean }) => void;
	mockReadProfile.mockReturnValueOnce(new Promise(resolve => { finishRead = resolve; }));
	const { result, unmount } = await renderHook(() => useLumusAssistant(), { wrapper });
	let request!: Promise<void>;
	await act(async () => { request = result.current.sendMessage('Mude meu nome para Maria'); });
	await act(async () => { await result.current.revokeConsent(); });
	await act(async () => { finishRead({ name: 'Ana', adminUser: false }); await request; });
	await act(async () => { await result.current.grantConsent(); await result.current.sendMessage('confirmo'); });
	expect(mockUpdateProfile).not.toHaveBeenCalled();
	await unmount();
});

it('a transcrição espera a conversa e revogação durante a espera não inicia envio de áudio', async () => {
	let finishModel!: (response: unknown) => void;
	mockConverse.mockReturnValueOnce(new Promise(resolve => { finishModel = resolve; }));
	const { result, unmount } = await renderHook(() => useLumusAssistant(), { wrapper });
	let request!: Promise<void>; let transcript!: Promise<string>;
	await act(async () => { request = result.current.sendMessage('Explique o aplicativo'); });
	await act(async () => { transcript = result.current.transcribeAudio({ base64Audio: 'audio', mimeType: 'audio/wav', durationMs: 500 }); });
	expect(mockTranscribe).not.toHaveBeenCalled();
	await act(async () => { await result.current.revokeConsent(); });
	await act(async () => {
		finishModel({ text: 'explicação', actions: [], reportRequests: [] });
		await request;
		await expect(transcript).rejects.toThrow('sessão foi encerrada');
	});
	expect(mockTranscribe).not.toHaveBeenCalled();
	await unmount();
});

it('aceita texto durante uma transcrição e interpreta após liberar a chamada de áudio', async () => {
	let finishTranscript!: (value: string) => void;
	mockTranscribe.mockReturnValueOnce(new Promise<string>(resolve => { finishTranscript = resolve; }));
	const { result, unmount } = await renderHook(() => useLumusAssistant(), { wrapper });
	let transcript!: Promise<string>; let request!: Promise<void>;
	await act(async () => { transcript = result.current.transcribeAudio({ base64Audio: 'audio', mimeType: 'audio/wav', durationMs: 500 }); });
	await act(async () => { request = result.current.sendMessage('Explique o aplicativo'); });
	const modelRequestsBeforeAudioFinished = mockConverse.mock.calls.length;
	await act(async () => { finishTranscript('voz transcrita'); await Promise.all([transcript, request]); });
	expect(modelRequestsBeforeAudioFinished).toBe(0);
	expect(mockConverse).toHaveBeenCalledTimes(1);
	expect(messageText(result.current.messages)).toContain('Resposta de consulta');
	await unmount();
});
