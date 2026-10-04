import { auth } from '@/FirebaseConfig';
import type { AssistantResolvedCatalog } from '@/types/lumusAssistant';
import { loadAssistantResolvedCatalog } from '@/services/lumusAssistant/assistantCatalogService';
import { readAssistantPeriodMovements } from '@/services/lumusAssistant/assistantReportService';
import { buildMandatoryPeriodSummaryPdfHtml, type MandatoryPeriodSummaryPdfItem } from '@/utils/mandatoryPeriodSummaryPdf';
import { buildPdfFileName } from '@/utils/pdfFileNameCore';
import { formatCents, formatCycleKey, formatIsoDate, maskFinancialValuesInText, parseIsoDateAtLocalNoon } from '@/utils/lumusAssistant';
import { getAssistantPrivateIdentifiers, redactAssistantPersonalData } from '@/services/lumusAssistant/assistantBatchService';
import { endOfFinancialCivilDay, toFinancialCivilDate } from '@/utils/financialCivilDate';
import { getCategoryAnalysisRangeError } from '@/utils/categoryAnalysis';
import { LUMUS_RUNTIME_COLORS } from '@/design-system/tokens';
import { getCategoryAnalysisFirebase } from '@/functions/CategoryAnalysisFirebase';
import { buildCategoryAnalysisPdfHtml } from '@/utils/categoryAnalysisPdf';
import { getMandatoryExpensesWithRelationsFirebase } from '@/functions/MandatoryExpenseFirebase';
import { getMandatoryGainsWithRelationsFirebase } from '@/functions/MandatoryGainFirebase';
import { getFinancialLedgerContextFirebase } from '@/functions/FinancialLedgerFirebase';
import { getBankBalanceAdjustmentsFirebase } from '@/functions/BankBalanceAdjustmentFirebase';
import { resolveMonthlyOccurrence } from '@/utils/businessCalendar';
import { getMandatoryInstallmentValueInCents } from '@/utils/mandatoryInstallments';

export type AssistantExportRequest = {
 target: 'bank_movements' | 'category_analysis' | 'mandatory_expenses' | 'mandatory_gains'; bankName?: string; bankId?: string; bankLabel?: string;
 categoryName?: string; categoryId?: string; categoryLabel?: string; historyMonths?: number;
 historyStartDate?: string; historyEndDate?: string;
 period?: string; startDate?: string; endDate?: string; movementType?: 'expense' | 'gain';
};
type ExportScope = { shouldHideValues: boolean; getShouldHideValues?(): boolean; isCurrentSession?(): boolean };
type ExportResult = { success: boolean; message: string; choiceField?: 'bank' | 'category'; choices?: Array<{ value: string; label: string }> };
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
const requireScope = (uid: string, scope: ExportScope) => {
 if (!uid || auth.currentUser?.uid !== uid || scope.isCurrentSession?.() === false) throw new Error('A sessão mudou. Nenhum novo arquivo foi aberto.');
 if (scope.getShouldHideValues && scope.getShouldHideValues() !== scope.shouldHideValues) throw new Error('A privacidade mudou durante a geração. Peça o PDF novamente com a preferência atual. Nenhum novo arquivo foi aberto.');
};
const isExportCurrent = (uid: string, scope: ExportScope) => auth.currentUser?.uid === uid && scope.isCurrentSession?.() !== false && (!scope.getShouldHideValues || scope.getShouldHideValues() === scope.shouldHideValues);

