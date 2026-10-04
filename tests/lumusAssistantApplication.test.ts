const mockAuth = { currentUser: { uid: 'owner' } as { uid: string } | null };
const mockReadProfile = jest.fn();
const mockUpdateProfile = jest.fn();
const mockReadAccessSummary = jest.fn();
const mockRelationships = jest.fn();
const mockRelationshipCommand = jest.fn();
jest.mock('@/FirebaseConfig', () => ({ get auth() { return mockAuth; } }));
jest.mock('@/functions/UserProfileFirebase', () => ({
	getUserProfileFirebase: (...args: unknown[]) => mockReadProfile(...args),
	updateUserProfileFirebase: (...args: unknown[]) => mockUpdateProfile(...args),
	getUserProfileAccessSummaryFirebase: (...args: unknown[]) => mockReadAccessSummary(...args),
}));
jest.mock('@/functions/RegisterUserFirebase', () => ({
	getRelatedUsersFirebase: (...args: unknown[]) => mockRelationships(...args),
}));
jest.mock('@/functions/UserRelationshipFirebase', () => ({ runUserRelationshipFirebase: (...args: unknown[]) => mockRelationshipCommand(...args) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }));

import {
	executeAssistantApplicationCommand,
	parseAssistantApplicationCommand,
	prepareAssistantApplicationCommand,
	parseAssistantApplicationBatch,
	prepareAssistantApplicationBatch,
	executeAssistantApplicationBatch,
	clearAssistantApplicationBatchCheckpoints,
	resolveAssistantApplicationChoice,
	summarizeAssistantApplicationBatch,
	type AssistantApplicationAdapters,
} from '@/services/lumusAssistant/assistantApplicationService';
import { loadLocalAnnotations, saveLocalAnnotations } from '@/utils/localAnnotations';

const adapters: AssistantApplicationAdapters = {
	themeMode: 'light', shouldHideValues: false, trustedDeviceCache: false,
	setThemeMode: jest.fn(), setShouldHideValues: jest.fn(), setTrustedDeviceCache: jest.fn(async () => undefined),
	isRouteVisible: jest.fn(() => true), setRouteVisibility: jest.fn(),
	getBehaviorForScreen: () => ({ shouldReturnAfterSubmit: true, returnDestination: 'homeDashboard', shouldClearFieldsAfterSubmit: false }),
	updateBehaviorForScreen: jest.fn(),
};

beforeEach(() => {
	jest.clearAllMocks();
	clearAssistantApplicationBatchCheckpoints('owner');
	mockAuth.currentUser = { uid: 'owner' };
	mockReadProfile.mockResolvedValue({ uid: 'owner', name: 'Ana', email: 'private@example.com', adminUser: false });
	mockUpdateProfile.mockImplementation(async (_uid: string, name: string) => name.trim());
	mockReadAccessSummary.mockResolvedValue({ isAdmin: false, monitoredRecordsCount: 3 });
	mockRelationships.mockResolvedValue({ success: true, data: [{ uid: 'secret-target', email: 'target@example.com', name: 'Maria' }] });
	mockRelationshipCommand.mockResolvedValue({ relatedUserName: 'Maria', fingerprint: 'prepared-snapshot', changed: true });
	(adapters.isRouteVisible as jest.Mock).mockReturnValue(true);
	(globalThis as any).__resetNotificationMockState();
});

it('cancela durante uma operação em andamento sem alegar rollback e limpar a sessão impede o próximo item', async () => {
	let finish!: () => void;
	(adapters.setThemeMode as jest.Mock).mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
	const prepared = await prepareAssistantApplicationBatch('owner', parseAssistantApplicationBatch('Ative o tema escuro; Oculte os valores')!, adapters);
	const running = executeAssistantApplicationBatch('owner', prepared.batch!, adapters);
	await Promise.resolve();
	clearAssistantApplicationBatchCheckpoints('owner');
	finish();
	const result = await running;
	expect(result).toMatchObject({ completed: 1, pending: 1, cancelled: true });
	expect(adapters.setShouldHideValues).not.toHaveBeenCalled();
});

