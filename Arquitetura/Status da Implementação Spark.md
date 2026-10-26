---
tags: [spark, acompanhamento, implementacao, percentuais, planejamento]
relacionado: [[Plano de Funcionalidade Completa sem Blaze]], [[Integração Financeira Spark]], [[Processo de Release]]
status: em desenvolvimento
tipo: acompanhamento
versao: 1.8.0
revisado_em: 2026-10-25
spark_progress: 59
---

# Status da Implementação Spark

**Anotações por tela - 25/10/2026:** lista/editor compartilhados Web/mobile com atualização/retry e erro persistente. Armazenamento inválido não vira vazio nem pode ser sobrescrito por read-modify-write. Salvamento/recarga bloqueiam edição e conservam rascunho em falha/conflito; foco/UID/montagem protegem leituras. Revisão local annotations-2026-10-25 libera somente annotations uma vez. Dados continuam locais, removidos no logout explícito, sem Firebase/sincronização. Percentuais Spark mantidos (financeiro 78%, geral 59%); não é bootstrap/corte de contas. 40 testes focados distintos, tipagem, estilos e diff-check aprovados; sem homologação visual/aparelho ou deploy. Ver [[Anotações Locais]] e [[Versão Usável por Telas]].

**Diagnóstico de aporte local - 25/10/2026:** conta criada pelo cadastro tem Auth/perfil, mas ainda não possui bootstrap Spark (D03). `null` da ponte fazia a carteira tentar Functions desligadas na demonstração. O hook de investimento bloqueia esse fallback em demo-lumus-financas e orienta usar a conta preparada; Web/mobile mostram a causa na notificação. Cadastro/grupo não são migrados ou ativados automaticamente. 29 testes focados distintos, tipagem/estilos/diff-check aprovados. Ver [[Investimentos]], [[Guia de Testes Locais]] e [[Versão Usável por Telas]]. F08 75%, financeiro 78% e geral 59% mantidos; sem Rules/deploy/dados reais.

**Vínculos por tela - 24/10/2026:** convite/aceite/revogação usam Firestore e Rules com par canônico, revisão, recibo atômico e cota de dez envios/aceites por minuto. Somente destinatário aceita; revogação prevalece sobre grants antigos sem alterar grupo/papel. Formulário compartilhado Web/mobile tem listas/retry, revisão explícita, confirmação incerta e guardas por foco/UID. Liberação local somente addUserRelation uma vez. U02 sobe a 65% (75/75/25/75), bloco usuários 50% e geral 59% (58,8375% exatos); financeiro 78% preservado. 101 testes focados distintos e cinco regressões de Rules aprovados; tipos app/backend, estilos e diff-check conferidos. Evidências em [[Versão Usável por Telas]] e [[Vínculos de Usuários Spark]]. Membros, conversão integral, rollout legado e aparelhos continuam pendentes; sem deploy ou dados reais.

**Perfil por tela - 24/10/2026:** leitura própria confirmada no servidor, atualização/retry Web/mobile preservando rascunho e salvamento por comparação transacional do nome. Conflito não sobrescreve outra sessão; envio bloqueia edição/recarga e respostas antigas não publicam dados/feedback. Resumo inválido não vira zero; cópia e foco conferem montagem/sessão. Revisão local libera somente profile uma vez, com addUserRelation independente. 50 testes focados distintos, tipagem/estilos/diff-check aprovados. Evidências e roteiro em [[Versão Usável por Telas]]. U01 mantém 100/75/75/75 (85%), financeiro 78% e geral 56%; U02 nativo, homologação e demais pendências permanecem. Sem deploy, escrita real ou novo aceite visual/Emulator/aparelho.

**Previsão financeira por tela - 24/10/2026:** Web/mobile compartilha leitura com snapshot por sessão/horizonte e guard de foco/geração. Falhas retornadas/lançadas limpam cenário e encerram loading/refresh, com retry. Atualização explícita e seletor 3/6/12 permanecem disponíveis em erro; detalhes reiniciados. Cálculos Spark, separação de posição/projeção e privacidade preservados; nenhum escritor adicionado. Revisão local libera somente financialForecast uma vez. 45 testes focados distintos, tipagem/estilos/diff-check aprovados. Evidências e roteiro em [[Versão Usável por Telas]]. F11 mantém 100/75/25/75 (75%), financeiro 78% e geral 56%; importados, assistente e homologação permanecem. Sem deploy, escrita real ou novo aceite visual/Emulator/aparelho.

**Análise por categoria por tela - 23/10/2026:** Web/mobile observa UID reativo, associa snapshot à consulta e descarta respostas antigas por sessão/período/foco/geração. Exceções e falhas retornadas limpam dados e encerram carregamento/refresh, com retry e atualização explícita. PDF exige relatório pronto, trava simultânea e escopo atual; privacidade e estornos líquidos preservados. Revisão local libera somente categoryAnalysis uma vez. 49 testes focados distintos, tipagem/estilos/diff-check aprovados. Evidências e roteiro em [[Versão Usável por Telas]]. F10 mantém 100/75/50/50 (78%), financeiro 78% e geral 56%; volume, compatibilidade e homologação permanecem. Sem deploy, escrita real ou novo aceite visual/Emulator/aparelho.

**Investimentos por tela - 23/10/2026:** cadastro Web/mobile usa saldo canônico confirmado e retry, atualiza a origem após sucesso e permite confirmar a mesma tentativa após débito. Carteira descarta respostas antigas, limpa fotografias anteriores e não calcula resultado com histórico/taxas indisponíveis. Estado por UID, trava síncrona, bloqueio de material pendente e confirmação/continuação preservam as fases financeiras. Cache falha separadamente. Revisão local habilita somente addFinance uma vez. 66 testes focados distintos, tipagem/estilos/diff-check aprovados. Evidências e roteiro em [[Versão Usável por Telas]]. F08 mantém 100/75/25/75 (75%), financeiro 78% e geral 56%; importados, recuperação integral, assistente e homologação permanecem. Sem deploy, escrita real ou nova validação visual/Emulator/aparelho.

**Receitas recorrentes por tela - 23/10/2026:** entrada Web/mobile confirma contexto/registro com retry, preserva categorias autorizadas do grupo e bloqueia material incerto/contrato existente. Listas descartam respostas antigas por UID/foco/geração, oferecem atualização/retry e ocultam resumo/PDF indisponíveis. Agenda falha separadamente; modal mantém a confirmação incerta. Receita parcelada exige nominal exato com resto final, sem quitação negociada. Revisão local habilita somente addMandatoryGains uma vez. 72 testes focados distintos, tipagem/estilos/diff-check aprovados. Evidências e roteiro desta revisão em [[Versão Usável por Telas]]. F07 mantém 100/75/50/75 (80%), financeiro 78% e geral 56%; recuperação integral após reload, compatibilidade, assistente e homologação continuam pendentes. Sem deploy, escrita real ou nova validação visual/Emulator/aparelho.

**Despesas recorrentes por tela — 23/10/2026:** entrada Web/mobile aguarda contexto/registro, conserva categorias autorizadas do grupo e bloqueia material incerto. Lista ganha recarga/retry, descarte por UID/foco/geração e resumo/PDF indisponíveis em falha. Agenda e cache falham separadamente; ações incertas conservam confirmação. Liberação local somente da chave compartilhada addMandatoryExpenses. 65 testes focados distintos, tipagem/estilos/diff-check aprovados; sem nova validação visual/Emulator/aparelho ou deploy. F07 mantém 100/75/50/75 (80%), financeiro 78% e geral 56%; recuperação integral após reload, compatibilidade restante, assistente e homologação permanecem. Evidências desta revisão e roteiro em [[Versão Usável por Telas]].

**Ajuste por tela — 23/10/2026:** formulário compartilhado Web/mobile usa abertura/prévia por UID/rota/seleção, atualiza a prévia pronta sem perder rascunho e isola preparações atrasadas. Resultado incerto bloqueia argumentos e conserva a tentativa; sucesso persiste sem confundir falha de cache com falha financeira. Liberação local apenas de bankBalanceAdjustment. 71 testes focados distintos, tipagem/estilos/diff-check aprovados. F05 mantém 100/75/25/75 (75%), financeiro 78% e geral 56%. Recuperação material após reload, assistente, compatibilidade importada/especial e homologação continuam pendentes. Validação desta revisão e roteiro em [[Versão Usável por Telas]].

**Saque para Caixa por tela — 23/10/2026:** Web/mobile usam contexto/catálogo/saldo com retry e Caixa canônico ativo, descartam respostas antigas e atualizam a origem após sucesso. Justificativa de banco negativo fica explícita; confirmação incerta bloqueia campos e conserva argumentos mesmo com saldo já debitado ou erro de leitura. Liberação local uma vez apenas de addRescue. 57 testes focados distintos, tipagem/estilos/diff-check aprovados. F06 mantém 100/75/50/75 (80%); financeiro 78% e geral 56% preservados. Sem novo aceite visual autenticado, Emulator/aparelho ou deploy; compatibilidade, assistente e recuperação material após reload continuam pendentes. Validação desta revisão e roteiro em [[Versão Usável por Telas]].

