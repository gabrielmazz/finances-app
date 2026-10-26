---
tags: [navegacao, configuracoes, preferencias, rotas]
relacionado: [[Navegação]], [[Configurações]], [[Comportamento Pós-Registro]], [[Assistente Lumus]]
status: ativo
tipo: feature
versao: 1.1.0
---

# Visibilidade de Rotas

Preferência local que permite ocultar telas configuráveis neste aparelho. Na etapa [[Versão Usável por Telas]], todas as 19 chaves começam desativadas; a escolha não é enviada ao Firebase nem depende do usuário autenticado.

## Como funciona

1. `RouteVisibilityProvider`, montado no root layout, persiste o estado em AsyncStorage pela chave `@finances/route-visibility:screen-validation-v1` e preenche chaves ausentes com falso. A chave anterior `@finances/route-visibility` permanece intacta, sem reabrir telas nesta etapa. Escolhas explícitas da nova chave sobrevivem ao reload.
2. `ScreenSettingsScreen.tsx` mostra o switch **Mostrar no app** em cada configuração de formulário. Configurações de cadastro e edição da mesma tela compartilham a mesma visibilidade.
3. Telas sem comportamento pós-salvamento próprio, como **Dashboard**, **Movimentos do banco**, **Análise por categoria**, **Previsão financeira**, **Ajuste de saldo**, **Meu perfil**, **Lumus IA** e **Anotações**, têm accordions ilustrados com resumo de acesso e o switch no conteúdo expandido. Anotações conserva a apresentação de desenvolvimento: começa oculta, usa o switch **Em desenvolvimento** e mostra um modal de aviso ao ser liberada para teste.
4. Os navigators Web/mobile removem opções desativadas e grupos sem opções. Configurações e Sair permanecem disponíveis. Os accordions de bancos, categorias e ajuste também respeitam a visibilidade do destino.
5. `app/_layout.tsx` usa `Stack.Protected` para cada rota configurável. Assim, uma tela oculta não pode ser aberta por link direto, deep link ou navegação programática.
6. `/home?tab=0` e `tab=1` são conferidos pelo container antes de montar Dashboard ou cadastro de despesa inline. Aba oculta retorna ao Dashboard somente se ele estiver ativo; caso contrário retorna a Configurações (`tab=2`). A rota Home permanece acessível porque hospeda a central.
7. Se uma preferência antiga de [[Comportamento Pós-Registro]] apontar para uma tela que foi ocultada, o pós-submit retorna ao Dashboard ativo ou a Configurações, sem tentar abrir uma rota protegida. O seletor também filtra o Dashboard oculto.

## Arquivos principais

- `contexts/RouteVisibilityContext.tsx` — Estado, defaults e persistência local.
- `screens/mobile/ScreenSettingsScreen.tsx` / `screens/web/ScreenSettingsScreen.web.tsx` — Switches da configuração por tela, do Lumus e das Anotações.
- `components/uiverse/navigation/navigator.tsx` — Filtra destinos ocultos nos menus.
- `app/_layout.tsx` — Guard de acesso real por `Stack.Protected`.
- `app/mobile/home.tsx` — Protege o atalho inline de Controle.
- `utils/navigation.ts` — Mapeia chaves de visibilidade para caminhos de rota.
- `hooks/usePostSubmitBehavior.ts` — Faz fallback seguro depois de salvar.

## Observações importantes

- Preferências antigas de telas removidas são descartadas na normalização; não recriam rotas ou itens do menu.
- Novo banco, Nova categoria e Config. das telas foram retirados apenas do navigator; seus acessos internos permanecem disponíveis, respeitando a visibilidade dos cadastros.

- Ocultar não apaga a rota física nem seus dados; apenas remove o acesso neste dispositivo. Para Anotações, o valor inicial oculto é intencional até que o usuário libere a tela neste aparelho.
- A preferência é local ao aparelho e permanece válida após trocar de conta.
- Uma rota configurável nova deve ser registrada em `ROUTE_VISIBILITY_PATHS`, receber opção no navigator quando aplicável, aparecer em `ScreenSettingsScreen.tsx` e ser coberta por `Stack.Protected`.

- [[Perfil do Usuário]] obedece à chave `profile`; `addUserRelation` continua independente para o atalho e guard de vínculo. Login, Configurações e Configurações das telas não são ocultáveis. O botão **Desativar todas as telas** restaura os defaults falsos sem modificar dados ou pós-submit.