it('processa 256 itens sem truncar, preserva a identidade por item e um retry não duplica a coleção', async () => {
	const commands = parseAssistantApplicationBatch(Array.from({ length: 256 }, (_, index) => `Crie uma anotação chamada Item ${index + 1}: conteúdo ${index + 1}`).join('; '))!;
	const prepared = await prepareAssistantApplicationBatch('owner', commands, adapters);
	const progress = jest.fn();
	const result = await executeAssistantApplicationBatch('owner', prepared.batch!, adapters, { onProgress: progress });
	expect(result).toMatchObject({ completed: 256, failed: 0, pending: 0, total: 256 });
	expect(new Set(result.results.map(item => item.id)).size).toBe(256);
	expect(await loadLocalAnnotations('owner')).toHaveLength(256);
	expect(progress).toHaveBeenLastCalledWith({ total: 256, completed: 256, failed: 0, pending: 0 });
	await executeAssistantApplicationBatch('owner', prepared.batch!, adapters);
	expect(await loadLocalAnnotations('owner')).toHaveLength(256);
});

it('abre destinos do registro central com parâmetros e guarda, e logout só informa sucesso se a sessão realmente encerrar', async () => {
	const navigationAdapters = { ...adapters, navigate: jest.fn(), logout: jest.fn(async () => undefined) };
	const command = parseAssistantApplicationCommand('Abra configurações')!;
	await expect(executeAssistantApplicationCommand('owner', command, navigationAdapters)).resolves.toMatchObject({ success: true });
	expect(navigationAdapters.navigate).toHaveBeenCalledWith(expect.stringMatching(/\/home$/), { tab: '2' });
	(adapters.isRouteVisible as jest.Mock).mockReturnValue(false);
	await expect(executeAssistantApplicationCommand('owner', parseAssistantApplicationCommand('Abra anotações')!, navigationAdapters)).resolves.toMatchObject({ success: false });
	expect(navigationAdapters.navigate).toHaveBeenCalledTimes(1);
	await expect(executeAssistantApplicationCommand('owner', parseAssistantApplicationCommand('Saia da conta')!, navigationAdapters)).resolves.toMatchObject({ success: false });
	navigationAdapters.logout.mockImplementationOnce(async () => { mockAuth.currentUser = null; });
	await expect(executeAssistantApplicationCommand('owner', parseAssistantApplicationCommand('Saia da conta')!, navigationAdapters)).resolves.toMatchObject({ success: true });
});

it('resolve alternativas de anotações pela posição exibida, preserva o alvo e consulta preferências específicas', async () => {
	await executeAssistantApplicationCommand('owner', parseAssistantApplicationCommand('Crie uma anotação chamada Viagem Paris: primeiro')!, adapters);
	await executeAssistantApplicationCommand('owner', parseAssistantApplicationCommand('Crie uma anotação chamada Viagem Roma: segundo')!, adapters);
	await executeAssistantApplicationCommand('owner', parseAssistantApplicationCommand('Crie uma anotação chamada Trabalho: terceiro')!, adapters);
	const command = parseAssistantApplicationCommand('Altere a anotação Viagem: texto novo')!;
	const ambiguous = await prepareAssistantApplicationCommand('owner', command, adapters);
	expect(ambiguous.result?.choices).toHaveLength(2);
	const chosen = resolveAssistantApplicationChoice(command, ambiguous.result!, 'a segunda');
	expect(chosen).toMatchObject({ targetId: ambiguous.result!.choices![1].value });
	expect(resolveAssistantApplicationChoice(command, ambiguous.result!, 'antes mostre meu perfil')).toBeNull();
	const prepared = await prepareAssistantApplicationCommand('owner', chosen!, adapters);
	await executeAssistantApplicationCommand('owner', prepared.command!, adapters);
	expect((await loadLocalAnnotations('owner')).find(note => note.id === (chosen as { targetId: string }).targetId)?.markdown).toBe('texto novo');
	await expect(executeAssistantApplicationCommand('owner', parseAssistantApplicationCommand('Quais telas estão visíveis')!, adapters)).resolves.toMatchObject({ message: expect.stringContaining('anotacoes: visível') });
	await expect(executeAssistantApplicationCommand('owner', parseAssistantApplicationCommand('Como ficou o retorno depois de editar despesas')!, adapters)).resolves.toMatchObject({ message: 'Editar despesa: retornar para home.' });
});