**Transferência por tela — 23/10/2026:** formulário Web/mobile ganha carregamento compartilhado por UID/seleção, erro/retry, recarga dos dois saldos após sucesso e bloqueio visual dos argumentos incertos. A liberação local habilita somente transferScreen; 49 testes focados distintos, tipagem e estilos aprovados. Navegador não alcançou localhost nesta revisão; sem novo Emulator/aparelho. F06 permanece 100/75/50/75 (80%); financeiro 78% / geral 56% preservados. Assistente, compatibilidade antiga, recuperação material e homologação continuam pendentes. Validação e roteiro em [[Versão Usável por Telas]].

**Extrato/dashboard usáveis — 23/10/2026:** respostas obsoletas descartadas nas duas plataformas; retry e atualização explícita, estados indisponíveis sem zeros financeiros e PDF bloqueado após falha. Correções/estornos mantêm família econômica nos indicadores do extrato/filtros/gráfico/PDF, alinhados à Home. Liberação local uma vez para teste; 74 testes focados distintos, tipagem e estilos aprovados. F10 mantém P/I/D/E 100/75/50/50 (78%); financeiro 78% / geral 56% mantidos. Aceite visual/Emulator/aparelhos, volume e compatibilidade continuam pendentes; ver [[Versão Usável por Telas]].

**Continuação usável — 23/10/2026:** após os primeiros testes informados pelo usuário, ganhos/despesas Web/mobile passam a bloquear a entrada até confirmar contexto/registro e exibem erro persistente com retry. Hooks conferem sessão e descartam respostas de outras rotas/fontes. 58 testes focados aprovados; tipagem do aplicativo aprovada. F04 permanece 100/75/50/75 (80%), financeiro 78% / geral 56%: esta revisão não resolve compatibilidade, assistente, recuperação material ou homologação. Roteiro e limites em [[Versão Usável por Telas]].

**Primeiro fluxo iniciado — 23/10/2026:** [[Gerenciamento de Bancos]] liga saldo inicial declarado às duas telas, preservando abertura/catálogo/posição/checkpoint/receipt/cota atômicos e reenvio idempotente. Edição não altera saldo. Carregamento/retry bloqueiam envio sem contexto confirmado. Abertura mensal continua distinta. Notas F02 P/I/D/E e **78% financeiro / 56% geral mantidos**: conexão de campo e testes locais não resolvem compatibilidade antiga, ativação real ou homologação/aparelhos.

**Direção de entrega — 23/10/2026:** [[Versão Usável por Telas]] prioriza um primeiro percurso utilizável: bancos/saldo inicial → categorias → ganhos/despesas → extrato/dashboard. Todas as telas de produto começam desativadas por preferência local versionada; liberação manual não equivale a homologação ou migração. Protocolo v17, implementação e pendências preservados. **Mantidos 78% financeiro / 56% geral**, sem elevar cartões por ocultação de telas.

Revisão de **22/10/2026**, após completar os fluxos nativos de renegociação, parcelas vencidas e edição/desfazimento de avaliação de investimentos, além das entradas Web/mobile já conectadas. Este é o quadro canônico de acompanhamento. Escopo confirmado: Firebase Spark, Web/mobile e assistente, preservação das funcionalidades e dados, sem Blaze nem executor externo. A limitação de push com todos os aplicativos fechados foi aceita; lembretes locais e avisos ao abrir/retornar continuam obrigatórios.

**Financeiro completo: 78% implementado / 22% restante. Projeto Spark geral: 59% implementado / 41% restante. Publicação: ainda não aprovada.** Os números substituem as estimativas informais anteriores. Nenhum percentual significa tempo restante, linhas prontas, cobertura de testes ou garantia de ausência de defeitos.

## Como os percentuais são calculados

Continuação de 22/10: [[Recuperação de Operações Spark]] acrescenta identificação privada persistente, conferência após reload e cancelamento atômico contra confirmação tardia. O executor comum e o aviso compartilhado Web/mobile já estão conectados. A restauração integral de campos, provas e fases descritivas após reload continua pendente, assim como dados antigos, assistente e aparelhos. **Mantidas as notas e os percentuais 78% financeiro / 56% geral**: esta entrega avança dentro dos eixos já parciais, sem demonstrar o próximo patamar completo de integração/aceitação.

Cada módulo recebe quatro notas de acompanhamento, com base no código e nas evidências existentes:

| Eixo | Peso | O que mede |
|---|---:|---|
| P — Protocolo/serviço | 40% | Contrato e implementação do domínio no transporte Spark. Código reutilizável sem adaptação não recebe crédito de fluxo concluído. |
| I — Integração | 30% | Caminho efetivamente conectado nas entradas/consumidores do módulo. Tela existente apontando para legado/Functions não conta como tela Spark pronta. |
| D — Dados/compatibilidade | 20% | Identidades, referências, formatos anteriores, titularidade, reconciliação e preparo da transição aplicáveis ao módulo. |
| E — Evidência de aceitação | 10% | Validação específica do caminho Spark; não é porcentagem de cobertura. |

Notas usam **0 / 25 / 50 / 75 / 100**: ausente; base isolada/reutilizável; parcial; maioria entregue com lacunas conhecidas; critério integral daquele eixo demonstrado. No eixo E, 25 representa evidência preparatória/reutilizável, 50 testes dirigidos e integrações parciais, 75 domínio exercitado com SDK/Rules reais locais, e 100 requer a matriz de aceitação aplicável, incluindo Web/aparelhos/operação. Nenhum módulo desta revisão tem E=100.

`módulo = 0,40 × P + 0,30 × I + 0,20 × D + 0,10 × E`. O bloco é a média dos seus módulos pelos pesos internos. O geral é a média dos blocos pelos pesos abaixo. Os pesos são uma distribuição de escopo para acompanhamento, não estimativa de horas. O cálculo usa valores antes do arredondamento; só a exibição é arredondada ao inteiro mais próximo. As notas continuam sendo avaliações de engenharia e devem ser recalibradas quando o inventário mudar.

| Bloco | Peso no geral | Implementado | Restante |
|---|---:|---:|---:|
| Módulo financeiro completo | 50% | 78% | 22% |
| Dados, migração e ativação | 20% | 36% | 64% |
| Autenticação, usuários e privacidade | 10% | 50% | 50% |
| Assistente, IA e voz | 10% | 38% | 62% |
| Avisos e lembretes | 5% | 69% | 31% |
| Release, homologação e operação | 5% | 9% | 91% |
| **Projeto Spark geral** | **100%** | **59%** | **41%** |

Documentos de detalhe herdam a nota do módulo indicado no cartão de progresso. Eles não são unidades adicionais de trabalho: não somar o principal, o financiamento e a criação retroativa de investimentos novamente sobre F08. As fases do plano também se sobrepõem e não são somadas para calcular o geral.

## Fases do plano

| Fase | Progresso | Critério e situação |
|---|---:|---|
| 0 — Comparação histórica | 90% | Matriz de 15 callables/2 gatilhos e candidatos Git identificados; falta comprovar a última versão efetivamente publicada. |
| 1 — Prova crítica do protocolo | 100% | Critérios da prova inicial cumpridos em Auth/Firestore locais para as famílias ensaiadas. Não significa paridade integral nem publicação; novas famílias reabrem os critérios pertinentes. |
| 2 — Compatibilidade de dados | 36% | Resultado ponderado de D01–D03: ferramentas locais presentes, formatos/ativação real pendentes. |
| 3 — Serviços do núcleo financeiro | 100% | Média ponderada de P em F01–F11: contratos nativos definidos e ensaiados. Recuperação persistente, dados e integração/aceitação permanecem nos respectivos eixos e impedem concluir o módulo completo. |
| 4 — Usuários e privacidade | 50% | U01–U03: convites/aceite/revogação têm SDK/Rules e entradas Web/mobile; membros, conversão de dados, exclusão e homologação permanecem. |
| 5 — Integração completa | 65% | 70% do eixo I financeiro + 20% de A02 + 10% de N01/N02. Fluxos nativos principais Web/mobile conectados; assistente, recuperação integral e compatibilidade continuam parciais. |
| 6 — Perfil de release Spark | 0% | R01: script ainda publica functions,firestore; não existe perfil Spark implementado. |
| 7 — Homologação e transição | 23% | R02: cenário local reproduzível e ensaio autenticado dos fluxos principais; faltam matriz integral, aparelhos, piloto e reversão. |

Na fase 0, nove itens foram identificados/decididos: base Git anterior ao backend, introdução do backend, matriz das quinze callables, matriz dos dois gatilhos, caminhos de Auth/perfil, escritores financeiros anteriores, inventário de uso de Storage, direção Firebase sem executor externo e decisão de push. O décimo item — artefato/log da versão realmente publicada — não foi comprovado.

