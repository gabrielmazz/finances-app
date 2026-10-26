---
tags: [spark, produto, navegacao, validacao]
relacionado: [[Visibilidade de Rotas]], [[Configurações]], [[Guia de Testes Locais]], [[Status da Implementação Spark]], [[Plano de Funcionalidade Completa sem Blaze]]
status: em desenvolvimento
tipo: decisão
versao: 1.0.0
---

# Versão Usável por Telas

Direção do proprietário em 23/10/2026: preservar a conversão Spark e concluir fluxos utilizáveis, uma tela por vez. O ponto de partida mantém todas as telas de produto desativadas. Login, Configurações, Configurações das telas e Sair continuam acessíveis para não bloquear a liberação.

## Como funciona

Em Configurações → Configurações das telas, habilite o próximo fluxo pelo switch local. Formulários de cadastro/edição e respectivas listas continuam compartilhando a mesma chave quando já funcionavam assim. Dashboard, extrato, análise, previsão, ajuste e perfil passam a ter controle próprio. **Desativar todas as telas** fecha novamente todos os acessos de produto, sem apagar dados ou preferências de pós-submit.

As escolhas desta etapa são persistidas por aparelho/navegador numa nova chave versionada. Preferências anteriores de visibilidade ficam intactas e não reabrem telas automaticamente. Uma tela habilitada continua assim após reload; não existe reset a cada login. Isso não altera o plano Firebase, Rules, dados, protocolos ou estado de migração dos grupos. Habilitar uma tela não comprova que ela esteja homologada, nem ativa um grupo Spark real.

## Ordem de execução e aceite

Atualização de 23/10: iniciado o primeiro fluxo. Cadastro Spark permite saldo inicial zero, positivo ou negativo justificado; edição preserva saldo. Contexto é conferido antes de liberar o formulário e falhas oferecem retry. As escolhas de visibilidade feitas pelo usuário são preservadas. Após os primeiros testes informados pelo usuário, o trabalho segue em ganhos/despesas; categorias permanecem na base em validação.

| Ordem | Tela/fluxo | Aceite antes de manter habilitado | Situação desta etapa |
|---|---|---|---|
| 0 | Login e central de configurações | Entrar/sair, chegar à central com todas as telas desativadas, liberar uma e preservar a escolha no reload | Base de navegação implementada; aceite visual pendente |
| 1 | Bancos e saldo inicial | Criar/editar banco, conferir abertura em centavos, recarregar sem duplicar cadastro ou saldo | Saldo declarado conectado em Web/mobile; testes locais aprovados; aceite visual/Emulator desta revisão pendente |
| 2 | Categorias | Criar/editar, conferir disponibilidade e impedir exclusão de categoria referenciada | Em validação: carregamento canônico, recarga pós-edição e retry Web/mobile; preferência local preservada |
| 3 | Registrar ganho | Creditar banco/Caixa uma vez, rejeitar duplicação, recarregar e conferir extrato | Em validação: contexto e carregamento canônico com retry Web/mobile; preferências locais preservadas |
| 4 | Registrar despesa | Debitar corretamente, validar saldo e conferir correção/estorno sem apagar histórico | Em validação: erro bloqueia envio e permite retry Web/mobile; regressão de comandos e projeções |
| 5 | Extrato e dashboard | Conferir saldos/totais com os lançamentos anteriores, filtros, reload e privacidade | Em validação Web/mobile: respostas obsoletas descartadas, totais de estorno conciliados, recarga/retry e liberação automática; aceite visual/Emulator pendente |
| 6a | Transferência | Conferir ambas as contas, estorno e ausência de dupla contagem | Em validação Web/mobile: carregamento/retry, atualização após sucesso e confirmação de envio incerto; liberação automática |
| 6b | Saque para Caixa | Conferir débito bancário, crédito no Caixa e estorno sem dupla contagem | Em validação Web/mobile: contexto/Caixa/saldo com retry, recarga após sucesso, justificativa e confirmação incerta; liberação automática |
| 6c | Ajuste de saldo bancário | Conferir referência temporal, diferença e estorno | Em validação Web/mobile: prévia atualizável, preparação isolada por seleção, rascunho preservado e confirmação incerta bloqueada; liberação automática |
| 7a | Despesas recorrentes | Cadastrar, editar, efetivar/desfazer ciclo e conferir saldo/agenda | Em validação Web/mobile: entrada/retry, categorias autorizadas, recarga da lista e confirmação incerta; liberação automática |
| 7b | Ganhos recorrentes | Cadastrar, editar, efetivar/desfazer ciclo e conferir saldo/agenda | Em validação Web/mobile: entrada/retry, categorias autorizadas, recarga, confirmação incerta e nominal exato; liberação automática |
| 8 | Investimentos | Criar, aportar/resgatar, sincronizar e conferir principal, saldo e banco | Em validação Web/mobile: saldo canônico, retry, recarga e confirmação pendente preservada; liberação automática |
| 9a | Análise por categoria | Conciliar totais, estornos, filtros, atualização e privacidade/PDF | Em validação Web/mobile: snapshot por sessão/período, retry e atualização explícita; liberação automática |
| 9b | Previsão financeira | Conciliar projeção com dados confirmados e distinguir previsão | Em validação Web/mobile: cenário por sessão/horizonte, recarga/retry e seletor acessível em erro; liberação automática |
| 10a | Perfil do usuário | Ler, editar nome, atualizar sem perder rascunho, conferir conflito e sessão | Em validação Web/mobile: leitura de servidor, comparação transacional, recarga/retry e cópia protegida; liberação automática |
| 10b | Vínculos | Conferir convite, aceite/revogação, sessão e limites Spark | Em validação Web/mobile: SDK/Rules, listas/retry, revisão, recibo/cota e confirmação incerta; liberação automática |
| 10c | Anotações | Ler, editar, excluir e preservar escopo local | Próxima tela; desativada |
| 10d | Assistente | Validar dependências, permissões e limites Spark | Desativado |

Primeiro marco utilizável: banco, saldo inicial, categorias, receita, despesa, extrato e dashboard funcionando juntos. O restante é liberado depois, preservando integralmente a implementação existente. Não ampliar o marco para concluir módulos secundários antes de aceitar esse percurso.

## Arquivos principais

