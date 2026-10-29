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


## Assistente por tela - 25/10/2026

A revisão `lumus-assistant-2026-10-25` libera somente o Assistente uma vez nas preferências locais, preservando desligamentos posteriores. Web/mobile compartilham painel de erro de inicialização com retry. Falha de leitura de consentimento/leitura automática não é tratada como preferência ausente; envio fica indisponível até recuperar essa leitura. Falha isolada do modelo preserva os comandos locais existentes.

Consentimento só é concedido após persistência confirmada, com trava síncrona, erro persistente e retry. Atualização de disponibilidade limita chamada concorrente por UID e descarta respostas anteriores à troca de conta, revogação, limpeza ou desmontagem. A conversa continua em memória durante navegação.

Esta entrega trata a entrada A01. A02 continua parcial: catálogo, relatórios e executor financeiro Spark ainda precisam de adaptadores por família. A liberação local não comprova essas operações nem habilita fallback financeiro. A01 78%, A02 25%, assistente 38%, financeiro 78% e geral 59% mantidos. Sem deploy, Rules, migração ou escrita em dados reais; sem nova homologação visual, modelo real ou áudio/aparelho.


Roteiro manual do Assistente: abrir nas duas plataformas, conferir consentimento e retry de preferências; simular falha de persistência e confirmar que só o novo aceite bem-sucedido abre a conversa. Consultar perfil/criar nota e navegar/voltar mantendo conversa. Com modelo indisponível, conferir comandos locais. Revogar/trocar UID durante atualização de configuração e conferir descarte do resultado antigo. Gravar/transcrever sem envio automático requer aparelho/microfone. O próximo trabalho é integração financeira do Assistente (A02), começando por catálogo e operações ordinárias Spark; não há outra tela declarada concluída por esta entrada.


Validação desta entrega: **81 testes focados distintos** aprovados: 40 de interfaces Web/mobile, 18 de integração do provider, 21 de visibilidade e dois de montagem das rotas. Suites com seams de apresentação, modelo/Firebase e preferências; não são ensaio real de IA/voz/financeiro. Repetições não somadas. A execução inicial exigiu mock de CSS interop no ambiente Windows/UNC; o teste de consentimento revelou mensagem dentro do botão, corrigida para preservar o nome acessível. Tipagem, arquitetura de estilos (métricas existentes preservadas) e diff-check aprovados. Sem export/build, novo Emulator/Rules, modelo real, inspeção visual/aparelho ou deploy. A02 permanece parcial.


## Catálogo nativo do Assistente - 26/10/2026

O carregamento detecta contexto Spark confirmado antes de acessar as coleções anteriores. Contas usam `readSparkAccountsFirebase`: posição em centavos, revisão, cadastro, banco vinculado e estado nativos; contas inativas/arquivadas ficam fora da seleção. Dinheiro só existe se o Caixa canônico estiver presente. Categorias próprias/do grupo são paginadas no servidor, deduplicadas e filtradas por uso/exclusão; categorias de outros membros conservam leitura autorizada.

Planos ativos usam o leitor canônico de recorrências (com sua janela declarada); movimentos ordinários usam os eventos e o índice de resolução nativos, conservando origem live/imported e referência de execução. Estornado/substituído não é oferecido como alvo ativo. Identidades de operações nativas não são IDs do razão antigo. O catálogo do modelo continua restrito a handles/rótulos/descrições/escopo; dados e IDs ficam locais. O salt nativo é ligado ao UID da sessão, inclusive para registros de outros membros.

Erro nativo ou mudança de grupo/papel ao final interrompe a consulta, sem fallback legado ou catálogo vazio de sucesso. O caminho legado anterior permanece quando o contexto Spark retorna ausência confirmada. Não adiciona escritor nem callable.

**Escopo parcial de A02:** pares, avaliações, ajustes e catálogo completo de dados convertidos ainda não têm alvos conversacionais nativos nesta fatia. Executor financeiro e relatórios precisam de adaptadores próprios; este catálogo não prova registro/consulta financeira ponta a ponta pelo chat. Comandos locais e UI anteriores são preservados. A01/A02/financeiro/geral permanecem 78%/25%/78%/59%. Sem nova tela, liberação de rota, migração, Rules, deploy, dado real ou modelo real.


Validação do catálogo em 26/10/2026: **18 testes distintos** aprovados em três suítes (Spark catalog 6, catalog completeness 4, export 8), além de tipagem do aplicativo e diff-check. Ensaios usam leitores/Firebase simulados, sem comprovar Rules, modelo real ou integração financeira ponta a ponta. Incluem Caixa real/ausente, contas inativas, posições em centavos, referência/escopo de movimento, falha sem fallback, acesso alterado, paginação de categorias e renovação de handles. Nenhum estilo/tela foi alterado nesta etapa; sem novo Emulator, build/export, inspeção visual/aparelho ou deploy. Próximo trabalho: adaptar comandos ordinários e relatórios do chat ao protocolo Spark, com recibos e confirmação ligados à intenção.


## Registro ordinário Spark pelo chat - 26/10/2026

O executor identifica contexto Spark antes de ler recibos ou chamar serviços financeiros anteriores. `create_expense` e `create_gain` resolvem conta `sparkPositions` do mesmo grupo e categoria real, enviando centavos/direção/detalhes ao comando `executeSparkMovementCommandFirebase` já usado nas telas. Caixa conserva seu ID canônico e `moneyFormat`; não se usa um banco nulo fictício.

ID da intenção, data civil, hora explícita (se informada), dados e fingerprint são estáveis no retry. Sem hora declarada, o horário do preparo em São Paulo compõe a data civil escolhida. O comando nativo recusa futuro e revalida conta/categoria/saldo/Rules, com recibo idempotente no protocolo existente. `assistantRequestFingerprint` inclui dados, contas/categorias resolvidas, dependências e preparo. A assinatura da autorização também passa a incluir `preparedAt`; alterá-lo após a concessão exige nova autorização.