A fase 1 mede somente a prova inicial: identidade/replay/sessão, atomicidade/contrapartidas, tempo/checkpoints/correções e limites/cotas/concorrência no Emulator. Seus critérios locais estão demonstrados. O núcleo de serviços em 100% e a integração em 65% explicam por que essa fase concluída não deixa o produto pronto.

## Módulos e entregas restantes

### Módulo financeiro completo — 78%

| ID | Módulo | Peso no bloco | P | I | D | E | Progresso |
|---|---|---:|---:|---:|---:|---:|---:|
| F01 | Protocolo, histórico e preparação | 15% | 100 | 75 | 50 | 75 | **80%** |
| F02 | Bancos, cadastro e ciclo de vida | 10% | 100 | 75 | 25 | 75 | **75%** |
| F03 | Abertura mensal e saldos | 10% | 100 | 75 | 25 | 75 | **75%** |
| F04 | Despesas, receitas, edição e estorno | 15% | 100 | 75 | 50 | 75 | **80%** |
| F05 | Ajustes e reconciliações | 10% | 100 | 75 | 25 | 75 | **75%** |
| F06 | Transferências, saques e pares | 5% | 100 | 75 | 50 | 75 | **80%** |
| F07 | Recorrências e parcelas | 10% | 100 | 75 | 50 | 75 | **80%** |
| F08 | Investimentos e carteira completa | 10% | 100 | 75 | 25 | 75 | **75%** |
| F09 | Categorias e configuração do CDI | 5% | 100 | 75 | 75 | 75 | **85%** |
| F10 | Home, extrato e análise por categoria | 5% | 100 | 75 | 50 | 50 | **78%** |
| F11 | Previsão de fluxo de caixa | 5% | 100 | 75 | 25 | 75 | **75%** |

- **F01 — Falta:** Concluir restauração dos argumentos/provas/fases descritivas e progresso/pausa no assistente; medir custo em volumes representativos. Identificação, conferência e cancelamento já sobrevivem ao reload pelo executor comum. Ativação mensal conserva sua fila própria. **Evidência inspecionada:** `functions/sparkFinancialProtocol.ts; SparkOperationRecoveryFirebase.ts; SparkHistoryFirebase.ts; sparkHistorySegments.ts; SparkContextFirebase.ts; components/uiverse/banks/spark-operation-recovery-notice.tsx`.
- **F02 — Falta:** Converter cadastros antigos e homologar aparelhos. Criação, edição, arquivamento, restauração e atividade já possuem entradas Web/mobile. **Evidência inspecionada:** `functions/SparkBankFormFirebase.ts; hooks/useSparkBankForm.ts; SparkAccountFirebase.ts; SparkAccountCatalogFirebase.ts; SparkAccountLifecycleFirebase.ts; BankFirebase.ts`.
- **F03 — Falta:** Restaurar campos e prova da nova contagem após reload, conectar assistente e converter contas existentes. Valor negativo e ativação vencida na entrada do app já estão conectados. **Evidência inspecionada:** `functions/SparkBalanceFormFirebase.ts; hooks/useSparkMonthlyBalanceForm.ts; SparkTemporalBalanceFirebase.ts; SparkMonthlyActivationFirebase.ts; MonthlyBalanceFirebase.ts`.
- **F04 — Falta:** Conectar assistente, completar formatos legados/especiais e homologar. Sugestões recorrentes e origens de aporte/resgate já usam os serviços Spark. **Evidência inspecionada:** `functions/SparkMovementFormFirebase.ts; SparkOrdinaryReadFirebase.ts; SparkMovementListFirebase.ts; hooks/useSparkMovementForm.ts; ExpenseFirebase.ts; GainFirebase.ts; screens/mobile; screens/web`.
- **F05 — Falta:** Conectar assistente, ajustes importados/especiais, restauração integral após reload e homologação; criação/edição/estorno nativos já conectados. **Evidência inspecionada:** `functions/SparkBalanceFormFirebase.ts; hooks/useBankBalanceAdjustmentForm.ts; SparkBalanceFirebase.ts; SparkAdjustmentReplacementFirebase.ts; BankBalanceAdjustmentFirebase.ts; SparkStatementFirebase.ts`.
- **F06 — Falta:** Completar fontes antigas sem identidade resolvível, assistente e homologação. Pares nativos de investimento e importados com permissão explícita já têm estorno no extrato. **Evidência inspecionada:** `functions/SparkPairFormFirebase.ts; hooks/useSparkPairForm.ts; SparkTransferFirebase.ts; SparkStatementFirebase.ts; screens/mobile; screens/web`.
- **F07 — Falta:** Concluir restauração integral das intenções, compatibilidade restante, assistente e homologação. Replanejamento com sucessor/configuração atômicos, desfazimento ordenado e liquidação de parcelas após o prazo já possuem serviço/Rules e entradas Web/mobile. **Evidência inspecionada:** `functions/SparkRecurringFirebase.ts; SparkRecurringMetadataFirebase.ts; SparkRecurringReadFirebase.ts; MandatoryExpenseFirebase.ts; MandatoryGainFirebase.ts`.
- **F08 — Falta:** Concluir restauração integral após reload, capital/catálogo importados, assistente e homologação. Principal/financiamento com avaliação no mesmo commit e desfazimento da avaliação vigente já estão conectados; avaliações anteriores não têm estorno genérico. **Evidência inspecionada:** `functions/SparkInvestmentOpeningFirebase.ts; SparkInvestmentPrincipalFirebase.ts; SparkInvestmentFundingFirebase.ts; FinancesFirebase.ts`.
- **F09 — Falta:** Concluir a conversa/replay Spark e ensaiar os formatos antigos restantes; projeção do investimento pertence a F08. **Evidência inspecionada:** `functions/SparkCategoryFirebase.ts; SparkCdiRateFirebase.ts; SparkMetadataCommandFirebase.ts; TagFirebase.ts; InvestmentCdiRateFirebase.ts`.
- **F10 — Falta:** Completar ações especiais de referências/importados, medir leituras e homologar Web/aparelhos. Home usa projeção CDI somente com proveniência completa. **Evidência inspecionada:** `functions/SparkHomeFirebase.ts; SparkStatementFirebase.ts; CategoryAnalysisFirebase.ts; hooks/useFinanceQueries.ts; screens/mobile/BankMovementsScreen.tsx; screens/web/BankMovementsScreen.web.tsx`.
- **F11 — Falta:** Concluir formatos antigos, integração conversacional e homologação dos horizontes. A previsão canônica já parte das posições atuais e projeta compromissos sem reaplicar o journal. **Evidência inspecionada:** `functions/FinancialForecastFirebase.ts; utils/financialForecast.ts`.

### Dados, migração e ativação — 36%

| ID | Módulo | Peso no bloco | P | I | D | E | Progresso |
|---|---|---:|---:|---:|---:|---:|---:|
| D01 | Inventário, backup e restauração | 30% | 75 | 0 | 50 | 75 | **48%** |
| D02 | Normalização e importação financeira | 40% | 75 | 0 | 50 | 75 | **48%** |
| D03 | Bootstrap, consentimento e corte | 30% | 25 | 0 | 0 | 0 | **10%** |

- **D01 — Falta:** Preparar captura autorizada real, Rules implantadas e produtos fora da cópia Firestore; ensaiar a cópia específica. **Evidência inspecionada:** `backend/scripts/sparkSnapshot.ts; backend/scripts/lib/sparkLocalSnapshot.ts`.
- **D02 — Falta:** Concluir formatos legados/especiais, capital/cadastros e contas inativas/futuras, conservando proveniência. **Evidência inspecionada:** `backend/scripts/lib/sparkLegacyNormalization.ts; sparkLedgerImport.ts; sparkRecurringImport.ts; utils/sparkFinancialReconciliation.ts`.
- **D03 — Falta:** Implementar primeira inicialização e ativação controlada, consentimentos, corte dos escritores e recuperação. **Evidência inspecionada:** `backend/scripts/lib/sparkBootstrapPreflight.ts; backend/scripts/lib/sparkLedgerImport.ts; firestore.rules`.

### Autenticação, usuários e privacidade — 50%

| ID | Módulo | Peso no bloco | P | I | D | E | Progresso |
|---|---|---:|---:|---:|---:|---:|---:|
| U01 | Auth, sessão, perfil e privacidade visual | 20% | 100 | 75 | 75 | 75 | **85%** |
| U02 | Convites, aceite e revogação | 50% | 75 | 75 | 25 | 75 | **65%** |
| U03 | Solicitação e processamento de exclusão | 30% | 0 | 0 | 0 | 0 | **0%** |