## Liberação por avanço — 23/10/2026

Por orientação explícita do usuário, cada entrega habilita uma vez as telas alteradas. SCREEN_VALIDATION_RELEASES lista revisões e chaves; o marcador local @finances/route-visibility:screen-validation-applied-v1 registra as revisões aplicadas. As preferências são gravadas antes do marcador. Ganhos e despesas são a primeira revisão liberada automaticamente. As outras telas e desligamentos posteriores permanecem preservados; nova entrega exige nova revisão. Ver [[Versão Usável por Telas]].

A revisão seguinte, `statement-dashboard-2026-10-23`, libera `bankMovements` e `homeDashboard` uma vez. Quem já aplicou ganhos/despesas mantém inclusive essas telas desativadas se assim escolheu; somente as duas novas chaves são habilitadas. Desativar novamente e recarregar preserva o desligamento.

A revisão `transfer-2026-10-23` habilita apenas `transferScreen`. Revisões já aplicadas não reabrem dashboard/ganhos/extrato desligados pelo usuário; `addRescue` e `bankBalanceAdjustment` conservam a preferência atual.

A revisão `withdrawal-2026-10-23` habilita apenas `addRescue` uma vez. Revisões anteriores já aplicadas não reabrem transferências, dashboard, extrato, ganhos ou despesas desligados pelo usuário. `bankBalanceAdjustment` mantém sua preferência; desativar saque após a liberação e recarregar conserva o desligamento.

A revisão `balance-adjustment-2026-10-23` habilita apenas `bankBalanceAdjustment` uma vez. Saque, transferência e demais telas já liberadas conservam desligamentos posteriores; a revisão não altera as preferências de pós-submit. Desativar ajuste após a liberação e recarregar mantém a escolha.

A revisão `recurring-expenses-2026-10-23` habilita apenas `addMandatoryExpenses`, chave existente que protege a lista e o formulário Web/mobile. `mandatoryExpenses` é o nome da rota, não uma nova chave de visibilidade. Receitas recorrentes e demais preferências permanecem. Desativar novamente após a liberação mantém o desligamento no reload.

A revisão `recurring-gains-2026-10-23` habilita apenas `addMandatoryGains`, chave existente que protege cadastro e lista de receitas recorrentes Web/mobile. `mandatoryGains` é nome de rota, não uma nova chave. Despesas recorrentes e demais escolhas já aplicadas permanecem; desligar receitas depois da liberação e recarregar conserva a preferência. Isso não migra grupos nem comprova homologação.

A revisão `investments-2026-10-23` habilita apenas `addFinance`, chave existente que protege o cadastro e a carteira Web/mobile. `financialList` é destino de navegação, não uma chave nova. Outras escolhas e desligamentos posteriores permanecem. A liberação é local para teste, sem migrar grupos ou aprovar publicação.

A revisão `category-analysis-2026-10-23` habilita somente `categoryAnalysis` uma vez. Cadastro/carteira de investimentos, previsão e demais escolhas já aplicadas permanecem. Desativar a análise após a liberação e recarregar conserva o desligamento. Habilitação local não altera grupos financeiros ou comprova homologação.

A revisão `financial-forecast-2026-10-24` habilita somente `financialForecast` uma vez. Análise, investimentos e demais escolhas já aplicadas permanecem. Desligar a previsão após a liberação e recarregar conserva a preferência. Não ativa grupos, muda o protocolo ou comprova homologação.

A revisão `profile-2026-10-24` habilita somente `profile` uma vez. `addUserRelation`, anotações, assistente e demais preferências conservam suas escolhas; desligar o perfil após a liberação e recarregar mantém o desligamento. Teste de persistência cobre essa independência. Liberação local para teste, sem ativar grupos ou concluir U02.

## Vínculos para validação - 24/10/2026

Revisão `user-relationships-2026-10-24` habilita uma vez somente `addUserRelation`. Perfil, anotações, assistente e demais escolhas permanecem, inclusive desligamentos já feitos. Desativar vínculos após a liberação e recarregar conserva a escolha. A liberação local não implanta Rules/índice nem autoriza tráfego real; pré-requisitos em [[Vínculos de Usuários Spark]] e [[Processo de Release]].