A sessão/capacidade são reconferidas antes de iniciar o comando. Uma chamada já iniciada não promete rollback por cancelamento posterior. Sem contexto Spark, o caminho anterior permanece; falha de contexto não autoriza fallback. Outras famílias com contexto nativo recebem indisponibilidade explícita do adaptador do chat, sem tentar callables antigas. Correção/estorno, pares, recorrências, investimentos, ajustes e relatórios nativos continuam pendentes nesta fatia. Não anunciar Assistente financeiro completo.

Não houve mudança em UI, Rules, índices ou serviços de saldo. Percentuais A02 25%, assistente 38%, financeiro 78% e geral 59% mantidos até integrar/homologar as demais famílias. Ver [[Operações Ordinárias Spark]], [[Assistente Lumus]] e [[Status da Implementação Spark]].


Validação desta etapa: **145 testes focados distintos** aprovados: comandos 108, conversa 31 e catálogo Spark 6. O primeiro conjunto passou com 143; dois casos de falha de contexto/família não suportada foram acrescentados e a suíte de comandos repetida (108), sem somar as repetições. Os ensaios novos verificam o adaptador com executor/Firebase simulados: direção, centavos, Caixa real, data/ID/material iguais no retry, autorização ausente/preparo alterado e ausência de fallback. Não equivalem a novo commit SDK/Rules nem ensaio real de modelo, voz ou aparelho. O comando nativo e suas Rules não foram modificados. Sem novo build/export, deploy ou dado real.

Tipagem do aplicativo e diff-check aprovados após os testes finais. Sem alteração de apresentação; lint de estilos não foi repetido nesta etapa de serviços.


## Correções, estornos e leitura de movimentos no chat - 26/10/2026

Correção/estorno ordinários preparam o alvo pelo leitor canônico Spark antes da confirmação. O draft conserva alvo, fingerprint e comando completo (ID/data/conta/categoria/detalhes/referência live ou imported). A autorização assina esses campos. Envio valida UID/grupo/capacidade e usa o mesmo executor Spark das telas; não exclui documentos. Retry não depende de encontrar o alvo ainda ativo no catálogo: o recibo do comando identifica eventual sucesso anterior. Intenções continuam em memória e não prometem recuperação após reload. Comandos já iniciados não prometem rollback em cancelamento posterior.

A leitura de movimentos do período do Assistente agora detecta Spark, lê os eventos nativos e reconfirma grupo/papel. Visão mensal e rankings usam essa fonte; consulta por movimento/banco/categoria reaproveita o leitor. Inverso conserva natureza econômica com valor assinado: estornar despesa reduz despesas em vez de criar ganho. Rankings ignoram inversos e alvos resolvidos até o fim do período. Transferências e outros efeitos não econômicos não entram nos totais. Eventos de referência sem delta não são linhas de movimentação desta projeção; não equivale ao relatório completo de avaliações. Falha nativa não lê legado nem inventa resultado vazio.

Pares, recorrências, investimentos, ajustes, relatórios especializados e aceitação integrada continuam parciais. Nenhuma Rule ou serviço monetário nativo foi alterado; não houve dado real, deploy, modelo real ou teste visual/aparelho. Percentuais A02 25%, assistente 38%, financeiro 78% e geral 59% mantidos. Ver [[Assistente Lumus]], [[Operações Ordinárias Spark]] e [[Status da Implementação Spark]].


Validação: **166 testes focados distintos** aprovados em quatro suítes (comandos, conversa, respostas financeiras direcionadas e exportação). A versão final do preparo/comando e do leitor foi repetida nas duas suítes afetadas: 127 casos aprovados, sem somar a repetição. Ensaios com Firebase/executor/apresentação simulados verificam alvo/fingerprint, preservação de data/detalhes, retry sem alvo no catálogo, autorização alterada, erro de preparo, totais com inverso/substituto e rankings, falhas nativas e acesso alterado. Não são novo ensaio SDK/Rules, modelo real ou aparelho; serviços monetários/Rules permanecem os existentes. Sem alteração visual, build/export ou deploy.

Tipagem do aplicativo e diff-check da versão final aprovados. Sem mudança de estilos nesta etapa de serviços.


## Relatórios especializados Spark - 26/10/2026

Pendências detectam o contexto nativo, leem planos/ciclos e metadados pelo leitor Spark, reconferem grupo/papel e reutilizam o cálculo de ocorrências/parcelas da Home. O leitor visual mantém o padrão de três itens por tipo; o chat pede o conjunto inteiro e pagina somente a apresentação em vinte itens, sem truncar os totais. Ciclo concluído, plano futuro/inativo ou parcelas encerradas não entram nas pendências atuais; última parcela conserva o resto e contratos vencidos seguem o cálculo das parcelas restantes.

Metadados ou cobertura insuficientes e pendências históricas sem prova não viram zero confirmado, pagamento ou dívida inferida. O texto identifica itens desconhecidos e totais parciais. Para meses passados, ciclos comprovados como concluídos são excluídos; a ausência de evento não prova uma pendência histórica com valor/configuração atuais.

A carteira continua usando a fachada Home, que já seleciona o leitor Spark. O relatório agora respeita `projectionStatus`: `confirmed_only` mostra posição confirmada, sem anunciar simulação nem ganho estimado; `projected` preserva a distinção base/projeção. CDI nativo consulta, com cursor no servidor, a curva do próprio titular no grupo; zero é taxa válida, futuro não substitui vigente e taxas de outros titulares não são misturadas como se fossem uma taxa única. Cadastro inválido interrompe o relatório. Não é consulta de cotação externa; investimentos seguem a curva do titular de cada abertura.

Sem escritores novos, alterações de Rules, dados reais, modelo real, publicação ou homologação de aparelho. A02 continua parcial: outros comandos financeiros, histórico integral e relatórios de referências sem delta ainda precisam de adaptadores/aceite. Percentuais A02 25%, assistente 38%, financeiro 78% e geral 59% mantidos.