- **U01 — Falta:** Homologar login/perfil/sessão, App Check e limpeza de cache no ambiente Spark instalado. **Evidência inspecionada:** `contexts/AuthContext.tsx; contexts/FinanceDataContext.tsx; functions/SparkContextFirebase.ts; functions/RegisterUserFirebase.ts`.
- **U02 — Falta:** Concluir filiação de grupos sem autoatribuição, conversão integral dos vínculos/convites existentes, rollout com bloqueio dos endpoints antigos, volume/abuso e homologação. Par nativo, convite/aceite/revogação, recibo/cota, leitores e entradas Web/mobile já conectados. **Evidência inspecionada:** `functions/SparkUserRelationshipFirebase.ts; UserRelationshipFirebase.ts; RegisterUserFirebase.ts; hooks/useUserRelationships.ts; components/uiverse/users/user-relationships-form.tsx; firestore.rules; backend/tests/sparkUserRelationships.emulator.test.ts`.
- **U03 — Falta:** Substituir a callable por solicitação própria protegida e definir atendimento/retenção/processamento. **Evidência inspecionada:** `functions/RegisterUserFirebase.ts; backend/src/accountDeletionRequests.ts`.

### Assistente, IA e voz — 38%

| ID | Módulo | Peso no bloco | P | I | D | E | Progresso |
|---|---|---:|---:|---:|---:|---:|---:|
| A01 | Conversa, IA, voz e configuração | 25% | 100 | 75 | 50 | 50 | **78%** |
| A02 | Catálogo, consultas e execução Spark | 75% | 25 | 25 | 25 | 25 | **25%** |

- **A01 — Falta:** Homologar AI Logic/App Check, cota disponível e voz Web/mobile; execução financeira é A02. **Evidência inspecionada:** `services/lumusAssistant/assistantApplicationService.ts; services/lumusAssistant; contexts/LumusAssistantContext.tsx`.
- **A02 — Falta:** Migrar catálogo/relatórios e comandos de todas as famílias, receipts Spark, confirmações e retomada por UID. **Evidência inspecionada:** `services/lumusAssistant/assistantCatalogService.ts; assistantReportService.ts; financeCommandService.ts; functions/FinancialLedgerFirebase.ts`.

### Avisos e lembretes — 69%

| ID | Módulo | Peso no bloco | P | I | D | E | Progresso |
|---|---|---:|---:|---:|---:|---:|---:|
| N01 | Avisos compartilhados ao abrir/retornar | 40% | 100 | 75 | 50 | 50 | **78%** |
| N02 | Lembretes locais dos planos Spark | 60% | 75 | 75 | 25 | 50 | **63%** |

- **N01 — Falta:** Homologar cursor/reconexão entre aparelhos e acesso revogado sem perder avisos pendentes. **Evidência inspecionada:** `functions/SparkSharedChangesFirebase.ts; utils/sparkSharedChanges.ts; components/app/app-root.tsx`.
- **N02 — Falta:** Homologar permissão/cancelamento/retomada em aparelhos e formatos convertidos; planos/ciclos Spark e reconciliação em primeiro plano já conectados. **Evidência inspecionada:** `utils/mandatoryReminderNotifications.ts; utils/localNotifications.ts; functions/SparkRecurringReadFirebase.ts`.

### Release, homologação e operação — 9%

| ID | Módulo | Peso no bloco | P | I | D | E | Progresso |
|---|---|---:|---:|---:|---:|---:|---:|
| R01 | Perfil de publicação Spark | 50% | 0 | 0 | 0 | 0 | **0%** |
| R02 | Homologação e transição controlada | 30% | 25 | 25 | 0 | 50 | **23%** |
| R03 | Dependências, cotas e custo operacional | 20% | 25 | 0 | 0 | 25 | **13%** |

- **R01 — Falta:** Criar o fluxo Spark que publique Rules/índices/cliente sem Functions, preservando os gates. **Evidência inspecionada:** `script/release.js; firebase.json; package.json`.
- **R02 — Falta:** Completar matriz visual Web/aparelhos, APK/AAB, reversão e conta piloto antes da transição. **Evidência inspecionada:** `script/spark_dev.js; firebase.spark.local.json; backend/tests/sparkDemo.emulator.test.ts; tests/sparkDemoHome.emulator.test.ts; Arquitetura/Guia de Testes Locais.md`.
- **R03 — Falta:** Atualizar audit de dependências e medir documentos/cotas/retries/Rules sob volume representativo. **Evidência inspecionada:** `utils/firebaseReadAudit.ts; utils/sparkPreparationBudget.ts; Arquitetura/Auditoria do Processo de Release.md`.

## Bloqueios que ainda impedem a publicação

1. **Primeiro uso e contas existentes:** o importador continua `verified-locked`, com `activationAllowed:false`; bootstrap/consentimento/corte reais não foram implementados nem autorizados. A demonstração possui inicialização administrativa fictícia, exclusiva do emulador.
2. **Recuperação financeira após reload:** ativação mensal descobre a prova privada no servidor. Novos lançamentos, contagens, pares, recorrências e investimentos ainda conservam intenção/material em memória. Não reiniciar uma operação incerta com outro ID.
3. **Recorrências:** replanejamento assistido de contrato e parcelas em atraso após a vigência permanecem pendentes. A edição não reescreve contrato nem inventa parcelas pagas. Quitação com desconto/acréscimo está implementada, com motivo, nominal contratual e caixa real distintos.
4. **Investimentos:** falta unir mudança de principal/financiamento e avaliação numa única intenção financeira, desfazer avaliação e completar capital/catálogo das fontes antigas. Abertura, principal, troca de banco, sincronização, aporte/resgate, estorno de pares e arquivo/restauração nativos possuem serviços/entradas. CDI usa o titular da abertura imutável, sem presumir dono pelo editor.
5. **Assistente:** catálogo/relatórios e executor financeiro ainda não usam todas as famílias Spark. Escritores antigos das fachadas não podem ser usados para mutações Spark; as telas conectadas os interceptam por pontes específicas.
6. **Compartilhamento e exclusão:** convites, aceite, revogação, consentimento e processamento de exclusão ainda exigem protocolo Spark completo; as callables atuais não são solução no Spark.
7. **Homologação:** ausência de Functions foi demonstrada nos serviços locais. Navegador bloqueado por política impede ensaio visual novo; APK/AAB, iOS/aparelhos, custos representativos, piloto e reversão continuam pendentes. Lembretes locais precisam de teste instalado, sobretudo permissão/canal/reagendamento.
8. **Release:** o fluxo principal ainda publica `functions,firestore`. Perfil Spark, auditoria de dependências e publicação ordenada de Rules/índices/cliente continuam fora desta entrega.

## Evidências conferidas nesta revisão

A reanálise inicial inspecionou código, Rules, planos, adaptadores, consumidores e logs locais. A continuação de comandos/seletores executou novas validações locais abaixo; não executou audit de dependências, inventário remoto nem deploy. Logs anteriores continuam identificados como checkpoints históricos, sem certificar novamente todo o sistema.

| Evidência existente | Resultado registrado | Limite |
|---|---|---|
| `.expo/spark-forms-verified.log` | Estilos/tipos + 104 testes de ferramentas + 951 comuns aprovados | 88 condicionais ignorados, sem homologação em aparelhos. |
| `.expo/spark-form-emulator.log` | 8 cenários Auth/Firestore/Rules aprovados, zero ignorados | Pipeline dos formulários/leitores/estorno, com Functions desligadas; não exercita interação visual no navegador ou dispositivo. |
| `.expo/spark-forms-tokyo.log` e `spark-forms-la.log` | Os mesmos 21 cenários dirigidos aprovados em cada fuso | Não somar como 42 requisitos diferentes. |
| `.expo/spark-forms-web-complete.log` e `spark-forms-android-complete.log` | Exportações locais finais Web e Android aprovadas | Android conserva aviso conhecido de `web-streams-polyfill` com fallback; não houve APK/AAB nem execução instalada. |
| `.expo/spark-movement-command-check-final.log` | Estilos/tipos + 104 testes de ferramentas + 930 comuns aprovados | 88 condicionais ignorados, sem nova exportação ou homologação em aparelhos. |
| `.expo/spark-movement-command-verified.log` | 109 cenários dirigidos Auth/Firestore/Rules, zero ignorados | Operações ordinárias, descrição, confirmação/replay, importados e seleção bancária; não é nova execução integral de todas as famílias. |
| `.expo/spark-home-approved.log` | Estilos/tipos + 104 testes de ferramentas + 911 comuns aprovados | 88 condicionais ignorados; não são integração aprovada. |
| `.expo/spark-home-emulator.log` | 3 cenários SDK Auth/Firestore da continuação da Home, zero ignorados | Leitura/ciclos/paginação/recusa, não matriz de telas. |
| `.expo/spark-proof-2026-10-19/closure/full-spark-verified.log` | 1.004 cenários Spark e cinco scripts de Rules aprovados | Checkpoint anterior à Home; não somar com os testes dirigidos como uma execução integral atual. |
| `.expo/spark-proof-2026-10-19/closure/restore-verified.log` | 21 cenários de restore/importação aprovados | Somente fixtures locais, sem restauração real. |
| `.expo/spark-home-tokyo.log` e `spark-home-la.log` | 38 cenários novos aprovados em cada fuso | Não equivalem a aparelhos nem a 76 requisitos novos. |
| `.expo/spark-home-web-final.log` e `spark-home-android-final.log` | Bundles locais exportados | Android conserva o aviso conhecido de resolução de pacote; não houve APK/AAB nem execução instalada nesta fase. |