it('resumo agregado não expõe identificadores nem valores ocultos e reúne todas as operações preparadas', async () => {
	const prepared = await prepareAssistantApplicationBatch('owner', parseAssistantApplicationBatch('Vincule o usuário ID secret-target; Crie uma anotação chamada Compra R$ 82,90: custo R$ 82,90')!, adapters);
	const summary = summarizeAssistantApplicationBatch(prepared.batch!, { ...adapters, shouldHideValues: true });
	expect(summary).toContain('2 operações');
	expect(summary).toContain('Maria');
	expect(summary).not.toMatch(/owner|secret-target|82,90/);
});

it('oculta valores em títulos, conteúdo e alternativas de anotações sem enviar dados locais ao modelo', async () => {
	const privateAdapters = { ...adapters, shouldHideValues: true };
	const first = parseAssistantApplicationCommand('Crie uma anotação chamada Compra R$ 82,90: custo R$ 82,90')!;
	const second = parseAssistantApplicationCommand('Crie uma anotação chamada Compra R$ 150,00: custo R$ 150,00')!;
	await executeAssistantApplicationCommand('owner', first, privateAdapters);
	await executeAssistantApplicationCommand('owner', second, privateAdapters);
	const list = await executeAssistantApplicationCommand('owner', parseAssistantApplicationCommand('Liste minhas anotações')!, privateAdapters);
	const read = await executeAssistantApplicationCommand('owner', parseAssistantApplicationCommand('Leia a anotação Compra R$ 82,90')!, privateAdapters);
	const ambiguous = await prepareAssistantApplicationCommand('owner', parseAssistantApplicationCommand('Altere a anotação Compra: novo texto')!, privateAdapters);
	for (const result of [list, read, ambiguous.result!]) {
		expect(result.message).not.toMatch(/82,90|150,00/);
	}
	expect(ambiguous.result?.choices?.every(choice => !/82,90|150,00/.test(choice.label))).toBe(true);
});

it('revalida a versão da anotação após confirmação, aceita ordinal e não sobrescreve uma edição concorrente', async () => {
	await executeAssistantApplicationCommand('owner', parseAssistantApplicationCommand('Crie uma anotação chamada Viagem: texto original')!, adapters);
	const prepared = await prepareAssistantApplicationCommand('owner', parseAssistantApplicationCommand('Altere a anotação primeira: texto proposto')!, adapters);
	expect(prepared.command).toMatchObject({ title: 'Viagem', targetId: expect.any(String), expectedFingerprint: expect.any(String) });
	const notes = await loadLocalAnnotations('owner');
	await saveLocalAnnotations('owner', notes.map(note => ({ ...note, markdown: 'edição concorrente' })));
	await expect(executeAssistantApplicationCommand('owner', prepared.command!, adapters)).rejects.toThrow('A anotação mudou');
	expect((await loadLocalAnnotations('owner'))[0].markdown).toBe('edição concorrente');
});

it('não grava na conta nova quando o usuário troca de sessão durante a preparação', async () => {
	mockReadProfile.mockImplementationOnce(async () => {
		mockAuth.currentUser = { uid: 'another-owner' };
		return { name: 'Ana' };
	});
	await expect(prepareAssistantApplicationCommand('owner', parseAssistantApplicationCommand('Mude meu nome para Maria')!)).rejects.toThrow('A conta mudou');
	expect(mockUpdateProfile).not.toHaveBeenCalled();
});

it('nega notas e alterações de vínculos ocultas e protege nomes de perfil que mudaram antes do commit', async () => {
	(adapters.isRouteVisible as jest.Mock).mockReturnValue(false);
	await expect(executeAssistantApplicationCommand('owner', parseAssistantApplicationCommand('Liste minhas anotações')!, adapters)).resolves.toMatchObject({ success: false });
	await expect(prepareAssistantApplicationCommand('owner', parseAssistantApplicationCommand('Vincule o usuário ID secret-target')!, adapters)).resolves.toMatchObject({ result: { success: false } });
	expect(mockRelationshipCommand).not.toHaveBeenCalled();
	const prepared = await prepareAssistantApplicationCommand('owner', parseAssistantApplicationCommand('Mude meu nome para Maria')!);
	mockReadProfile.mockResolvedValueOnce({ name: 'Luiza' });
	await expect(executeAssistantApplicationCommand('owner', prepared.command!)).rejects.toThrow('Seu nome mudou');
	expect(mockUpdateProfile).not.toHaveBeenCalled();
});

