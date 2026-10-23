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
| 6c | Ajuste de saldo bancário | Conferir referência temporal, diferença e estorno | Próxima tela; preferências preservadas |
| 7 | Despesas e ganhos recorrentes | Cadastrar, editar, efetivar/desfazer ciclo e conferir saldo/agenda | Desativados |
| 8 | Investimentos | Criar, aportar/resgatar, sincronizar e conferir principal, saldo e banco | Desativados |
| 9 | Análise e previsão | Conciliar relatórios com os dados confirmados e distinguir projeção | Desativadas |
| 10 | Perfil, vínculos, anotações e assistente | Validar cada recurso e suas dependências, permissões e limites Spark | Desativados |

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