O working tree contém alterações e arquivos novos ainda sem commit. Esta avaliação cobre os arquivos locais, não o estado de uma branch publicada nem a configuração remota. Não foi verificado plano de cobrança, franquia disponível ou configuração de produção.

## Continuação de 20/10: formulários e ações ordinárias

F04 passa de I=25 a I=50. `useSparkMovementForm` e `SparkMovementFormFirebase` ligam os quatro formulários ao comando Spark antes de qualquer escrita/sugestão anterior; somente contexto realmente legado autoriza continuar no fluxo antigo. A intenção captura campos antes das esperas e conserva ID/data/argumentos no reenvio. Resultado incerto bloqueia a troca de campos até recuperar o mesmo comando. Após sucesso confirmado, outro envio explícito pode iniciar um lançamento novo mesmo com valores iguais, respeitando a preferência de manter os campos; cliques concorrentes continuam bloqueados pelas telas.

`SparkOrdinaryReadFirebase` carrega documento/claim/conta canônicos, preserva namespace e fingerprint, recusa originais resolvidos/especiais e apresenta a data civil de São Paulo sem perder o Timestamp original. Edição no mesmo dia conserva nanossegundos; segunda edição intencional usa o substituto confirmado. O formulário de despesa conserva formatos anteriores que não possui controle para alterar. Caixa é explícito; banco ausente não vira Caixa. A data inicial e o reset dos quatro formulários usam São Paulo.

As seis consultas de listas de `ExpenseFirebase`/`GainFirebase` consultam o journal Spark antes das relações/coleções antigas. A lista vigente contém substitutos não resolvidos, não os inversos nem os originais cancelados; inclui efetivações recorrentes e movimentos econômicos importados elegíveis à leitura, sem conceder edição ordinária a fontes especiais. Pares/referências continuam nos seus domínios. Identidade visual e referência executável permanecem separadas. A lista é ordenada pela data efetiva; não fabrica `createdAt` com essa data nem promete ordenação pelo instante de registro. Enriquecimento de perfil compartilhado não é inferido: o campo `person` permanece nulo nessa ponte e exige o trabalho de usuários/privacidade.

O extrato Web/mobile oferece edição/estorno somente para referência ordinária vigente. Editar abre o formulário com fonte e operação explícitas; estornar prepara uma confirmação com ID/data/fingerprint fixos e compensa na data atual, conservando histórico. Falha de atualização da consulta após commit não é tratada como falha financeira. Alteração de UID impede o feedback/navegação da sessão anterior. Ajustes, pares e investimentos mantêm os fluxos específicos; não foram liberados por esta entrega.

Fontes recorrentes/investimentos recebidas pelos quatro formulários ainda são recusadas no caminho Spark antes de qualquer gravação, até conectar seus protocolos atômicos. O envio comum não reproduz ainda a sugestão recorrente do caminho legado. O assistente continua sem catálogo/relatórios/executor Spark completos; A02 mantém 25%. Essas lacunas impedem declarar o bloco 1 ou F04 concluídos. Não houve dado real, ativação, deploy ou cobrança.

Notas não alteradas além de I de F04: F04=72,5%, financeiro=63,875%, integração=35,125%, geral=47,8875%, antes do arredondamento. E=75 já existia pelo domínio integrado local; exportações e testes adicionais não promovem o eixo a 100 sem a matriz de navegador/aparelhos/operação.

## Continuação de 19/10: comandos ordinários e seleção bancária

F02 passa de I=25 a I=50 porque `getAllBanksFirebase`, `getBanksByPersonFirebase` e `getBanksWithUsersByPersonFirebase` consultam posições/catálogos Spark antes das relações e coleções anteriores. Os quatro formulários de despesas/receitas já consomem esses seletores. A seleção padrão exclui arquivados/inativos, Caixa e investimentos; a opção administrativa inclui inativos explicitamente. Ausência de catálogo exige reconciliação, sem inventar titularidade a partir do último editor. Selecionar não promete saldo corrente: o writer continua obrigado a verificar o prazo e a posição na transação.

F04 permanece em 65%: `executeSparkMovementCommandFirebase` implementa o contrato único de criar/corrigir/estornar, mas seu envio ainda não está ligado aos formulários/listas/executor. A confirmação integral, proposta conversacional e fingerprint do alvo entram no receipt e no replay; timestamp mantém nanossegundos, alvo conserva namespace e família, campos são copiados antes das esperas. Operações especiais são recusadas pelo contrato ordinário. A validação do identificador também passou a recusar valores não textuais, evitando a coerção JavaScript de `undefined` para um identificador aparentemente válido.

O primeiro ensaio encontrou estouro do limite de 1.000 expressões em uma correção com duas contas, categoria nova e descrição. A correção remove a repetição de validações da descrição no receipt: o documento descritivo novo valida esquema/autoria/identidade e igualdade integral com o mapa do receipt; o receipt exige o documento criado neste commit. Não se removeu a atomicidade nem se aceitou recusa por esgotamento como evidência de proteção. O ensaio final incluiu categoria nova, oito formatos completos, textos Unicode nos limites e confirmação material. Tentativa malsucedida preservada em `.expo/spark-movement-command-emulator.log`.

Resultados antes do arredondamento: F02=67,5%, financeiro=62,75%, integração=32,5%, geral=47,325%. O geral exibido continua em 47% pelo arredondamento; as outras notas não aumentaram somente pela adição de testes/arquivos. A próxima entrega continua no bloco 1: leitores e envio coordenado, estabilidade da data/identidade nas telas, referências/fingerprints do alvo e ramos especiais atômicos, acompanhados pelo assistente.

## Continuação de 20/10: ambiente testável e bancos

Validação Web autenticada: login, Home com saldos iniciais, cadastro de “Banco de teste Web”, seleção/categoria da receita e registro de R$ 100,00 pela interface. Home confirmou saldo, indicador e timeline. Evidência `.expo/spark-local-home.png` e `.expo/spark-local-live.log`; cenário deixado aberto na porta 8082. Isso acrescenta um caminho visual demonstrado, mas não conclui a matriz Web/aparelhos e não promove E a 100.

Validação desta entrega: `.expo/spark-local-check.log` aprovou estilos/tipos, 104 ensaios de ferramentas e 951 testes comuns; 89 condicionais ignorados não são aceitação integrada. `.expo/spark-local-ui-final.log` revalida estilos/tipos após o ajuste final do estado de carregamento. `.expo/spark-local-rules-regression.log` confirma **1.037 cenários Spark**, zero falhas/ignorados, e cinco suítes existentes de Rules com saída zero. `.expo/spark-local-demo-fixed.log` confirma nove ensaios de serviços e um do leitor da aplicação. Exports finais em `.expo/spark-local-web.log` e `.expo/spark-local-android.log`, ambos aprovados; o Android conserva o aviso já conhecido de fallback do `web-streams-polyfill`. Nenhum APK/AAB ou aparelho foi homologado. Auditoria do recorte em `Arquitetura/Auditoria Spark Local.json`. Cinquenta cartões/24 módulos conferidos com a mesma fórmula.

[[Guia de Testes Locais]] oferece `dev:spark:web`, `dev:spark` e `test:spark:demo`, com conta, bancos, Dinheiro e categorias fictícios no projeto local fixo. Não inicia Functions, não reutiliza/limpa outra sessão e não implementa bootstrap/corte real. F02 passa a I=75 com criação zero/edição por revisão nas duas telas, intenção estável, rejeição de alterações durante resultado incerto, releitura canônica e invalidação de consultas após commit. Ciclo de vida nas telas e conversão antiga continuam pendentes.

O novo ensaio encadeado revelou estouro do limite de expressões na correção com categoria sobre conta criada com checkpoint. A seleção de contrato ordinário passou a ocorrer primeiro, preservando os mesmos guards e recusas. Nove cenários de SDK + um cenário do leitor Home/seletores/categorias passam sem Functions. Regressão ampla e validação de exportações estão registradas nas evidências desta entrega. R02 passa a I=25/E=50 pelo roteiro executável e ensaio autenticado reproduzível; D03 não sobe, pois a conta fictícia preparada por Admin no emulador não é ativação real.

Valores antes de arredondar: F02=75%, financeiro=64,625%, integração=36,875%, release=9,25%, geral=48,4125%. O geral exibido continua 48%. Aparelhos, publicação e transição real permanecem sem aprovação.

## Continuação de 20/10: transferências, saques e estornos

`SparkPairFormFirebase` e `useSparkPairForm` conectam os dois formulários de transferência e os dois de saque aos serviços Spark. Somente contexto legado confirmado permite o fluxo anterior; erro, revogação ou contexto ausente depois de preparar intenção não liberam o escritor antigo. Campos/data são copiados antes das esperas; resultado incerto conserva ID, modo e argumentos e impede alterar o material. Depois do sucesso, um envio explícito inicia outra intenção mesmo com campos iguais. Essa recuperação permanece em memória, sem promessa de retomada após reload/desmontagem.