export function parseAssistantExportRequest(text: string): AssistantExportRequest | null {
 const recurring = /^(?:exporte|gere|baixe) (?:as )?(despesas|receitas) fixas(?: de ((?:19|20)\d{2}-(?:0[1-9]|1[0-2])))? (?:em )?pdf[.!]?$/i.exec(text.trim());
 if (recurring) return { target: recurring[1].toLowerCase() === 'despesas' ? 'mandatory_expenses' : 'mandatory_gains', period: recurring[2] };
 const category = /^(?:exporte|gere|baixe) (?:a )?an[aá]lise (?:da|de) categoria (.+?)(?: com hist[oó]rico de (?:(\d+) meses|(\d{2}\/\d{2}\/\d{4}) a (\d{2}\/\d{2}\/\d{4})))?(?: somente (despesas|receitas))? (?:em )?pdf[.!]?$/i.exec(text.trim());
 if (category) return { target: 'category_analysis', categoryName: category[1].trim(), historyMonths: category[2] ? Number(category[2]) : 3, historyStartDate: category[3]?.split('/').reverse().join('-'), historyEndDate: category[4]?.split('/').reverse().join('-'), movementType: category[5]?.toLowerCase() === 'receitas' ? 'gain' : 'expense' };
 const match = /^(?:exporte|gere|baixe) (?:o )?extrato(?: (?:do|da|de) (.+?))?(?: (?:de|em) (?:(\d{4}-\d{2})|(\d{2}\/\d{2}\/\d{4}) a (\d{2}\/\d{2}\/\d{4})))?(?: somente (despesas|receitas))?(?: categoria (.+?))? (?:em )?pdf[.!]?$/i.exec(text.trim());
 return match ? { target: 'bank_movements', bankName: match[1]?.trim(), period: match[2], startDate: match[3]?.split('/').reverse().join('-'), endDate: match[4]?.split('/').reverse().join('-'), movementType: match[5] ? match[5].toLowerCase() === 'despesas' ? 'expense' : 'gain' : undefined, categoryName: match[6]?.trim() } : null;
}

export async function prepareAssistantExport(uid: string, request: AssistantExportRequest, scope: ExportScope): Promise<{ request?: AssistantExportRequest; result?: ExportResult }> {
 requireScope(uid, scope);
 const catalog = await loadAssistantResolvedCatalog(uid); requireScope(uid, scope);
 if (request.target === 'mandatory_expenses' || request.target === 'mandatory_gains') return { request };
 if (request.target === 'category_analysis') {
  const history = exportHistoryRange(request);
  if (typeof history === 'string') return { result: { success: false, message: history } };
  if (!Number.isInteger(request.historyMonths ?? 3) || (request.historyMonths ?? 3) < 1 || (request.historyMonths ?? 3) > 12) return { result: { success: false, message: 'A análise aceita um histórico de 1 a 12 meses completos, além do mês atual.' } };
  const categories = [...new Map([...(catalog.expenseCategories ?? []), ...(catalog.gainCategories ?? [])].filter(item => item.realId).map(item => [item.realId, item])).values()];
  const value = normalize(request.categoryName ?? '');
  const exact = categories.filter(item => normalize(item.label) === value);
  const matching = request.categoryId ? categories.filter(item => item.realId === request.categoryId) : exact.length ? exact : categories.filter(item => value && normalize(item.label).includes(value));
  if (matching.length !== 1) return { result: { success: false, message: 'Qual categoria deseja exportar? Responda pelo nome ou posição.', choiceField: 'category', choices: (matching.length ? matching : value ? [] : categories).map(item => ({ value: item.realId!, label: scope.shouldHideValues ? maskFinancialValuesInText(item.label) : item.label })) } };
  return { request: { ...request, categoryId: matching[0].realId!, categoryLabel: matching[0].label } };
 }
 const value = normalize(request.bankName ?? '');
 const exact = (catalog.banks ?? []).filter(item => normalize(item.label) === value || item.realId === null && /^(?:caixa|dinheiro|dinheiro em especie)$/.test(value));
 const matching = request.bankId ? (catalog.banks ?? []).filter(item => item.realId === request.bankId || item.handle === request.bankId) : exact.length ? exact : (catalog.banks ?? []).filter(item => value && normalize(item.label).includes(value));
 if (matching.length !== 1) return { result: { success: false, message: matching.length ? 'Qual banco deseja exportar? Responda pelo nome ou posição.' : 'Informe um banco ou Caixa disponível para exportar o extrato.', choices: (matching.length ? matching : value ? [] : catalog.banks ?? []).map(item => ({ value: item.realId ?? item.handle, label: scope.shouldHideValues ? maskFinancialValuesInText(item.label) : item.label })) } };
 const resolved = { ...request, bankId: matching[0].realId ?? matching[0].handle, bankLabel: matching[0].label };
 if (request.categoryName || request.categoryId) {
  const categories = [...new Map([...(catalog.expenseCategories ?? []), ...(catalog.gainCategories ?? [])].filter(item => item.realId).map(item => [item.realId, item])).values()];
  const name = normalize(request.categoryName ?? '');
  const exact = categories.filter(item => normalize(item.label) === name);
  const matching = request.categoryId ? categories.filter(item => item.realId === request.categoryId) : exact.length ? exact : categories.filter(item => name && normalize(item.label).includes(name));
  if (matching.length !== 1) return { result: { success: false, message: 'Qual categoria deseja usar como filtro? Responda pelo nome ou posição.', choiceField: 'category', choices: matching.map(item => ({ value: item.realId!, label: scope.shouldHideValues ? maskFinancialValuesInText(item.label) : item.label })) } };
  return { request: { ...resolved, categoryId: matching[0].realId!, categoryLabel: matching[0].label } };
 }
 return { request: resolved };
}

