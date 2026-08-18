---
tags: [web, expo, firebase-hosting, responsivo, arquitetura, relatorios]
relacionado: [[Navegação]], [[Firebase Config]], [[Notificações]], [[Componentes UI]], [[Assistente Lumus]], [[Autenticação]]
status: ativo
tipo: arquitetura
versao: 1.3.0
---

# Versão Web

O Lumus Finanças é uma aplicação universal Expo: Android e navegador compartilham rotas, domínio financeiro, Firebase Auth, Firestore e o Assistente Lumus. A camada Web adapta somente os recursos cuja execução depende de APIs nativas.

## Como funciona

1. O Expo Router continua sendo o entry e exporta uma SPA em `dist/` com `web.output: "single"`.
2. O Firebase Hosting do projeto `finances-app-e8685` serve `dist/`, usa URLs limpas e reescreve rotas inexistentes para `index.html`; portanto links diretos protegidos, como `/home` e `/financial-list`, chegam ao guard normal do Router.
3. Em viewports a partir de 1024px, `navigator.web.tsx` mantém o `StaggeredMenu` fixo pela borda esquerda, sempre com as mesmas rotas, guards, rótulos contextuais e visibilidade do app. Fechado, o mesmo painel navy/amarelo é recortado a uma rail de 68px, mantendo o avatar do usuário; ao abrir, ele revela a largura completa numa única animação, preserva a sequência escalonada das camadas de abertura e mostra nome/e-mail no rodapé, sem substituir a rail por outra superfície. Ao fechar, a sequência é reproduzida de forma espelhada até o recorte reduzido. Abaixo desse ponto, a navegação inferior compacta e as telas existentes são preservadas; os dois formatos nunca aparecem juntos. `WebAppShell` mantém somente o workspace e não reserva uma coluna vazia para a navegação. Os helpers de navegação emitem um evento antes da troca, e o shell monta `WebRouteTransition` em portal DOM: um véu horizontal Motion revela a nova página em 320 ms, usando apenas opacidade/transformação, sem receber interação e sem executar se o navegador solicitar menos movimento.
4. A rota pública `/` não recebe `WebAppShell`: a partir de 768px, `LoginScreen` apresenta o painel de identidade em gradiente preenchendo integralmente a coluna esquerda, com o texto SVG animado **Finances**, na fonte padrão do sistema, centralizado sobre ele, e o conteúdo de acesso centralizado verticalmente na coluna direita, sem rolagem da página. Abaixo disso, a composição volta para uma coluna e conserva rolagem e comportamento de teclado do mobile.
5. `FirebaseConfig.web.ts` usa persistência em memória tanto no app primário como no secundário. O app secundário continua sendo o único usado para criar contas, sem deslogar o usuário principal.
6. Relatórios no navegador usam a janela de impressão para permitir salvar como PDF. Falha de pop-up é informada pelo feedback in-app; o fluxo nativo continua usando arquivo temporário e compartilhamento do sistema.
7. Lembretes financeiros agendados não existem na Web. O site mantém os dados de configuração e informa que a entrega acontece somente no aplicativo instalado; não tenta solicitar permissão nem criar canais/alarme. Feedbacks in-app, como o sucesso do login, aparecem como `Alert` do Mantine fixo no canto superior direito.
8. Formulários Web que reutilizam `useKeyboardAwareScroll()` não executam o scroll nativo do hook: `findNodeHandle` não é suportado por React Native Web e o navegador gerencia a visibilidade do campo focado. A tela de login também não encapsula o formulário em `TouchableWithoutFeedback`, para que o clique no `TextInput` não seja imediatamente cancelado por `Keyboard.dismiss()`.
9. Os campos do login Web suprimem o `ring` padrão da variante `outline` do Gluestack ao receber foco, mantendo somente a borda amarela definida pelo tema e evitando um contorno externo branco.
10. `HomeScreen.web.tsx` e `navigator.web.tsx` usam `Text` de React Native Web. O `Text` Gluestack específico do navegador é um `span` DOM e não deve receber arrays de estilo nem props de acessibilidade do React Native, pois elas não são normalizadas nesse limite.
11. `HomeScreen.web.tsx` porta a composição estética da Home nativa para o navegador, incluindo wallpaper, ilustração, cartões bancários, gráfico de investimentos, timeline expansível, ícones de tags e popovers. O wallpaper usa diretamente `Image` do React Native na variante Web porque o wrapper Gluestack `components/ui/image/index.web.tsx` redefine largura/altura com `revert-layer`, o que impede fundos absolutos de preencher o hero. A casca, hero e imagem do wallpaper declaram `100vw` na Web para não limitar o dashboard à largura intrínseca do asset; o `Grainient` fica em uma camada absoluta de largura total e da mesma altura do hero. A paleta clara usa somente amarelos para não criar um bloco escuro. A adaptação estrutural da navegação desktop usa a rail compacta e o painel expandido de `StaggeredMenu`; o carrossel nativo continua usando rolagem horizontal compatível com Web.
12. O resumo Web inclui `Sparkline` Mantine compacto ao lado dos totais mensais de ganhos e gastos. Cada curva recebe somente os três agregados mensais serializáveis do indicador correspondente; quando a privacidade está ativa, a tela envia uma linha neutra em vez dos valores reais. O gráfico detalhado `Gastos por dia` continua abaixo dos cards em um Expo DOM separado.
13. A distribuição de investimentos da Home Web usa `HomeInvestmentChart`, um Expo DOM Component com `DonutChart` do Mantine. Ele recebe apenas nome, valor em centavos, cor, quantidade de ativos e estado de privacidade; o tooltip formata valores em reais somente na borda visual e fica desativado quando os valores estão ocultos. Android/iOS continuam usando o gráfico nativo.
14. O resumo Web também inclui `Atividade no ano`, um Expo DOM Component com `Heatmap` Mantine. Ele recebe apenas as contagens diárias serializáveis de lançamentos financeiros confirmados e apresenta o ano-calendário completo, sem telemetria de interface.
14. Acima da timeline, `HomeScreen.web.tsx` mostra `Próximos compromissos` com duas colunas de itens obrigatórios pendentes. A busca compartilha `useHomeScreenData`; a Web não cria consultas, persistência ou lembretes próprios, e valores continuam mascarados por `useValueVisibility()`.
15. `AddRegisterExpensesScreen.web.tsx` é a composição Web da tela de controle: segue o mesmo shell fullscreen da Home, com hero absoluto de largura `100vw`, wallpaper `wallpaper01.png`, camada `Grainient`, título `StrokeText`, ilustração em `AnimatedContent` e um formulário em sheet sobreposto. A superfície do formulário usa uma única rolagem de página e reorganiza a grade abaixo de 1024px. Campos, seletores e botões continuam sendo primitivas React Native/Gluestack existentes, com labels acessíveis, foco amarelo do tema e comportamento de teclado do navegador.
16. O `ActionsheetContent` compartilhado limita a superfície Web a `1120px`, centralizada e fluida até esse limite; o backdrop continua cobrindo a viewport inteira. Os seletores compartilhados de banco e categoria usam toda a largura interna disponível no trigger e na lista. Na tela Web de despesas, o grupo de formato de pagamento usa `w-full max-w-[1120px] self-center`, acompanhando a largura útil da superfície principal sem ocupar a viewport inteira.
17. `AddRegisterExpensesScreen.web.tsx` consome `WEB_EXPENSE_CLASS_NAMES` retornado por `useScreenStyles()`, mantendo as classes estruturais do formulário no hook compartilhado, no mesmo padrão de `WEB_DASHBOARD_CLASS_NAMES` usado pela Home.
18. `AddRegisterGainScreen.web.tsx` reaproveita o mesmo shell hero/sheet, wallpaper, `Grainient`, `StrokeText`, `AnimatedContent`, rolagem única, grade responsiva e seletores Web da tela de despesas. A variante preserva a lógica nativa de ganhos: formatos de recebimento, categorias, templates/ganhos obrigatórios, resgates de investimento, valores em centavos e [[Comportamento Pós-Registro]].
19. As rotas de saldo mensal, transferência, saque, configurações, cadastros de usuário/banco/categoria, vínculo entre usuários e testes do aplicativo possuem pontos de entrada `.web.tsx`. Elas reutilizam a lógica canônica das respectivas telas e aplicam no navegador a mesma superfície hero/sheet fluida: hero com largura da viewport, `Grainient` amarelo sobre o wallpaper, título desenhado por `StrokeText`, ilustração SVG revelada por `AnimatedContent` com `width="40%"` e `height="100%"`, conteúdo centralizado até `1180px` e espaçamento responsivo. A animação usa o mesmo container `heroIllustrationAnimation` das telas-base de despesas e ganhos. A superfície externa do formulário permanece sem borda, como nas telas-base. Não há consultas, persistência ou regras financeiras exclusivas do navegador.
20. Os inputs de texto/número e textareas dessas telas reaproveitam `fieldContainerClassName` e `textareaContainerClassName` com variantes Web centralizadas em `useScreenStyles()`, igualando altura, raio, fundo transparente, padding e foco amarelo ao padrão de `AddRegisterExpensesScreen.web.tsx` e `AddRegisterGainScreen.web.tsx`, sem alterar o comportamento nativo.
21. Os `ScrollView`s que formam o sheet dessas nove telas recebem `web:relative web:z-[3]`, mantendo o formulário acima do hero absoluto e garantindo que o primeiro clique nos inputs chegue ao campo, como no sheet Web das telas-base.
22. As telas Web de saldo mensal, cadastro de usuário, banco, categoria e vínculo entre usuários usam `ScreenDismissKeyboard`: o wrapper vira `Fragment` no navegador para não disparar `Keyboard.dismiss()` no clique do `TextInput`; Android/iOS mantêm o dismiss nativo ao tocar fora.

