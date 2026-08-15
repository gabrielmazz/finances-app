---
tags: [configuracoes, navegacao, formularios, pos-submit]
relacionado: [[Configurações]], [[Navegação]], [[Visibilidade de Rotas]], [[Transações de Despesas]], [[Transações de Receitas]], [[Despesas Fixas]], [[Receitas Fixas]], [[Gerenciamento de Bancos]], [[Gerenciamento de Tags]], [[Gerenciamento de Usuários]], [[Transferências]], [[Resgate de Caixa]], [[Balanço Mensal]], [[Investimentos]]
status: ativo
tipo: feature
versao: 1.3.1
---

# Comportamento Pós-Registro

Preferência global que define o que cada formulário faz depois de salvar com sucesso. Cadastros e edições podem retornar para uma tela escolhida; cadastros também podem permanecer abertos e, opcionalmente, limpar os campos, enquanto edições preservam sempre os dados atuais.

## Como funciona

1. `PostSubmitBehaviorProvider` é montado em `app/_layout.tsx` junto aos contextos globais do app.
2. As preferências são persistidas em AsyncStorage pela chave `@finances/post-submit-behavior`.
3. O padrão para todas as telas é `shouldReturnAfterSubmit = true`, com retorno para a Home (`/home?tab=0`).
4. `ScreenSettingsScreen.tsx` expõe a rota `/screen-settings`, acessível pela seção avançada de [[Configurações]] e pelo grupo Config do `navigator.tsx`.
5. `ScreenSettingsScreen.tsx` agrupa as opções em cards transparentes de lançamentos, planejamento, cadastros e edições; a busca por nome filtra as telas e cada accordion apresenta a ilustração contextual do formulário.
6. Cada configuração de **cadastro** permite:
   - ligar/desligar o retorno após salvar;
   - escolher a tela de retorno quando o retorno está ligado;
   - ligar/desligar limpeza dos campos apenas quando o retorno está desligado.
7. Cada configuração de **edição** permite ligar/desligar o retorno e escolher a tela de retorno quando ele está ativo. Edições não oferecem limpeza de campos e sempre preservam os dados carregados quando permanecem abertas.
8. `usePostSubmitBehavior(screenKey)` é chamado pelos formulários após feedback de sucesso. O parâmetro `isEditing` seleciona a preferência de edição; se o retorno está ligado, agenda o destino configurado para o próximo frame; em cadastro, se está desligado e a limpeza está ativa, chama o `resetForm` da tela.
9. Fluxos inline de categoria com `returnAfterCreate` têm precedência sobre a preferência global para preservar a seleção imediata da categoria recém-criada na tela de origem.
10. Antes de aplicar qualquer ação, o hook verifica se a tela continua focada. Uma requisição que terminar depois de o usuário sair da tela não pode redirecionar a rota atual nem limpar um formulário já desmontado.
11. O próximo frame permite que o `finally` do submit libere locks/loading e que o fechamento do teclado seja solicitado antes da transição. O orquestrador cancela redirects pendentes concorrentes e envia somente um `router.replace()` para o Expo Router.
12. Destinos desativados em [[Visibilidade de Rotas]] não aparecem no seletor. Se uma preferência persistida antiga ainda apontar para um deles, o hook retorna ao Dashboard para não solicitar uma rota protegida.

## Arquivos principais

- `contexts/PostSubmitBehaviorContext.tsx` — Estado global, defaults, opções de telas/destinos, modos de cadastro/edição e persistência compatível com a preferência legada.
- `hooks/usePostSubmitBehavior.ts` — Aplica a navegação ou limpeza configurada após sucesso e impede limpeza em edição.
- `contexts/RouteVisibilityContext.tsx` — Informa se o destino selecionado ainda pode ser acessado localmente.
- `screens/ScreenSettingsScreen.tsx` — UI de configuração por tela.
- `app/screen-settings.tsx` — Rota Expo Router da tela.
- `screens/ConfigurationsScreen.tsx` — Atalho em Configurações avançadas.
- `components/uiverse/navigator.tsx` — Item "Config. das telas" no grupo Config.
- `utils/navigation.ts` — Registro da rota `/screen-settings` e helpers serializados `redirectToRoute()`/`redirectToHomeTab()` usados pelo hook.

## Integrações

- [[Configurações]] — Entrada visual da nova tela e persistência de preferências do usuário.
- [[Navegação]] — Destinos usam `APP_ROUTE_PATHS`, `redirectToHomeTab()` e `redirectToRoute()`.
- [[Visibilidade de Rotas]] — Remove destinos desativados e fornece fallback seguro para preferências antigas.
- [[Transações de Despesas]] e [[Transações de Receitas]] — Despesas/receitas comuns passam a seguir a preferência após salvar.
- [[Despesas Fixas]] e [[Receitas Fixas]] — Templates obrigatórios seguem a preferência ao salvar, sem alterar a regra de criar transação real ao registrar o ciclo.
- [[Gerenciamento de Tags]] — Fluxos inline preservam retorno à origem; fluxos normais seguem a preferência global.

## Configuração

- Sem variáveis de ambiente.
- Defaults são locais ao dispositivo e entram em vigor antes da hidratação do AsyncStorage.

## Observações importantes

- Quando "Voltar após salvar" está ativo, "Limpar campos" fica desabilitado e é gravado como falso, porque a tela será deixada imediatamente.
- Ao desligar "Voltar após salvar" em um cadastro, a tela ativa "Limpar campos" por padrão para manter o comportamento anterior de formulários que permaneciam abertos.
- Edições usam uma preferência independente por tela e podem escolher qualquer destino suportado pela lista de retorno. A normalização da preferência e o hook forçam `shouldClearFieldsAfterSubmit = false` em edição, inclusive para dados persistidos antes desta regra.
- Preferências persistidas antes da separação são migradas em memória como configurações de cadastro; edições sem destino persistido continuam com o padrão de retorno para a Home.
- Destinos que precisam de parâmetros dinâmicos, como extrato de um banco específico, não entram na lista de retorno.
- Ao ocultar um destino já escolhido, a preferência pós-submit é preservada, mas a execução faz fallback para a Home até que o destino volte a ficar visível ou seja alterado.
- Não usar `router.back()` como pós-submit configurável; o hook centralizado evita histórico inválido e mantém a navegação alinhada com [[Navegação]].
- Não usar `dismissTo`, `dismissAll`, `withAnchor` nem combinações de duas ações como fallback. A política pós-submit é uma única ação `REPLACE`, validada em testes unitários e no bundle Android de produção.
- `replace` troca a rota atual sem reutilizar uma `Screen` antiga destacada pelo NativeStack. Ele pode manter uma entrada anterior equivalente no histórico; `/home` intercepta o botão físico para encerrar o app e impedir que essa entrada ou um formulário antigo reapareçam. Uma futura política de reset só deve substituir isso depois de validada em release.