export async function executeAssistantExport(uid: string, request: AssistantExportRequest, scope: ExportScope): Promise<ExportResult> {
 requireScope(uid, scope);
 const catalog = await loadAssistantResolvedCatalog(uid); requireScope(uid, scope);
 if (request.target === 'category_analysis') return exportCategoryAnalysis(uid, request, catalog, scope);
 if (request.target === 'mandatory_expenses' || request.target === 'mandatory_gains') return exportRecurring(uid, request, catalog, scope);
 const bank = (catalog.banks ?? []).find(item => item.realId === request.bankId || item.handle === request.bankId);
 if (!bank) return { success: false, message: 'O banco não está mais acessível. Informe o banco novamente.' };
 const privateIds = getAssistantPrivateIdentifiers(catalog, uid);
 const visible = (value: string) => redactAssistantPersonalData(scope.shouldHideValues ? maskFinancialValuesInText(value) : value, uid, privateIds);
 const money = (value: number) => scope.shouldHideValues ? '••••' : formatCents(value);
 let range: { start: Date; end: Date; label: string } | undefined;
 if (request.startDate || request.endDate) {
  const start = request.startDate ? parseIsoDateAtLocalNoon(request.startDate, '00:00') : null;
  const end = request.endDate ? parseIsoDateAtLocalNoon(request.endDate, '12:00') : null;
  if (!start || !end || start > end || end > endOfFinancialCivilDay(new Date())) return { success: false, message: 'Informe datas válidas, em ordem, até hoje.' };
  range = { start, end: new Date(endOfFinancialCivilDay(end).getTime() + 1), label: `${request.startDate!.split('-').reverse().join('/')} a ${request.endDate!.split('-').reverse().join('/')}` };
 }
 const { movements, window } = await readAssistantPeriodMovements(uid, { kind: 'bank_movements', period: request.period ?? request.startDate?.slice(0, 7) }, catalog, range);
 requireScope(uid, scope);
 const ledger = await getFinancialLedgerContextFirebase(uid); requireScope(uid, scope);
 if (!ledger && bank.realId) {
  const adjustments = await getBankBalanceAdjustmentsFirebase(uid, bank.realId, window.start, new Date(window.end.getTime() - 1)); requireScope(uid, scope);
  for (const adjustment of adjustments) {
   if (!Number.isSafeInteger(adjustment.differenceInCents)) throw new Error('Um ajuste tem valor inválido. Nenhum arquivo parcial foi aberto.');
   privateIds.push(adjustment.id, adjustment.personId);
   movements.push({ id: adjustment.id, name: 'Ajuste de saldo', date: adjustment.date, valueInCents: Math.abs(adjustment.differenceInCents), type: adjustment.differenceInCents < 0 ? 'expense' : 'gain', bankId: bank.realId, explanation: adjustment.description ?? '', economic: false, reversed: adjustment.status !== 'active' });
  }
  movements.sort((a, b) => b.date.getTime() - a.date.getTime());
 }
 const selected = movements.filter(item => (bank.realId === null || bank.data?.kind === 'cash' ? item.bankId === null : item.bankId === bank.realId) && (!request.movementType || item.type === request.movementType) && (!request.categoryId || item.categoryId === request.categoryId));
 const gains = selected.filter(item => item.economic && !item.reversed && item.type === 'gain').reduce((total, item) => total + item.valueInCents, 0);
 const expenses = selected.filter(item => item.economic && !item.reversed && item.type === 'expense').reduce((total, item) => total + item.valueInCents, 0);
 const label = visible(bank.label);
 const html = buildMandatoryPeriodSummaryPdfHtml({
  reportKindLabel: 'Extrato', title: `Extrato de ${label}`, monthLabel: window.label,
  generatedAtLabel: new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date()),
  primaryMetricLabel: 'Movimentos encontrados', primaryMetricValue: String(selected.length), primaryMetricHelper: 'Movimentos de transferência, investimento e ajuste não entram nos totais de despesas e receitas.',
  metrics: [{ label: 'Receitas', value: money(gains), tone: 'gain' }, { label: 'Despesas', value: money(expenses), tone: 'expense' }],
  items: selected.map(item => ({ id: '', name: visible(item.name), statusLabel: item.reversed ? 'Estornado' : item.economic ? item.type === 'gain' ? 'Receita' : 'Despesa' : 'Movimento entre contas ou ajuste', dateLabel: formatIsoDate(item.date).split('-').reverse().join('/'), tagLabel: '', scheduleLabel: '', description: visible(item.explanation ?? ''), amountLabel: money(item.valueInCents), amountTone: item.type === 'gain' ? 'gain' : 'expense' })),
  cardBaseColor: LUMUS_RUNTIME_COLORS.dark.surface, cardGlowColor: LUMUS_RUNTIME_COLORS.dark.surfaceMuted, cardHighlightColor: LUMUS_RUNTIME_COLORS.dark.border,
  emptyStateLabel: 'Nenhum movimento encontrado neste intervalo.', privacyNotice: scope.shouldHideValues ? 'Valores ocultos conforme a preferência de privacidade.' : null,
 });
 requireScope(uid, scope);
 const { exportHtmlReport } = require('@/utils/reportExport') as typeof import('@/utils/reportExport'); requireScope(uid, scope);
 const result = await exportHtmlReport({ html, fileName: buildPdfFileName(['Extrato', label, range ? `${request.startDate} a ${request.endDate}` : window.period]), dialogTitle: `Extrato de ${label}`, isCurrent: () => isExportCurrent(uid, scope) });
 return exportOutcome(result.status, `${selected.length} movimento(s) de ${label} no relatório.`);
}