- `contexts/RouteVisibilityContext.tsx`: defaults fechados, persistência e desativação em lote.
- `utils/navigation.ts` e `utils/appRouteGuards.ts`: registro, resolução das abas e proteção das rotas.
- `screens/mobile/ScreenSettingsScreen.tsx` e `screens/web/ScreenSettingsScreen.web.tsx`: liberação por tela.
- Containers Home, navigators Web/mobile e Configurações: respeitam o mesmo estado local.

## Integrações

[[Guia de Testes Locais]] fornece o cenário sintético Spark. [[Status da Implementação Spark]] continua sendo o quadro técnico completo; esta decisão não redefine percentuais nem remove pendências.

## Configuração

Chave AsyncStorage: `@finances/route-visibility:screen-validation-v1`. Default falso para todas as 19 chaves. A chave anterior `@finances/route-visibility` fica preservada. Configurações são locais e independentes por aparelho; não existe Remote Config ou bloqueio remoto novo.

## Observações importantes

Ocultar é controle de navegação e apresentação, não uma regra de autorização do Firestore nem desligamento de lembretes já configurados. Não limpar o armazenamento, reseedar dados reais, restaurar commits antigos ou reativar escritores legados para fazer uma tela funcionar. Antes de qualquer piloto real, cumprir os requisitos de compatibilidade, ativação e release já documentados.

## Verificação desta entrega — 23/10/2026

- Arquitetura de estilos aprovada, sem nova dívida visual.
- Typecheck do aplicativo aprovado após ampliar as chaves e corrigir a distinção entre visibilidade e pós-submit no assistente.
- Seis suítes focadas, **49 testes aprovados**: defaults, persistência/reload e preservação da preferência anterior, desativação em lote, armazenamento inválido, Home/configurações, guard das rotas Web/Android, navegação, pós-submit e comandos locais do assistente. No host Windows/UNC, o resolver padrão de Jest não encontrou módulos existentes; execução usou adaptação somente no processo para caminhos TypeScript, sem alterar a configuração versionada.
- Diff-check aprovado nos arquivos da entrega. Sem nova execução de emuladores financeiros, export/build, aceite visual autenticado ou aparelho instalado; nenhum deploy ou corte de dados reais.

## Verificação do primeiro fluxo — 23/10/2026

- Tipagem do aplicativo e arquitetura de estilos aprovadas.
- **55 testes focados distintos aprovados** em oito suítes: SparkBankForm (13), hook bancário (3), saldo mensal (6), visibilidade/hidratação (5 + 3), metadados/categorias (6), modelo financeiro de leitura (17) e campos de saldo inicial (2). Os ensaios repetidos entre execuções não foram somados.
- Cobertura nova: abertura positiva/zero/negativa, justificativa e limites, edição sem alterar dinheiro, captura antes da espera, ID/valor preservados no retry, contexto/papel/sessão, falha de refresh após commit e interação dos campos monetários. A projeção existente confirma que abertura não é receita.
- Jest executado com adaptação de resolução somente no processo por causa do caminho Windows/UNC, sem mudar configuração do projeto.
- Nenhum Auth/Firestore/servidor Web estava acessível nas portas locais verificadas; sem nova execução de Emulator, build/export ou aceite visual autenticado/aparelho. Não houve deploy, corte ou escrita em dados reais. Próximo fluxo: categorias, após testar este primeiro percurso.

## Continuação de categorias e espaçamento — 23/10/2026

- Ajustado o preenchimento horizontal das tabelas de bancos/categorias Web/mobile, layout fixo Web, alinhamento do cabeçalho e espaço dos três botões bancários. Rolagem estreita preservada.
- Edição de categoria usa leitura confirmada pelo servidor; mantém bloqueio durante carga/recarga, erro com retry, proteção de proprietário/sessão e descarte de respostas antigas. Permanecer na tela após editar não reutiliza mais a confirmação anterior.
- Tipagem do aplicativo e arquitetura de estilos aprovadas. **42 testes aprovados em cinco suítes**: categoryFormRecord (6), sparkMetadataAdapters (8), categoryAvailability, categoryReferenceSummary e sparkBankForm (13). Seis testes novos do hook e dois da leitura canônica; sem somar execuções anteriores.
- Sem deploy, escrita em dados reais, alteração de visibilidade ou nova homologação visual/Emulator/aparelho. Primeiro fluxo permanece em aceite; próximo passo após categorias: ganho/despesa e conferência do extrato.

## Continuação de ganhos/despesas — 23/10/2026

- As quatro telas preparam o contexto antes do cadastro e carregam a referência antes de editar. Carregamento/erro bloqueiam campos e envio; falhas persistem com retry. Leitura Spark com erro não autoriza fallback legado. UID e respostas de outras rotas/fontes são conferidos.
- **58 testes aprovados em cinco suítes**: movementFormEntry (7), sparkMovementFormHook (4), sparkMovementForm, sparkMovementCommand e sparkFinancialReadModel. Cobrem inicialização, sessão, retry, fonte, transporte, ID/data/material de reenvio, correção/estorno e projeção sem dupla contagem. Não somar com execuções anteriores como requisitos novos.
- Estilos aprovados; tipagem do aplicativo aprovada. Sem novo teste Emulator: portas locais Auth/Firestore/Web verificadas indisponíveis. Sem deploy, alteração de preferências ou escrita em dados reais. Aceite visual/aparelho e integração financeira continuam pendentes.

### Próximo roteiro manual

1. Use um banco de teste com saldo inicial de R$ 1.000,00 e categorias compatíveis com ganho/despesa.
2. Registre ganho de R$ 200,00 e despesa de R$ 50,00 nesse banco. O saldo esperado é R$ 1.150,00; abertura não entra no total de ganhos.
3. Edite a despesa para R$ 70,00 pelo extrato habilitado. Saldo esperado: R$ 1.130,00, mantendo original, inverso e substituto no histórico.
4. Recarregue e confira saldo/extrato. Se um envio ficar incerto, reenvie os mesmos dados; não deve haver efeito duplicado.
5. Desligue a conexão antes de abrir uma edição, confira o bloqueio e tente novamente após restabelecê-la. Não salvar edição vazia.

Os valores são um roteiro sintético, não evidência de execução em dados reais. Próximo foco: conciliar extrato/dashboard nesse percurso.

## Liberação automática por avanço — orientação do usuário em 23/10/2026

