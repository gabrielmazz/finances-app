import {
	ASSISTANT_ACTION_KINDS,
	type AssistantModelCatalog,
	type AssistantReportNarrationRequest,
} from '@/types/lumusAssistant';

type JsonSchema = Record<string, unknown>;

const stringField = (description: string): JsonSchema => ({ type: 'string', description });
const integerField = (description: string): JsonSchema => ({ type: 'integer', description });
const booleanField = (description: string): JsonSchema => ({ type: 'boolean', description });

const ACTION_PAYLOAD_PROPERTIES: Record<string, JsonSchema> = {
	name: stringField('Nome curto e claro do registro.'),
	valueInCents: integerField('Valor em centavos. R$ 50,00 deve ser 5000.'),
	date: stringField('Data civil no formato YYYY-MM-DD.'),
	time: stringField('Horário opcional no formato HH:mm.'),
	bankRef: stringField('Identificador temporário do banco ou cash.'),
	sourceBankRef: stringField('Identificador temporário do banco de origem.'),
	targetBankRef: stringField('Identificador temporário do banco de destino.'),
	categoryRef: stringField('Identificador temporário da categoria.'),
	recordRef: stringField('Identificador temporário do registro encontrado.'),
	investmentRef: stringField('Identificador temporário do investimento.'),
	explanation: stringField('Explicação curta opcional.'),
	description: stringField('Descrição curta opcional.'),
	cycle: stringField('Ciclo mensal no formato YYYY-MM.'),
	initialBalanceCycle: stringField('Ciclo do saldo inicial no formato YYYY-MM.'),
	initialBalanceInCents: integerField('Saldo inicial do banco em centavos; pode ser negativo ou zero.'),
	bankName: stringField('Nome do banco.'),
	categoryName: stringField('Nome da categoria.'),
	usageType: stringField('expense, gain ou both.'),
	dueDay: integerField('Dia de vencimento, de 1 a 31.'),
	usesBusinessDays: booleanField('Se o vencimento considera dias úteis.'),
	reminderEnabled: booleanField('Se o lembrete está habilitado.'),
	reminderDaysBefore: integerField('Antecedência de 1 a 3 dias.'),
	reminderOnDueDate: booleanField('Se também lembra no vencimento.'),
	reminderTime: stringField('Horário do lembrete HH:mm.'),
	installmentTotal: integerField('Quantidade total de parcelas.'),
	installmentStartDate: stringField('Data inicial de parcelas YYYY-MM-DD.'),
	installmentEndDate: stringField('Data final de parcelas YYYY-MM-DD.'),
	initialValueInCents: integerField('Valor inicial do investimento em centavos.'),
	currentValueInCents: integerField('Valor atual do investimento em centavos.'),
	syncedValueInCents: integerField('Novo valor sincronizado em centavos.'),
	cdiPercentageInBasisPoints: integerField('Percentual do CDI em basis points; 100% = 10000.'),
	annualRateInBasisPoints: integerField('Taxa CDI anual em basis points; 14,90% = 1490.'),
	effectiveFrom: stringField('Data inicial da taxa no formato YYYY-MM-DD.'),
	assetType: stringField('fixed_income, treasury, stock ou fund.'),
	valuationMethod: stringField('cdi ou manual.'),
	redemptionTerm: stringField('anytime, 1m, 3m, 6m, 1y, 2y ou 3y.'),
	paymentFormats: {
		type: 'array',
		items: { type: 'string' },
		description: 'Formas de recebimento, quando informadas.',
	},
	isMandatoryExpense: booleanField('Se a categoria atende gastos obrigatórios.'),
	isMandatoryGain: booleanField('Se a categoria atende ganhos obrigatórios.'),
	showInBothLists: booleanField('Se aparece também nas listas obrigatórias.'),
	colorHex: stringField('Cor hexadecimal opcional, como #FACC15.'),
	iconKey: stringField('Chave de ícone opcional.'),
};