Operações do dia civil de São Paulo usam o instante autoritativo do commit. Datas passadas usam o serviço datado e conservam o Timestamp no reenvio; datas futuras são recusadas. Isso evita rejeitar um lançamento de hoje por relógio do navegador ligeiramente adiantado. Se o dia muda com resultado incerto, só se recupera um receipt existente: não se cria silenciosamente uma operação em outro dia.

Os painéis usam `getBankCurrentBalanceInCentsFirebase`, com contexto e validade temporal Spark, em vez do leitor exclusivamente antigo. A leitura de origem descarta respostas atrasadas após trocar a seleção. Saque exige o Caixa canônico ativo; não aceita trocar o destino nem reivindicar propriedade do Caixa compartilhado. Justificativa de saldo bancário negativo, quando necessária no saque, mantém o contrato de 3–500 caracteres; Caixa não pode ficar negativo. O formulário de transferência continua exigindo saldo suficiente.

O extrato Web/mobile oferece Estornar para transferência/saque nativo vigente, com confirmação das duas contas, intenção estável e compensação atômica no commit. As Rules/serviço verificam autoria ou administrador, saldo e claim único. Se a contrapartida já foi gasta, o estorno é recusado sem alterar saldos; depois de recompor o saldo, o mesmo comando pode ser reenviado. Originais resolvidos e pares especiais/importados permanecem sem ações genéricas. Não existe exclusão física de movimentos Spark.

`SparkStatementFirebase` enriquece nomes com uma leitura por contraparte distinta do período e reconfere a sessão/contexto. Os nomes são rótulos atuais do catálogo, não snapshots imutáveis da operação nem prova de titularidade. Saques Spark e seus estornos ficam fora dos totais econômicos em `shouldIncludeMovementInGainExpenseTotals`; o comportamento anterior do saque legado é preservado.

Validação: gate geral com estilos/tipos, 104 testes de ferramentas e 960 comuns aprovados (89 condicionais ignorados); dez novos cenários SDK Auth/Firestore/Rules, zero ignorados, incluindo relógio +1,5 s, retry, concorrência, histórico/checkpoint, estornos, saldo insuficiente e acesso revogado. Exports finais Web/Android aprovados; Android conserva o aviso conhecido de `web-streams-polyfill` com fallback. Navegador autenticado registrou transferência de R$ 50,00 e saque de R$ 20,00, estornou ambos e confirmou saldo R$ 100,00, ganhos R$ 100,00 e despesas zero no banco de teste. Evidências `.expo/spark-pairs-final-gate.log`, `spark-pairs-sdk-verified.log`, `spark-pairs-ui-final.log`, `spark-pairs-web-final.log`, `spark-pairs-android-final.log` e `spark-pairs-browser.png`. Nenhuma Rule foi alterada nesta entrega; a regressão de 1.037 cenários é evidência anterior reaproveitada, não nova execução integral.

F06 passa a 80% (P/I/D/E = 100/75/50/75). Assistente, pares importados e de investimentos nas telas, formatos antigos e homologação em aparelhos permanecem pendentes. Não houve dado real, migração, publicação ou cobrança.

Valores antes do arredondamento: F06=80%, financeiro=65,375%, eixo I financeiro=43,75%, integração=38,625%, geral=48,7875%. Financeiro continua exibindo 65%; geral passa a 49% e integração a 39%. Os demais eixos/módulos não aumentaram apenas pelos novos testes.

## Continuação de 21/10: mensal, ajustes e preparação

`SparkBalanceFormFirebase` conecta as duas telas de abertura mensal e o formulário compartilhado de ajuste Web/mobile aos serviços existentes. Contexto Spark é selecionado antes de consultas/escritores antigos; erro, ausência de contexto depois de preparar intenção ou acesso revogado não autorizam fallback. O papel é conferido no grupo protegido e as Rules/serviços continuam exigindo administrador para a conferência. As fachadas antigas recusam mutação/consulta genérica de ajustes Spark, em vez de chamar Functions ou apresentar uma lista antiga vazia.

A abertura mensal usa a identidade canônica banco/ciclo, o início do mês no calendário protegido e o ponteiro da abertura existente. O primeiro envio prepara o histórico; somente outro envio explícito com o mesmo banco/mês/valor confirma. Alterar o material exige reapresentar a preparação. O estado mostra preparação parcial e oferece continuar/pausar; cada chamada trabalha no máximo vinte páginas. As cotas e os limites anteriores permanecem. Pausar não confirma saldo. Se há abertura vencida, a preparação do formulário materializa primeiro a abertura previamente autorizada usando `refreshSparkMonthlyOpeningFirebase`, e só então prepara a nova contagem. A ativação não usa o valor ainda digitado como novo saldo.

`MonthlyBalanceFirebase` lê `sparkMonthlyOpenings` e preserva o ID da operação vigente. A gravação direta antiga é recusada no Spark: somente a ponte com revisão, prova completa e ponteiro esperado pode confirmar. Abertura futura registra o prazo e mantém o saldo atual; a passada/atual conserva movimentos posteriores à referência. Uma segunda confirmação com prévia concorrente fica desatualizada, sem sobrescrever o novo saldo.

O ajuste de hoje sem alvo de edição usa `countSparkAccountFirebase` com revisão esperada e commit do servidor. Retroativos usam o fim do dia civil protegido e uma projeção completa. Edição prepara a base sem o efeito do ajuste anterior e chama `replaceSparkBalanceAdjustmentFirebase`, mantendo o banco, o autor, a data original do inverso e a nova data do substituto. Na edição de hoje, a projeção usa o maior instante entre o início civil e o último commit certificado da posição, preservando nanossegundos e exigindo a mesma revisão; não depende de um relógio do navegador adiantado. Saldo negativo exige motivo de 3–500 caracteres. A interface conserva o rascunho quando a revisão muda e exige atualizar a prévia.

O extrato oferece editar/estornar somente para ajustes nativos vigentes do autor, sujeitos ao papel administrativo revalidado pelo serviço. O ID visual do componente não vira ID executável: o adaptador fornece `sparkAdjustmentOperationId` separado e marca originais resolvidos. Estorno usa claim único, conserva a data efetiva e não altera uma contagem posterior que já cobriu o ajuste. Mensais, referências, inversos e ajustes importados não recebem ações genéricas. Ajustes/estornos permanecem fora dos totais econômicos.

Resposta incerta conserva a intenção e o mesmo ID/material; mudar os argumentos é recusado. Falha ao atualizar as consultas depois do commit não é tratada como falha financeira. Troca de UID impede feedback/navegação da sessão anterior. O progresso no servidor é conservado, mas a interface mantém o identificador da preparação/intenção somente em memória: retomada automática após reload/desmontagem continua pendente. Não declarar ativação/consentimento/corte de contas reais, nem integração do assistente, como concluídos por esta entrega.

Evidências: `.expo/spark-balances-closed-check.log` (estilos/tipos, 104 testes de ferramentas e 966 comuns; 89 condicionais ignorados); `.expo/spark-balances-sdk-rules-ordered.log` (13 cenários Auth/Firestore/Rules, zero ignorados); exports finais em `.expo/spark-balances-web-final.log` e `spark-balances-android-final.log`, com resultado registrado no fechamento abaixo. Os cenários cobrem revisão concorrente, reenvio, mensal atual/futuro, preparação parcial/pausa/retomada, ativação vencida, edição/estorno retroativos e atuais, tipo de papel, revogação, motivo negativo e dia impossível. A edição de hoje com alvo negativo expôs esgotamento de 1.000 expressões; `validSparkOperation` agora seleciona `adjustment_replacement` logo depois dos contratos ordinários, com o mesmo papel, schema e validador. A justificativa é enviada somente quando o alvo ou saldo atual projetado fica negativo. Treze cenários dirigidos, 1.037 cenários Spark e cinco suítes anteriores de Rules passaram nesta continuação, em projetos de teste distintos da demonstração aberta. Logs de falha preservados em `.expo/spark-balances-sdk-closed.log`/`spark-balances-sdk-budget.log`; resultado corrigido em `.expo/spark-balances-sdk-rules-ordered.log` e regressão em `.expo/spark-balances-rules-regression.log`. A ferramenta de navegador bloqueou a aquisição da aba por política de segurança; esta continuação não possui ensaio visual novo nem aparelho instalado. Sem dados reais, cobrança, migração ou publicação.

F03 e F05 passam de I=25 a I=75, com P/D/E preservados em 100/25/75: cada módulo fica em 75%. Valores antes de arredondar: financeiro=68,375%, eixo I financeiro=53,75%, integração=45,625%, geral=50,2875%. Exibição: financeiro 68%, integração 46%, geral 50%. As demais notas e os 50 cartões/24 módulos mantêm a mesma fórmula; não são cobertura de testes ou previsão de tempo.