Validação desta etapa: **45 testes focados distintos aprovados em quatro suítes**: respostas financeiras direcionadas, exportação, modelo de leitura de recorrências e carteira Spark. Sete cenários novos cobrem conjunto completo de nove pendências, resto contratual, ciclos concluídos/planos futuros/inativos, histórico/configuração desconhecidos, falha nativa, carteira confirmada sem projeção, CDI zero/futuro/titular e taxa inválida. A primeira execução exigiu completar uma importação do teste e restringir a união de tipo no montador legado; a repetição final passou sem somar casos repetidos. Tipagem do aplicativo aprovada. Leitores/Firebase são simulados nestes ensaios; não são novo teste SDK/Rules, de modelo real ou aparelho. Sem mudança de apresentação, novo build/export ou deploy. Próximo trabalho: demais comandos financeiros do Assistente, começando por transferências e saques Spark.


## Transferências e saques pelo chat - 26/10/2026

`create_transfer` e `create_cash_withdrawal` preparam o par nativo antes da confirmação textual. Somente bancos ativos do mesmo grupo podem ser origem/destino de transferência; saque exige origem bancária e Caixa canônico ativo com ID `cash`. Contas distintas por handle mas com o mesmo ID são recusadas, assim como Caixa inventado ou investimento usado como banco. O comando completo e o dia civil entram na assinatura de autorização, com ID/centavos/contas/nota/justificativa/data estáveis. Retry usa os dados preparados sem exigir que o catálogo ainda contenha as contas.

Hoje sem hora explícita usa o commit do servidor (`transferSparkFundsFirebase`); passado ou hora explícita usa `transferSparkDatedFundsFirebase`. Futuro é recusado no preparo. Transferência exige saldo suficiente, sem justificativa de negativo; saque aceita justificativa válida conforme o protocolo existente. Saldos, cota e atomicidade das duas posições continuam nos serviços/Rules existentes. Não há callable ou fallback antigo em contexto Spark.

Em operações sem data explícita, o executor lê o recibo no servidor antes do envio: virada do dia sem recibo não inicia outro efeito, e recibo de data diferente não é anunciado como sucesso do novo dia. Um commit que cruzar a meia-noite pode exigir conferência manual do extrato. A capacidade é revalidada depois da leitura; uma chamada já iniciada não promete rollback por cancelamento. Rascunhos permanecem em memória, sem promessa de recuperação integral após reload.

Saque é o par banco→Dinheiro, com mensagem/nota próprias, preservando a classificação visual dos leitores. Nenhum dos pares vira ganho/despesa. Não foram alteradas UI, Rules ou posições financeiras do banco real. Desfazimento do saque e demais famílias do Assistente continuam pendentes; percentuais A02 25%, assistente 38%, financeiro 78% e geral 59% mantidos até integração/aceite restantes. Sem modelo real, aparelho, publicação ou deploy.


Validação desta etapa: **163 testes focados distintos aprovados em três suítes** (comandos do Assistente, conversa e formulário de pares Spark), com tipagem do aplicativo e diff-check aprovados. Cenários novos verificam transferência/saque, centavos e IDs canônicos, hoje sem hora pelo servidor, retroativo/horário explícito, retry sem catálogo após falha, confirmação obrigatória, material alterado, Caixa ausente, aliases de mesma conta, futuro, justificativa indevida em transferência e recibo/virada do dia. Os executores/Firebase são simulados nos testes do adaptador; não é novo ensaio SDK/Rules, de modelo real ou aparelho. Nenhum serviço monetário ou Rule foi alterado; não se repetiu lint de estilos porque não houve mudança de apresentação. Sem build/export ou deploy.

Roteiro manual pendente: no grupo sintético, banco A com R$ 1.000, B com R$ 200 e Caixa com R$ 300. Confirme transferência de R$ 100: A R$ 900, B R$ 300, Caixa R$ 300. Confirme saque de R$ 50 de A: A R$ 850, B R$ 300, Caixa R$ 350; ganhos/despesas permanecem sem efeito desses pares. Reenvie a mesma intenção incerta e confira ausência de novo débito. Exercite data retroativa, virada de dia e insuficiência de saldo. São expectativas de teste, não execução comprovada nesta etapa. Próximo trabalho: desfazimento de saques pelo chat e demais famílias financeiras.


## Desfazer saque pelo chat - 26/10/2026

O catálogo Spark oferece somente a perna positiva de banco→Caixa (`cash`) com referência executável de par e sem resolução no índice canônico. Transferências entre bancos, aportes, resgates de investimento e inversos não viram saques selecionáveis. Origem live/imported é preservada; saque de outro ator permanece somente leitura para membro, com administração sujeita às mesmas Rules.

`undo_cash_withdrawal` confere o original imutável, direção banco→Caixa, valor apresentado e tipo real da posição de origem, depois usa `prepareSparkPairReversalFirebase` para conferir disponibilidade/claim e ator. Comando, valor e nome do banco são capturados antes da confirmação e entram na assinatura de autorização. O resumo informa quanto voltará do Dinheiro ao banco. “Desfaça” e “quero desfazer” são reconhecidos como intenção de alteração; não concedem autorização de execução sem confirmação.

A execução usa `executeSparkPairReversalFirebase`: estorno integral do par, sem apagar o saque, sem mudar ganhos/despesas e sem callable antiga. Contas/caixa/saldo, ator e claim são revalidados pelo protocolo existente. Retry mantém o mesmo ID/comando, independente de o alvo ainda estar ativo no catálogo; um novo pedido sobre saque já estornado é recusado no preparo. Intenção continua em memória; não há promessa de recuperar o comando após reload nem rollback de chamada já iniciada.

Sem novo serviço monetário, Rule, estilo, deploy ou alteração de dado real. Demais famílias continuam parciais; A02 25%, assistente 38%, financeiro 78% e geral 59% mantidos. Ver [[Assistente Lumus]], [[Resgate de Caixa]] e [[Versão Usável por Telas]].