## Arquivos principais

- `app.json` — declaração explícita de UI automática e output Web single.
- `firebase.json` e `.firebaserc` — Hosting, Functions, Firestore e projeto padrão.
- `components/uiverse/web-app-shell.tsx`, `components/uiverse/web-route-transition.web.tsx`, `components/uiverse/navigator.web.tsx` e `components/web/StaggeredMenu.jsx` — workspace, transição de rotas e navegação Web responsiva animada.
- `screens/HomeScreen.web.tsx` — dashboard Web específico, com dados do mesmo `useHomeScreenData`, sparklines Mantine compactos nos cards de ganhos/gastos, atalhos e layout em grade sem duplicar consultas Firebase.
- `screens/AddRegisterExpensesScreen.tsx` / `screens/AddRegisterExpensesScreen.web.tsx` — formulário de despesa por plataforma: lógica financeira preservada e composição Web fullscreen em hero/sheet com animação.
- `components/uiverse/screen-dismiss-keyboard.tsx` — wrapper de dismiss que preserva o foco dos inputs na Web e o comportamento de teclado nativo nas demais plataformas.
- `screens/AddRegisterGainScreen.tsx` / `screens/AddRegisterGainScreen.web.tsx` — formulário de ganho por plataforma: lógica financeira preservada e composição Web fullscreen em hero/sheet com animação.
- `screens/AddRegisterMonthlyBalanceScreen.web.tsx`, `TransferScreen.web.tsx`, `AddRescueScreen.web.tsx`, `ConfigurationsScreen.web.tsx`, `AddRegisterUserScreen.web.tsx`, `AddRegisterBankScreen.web.tsx`, `AddRegisterTagScreen.web.tsx`, `AddUserRelationScreen.web.tsx` e `AppTestsScreen.web.tsx` — entradas Web para as telas já compostas em hero/sheet, com geometria desktop responsiva sem duplicar os fluxos canônicos.
- `screens/LoginScreen.tsx` / `screens/LoginScreen.web.tsx` — entrada pública por plataforma: a tela mobile histórica fica em `LoginScreen.tsx`; a variante Web concentra o painel de identidade em gradiente e o formulário responsivo.
- `FirebaseConfig.web.ts` — Auth Web memory-only.
- `utils/reportExport.web.ts` / `.native.ts` e `utils/pdfFileName.web.ts` / `.native.ts` — exportação de relatórios por plataforma.
- `utils/platformCapabilities.ts` e `utils/notificationsRuntime.web.ts` — contrato explícito de lembretes indisponíveis no navegador.
- `components/uiverse/notifier-alert.web.tsx` — feedback in-app Web via Mantine em portal no `document.body`.
- `components/uiverse/notifier-boundary.web.tsx` — impede a montagem do wrapper nativo de notificações no navegador.
- `components/uiverse/web-screen-hero.tsx` / `.web.tsx` — cabeçalho compartilhado das telas Web: fallback nativo, wallpaper com `Grainient`, título `StrokeText` e animação da ilustração SVG com respeito a `prefers-reduced-motion` pelos componentes de animação existentes.
- `components/uiverse/home-expense-chart.tsx` — sparklines Web de tendências mensais em Expo DOM
- `components/uiverse/home-investment-chart.tsx` — donut Mantine Web da distribuição de investimentos em Expo DOM
- `components/uiverse/home-expense-line-chart.tsx` — gráfico Web de gastos diários em Expo DOM
- `components/uiverse/home-activity-heatmap.tsx` — heatmap Web de atividade financeira anual em Expo DOM

