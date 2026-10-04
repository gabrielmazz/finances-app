const mockAuth = { currentUser: { uid: 'owner' } as { uid: string } | null };
const mockCatalog = jest.fn();
const mockMovements = jest.fn();
const mockCategoryAnalysis = jest.fn();
const mockExport = jest.fn();
const mockLedger = jest.fn();
const mockFixedExpenses = jest.fn(); const mockFixedGains = jest.fn();
const mockAdjustments = jest.fn();
jest.mock('@/FirebaseConfig', () => ({ get auth() { return mockAuth; } }));
jest.mock('@/services/lumusAssistant/assistantCatalogService', () => ({ loadAssistantResolvedCatalog: (...args: unknown[]) => mockCatalog(...args) }));
jest.mock('@/services/lumusAssistant/assistantReportService', () => ({ readAssistantPeriodMovements: (...args: unknown[]) => mockMovements(...args) }));
jest.mock('@/functions/CategoryAnalysisFirebase', () => ({ getCategoryAnalysisFirebase: (...args: unknown[]) => mockCategoryAnalysis(...args) }));
jest.mock('@/functions/FinancialLedgerFirebase', () => ({ getFinancialLedgerContextFirebase: (...args: unknown[]) => mockLedger(...args) }));
jest.mock('@/functions/MandatoryExpenseFirebase', () => ({ getMandatoryExpensesWithRelationsFirebase: (...args: unknown[]) => mockFixedExpenses(...args) }));
jest.mock('@/functions/MandatoryGainFirebase', () => ({ getMandatoryGainsWithRelationsFirebase: (...args: unknown[]) => mockFixedGains(...args) }));
jest.mock('@/functions/BankBalanceAdjustmentFirebase', () => ({ getBankBalanceAdjustmentsFirebase: (...args: unknown[]) => mockAdjustments(...args) }));
jest.mock('@/utils/reportExport', () => ({ exportHtmlReport: (...args: unknown[]) => mockExport(...args) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }));

import { parseAssistantExportRequest, prepareAssistantExport, executeAssistantExport } from '@/services/lumusAssistant/assistantExportService';
import { parseAssistantApplicationCommand, prepareAssistantApplicationCommand, executeAssistantApplicationCommand } from '@/services/lumusAssistant/assistantApplicationService';
import { resolveAssistantApplicationChoice } from '@/services/lumusAssistant/assistantApplicationService';

const bank = { handle: 'bank-local', realId: 'secret-bank', label: 'Nubank', ownerScope: 'current_user', collection: 'banks', data: {} };
const reportWindow = { start: new Date('2026-09-01T03:00:00Z'), end: new Date('2026-10-01T03:00:00Z') };
const scope = { shouldHideValues: false, isCurrentSession: () => true };
beforeEach(() => {
 jest.clearAllMocks(); mockAuth.currentUser = { uid: 'owner' };
 mockCatalog.mockResolvedValue({ banks: [bank], mandatoryExpenses: [], mandatoryGains: [] });
 mockLedger.mockResolvedValue(null); mockExport.mockResolvedValue({ status: 'printed' });
 mockFixedExpenses.mockResolvedValue({ success: true, data: [] }); mockFixedGains.mockResolvedValue({ success: true, data: [] });
 mockAdjustments.mockResolvedValue([]);
 mockMovements.mockResolvedValue({ movements: [], window: { ...reportWindow, period: '2026-09', label: 'setembro de 2026' } });
});

it('exporta ajustes legados sem misturar reconciliação com receitas e rejeita sessão trocada enquanto lê o período', async () => {
 mockAdjustments.mockResolvedValue([{ id: 'private-adjustment', personId: 'owner', bankId: 'secret-bank', date: new Date('2026-09-10T15:00:00Z'), differenceInCents: 9000, description: 'Reconciliação verificada', status: 'active' }]);
 const request = (await prepareAssistantExport('owner', parseAssistantExportRequest('Exporte o extrato do Nubank de 2026-09 em PDF')!, scope)).request!;
 await executeAssistantExport('owner', request, scope);
 expect(mockExport.mock.calls[0][0].html).toContain('Reconciliação verificada');
 expect(mockExport.mock.calls[0][0].html).not.toContain('private-adjustment');
 mockExport.mockClear(); mockMovements.mockImplementationOnce(async () => { mockAuth.currentUser = { uid: 'other' }; return { movements: [], window: { ...reportWindow, period: '2026-09', label: 'setembro' } }; });
 await expect(executeAssistantExport('owner', request, scope)).rejects.toThrow('sessão mudou');
 expect(mockExport).not.toHaveBeenCalled();
});

