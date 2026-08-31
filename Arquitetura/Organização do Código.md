---
tags: [arquitetura, organizacao, expo, react-native, manutencao]
relacionado: [[MOC - Lumus Finanças]], [[Navegação]], [[Componentes UI]], [[Componentes por Sistema]], [[Versão Web]], [[Comportamento Pós-Registro]], [[Firebase Config]]
status: ativo
tipo: arquitetura
versao: 1.2.0
---

# Organização do Código

Este documento define as fronteiras de responsabilidade do Lumus Finanças. O objetivo é tornar uma mudança local fácil de localizar, sem mover regras financeiras entre camadas nem misturar dependências de Web e mobile no mesmo componente.

## Mapa de responsabilidades

| Área | Responsabilidade | Não deve conter |
|---|---|---|
| `app/` | Entradas do Expo Router, redirects e delegação para a tela correspondente | regras de negócio, acesso Firebase ou composição extensa de interface |
| `components/app/` | Composição global: providers, guard autenticado e ciclos de vida do aplicativo | telas de domínio ou cálculos financeiros |
| `components/web/` | Implementações exclusivas do navegador, separadas por sistema funcional | APIs nativas, regras financeiras ou acesso Firebase |
| `components/mobile/` | Implementações exclusivas de Android/iOS, separadas por sistema funcional | APIs DOM, regras financeiras ou acesso Firebase |
| `screens/mobile/` | Telas canônicas para Android/iOS, fluxos compartilhados e composição de estados | registro manual de rotas, providers globais ou duplicação de persistência |
| `screens/web/` | Composições Web que divergem por layout, dependência ou interação | regras financeiras novas, registro manual de rotas ou persistência específica do navegador |
| `components/uiverse/<sistema>/` | Componentes visuais e interações reutilizáveis do produto, separados por domínio | consultas Firestore específicas de uma tela |
| `components/ui/` | Primitivas geradas pelo Gluestack | componentes de domínio ou alterações manuais sem uma atualização coordenada do design system |
| `contexts/` | Estado transversal de sessão, tema, privacidade e preferências | operações de interface específicas de uma tela |
| `functions/` | Leitura e escrita Firebase e transformação do domínio junto da persistência | JSX ou navegação |
| `hooks/` | Estado e efeitos reutilizáveis de uma tela/domínio | renderização de layout grande |
| `utils/` | Funções determinísticas, adaptadores de plataforma e efeitos transversais pequenos | estado React ou acesso visual direto |

## Entrada e rotas

`index.ts` carrega `expo-router/entry`. O arquivo `app/_layout.tsx` permanece deliberadamente pequeno: importa os estilos e compatibilidades obrigatórias, inicializa os canais locais e delega a composição para `components/app/app-root.tsx`.

`AppRoot` concentra a ordem dos providers, `AuthenticatedStack`, o guard de visibilidade de rotas e a ponte de ciclo de vida das notificações. Dessa forma, mudanças de sessão, tema ou notificações não precisam procurar lógica espalhada nas rotas físicas.

Arquivos em `app/` são adaptadores de rota. `app/mobile/home.native.tsx` expõe `screens/mobile/HomeTabsScreen.tsx` em `/mobile/home`, enquanto `app/web/home.web.tsx` expõe `screens/web/HomeTabsScreen.web.tsx` em `/web/home`; a escolha entre Dashboard, Controle e Configurações pertence ao container da plataforma. Novas rotas continuam sendo cadastradas primeiro em `APP_ROUTE_PATHS` de [[Navegação]].

`app/` agora separa fisicamente as rotas em `app/web/` e `app/mobile/`. Como essas pastas são segmentos públicos do Expo Router, a separação também define `/web/...` e `/mobile/...`. Dentro de cada diretório, os pares `<rota>.web.tsx`/`<rota>.tsx` e `<rota>.native.tsx`/`<rota>.tsx` mantêm os fallbacks exigidos pelo Router. O inventário e as regras de manutenção ficam em `app/README.md`.

## Variantes por plataforma

Use um arquivo canônico em `screens/mobile/` quando lógica e composição forem realmente iguais nas duas plataformas ou quando a tela Web puder usar a adaptação responsiva já existente. Quando uma API, evento, animação ou primitiva divergir, mantenha o contrato e coloque a implementação Web em `screens/web/` e a canônica em `screens/mobile/`; os adaptadores de `app/` fazem a seleção explícita. Componentes reutilizáveis com divergência de plataforma ficam em `components/web/<sistema>/` e `components/mobile/<sistema>/`, enquanto `components/uiverse/<sistema>/` mantém somente os adaptadores lógicos.

Crie uma composição `.web.tsx` em `screens/web/` somente quando a experiência ou dependência realmente divergir — por exemplo, Home, Login, cadastros principais de despesas/ganhos e o fluxo Web de despesas obrigatórias. A tela canônica correspondente fica em `screens/mobile/`. A variante deve preservar o contrato da tela: valores em centavos, helpers de navegação, comportamento pós-submit e persistência continuam compartilhados.

As telas administrativas e financeiras de menor divergência (`AddRegisterMonthlyBalance`, `Transfer`, `AddRescue`, `Configurations`, cadastros de usuário/banco/categoria, vínculo e testes) usam a implementação canônica em `screens/mobile/`. Isso remove cópias quase idênticas e deixa a resolução de plataforma restrita às telas e componentes que de fato precisam dela.

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