Fechamento de 21/10/2026: exports finais Web e Android aprovados em `.expo/spark-balances-web-final.log` e `.expo/spark-balances-android-final.log`, após a inclusão do motivo mensal. `.expo/spark-balances-ui-final.log` confirma estilos/tipos e ferramentas dessa fonte final; o gate geral com 966 comuns/104 ferramentas está em `.expo/spark-balances-closed-check.log`. Android mantém o aviso conhecido de fallback do `web-streams-polyfill`. Nenhum APK/AAB, aparelho, ensaio visual novo, deploy ou corte real foi realizado. A regressão nova de Rules terminou com 1.037 cenários Spark e cinco suítes anteriores aprovados; os 13 cenários novos dos formulários também passaram. O ambiente local foi preservado, com a demonstração sintética em 8082.

## Ordem de implementação revisada

| Ordem | Bloco concreto | Condição de saída |
|---|---|---|
| 1 | Intenção financeira compartilhada e seletores ativos; despesas/receitas, edição/estorno e fontes especiais | Mesma identidade/data/material no retry; leitores, formulários Web/mobile e executor usam referências Spark corretas, sem duas gravações de uma operação. |
| 2 | Bancos, abertura mensal, ajustes, pares e preparação histórica nas telas | Fluxos de prévia, progresso/pausa/retomada, prazo vencido e arquivamento têm serviço/Rules e entrada completa. |
| 3 | Recorrências/parcelas, previsão e lembretes locais | Pagamento/desfazimento atômicos; contador e resto exatos; calendário/agenda usam ciclos canônicos. |
| 4 | Investimentos/carteira e fechamento dos metadados/formatos importados | Avaliação composta, funding/principal, titularidade CDI e proveniência preservados em todas as entradas. |
| 5 | Convites/privacidade/exclusão e bootstrap/corte | Fluxos próprios protegidos, consentimentos e procedimento de inicialização/recuperação aptos a piloto. |
| 6 | Perfil Spark, custo/dependências, homologação e piloto | Nenhuma callable exigida pelo caminho Spark; Rules/índices/cliente publicados na ordem revisada, dispositivos e reversão comprovados. |

O assistente acompanha cada bloco financeiro; não deve ser deixado para receber todos os adaptadores somente no fim. A compatibilidade de dados também acompanha cada família, com o fechamento do inventário em D01–D03. Uma pendência impeditiva mantém a publicação bloqueada mesmo que a média aumente.

## Como manter este quadro

Após cada entrega Spark, revisar os eixos dos módulos afetados com código/evidência, recalcular blocos/geral/fases derivadas, atualizar os cartões nos documentos envolvidos e registrar pendências removidas/novas. Atualizar `revisado_em` e o Active Context de `Arquitetura.md`. Não subir notas por quantidade de arquivos ou testes; um protocolo isolado não conclui seu formulário. Preservar logs históricos e distinguir validação nova de evidência reaproveitada.


## Continuação de 21–22/10: operações financeiras e consumidores

Recorrências Web/mobile usam definição/configuração e ciclos canônicos: pagamento/recebimento e contador são atômicos; estorno compensa a efetivação e conserva histórico. Quitação negociada de despesas finitas registra `settlementMode:negotiated`, valor contratual exato da faixa e valor pago distinto, com motivo obrigatório. Sem essa modalidade, o contrato continua exigindo a soma original e o resto final. Receitas e planos ilimitados não recebem essa modalidade. Arquivadas próprias aparecem em seção de restauração; lembretes consomem somente planos ativos e o contador explícito. D0 (`reminderDaysBefore:0`) não vira D-1; a reconciliação roda após login e retorno ao primeiro plano.

Carteira e formulários de investimento selecionam Spark antes das fontes antigas. Abertura financia principal e mantém avaliação observada separada; principal/troca de banco, sincronização, aporte/resgate e arquivo/restauração usam serviços protegidos. A confirmação do saldo do investimento é revalidada dentro da transação do par. Estorno no extrato aceita transferência/aporte/resgate nativo ou importado com identidade resolvível, preserva ambas as contas e não aceita abertura/principal como par. Ordenação intradiária conserva timestamp e revisão para não perder aportes após uma avaliação no mesmo dia. CDI vem do autor da abertura imutável; catálogo editado por terceiro não muda titularidade. Capital/origem insuficientes exigem reconciliação.

A previsão 3/6/12 meses parte de banco+Caixa correntes, sem reaplicar o journal ou tratar patrimônio investido como caixa. Projeta recorrências/ciclos pendentes, contador explícito e resto exato; transferências e capital não viram receita/despesa. Médias históricas usam soma/divisão inteira para eliminar um centavo de erro perto do limite seguro. Contagens mensais futuras são sinalizadas, sem serem antecipadas como renda. A Home recupera projeção CDI somente com proveniência completa e volta a conferir as contas depois da simulação.

Configurações conecta arquivo/restauração/atividade dos bancos, preservando saldo e identidade. O mensal aceita valor digitado negativo, com motivo e nova conferência. `SparkActivationQueueFirebase` e aviso compartilhado na raiz descobrem aberturas vencidas ao entrar/retornar; cada continuação prepara até vinte páginas, permite pausa e recupera no servidor a prova privada da mesma cabeça após reload. Materializa somente contagem previamente autorizada, sem novo movimento econômico. Há novo índice composto para descoberta de provas por ator/conta/finalidade/cabeça/data. Não equivale a recuperação persistente de todas as intenções financeiras.

Recalibração: F01/F04 passam a I=75; F07 passa a I=75, mas P cai de 100 para 75 porque o inventário confirmou replanejamento de contratos ainda ausente. F08 passa a I=75; F11 passa a 100/75/25/75; N02 a 75/75/25/50. Valores sem arredondar: financeiro **75,875%**, integração **65%**, geral **55,0875%**; exibição **76% / 65% / 55%**. Não se aumentou E a 100 sem homologação.

Evidências finais: `.expo/spark-financial-final-check.log` (estilos/tipos, 104 ferramentas e 986 testes comuns; 89 condicionais ignorados), `.expo/spark-activation-sdk.log` (25 casos: 15 de saldos/fila e 10 de recorrências), `.expo/spark-investment-undo-sdk.log` (8 de investimentos) e `.expo/spark-financial-import-isolated.log` (18 de importação em emuladores próprios). Não somar cenários repetidos como requisitos novos. `.expo/spark-financial-closure-rules.log` contém 1.050 cenários Spark aprovados; a primeira continuação dos scripts anteriores não herdou as variáveis de ambiente e parou antes de executar Auth. Os cinco scripts anteriores foram executados novamente com o ambiente correto e aprovados em `.expo/spark-financial-closure-legacy.log`. Falhas de configuração anteriores foram preservadas; não foram classificadas como teste de integração aprovado. Exportações finais Web/Android em `.expo/spark-financial-{web,android}-closure.log`; resultado conferido no fechamento. Android conserva aviso conhecido de fallback de pacote. Fuso, auditoria e roteiro em [[Integração Financeira Spark]], [[Guia de Testes Locais]] e [[Auditoria de Design]]. Sem ensaio visual novo/aparelho, dado real, migração real, cobrança ou publicação.

## Fechamento de 22/10 após a correção das datas

O ensaio em Tóquio reproduziu início/fim de contrato avançando um dia no formulário, inclusive ultrapassando o último mês. `sparkRecurringFormRecord` agora devolve campos civis para os calendários/inputs, enquanto os ciclos canônicos conservam o instante real para efetivação/estorno. As listas Spark conferem o ciclo de São Paulo e resolvem o vencimento nesse calendário. Pagamento/aporte e consultas capturam cópias das datas antes das esperas; mutar um Date compartilhado não altera a intenção em andamento. Falha reproduzida em `.expo/spark-recurring-date-repro.log`; correção dirigida em `spark-recurring-date-fixed.log`.

Após esses ajustes, o gate integral foi repetido e aprovado em `.expo/spark-financial-last-check.log`: estilos/tipos, 104 testes de ferramentas e **989 comuns**, com 89 condicionais ignorados. `.expo/spark-financial-last-sdk.log` aprovou os **33 casos** de saldos/fila, recorrências e investimentos, zero ignorados, em fixtures próprias. Os **47 cenários** dirigidos passaram tanto em Tóquio como em Los Angeles (`spark-financial-last-tokyo.log` e `spark-financial-last-la.log`), sem contar a repetição como requisitos distintos. Exports finais da fonte corrigida foram aprovados em `spark-financial-web-last.log` e `spark-financial-android-last.log`; aviso Android de fallback mantido. Rules não mudaram após a regressão de 1.050 casos e os cinco scripts anteriores; as 18 importações isoladas também continuam identificadas pelo log próprio, sem serem reapresentadas como ensaio de produção.

Conferidos os cinquenta cartões, 24 módulos, pesos, fórmulas e referências: financeiro **76%**, integração **65%**, geral **55%**. O módulo completo ainda não está encerrado: replanejamento de contratos, edição composta/desfazimento de avaliação, recuperação persistente das demais intenções, integração do assistente e compatibilidade restante seguem explicitamente abertos. Sem nova homologação visual/aparelho, alteração de dados reais, cobrança, migração ou publicação. O ambiente sintético principal foi preservado em 8082.