A cada avanço, habilitar as telas alteradas para teste sem pedir nova confirmação. Registrar a revisão e as chaves em SCREEN_VALIDATION_RELEASES no RouteVisibilityContext. A revisão é aplicada uma vez por aparelho ao carregar as preferências; sobrepõe false apenas das telas trabalhadas, preserva as demais escolhas e permite desabilitar novamente depois. Nesta revisão são liberadas addRegisterGain e addRegisterExpenses. Uma entrega futura que mexa novamente nessas telas deve registrar outra revisão.

Os defaults de telas ainda não trabalhadas permanecem falsos. O botão de desativar todas continua funcionando. Não reiniciar a chave geral, apagar preferências ou habilitar todos os módulos. A liberação dá acesso para testar e não comprova homologação ou ativa grupos financeiros.

## Continuação de extrato e dashboard — 23/10/2026

- Revisão local `statement-dashboard-2026-10-23` habilita **Extrato** e **Dashboard** ao recarregar, preservando as demais escolhas e desativações posteriores.
- Extrato Web/mobile descarta respostas de banco, Caixa, período, UID ou foco antigos. Recarga limpa valores anteriores e expansões; erros permitem tentar novamente. Saldo corrente não confirmado falha explicitamente; PDF não exporta falha como total zero.
- Correção de despesa não vira ganho: família econômica/sinal acompanham os componentes até resumo, filtros, gráfico Web e PDF. Timeline conserva original, inverso identificado e substituto. Gráfico Spark considera dia civil de São Paulo.
- Home Web/mobile oferece atualização por botão; erros independentes continuam visíveis. Totais mensais Web indisponíveis deixam de aparecer como zero, e ausência de sessão não publica snapshot residual.
- **Validação final: 74 testes focados distintos aprovados em oito suítes**, tipagem do aplicativo, arquitetura de estilos e diff-check aprovados. Suítes: bankMovementsRequest, bankMovementTotals, bankMovementsSpark, homeSpark, homeScreenDataFreshness, screenValidation, routeVisibility e sparkFinancialReadModel. A contagem não soma repetições. O teste de upgrade foi repetido após restaurar a implementação do mock de armazenamento a cada caso; a falha de isolamento não exigiu mudança na persistência de produção. Jest usou resolução adaptada somente no processo para UNC, sem alterar a configuração versionada. As portas locais 8081/8082/19006/5000/8080/9099 estavam indisponíveis; sem novo aceite visual autenticado, Emulator, export/build ou aparelho. Sem deploy ou escrita em dados reais. Percentuais mantidos.

Roteiro: recarregue para liberar as duas telas; no banco de teste, confira R$ 1.150 após ganho de R$ 200 e despesa de R$ 50 sobre abertura de R$ 1.000. Edite a despesa para R$ 70 e confira **R$ 1.130 / ganhos R$ 200 / despesas R$ 70** no extrato e dashboard. No filtro de gastos, original/inverso/substituto devem continuar presentes e somar R$ 70. Troque banco e período durante carregamento e confira que uma resposta antiga não reaparece. Teste retry sem conexão, máscara de valores e PDF. Esses passos são aceite manual pendente, não evidência de execução em dados reais.

## Próxima tela: transferência — 23/10/2026

- Habilitação local uma vez da chave `transferScreen` pela revisão `transfer-2026-10-23`.
- Bancos e saldos com confirmação, nova tentativa e proteção contra resposta antiga de seleção/UID. Sem dois bancos ativos, a tela informa o requisito. Banco indisponível bloqueia novos envios.
- Permanecer na tela após sucesso atualiza as duas posições, conservando ou limpando campos conforme a preferência existente. Falha de recarga não repete o par financeiro.
- Resultado incerto bloqueia campos e mantém **Confirmar envio anterior**, reutilizando os argumentos/ID do serviço mesmo se o saldo já foi debitado. Sucesso/erro/retorno tardios não atingem outra sessão.
- **49 testes focados distintos aprovados em seis suítes**: transferFormData (9), transferScreens (6), sparkPairForm (9), screenValidation (10), bankMovementTotals (4), bankMovementsSpark (11). Tipagem do aplicativo, estilos e diff-check aprovados. As duas interfaces foram exercitadas por renderização com apresentação/serviços simulados; testes financeiros não usaram Firebase real. A suíte de leitura foi repetida após ajustar o cenário de troca de sessão para distinguir a consulta legítima do novo UID da resposta antiga descartada. Sem somar repetições. Jest manteve a adaptação de resolução somente no processo para UNC. A porta local 8081 respondeu à sondagem, mas o navegador disponível não abriu localhost (ERR_CONNECTION_RESET); sem aceite visual autenticado, Emulator, export/build ou aparelho nesta revisão. Sem deploy ou escrita real. F06/percentuais mantidos.

Roteiro manual: banco A com R$ 1.000 e B com R$ 200; transfira R$ 150 de A para B. Esperado A **R$ 850**, B **R$ 350**, total conjunto **R$ 1.200**, sem alterar ganhos/despesas. Ao permanecer com campos, conferir os novos saldos. No extrato, conferir as duas pernas e estornar pelo fluxo existente; os saldos devem voltar a R$ 1.000/R$ 200. Sem conexão ao carregar, o envio novo deve ficar bloqueado com retry; após resposta de envio incerta, os campos devem permanecer bloqueados e a confirmação repetir a mesma operação. Esses passos são aceite pendente, não execução comprovada em dados reais. Próxima tela do roteiro: saque para Caixa.

## Próxima tela: saque para Caixa — 23/10/2026

- Revisão local `withdrawal-2026-10-23` habilita `addRescue` uma vez ao recarregar, preservando outras escolhas e desligamentos posteriores.
- Leitura compartilhada confirma contexto, Caixa canônico ativo e saldo bancário; falhas persistentes têm retry, sem zero inventado ou fallback por erro. UID, banco e recarga invalidam respostas antigas.
- Sucesso atualiza catálogo/Caixa/saldo de origem sem repetir a operação e respeita a preferência de pós-submit. Envio incerto bloqueia todos os argumentos e permite confirmar o mesmo saque após débito/falha de leitura. Banco negativo exige justificativa Spark de 3 a 500 caracteres.