it('consulta vínculos sem UID/email e prepara uma única versão antes da execução confiável', async () => {
	expect(parseAssistantApplicationCommand('Vincule a conta com UID secret-target')).toMatchObject({ kind: 'change_relationship', relatedUserId: 'secret-target' });
	const listed = await executeAssistantApplicationCommand('owner', parseAssistantApplicationCommand('Quais são minhas contas vinculadas')!, adapters);
	expect(listed.message).toBe('Contas vinculadas: 1. Maria.');
	expect(listed.message).not.toMatch(/secret-target|target@example/);
	const command = parseAssistantApplicationCommand('Vincule o usuário ID secret-target')!;
	expect(command).toMatchObject({ kind: 'change_relationship', action: 'link', requiresConfirmation: true });
	await expect(executeAssistantApplicationCommand('owner', command, adapters)).rejects.toThrow('Confira o vínculo');
	const prepared = await prepareAssistantApplicationCommand('owner', command, adapters);
	expect(mockRelationshipCommand).toHaveBeenCalledWith('owner', { action: 'preview', relatedUserId: 'secret-target' });
	await expect(executeAssistantApplicationCommand('owner', prepared.command!, adapters)).resolves.toMatchObject({ success: true, message: expect.stringContaining('Maria') });
	expect(mockRelationshipCommand).toHaveBeenLastCalledWith('owner', expect.objectContaining({ action: 'link', expectedFingerprint: 'prepared-snapshot' }));
});

it('resolve desvinculação por nome e pela posição da última lista, sem escolher uma conta ambígua', async () => {
	mockRelationships.mockResolvedValue({ success: true, data: [
		{ uid: 'target-one', name: 'Maria Santos' }, { uid: 'target-two', name: 'Maria Silva' }, { uid: 'target-three', name: 'João' },
	] });
	await executeAssistantApplicationCommand('owner', parseAssistantApplicationCommand('Liste minhas contas vinculadas')!, adapters);
	const ordinal = await prepareAssistantApplicationCommand('owner', parseAssistantApplicationCommand('Desvincule a segunda')!, adapters);
	expect(ordinal.command).toMatchObject({ relatedUserId: 'target-two' });
	const ambiguousCommand = parseAssistantApplicationCommand('Desvincule Maria')!;
	const ambiguous = await prepareAssistantApplicationCommand('owner', ambiguousCommand, adapters);
	expect(ambiguous.result?.choices?.map(choice => choice.label)).toEqual(['Maria Santos', 'Maria Silva']);
	expect(resolveAssistantApplicationChoice(ambiguousCommand, ambiguous.result!, 'Maria')).toBeNull();
	const chosen = resolveAssistantApplicationChoice(ambiguousCommand, ambiguous.result!, 'Silva');
	expect(chosen).toMatchObject({ relatedUserId: 'target-two' });
	const unique = await prepareAssistantApplicationCommand('owner', parseAssistantApplicationCommand('Desvincule João')!, adapters);
	expect(unique.command).toMatchObject({ relatedUserId: 'target-three' });
});

it('executa clipboard, leitura automática e revogação apenas pelos adapters locais disponíveis', async () => {
	const localAdapters = { ...adapters, copyOwnUserId: jest.fn(async () => undefined), setAutoReadEnabled: jest.fn(async () => undefined), revokeAssistantConsent: jest.fn(async () => undefined) };
	for (const text of ['Copie meu ID', 'Ative a leitura automática', 'Revogue o consentimento do Lumus IA']) {
		await expect(executeAssistantApplicationCommand('owner', parseAssistantApplicationCommand(text)!, localAdapters)).resolves.toMatchObject({ success: true });
	}
	expect(localAdapters.copyOwnUserId).toHaveBeenCalledWith('owner');
	expect(localAdapters.setAutoReadEnabled).toHaveBeenCalledWith(true);
	expect(localAdapters.revokeAssistantConsent).toHaveBeenCalledTimes(1);
	await expect(executeAssistantApplicationCommand('owner', parseAssistantApplicationCommand('Copie meu ID')!, adapters)).resolves.toMatchObject({ success: false });
});