Validação desta etapa: **180 testes focados distintos aprovados em quatro suítes** (comandos, conversa, catálogo Spark e formulário de pares), com tipagem do aplicativo e diff-check aprovados. Os cenários novos verificam saques ativos/resolvidos, origem importada, somente leitura, original banco→Caixa, bloqueio de transferência/aporte disfarçados, comando/valor adulterados, alvo já estornado, mudança de grupo, recusa financeira, retry sem catálogo e resumo de valor/direção antes da confirmação. Ensaios usam Firebase/executores simulados e não comprovam novos commits SDK/Rules, modelo real ou aparelho. Não houve mudança de UI ou estilo, build/export, deploy ou dado real.

Roteiro manual pendente: banco R$ 900 e Caixa R$ 400 após saque de R$ 100. Peça “desfaça o saque”, confira resumo de R$ 100 do Dinheiro ao banco e confirme. Esperado banco R$ 1.000 / Caixa R$ 300, original e inverso preservados, ganhos/despesas sem efeito. Reenvie a mesma intenção após resposta perdida: nenhum novo crédito/débito. Saque já estornado não deve ser oferecido como alvo novo; dinheiro já usado no Caixa deve impedir saldo negativo. São expectativas, não execução comprovada nesta etapa. Próximo trabalho: pagamentos e recebimentos recorrentes pelo chat Spark.


## Pagamentos e recebimentos recorrentes pelo chat - 26/10/2026

`pay_mandatory_expense` e `receive_mandatory_gain` possuem adaptador Spark para `settleSparkRecurringFirebase`, o mesmo protocolo financeiro das listas. O preparo consulta planos/ciclos no mês civil de São Paulo solicitado, exige plano ativo do próprio titular e conta banco/Caixa canônica do grupo, recusa ciclos concluídos ou anteriores ao histórico confirmado e contratos substituídos/cancelados. Despesa debita a conta; receita credita. Não há callable nem escrita financeira legada depois de erro ou perda do contexto Spark.

O comando captura ID, grupo/ator, plano/revisão, conta, data, ciclo, quantidade e valor antes da autorização. Todo pagamento/recebimento Spark apresenta resumo e exige confirmação, inclusive após ordem direta: informa direção, conta, ciclo e parcelas. Parcelas usam contador explícito e soma contratual inteira, incluindo o resto final (333 + 333 + 334); não avançam pelo calendário. Planos sem fim admitem um ciclo por lançamento, com valor informado ou nominal. Valor diferente do contrato finito orienta usar liquidação negociada na tela própria. Parcelas finitas vencidas usam `lateSettlement:true`, motivo auditável e indicação de liquidação após a vigência no resumo; não estendem o calendário.

A autorização cobre o comando preparado; alterações exigem nova confirmação. Reenvio mantém exatamente o mesmo ID/material, sem reler plano ou ciclo já alterados pelo commit; o protocolo existente consulta o recibo e revalida permissões/estado financeiro. Este adaptador exige saldo suficiente (`overdraftReason:null`); autorização de banco negativo continua na tela própria. Intenção permanece em memória, sem recuperação prometida após reload.

Lembrete é suprimido depois do commit. Falha da agenda conserva sucesso financeiro e permite repetir somente a supressão do ciclo, vinculada ao UID/grupo/plano original, sem consultar template legado nem pagar/receber outra vez. Seleção individual e em lote reconhecem `completedCycles` Spark como lista de meses, preservando o formato legado em mapa. Lotes usam o mês da data explícita e recusam conflito com o período informado; seleção de vencidos usa os metadados do plano e o vencimento original de parcelas atrasadas. Vigência futura, contrato substituído e histórico fora da janela lida são excluídos ou informados como indisponíveis, sem presumir pendência. A agenda nativa real continua dependente do aplicativo instalado.

Cadastro, edição, replanejamento e seleção de ciclos históricos pelo chat Spark permanecem parciais; desfazimento do ciclo atual consta na continuação abaixo. Nenhum escritor monetário, Rule ou estilo foi alterado; percentuais A02 25%, assistente 38%, F07 80%, financeiro 78% e geral 59% mantidos. Ver [[Assistente Lumus]], [[Recorrências Spark]], [[Despesas Fixas]], [[Receitas Fixas]] e [[Status da Implementação Spark]].


Validação desta etapa: **290 testes focados distintos aprovados em sete suítes** (`lumusAssistantCommand`, `lumusAssistantConversation`, `lumusAssistantSparkCatalog`, `lumusAssistantBatchCoverage`, `sparkRecurringFormCommand`, `mandatoryInstallments`, `sparkRecurringReminderBridge`), tipagem do aplicativo e diff-check aprovados. Um benchmark opt-in de lotes permaneceu ignorado; repetições de suíte não foram somadas. A primeira rodada teve uma expectativa de teste incorreta para referência somente leitura (o catálogo pede outro plano); durante revisão foi corrigida uma colisão de nome local no filtro de ciclos. A regressão e tipagem finais passaram após as correções.

Os cenários cobrem pagamento/recebimento, resto final e múltiplas parcelas, valor variável sem fim, liquidação vencida, São Paulo na virada de mês, ciclos concluídos, histórico desconhecido, plano de outro titular/tipo, referências legadas/contas inválidas, troca/perda de grupo, material adulterado, edição do rascunho, falha financeira sem fallback, retry com data/revisão/ID estáveis e retry exclusivo da agenda. Lotes verificam ciclos concluídos em lista, vencimentos dos metadados, cobertura histórica e conflito de mês/data. Ensaios usam leitores/executores Firebase e notificações simulados: não comprovam novo commit SDK/Rules, modelo real, agenda instalada ou homologação em aparelho. Nenhum estilo foi alterado; sem novo build/export, Emulator, deploy ou dado real nesta etapa.