### Evidência posterior: compilação de Rules sem avisos de tipo

A compilação local deixou de emitir os avisos de `null` versus string/map. Histórico recorrente mantém o fallback anterior para campo ausente/nulo, mas usa referência textual na validação. A cadeia histórica valida explicitamente a raiz antes de aceitar ponteiro nulo. Cotas passam mapa anterior e presença separadamente, obtidos de `resource`/`exists`, sem adicionar flag controlada pelo cliente nem permitir reiniciar uma cota existente. Limites, receitas e efeitos não foram afrouxados.

Depois da mudança, `.expo/spark-no-warning-rules.log` aprovou **1.050 cenários Spark e os cinco scripts anteriores de Rules na mesma cadeia**, com saída zero. `.expo/spark-no-warning-sdk.log` aprovou **33 cenários**; `spark-no-warning-import.log` aprovou **18** em emuladores próprios, com compilação sem aqueles avisos. Testes positivos de páginas, reservas e agregados continuam dentro do orçamento de expressões; recusas não são aceitas por esgotamento. A Home também conserva o saldo confirmado quando faltam taxas CDI do titular, mesmo se a consulta retornar sucesso com lista vazia ou somente taxa de outro membro.

O gate e os bundles foram repetidos após esse último ajuste da Home: `.expo/spark-financial-accepted-check.log` (**104 ferramentas, 989 comuns**, 89 condicionais ignorados) e `spark-financial-{web,android}-accepted.log` (ambos exportados, aviso conhecido de fallback Android). Os 47 cenários dirigidos passaram nos dois fusos em `spark-financial-accepted-{tokyo,la}.log`. “Accepted” nesses nomes identifica somente a verificação local, sem aprovação de release. Sem dado real, publicação ou nova homologação visual/aparelho; percentuais e pendências anteriores permanecem.

## Fechamento dos contratos e avaliações v17 — 22/10/2026

As entradas nativas Web/mobile agora incluem renegociação com sucessor/configuração atômicos, desfazimento ordenado e liquidação de parcelas vencidas; principal/financiamento com avaliação no mesmo commit e desfazimento da avaliação vigente. O último requer ID/revisão apresentados, motivo, prova exclusiva, referência corrigida e claim. Não apaga observação, principal, banco ou movimentos posteriores. Recuperação do acordo confirmado por seus vínculos não equivale a journal persistente de todos os rascunhos.

A regressão encontrou e corrigiu dois problemas adicionais: conferências legítimas excediam o orçamento de expressões após os novos ramos; e um resgate sem data declarada, posterior por revisão mas no mesmo instante de uma referência, podia desaparecer da prova histórica. Despacho temporal foi antecipado sem remover invariantes. A projeção desempata esses commits pela revisão; os datados explicitamente conservam cobertura. Segmentos sobre essa fronteira são conferidos nó a nó. O caso foi reproduzido deterministicamente; outro ensaio de referência estritamente posterior passou a garantir essa ordem no relógio do servidor, sem depender de dois commits terem instantes diferentes.

Evidência final, da fonte vigente:

- `.expo/spark-v17-regression-closed.log`: **1.120 cenários Spark**, zero falhas/ignorados, seguidos dos cinco scripts anteriores de Rules na mesma cadeia com saída zero.
- `.expo/spark-v17-sdk-closed.log`: **40 cenários** autenticados de saldos/fila, recorrências e investimentos, zero falhas/ignorados; `.expo/spark-v17-import-closed.log`: **18 de importação** em emuladores isolados, com compilação sem avisos de tipos.
- `.expo/spark-v17-check-closed.log`: estilos, tipos do app/backend/ferramentas, **104 testes de ferramentas e 992 comuns** aprovados; 89 condicionais ignorados não contam como aceitação.
- `.expo/spark-v17-tokyo.log` e `spark-v17-la.log`: os mesmos **57 cenários** aprovados em cada fuso; não somar repetições como requisitos novos.
- `.expo/spark-v17-web-closed.log` e `spark-v17-android-closed.log`: exportações concluídas. Android mantém aviso conhecido de fallback de `web-streams-polyfill`; export não equivale a APK/AAB instalado.

Falhas anteriores permanecem nos logs `spark-financial-v17-rules`, `spark-financial-v17-rules-final` e `spark-financial-v17-sdk-final`; não são evidência aprovada. Nos scripts anteriores, algumas recusas de payloads legados continuam atingindo o limite de expressões: a saída zero desses scripts não certifica a regra de negócio dessas recusas. Os controles Spark usam a recusa explícita sem aceitar esgotamento como prova, além dos casos positivos.

Conferidos **50 cartões e 24 módulos**: financeiro sem arredondar **77,875%**, geral **56,0875%**, exibidos **78% / 56%**; serviços nativos P=100 e integração=65. E permanece no máximo 75. O financeiro completo **não está em 100%**: faltam recuperação persistente, compatibilidade de dados/capital antigos, consumidores do assistente e matriz de aceitação Web/aparelhos. Referências anteriores à avaliação vigente não possuem estorno genérico. Publicação, corte real, privacidade e release seguem seus bloqueios próprios. Sem alteração de dados reais, ativação, cobrança ou deploy; sem nova inspeção visual por bloqueio de política do navegador e sem aparelho.

## Recuperação protegida de envios — fechamento de 22/10/2026

[[Recuperação de Operações Spark]] registra identificação privada antes do envio, liga a confirmação ao recibo e permite cancelar um envio pendente de forma atômica. Um ID cancelado não volta a confirmar; recibo ausente isoladamente não libera outro envio. Outra sessão/reload confere o resultado no aviso Web/mobile; a sessão ininterrupta conserva somente a confirmação em memória. Campos financeiros, provas, conversa e grants não são persistidos pelo journal. Fases descritivas canceladas preservam principal/contrato já confirmados na mesma sessão.

A carteira atual também mantém referências e movimentos protegidos quando o relógio cliente está atrasado. A sincronização de hoje usa ao menos a referência confirmada do mesmo dia, conservando nanossegundos; uma escolha retroativa mantém sua data. O caso de precisão foi reproduzido no teste unitário e no SDK. Isso não altera os efeitos/calendários declarados nem relaxa Rules.

| Verificação desta continuação | Resultado / evidência |
|---|---|
| Rules Spark e cinco scripts anteriores | **1.147 Spark**, zero falhas/ignorados; cadeia completa exit 0 em `.expo/spark-recovery-closed-rules.log`. |
| Formulários com SDK/Auth/Firestore reais locais | **51**, zero falhas/ignorados em `.expo/spark-recovery-verified-sdk.log`: saldos, investimentos, pares e recorrências, sem Functions. |
| Snapshot, restauração e importação isolados | **22**, zero falhas/ignorados, runner exit 0 em `.expo/spark-recovery-verified-restore.log`. O bruto/restaurado inclui índice, tombstone cancelado e cota de admissão com timestamps preservados. |
| Gate completo | Estilos, tipos app/backend/ferramentas, **104 ferramentas e 999 testes comuns**, 89 condicionais ignorados; `.expo/spark-recovery-final-check.log`. |
| Fusos | Os mesmos **32** testes em Tóquio e Los Angeles; `.expo/spark-recovery-{tokyo,la}.log`. Não somar repetições como entregas adicionais. |
| Exportações | Web e Android completos em `.expo/spark-recovery-final-{web,android}.log`. Aviso Android conhecido de `web-streams-polyfill` continua com fallback concluído. Export não equivale a APK/AAB, aparelho ou homologação visual. |
| Plano e módulos | **51 cartões / 24 módulos**, pesos e fórmulas conferidos; `.expo/spark-recovery-docs.log`. Mantidos financeiro **78%**, integração **65%** e geral **56%**. |

As falhas intermediárias ficaram preservadas nos outros logs `.expo/spark-recovery-*`: disputas na reserva, variantes que reutilizavam ID cancelado e casos de relógio/precisão foram corrigidos. Uma execução do SDK também falhou na preparação de autenticação com `auth/user-token-expired`; a repetição final isolada passou 51/51. Os testes de domínio agora retiram somente tombstones cancelados de sua fixture Admin após a recusa, conservando recibos/saldos e permitindo conferir as invariantes financeiras independentemente. Os testes de recuperação não usam essa limpeza e exercitam a barreira completa. Clientes não recebem permissão de remover tombstones.

Os cinco scripts anteriores ainda incluem recusas de payloads legados por limite de expressões. Saída zero desses scripts não comprova a invariante específica desses controles. Os controles Spark continuam recusando esgotamento como justificativa de um teste de segurança. Auditoria limitada atualizada em `Auditoria Spark Local.json`, nota 4 e pendências explícitas.

Continuam pendentes: restauração integral de argumentos/provas/fases após reload, compatibilidade/capital de dados antigos, executor completo do assistente, privacidade/ativação/release e aceitação Web/aparelhos. Não houve nova inspeção visual autenticada por bloqueio de política do navegador nem ensaio em aparelho; nenhum dado real, corte, cobrança ou publicação alterado.
