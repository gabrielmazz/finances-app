---
tags: [arquitetura, organizacao, expo, react-native, manutencao]
relacionado: [[MOC - Lumus Finanças]], [[Navegação]], [[Componentes UI]], [[Versão Web]], [[Comportamento Pós-Registro]], [[Firebase Config]]
status: ativo
tipo: arquitetura
versao: 1.0.0
---

# Organização do Código

Este documento define as fronteiras de responsabilidade do Lumus Finanças. O objetivo é tornar uma mudança local fácil de localizar, sem mover regras financeiras entre camadas nem criar variantes de plataforma por conveniência visual.

## Mapa de responsabilidades

| Área | Responsabilidade | Não deve conter |
|---|---|---|
| `app/` | Entradas do Expo Router, redirects e delegação para a tela correspondente | regras de negócio, acesso Firebase ou composição extensa de interface |
| `components/app/` | Composição global: providers, guard autenticado e ciclos de vida do aplicativo | telas de domínio ou cálculos financeiros |
| `screens/` | Orquestração de uma tela, estados locais e composição de componentes | registro manual de rotas, providers globais ou duplicação de persistência |
| `components/uiverse/` | Componentes visuais e interações reutilizáveis do produto | consultas Firestore específicas de uma tela |
| `components/ui/` | Primitivas geradas pelo Gluestack | alterações manuais sem uma atualização coordenada do design system |
| `contexts/` | Estado transversal de sessão, tema, privacidade e preferências | operações de interface específicas de uma tela |
| `functions/` | Leitura e escrita Firebase e transformação do domínio junto da persistência | JSX ou navegação |
| `hooks/` | Estado e efeitos reutilizáveis de uma tela/domínio | renderização de layout grande |
| `utils/` | Funções determinísticas, adaptadores de plataforma e efeitos transversais pequenos | estado React ou acesso visual direto |

## Entrada e rotas

`index.ts` carrega `expo-router/entry`. O arquivo `app/_layout.tsx` permanece deliberadamente pequeno: importa os estilos e compatibilidades obrigatórias, inicializa os canais locais e delega a composição para `components/app/app-root.tsx`.

`AppRoot` concentra a ordem dos providers, `AuthenticatedStack`, o guard de visibilidade de rotas e a ponte de ciclo de vida das notificações. Dessa forma, mudanças de sessão, tema ou notificações não precisam procurar lógica espalhada nas rotas físicas.

Arquivos em `app/` são adaptadores de rota. Por exemplo, `app/home.tsx` apenas expõe `screens/HomeTabsScreen.tsx`; a escolha entre Dashboard, Controle e Configurações pertence à tela, não ao registro do Expo Router. Novas rotas continuam sendo cadastradas primeiro em `APP_ROUTE_PATHS` de [[Navegação]].

## Variantes por plataforma

Use o arquivo canônico `.tsx` quando lógica e composição são as mesmas. Ajustes puramente responsivos pertencem a classes `web:` ou a componentes com resolução de plataforma, como `WebScreenHero` e `ScreenDismissKeyboard`.

Crie `.web.tsx` somente quando a experiência realmente divergir — por exemplo, Home, Login, cadastros principais de despesas/ganhos e o fluxo Web de despesas obrigatórias. A variante deve preservar o contrato da tela: valores em centavos, helpers de navegação, comportamento pós-submit e persistência continuam compartilhados.

As nove telas administrativas e financeiras de menor divergência (`AddRegisterMonthlyBalance`, `Transfer`, `AddRescue`, `Configurations`, cadastros de usuário/banco/categoria, vínculo e testes) usam agora a implementação canônica. Isso remove cópias quase idênticas e deixa a resolução de plataforma restrita aos componentes que de fato precisam dela.

## Fluxos transversais

- Navegação: `utils/navigation.ts` é o contrato de paths, abas e transições. Interfaces chamam seus helpers; não montam strings de rota soltas.
- Logout: `utils/secureLogout.ts` contém a limpeza confirmada de lembretes, a saída Firebase e o feedback. As variantes nativa e Web do navigator só disparam essa rotina, evitando diferenças de segurança entre plataformas.
- Notificações: o bootstrap fica em `app/_layout.tsx`; a sincronização por usuário fica na ponte de `AppRoot`. Telas não devem recriar esse ciclo.
- Persistência: telas compõem o fluxo, mas devem preferir funções e hooks existentes. Um acesso Firebase direto novo precisa ser justificado pela fronteira do domínio e documentado no módulo correspondente.

## Como evoluir telas grandes

Não faça uma reescrita horizontal de telas financeiras. Ao modificar uma tela grande, extraia apenas uma unidade coesa por vez: formatador, seletor, bloco visual ou hook de estado. Preserve o contrato público da tela e valide os fluxos de edição, retorno e valores em centavos antes de seguir para a próxima extração.

Uma extração é apropriada quando reduz duplicação real, permite teste isolado ou torna uma regra mais explícita. Não extraia JSX de uso único apenas para reduzir o tamanho do arquivo.

## Critério de conclusão

Toda mudança estrutural deve manter os fluxos financeiros, rodar as validações proporcionais e atualizar este vault quando alterar uma fronteira. O projeto expõe `npm run typecheck`, `npm run typecheck:backend`, `npm run test -- --runInBand` e `npm run check` para a verificação básica. Para alterações de plataforma, validar ao menos o export Web e Android; para comportamento, rodar a suíte de testes e verificar o diff sem erros de whitespace.