Roteiro manual pendente: no grupo de teste, banco R$ 1.000 e despesa recorrente de R$ 100. Peça o pagamento, confira conta, saída, valor e ciclo no resumo e confirme: esperado banco R$ 900, despesa R$ 100 e ciclo efetivado. Receba uma receita recorrente de R$ 200: esperado banco R$ 1.100 e receita R$ 200. Reenvie a mesma intenção após resposta perdida e confira ausência de duplicação; um novo pedido não deve oferecer o ciclo concluído. Em contrato de R$ 10 em três parcelas, conferir R$ 3,33 + R$ 3,33 + R$ 3,34, sem avanço pelo calendário. Simule falha de agenda depois do commit e repita somente o lembrete; confira grupo/UID alterado, histórico fora da cobertura, vencimento futuro e parcelas vencidas. São expectativas sintéticas, não execução comprovada nesta etapa. Próximo trabalho: desfazer pagamentos e recebimentos recorrentes pelo chat Spark.


## Desfazer pagamentos e recebimentos recorrentes pelo chat - 26/10/2026

`undo_mandatory_expense_payment` e `undo_mandatory_gain_receipt` agora usam `undoSparkRecurringFirebase`. O alvo é o ciclo atual de São Paulo no instante em que o pedido foi preparado, como nas listas; o schema existente recebe somente o plano, sem selecionar outro mês. O preparo lê o plano/ciclo canônico e o receipt original em `sparkOperations` (inclusive `imported_recurring_settlement`), conferindo titular, grupo, tipo, conta, valor efetivado, quantidade, sinal e data. Plano arquivado ainda pode ter o ciclo desfeito; contratos substituídos/cancelados exigem desfazer o replanejamento primeiro. Parcelas finitas exigem que a faixa alvo seja a última efetivada.

O resumo apresenta valor real, direção, conta original, ciclo e quantidade. Despesa devolve o dinheiro à conta; receita retira o crédito. Quantidade, valor, nomes e comando completo entram na assinatura da confirmação. O estorno é integral, preserva original/inverso, desativa o ciclo e restaura o contador pelo protocolo existente. Valor negociado anterior é estornado pelo efetivamente pago, sem recalcular o nominal. A data efetiva do inverso conserva a data original, seguindo o formulário existente e seus efeitos após checkpoints. Banco negativo não é autorizado automaticamente (`overdraftReason:null`); Caixa continua sem saldo negativo.

A execução reenvia exatamente o mesmo comando/ID/revisão/data sem reler o alvo antes do commit, permitindo conferir recibo após resposta perdida, mudança de mês ou retirada do alvo do catálogo. Perda/troca de grupo e alteração de material impedem envio; não existe fallback para escritor legado. O catálogo conserva planos arquivados com efetivação ativa no ciclo atual; escolhas e lotes selecionam apenas ciclos ativos elegíveis. Planos de outro titular são somente leitura inclusive para administrador, conforme a regra do protocolo.

Depois do commit, somente a agenda do plano afetado é reconciliada com leitura Spark fresca. Configuração desativada, contrato arquivado/substituído ou completo cancela seu lembrete; configuração ativa agenda novamente sem solicitar permissão. Se o ciclo foi pago novamente entre as operações, o lembrete mantém essa conclusão. Falha de leitura/agenda conserva sucesso financeiro e permite retry apenas do lembrete, vinculado ao UID/grupo/plano/ciclo, sem consultar template legado nem repetir estorno. Demais lembretes não são substituídos por uma sincronização parcial.

Intenção continua em memória; seleção de ciclos históricos, cadastro/edição/replanejamento conversacionais e autorização de saldo negativo permanecem fora desta etapa. Não houve mudança de escritor monetário, Rules ou estilo, publicação ou dado real. A02 25%, assistente 38%, F07 80%, financeiro 78% e geral 59% mantidos. Ver [[Recorrências Spark]], [[Despesas Fixas]], [[Receitas Fixas]] e [[Status da Implementação Spark]].


Validação: **310 testes focados distintos aprovados em cinco suítes** (`lumusAssistantCommand`, `lumusAssistantConversation`, `lumusAssistantSparkCatalog`, `lumusAssistantBatchCoverage`, `sparkRecurringFormCommand`). Um benchmark opt-in de lotes permaneceu ignorado; execuções repetidas não são somadas. Os ensaios usam leitores/executores Firebase e notificações simulados. Cobrem pagamento e recebimento desfeitos, valor negociado/importado, Caixa, arquivamento, conferência do original, ordem de parcelas, ciclo de São Paulo, ausência de histórico, grupo/ator alterados, material adulterado, retry após resposta perdida e virada de mês, falha financeira sem fallback e retry exclusivo da agenda. Não comprovam novo commit SDK/Rules, modelo real ou agenda instalada. Sem novo Emulator, build/export, inspeção visual/aparelho, deploy ou dado real nesta etapa. Tipagem do aplicativo e diff-check finais aprovados. A verificação dedicada dos 25 cenários de desfazimento também passou, incluindo vínculo do ator no retry de agenda; esses casos repetidos não aumentam a contagem de testes distintos.

Roteiro manual pendente: no grupo de teste, banco R$ 900 depois de pagar despesa recorrente de R$ 100. Peça “desfaça o pagamento”, confira valor, conta/direção e ciclo atual, confirme e confira banco R$ 1.000, ciclo reaberto e original/inverso preservados. Para receita de R$ 200 já recebida, o desfazimento deve retirar R$ 200 da mesma conta. Confira parcelas quitadas em conjunto, valor negociado real, plano arquivado sem reativação e recusa de faixa anterior/replanejamento pendente. Simule resposta perdida e reenvie o mesmo pedido após a virada do mês: não pode haver novo efeito. Simule agenda indisponível após sucesso, pague novamente o ciclo e tente só o lembrete; a nova conclusão deve ser respeitada. São expectativas sintéticas, não execução comprovada nesta etapa. Próximo trabalho: cadastro e edição de recorrências pelo chat Spark.


## Cadastro e edição de recorrências pelo chat Spark - 26/10/2026

`create_mandatory_expense`, `create_mandatory_gain`, `update_mandatory_expense` e `update_mandatory_gain` possuem adaptadores Spark. O preparo captura definição e metadados completos, com titular/grupo, categoria autorizada, nomes, valores e revisões, antes da confirmação. Criação e edição Spark exigem resumo mesmo após ordem direta. O resumo mostra nominal, quantidade/total do contrato, vigência, categoria, vencimento/dias úteis, descrição e configuração do lembrete, deixando explícito que não movimenta saldo.