it('preserva regras de limpeza do formulário ao editar ou retornar depois de salvar', async () => {
	const edit = parseAssistantApplicationCommand('Depois de editar despesas permaneça na tela')!;
	const create = parseAssistantApplicationCommand('Depois de cadastrar receitas volte para início')!;
	await executeAssistantApplicationCommand('owner', edit, adapters);
	await executeAssistantApplicationCommand('owner', create, adapters);
	expect(adapters.updateBehaviorForScreen).toHaveBeenNthCalledWith(1, 'addRegisterExpenses', 'edit', expect.objectContaining({ shouldClearFieldsAfterSubmit: false, shouldReturnAfterSubmit: false }));
	expect(adapters.updateBehaviorForScreen).toHaveBeenNthCalledWith(2, 'addRegisterGain', 'create', expect.objectContaining({ shouldClearFieldsAfterSubmit: false, returnDestination: 'homeDashboard' }));
});

it('cria e consulta uma anotação local por conversa e um reenvio do mesmo comando não a duplica', async () => {
	const command = parseAssistantApplicationCommand('Crie uma anotação chamada Compras: arroz e café');
	expect(command).toMatchObject({ kind: 'create_annotation', title: 'Compras', markdown: 'arroz e café', requiresConfirmation: false });
	await expect(executeAssistantApplicationCommand('owner', command!, adapters)).resolves.toMatchObject({ success: true, changed: 'annotations' });
	await executeAssistantApplicationCommand('owner', command!, adapters);
	const annotations = await loadLocalAnnotations('owner');
	expect(annotations).toHaveLength(1);
	expect(annotations[0]).toMatchObject({ title: 'Compras', markdown: 'arroz e café' });
	const read = parseAssistantApplicationCommand('Leia a anotação Compras');
	await expect(executeAssistantApplicationCommand('owner', read!, adapters)).resolves.toMatchObject({ message: 'Compras: arroz e café' });
});

it('altera preferências pelos mesmos adapters usados pelas telas, sem transformar uma consulta em mudança', async () => {
	expect(parseAssistantApplicationCommand('Como ocultar valores?')).toBeNull();
	for (const text of ['Ative o tema escuro', 'Oculte os valores', 'Confie neste dispositivo', 'Mostre a tela de anotações']) {
		const command = parseAssistantApplicationCommand(text);
		expect(command).not.toBeNull();
		await expect(executeAssistantApplicationCommand('owner', command!, adapters)).resolves.toMatchObject({ success: true, changed: 'preferences' });
	}
	expect(adapters.setThemeMode).toHaveBeenCalledWith('dark');
	expect(adapters.setShouldHideValues).toHaveBeenCalledWith(true);
	expect(adapters.setTrustedDeviceCache).toHaveBeenCalledWith(true);
	expect(adapters.setRouteVisibility).toHaveBeenCalledWith('annotations', true);
});

it('preserva duas anotações criadas ao mesmo tempo sem perder ou duplicar conteúdo', async () => {
	const first = parseAssistantApplicationCommand('Crie uma anotação chamada Uma: primeiro texto')!;
	const second = parseAssistantApplicationCommand('Crie uma anotação chamada Duas: segundo texto')!;
	await Promise.all([executeAssistantApplicationCommand('owner', first, adapters), executeAssistantApplicationCommand('owner', second, adapters)]);
	const notes = await loadLocalAnnotations('owner');
	expect(notes.map(note => note.title).sort()).toEqual(['Duas', 'Uma']);
});

