---
tags: [navegacao, configuracoes, preferencias, rotas]
relacionado: [[Navegação]], [[Configurações]], [[Comportamento Pós-Registro]], [[Assistente Lumus]]
status: ativo
tipo: feature
versao: 1.0.4
---

# Visibilidade de Rotas

Preferência local que permite ocultar telas configuráveis neste aparelho. Todas começam visíveis, exceto **Anotações** e **Testes do aplicativo**, que começam ocultas; a escolha não é enviada ao Firebase nem depende do usuário autenticado.

## Como funciona

1. `RouteVisibilityProvider`, montado no root layout, persiste o estado em AsyncStorage pela chave `@finances/route-visibility` e preenche chaves ausentes com seu default: visível para as rotas de produto e oculto para Anotações e Testes do aplicativo.
2. `ScreenSettingsScreen.tsx` mostra o switch **Mostrar no app** em cada configuração de formulário. Configurações de cadastro e edição da mesma tela compartilham a mesma visibilidade.
3. Telas sem comportamento pós-salvamento próprio, como **Lumus IA**, **Anotações** e **Testes do aplicativo**, têm accordions ilustrados com resumo de acesso e o switch no conteúdo expandido. Anotações é a exceção deliberada ao default visível: começa oculta por estar em desenvolvimento, usa o switch **Em desenvolvimento** e mostra um modal de aviso ao ser liberada para teste. Testes do aplicativo também começa oculto, usa o switch normal **Mostrar no app** e concentra ações manuais sem escrita direta: notificação imediata no canal existente, diagnóstico do Lumus e rascunhos que o usuário ainda precisa salvar no formulário.
4. `navigator.tsx` remove as opções desativadas antes de montar seus menus.
5. `app/_layout.tsx` usa `Stack.Protected` para cada rota configurável. Assim, uma tela oculta não pode ser aberta por link direto, deep link ou navegação programática.
6. `/home?tab=1`, que renderiza o cadastro de despesa inline, redireciona para o Dashboard quando o cadastro de despesa estiver oculto.
7. Se uma preferência antiga de [[Comportamento Pós-Registro]] apontar para uma tela que foi ocultada, o pós-submit retorna ao Dashboard em vez de tentar abrir uma rota protegida.

## Arquivos principais

- `contexts/RouteVisibilityContext.tsx` — Estado, defaults e persistência local.
- `screens/ScreenSettingsScreen.tsx` — Switches da configuração por tela, do Lumus, das Anotações e dos Testes do aplicativo.
- `components/uiverse/navigator.tsx` — Filtra destinos ocultos nos menus.
- `app/_layout.tsx` — Guard de acesso real por `Stack.Protected`.
- `app/home.tsx` — Protege o atalho inline de Controle.
- `utils/navigation.ts` — Mapeia chaves de visibilidade para caminhos de rota.
- `hooks/usePostSubmitBehavior.ts` — Faz fallback seguro depois de salvar.

## Observações importantes

- Ocultar não apaga a rota física nem seus dados; apenas remove o acesso neste dispositivo. Para Anotações e Testes do aplicativo, o valor inicial oculto é intencional até que o usuário libere a tela neste aparelho.
- A preferência é local ao aparelho e permanece válida após trocar de conta.
- Uma rota configurável nova deve ser registrada em `ROUTE_VISIBILITY_PATHS`, receber opção no navigator quando aplicável, aparecer em `ScreenSettingsScreen.tsx` e ser coberta por `Stack.Protected`.