async function exportCategoryAnalysis(uid: string, request: AssistantExportRequest, catalog: AssistantResolvedCatalog, scope: ExportScope): Promise<ExportResult> {
 if (!request.categoryId) return { success: false, message: 'Informe a categoria do relatório.' };
 const history = exportHistoryRange(request);
 if (typeof history === 'string') return { success: false, message: history };
 const result = await getCategoryAnalysisFirebase(uid, history ?? request.historyMonths ?? 3); requireScope(uid, scope);
 if (!result.success) return { success: false, message: 'Não foi possível carregar o histórico completo da categoria. Nenhum arquivo foi aberto.' };
 const report = result.data.reportsByTagId[request.categoryId];
 if (!report) return { success: false, message: 'A categoria não está mais acessível. Informe a categoria novamente.' };
 const privateIds = getAssistantPrivateIdentifiers(catalog, uid);
 const visible = (value: string) => redactAssistantPersonalData(scope.shouldHideValues ? maskFinancialValuesInText(value) : value, uid, privateIds);
 const money = (value: number) => scope.shouldHideValues ? '••••' : formatCents(value);
 const type = request.movementType ?? 'expense'; const metric = report[type];
 const movements = report.movements.filter(item => item.type === type);
 const html = buildCategoryAnalysisPdfHtml({
  title: 'Análise por Categoria', categoryLabel: visible(report.tagName), categoryKindLabel: 'Categoria financeira', movementTypeLabel: type === 'expense' ? 'Despesas' : 'Receitas',
  generatedAtLabel: new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date()),
  insightMessage: `Histórico: ${report.historyPeriodLabel}. ${report.comparisonLabel}`, statusLabel: metric.status === 'no-history' ? 'Sem média histórica confiável' : metric.status === 'above' ? 'Acima da média' : metric.status === 'below' ? 'Abaixo da média' : 'Próximo da média',
  primaryMetricLabel: report.currentPeriodLabel, primaryMetricValue: money(metric.currentInCents), primaryMetricHelper: report.currentMonthLabel,
  metrics: [{ label: 'Média histórica', value: money(metric.historicalAverageInCents) }, { label: 'Diferença', value: money(metric.deltaInCents) }],
  months: report.months.map(month => ({ label: month.isCurrentMonth ? report.currentPeriodLabel : month.label, valueLabel: money(type === 'expense' ? month.expenseInCents : month.gainInCents), countLabel: `${type === 'expense' ? month.expenseCount : month.gainCount} movimento(s)`, isCurrentMonth: month.isCurrentMonth })),
  breakdown: report.bankBreakdown.filter(item => (type === 'expense' ? item.expenseInCents : item.gainInCents) > 0).map(item => ({ name: visible(item.name), valueLabel: money(type === 'expense' ? item.expenseInCents : item.gainInCents), shareLabel: '' })),
  movements: movements.map(item => ({ name: visible(item.name), dateLabel: item.date ? formatIsoDate(item.date).split('-').reverse().join('/') : 'Data não informada', sourceLabel: visible(item.bankName), description: visible(item.explanation ?? ''), amountLabel: money(item.valueInCents), amountTone: type })),
  emptyBreakdownLabel: 'Sem movimentos no mês atual.', emptyMovementsLabel: 'Sem movimentos no histórico escolhido.', privacyNotice: scope.shouldHideValues ? 'Valores ocultos conforme a preferência de privacidade.' : null,
 });
 requireScope(uid, scope);
 const { exportHtmlReport } = require('@/utils/reportExport') as typeof import('@/utils/reportExport');
 const exported = await exportHtmlReport({ html, fileName: buildPdfFileName(['Analise', visible(report.tagName), history ? `${request.historyStartDate} a ${request.historyEndDate}` : `${request.historyMonths ?? 3} meses`]), dialogTitle: 'Análise por Categoria', isCurrent: () => isExportCurrent(uid, scope) });
 return exportOutcome(exported.status, `${movements.length} movimento(s) de ${visible(report.tagName)} no relatório.`);
}