it('consulta o perfil sem incluir identificadores ou email e atualiza o nome pelo domínio existente', async () => {
	const read = parseAssistantApplicationCommand('Qual é meu perfil?');
	expect(read).toEqual({ kind: 'read_profile', requiresConfirmation: false });
	const result = await executeAssistantApplicationCommand('owner', read!);
	expect(result.message).toContain('Ana');
	expect(result.message).not.toContain('private@example.com');
	expect(result.message).not.toContain('owner');
	const update = parseAssistantApplicationCommand('Mude meu nome para Maria da Silva');
	expect(update).toEqual({ kind: 'update_profile_name', name: 'Maria da Silva', requiresConfirmation: true });
	const prepared = await prepareAssistantApplicationCommand('owner', update!);
	await expect(executeAssistantApplicationCommand('owner', prepared.command!)).resolves.toMatchObject({ success: true, changed: 'profile' });
	expect(mockUpdateProfile).toHaveBeenCalledWith('owner', 'Maria da Silva', { expectedName: 'Ana' });
});

it('consulta campos próprios do perfil e a contagem sem delegar dados pessoais ao modelo', async () => {
	mockReadProfile.mockResolvedValue({ uid: 'owner', name: 'Ana', email: 'private@example.com', createdAt: new Date('2026-10-02T01:00:00Z'), adminUser: false });
	await expect(executeAssistantApplicationCommand('owner', parseAssistantApplicationCommand('Qual é meu email de acesso?')!, adapters)).resolves.toMatchObject({ message: 'Seu email de acesso é private@example.com.' });
	await expect(executeAssistantApplicationCommand('owner', parseAssistantApplicationCommand('Qual é meu ID?')!, adapters)).resolves.toMatchObject({ message: expect.stringContaining('owner') });
	await expect(executeAssistantApplicationCommand('owner', parseAssistantApplicationCommand('Quando criei minha conta?')!, adapters)).resolves.toMatchObject({ message: 'Seu cadastro foi criado em 01/10/2026.' });
	await expect(executeAssistantApplicationCommand('owner', parseAssistantApplicationCommand('Mostre meu resumo de acesso')!, adapters)).resolves.toMatchObject({ message: '3 contas vinculadas.' });
});

it('conta somente vínculos quando um administrador pergunta por contas vinculadas', async () => {
	mockReadProfile.mockResolvedValue({ uid: 'owner', name: 'Ana', adminUser: true });
	mockReadAccessSummary.mockResolvedValue({ isAdmin: true, monitoredRecordsCount: 42 });
	const result = await executeAssistantApplicationCommand('owner', parseAssistantApplicationCommand('Quantas contas estão vinculadas?')!, adapters);
	expect(result.message).toBe('1 conta vinculada.');
});

it('permite permanecer no formulário conservando os campos e nunca ativa limpeza na edição', async () => {
	const preserve = parseAssistantApplicationCommand('Depois de cadastrar despesas permaneça na tela sem limpar os campos');
	expect(preserve).toMatchObject({ kind: 'set_post_submit', key: 'addRegisterExpenses', mode: 'create', patch: { shouldReturnAfterSubmit: false, shouldClearFieldsAfterSubmit: false } });
	await executeAssistantApplicationCommand('owner', preserve!, adapters);
	expect(adapters.updateBehaviorForScreen).toHaveBeenCalledWith('addRegisterExpenses', 'create', { shouldReturnAfterSubmit: false, shouldClearFieldsAfterSubmit: false });
	expect(parseAssistantApplicationCommand('Ao editar despesas fique no formulário e limpe os campos')).toMatchObject({ patch: { shouldClearFieldsAfterSubmit: false } });
});

it('renomeia anotação por uma versão confirmada conservando seu conteúdo e reconhece o reenvio', async () => {
	await executeAssistantApplicationCommand('owner', parseAssistantApplicationCommand('Crie anotação Compras: arroz e feijão')!, adapters);
	const command = parseAssistantApplicationCommand('Renomeie a anotação Compras para Mercado');
	expect(command).not.toBeNull();
	const prepared = await prepareAssistantApplicationCommand('owner', command!, adapters);
	expect(prepared.command?.requiresConfirmation).toBe(true);
	await executeAssistantApplicationCommand('owner', prepared.command!, adapters);
	await executeAssistantApplicationCommand('owner', prepared.command!, adapters);
	expect(await loadLocalAnnotations('owner')).toEqual([expect.objectContaining({ title: 'Mercado', markdown: 'arroz e feijão' })]);
});