O cadastro usa `createSparkRecurringPlanFirebase` e depois `saveSparkRecurringMetadataFirebase`, com IDs distintos e estáveis para definição, plano e configuração. Não cria pagamento/recebimento ou avanço de parcelas. Contrato finito usa centavos inteiros: nominal deve corresponder à divisão inteira do total pela quantidade, deixando o resto para a parcela final. Total omitido deriva do nominal vezes quantidade; vigência final é conferida contra a quantidade. Datas de parcelas exigem contrato parcelado. Recorrência sem parcelas inicia no ciclo atual e admite alteração futura do nominal.

A edição lê o plano canônico e usa `updateSparkRecurringPlanFirebase` com revisão atual; preserva contador, estado ativo/arquivado e campos omitidos. Total, quantidade, início/fim e nominal de contrato finito não são renegociados por edição: o usuário deve usar o replanejamento na tela própria. Outro titular, tipo incompatível e contrato substituído/cancelado são recusados. Lembrete ativado sem vencimento confirmado pergunta o dia antes de preparar os comandos.

As duas etapas não são uma transação única. Reenvio conserva o mesmo material e os mesmos receipts, sem reler o plano alterado pelo próprio commit. Após o primeiro envio, esse pedido não aceita edição dos argumentos enquanto seu resultado está sendo conferido. Definição confirmada com configuração incerta gera erro parcial explícito, atualiza as leituras/catálogo e bloqueia dependentes até a conclusão; retry confirma os receipts sem cadastrar outro plano. Cancelamento comprovado da definição pede nova intenção; cancelamento comprovado da configuração orienta editar o plano já salvo, sem prometer reutilizar uma tentativa cancelada. Perda/troca de grupo e alterações após autorização bloqueiam envio, sem fallback legado.

Somente depois de ambas as etapas confirmadas o lembrete do plano é reconciliado pela mesma leitura Spark fresca usada no desfazimento. Falha da agenda preserva o cadastro/edição e oferece retry apenas local, sem repetir definição ou metadados. Permissões não são solicitadas automaticamente. A intenção e o bloqueio de material permanecem em memória; não há promessa de recuperação do rascunho após reload. Categorias criadas por ações ainda sem adaptador Spark, dependências dinâmicas não resolvidas, arquivamento/restauração, replanejamento e seleção histórica de ciclos não são concluídos por estes quatro adaptadores.

A02 25%, assistente 38%, F07 80%, financeiro 78% e geral 59% mantidos: esta entrega não encerra a integração/homologação do módulo. Sem novo protocolo monetário, backend, Rule ou estilo, deploy ou dado real. Ver [[Recorrências Spark]], [[Conversão de Recorrências Spark]], [[Despesas Fixas]], [[Receitas Fixas]] e [[Status da Implementação Spark]].


Validação: **267 testes focados distintos aprovados em três suítes** (`lumusAssistantCommand`, `lumusAssistantConversation`, `sparkRecurringFormCommand`), sem ignorados nessa rodada final. Tipagem do aplicativo e diff-check aprovados. Repetições anteriores não aumentam a contagem. Os cenários novos cobrem os quatro comandos, contrato/resto/vigência futura, total derivado, limites e datas inválidas, proteção de contrato finito, edição sem fim, campos omitidos, titular/tipo/replanejamento, pergunta de vencimento, duas identidades estáveis no retry, configuração parcial, material adulterado, edição bloqueada após envio, grupo alterado, cancelamento entre fases e cancelamento comprovado por fase, agenda independente e atualização das leituras com resultado parcial. A conversa verifica resumo completo e confirmação antes de executar.

Os ensaios usam leitores/writers Firebase e notificações simulados. Não comprovam novo commit SDK/Rules, modelo real, agenda instalada ou homologação em aparelho. Nenhum estilo foi alterado; sem novo Emulator, build/export, deploy ou dado real nesta etapa.

Roteiro manual pendente: no grupo de teste, banco R$ 1.000. Cadastre despesa e receita recorrentes de R$ 100 pelo chat, confira resumo completo e confirme; o saldo deve continuar R$ 1.000, sem lançamento financeiro, com definição/configuração disponíveis na lista. Cadastre contrato de R$ 10 em três parcelas nominais de R$ 3,33, início em novembro/2026 e fim em janeiro/2027; conferir total e vigência, sem avanço de contador. Edite nome/vencimento/categoria/descrição/lembrete e confira preservação de parcelas pagas e contrato. Tente alterar quantidade ou nominal finito: deve orientar replanejamento. Simule resposta perdida após definição e após configuração; reenvie a mesma intenção, sem outro plano. Em configuração incerta, conferir definição visível e dependentes bloqueados; cancelar entre fases não deve enviar metadados. Cancelamento comprovado da configuração deve orientar edição do plano existente. Falha local de agenda após sucesso deve permitir repetir somente o lembrete. São expectativas sintéticas, não execução comprovada nesta etapa. Próximo trabalho: arquivamento de recorrências pelo chat Spark.


## Arquivamento de recorrências pelo chat Spark - 26/10/2026

`delete_mandatory_expense` e `delete_mandatory_gain` agora possuem adaptador Spark de arquivamento por `updateSparkRecurringPlanFirebase`, com `active:false`. O preparo lê o plano canônico, confere titular/grupo/tipo, estado ativo e ausência de replanejamento/cancelamento, e captura nome, categoria, nominal e revisão antes da confirmação. Comando e quantidade de parcelas concluídas entram na assinatura da autorização. O resumo usa “Arquivar”, informa preservação de contrato/ciclos/histórico e suspensão dos lembretes, sem sugerir quitação de parcelas pendentes ou movimento de saldo. Não apaga definição, ciclo, pagamento, recebimento ou metadados.