## Configuração externa obrigatória

Antes do primeiro deploy, incluir `finances-app-e8685.web.app`, `finances-app-e8685.firebaseapp.com` e cada domínio próprio futuro nos domínios autorizados do Firebase Authentication. Registrar esses mesmos hosts no provider reCAPTCHA Enterprise/App Check. App Check continua obrigatório apenas para Firebase AI Logic nesta etapa; o enforcement do Firestore não muda.

Os comandos locais são:

```bash
npm run web:export
npm run web:serve
npm run web:deploy:preview
npm run web:deploy
```

`web:deploy` altera o Hosting remoto e só deve ser executado após revisar a versão de preview. Nenhuma chave secreta pode ser adicionada às variáveis `EXPO_PUBLIC_*`.

## Observações importantes

- O `Grainient` do hero preserva um gradiente CSS sob o canvas WebGL2. Assim, navegadores sem WebGL2 continuam exibindo a superfície de marca em vez de revelar o fundo padrão; quando WebGL2 está disponível, a camada animada permanece ativa.
- O hero de `AddRegisterExpensesScreen.web.tsx`, montado dentro do `ScrollView`, declara o empilhamento do wallpaper, `Grainient`, conteúdo e sheet; não depender da ordem implícita dos filhos ao alterar essa composição.
- O hero da Home Web usa largura explícita total por `w-screen` (CSS `100vw`) e o `WebRouteTransition` usa viewport explícita (`100vw`/`100vh`); não substituir essas dimensões por `inset` ao alterar a animação, pois isso pode criar uma faixa lateral residual em alguns navegadores. O valor `100vw` deve ficar em classe NativeWind, não em `StyleProp` do React Native.
- `nativewind-env.d.ts` mantém a ponte de tipos entre NativeWind 4 e as interfaces concretas do React Native 0.81, incluindo as declarações globais de assets SVG/PNG/JPG. Não remover essa referência ao ajustar o toolchain TypeScript.