function exportHistoryRange(request: AssistantExportRequest) {
 if (!request.historyStartDate && !request.historyEndDate) return undefined;
 const start = request.historyStartDate ? parseIsoDateAtLocalNoon(request.historyStartDate) : null;
 const end = request.historyEndDate ? parseIsoDateAtLocalNoon(request.historyEndDate) : null;
 if (!start || !end) return 'Informe datas válidas para o histórico da análise.';
 const range = { startDate: toFinancialCivilDate(start), endDate: toFinancialCivilDate(end) };
 return getCategoryAnalysisRangeError(range, toFinancialCivilDate(new Date())) ?? range;
}

function exportOutcome(status: 'shared' | 'printed' | 'popup-blocked' | 'cancelled', summary: string): ExportResult {
 if (status === 'cancelled') return { success: false, message: 'A sessão mudou antes de abrir o PDF. Nenhum novo compartilhamento foi iniciado.' };
 if (status === 'popup-blocked') return { success: false, message: 'O navegador bloqueou a janela do PDF. Permita pop-ups para este aplicativo e peça a exportação novamente.' };
 return { success: true, message: `${summary} ${status === 'shared' ? 'PDF gerado e compartilhamento do sistema aberto; escolha o destino para concluir.' : 'Janela de impressão aberta; escolha salvar como PDF ou imprimir para concluir.'}` };
}