**Validação desta revisão:** 57 testes focados distintos aprovados em seis suítes: rescueFormData (12), rescueScreens (10), sparkPairForm (9), screenValidation (11), bankMovementsSpark (11) e bankMovementTotals (4). Dez cenários renderizam as interfaces Web/mobile com apresentação e serviços simulados; não são transações reais. Tipagem do aplicativo, arquitetura de estilos e diff-check aprovados. Jest usou a adaptação de resolução somente no processo para Windows/UNC, sem alterar a configuração versionada. Sem novo aceite visual autenticado, Emulator, export/build ou aparelho; acesso visual local permanece indisponível no ambiente observado. Sem deploy ou escrita em dados reais. F06/percentuais mantidos.

Roteiro manual pendente: banco com R$ 1.000 e Caixa com R$ 100; saque R$ 150. Esperado banco **R$ 850**, Caixa **R$ 250**, total **R$ 1.100**, sem alterar ganhos/despesas Spark. Ao permanecer com campos, conferir o novo saldo. No extrato, conferir ambas as pernas e estornar pelo fluxo existente: banco/Caixa voltam a R$ 1.000/R$ 100 se a contrapartida não foi gasta. Testar banco negativo com justificativa, Caixa indisponível, falha/retry e confirmação incerta sem editar argumentos. Isso é roteiro sintético, não evidência de execução em dados reais. Próxima tela: ajuste de saldo bancário.

## Próxima tela: ajuste de saldo bancário — 23/10/2026

- Liberação local `balance-adjustment-2026-10-23` habilita `bankBalanceAdjustment` uma vez ao recarregar, preservando demais escolhas e desligamentos posteriores.
- Abertura e prévia usam UID/rota/banco/data/recarga; respostas antigas não alteram a seleção atual. Banco indisponível e edição sem original não abrem um ajuste novo. Erros persistentes oferecem nova tentativa, e catálogo vazio tem orientação.
- Atualizar uma prévia pronta busca outra revisão sem apagar o rascunho; preparação parcial continua com o mesmo estado. Resultado incerto bloqueia todos os argumentos e conserva fonte/ID/material para confirmação, mesmo com leitura indisponível. Justificativa negativa e limite monetário Spark são validados.
- Sucesso invalida o cache e retorna ao extrato; falha de cache não vira outro ajuste. Confirmação fica visível com acesso ao extrato se a navegação ainda não ocorreu. Privacidade e retorno condicionado ao foco permanecem.

**Validação desta revisão:** 71 testes focados distintos aprovados em sete suítes: bankBalanceAdjustmentForm (17), bankBalanceAdjustmentScreens (10), balanceAdjustmentBanks (5), screenValidation (12), bankBalanceAdjustment (12), bankMovementTotals (4) e bankMovementsSpark (11). Dez cenários renderizam as composições Web/mobile e o formulário compartilhado com apresentação/serviços simulados; não são gravações reais. A suíte visual foi repetida após corrigir o seletor de botões para a API disponível da biblioteca de testes e o texto com reticências; a suíte do hook foi repetida após reforçar a liberação da trava ao trocar de sessão. Repetições não foram somadas. Tipagem do aplicativo, arquitetura de estilos e diff-check aprovados. Jest manteve a adaptação somente no processo para caminhos Windows/UNC, sem alterar configuração versionada. Sem novo aceite visual autenticado, Emulator, export/build ou aparelho, deploy ou escrita em dados reais nesta revisão. F05/percentuais mantidos.

Roteiro manual pendente: banco de teste com R$ 1.000; informe R$ 950 na data de hoje e confira **diferença −R$ 50 / saldo R$ 950**, sem alterar ganhos/despesas. Edite o ajuste para R$ 980, confira original/inverso/substituto e saldo R$ 980; estorne o ajuste vigente e confira R$ 1.000. Em data passada, informe o saldo no final daquele dia e confira a preservação dos movimentos posteriores. Simule nova movimentação após a prévia: a revisão anterior deve ser recusada, preservando o rascunho para nova conferência. Teste preparação parcial/pausa/continuação, retry, banco negativo, privacidade e confirmação incerta sem editar campos. É roteiro sintético, não execução comprovada em dados reais. Próxima tela: despesas recorrentes.

## Próxima tela: despesas recorrentes — 23/10/2026

- Revisão `recurring-expenses-2026-10-23` libera uma vez `addMandatoryExpenses`, chave compartilhada pelo cadastro e pela lista Web/mobile. Não libera receitas recorrentes nem reabre escolhas anteriores.
- Contexto e edição aguardam confirmação, com erro persistente e retry. Categoria autorizada de outro membro do grupo permanece disponível; falha de carga bloqueia novo envio. Materiais incertos ficam bloqueados, conservando a definição e os receipts de metadados.
- Recarga da lista descarta respostas antigas por UID/foco/geração, oculta resumo indisponível e bloqueia PDF. Atualização explícita nas duas plataformas; falha de agenda é independente dos dados financeiros. Arquivar/desfazer mantém a confirmação incerta e protege contra dois cliques simultâneos.

**Validação desta revisão:** 65 testes focados distintos aprovados em nove suítes: sparkRecurringFormHook, sparkRecurringFormCommand, mandatoryExpenseScreens, screenValidation, mandatoryInstallments, sparkRecurringFormDates, sparkRecurringReminderBridge, movementFormEntry e bankMovementsRequest. Doze cenários exercitam cadastro/lista Web/mobile com apresentação, calendário, gráficos, PDF e serviços simulados; não são operações em dados reais nem homologação visual. A primeira liberação foi corrigida para a chave existente compartilhada pelo cadastro/lista; o teste foi repetido sem somar os casos anteriores. A suíte de interfaces exigiu simulações explícitas dos adaptadores nativos de PDF e gráficos DOM do Expo para executar no Jest CommonJS/Windows; houve aviso de render prop no Accordion simulado. Isso limita a evidência aos comportamentos verificados, sem aprovar os componentes visuais simulados. Tipagem do aplicativo, arquitetura de estilos e diff-check aprovados. Jest manteve a adaptação de resolução somente no processo para UNC, sem mudar configuração versionada. Sem nova execução de Emulator/Rules, export/build, inspeção visual autenticada ou aparelho nesta revisão. Sem deploy ou escrita em dados reais. F07/percentuais mantidos.