it('resolve Caixa sem ID real, filtro de dias civis e categoria e informa bloqueio de janela sem executar outro banco', async () => {
 const cash = { ...bank, handle: 'cash-local', realId: null, label: 'Dinheiro em espécie', collection: null };
 mockCatalog.mockResolvedValue({ banks: [bank, cash], expenseCategories: [{ ...bank, realId: 'food-private', label: 'Alimentação' }] });
 mockMovements.mockResolvedValue({ movements: [
  { id: 'cash-food', name: 'Almoço', type: 'expense', valueInCents: 1000, bankId: null, categoryId: 'food-private', economic: true, date: new Date('2026-09-02T02:00:00Z') },
  { id: 'cash-gain', name: 'Troco', type: 'gain', valueInCents: 50, bankId: null, categoryId: 'food-private', economic: true, date: new Date('2026-09-02T12:00:00Z') },
  { id: 'bank-food', name: 'Cartão', type: 'expense', valueInCents: 9000, bankId: 'secret-bank', categoryId: 'food-private', economic: true, date: new Date('2026-09-02T12:00:00Z') },
 ], window: { ...reportWindow, period: '2026-09', label: '01/09/2026 a 02/09/2026' } });
 const command = parseAssistantApplicationCommand('Exporte o extrato do Caixa de 01/09/2026 a 02/09/2026 somente despesas categoria Alimentação em PDF')!;
 expect(command).not.toBeNull();
 const prepared = await prepareAssistantApplicationCommand('owner', command, scope as any);
 expect(prepared.command).toMatchObject({ request: { bankId: 'cash-local', categoryId: 'food-private' } });
 await executeAssistantApplicationCommand('owner', prepared.command!, scope as any);
 const range = mockMovements.mock.calls[0][3];
 expect(range.start.toISOString()).toBe('2026-09-01T03:00:00.000Z'); expect(range.end.toISOString()).toBe('2026-09-03T03:00:00.000Z');
 const html = mockExport.mock.calls[0][0].html;
 expect(html).toContain('Almoço'); expect(html).toContain('01/09/2026'); expect(html).not.toContain('Cartão'); expect(html).not.toContain('Troco');
 mockExport.mockResolvedValueOnce({ status: 'popup-blocked' });
 await expect(executeAssistantApplicationCommand('owner', prepared.command!, scope as any)).resolves.toMatchObject({ success: false, message: expect.stringContaining('bloqueou') });
});

it.each([['despesas', 'mandatory_expenses'], ['receitas', 'mandatory_gains']] as const)('exporta %s fixas próprias, relacionadas e do grupo sem excluir templates raros nem declarar histórico legado desconhecido como pendente', async (kind, target) => {
 const cycle = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).format(new Date()).replace('/', '-');
 const template = { id: 'related-private', name: 'Internet da família', personId: 'related', valueInCents: 9900, dueDay: 10, lastPaymentCycle: cycle, lastReceiptCycle: cycle };
 mockFixedExpenses.mockResolvedValue({ success: true, data: [template] }); mockFixedGains.mockResolvedValue({ success: true, data: [template] });
 mockCatalog.mockResolvedValue({ mandatoryExpenses: [{ ...bank, realId: 'group-private', label: 'Grupo', data: { valueInCents: 1000, dueDay: 15 } }], mandatoryGains: [{ ...bank, realId: 'group-private', label: 'Grupo', data: { valueInCents: 1000, dueDay: 15 } }] });
 const command = parseAssistantApplicationCommand(`Exporte ${kind} fixas de 2026-08 em PDF`)!;
 expect(command).toMatchObject({ kind: 'export_report', request: { target } });
 const prepared = await prepareAssistantApplicationCommand('owner', command, scope as any);
 const result = await executeAssistantApplicationCommand('owner', prepared.command!, scope as any);
 expect(result).toMatchObject({ success: true, message: expect.stringContaining('2') });
 const html = mockExport.mock.calls[0][0].html;
 expect(html).toContain('Internet da família'); expect(html).toContain('Grupo');
 expect(html).toContain('Histórico não disponível'); expect(html).toContain('parciais');
 expect(html).not.toContain('related-private'); expect(html).not.toContain('group-private');
});

it('não considera que migrar para o razão reconstruiu ciclos históricos ausentes e cancela abertura quando a privacidade muda', async () => {
 mockLedger.mockResolvedValue({ groupId: 'group' });
 mockCatalog.mockResolvedValue({ mandatoryExpenses: [{ ...bank, realId: 'group-private', label: 'Internet', data: { valueInCents: 1000, dueDay: 10 } }] });
 const request = parseAssistantExportRequest('Exporte despesas fixas de 2026-08 em PDF')!;
 await executeAssistantExport('owner', request, scope);
 expect(mockExport.mock.calls[0][0].html).toContain('Histórico não disponível');
 mockExport.mockClear(); let hidden = false;
 mockMovements.mockImplementationOnce(async () => { hidden = true; return { movements: [], window: { ...reportWindow, period: '2026-08', label: 'agosto' } }; });
 await expect(executeAssistantExport('owner', request, { ...scope, getShouldHideValues: () => hidden })).rejects.toThrow('privacidade');
 expect(mockExport).not.toHaveBeenCalled();
});