export const ASSISTANT_FUNCTION_DECLARATIONS = [
	{
		name: 'prepare_financial_actions',
		description:
			'Prepara rascunhos financeiros no aplicativo. Esta função nunca grava dados. Use uma ação por operação solicitada, mesmo quando forem semelhantes.',
		parameters: {
			type: 'object',
			properties: {
				actions: {
					type: 'array',
					minItems: 1,
					maxItems: 20,
					items: {
						type: 'object',
						properties: {
							clientActionId: stringField('Identificador curto único dentro desta resposta.'),
							kind: {
								type: 'string',
								enum: [...ASSISTANT_ACTION_KINDS],
								description: 'Tipo exato da operação.',
							},
							payload: {
								type: 'object',
								properties: ACTION_PAYLOAD_PROPERTIES,
								description: 'Somente informações ditas pelo usuário ou resolvidas pelo catálogo.',
							},
							dependsOnActionIds: {
								type: 'array',
								items: { type: 'string' },
								description: 'IDs de ações desta resposta que precisam ser concluídas antes.',
							},
						},
						required: ['clientActionId', 'kind', 'payload'],
					},
				},
			},
			required: ['actions'],
		},
	},
	{
		name: 'request_financial_report',
		description:
			'Solicita um relatório determinístico calculado pelo Lumus. Use para resumo, análise, pesquisa ou previsão; nunca calcule totais por conta própria.',
		parameters: {
			type: 'object',
			properties: {
				kind: {
					type: 'string',
					enum: [
						'monthly_overview',
						'bank_movements',
						'cash_movements',
						'transaction_search',
						'category_analysis',
						'cash_flow_forecast',
						'pending_obligations',
						'investment_portfolio',
					],
				},
				period: stringField('Período YYYY-MM, quando aplicável.'),
				bankRef: stringField('Identificador temporário do banco, quando aplicável.'),
				categoryRef: stringField('Identificador temporário da categoria, quando aplicável.'),
				query: stringField('Texto curto de pesquisa, quando aplicável.'),
			},
			required: ['kind'],
		},
	},
] as const;

const compactCatalog = (catalog: AssistantModelCatalog) =>
	Object.fromEntries(
		Object.entries(catalog).map(([key, values]) => [
			key,
			(values ?? []).slice(0, 50).map(item => ({
				handle: item.handle,
				label: item.label,
				...(item.description ? { description: item.description } : {}),
				...(item.ownerScope ? { ownerScope: item.ownerScope } : {}),
			})),
		]),
	);

export const buildAssistantSystemInstruction = ({
	nowIso,
	timeZone,
	catalog,
	activeSummary,
}: {
	nowIso: string;
	timeZone: 'America/Sao_Paulo';
	catalog: AssistantModelCatalog;
	activeSummary?: string;
}) => `Você é o Lumus IA, assistente financeiro do aplicativo Lumus.

Fale sempre em português do Brasil, com frases simples, acolhedoras e objetivas. O público pode ter pouco conhecimento financeiro.

Data e hora de referência: ${nowIso}.
Fuso obrigatório: ${timeZone}. Normalize toda data civil como YYYY-MM-DD e todo ciclo como YYYY-MM.

Regras inegociáveis:
1. Você interpreta pedidos e chama ferramentas para PREPARAR rascunhos ou SOLICITAR relatórios. Você nunca grava, edita nem exclui dados.
2. Uma fala com duas despesas gera duas ações separadas. Valores são sempre inteiros em centavos: R$ 50,00 = 5000.
3. Não invente banco, categoria, registro, investimento, data, valor ou identificador. Omita campos ausentes; o aplicativo perguntará um assunto por vez.
4. Use apenas handles temporários do catálogo. Nunca peça ou produza UID, e-mail, token, chave Firebase ou ID real.
5. “Sim”, “pode fazer” ou outra confirmação em texto nunca significa executar. Diga que o usuário deve tocar no botão Confirmar do cartão individual.
6. Para editar, excluir, desfazer, pagar ou receber, use recordRef do catálogo. Se houver ambiguidade, deixe recordRef ausente.
7. Transferências, recorrências e investimentos usam os comandos específicos; não proponha edição genérica dos lançamentos vinculados.
8. Dados marcados related_read_only podem aparecer em relatório, mas nunca podem ser alvo de ação.
9. Para resumo, análise, busca ou previsão, chame request_financial_report. Não calcule totais.
10. Não dê recomendação de investimento, promessa de retorno ou orientação financeira profissional.
11. Não gere HTML, Markdown complexo ou código. A resposta textual deve ter no máximo quatro parágrafos curtos.
12. Limite-se a no máximo 20 ações.
13. Quando uma ação usar um banco, categoria, investimento ou registro criado por outra ação da mesma resposta, adicione o ID em dependsOnActionIds e use no campo de referência o valor action:<clientActionId>. Se houver mais de um destino possível, omita o campo para o aplicativo perguntar.

Resumo ativo da sessão produzido pelo aplicativo (não contém histórico completo):
${activeSummary?.trim() || 'Nenhum rascunho ativo.'}

Catálogo mínimo desta conversa (somente identificadores temporários):
${JSON.stringify(compactCatalog(catalog))}`;

export const TRANSCRIPTION_INSTRUCTION = `Transcreva este áudio em português do Brasil.
Retorne apenas JSON válido no formato {"transcript":"..."}.
Preserve nomes, valores, datas e negações. Não interprete como ação, não corrija valores e não acrescente informações.`;

export const buildReportNarrationInstruction = (
	report: AssistantReportNarrationRequest['report'],
) => `Explique este relatório financeiro em português do Brasil, com linguagem simples e no máximo três parágrafos curtos.
Use exclusivamente as métricas fornecidas. Não recalcule valores, não acrescente números, não dê recomendação financeira e não gere HTML, código ou Markdown complexo.

Relatório calculado pelo Lumus:
${JSON.stringify(report)}`;