async function exportRecurring(uid: string, request: AssistantExportRequest, catalog: AssistantResolvedCatalog, scope: ExportScope): Promise<ExportResult> {
 const type = request.target === 'mandatory_expenses' ? 'expense' : 'gain';
 const source = type === 'expense' ? 'mandatoryExpenses' : 'mandatoryGains';
 const period = request.period ?? formatCycleKey(new Date());
 const reference = parseIsoDateAtLocalNoon(`${period}-15`);
 if (!reference || !/^(19|20)\d{2}-(0[1-9]|1[0-2])$/.test(period) || period > formatCycleKey(new Date())) return { success: false, message: 'Informe um mês válido até o mês atual.' };
 const definitions = await (type === 'expense' ? getMandatoryExpensesWithRelationsFirebase(uid) : getMandatoryGainsWithRelationsFirebase(uid)); requireScope(uid, scope);
 if (!definitions.success) return { success: false, message: 'Não foi possível carregar todas as recorrências e contas relacionadas. Nenhum arquivo foi aberto.' };
 const all = new Map((definitions.data ?? []).map(item => [item.id, item as Record<string, unknown>]));
 for (const item of catalog[source] ?? []) if (item.realId && !all.has(item.realId)) all.set(item.realId, { ...item.data, id: item.realId, name: item.label });
 const { movements } = await readAssistantPeriodMovements(uid, { kind: 'bank_movements', period }, catalog); requireScope(uid, scope);
 const privateIds = getAssistantPrivateIdentifiers(catalog, uid);
 for (const item of all.values()) for (const key of ['id', 'personId', 'lastPaymentExpenseId', 'lastReceiptGainId']) if (typeof item[key] === 'string') privateIds.push(item[key] as string);
 const visible = (value: string) => redactAssistantPersonalData(scope.shouldHideValues ? maskFinancialValuesInText(value) : value, uid, privateIds);
 const money = (value: number) => scope.shouldHideValues ? '••••' : formatCents(value);
 let completedTotal = 0; let pendingTotal = 0; let unknown = 0;
 const items = [...all.values()].map<MandatoryPeriodSummaryPdfItem>(data => {
  const lastId = type === 'expense' ? data.lastPaymentExpenseId : data.lastReceiptGainId;
  const actual = movements.filter(item => item.type === type && item.economic && !item.reversed && (item.templateId === data.id || item.id === lastId));
  const cycles = Array.isArray(data.completedCycles) ? data.completedCycles : data.completedCycles && typeof data.completedCycles === 'object' ? Object.keys(data.completedCycles) : [];
  const lastCycle = type === 'expense' ? data.lastPaymentCycle : data.lastReceiptCycle;
  const lastValue = type === 'expense' ? data.lastPaymentValueInCents : data.lastReceiptValueInCents;
  const verifiedLegacyCycle = lastCycle === period && Number.isSafeInteger(lastValue) && Number(lastValue) > 0;
  const completed = actual.length > 0 || verifiedLegacyCycle || cycles.includes(period);
  const storedCycle = data.completedCycles && typeof data.completedCycles === 'object' && !Array.isArray(data.completedCycles) ? (data.completedCycles as Record<string, unknown>)[period] : null;
  const storedAmount = storedCycle && typeof storedCycle === 'object' ? (storedCycle as Record<string, unknown>).amountInCents : null;
  const totalInstallments = typeof data.installmentTotal === 'number' ? data.installmentTotal : null;
  const ended = !completed && totalInstallments !== null && Number(data.installmentsCompleted ?? 0) >= totalInstallments;
  const dateValue = (value: unknown) => value instanceof Date ? value : value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function' ? value.toDate() as Date : null;
  const starts = dateValue(data.installmentStartDate); const ends = dateValue(data.installmentEndDate); const created = dateValue(data.createdAt);
  const outside = !completed && (created && formatCycleKey(created) > period || starts && formatCycleKey(starts) > period || ends && formatCycleKey(ends) < period || period === formatCycleKey(new Date()) && ended);
  const historicalUnknown = !completed && !outside && period !== formatCycleKey(new Date()) && data.assistantCycleHistoryComplete !== true;
  const cycleValue = completed && actual.length ? actual.reduce((total, item) => total + item.valueInCents, 0) : verifiedLegacyCycle ? lastValue : completed ? storedAmount : totalInstallments !== null ? getMandatoryInstallmentValueInCents({ installmentTotal: totalInstallments, installmentsCompleted: data.installmentsCompleted, installmentValueInCents: data.valueInCents, installmentTotalValueInCents: data.installmentTotalValueInCents }) : data.valueInCents;
  const unknownAmount = completed && (!Number.isSafeInteger(cycleValue) || Number(cycleValue) <= 0);
  if (!outside && !historicalUnknown && !unknownAmount && (!Number.isSafeInteger(cycleValue) || Number(cycleValue) <= 0)) throw new Error('Uma recorrência tem valor inválido. Nenhum arquivo parcial foi aberto.');
  if (historicalUnknown || unknownAmount) unknown++; else if (!outside) { if (completed) completedTotal += Number(cycleValue); else pendingTotal += Number(cycleValue); }
  const due = resolveMonthlyOccurrence({ referenceDate: reference, dueDay: Number(data.dueDay ?? 1), usesBusinessDays: data.usesBusinessDays === true }).date;
  return { id: '', name: visible(typeof data.name === 'string' ? data.name : 'Recorrência'), statusLabel: historicalUnknown ? 'Histórico não disponível' : outside ? 'Fora do ciclo' : completed ? type === 'expense' ? 'Pago no mês' : 'Recebido no mês' : 'Pendente no mês', dateLabel: formatIsoDate(due).split('-').reverse().join('/'), tagLabel: '', scheduleLabel: totalInstallments ? `${totalInstallments} parcelas no contrato` : 'Recorrente', description: visible(typeof data.description === 'string' ? data.description : ''), amountLabel: historicalUnknown || unknownAmount ? 'Valor histórico não conferido' : outside ? 'Fora do ciclo' : money(Number(cycleValue)), amountTone: type };
 });
 const title = type === 'expense' ? 'Despesas fixas' : 'Receitas fixas';
 const html = buildMandatoryPeriodSummaryPdfHtml({ reportKindLabel: title, title, monthLabel: period, generatedAtLabel: formatIsoDate(new Date()), primaryMetricLabel: 'Cadastros encontrados', primaryMetricValue: String(items.length), primaryMetricHelper: unknown ? `${unknown} histórico(s) não reconstruído(s) no armazenamento legado. Totais parciais apenas dos itens conferidos.` : 'Conjunto completo dos cadastros acessíveis; itens fora do ciclo não compõem os totais.', metrics: [{ label: type === 'expense' ? 'Pago' : 'Recebido', value: money(completedTotal), tone: type }, { label: 'Pendente conferido', value: money(pendingTotal), tone: type }], items, cardBaseColor: LUMUS_RUNTIME_COLORS.dark.surface, cardGlowColor: LUMUS_RUNTIME_COLORS.dark.surfaceMuted, cardHighlightColor: LUMUS_RUNTIME_COLORS.dark.border, emptyStateLabel: 'Nenhuma recorrência acessível.', privacyNotice: scope.shouldHideValues ? 'Valores ocultos conforme a preferência de privacidade.' : null });
 requireScope(uid, scope);
 const { exportHtmlReport } = require('@/utils/reportExport') as typeof import('@/utils/reportExport');
 const exported = await exportHtmlReport({ html, fileName: buildPdfFileName([title, period]), dialogTitle: title, isCurrent: () => isExportCurrent(uid, scope) });
 return exportOutcome(exported.status, `${items.length} cadastro(s) de ${title.toLowerCase()} no relatório.${unknown ? ` ${unknown} histórico(s) legado(s) não disponíveis; totais parciais.` : ''}`);
}