it('exporta o extrato completo pelo comando da conversa, sem IDs no arquivo nem promessa de salvamento', async () => {
 const movements = Array.from({ length: 401 }, (_, index) => ({ id: `private-${index}`, name: `Mercado ${index + 1}`, valueInCents: 100, type: 'expense', bankId: 'secret-bank', date: new Date('2026-09-10T15:00:00Z'), economic: true }));
 mockMovements.mockResolvedValue({ movements, window: { ...reportWindow, period: '2026-09', label: 'setembro de 2026' } });
 const command = parseAssistantApplicationCommand('Exporte o extrato do Nubank de 2026-09 em PDF')!;
 expect(command).toMatchObject({ kind: 'export_report', requiresConfirmation: false });
 const prepared = await prepareAssistantApplicationCommand('owner', command, scope as any);
 const result = await executeAssistantApplicationCommand('owner', prepared.command!, scope as any);
 expect(result).toMatchObject({ success: true, message: expect.stringContaining('401') });
 expect(result.message).toContain('impressão'); expect(result.message).not.toMatch(/salvo|baixado|persistido/);
 const { html, fileName } = mockExport.mock.calls[0][0];
 expect(html).toContain('Mercado 401'); expect(html).toContain('401,00');
 expect(html).not.toContain('secret-bank'); expect(html).not.toContain('private-400');
 expect(fileName).toMatch(/Extrato-Nubank.*\.pdf$/);
});

it('exporta a análise de categoria com todas as linhas do histórico e valores ocultos inclusive em descrições', async () => {
 mockCatalog.mockResolvedValue({ expenseCategories: [{ ...bank, realId: 'category-private', label: 'Alimentação' }] });
 const metric = { currentInCents: 8290, historicalAverageInCents: 10000, deltaInCents: -1710, deltaPercent: -17.1, status: 'below', currentCount: 1, historicalCount: 25 };
 mockCategoryAnalysis.mockResolvedValue({ success: true, data: { tags: [{ id: 'category-private' }], reportsByTagId: { 'category-private': { tagName: 'Alimentação', expense: metric, gain: metric, currentMonthLabel: 'outubro', historyPeriodLabel: 'julho a setembro', currentPeriodLabel: 'Parcial até 03/10/2026', comparisonLabel: 'dias equivalentes', months: [], bankBreakdown: [], movements: Array.from({ length: 45 }, (_, index) => ({ type: 'expense', name: `Compra ${index + 1}`, date: new Date('2026-09-10T15:00:00Z'), bankName: 'Nubank', valueInCents: 8290, explanation: 'R$ 82,90; <script>não executar</script>' })) } } } });
 const command = parseAssistantApplicationCommand('Exporte a análise da categoria Alimentação com histórico de 6 meses em PDF')!;
 expect(command).toMatchObject({ kind: 'export_report', request: { target: 'category_analysis', historyMonths: 6 } });
 const prepared = await prepareAssistantApplicationCommand('owner', command, { ...scope, shouldHideValues: true } as any);
 const result = await executeAssistantApplicationCommand('owner', prepared.command!, { ...scope, shouldHideValues: true } as any);
 expect(mockCategoryAnalysis).toHaveBeenCalledWith('owner', 6);
 expect(result).toMatchObject({ success: true, message: expect.stringContaining('45') });
 const html = mockExport.mock.calls[0][0].html;
 expect(html).toContain('Compra 45'); expect(html).toContain('••••');
 expect(html).not.toContain('82,90'); expect(html).not.toContain('-17,1'); expect(html).not.toContain('<script>');
 expect(html).not.toContain('category-private'); expect(html).toContain('&lt;script&gt;');
});

it('preserva o intervalo civil de análise personalizada e resolve categoria ambígua por ordinal sem escolher o primeiro', async () => {
 mockCatalog.mockResolvedValue({ expenseCategories: [{ ...bank, realId: 'cat-home', label: 'Alimentação casa' }, { ...bank, realId: 'cat-work', label: 'Alimentação trabalho' }] });
 const command = parseAssistantApplicationCommand('Exporte a análise da categoria Alimentação com histórico de 01/07/2026 a 31/08/2026 em PDF')!;
 expect(command).toMatchObject({ request: { historyStartDate: '2026-07-01', historyEndDate: '2026-08-31' } });
 const ambiguous = await prepareAssistantApplicationCommand('owner', command, scope as any);
 expect(ambiguous.result?.choices).toHaveLength(2); expect(mockExport).not.toHaveBeenCalled();
 const selected = resolveAssistantApplicationChoice(command, ambiguous.result!, 'a segunda')!;
 const prepared = await prepareAssistantApplicationCommand('owner', selected, scope as any);
 expect(prepared.command).toMatchObject({ request: { categoryId: 'cat-work' } });
 mockCategoryAnalysis.mockResolvedValue({ success: true, data: { reportsByTagId: {} } });
 await executeAssistantApplicationCommand('owner', prepared.command!, scope as any);
 const range = mockCategoryAnalysis.mock.calls[0][1];
 expect([range.startDate.getFullYear(), range.startDate.getMonth() + 1, range.startDate.getDate()]).toEqual([2026, 7, 1]);
 expect([range.endDate.getFullYear(), range.endDate.getMonth() + 1, range.endDate.getDate()]).toEqual([2026, 8, 31]);
 expect(mockExport).not.toHaveBeenCalled();
});