Roteiro manual pendente: crie um template de R$ 100 com categoria obrigatória. O saldo bancário deve permanecer igual antes do pagamento. Registre o ciclo pelo fluxo da lista escolhendo banco com R$ 1.000: esperado **saldo R$ 900 / despesa R$ 100 / ciclo pago**; tentar repetir não deve debitar outro R$ 100. Desfaça o pagamento: esperado saldo R$ 1.000 e ciclo pendente, preservando original/inverso no histórico. Edite nome/vencimento, confira a lista após recarga e teste categoria de outro membro autorizado. Para contrato de 1.000 centavos em três parcelas, conferir 333 + 333 + 334 e contador por pagamentos, sem avanço pelo tempo. Teste falha de edição/categoria/lista, confirmação incerta, arquivar/restaurar, privacidade e lembretes em aplicativo instalado. É roteiro sintético, não execução comprovada em dados reais. Próxima tela: receitas recorrentes.

## Próxima tela: receitas recorrentes - 23/10/2026

- Revisão `recurring-gains-2026-10-23` habilita uma vez `addMandatoryGains`, compartilhada pelo cadastro e lista Web/mobile. Outras preferências e desligamentos posteriores são preservados.
- Entrada confirma contexto/registro e oferece retry; categorias autorizadas do grupo permanecem disponíveis. Erro Spark não consulta legado. UID/rota/foco/geração descartam respostas antigas e travas impedem duplo envio. Contrato existente usa Renegociar para alterar total/quantidade/vigência.
- Campos incertos ficam bloqueados e a confirmação anterior continua disponível com os mesmos dados/IDs. Lista ganha atualização explícita nas duas plataformas, erro/retry, resumo/PDF indisponíveis após falha e aviso separado de agenda. Falha posterior não repete a confirmação financeira.
- Receitas finitas exigem soma nominal exata, incluindo resto final; não aceitam quitação negociada. Cadastro não credita banco. Receber/desfazer usa os comandos Spark já existentes, preservando histórico.

**Validação desta revisão:** 72 testes focados distintos aprovados em nove suítes: sparkRecurringFormHook (7), sparkRecurringFormCommand (9), mandatoryGainScreens (14), screenValidation (14), mandatoryInstallments, sparkRecurringFormDates, sparkRecurringReminderBridge, movementFormEntry e bankMovementsRequest. A contagem é 58 do núcleo/entrada/visibilidade mais 14 interfaces; não soma repetições. Os 14 cenários renderizam cadastro/lista Web/mobile com apresentação, calendário, gráficos, PDF e serviços simulados. A primeira execução das interfaces encontrou o título do Accordion simulado como View; o mock foi corrigido para Text e a suíte completa passou, sem mudança do componente de produto. Comandos cobrem cadastro sem crédito, último recebimento de 334 centavos, retry com o mesmo receipt, recusa de quitação negociada e desfazimento com referência/data originais. Não são transações reais nem homologação visual dos componentes simulados.

Tipagem do aplicativo, arquitetura de estilos e diff-check aprovados. Métricas de estilos preservadas. Jest manteve a adaptação de resolução somente no processo para Windows/UNC, sem alterar a configuração versionada. Sem nova execução Emulator/Rules, export/build, inspeção visual autenticada ou aparelho, deploy ou escrita real. Intenções ainda dependem da tela montada para conservar integralmente o material incerto. F07/percentuais mantidos.

Roteiro manual pendente: cadastre receita recorrente de R$ 100 com categoria obrigatória e banco de teste com R$ 1.000. Antes de receber, o saldo continua R$ 1.000. Registre o ciclo pela lista: esperado **saldo R$ 1.100 / ganho R$ 100 / ciclo recebido**; repetir não deve creditar novamente. Desfaça: saldo R$ 1.000 e ciclo pendente, com original/inverso preservados. Edite nome/dia, confira após recarga e use categoria autorizada de outro membro. Para contrato de 1.000 centavos em três parcelas, conferir **333 + 333 + 334**, sem desconto negociado nem avanço pelo tempo. Teste erro de edição/categoria/lista, resposta tardia de outro UID, confirmação incerta, arquivar/restaurar, privacidade/PDF e lembretes no aplicativo instalado. É roteiro sintético, não execução comprovada em dados reais. Próxima tela: investimentos.

## Próxima tela: investimentos - 23/10/2026

- Revisão `investments-2026-10-23` libera uma vez `addFinance`, compartilhada pelo cadastro e carteira Web/mobile. Desligamentos posteriores e demais preferências permanecem.
- Cadastro confirma o saldo canônico e bloqueia novo envio durante leitura/falha ou insuficiência. Atualiza a origem após sucesso. Material incerto fica bloqueado com **Confirmar investimento anterior**, independente do saldo já debitado.
- Carteira limpa leituras anteriores, descarta respostas antigas por UID/foco/geração e oferece atualização/retry. Histórico/taxas indisponíveis não produzem resumo zero. Edição, arquivo, sincronização, aporte/resgate preservam a mesma confirmação e a preparação parcial, bloqueiam chamadas simultâneas e verificam a sessão.
- Principal, posição e projeção CDI permanecem distintos; abertura/aporte/resgate não alteram ganhos/despesas. Não foi adicionado escritor financeiro nem dependência de Functions ao Spark. Recuperação integral após reload, dados importados, assistente e homologação continuam pendentes.

**Validação desta revisão:** 66 testes focados distintos aprovados em dez suítes: sparkInvestmentFormHook, transferFormData, sparkPartialRecoveryForms, sparkInvestmentSyncClock, sparkFinancialDateCapture, sparkInvestmentPortfolio, investmentPortfolio, screenValidation, bankMovementTotals e investmentScreens. São 52 casos de núcleo/leitura/visibilidade mais 14 interfaces; os seis do hook repetidos com as interfaces não foram somados novamente. Cobertura inclui centavos/posição/projeção, datas capturadas, recuperação parcial, trava simultânea, cache independente, UID, retry com o mesmo estado/material, criação com recarga, saldo indisponível e arquivamento incerto conservando confirmação.

Os 14 cenários de interfaces renderizam Web/mobile com apresentação, gráficos e serviços simulados, usando o cálculo real da carteira sobre fixtures. A primeira execução exigiu corrigir o fixture de atividade para `cashFlows/syncs`, conforme o contrato real; seletores das ações de card respeitam TouchableOpacity nativo e Pressable Web. Fixture do hook também passou a informar o percentual legado obrigatório além dos pontos-base. Repetições não aumentam a contagem e não representam transações reais. Jest usa adaptação de resolução somente no processo para Windows/UNC, sem mudar a configuração versionada. Arquitetura de estilos aprovada, métricas preservadas e diff-check aprovado. Tipagem final do aplicativo aprovada após corrigir o fixture do hook. Sem nova execução Emulator/Rules, export/build, inspeção visual autenticada/aparelho, deploy ou escrita real. F08/percentuais mantidos.