Pedidos “arquive”, “arquivar” e “quero arquivar” são reconhecidos como intenção de alteração, sempre sujeita à confirmação. A conversa marca esses pedidos como somente arquivamento, inclusive em lotes; a validação e o executor recusam encaminhá-los a exclusão legada quando não há grupo Spark. Correções do rascunho preservam essa intenção. Pedidos antigos de exclusão em contas legadas conservam seu contrato existente. O modelo recebe a orientação de usar os tipos de recorrência existentes; não há permissão de escrita concedida pelo texto do modelo. Lotes preservam a quantidade humana e excluem planos Spark inativos, substituídos ou cancelados.

A execução envia exatamente o comando preparado/ID, sem reler o alvo antes do commit. Retry depois de resposta perdida funciona com plano já inativo ou retirado do catálogo; o protocolo confere receipt, revisão e permissões. Material alterado, ausência de comando, tentativa de restaurar pelo caminho de arquivar, troca/perda de grupo e cancelamento antes do envio são recusados. Cancelamento comprovado pelo protocolo pede nova intenção, sem prometer reutilizar um receipt cancelado.

Após o commit, a agenda do plano é reconciliada com leitura Spark fresca e os avisos do plano inativo são cancelados. Se houve restauração posterior pela lista, essa configuração atual é respeitada. Falha de leitura/agenda conserva o sucesso do arquivamento e oferece retry somente local, vinculado ao titular/grupo/plano, sem arquivar outra vez, editar metadados ou modificar outros lembretes. A invalidação financeira existente atualiza as leituras do aplicativo. Plano arquivado com ciclo atual efetivado continua disponível para o desfazimento já implementado; novas efetivações são bloqueadas pelo estado inativo.

Intenção continua em memória. Restauração, replanejamento e escolha de ciclo histórico pelo chat permanecem parciais; não há recuperação prometida do rascunho após reload. A02 25%, assistente 38%, F07 80%, financeiro 78% e geral 59% mantidos até integração/homologação restantes. Sem novo writer monetário, Rules, estilo, deploy ou dado real. Ver [[Recorrências Spark]], [[Despesas Fixas]], [[Receitas Fixas]] e [[Status da Implementação Spark]].


Roteiro manual pendente: no grupo de teste, use plano ativo com parcelas pagas e ciclo atual efetivado. Peça “arquive a recorrência”, confira nome canônico, contagem e aviso de que não quita pendências, confirme e confira plano inativo sem alteração de saldo, contrato, contador, ciclos ou metadados. Novos pagamentos devem ser recusados; o ciclo atual já efetivado deve continuar disponível para desfazer. Simule resposta perdida após commit e reenvie o mesmo pedido sem duplicar o evento/revisão. Simule falha da agenda depois do arquivamento e repita somente o lembrete; se o plano foi restaurado pela lista nesse intervalo, o retry não pode arquivá-lo de novo. Em conta legada, “arquive” não deve excluir o template. Em lote, peça duas recorrências e confira que conjunto divergente não é iniciado. Teste titular/grupo alterado, categoria/revisão indisponível, cancelamento e privacidade. São expectativas sintéticas, não execução comprovada nesta etapa. Próximo trabalho: restauração de recorrências pelo chat Spark.


Validação: **381 testes focados distintos aprovados em cinco suítes** (`lumusAssistantCommand`, `lumusAssistantConversation`, `lumusAssistantBatchCoverage`, `lumusAssistantSparkCatalog`, `sparkRecurringFormCommand`), com um benchmark opt-in ignorado. A rodada completa aprovou 380 casos; a rodada final dos lotes aprovou 76, incluindo um novo cenário “quero arquivar”, sem somar novamente os casos repetidos. Tipagem do aplicativo e diff-check aprovados.

Cenários novos: arquivo de despesa/receita pelo comando canônico, preservação de contrato/ciclos/contador/metadados, nominal sem parcelas, alvo já arquivado, titular/tipo/replanejamento incompatíveis, leitura/ref/grupo indisponíveis, retry após resposta perdida e mudança de mês sem catálogo ativo, material adulterado, comando de restauração recusado, bloqueio de exclusão legada em pedidos de arquivar, marca preservada em correções, cancelamento/recusa do protocolo, agenda independente, restauração posterior e lotes com quantidade humana. A conversa exige confirmação, apresenta arquivamento e recusa propostas de escrita em perguntas/negações.

Ensaios usam leitores/executores Firebase e notificações simulados; não comprovam novo commit SDK/Rules, modelo real ou agenda instalada. Sem novo Emulator, build/export, inspeção visual/aparelho, deploy ou dado real nesta etapa. Nenhum estilo foi alterado.


## Restauração de recorrências pelo chat Spark - 26/10/2026

A conversa aceita pedidos para restaurar ou reativar despesas e receitas recorrentes arquivadas. O catálogo inclui planos inativos e oferece, para restauração, somente os elegíveis. O comando Spark `updateSparkRecurringPlanFirebase` é preparado com `active:true`, revisão, titular, categoria, nominal e identidade preservados. O resumo exige confirmação e informa preservação do contrato, ciclos, contador e histórico; não movimenta saldo. Contratos substituídos/cancelados, planos já ativos, outro titular e grupos indisponíveis são recusados; alterações adicionais devem ser solicitadas separadamente.

O mesmo comando e ID são reenviados após resposta incerta, sem reler o plano já alterado pelo commit. A agenda é reconciliada separadamente com o estado atual; sua falha permite retry somente do lembrete. A intenção de restauração permanece vinculada ao rascunho, inclusive em correções; não há fallback para edição legada. Lotes filtram planos inativos elegíveis e preservam a quantidade informada. Sem novo writer monetário, Rules ou deploy; a intenção continua em memória. Ver [[Assistente Lumus]], [[Despesas Fixas]], [[Receitas Fixas]] e [[Status da Implementação Spark]].


Validação: 306 testes aprovados nas suítes de comandos, conversa e catálogo Spark. Uma segunda rodada de conversa, lotes e catálogo aprovou 139 testes, com um benchmark opcional ignorado; as rodadas têm sobreposição e não são somadas. Tipagem e diff-check aprovados. Os ensaios usam serviços Firebase e notificações simulados, sem novo teste SDK/Rules, modelo real ou validação em aparelho.