- Quando a consulta concluída da Home retorna uma carteira de investimentos vazia, `HomeScreen.web.tsx` não monta a seção de investimentos e centraliza os cartões bancários no desktop.
- A composição estrutural da Home Web usa classes Tailwind centralizadas em `hooks/useScreenStyle.ts`; não adicionar `StyleSheet.create()` nem duplicar geometria na tela. Valores de tema e dimensões calculadas continuam sendo fornecidos pelo hook em runtime.
- A tela de registro de despesas Web compartilha a geometria do hero/sheet da Home por `webDashboardClassNames`; somente a grade e os espaçamentos internos do formulário permanecem locais. Os tokens claro/escuro continuam vindo de `useScreenStyles()`. Não mover regras financeiras para o layout Web nem introduzir persistência específica do navegador.
- A tela de registro de ganhos Web segue a mesma geometria e `WEB_EXPENSE_CLASS_NAMES` da tela de despesas para manter paridade visual entre entradas e saídas; somente os textos, campos específicos e regras do formulário de ganhos diferem.

- Não criar Expo API Routes para o Lumus: Firebase AI Logic Web já recebe o App Check e o usuário autenticado pelo SDK cliente.
- As Functions existentes do razão financeiro permanecem inalteradas; esta entrega não cria API pública, modelo Firestore ou backend novo.
- Não mudar regras de centavos, operações Firestore, razão financeiro ou confirmação individual do assistente por causa do navegador.
- Áudio e microfone exigem contexto HTTPS fora do `localhost`; validar o Lumus IA em um preview hospedado antes de produção.
- `global.css` é processado pelo NativeWind com Tailwind CSS 3. Imports e utilitários próprios do shadcn/Tailwind 4 (como `border-border`) não são compatíveis nessa entrada e impedem a geração do bundle Web.
- Testar Chrome, Firefox e Safari, além do Android, após alterações de shell, Firebase ou adaptadores de plataforma.