Roteiro manual pendente: use banco de teste com R$ 1.000 e crie CDB de R$ 300, com CDI e data válidos. Esperado **banco R$ 700 / principal R$ 300 / posição R$ 300**, sem receita/despesa. Confirme o mesmo envio incerto e confira que não há novo débito. Sincronize posição para R$ 310: banco continua R$ 700 e principal R$ 300. Antes de aportar/resgatar, confirme o valor na data solicitada. Aporte R$ 50: banco R$ 650 e posição R$ 360; resgate R$ 20: banco R$ 670 e posição R$ 340, sem transformar esses pares em ganho/despesa. Confira estorno do par no extrato, correção de principal/banco e desfazimento da avaliação vigente pelo fluxo próprio. Arquive/restaure preservando história, confira privacidade/projeção, saldo insuficiente, falha/retry, resposta tardia de outro UID e preparação parcial/continuação. São valores sintéticos e aceite pendente, não execução comprovada em dados reais. Próximas telas: análise por categoria e previsão financeira.

## Próxima tela: análise por categoria - 23/10/2026

- Revisão `category-analysis-2026-10-23` libera uma vez somente `categoryAnalysis`, preservando investimentos, previsão e demais escolhas.
- UID reativo e snapshot por consulta descartam respostas antigas de sessão/período/foco/geração. Exceção ou falha retornada limpa o relatório e encerra carregamento/refresh, com erro persistente e retry. Intervalo inválido permanece editável.
- **Atualizar análise** existe nas duas plataformas e no estado vazio. PDF exige relatório pronto, impede duplo clique e confere sessão/escopo antes da exportação e do feedback. Data do arquivo corresponde ao snapshot consultado; valores ocultos e movimentos negativos permanecem.
- Totais econômicos Spark mantêm original/inverso/substituto, sem converter estorno em ganho ou contar transferência, aporte, resgate e avaliação como receitas/despesas. Comparação usa dias equivalentes e meses completos; categorias autorizadas do grupo permanecem.

**Validação desta revisão:** 49 testes focados distintos aprovados em cinco suítes: categoryAnalysisData, categoryAnalysis, categoryAnalysisSpark, screenValidation e categoryAnalysisScreens. São 41 casos de leitura/cálculo/filtros/visibilidade e oito interfaces Web/mobile. Cobrem falha retornada/lançada, retry, UID real, consultas concorrentes, intervalos/paginação, estornos líquidos, mudança de categoria/conta/mês, exclusão de pares/referências, limites de centavos, liberação uma vez, atualização explícita, privacidade, PDF por tipo, callback de exportação anterior e duplo clique.

As interfaces usam o hook, os cálculos de apresentação e a geração real de HTML, com transporte, gráficos DOM/nativos, seletores e shell simulados. O mock inicial do gráfico precisou evitar a transformação NativeWind dentro da factory hoisted do Jest; o mock do shell passou a fornecer as classes de sheet usadas por cada plataforma. A suíte completa passou após esses ajustes de teste, sem substituir cálculos ou reduzir os casos. Repetições não foram somadas. Tipagem do aplicativo, arquitetura de estilos e diff-check aprovados; métricas de estilos preservadas. Jest usa adaptação de resolução somente no processo para Windows/UNC, sem alterar configuração versionada. Sem nova execução de Emulator/Rules, export/build, inspeção visual autenticada, impressão real ou aparelho. Sem deploy ou escrita em dados reais. F10/percentuais mantidos.

Roteiro manual pendente: escolha categoria de teste usada por despesa de R$ 100. Corrija para R$ 120: análise de gastos deve somar **R$ 120**, com original, inverso e substituto no histórico; ganhos continuam iguais. Mude categoria/conta na correção e confira a atribuição à nova categoria/conta. Desfaça um movimento do mês anterior e confira o valor negativo no mês atual, sem novo ganho; uma distribuição com conta negativa deve mostrar total líquido e lista explicativa. Alterne gastos/ganhos, selecione histórico de três, seis e doze meses e confira dias equivalentes, meses sem movimento e paginação. Atualize após outra movimentação, simule falha/retry, intervalo inválido e troca de UID durante consulta. Exporte os dois tipos, confira todos os movimentos do recorte e privacidade; duplo clique não deve abrir dois arquivos. É aceite sintético pendente, não execução em dados reais. Próxima tela: previsão financeira.

## Próxima tela: previsão financeira - 24/10/2026

- Revisão `financial-forecast-2026-10-24` libera uma vez somente `financialForecast`, preservando análise, investimentos e outras escolhas.
- Leitura compartilhada por foco/UID/horizonte com guard de geração/sessão real. Trocar 3/6/12 ou UID remove o cenário anterior; recarga limpa resumo/gráfico/detalhes. Falha retornada ou lançada encerra loading/refresh, conserva erro e permite retry.
- **Atualizar previsão** existe no Web/mobile, mantendo pull-to-refresh. O seletor de horizonte permanece acessível durante carga/erro; atualização confirmada reinicia expansão/lista de compromissos.
- A fonte Spark e os cálculos continuam somente leitura: abertura banco+Caixa, journal sem reaplicação, ciclos efetivados fora da projeção, parcelas com resto exato, vencidos remanescentes uma vez e liquidez sem resgate automático. Privacidade é preservada.

**Validação desta revisão:** 45 testes focados distintos aprovados em cinco suítes: financialForecastData, financialForecast, sparkFinancialForecast, screenValidation e financialForecastScreens. São 20 casos de leitura/cálculo, 17 de navegação/persistência e oito interfaces Web/mobile, sem somar repetições. Cobrem troca de horizonte/UID, logout, consultas concorrentes, limpeza em refresh, falhas retornadas/lançadas com retry, parcelas/resto/ciclos/vencidos, abertura canônica sem reaplicação do journal, liquidez informativa, privacidade e reset de compromissos.