it('interpreta todas as cláusulas do lote e rejeita uma cláusula desconhecida sem executar parte do pedido', () => {
	expect(parseAssistantApplicationBatch('Ative o tema escuro; Oculte os valores\nMostre a tela de anotações')?.map(command => command.kind)).toEqual(['set_theme', 'set_value_visibility', 'set_route_visibility']);
	expect(parseAssistantApplicationBatch('Ative o tema escuro; envie uma mensagem para Maria')).toBeNull();
	expect(parseAssistantApplicationBatch('Crie uma anotação chamada Receita: café; arroz')).toBeNull();
});

it('preserva sucessos do lote, informa falha parcial, cancela itens novos e tenta novamente só falhas e pendências', async () => {
	const commands = parseAssistantApplicationBatch('Crie uma anotação chamada Uma: primeiro; Ative o tema escuro; Crie uma anotação chamada Duas: segundo')!;
	const prepared = await prepareAssistantApplicationBatch('owner', commands, adapters);
	let cancelled = false;
	(adapters.setThemeMode as jest.Mock).mockRejectedValueOnce(new Error('sem armazenamento'));
	const first = await executeAssistantApplicationBatch('owner', prepared.batch!, adapters, {
		isCancelled: () => cancelled,
		onProgress: progress => { if (progress.failed === 1) cancelled = true; },
	});
	expect(first).toMatchObject({ completed: 1, failed: 1, pending: 1, cancelled: true });
	expect((await loadLocalAnnotations('owner')).map(note => note.title)).toEqual(['Uma']);
	const retry = await executeAssistantApplicationBatch('owner', prepared.batch!, adapters);
	expect(retry).toMatchObject({ completed: 3, failed: 0, pending: 0 });
	expect((await loadLocalAnnotations('owner')).map(note => note.title).sort()).toEqual(['Duas', 'Uma']);
	expect(adapters.setThemeMode).toHaveBeenCalledTimes(2);
});

it('confirma uma versão agregada, revalida seus alvos e rejeita conteúdo alterado com o mesmo identificador', async () => {
	const prepared = await prepareAssistantApplicationBatch('owner', parseAssistantApplicationBatch('Mude meu nome para Maria; Confie neste dispositivo')!, adapters);
	expect(prepared.batch?.requiresConfirmation).toBe(true);
	await expect(executeAssistantApplicationBatch('owner', prepared.batch!, adapters)).rejects.toThrow('Confirme');
	expect(mockUpdateProfile).not.toHaveBeenCalled();
	const changed = { ...prepared.batch!, items: prepared.batch!.items.map(item => item.command.kind === 'update_profile_name' ? { ...item, command: { ...item.command, name: 'Outro nome' } } : item) };
	await expect(executeAssistantApplicationBatch('owner', changed, adapters, { authorizedSignature: prepared.batch!.signature })).rejects.toThrow('mudou');
	await executeAssistantApplicationBatch('owner', prepared.batch!, adapters, { authorizedSignature: prepared.batch!.signature });
	expect(mockUpdateProfile).toHaveBeenCalledTimes(1);
	expect(adapters.setTrustedDeviceCache).toHaveBeenCalledTimes(1);
});

it('nega comandos conflitantes sobre o mesmo alvo e execução concorrente reutiliza o mesmo resultado', async () => {
	await expect(prepareAssistantApplicationBatch('owner', parseAssistantApplicationBatch('Mude meu nome para Maria; Mude meu nome para Luiza')!, adapters)).resolves.toMatchObject({ result: { success: false } });
	const prepared = await prepareAssistantApplicationBatch('owner', parseAssistantApplicationBatch('Crie uma anotação chamada Uma: primeiro; Crie uma anotação chamada Duas: segundo')!, adapters);
	const [first, second] = await Promise.all([executeAssistantApplicationBatch('owner', prepared.batch!, adapters), executeAssistantApplicationBatch('owner', prepared.batch!, adapters)]);
	expect(first).toEqual(second);
	expect(first.completed).toBe(2);
	expect(await loadLocalAnnotations('owner')).toHaveLength(2);
	mockAuth.currentUser = { uid: 'another-owner' };
	await expect(executeAssistantApplicationBatch('owner', prepared.batch!, adapters)).rejects.toThrow('A conta mudou');
});