Roteiro manual pendente: arquive uma despesa e uma receita, restaure pelo chat após conferir o resumo e confirme preservação de contrato, contador, ciclos e saldo. Confira plano sem ciclo atual, outro titular, replanejamento, falha de categoria e reenvio após resposta perdida. Simule falha de lembrete e confira que o retry não reativa outra vez. São expectativas, não execução comprovada. Próximo: replanejamento de recorrências pelo chat Spark.


### Replanejamento pelo Assistente — 27/10/2026

O chat prepara replanejamento individual de contrato finito Spark ativo, de titular autorizado, pedindo o total negociado em centavos, quantidade de parcelas, primeiro ciclo e motivo. Após resumo e confirmação, usa `replanSparkRecurringFirebase` com revisões e IDs capturados: o contrato anterior é preservado e substituído atomicamente, sem movimentação de saldo nem quitação implícita. Uma tentativa já enviada conserva o mesmo comando para recuperação; alteração do material exige nova intenção após resolução. Atualização dos lembretes do predecessor e sucessor é posterior e pode ser repetida sem reenviar o replanejamento. Contas legadas não recebem substituição alternativa.

O desfazimento conversacional do replanejamento, a recuperação da intenção após reload e a homologação em aparelho permanecem pendentes. Os serviços simulados não comprovam Rules ou operação em produção. Sem deploy. Ver [[Assistente Lumus]] e [[Recorrências Spark]].


### Desfazimento de replanejamento pelo Assistente — 27/10/2026

O chat prepara o desfazimento individual de replanejamento Spark usando a referência ao contrato anterior ou ao sucessor. Pede o motivo, confere titular, grupo, vínculos e receipt original, e apresenta os dois contratos e o efeito para confirmação. O sucessor não pode ter parcelas efetivadas nem replanejamento posterior; o serviço `undoSparkRecurringReplanFirebase` volta a validar as revisões e dependências na transação. A operação reativa o anterior, cancela o sucessor e preserva o histórico sem movimentar saldo.

A tentativa conserva o comando e ID após envio; os lembretes dos dois planos são reconciliados depois do commit e podem ser repetidos separadamente. Não há fallback para alteração legada. Intenção após reload, validação em aparelho, Rules implantadas e operação em dados reais não foram verificadas nesta entrega. Sem deploy. Ver [[Assistente Lumus]] e [[Recorrências Spark]].


### Entrada única da demonstração Spark — 27/10/2026

`npm start`, `npm run web`, `npm run dev:local`, `npm run start:expo-go` e `npm run dev:local:web` usam o mesmo supervisor da demonstração Spark (`dev:spark` / `dev:spark:web`). Os modos `start`, `--web`, `--android` e `--dev-client` de `script/build_and_run.sh` também seguem esse supervisor. A conta `spark@demo.lumus.local` é preparada somente em Auth/Firestore locais novos; não há reinicialização automática de sessões existentes. Os emuladores e seus dados são efêmeros. O comando antigo que recriava a conta legada e limpava o emulador deixa de ser usado nesses atalhos. Outros comandos explícitos de seed legado permanecem distintos.

Esta alteração de entrada não implementa bootstrap de contas reais ou migração legada, nem comprova por si só login no navegador, funcionamento completo ou deploy. Ver [[Guia de Testes Locais]] e [[Status da Implementação Spark]].


### Recuperação do perfil no cadastro — 27/10/2026

A criação pública de acesso usa a sessão Firebase secundária. O perfil é criado por transação que verifica primeiro sua ausência, sem sobrescrever um perfil existente. Se a gravação falhar ou a resposta for incerta, a conta Auth é preservada; uma nova tentativa com o mesmo nome, e-mail e senha reautentica na sessão secundária, confere o UID e retoma a transação. Se a primeira gravação já tiver sido confirmada, o perfil não é reescrito. Nenhuma senha é armazenada nessa recuperação, e a sessão principal não é substituída.

Depois que o UID é recebido, a intenção de perfil é preservada localmente, sem senha ou token, e pode ser retomada após reinício com as mesmas credenciais. Se a resposta de criação Auth for perdida ou o processo encerrar antes da gravação local do UID, a recuperação ainda não é automática. O cadastro continua sem preparar o grupo financeiro Spark; a mensagem informa essa limitação. Não houve migração legada, alteração de Rules, escrita real nem deploy. Ver [[Autenticação]] e [[Status da Implementação Spark]].


### Primeiro uso Spark com autorização protegida — 27/10/2026

O cadastro de perfil novo marca `sparkFirstUseRequested`. Na primeira leitura de contexto, `initializeSparkFirstUseFirebase` consulta a autorização protegida do mesmo UID. Quando disponível, perfil, grupo `first_{uid}`, Caixa zero e operação `first_use_cash` são criados na mesma transação. O grupo recebe somente o titular como administrador e o protocolo vigente. A transação recusa perfil já vinculado e preserva o histórico existente; um reenvio após commit reconhece o grupo e o Caixa sem repetir gravações.

As Rules exigem autorização prévia em `sparkFirstUseAuthorizations/{uid}` emitida por autoridade confiável, vinculada ao UID, grupo determinístico, `createdAt` do perfil, ciclo do calendário protegido e expiração, e negam criação/alteração da autorização pelo cliente. O calendário protegido precisa existir e cobrir o instante do servidor. As quatro escritas são verificadas conjuntamente; saldo inicial deve ser zero e a sessão atual precisa pertencer ao titular. A autorização não é uma prova gerada pelo cliente nem deve ser emitida somente por ausência de documentos.

**Ainda não há emissor confiável automático dessa autorização.** Verificação de criação real do Auth, inventário completo, ausência de legado e corte de escritores precisam ser implementados antes de conceder a autorização a contas reais. Sem autorização, o cadastro financeiro continua pendente. Esta etapa não migra contas legadas e não publica Rules ou cliente. Os testes em Emulator não constituem ativação de produção. Ver [[Status da Implementação Spark]] e [[Importação Financeira Local Spark]].