Interfaces usam hook e calculador puro reais com dados sintéticos, transporte e gráfico/Accordion simulados. O cenário de liquidez foi corrigido para ter vencimento futuro de um mês; produto já disponível antes da consulta não é um marco futuro. Cenários antigos de visibilidade passaram a registrar a nova revisão como já aplicada quando exigem previsão desligada, isolando o aceite de cada entrega. A suíte completa passou após esses ajustes; não são operações em dados reais nem homologação dos componentes DOM/nativos simulados. Tipos dos argumentos dos spies de gráficos foram explicitados, inclusive no teste da análise anterior. Tipagem do aplicativo, arquitetura de estilos e diff-check aprovados, com métricas de estilos preservadas. Jest manteve a adaptação de resolução somente no processo para Windows/UNC, sem mudar configuração versionada. Sem nova execução Emulator/Rules, export/build, inspeção visual autenticada ou aparelho. Sem deploy ou escrita real. F11/percentuais mantidos.

Roteiro manual pendente: use banco de teste com R$ 1.000 e Caixa com R$ 100, sem outros fluxos variáveis. Abertura esperada **R$ 1.100**. Cadastre receita recorrente de R$ 200 e despesa de R$ 100, ambas pendentes em dia ainda futuro deste mês. Nos três meses iniciados pelo atual, esperado **R$ 1.200 / R$ 1.300 / R$ 1.400**. Abrir a previsão não deve gravar transações. Efetive os dois ciclos pelos fluxos próprios: banco R$ 1.100, Caixa R$ 100, abertura atual R$ 1.200. Atualize a previsão: o ciclo atual não deve acrescentar outros R$ 100; os dois meses seguintes continuam R$ 1.300/R$ 1.400. Investimento já financiado permanece fora de Caixa, e sua disponibilidade não cria resgate. Confira parcelas de 1.000 centavos como 333+333+334 e saldo vencido uma vez no primeiro mês. Alterne 3/6/12 durante consulta, mude UID, teste falha/retry e modo privado. Expanda compromissos e recarregue para conferir o reset. É cenário sintético e aceite pendente, não execução em dados reais. Próxima tela: perfil do usuário.

## Próxima tela: perfil do usuário - 24/10/2026

- Revisão `profile-2026-10-24` libera uma vez somente `profile`; mantém escolhas anteriores e a chave independente `addUserRelation`.
- Documento próprio confirmado no servidor; erro/ausência não vira cadastro vazio. Atualização explícita e retry Web/mobile preservam rascunho; salvar aguarda nova leitura bem-sucedida.
- Nome usa comparação transacional do valor carregado e conferência de sessão. Conflito orienta atualizar e confirmar; reenvio do nome já persistido é reconhecido. Trava bloqueia edição/descarte/recarga durante envio, e callback antigo não grava/copia em outra sessão.
- E-mail, data e UID permanecem somente leitura. Resumo e vínculos falham separadamente; resposta inválida não vira zero confirmado. Notificação de cópia exige sucesso e tela/sessão vigente. Texto do botão primário mobile usa token de contraste existente.

**Validação desta revisão:** 50 testes focados distintos aprovados em quatro suítes: userProfile (12), userProfileFirebase (14), screenValidation (18) e userProfileScreens (6), sem somar repetições. Cobrem rascunho em recarga/retry, conflito transacional, sessão real/troca de UID, bloqueio durante envio, validação, cópia, resumo inválido e liberação independente/persistente. Os mocks de navegação/foco nativos foram ajustados para representar a API dos componentes; a suíte completa passou após esses ajustes. Interações mobile usam hook real com shell, Firebase e Clipboard simulados. HTML Web é renderização estática com estado simulado: verifica estados/atributos sem executar efeitos, submit ou navegador. Não representa teste instalado nem autorização de dados reais. Tipagem, arquitetura de estilos e diff-check conferidos nesta revisão; Jest mantém resolver somente no processo para Windows/UNC. Sem novo Emulator/Rules, export/build, inspeção visual autenticada, clipboard real ou aparelho. U01 mantém 85% (100/75/75/75), financeiro 78% e geral 56%; U02 permanece pendente.

Roteiro manual pendente: abra **Meu perfil** e confira nome/e-mail/data/UID. Edite o nome e pressione **Atualizar perfil**: mantenha o rascunho. Salve e recarregue, depois edite e descarte. Em outra sessão de teste, altere o nome entre leitura e envio: deve informar conflito sem sobrescrever; atualize, confira e confirme novamente. Simule falha de servidor/retry: preserve rascunho, sem salvar até nova leitura. Falhas de resumo/vínculos não impedem editar nome nem mostram zero confirmado. Teste nome vazio, cópia com sucesso/falha, troca de conta e saída durante operações pendentes. Confira temas, foco, leitor de tela, teclado/scroll e 320px no navegador/aparelho. Desative perfil e recarregue para conferir persistência; vínculo conserva escolha independente. Cenário sintético e aceite pendente. Próxima tela: vínculos de usuários.

## Próxima tela: vínculos de usuários - 24/10/2026

- Revisão `user-relationships-2026-10-24` libera só `addUserRelation` uma vez. Preferências de perfil, anotações, assistente e desligamentos posteriores permanecem.
- Firestore/Rules substituem Functions no fluxo. Convite válido por sete dias, aceite exclusivo do destinatário, revogação por qualquer participante e estado nativo prevalecendo sobre grants antigos. Um par não altera papéis/membros nem concede acesso a outro grupo Spark.
- Revisão apresenta o efeito antes de confirmar. Recibo e par são atômicos; cota de dez envios/aceites por minuto, sem impedir revogação existente. Retry conserva identidade/material, e replay histórico não restaura um vínculo revogado.
- Listas com paginação/índice escopado, atualização/retry e erro explícito. Campos bloqueados durante envio/incerteza; sessão/foco/montagem protegem consulta, transação, notificação e pós-submit. Migração financeira continua sendo D03, separada do consentimento de vínculo.

**Validação:** 101 testes focados distintos: 90 Jest em sete suítes (useUserRelationships 9, userRelationships 2, screenValidation 19, userProfile 12, userProfileFirebase 14, userRelationshipScreens 8 e lumusAssistantApplication 26) e 11 cenários de SDK/Rules reais no Firestore Emulator. Sem somar repetições. Mais cinco scripts existentes de Rules aprovados: perfil, sessão, regras gerais, esquema legado e assistente. Cobrem privacidade antes do aceite, destinatário exclusivo, preservação de perfis/papéis/grupos, revogação recíproca, tombstone sobre legado, replay/material, expiração, convite cruzado, pares independentes, recibo privado/imutável/obrigatório, terceiro, conta ausente, sessão revogada, cota e recusa de tombstone arbitrário.

Teste SDK usa tokens fictícios com `auth_time`, projeto `demo-lumus-relationships` e fixture REST privilegiada somente no loopback; não utiliza Auth/Functions remotos. No host Windows/UNC, esbuild estava instalado para Linux e conexões entre execuções separadas não alcançaram o emulador. Transpilação temporária com TypeScript e emulador/SDK no mesmo processo resolveram a execução, sem modificar dependências/configuração versionada de Jest. Logs finais em `.expo/lumus-continue/relationships-*-final.log`. Avisos de permissão negada pertencem aos casos de recusa esperada; positivos passaram. As interfaces usam hook real com transporte/shell simulados. Tipos app/backend, arquitetura de estilos e diff-check aprovados. Sem export/build, inspeção visual autenticada, aparelho, implantação ou escrita real. U02 65%, usuários 50%, geral 59%; financeiro 78%.

Roteiro manual: em duas contas de teste distintas, copie o ID em Meu perfil e envie após revisar o efeito. O remetente não vê o perfil/nome do alvo; o destinatário vê convite recebido, revisa e aceita. Atualize ambos os perfis/listas e confira a relação, sem mudar grupo/papel. Cancele convite enviado, recuse recebido e revogue vínculo aceito; confirme perda de leitura concedida pelo vínculo em ambas as direções. Acesso que venha de filiação ao grupo permanece. Simule falha/retry, resposta perdida, duplo clique, blur/refoco, logout/troca de conta e convite expirado. Reenvio usa o mesmo pedido; operação antiga não restaura consentimento revogado. Verifique temas, nomes longos, 320px, teclado/scroll/leitor de tela, pós-submit e visibilidade após reload. Antes de uso publicado, atualizar Rules/índice e bloquear endpoints antigos sem guardas; a preferência local não faz deploy. Próxima tela: anotações.

## Correção de diagnóstico: aporte sem bootstrap local - 25/10/2026

Problema informado: após criar uma conta no cadastro da demonstração, aportar retornava "Não foi possível registrar o movimento. Confira saldo, autorização e valor atualizado." A mensagem pertence ao escritor legado. Cadastro público não cria o grupo protegido do seed; retorno `null` da ponte entrava nesse caminho com Functions desligadas.

Hook compartilhado agora retorna falha explícita em `demo-lumus-financas` sem contexto nativo, mantendo a semântica legada em outros projetos. Notificações de aporte, resgate e sincronização mostram a causa em Web/mobile, sem esconder a orientação já apresentada no modal. Não registra dinheiro, não altera papéis/grupos, não limpa o formulário e não cria intenção incerta apenas por faltar bootstrap.

Verificação desta revisão: **29 testes focados distintos aprovados** em três suítes: sparkInvestmentFormHook (11), sparkInvestmentSyncClock (2) e investmentScreens (16). A suíte de interfaces foi repetida após os dois novos casos de feedback, sem somar repetições. Tipagem do app, arquitetura de estilos e diff-check aprovados; métricas visuais preservadas. Casos cobrem criação/sincronização/aporte sem contexto local, conta preparada, contrato legado fora da demonstração, retry/UID, datas e interação nas duas plataformas. Nenhuma alteração de Rules/SDK financeiro; sem nova execução de Emulator, build/export, inspeção visual ou aparelho. Os dados do usuário não foram consultados nem modificados. Bootstrap automático de cadastro segue em D03; F08/financeiro/geral preservados. Anotações continuam sendo a próxima tela após esta correção.

Teste manual pendente: na sessão atual, saia da conta criada e entre como `spark@demo.lumus.local` / `Spark-teste-123!`. Cadastre um investimento de teste, sincronize e aporte pelo banco do seed, conferindo banco, investimento e extrato. Na conta nova sem grupo, a mensagem deve orientar para a conta preparada, sem tentar Functions. Não reinicie/limpe os emuladores para aplicar essa orientação.


## Próxima tela: anotações - 25/10/2026

- Vínculos já entregues; a revisão `annotations-2026-10-25` habilita apenas `annotations` uma vez. Preferências posteriores e demais liberações permanecem.
- Lista/editor são compartilhados entre Web/mobile. Atualização explícita, erro persistente e retry; criação fica bloqueada após falha e erro não se apresenta como lista vazia.
- JSON/formato/registro inválido e IDs duplicados interrompem leitura e salvamento por registro sem sobrescrever dados brutos. A nota mantém rascunho e erro em falha; conflito oferece descarte/recarga explícitos.
- Salvar/voltar/recarga bloqueiam campos, toolbar e checklist; trava síncrona protege contra duplo clique. UID/montagem/foco/geração descartam leituras antigas; refoco preserva o editor aberto. Notas seguem locais, apagadas no logout explícito, sem sincronização ou Firestore.

Roteiro manual pendente: crie nota com título, lista/checklist e Markdown, salve e volte; atualize a lista e confira persistência no mesmo UID. Falhe leitura/escrita e confira erro/retry/rascunho, sem novo registro em falha. Edite a mesma nota pela conversa e confira conflito com descarte explícito. Troque UID e confira isolamento; logout explícito deve apagar somente suas notas. Verifique teclado/WebView e formatação em Web/aparelho. Rascunhos não salvos dependem da tela montada; a fila por UID não coordena abas distintas. Próxima tela: Assistente Lumus.


**Validação desta revisão:** 40 testes focados distintos aprovados em cinco suítes: localAnnotations (8), localAnnotationLogout (1), annotationRichText (4), screenValidation (20) e localAnnotationScreens (7). Os 33 casos de persistência/logout/conversão/liberação passaram no conjunto inicial; os sete de interface passaram na repetição final. Repetições não foram somadas. A suíte nova precisou completar o mock de StyleSheet, prover requestAnimationFrame no ambiente Node e usar o seletor público testID; isso não altera a API do produto. Interfaces usam apresentação/editor/serviços simulados e não homologam HTML real, WebView ou teclado.

Tipagem do aplicativo, arquitetura de estilos e diff-check aprovados. Métricas mantidas: 968 estilos inline, 1.110 cores brutas, 344 valores arbitrários e 52 consumidores de useScreenStyles (dívida existente). A execução Windows/UNC foi lenta e repetida com inicialização temporária alternativa, sem alterar a configuração versionada de Jest. Sem novo Emulator/Rules, export/build, inspeção visual autenticada/aparelho, deploy ou escrita real. Percentuais financeiro 78% e geral 59% mantidos.
