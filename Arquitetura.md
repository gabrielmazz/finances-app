# Arquitetura.md — Lumus Finanças

> Guia operacional para este projeto.
> Leia este arquivo **inteiro** antes de qualquer alteração.

---

## Vault de Documentação

**Localização da Documentação:** `/programacao/finances-app/Arquitetura`

O vault é a **fonte de verdade** do projeto. Toda feature, decisão arquitetural e regra de negócio está documentada lá. Antes de implementar qualquer coisa, consulte o arquivo relevante no vault.

- Lembre-se, o vault da arquitetura está interconectado um com o outro, por exemplo, dentro do Arquivo MOC - Lumus Finanças.md tem links para os arquivos de cada módulo ([[Autenticação]], sendo assim o formato de identificar um arquivo conectado), e dentro de cada módulo tem links para os arquivos relacionados. Isso é para garantir que você tenha uma visão completa do contexto antes de fazer qualquer alteração.

### Mapa do Vault por Tipo de Tarefa

| Tarefa | Arquivo no Vault |
|---|---|
| Entender o projeto todo | `MOC - Lumus Finanças.md` |
| Trabalhar em autenticação | `Autenticação.md`, `Segurança de Login.md` |
| Trabalhar no dashboard | `Dashboard Home.md`, `Previsão de Fluxo de Caixa.md`, `Hooks Customizados.md` |
| Trabalhar em previsão de caixa | `Previsão de Fluxo de Caixa.md`, `Balanço Mensal.md`, `Despesas Fixas.md`, `Receitas Fixas.md`, `Investimentos.md` |
| Trabalhar em bancos | `Gerenciamento de Bancos.md`, `Balanço Mensal.md` |
| Trabalhar em transações | `Transações de Despesas.md`, `Transações de Receitas.md` |
| Trabalhar em análise por categoria | `Análise por Categoria.md`, `Gerenciamento de Tags.md`, `Gerenciamento de Bancos.md` |
| Trabalhar em transferências | `Transferências.md`, `Resgate de Caixa.md` |
| Trabalhar em investimentos | `Investimentos.md` |
| Trabalhar em recorrências | `Despesas Fixas.md`, `Receitas Fixas.md` |
| Trabalhar em tags | `Gerenciamento de Tags.md` |
| Trabalhar em usuários | `Gerenciamento de Usuários.md` |
| Trabalhar em navegação/rotas | `Navegação.md` |
| Trabalhar em componentes | `Componentes UI.md` |
| Trabalhar em temas/estilos | `Sistema de Temas.md`, `Hooks Customizados.md` |
| Trabalhar em notificações | `Notificações.md` |
| Configurar Firebase | `Firebase Config.md` |
| Trabalhar na versão Web ou Hosting | `Versão Web.md`, `Navegação.md`, `Firebase Config.md`, `Notificações.md`, `Componentes UI.md` |
| Trabalhar no assistente/IA/voz | `Assistente Lumus.md`, `Firebase Config.md`, `Privacidade de Valores.md` |

---

## Protocolo Obrigatório

### ANTES de qualquer alteração

1. Leia o arquivo de vault relevante para a tarefa (tabela acima)
2. Se a feature não estiver documentada, pergunte ao usuário antes de implementar
3. Verifique as **Regras Críticas** abaixo

### DEPOIS de qualquer alteração

1. Se a mudança afeta comportamento, fluxo ou arquitetura → **atualize o arquivo correspondente no vault**
2. Se a mudança cria um novo módulo/feature → **crie um novo arquivo no vault** seguindo o padrão abaixo
3. Se a mudança torna alguma documentação desatualizada → **corrija o vault**

### Padrão de Documentação no Vault

Todo novo arquivo `.md` no vault deve seguir este formato:

```markdown
---
tags: [categorias relevantes]
relacionado: [[Arquivos conectados]]
status: ativo
tipo: feature | arquitetura | decisão | endpoint | componente
versao: 1.0.0
---

# Nome da Feature

Descrição clara do que faz e por que existe.

## Como funciona
Fluxo completo com referência aos módulos envolvidos.

## Arquivos principais
Lista dos arquivos de código relevantes.

## Integrações
Quais outros módulos essa feature aciona ou depende.

## Configuração
Variáveis de ambiente, flags, repositórios envolvidos.

## Observações importantes
Edge cases, limitações conhecidas, decisões não-óbvias.
```

Use `[[wiki-links]]` para conectar arquivos relacionados. Nome dos arquivos em PascalCase com espaços (ex: `Sistema de Pagamentos.md`).

---

## Arquitetura do Projeto

```
Expo Router (file-based routing) — app/
    ↓
Screens — screens/
    ↓
Services/Functions — services/ + functions/
    ↓
Firebase (Auth + Firestore + AI Logic)
```

### Stack

| Camada | Tecnologia |
|---|---|
| Framework | Expo ~54 / React Native 0.81 |
| Routing | Expo Router ~6 (file-based) |
| Web | React Native Web + export estático Expo em `dist/` |
| Hosting Web | Firebase Hosting do projeto `finances-app-e8685` |
| Backend | Firebase 12.16 (Auth + Firestore + AI Logic web) |
| IA Android | React Native Firebase 25.1 (AI + App Check + Remote Config) |
| Design System | Gluestack UI + NativeWind (Tailwind) |
| Linguagem | TypeScript 5.9 (strict mode) |
| React | 19.1.0 |

### Estrutura de Pastas

```
app/           → Rotas Expo Router (1 arquivo = 1 rota)
screens/       → Componentes de tela (lógica + UI)
functions/     → Operações Firebase Firestore
backend/       → Firebase Functions confiáveis do razão financeiro
components/
  ui/          → Primitivos Gluestack UI
  uiverse/     → Componentes customizados do domínio
contexts/      → AuthContext, ThemeContext, ValueVisibilityContext
services/      → Gateways, comandos e relatórios do Assistente Lumus
hooks/         → useHomeScreenData, useScreenStyle
utils/         → Utilitários (segurança, notificações, cálculos)
types/         → TypeScript declarations
assets/        → Fontes, imagens, SVGs
```

### Fluxo de Dados

```
Firebase Auth → AuthContext → _layout.tsx (guard)
                                   ↓
                            HomeScreen
                                   ↓
                       useHomeScreenData(personId)
                                   ↓
                         HomeFirebase.ts (agrega)
                                   ↓
              [BankFirebase, ExpenseFirebase, GainFirebase,
               FinancesFirebase, MonthlyBalanceFirebase]
```

### Firebase — Dois Apps

O projeto usa **dois apps Firebase** inicializados:
- **Primário** (`auth`, `db`): sessão atual + todas as queries Firestore
- **Secundário** (`secondaryApp`, `secondaryAuth`): exclusivamente para criar novos usuários sem deslogar o usuário atual

No Android/iOS, o app secundário usa o armazenamento seguro temporário documentado em [[Firebase Config]]. No navegador, os dois apps usam persistência somente em memória: recarregar, fechar a aba ou encerrar o navegador exige novo login.

---

## Regras para atualização do Vault (NÃO IGNORAR)

1. **Toda mudança de comportamento, fluxo ou arquitetura deve ser refletida no vault.**
2. **Se a mudança afeta uma feature existente, atualize o arquivo correspondente dentro do vault.**
3. **Se a mudança cria um novo módulo ou feature, crie um novo arquivo no vault seguindo o padrão estabelecido.**
4. **Se a mudança torna alguma documentação existente desatualizada, corrija o vault imediatamente.**

## Regra para atualização de arquivos de código

1. **Antes de implementar, consulte o arquivo relevante no vault para entender o contexto completo.**
2. **Se a feature ou comportamento que você vai alterar não estiver documentado, pergunte ao usuário antes de implementar.**
3. **Após implementar, revise o vault para garantir que a documentação esteja alinhada com as mudanças feitas.**
4. **Evite mudanças que não estejam alinhadas com o que está documentado no vault sem antes atualizar a documentação.**
5. **Dentro do código, use comentários para referenciar o arquivo do vault quando fizer algo que tenha uma regra ou fluxo específico documentado.**
    - Exemplo: `// Esta função segue a regra X documentada em [[Regras Críticas]] no vault`
    - Evite código "mágico" sem referência à documentação.
    - Se o arquivo estiver sem nenhum comentários explicativos são ainda mais importantes para manter a clareza, ou seja, será adicionado esse comentário
6. Se caso encontre funções ou trechos de código desnecessarios, retire-os para manter o código limpo, mas antes de retirar, verifique se não há nenhuma regra ou fluxo documentado no vault que dependa desse código. Se houver, atualize o vault para refletir a remoção do código e as mudanças no comportamento ou fluxo.


## Regras Críticas

### Valores Monetários
- **SEMPRE** armazenar e operar em **centavos** (integers)
- Nunca usar float para valores financeiros
- Converter para reais apenas na camada de exibição

### Tipos de Transação
- `expense` / `gain` → transações reais (entram nos totais)
- `transfer_out` / `transfer_in` → par de transferência (excluídos dos totais)
- `investment_deposit` / `investment_redemption` → par de investimento (excluídos dos totais)
- A exclusão é feita por `shouldIncludeMovementInGainExpenseTotals()` em `utils/monthlyBalance.ts`
- Violar esta regra gera **dupla contagem** no dashboard

### Estilos
- **Nunca** escrever estilos dark/light diretamente nas telas
- **Sempre** usar `useScreenStyle()` para estilos adaptativos
- Classes Tailwind montadas dinamicamente devem ter todas as variantes literais visíveis ao scanner ou entrar na `safelist` de `tailwind.config.js`

### Componentes Gluestack
- **Nunca** editar arquivos em `components/ui/` manualmente sem cautela — são gerados pelo CLI do Gluestack
- Componentes customizados do domínio ficam em `components/uiverse/`

### Autenticação
- **Nunca** usar o app Firebase primário para criar usuários — usar `secondaryApp` / `secondaryAuth`
- Criar usuário com o app primário **desloga** o usuário atual

### Recorrências (Despesas/Receitas Fixas)
- Chave de ciclo no formato `YYYY-MM` via `getCycleKeyFromDate()`
- Marcar como pago/recebido **cria uma transação real** no Firestore — não é apenas uma flag

### Saldo de Bancos

- **Transição segura do razão:** antes do corte do grupo, o saldo ainda depende do MonthlyBalance legado. Depois do corte, financialAccounts unifica banco, Caixa e investimento, com saldo em centavos verificável pela última reconciliação e pelos eventos posteriores.
- Caixa é único e compartilhado pelo grupo, e nunca pode ficar negativo. Banco pode ficar negativo somente com justificativa auditável.
- Lançamento confirmado não é apagado: corrigir significa estornar e criar outro lançamento.
- O corte é aditivo e por grupo. Antes dele, exportar Firestore e regras implantadas, executar a migração em dry-run, resolver pendências e só então habilitar o grupo.

- Saldo = último `MonthlyBalance` snapshot + movimentos posteriores
- Sem snapshot → saldo parte de zero
- Ao criar um banco novo, **deve-se registrar um MonthlyBalance inicial**

### Notificações locais
- `expo-notifications` é o único motor nativo; não reintroduzir Notifee, handler `DELIVERED` ou um segundo agendador
- Android usa os canais versionados `payment-reminders-v1` e `income-reminders-v1`, criados no bootstrap
- Despesas usam schema `reminderConfigVersion: 1`, antecedência cumulativa D-1/D-2/D-3 e D0 opcional; documentos legados ficam opt-out até o usuário salvar a nova configuração
- O motor agenda datas concretas depois de resolver dia 29/30/31 e dias úteis; Android mantém horizonte móvel de seis meses e reconcilia a agenda ao abrir as listas/voltar ao foreground
- Toda agenda financeira é escopada por UID. Troca de conta e logout explícito limpam o UID anterior; o estado `user=null` de uma abertura fria não apaga alarmes porque a autenticação primária é memory-only
- Marcar o ciclo como pago/recebido cancela imediatamente os avisos restantes daquele `YYYY-MM`
- Não solicitar `USE_EXACT_ALARM` nem `SCHEDULE_EXACT_ALARM`; o horário é preferido e pode sofrer atraso por Doze/economia de bateria
- Notificações são locais (sem servidor) — reinstalar app as apaga
- Expo Go serve somente para smoke test local. Validar canais, segundo plano e aceite em development client e build de produção instalados
- Alterações em plugin, manifesto ou dependência nativa exigem novo build
- O navegador não solicita permissão, não cria canal e não agenda lembretes; a UI deve informar que essa capacidade existe somente no aplicativo instalado

### Assistente Lumus
- Firebase AI Logic interpreta e propõe ações; o modelo nunca recebe ferramenta de escrita no Firestore
- Toda escrita exige botão de confirmação individual no cartão; texto/voz dizendo “sim” não executa
- IDs reais, UID, e-mail, tokens e configuração Firebase nunca entram no prompt; usar somente handles temporários
- Handles usam salt aleatório, ficam estáveis durante a sessão e são renovados ao limpar a conversa, trocar UID ou sair
- Valores permanecem em centavos e datas usam `America/Sao_Paulo`
- Conversa/rascunhos vivem apenas em memória durante o UID autenticado; consentimento e leitura automática são as únicas preferências persistidas
- App Check é obrigatório para AI Logic. Nesta etapa, não ativar enforcement para Firestore Android
- Android usa debug provider apenas em development e Play Integrity em produção; Expo Go não suporta esta feature
- Cota gratuita ou indisponibilidade interrompe somente o assistente, sem fallback pago e sem gravação automática

---

## Variáveis de Ambiente

```env
EXPO_PUBLIC_FIREBASE_API_KEY=
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=
EXPO_PUBLIC_FIREBASE_PROJECT_ID=
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
EXPO_PUBLIC_FIREBASE_APP_ID=
EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID=
EXPO_PUBLIC_FIREBASE_APP_CHECK_RECAPTCHA_ENTERPRISE_KEY=
EXPO_PUBLIC_FIREBASE_APP_CHECK_ANDROID_PROVIDER=debug
EXPO_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN=
# Caminho/secret de arquivo usado pelo EAS, nunca commitar o JSON:
GOOGLE_SERVICES_JSON=
```

> Prefixo `EXPO_PUBLIC_` = exposto no bundle. Não colocar secrets aqui.

---

## Active Context

- Separação das variantes Web em 2026-08-18: as nove telas administrativas e financeiras convertidas agora possuem implementação completa nos respectivos arquivos `.web.tsx`, resolvidos automaticamente pelo Expo para o navegador. As telas `.tsx` nativas voltaram a concentrar somente a composição Android/iOS; lógica Firebase, valores em centavos, navegação e comportamento pós-submit continuam compartilhados por plataforma. A auditoria confirmou que nenhum arquivo de `app/` está órfão: cada entrada é uma rota do `APP_ROUTE_PATHS`, do guard central ou uma compatibilidade legada documentada. Vault alinhado em [[Versão Web]] e [[Navegação]].

- Correção do foco dos cadastros Web em 2026-08-18: `AddRegisterMonthlyBalanceScreen`, `AddRegisterUserScreen`, `AddRegisterBankScreen`, `AddRegisterTagScreen` e `AddUserRelationScreen` passaram a usar `ScreenDismissKeyboard`, que não monta `TouchableWithoutFeedback` no navegador. Assim o clique chega ao `TextInput` e o foco permanece ativo; Android/iOS continuam dispensando o teclado ao tocar fora do formulário. Vault alinhado em [[Versão Web]], [[Componentes UI]] e [[Hooks Customizados]].

- Gráfico de distribuição de investimentos na Home Web em 2026-08-18: `HomeScreen.web.tsx` passou a usar `HomeInvestmentChart` em Expo DOM com `DonutChart` do Mantine, mantendo a carteira, cores e privacidade existentes e removendo a dependência do `react-native-gifted-charts` nessa variante. Android/iOS permanecem usando o gráfico nativo. Vault alinhado em [[Dashboard Home]], [[Componentes UI]] e [[Versão Web]].

- Padronização dos inputs Web em 2026-08-18: `useScreenStyles()` passou a aplicar variantes Web de altura, raio, fundo, padding e foco amarelo em `fieldContainerClassName` e `textareaContainerClassName`. Assim os campos textuais/númericos e textareas das nove telas convertidas acompanham `AddRegisterExpensesScreen.web.tsx` e `AddRegisterGainScreen.web.tsx`, enquanto Android/iOS permanecem com a geometria mobile. Vault alinhado em [[Versão Web]], [[Hooks Customizados]] e [[Componentes UI]].
- Atualizado em 2026-08-18.

- Correção de foco dos inputs Web em 2026-08-18: os `ScrollView`s das nove telas convertidas passaram a declarar `web:relative web:z-[3]`, igualando o empilhamento do sheet de `AddRegisterExpensesScreen.web.tsx` e impedindo que o hero absoluto intercepte o primeiro clique dos campos. O comportamento nativo permanece inalterado. Vault alinhado em [[Versão Web]] e [[Componentes UI]].
- Atualizado em 2026-08-18.

- Refinamento visual das telas Web em 2026-08-18: `components/uiverse/web-screen-hero.tsx` e sua variante Web centralizam wallpaper, `Grainient`, título `StrokeText` e entrada animada das ilustrações SVG nas nove telas convertidas. Android/iOS continuam usando o fallback nativo do mesmo componente; a borda externa adicionada à superfície dos formulários foi removida. Vault alinhado em [[Versão Web]] e [[Componentes UI]].
- Atualizado em 2026-08-18.

- Padronização das ilustrações Web em 2026-08-18: `WebScreenHero.web.tsx` passou a reutilizar `WEB_DASHBOARD_CLASS_NAMES.heroIllustrationAnimation` e o mesmo dimensionamento das telas-base, com `width="40%"` e `height="100%"` para todas as ilustrações. Os overrides menores de configurações e categorias foram removidos; Android/iOS permanecem inalterados. Vault alinhado em [[Versão Web]], [[Dashboard Home]] e [[Componentes UI]].
- Atualizado em 2026-08-18.

- Conversão da sequência de telas administrativas e financeiras para Web em 2026-08-18: saldo mensal, transferência, saque, configurações, cadastros de usuário/banco/categoria, vínculo entre usuários e testes do aplicativo ganharam entradas `.web.tsx`. As telas canônicas passaram a aplicar somente no navegador a casca hero/sheet responsiva, com largura de viewport e conteúdo centralizado; persistência Firebase, valores em centavos, comportamento pós-submit e rotas permanecem compartilhados. A auditoria do diretório `app/` confirmou que todas as rotas físicas ainda estão registradas no caminho central, navigator ou guard, portanto nenhuma rota foi removida sem alterar funcionalidade. Vault alinhado em [[Versão Web]] e [[Navegação]].
- Atualizado em 2026-08-18.

- Conversão do cadastro de ganhos para Web em 2026-08-17: `screens/AddRegisterGainScreen.web.tsx` passou a reutilizar o shell hero/sheet, wallpaper, `Grainient`, `StrokeText`, `AnimatedContent`, rolagem única, grade responsiva e ActionSheets estabelecidos por `AddRegisterExpensesScreen.web.tsx`. A lógica nativa de ganhos permanece responsável por centavos, formatos de recebimento, categorias, templates/ganhos obrigatórios, resgates de investimento e comportamento pós-submit; Android/iOS continuam usando `AddRegisterGainScreen.tsx`. Vault alinhado em [[Versão Web]], [[Transações de Receitas]] e [[Componentes UI]].
- Atualizado em 2026-08-17.

- Tipagem da composição Web corrigida em 2026-08-17: `nativewind-env.d.ts` agora estende as interfaces concretas do React Native 0.81 para que `className` seja reconhecido em `View`, `Text`, `Image`, `ScrollView` e `KeyboardAvoidingView`, além de referenciar as declarações de assets SVG/PNG. `HomeScreen.web.tsx` e `AddRegisterExpensesScreen.web.tsx` deixaram de passar `100vw` em `StyleProp`; a mesma largura de viewport permanece via `w-screen` centralizado em `WEB_DASHBOARD_CLASS_NAMES`. O layout e os fluxos financeiros não mudaram. Vault alinhado em [[Versão Web]], [[Componentes UI]] e [[Hooks Customizados]].
- Atualizado em 2026-08-17.

- Correção do wallpaper da tela de despesas Web em 2026-08-17: `AddRegisterExpensesScreen.web.tsx` passou a declarar o posicionamento relativo do canvas e as camadas do hero (`RNImage`, `Grainient`, conteúdo e sheet), além de alinhar a opacidade do `Grainient` ao hero da Home. O formulário e o fluxo financeiro permanecem inalterados. Vault alinhado em [[Versão Web]] e [[Transações de Despesas]].
- Atualizado em 2026-08-17.

- Correção da camada visual da Home Web em 2026-08-17: `Grainient` passou a preservar um gradiente CSS sob o canvas e a recusar o fallback incompatível para WebGL1 quando WebGL2 não está disponível; a opacidade do overlay do hero voltou a `0.62` para manter o efeito legível sobre o wallpaper. Vault alinhado em [[Versão Web]] e [[Componentes UI]].
- Atualizado em 2026-08-17.

- Correção geral da tela de registro de despesas para Web em 2026-08-17: `screens/AddRegisterExpensesScreen.web.tsx` passou a seguir o mesmo padrão fullscreen da Home, com hero absoluto de largura `100vw`, wallpaper amarelo, Grainient, título `StrokeText`, ilustração em `AnimatedContent` e formulário em sheet sobreposto com uma única rolagem de página. A variante mantém a lógica nativa para cadastro/edição, valores em centavos, pagamento em dinheiro ou banco, categorias, templates, gastos obrigatórios, ajuste de investimento e [[Comportamento Pós-Registro]]. Android/iOS continuam usando `AddRegisterExpensesScreen.tsx`; vault alinhado em [[Versão Web]] e [[Transações de Despesas]].
- Atualizado em 2026-08-17.

- Correção do carregamento de investimentos da Home em 2026-08-16: a consulta legada ganhou o índice composto de `financeInvestments` (`personId` + `createdAt`) que faltava e fazia Web/Android exibirem “Não foi possível carregar os investimentos.”; grupos migrados passaram a montar a carteira a partir das contas `financialAccounts` com `kind: 'investment'`, usando o saldo confirmado sem projeção CDI legada. Vault alinhado em [[Dashboard Home]].

- Correção da largura do wallpaper da Home Web em 2026-08-16: a imagem `RNImage` tinha dimensão intrínseca de 1600 px e deixava o fundo do shell visível à direita em viewports maiores. A casca, hero e imagem agora usam largura de viewport (`100vw`), enquanto o `Grainient` permanece sobre a área inteira do hero. A paleta clara substituiu o stop marrom por amarelo. `Grainient` nos detalhes expandidos da timeline permanece inalterado. Vault alinhado em [[Versão Web]] e [[Componentes UI]].
- Atualizado em 2026-08-16.

- Correção da camada escura sobre o wallpaper Web em 2026-08-16: `StaggeredMenu` passou a fixar `left/right` inline no painel e nos prelayers conforme `position="left"`, evitando que a camada navy de largura do menu apareça no lado direito durante a montagem/retorno de rotas. O wallpaper permanece independente da navegação. Vault alinhado em [[Navegação]], [[Versão Web]] e [[Componentes UI]].
- Atualizado em 2026-08-16.

- Correção do recorte lateral no wallpaper Web em 2026-08-16: o véu `WebRouteTransition` passou a usar `top/left` e `100vw/100vh` explícitos, evitando uma faixa escura residual por cálculo de `inset`/transform no DOM. O hero da Home Web também declara largura total (`w-full`) para manter imagem e Grainient alinhados à viewport. Vault alinhado em [[Versão Web]], [[Navegação]] e [[Componentes UI]].
- Atualizado em 2026-08-16.

- Seed do emulador corrigido em 2026-08-16: `backend/scripts/seed.ts` agora grava os dados de demonstração nas coleções reais `expenses` e `gains`, usando `name`/`valueInCents` e categorias `both`; antes gravava uma coleção legada `finances`, que não era lida pelas telas atuais. O comando continua restrito ao Firebase Emulator e valida as quantidades criadas.
- As datas do seed usam o mês corrente no momento da execução, em vez de uma data fixa, para que despesas e ganhos apareçam nos filtros do mês atual.
- O seed também cria dois `MonthlyBalance` do mês corrente e quatro templates em `mandatoryExpenses`/`mandatoryGains`: um mensal sem parcelas e um parcelado para cada tipo, sempre pendentes para o usuário testar o registro real pelo fluxo da lista.
- O seed inclui ainda um investimento CDI, aporte excluído dos totais, transferência entre os dois bancos e saque para caixa físico em `cashRescues`; esses movimentos são demonstrativos e permanecem no mês corrente.
- O seed cria 15 despesas obrigatórias pendentes, distribuídas em vários dias do mês corrente, incluindo vencimentos repetidos no mesmo dia para exercitar a listagem e o calendário.
- Atualizado em 2026-08-16.

- Transições de rota na Web em 2026-08-16: `WebAppShell` monta `WebRouteTransition` somente no workspace autenticado. A variante `.web.tsx` usa `motion/react` em portal DOM para revelar cada novo pathname com um véu horizontal de 320 ms, sem tocar no `Stack`, nos guards ou no histórico do Expo Router; respeita `prefers-reduced-motion` e não captura ponteiros. Vault alinhado em [[Navegação]], [[Versão Web]] e [[Componentes UI]].
- Atualizado em 2026-08-16.

- Centralização dos estilos estruturais da Home Web em 2026-08-16: `HomeScreen.web.tsx` removeu o `StyleSheet.create()` local e passou a consumir `WEB_DASHBOARD_CLASS_NAMES`/`WEB_DASHBOARD_DOM_STYLES` de `hooks/useScreenStyle.ts`, usando Tailwind para geometria fixa e preservando `webDashboardPalette`/dimensões calculadas somente como valores de runtime. `BankCardSurface` aceita `className` para o layout externo. Vault alinhado em [[Dashboard Home]], [[Hooks Customizados]], [[Componentes UI]], [[Sistema de Temas]] e [[Versão Web]].
- Atualizado em 2026-08-16.

- Ocultação da seção de investimentos na Home em 2026-08-16: `HomeScreen.tsx` e `HomeScreen.web.tsx` agora montam a seção somente durante carregamento, erro ou quando há investimentos confirmados. Quando a carteira carregada está vazia, a seção desaparece; na Web desktop, os cartões bancários ficam centralizados. Vault alinhado em [[Dashboard Home]] e [[Versão Web]].
- Atualizado em 2026-08-16.

- Correção de consultas de bancos e categorias em 2026-08-16: `getAllBanksFirebase()` e `getAllTagsFirebase()` preservam as fachadas públicas, mas deixaram de fazer varreduras sem filtro. As duas funções agora usam o UID autenticado e usuários relacionados, alinhando as queries às Firestore Rules (`resource.data.personId`) e evitando `Property personId is undefined` no Emulator e em produção. Vault alinhado em [[Gerenciamento de Bancos]] e [[Gerenciamento de Tags]].
- Atualizado em 2026-08-16.

- Alinhamento de leituras legacy às Rules em 2026-08-16: despesas, ganhos, referências de categorias, investimentos e listagem de usuários deixaram de consultar coleções inteiras no cliente. As fachadas públicas preservadas usam o UID autenticado/relacionados; consultas com dois filtros ganharam índices compostos versionados. Nenhum deploy de Rules, índices ou código foi executado nesta etapa.
- Atualizado em 2026-08-16.

- Segunda etapa de leituras em 2026-08-15: previsão passou a limitar movimentos à janela histórica/horizonte e a atividade de investimentos à janela padrão de seis meses. O backend materializa `financeMonthlySummaries` na mesma transação do razão e expõe `rebuildFinancialReadModels` paginado, idempotente por mês e limitado ao grupo do administrador autenticado; regras, índice e teste de acesso do modelo foram preparados para Emulator Suite. Vault alinhado em [[Cache e Leituras Firebase]].
- Atualizado em 2026-08-15.

- Otimização de leituras Firebase em 2026-08-15: `FinanceDataProvider` cria um `QueryClient` isolado por UID, com TTL de 10 minutos, deduplicação, auditoria de reads e persistência serializada por AsyncStorage/localStorage. A Home deixou `useFocusEffect`, compartilhando uma única query entre Web e mobile; o switch **Confiar neste dispositivo** começa desligado e só persiste valores financeiros com consentimento, removendo-os no logout/desligamento. O saldo legado da Home agora busca um snapshot por banco e movimentos posteriores em lote, em vez de reler cinco coleções históricas para cada banco. Vault alinhado em [[Cache e Leituras Firebase]], [[Dashboard Home]] e [[Hooks Customizados]].
- Atualizado em 2026-08-15.

- Correção do carregamento do resumo da Home em 2026-08-14: `firestore.rules` passou a cobrir `tags`, `mandatoryExpenses`, `mandatoryGains` e `financeInvestmentSyncs` com o mesmo escopo de usuário/relacionamentos do legado. `loadUpcomingMandatoryItems()` agora trata compromissos como dados auxiliares, evitando que uma falha nessa leitura derrube saldos, totais, histórico e atividade. Vault alinhado em [[Dashboard Home]], [[Hooks Customizados]], [[Firebase Config]] e [[Versão Web]].
- Atualizado em 2026-08-14.

- Próximos compromissos obrigatórios na Home Web em 2026-08-14: `HomeFirebase.ts` agrega os ciclos pendentes de `mandatoryExpenses` e `mandatoryGains` para grupos legados e migrados; `utils/homeMandatorySchedule.ts` resolve a próxima ocorrência com dias úteis/feriados, parcelas ativas e ciclos `YYYY-MM`, e `HomeScreen.web.tsx` exibe até três itens por coluna acima de últimas movimentações, respeitando a máscara de valores. Efetivar o ciclo continua nos fluxos oficiais de [[Despesas Fixas]] e [[Receitas Fixas]]. Vault alinhado em [[Dashboard Home]], [[Hooks Customizados]] e [[Versão Web]].
- Atualizado em 2026-08-14.

- Heatmap de atividade anual na Home Web em 2026-08-14: `HomeScreen.web.tsx` agora exibe um `Heatmap` Mantine em Expo DOM com a intensidade de lançamentos financeiros confirmados por dia do ano atual. O snapshot conta uma transação do razão uma vez e, no legado, ignora a perna de entrada das transferências para não duplicar a ação; não há telemetria nova. Vault alinhado em [[Dashboard Home]], [[Componentes UI]] e [[Versão Web]].
- Atualizado em 2026-08-14.

- Sparklines de tendência na Home Web em 2026-08-14: os cards de **Total ganho** e **Total gasto** agora exibem, ao lado do resumo, `Sparkline` Mantine em Expo DOM com os totais dos três últimos meses. A curva usa ganhos no primeiro card e despesas no segundo; o modo de privacidade troca os dados por uma linha neutra, sem revelar proporções. O gráfico detalhado **Gastos por dia** permanece abaixo dos cards em um componente separado. O snapshot mantém a mesma regra de centavos/exclusões da Home nos caminhos legado e do razão financeiro. Vault alinhado em [[Dashboard Home]], [[Componentes UI]] e [[Versão Web]].
- Atualizado em 2026-08-14.

- Fundo dinâmico nos detalhes da timeline Web em 2026-08-14: `HomeScreen.web.tsx` substituiu a cor sólida dos accordions de últimas movimentações pelo `Grainient`, usando três stops derivados da paleta de cada tipo de lançamento. O canvas continua sendo montado somente para detalhes expandidos, com o conteúdo em camada superior; Android/iOS permanecem inalterados. Vault alinhado em [[Dashboard Home]], [[Componentes UI]] e [[Versão Web]].
- Atualizado em 2026-08-14.
- Fechamento animado dos detalhes da timeline Web em 2026-08-14: `AnimatedContent` agora aceita `visible` e executa a saída antes do detalhe ser desmontado. `HomeScreen.web.tsx` mantém o card renderizado durante a animação e remove-o no callback final; reabrir durante a saída interrompe o fechamento e restaura a entrada. Vault alinhado em [[Dashboard Home]] e [[Componentes UI]].
- Atualizado em 2026-08-14.
- Cantos completos dos detalhes da timeline Web em 2026-08-14: o card de últimas movimentações explicita os raios superior e inferior direitos, garantindo que o recorte do `Grainient` acompanhe os quatro cantos da superfície. Android/iOS permanecem inalterados. Vault alinhado em [[Dashboard Home]] e [[Componentes UI]].
- Atualizado em 2026-08-14.
- Recorte do canvas nos detalhes da timeline Web em 2026-08-14: o wrapper `AnimatedContent`, a camada absoluta e a instância contextual do `Grainient` compartilham o recorte arredondado, evitando que o WebGL cubra os cantos direitos do card. Vault alinhado em [[Dashboard Home]] e [[Componentes UI]].
- Atualizado em 2026-08-14.
- Largura dos detalhes da timeline Web em 2026-08-14: o recuo lateral do painel foi removido e o wrapper passa a ocupar 100% do `timelineBody`, preservando os quatro cantos arredondados sem vão até o fim da coluna. Android/iOS permanecem inalterados. Vault alinhado em [[Dashboard Home]] e [[Componentes UI]].
- Atualizado em 2026-08-14.
- Preenchimento do Grainient nos detalhes da timeline Web em 2026-08-14: o container contextual e o canvas WebGL usam `position: absolute` com `inset: 0`, além de dimensões mínimas explícitas, para ocupar toda a superfície do card sem depender do tamanho intrínseco do canvas. Android/iOS permanecem inalterados. Vault alinhado em [[Dashboard Home]], [[Componentes UI]] e [[Versão Web]].
- Atualizado em 2026-08-14.
- Estabilidade dos cantos na animação da timeline Web em 2026-08-14: o detalhe deixa de aplicar escala na entrada e na saída; `AnimatedContent` mantém a escala de saída configurável para preservar o comportamento de outros usos, enquanto o card usa apenas deslocamento e opacidade. Assim o recorte do Grainient não é rasterizado em tamanhos diferentes a cada abertura. Android/iOS permanecem inalterados. Vault alinhado em [[Dashboard Home]] e [[Componentes UI]].
- Atualizado em 2026-08-14.
- Entrada animada dos detalhes da timeline Web em 2026-08-14: o `AnimatedContent` passou a aceitar `trigger="mount"`; ao abrir uma movimentação, o detalhe entra com deslocamento curto para baixo, opacidade e escala suaves, sem animar propriedades de layout. A preferência `prefers-reduced-motion` desativa a transição. Vault alinhado em [[Dashboard Home]] e [[Componentes UI]].
- Atualizado em 2026-08-14.

- Correção da seleção na rail Web em 2026-08-14: no `StaggeredMenu` reduzido, os rótulos ocultos saem do fluxo de layout e os itens ativos, em foco ou sob o ponteiro mantêm a largura de 68px e a mesma altura do painel aberto; a expansão continua restrita ao painel aberto, com retorno animado da seleção ao fechar sem limitar a interpolação da largura. A troca de rota preserva o painel aberto entre as remontagens do Navigator, e somente a instância mais recente responde aos eventos globais de fechamento. Vault alinhado em [[Navegação]] e [[Componentes UI]].
- Nome cadastrado no perfil Web em 2026-08-14: o rodapé do `StaggeredMenu` busca o campo `name` persistido para mostrar o nome completo acima do e-mail, com fallback para `displayName` e inicial quando a leitura ainda não estiver disponível. Vault alinhado em [[Navegação]], [[Versão Web]] e [[Componentes UI]].
- Perfil do usuário na navegação Web em 2026-08-14: o painel expandido do `StaggeredMenu` agora reserva o rodapé para avatar, nome e e-mail do usuário autenticado, usando `photoURL` com fallback para inicial. No estado reduzido, somente o avatar permanece visível; os textos entram junto com a expansão. Vault alinhado em [[Navegação]], [[Versão Web]] e [[Componentes UI]].
- Entrada dinâmica dos rótulos da navegação Web em 2026-08-14: no `StaggeredMenu` reduzido, os textos das opções agora entram com opacidade e deslocamento horizontal sincronizados à expansão do mesmo painel, e saem suavemente antes do recorte voltar a 68px. Vault alinhado em [[Navegação]], [[Versão Web]] e [[Componentes UI]].
- Fechamento reverso da navegação Web em 2026-08-14: o `StaggeredMenu` agora usa uma timeline espelhada da abertura para retornar do painel expandido ao estado reduzido. Camadas, recorte de 68px, conteúdo social e painel respeitam os mesmos tempos e easing, mantendo a transição contínua e sem saltos. Vault alinhado em [[Navegação]], [[Versão Web]] e [[Componentes UI]].
- Expansão contínua da navegação Web em 2026-08-14: a rail e o painel do `StaggeredMenu` foram unificados em um único `aside`. Fechado, o mesmo painel é recortado a 68px e mostra apenas os ícones; ao abrir ou fechar, o recorte revela ou recolhe a largura completa sem montar, ocultar ou sobrepor um segundo componente. A sequência original das camadas coloridas foi preservada atrás da expansão, e os ícones preservam o mesmo DOM, dimensão e coordenadas nos dois estados. Vault alinhado em [[Navegação]], [[Versão Web]] e [[Componentes UI]].
- Crossfade da abertura do menu Web em 2026-08-14: o painel expandido e a rail reduzida agora começam a transição no mesmo instante. A rail permanece visível no início, sai somente após o painel já ter avançado 30% e retorna antes do fim da saída do painel, eliminando o intervalo em que a rail desaparecia antes do `StaggeredMenu` aparecer. Vault alinhado em [[Navegação]], [[Versão Web]] e [[Componentes UI]].
> Atualizado em 2026-08-14.

- Transição unificada do menu Web em 2026-08-14: a rail reduzida e o painel expandido agora participam da mesma timeline GSAP. Ao abrir, a rail desliza 15% para a esquerda e desaparece enquanto o painel entra; ao fechar, a rail retorna em paralelo à saída do painel. O modo `prefers-reduced-motion` mantém a troca instantânea. Vault alinhado em [[Navegação]], [[Versão Web]] e [[Componentes UI]].
> Atualizado em 2026-08-14.

- Microajuste da régua vertical do menu Web em 2026-08-14: a lista do painel expandido sobe 2px para coincidir com os centros dos itens da rail reduzida, sem mover o cabeçalho ou o controle de fechamento. Vault alinhado em [[Navegação]], [[Versão Web]] e [[Componentes UI]].
> Atualizado em 2026-08-14.

- Alinhamento entre estados do menu Web em 2026-08-14: a rail reduzida e o painel expandido agora compartilham a mesma régua vertical para o topo, altura de seção, espaçamento entre grupos e tamanho de item/ícone. O destino ativo mantém a mesma área visual nos dois estados. Vault alinhado em [[Navegação]], [[Versão Web]] e [[Componentes UI]].
> Atualizado em 2026-08-14.

- Remoção do ícone de marca da rail Web em 2026-08-14: a sidebar reduzida não exibe mais o `WalletCards` no topo; o espaço foi devolvido ao eixo da navegação e o botão de abertura continua no cabeçalho. O painel expandido e os ícones das rotas permanecem inalterados. Vault alinhado em [[Navegação]], [[Versão Web]] e [[Componentes UI]].
> Atualizado em 2026-08-14.

- Ajuste visual e sobreposição da navegação Web em 2026-08-14: a rail reduzida do `StaggeredMenu` agora usa o mesmo navy/amarelo do painel expandido. Ao abrir o painel, a rail e seus ponteiros ficam ocultos; o botão de fechar permanece no cabeçalho do menu. Vault alinhado em [[Navegação]], [[Versão Web]] e [[Componentes UI]].
> Atualizado em 2026-08-14.

- Rail fixa do menu Web em 2026-08-14: `StaggeredMenu` agora pode renderizar uma sidebar desktop compacta de 68px, fixa à esquerda, com os ícones dos mesmos itens reais do `navigator.web.tsx`. O item ativo recebe destaque, os links preservam acessibilidade/tooltip e o botão superior continua abrindo o painel expandido. Abaixo de 1024px, a navegação Web compacta existente permanece inalterada. Vault alinhado em [[Navegação]], [[Versão Web]] e [[Componentes UI]].
> Atualizado em 2026-08-14.

- Desativação reversível de bancos em 2026-08-14: `ConfigurationsScreen.tsx` agora carrega bancos ativos e inativos na tabela administrativa e oferece confirmação para desativar/reativar, preservando o documento e o histórico. `updateBankStatusFirebase()` mantém `isActive`; os seletores operacionais continuam filtrando bancos inativos. Vault alinhado em [[Gerenciamento de Bancos]] e [[Configurações]].
- Limite do ActionSheet Web em 2026-08-18: `components/ui/actionsheet/index.tsx` passou a limitar o `ActionsheetContent` a `1120px`, centralizado e fluido até esse limite, mantendo o backdrop em viewport inteira. Bancos, categorias e rádios permanecem fluidos dentro da superfície útil; Android/iOS não recebem essa regra. Vault alinhado em [[Componentes UI]] e [[Versão Web]].
- Centralização dos estilos do cadastro Web em 2026-08-17: `AddRegisterExpensesScreen.web.tsx` deixou de declarar o mapa local `webStyles` e passou a consumir `WEB_EXPENSE_CLASS_NAMES` retornado por `useScreenStyles()`, seguindo o padrão já usado pela Home Web. A lógica e a composição nativa permanecem inalteradas. Vault alinhado em [[Versão Web]], [[Hooks Customizados]] e [[Sistema de Temas]].
> Atualizado em 2026-08-14.

- Migração visual parcial para Tailwind na Web em 2026-08-14: `LoginScreen.web.tsx` removeu o `StyleSheet.create()` da composição principal e passou a usar classes NativeWind para os layouts responsivo, painel de identidade e formulário; tokens de tema e dimensões medidas continuam em runtime. A lógica de autenticação e a composição nativa permanecem inalteradas.
> Atualizado em 2026-08-14.

- Push remoto para recorrências compartilhadas em 2026-08-14: builds instaladas registram um Expo Push Token privado por aparelho; Functions confiáveis observam `mandatoryExpenses` e `mandatoryGains` e notificam o dono e `relatedIdUsers` sem expor tokens entre usuários. A central de testes chama o mesmo envio por **Testar dispositivos vinculados**. Vault alinhado em [[Notificações]], [[Despesas Fixas]] e [[Receitas Fixas]].
> Atualizado em 2026-08-14.

- Quitação de parcelas com desconto em 2026-08-14: `settleMandatoryExpenseFirebase()` passou a aceitar o valor efetivamente pago informado no formulário, mesmo quando diferente da soma teórica das parcelas restantes. A transação continua validando a existência do parcelamento e de parcelas pendentes antes de criar a despesa e remover o template atomicamente. Vault alinhado em [[Despesas Fixas]] e [[Transações de Despesas]].
> Atualizado em 2026-08-14.

- Correção de consistência de saldos em 2026-08-13: `calculateLegacyBankBalanceInCents()` centraliza o saldo legado no último snapshot de abertura mais os movimentos posteriores, usando somente a aplicação inicial (nunca rendimento/sincronização) como saída bancária. Home, transferência, saque, novo investimento e Assistente Lumus usam essa mesma regra; transferências saem dos totais de ganhos/gastos, escritas legadas passam a exigir centavos inteiros e a Home lê `financialAccounts` após o corte do grupo. Cobertura adicionada em `monthlyBalance.test.ts`. Vault alinhado em [[Balanço Mensal]] e [[Dashboard Home]].
> Atualizado em 2026-08-13.

- Resumo mensal na Home Web em 2026-08-13: `HomeScreen.web.tsx` exibe dois cards entre contas/investimentos e as últimas movimentações, com o total de ganhos e gastos do mês atual. Os valores são derivados dos agregados mensais existentes por banco e dinheiro, permanecem em centavos até a formatação e respeitam a privacidade e os tokens de tema. Vault alinhado em [[Dashboard Home]].
> Atualizado em 2026-08-13.

- Direção da saída do alerta Web em 2026-08-13: `AnimatedContent` ganhou `disappearReverse` para separar a direção de entrada da direção de saída; o alerta entra pela direita e também retorna para a direita antes de desmontar. Os usos existentes preservam o comportamento anterior por padrão. Vault alinhado em [[Notificações]] e [[Componentes UI]].
> Atualizado em 2026-08-13.

- Saída animada do alerta Web em 2026-08-13: `AnimatedContent` agora usa `disappearAfter` e `onDisappearanceComplete` para executar o retorno horizontal antes de desmontar o `Alert`; o timer direto foi removido para não cortar a animação. Vault alinhado em [[Notificações]] e [[Componentes UI]].
> Atualizado em 2026-08-13.

- Animação do alerta Web em 2026-08-13: `notifier-alert.web.tsx` envolve o `Alert` Mantine com `components/web/AnimatedContent.jsx`, usando entrada horizontal de 300px pela direita, duração de 1s, `power3.out` e opacidade inicial zero. O wrapper nativo e os fluxos Android/iOS permanecem inalterados. Vault alinhado em [[Notificações]] e [[Componentes UI]].
> Atualizado em 2026-08-13.

- Feedback in-app Web corrigido em 2026-08-13: `notifier-alert.web.tsx` agora renderiza o `Alert` do Mantine diretamente em um portal do `document.body`, compartilhando a árvore React onde `showNotifierAlert()` dispara os eventos. `notifier-boundary.web.tsx` impede o `react-native-notifier` de montar no navegador; Android/iOS preservam o wrapper nativo e o sucesso do login não exige alterações individuais. Vault alinhado em [[Notificações]], [[Componentes UI]] e [[Versão Web]].
> Atualizado em 2026-08-13.

- Correção de compilação da Home Web em 2026-08-13: a família tipográfica do `StrokeText` passou a usar uma expressão JSX válida, preservando a pilha de fontes do hero e eliminando o erro de parsing causado por aspas escapadas em atributo JSX. Vault alinhado em [[Dashboard Home]] e [[Versão Web]].
> Atualizado em 2026-08-13.

- Integração Mantine em 2026-08-13: Mantine permanece restrito a componentes Web, como os gráficos em `components/uiverse/` e o alerta Web-only. Os gráficos usam Expo DOM (`'use dom'`); o alerta usa portal para compartilhar a árvore React Native com o disparo global. Telas e componentes nativos continuam usando Gluestack/NativeWind, sem imports Mantine em arquivos nativos.

- Efeito de entrada do título da Home Web em 2026-08-13: `HomeScreen.web.tsx` usa `components/web/StrokeText.jsx` com `trigger="mount"` para desenhar o título do hero, mantendo a ilustração com `AnimatedContent` e Android/iOS inalterados. Vault alinhado em [[Dashboard Home]] e [[Componentes UI]].
> Atualizado em 2026-08-13.

- Animação da ilustração sobre o wallpaper da Home Web em 2026-08-13: `HomeScreen.web.tsx` envolve `homeScreen.svg` com `components/web/AnimatedContent.jsx`, usando entrada vertical de 300px, duração de 1s, opacidade inicial zero e `power3.out`. O wallpaper permanece estático e Android/iOS permanecem inalterados. Vault alinhado em [[Dashboard Home]] e [[Componentes UI]].
> Atualizado em 2026-08-13.

- Camada visual do wallpaper da Home Web em 2026-08-13: `HomeScreen.web.tsx` mantém `wallpaper01.png` como base e aplica `components/web/Grainient.jsx` por cima do hero, com paleta adaptada ao tema e granulação sutil. Android/iOS permanecem inalterados. Vault alinhado em [[Dashboard Home]], [[Versão Web]] e [[Componentes UI]].
> Atualizado em 2026-08-13.

- Ajuste visual da Home em 2026-08-13: os skeletons do carrossel e do gráfico de investimentos usam a largura real da coluna e offsets explícitos; o skeleton do carrossel espelha a hierarquia real do card e suas margens laterais, enquanto os placeholders mantêm cantos arredondados proporcionais às barras de conteúdo. O `PieChart` também preserva a centralização e a área de toque. Vault alinhado em [[Dashboard Home]] e [[Componentes UI]].
> Atualizado em 2026-08-13.

- Redesign do carrossel de contas na Home Web em 2026-08-13: `components/web/Carousel.jsx` agora aceita `renderItem`, e `HomeScreen.web.tsx` usa essa base do React Bits para exibir todos os bancos e o cartão de Dinheiro com a mesma coleção, privacidade, saldos em centavos na origem e navegação para movimentos. Android/iOS permanecem com o carrossel nativo existente. Vault alinhado em [[Dashboard Home]] e [[Componentes UI]].
> Atualizado em 2026-08-13.

- Correção do wallpaper da Home Web em 2026-08-13: `HomeScreen.web.tsx` usa `Image` do React Native diretamente para o background absoluto do hero. O wrapper Gluestack Web redefine `width`/`height` como `revert-layer`, fazendo a imagem aparecer apenas no tamanho intrínseco no canto superior esquerdo; o componente compartilhado foi preservado sem alteração. TypeScript, export Web e detector visual foram validados. Vault alinhado em [[Versão Web]] e [[Dashboard Home]].
> Atualizado em 2026-08-13.

- Portabilidade visual da Home para Web em 2026-08-13: `HomeScreen.web.tsx` passa a reproduzir a estética de `HomeScreen.tsx`, com wallpaper, ilustração, cartões `BankCardSurface`, distribuição de investimentos, timeline vertical expansível, ícones de tags, tooltips/popovers e modal de saldo mensal pendente. A rolagem horizontal substitui somente o carrossel nativo; hooks, rotas, privacidade, estados e `Navigator` permanecem. `StaggeredMenu.jsx` não foi alterado. Vault alinhado em [[Dashboard Home]], [[Versão Web]] e [[Componentes UI]].
> Atualizado em 2026-08-13.

- Quitação antecipada de despesas parceladas em 2026-08-13: `MandatoryExpensesListScreen.tsx` oferece a ação **Quitar parcelas** somente para parcelamentos ativos, calcula o saldo restante em centavos e reutiliza o formulário de despesa para escolha do banco. `settleMandatoryExpenseFirebase()` cria a despesa agregada e remove o template atomicamente; a lista deixa de exibir o item após a conclusão. Cobertura adicionada em `mandatoryInstallments.test.ts`. Vault alinhado em [[Despesas Fixas]] e [[Transações de Despesas]].
> Atualizado em 2026-08-13.

- Navegação e Dashboard Web renovados em 2026-08-12: `navigator.web.tsx` substitui a sidebar fixa por `StaggeredMenu` Lumus com as mesmas rotas, filtros de visibilidade, item contextual de movimentos, rótulos de cadastro e logout seguro. Os ícones substituem a numeração do componente original. `HomeScreen.web.tsx` usa o mesmo `useHomeScreenData` do dashboard nativo para exibir saldo, ações rápidas, contas, movimentos e investimentos, mantendo centavos até a formatação e privacidade de valores. `WebAppShell` deixa de reservar espaço lateral permanente. Vault alinhado em [[Navegação]], [[Versão Web]], [[Dashboard Home]] e [[Componentes UI]].

- Compatibilidade do dashboard Web corrigida em 2026-08-12: as variantes Web de `HomeScreen` e `navigator` usam o `Text` de React Native Web para normalizar arrays de estilo, `numberOfLines` e semântica de acessibilidade antes de alcançar o DOM. O primitivo Gluestack `components/ui/text/index.web.tsx` produz um `span` DOM direto e não deve receber props/arrays próprios de React Native nessas telas. Vault alinhado em [[Versão Web]] e [[Componentes UI]].
> Atualizado em 2026-08-12.

- Identidade do Login Web atualizada em 2026-08-12: a imagem rasterizada foi substituída por `StrokeText`, renderizando o texto SVG animado **Finances** sobre o painel de gradiente. O componente usa a fonte padrão do sistema por padrão. Vault alinhado em [[Autenticação]] e [[Versão Web]].
> Atualizado em 2026-08-12.

- Contorno dos inputs no Login Web corrigido em 2026-08-12: `LoginScreen.web.tsx` suprime o `web:ring-1` padrão do Gluestack no foco, preservando somente a borda amarela do tema e eliminando o segundo contorno branco. Vault alinhado em [[Versão Web]].
> Atualizado em 2026-08-12.

- Correção do foco de login Web em 2026-08-12: `useKeyboardAwareScroll()` deixa de executar `findNodeHandle` e as rechecagens de rolagem nativa no navegador, eliminando o erro ao focar email ou senha em `LoginScreen.web.tsx`. A tela Web também removeu o `TouchableWithoutFeedback` que cancelava o foco pelo `Keyboard.dismiss()` do clique. Android e iOS preservam o comportamento de teclado existente. Vault alinhado em [[Hooks Customizados]] e [[Versão Web]].
> Atualizado em 2026-08-12.

- Escala da logo do Login Web refinada em 2026-08-12: a logo centralizada ocupa 66% da largura no painel em duas colunas e 62% no layout compacto, preservando a proporção sem corte. Vault alinhado em [[Autenticação]].
> Atualizado em 2026-08-12.

- Logo do Login Web ajustada em 2026-08-12: `LogoUpscale.png` usa `resizeMode="contain"` e `aspectRatio` baseado no próprio asset, impedindo corte em qualquer dimensão do painel de identidade. Vault alinhado em [[Autenticação]].
> Atualizado em 2026-08-12.

- Rolagem do Login Web corrigida em 2026-08-12: na composição em duas colunas (a partir de 768px), `LoginScreen.web.tsx` desabilita o `ScrollView`, remove o padding inferior reservado ao teclado e não monta o pull-to-refresh. Em largura menor, esses comportamentos seguem ativos para o formulário móvel. Vault alinhado em [[Autenticação]] e [[Versão Web]].
> Atualizado em 2026-08-12.

- Identidade do Login Web atualizada em 2026-08-12: a logo branca Lumus é exibida sobre o `Grainient`, centralizada no painel esquerdo e sem comprometer o preenchimento integral do gradiente. Vault alinhado em [[Autenticação]] e [[Versão Web]].
> Atualizado em 2026-08-12.

- Login Web refinado em 2026-08-12: o contêiner do `Grainient` agora ocupa toda a altura da coluna esquerda, sem a limitação fixa de 600px. Na coluna direita, o bloco de acesso (título e campos) fica centralizado verticalmente, enquanto os créditos continuam no rodapé. Vault alinhado em [[Autenticação]] e [[Versão Web]].
> Atualizado em 2026-08-12.

- Regressão da tela mobile de Login corrigida em 2026-08-12: `screens/LoginScreen.tsx` foi restaurada integralmente, preservando wallpaper, logos por tema, card sobreposto e comportamento de teclado do Android/iOS. `screens/LoginScreen.web.tsx` permanece a implementação exclusiva do navegador; não há terceiro arquivo `.native.tsx`. Vault alinhado em [[Autenticação]], [[Componentes UI]] e [[Sistema de Temas]].
> Atualizado em 2026-08-12.

- Compilação Web reparada em 2026-08-12: a entrada `global.css` voltou a conter apenas CSS compatível com NativeWind/Tailwind CSS 3. Imports do shadcn/Tailwind 4 e as utilidades correspondentes travavam a transformação CSS do Metro em 99,9%; `npx expo export --platform web` voltou a concluir e gerar `dist/`. Vault alinhado em [[Versão Web]].
> Atualizado em 2026-08-12.

- Tela de Login organizada por plataforma em 2026-08-12: `screens/LoginScreen.tsx` e `screens/LoginScreen.web.tsx` concentram a interface e preservam autenticação Firebase, validação, throttle, pull-to-refresh e feedback existentes. A Web mantém o formulário em duas colunas a partir de 768px e, em telas menores, os blocos se empilham sem comprometer o teclado; Android/iOS preservam a composição original com wallpaper, logo por tema e card sobreposto. As duas implementações dispensam WebGL, canvas, `ogl` e WebView. Vault alinhado em [[Autenticação]], [[Componentes UI]], [[Sistema de Temas]] e [[Versão Web]].
> Atualizado em 2026-08-12.

- Versão Web com Firebase Hosting em 2026-08-11: o Expo Router continua compartilhando rotas, regras financeiras e guards, mas agora exporta a SPA em `dist/` (`web.output: "single"`) para o projeto `finances-app-e8685`. O Hosting usa URL limpa e rewrite para `index.html`, preservando deep links como `/home` e `/financial-list`. Em 1024px ou mais, `WebAppShell` reserva a área da sidebar fixa renderizada pelo `navigator`; abaixo disso, a barra inferior mobile permanece. `FirebaseConfig.web.ts` deixa os dois apps Auth somente em memória, relatórios usam a janela de impressão/PDF do navegador e lembretes agendados ficam indisponíveis sem pedir permissão. Antes da publicação remota, cadastrar os domínios do Hosting no Firebase Authentication e no reCAPTCHA Enterprise/App Check. Vault alinhado em [[Versão Web]], [[Navegação]], [[Firebase Config]], [[Notificações]] e [[Componentes UI]].
> Atualizado em 2026-08-11.

- Categorias contextuais em 2026-08-11: `AddRegisterTagScreen.tsx` agora cria categorias com os presets legíveis de disponibilidade, nome, ícone opcional e preview, sem expor `usageType` nem switches técnicos. A criação normal oferece os mesmos oito objetivos da edição, incluindo todas as despesas e todos os ganhos; os atalhos inline preservam o `placement` da tela de origem para garantir o retorno com seleção automática. `categoryAvailability.ts` centraliza os mapeamentos para o schema Firestore atual e combinações legadas são preservadas como uso personalizado até uma escolha explícita. Configurações abre o seletor completo, resume e filtra categorias pelos quatro destinos, edita por `tagId` e bloqueia exclusão quando houver referências em lançamentos ou recorrências, revalidando antes de remover. O título e a descrição de cada opção do seletor compartilham o mesmo eixo de leitura. Cobertura Jest adicionada para disponibilidade e segurança de referências; vault alinhado em [[Gerenciamento de Tags]], [[Configurações]] e [[Navegação]].
> Atualizado em 2026-08-11.

- Núcleo bancário/caixa em transição segura em 2026-08-11: utils/financialLedger.ts define partidas balanceadas em centavos, estornos e saldo por reconciliação; backend/ contém as seis callable Functions, regras/índices versionados e teste do Emulator. A migração é aditiva, idempotente e em lotes: o dry-run não escreve, inconsistências entram em financialMigrationIssues, e o corte só bloqueia o legado depois da impressão digital aprovada. AddRescueScreen usa transferFunds para grupos já cortados e preserva o fluxo legado para os demais. Não implantar regras nem executar a migração sem exportar Firestore/regras atuais e validar a cópia preview. Vault alinhado em [[Gerenciamento de Bancos]], [[Resgate de Caixa]], [[Balanço Mensal]], [[Transferências]] e [[Firebase Config]].
> Atualizado em 2026-08-11.

- Build EAS Android confiável para o [[Assistente Lumus]] em 2026-08-11: a rota continua com montagem direta de provider/tela, bootstrap interno e recuperação de App Check/Remote Config sem derrubar a sessão. `app.config.ts` agora recusa os perfis EAS Android `development`, `preview`, `production` e `production-apk` quando `GOOGLE_SERVICES_JSON` não está provisionado; `eas.json` liga development, preview e produção aos seus ambientes EAS, evitando clients instaláveis sem Firebase AI nativo. Vault alinhado em [[Assistente Lumus]] e [[Firebase Config]].
> Atualizado em 2026-08-11.

- Central **Testes do aplicativo** atualizada em 2026-07-27: a rota `/app-tests` continua opcional no grupo Config, protegida pela preferência local `appTests`, cujo switch **Mostrar no app** começa desligado em `ScreenSettingsScreen.tsx`. A central oferece retorno ao Dashboard, uma notificação local imediata pelo canal existente `payment-reminders-v1` (sem canal próprio ou lembrete agendado), diagnóstico de disponibilidade/configuração do Lumus IA sem enviar prompt e atalhos para os formulários de despesa/ganho com rascunho de R$ 0,01. Os lançamentos só persistem se o usuário confirmar o formulário. Vault alinhado em [[Navegação]], [[Configurações]], [[Visibilidade de Rotas]], [[Notificações]], [[Assistente Lumus]], [[Transações de Despesas]] e [[Transações de Receitas]].
> Atualizado em 2026-07-27.

- Sessão e teclado do [[Assistente Lumus]] em 2026-07-27: `AuthContext` mantém `onAuthStateChanged`; o `reload()` valida a sessão nessa transição, mas não roda dentro de `onIdTokenChanged` para não criar loop de renovação. Só erros confirmados de token/sessão inválido, expirado, usuário desabilitado ou inexistente limpam a sessão, enquanto falhas transitórias de `reload()` a preservam. O mapper do assistente deixa de tratar `401`/`403` genérico, App Check, integração nativa ou configuração pendente como sessão expirada, e a disponibilidade Android exige preflight com token App Check não vazio. Quando ele falha, **Tentar novamente** executa `refreshAvailability()` com nova resolução de Remote Config e preflight, sem apagar conversa ou sessão. `app.json` declara `softwareKeyboardLayoutMode: "resize"`; a tela mede o hero por `onLayout`, usa `KeyboardAvoidingView` apenas no iOS e mantém histórico rolável, compositor e navigator no fluxo inferior redimensionado. Vault alinhado em [[Autenticação]], [[Assistente Lumus]], [[Firebase Config]] e [[Componentes UI]].
> Atualizado em 2026-07-27.

- Build Android instalável em 2026-07-27: `eas.json` recebeu o perfil `production-apk`, que herda a configuração Firebase/Play Integrity de `production`, usa o ambiente EAS `production` e gera APK para distribuição interna. A validação de `app.config.ts` agora exige `GOOGLE_SERVICES_JSON` também nesse perfil, impedindo APKs de teste sem os módulos nativos do Lumus. [[Firebase Config]] foi alinhado.
> Atualizado em 2026-07-27.

- Abertura direta do [[Assistente Lumus]] em 2026-07-27: `/lumus-assistant` deixou de usar `React.lazy`/`Suspense`; `LumusAssistantProvider` e `LumusAssistantScreen` montam diretamente, e o hero/painel ficam visíveis durante a consulta assíncrona de preferências, Remote Config e disponibilidade. A indisponibilidade da IA aparece dentro do painel, enquanto `assistant-route-boundary.tsx` ficou restrita à recuperação de erro inesperado. A investigação do AAB de produção também confirmou que o arquivo `GOOGLE_SERVICES_JSON` precisa estar provisionado como variável de arquivo no EAS/CI para que o AAB inclua os módulos React Native Firebase e a IA funcione em release; `app.config.ts` passa a recusar o perfil Android `production` sem esse arquivo. Vault alinhado em [[Assistente Lumus]], [[Navegação]], [[Firebase Config]] e [[Componentes UI]].
> Atualizado em 2026-07-27.

- Correção de estabilidade em 2026-07-23: a central manual `/app-tests` e suas ações de teste de notificação e lançamento financeiro foram removidas, evitando dados de teste no Firestore; a cobertura Jest permanece offline. [[Anotações Locais]] foi preservada com rota `/annotations`, entrada no menu Home, persistência local por UID e editor visual em Expo DOM que guarda Markdown, sem `react-native-enriched-markdown`, Tiptap ou novo módulo nativo. O editor reaproveita o runtime WebView já usado pelos gráficos do baseline Expo SDK 54. As dependências Expo retornaram ao baseline SDK 54 e os pacotes Stately exigidos pelo Gluestack foram declarados de modo explícito. Vault alinhado em [[Navegação]], [[Configurações]], [[Notificações]], [[Assistente Lumus]], [[Transações de Despesas]], [[Transações de Receitas]], [[Anotações Locais]] e [[Componentes UI]].
> Atualizado em 2026-07-24.

- Visibilidade de [[Anotações Locais]] em 2026-07-24: `ScreenSettingsScreen.tsx` passou a oferecer o accordion ilustrado de **Anotações** com o switch **Mostrar no app**. A preferência local passa a filtrar o menu Home e também bloqueia `/annotations` por `Stack.Protected`, seguindo o mesmo fluxo de [[Visibilidade de Rotas]] do Lumus e dos formulários. Vault alinhado em [[Configurações]], [[Visibilidade de Rotas]], [[Navegação]] e [[Anotações Locais]].

- Liberação de teste de [[Anotações Locais]] em 2026-07-24: Anotações agora começa oculta por padrão. O accordion usa o switch **Em desenvolvimento** ativado; ao desligá-lo, a preferência local libera o destino no Home, mostra um modal de recurso em desenvolvimento e mantém o bloqueio de rota enquanto o switch estiver ligado. Vault alinhado em [[Configurações]], [[Visibilidade de Rotas]], [[Navegação]] e [[Anotações Locais]].

- Padronização visual de [[Anotações Locais]] em 2026-07-23: `LocalAnnotationsScreen.tsx` passou a usar o cabeçalho amarelo compartilhado pelas telas principais, com título, ilustração central e superfície de conteúdo sobreposta. Lista, editor e persistência local por UID foram preservados. Vault alinhado em [[Anotações Locais]].

- Editor visual de [[Anotações Locais]] em 2026-07-23: abrir uma página ocupa a tela inteira, sem navigator, com toolbar horizontal funcional. H1/H2/H3, negrito, itálico, sublinhado, tópicos e checklist são exibidos diretamente no texto enquanto se escreve; o componente Expo DOM converte a estrutura visual para Markdown antes de salvar no `AsyncStorage`. O runtime WebView já existente para gráficos é reutilizado, sem dependência nova de editor rico. Vault alinhado em [[Anotações Locais]] e [[Componentes UI]].

- Accordion do [[Assistente Lumus]] em 2026-07-22: a configuração de visibilidade do Lumus em `ScreenSettingsScreen.tsx` passou a usar o mesmo accordion ilustrado das demais telas, com status resumido no cabeçalho e **Mostrar no app** no conteúdo expandido. A persistência local e o bloqueio da rota foram preservados. Vault alinhado em [[Configurações]] e [[Visibilidade de Rotas]].

- Ciclo de vida de voz do [[Assistente Lumus]] em 2026-07-22: ao desmontar `LumusAssistantScreen.tsx`, a limpeza não consulta nem interrompe mais o `AudioRecorder`, pois `useAudioRecorder` libera automaticamente esse objeto nativo. A tela ainda cancela o timer, apaga áudio temporário e restaura o modo de áudio; cancelamento e revogação enquanto montada continuam interrompendo a gravação normalmente. Vault alinhado em [[Assistente Lumus]].

- [[Visibilidade de Rotas]] em 2026-07-22: `ScreenSettingsScreen.tsx` passou a oferecer **Mostrar no app** para cada tela configurável e um controle próprio do [[Assistente Lumus]]. A preferência local em AsyncStorage começa visível, filtra o `navigator.tsx` e é reforçada por `Stack.Protected`, incluindo acesso direto à rota. Destinos pós-submit que forem ocultados fazem fallback para o Dashboard. Vault alinhado em [[Navegação]], [[Configurações]], [[Comportamento Pós-Registro]] e [[Assistente Lumus]].

- Identidade das Tabs em 2026-07-22: os controles de horizonte da [[Previsão de Fluxo de Caixa]], tipo da [[Análise por Categoria]] e período de [[Monitoramento de Investimentos]] passaram a ficar em cards `notTintedCardClassName`, com indicador amarelo e conteúdo ativo escuro para contraste. A animação e os comportamentos controlados foram preservados; vault alinhado nos módulos e em [[Componentes UI]].

- Retorno pós-edição em 2026-07-22: as opções de edição em `ScreenSettingsScreen.tsx` agora reutilizam o ActionSheet de destinos dos cadastros. `PostSubmitBehaviorContext.tsx` preserva o destino escolhido na preferência de edição, enquanto dados antigos sem destino mantêm o retorno padrão para a Home; edições continuam sem limpeza de campos. Vault alinhado em [[Configurações]] e [[Comportamento Pós-Registro]].

- Rentabilidade de [[Monitoramento de Investimentos]] em 2026-07-22: `FinancialListScreen.tsx` passou a usar as Tabs controladas de `components/ui/tabs` para 30 dias, 6 meses, 12 meses e total, preservando o cálculo local e a largura igual dos quatro gatilhos. Vault alinhado em [[Investimentos]], [[Monitoramento de Investimentos]] e [[Componentes UI]].

- Tipo da [[Análise por Categoria]] em 2026-07-22: o seletor entre **Gastos** e **Ganhos** passou a usar as Tabs controladas de `components/ui/tabs`, preservando as restrições de uso da categoria, os ícones de entrada/saída e o relatório carregado em memória. Vault alinhado em [[Análise por Categoria]] e [[Componentes UI]].

- Restauração do tamanho padrão do `navigator.tsx` em 2026-07-22: a barra inferior preserva três grupos de largura igual em um conteúdo centralizado de até `280px`, com `16px` de respiro lateral. Isso impede que Home, Controle e Config cresçam em telas maiores; vault alinhado em [[Navegação]].

- Horizonte da [[Previsão de Fluxo de Caixa]] em 2026-07-22: `FinancialForecastScreen.tsx` passou a usar as Tabs controladas de `components/ui/tabs` para as opções de 3/6/12 meses, preservando o recálculo e o indicador animado. O seletor de domínio `forecast-horizon-selector.tsx` foi removido; `tabs/` foi compatibilizado com o toolchain estável, sem atualizar dependências. Vault alinhado em [[Previsão de Fluxo de Caixa]] e [[Componentes UI]].

- Refinamento visual do [[Assistente Lumus]] em 2026-07-22: `LumusAssistantScreen.tsx` passou a aplicar classes NativeWind e componentes Gluestack para superfícies, mensagens, atalhos e consentimento; permanecem em `style` somente os valores geométricos calculados pelo hero, insets e teclado. O compositor agora espelha os formulários com campo, microfone e envio em `h-10`, e os dois controles de ícone em `w-10 rounded-2xl`. Vault alinhado em [[Assistente Lumus]] e [[Componentes UI]].

- Preferências do [[Assistente Lumus]] em 2026-07-22: o atalho de configurações abre um `Drawer` à direita, sem inserir controles no histórico da conversa. A leitura automática agora usa o `Switch` padrão com tokens de `useScreenStyles()`; revogar consentimento fecha o drawer antes de executar a limpeza de sessão já existente. Vault alinhado em [[Assistente Lumus]] e [[Componentes UI]].
- Compositor do [[Assistente Lumus]] em 2026-07-22: o `PromptInput` deixou o conteúdo rolável do chat e passou a ocupar o rodapé fixo do painel, logo acima do `navigator.tsx`. Assim, a tela abre com o campo pronto para uso e apenas o histórico recebe rolagem; o `KeyboardAvoidingView` preserva a posição acima do teclado. Vault alinhado em [[Assistente Lumus]].
- Exemplos do [[Assistente Lumus]] em 2026-07-22: os `QUICK_PROMPTS` deixaram o estado vazio e passaram para um `Modal` aberto pelo novo botão de lâmpada entre limpar conversa e configurações. A escolha fecha o modal e segue o mesmo envio controlado do compositor. Vault alinhado em [[Assistente Lumus]] e [[Componentes UI]].
- Preferências do [[Assistente Lumus]] em 2026-07-22: a leitura automática passou a explicar a execução local por `Popover`, sem texto auxiliar permanente. A revogação de consentimento agora ocupa um card próprio no mesmo padrão do `Switch`, com ação destrutiva de ícone à direita. Vault alinhado em [[Assistente Lumus]] e [[Componentes UI]].

- Correção definitiva da tela branca e reinstalação limpa em 2026-07-21: o salto simultâneo para NativeWind 5 preview, Tailwind 4 e Gluestack 5 trouxe `react-stately` moderno com sintaxe que o Metro de desenvolvimento não transformava, além de descaracterizar a configuração visual conhecida. O projeto voltou às versões exatas NativeWind 4.2.1, Tailwind 3.4.18, Gluestack 3.0.12, `react-stately` 3.42.0 e `@react-stately/color` 3.9.2; `package-lock.json` voltou a partir do grafo estável, os patches aplicam durante `npm ci` e não há plugin Babel compensatório. `global.css`, `tailwind.config.js`, `metro.config.js`, `babel.config.js` e os componentes gerados voltaram ao fluxo NativeWind 4. Vault alinhado em [[Componentes UI]], [[Sistema de Temas]] e [[Navegação]].

- Isolamento real do [[Assistente Lumus]] em 2026-07-21: o arquivo de rota `/lumus-assistant` passou a usar `React.lazy`/`Suspense` para importar provider e tela somente ao navegar. `AssistantRouteBoundary` captura a ausência de `expo-audio`/`expo-speech` em um development client antigo e mostra orientação de atualização sem derrubar Login ou Home; `tests/assistantRouteBootstrap.test.ts` impede regressão de importação antecipada. Vault alinhado em [[Assistente Lumus]] e [[Navegação]].

- Configuração nativa resiliente do [[Assistente Lumus]] em 2026-07-21: `app.config.ts` mantém apenas o plugin oficial de áudio e adiciona `@react-native-firebase/app`/`android.googleServicesFile` quando `GOOGLE_SERVICES_JSON` ou `google-services.json` realmente existe. Sem o arquivo, o app-base continua gerável e a IA informa configuração pendente; com o arquivo, é obrigatório gerar e instalar um novo development build. O prebuild Android foi sincronizado e materializou `RECORD_AUDIO`/`MODIFY_AUDIO_SETTINGS`. Vault alinhado em [[Firebase Config]].

- Bootstrap resiliente de [[Notificações]] em 2026-07-21: `utils/notificationsRuntime.ts` detecta o Expo Go por `executionEnvironment: storeClient` antes de avaliar `expo-notifications`, pois o pacote emite erro no Android desse host ao carregar APIs remotas. Assim, uma falha de notificações não bloqueia o Expo Router, a autenticação nem o [[Assistente Lumus]]; lembretes ficam indisponíveis no Expo Go e voltam a operar no development build instalado. Typecheck, testes de lembretes e bundle Android validados; vault alinhado em [[Notificações]].

- Horizonte da [[Previsão de Fluxo de Caixa]] em 2026-07-21: `forecast-horizon-selector.tsx` preserva as opções 3/6/12 meses, largura total e indicador animado com primitivas React Native. O controle de domínio substitui as Tabs que exigiam Gluestack 5 e permite manter o toolchain visual estável sem alterar o recálculo do cenário. Vault alinhado em [[Previsão de Fluxo de Caixa]] e [[Componentes UI]].

- Chat do [[Assistente Lumus]] em 2026-07-21: `LumusAssistantScreen.tsx` passou a compor histórico, estado vazio, mensagens e compositor com `components/ui/chatAi` (`Conversation`, `Message` e `PromptInput`). A adaptação preserva os cartões de confirmação individual, voz, privacidade e o `useKeyboardAwareScroll()`, enquanto o textarea continua sobre `Input`/`InputField` do Gluestack; vault alinhado em [[Assistente Lumus]] e [[Componentes UI]].

- Compositor do [[Assistente Lumus]] em 2026-07-21: `LumusAssistantScreen.tsx` substituiu o `TextInput` direto pelo `Input`/`InputField` do Gluestack e passou a usar `useKeyboardAwareScroll()` no histórico rolável. Ao focar o campo, o painel sobe e mantém o compositor visível acima do teclado; vault alinhado em [[Assistente Lumus]].

- Espaçamento do `navigator.tsx` em 2026-07-21: o contêiner da barra inferior voltou a ter `16px` de padding horizontal, preservando o respiro visual dos ícones de Home e Config nas bordas; vault alinhado em [[Navegação]].

- Navegação do [[Assistente Lumus]] em 2026-07-21: o atalho **Lumus IA** saiu da quarta ação isolada da barra inferior e passou para o menu do botão **Home**. O navigator volta a ter três grupos de largura igual e a rota `/lumus-assistant` deixa Home ativo; vault alinhado em [[Navegação]] e [[Assistente Lumus]].

- Padronização visual do [[Assistente Lumus]] em 2026-07-21: `LumusAssistantScreen.tsx` adotou o mesmo hero das demais telas — wallpaper amarelo, título e ilustração — e posiciona consentimento e chat no painel arredondado abaixo. As ações e o compositor foram preservados; vault alinhado em [[Assistente Lumus]].

- Bootstrap resiliente do [[Assistente Lumus]] em 2026-07-20: o adaptador Android passou a detectar Expo Go antes de importar React Native Firebase e a carregar App Check/AI/Remote Config somente quando o runtime nativo é compatível. Assim, `RNFBAppModule` ausente desativa apenas a IA com orientação para development build, sem impedir o Expo Router de reconhecer `_layout` e `/lumus-assistant` nem desmontar a hierarquia de tema. Teste de regressão e bundle Android validados; vault alinhado em [[Assistente Lumus]] e [[Firebase Config]].
- [[Assistente Lumus]] implementado em 2026-07-20: nova rota protegida `/lumus-assistant`, quarta ação fixa **Lumus IA**, conversa por texto/voz, consentimento por UID, TTS local, perguntas e cartões editáveis com confirmação individual. O Gemini somente propõe ações por function calling; `FinanceCommandService` valida propriedade, Zod, saldo, dependências, fingerprint e executa comandos atômicos/idempotentes. Handles opacos agora são estáveis apenas durante a sessão, datas civis são materializadas em `America/Sao_Paulo`, a cota local é isolada por UID e falhas da agenda podem ser repetidas sem refazer o commit financeiro. Relatórios usam agregadores determinísticos e narrativa opcional com fallback local. Web usa `firebase/ai` + reCAPTCHA Enterprise; Android usa React Native Firebase AI/App Check/Remote Config e requer `google-services.json` + development build. Testes novos cobrem o cenário de 18/19 de julho de 2026, limites, privacidade, estados e contratos dos adaptadores.

- Ilustrações do seletor de retorno de [[Configurações]] em 2026-07-19: cada destino do ActionSheet em `ScreenSettingsScreen.tsx` passou a exibir o SVG correspondente à tela em vez de um índice numérico. Vault alinhado em [[Configurações]].
- Seletor de retorno de [[Configurações]] em 2026-07-19: `ScreenSettingsScreen.tsx` substituiu o `Select` nativo por um ActionSheet pesquisável e estilizado, com descrição e destaque visual para o destino atualmente escolhido. Vault alinhado em [[Configurações]].
- Hierarquia visual de [[Configurações]] em 2026-07-19: o resumo de pós-submit de cada accordion em `ScreenSettingsScreen.tsx` não cresce mais junto à coluna da ilustração e passa a ficar imediatamente abaixo do nome da tela. Vault alinhado em [[Configurações]].
- Identidade visual de [[Investimentos]] em 2026-07-19: o título **Evolução da carteira** em `FinancialListScreen.tsx` passa a exibir o ícone de calendário amarelo, espelhando o cabeçalho de **Evolução do saldo** na previsão. Vault alinhado em [[Investimentos]].
- Padronização visual de [[Investimentos]] em 2026-07-19: `investment-evolution-chart.tsx` passa a usar pontos sempre visíveis com raio 4/6 e a tipografia padrão dos eixos, espelhando a escala visual de `financial-forecast-chart.tsx` sem remover as duas curvas e a legenda da carteira. Vault alinhado em [[Investimentos]], [[Monitoramento de Investimentos]] e [[Componentes UI]].
- Refinamento de layout em [[Investimentos]] em 2026-07-19: os rótulos dos filtros de rentabilidade em `FinancialListScreen.tsx` são centralizados nas quatro colunas de largura igual. Vault alinhado em [[Investimentos]] e [[Monitoramento de Investimentos]].
- Reversão visual de [[Investimentos]] em 2026-07-19: as duas mudanças recentes de grade e de cores explícitas dos ticks em `investment-evolution-chart.tsx` foram desfeitas, restaurando a configuração Mantine anterior. Vault alinhado em [[Investimentos]], [[Monitoramento de Investimentos]] e [[Componentes UI]].
- Ajuste de layout em [[Investimentos]] em 2026-07-19: os quatro filtros de rentabilidade em `FinancialListScreen.tsx` dividem igualmente toda a largura disponível, removendo o espaço vazio à direita. Vault alinhado em [[Investimentos]] e [[Monitoramento de Investimentos]].
- Configurações por tela em 2026-07-19: `ScreenSettingsScreen.tsx` passou a separar cadastros e edições em cards transparentes por categoria, com busca por nome e accordions ilustrados por formulário. Na configuração inicial, as preferências de edição eram independentes das de cadastro, permitiam retornar para a Home ou permanecer no formulário e nunca limpavam valores carregados; `usePostSubmitBehavior()` reforça a regra ao salvar. Vault alinhado em [[Configurações]] e [[Comportamento Pós-Registro]].
- Padronização dos gráficos de [[Investimentos]] e [[Previsão de Fluxo de Caixa]] em 2026-07-19: `investment-evolution-chart.tsx` passa a aplicar o mesmo fundo transparente, supressão de foco e regra de rolagem horizontal para séries com mais de sete pontos de `financial-forecast-chart.tsx`, preservando as duas curvas, legenda e eixos compactos da carteira. Vault alinhado em [[Investimentos]], [[Monitoramento de Investimentos]] e [[Componentes UI]].
- Legibilidade no horizonte longo de [[Previsão de Fluxo de Caixa]] em 2026-07-19: `financial-forecast-chart.tsx` deixa de comprimir os 13 pontos de 12 meses no celular; séries com mais de sete pontos ganham largura por período e rolagem horizontal. Vault alinhado em [[Previsão de Fluxo de Caixa]] e [[Componentes UI]].
- Refinamento de toque em [[Previsão de Fluxo de Caixa]] em 2026-07-19: o Expo DOM de `financial-forecast-chart.tsx` não aceita foco e seus elementos internos não desenham `outline`, removendo a borda branca que surgia ao tocar o gráfico. Vault alinhado em [[Previsão de Fluxo de Caixa]] e [[Componentes UI]].
- Correção visual de [[Previsão de Fluxo de Caixa]] em 2026-07-19: o `body` Mantine e o contêiner Expo DOM de `financial-forecast-chart.tsx` passam a ser transparentes, eliminando o retângulo escuro isolado no tema noturno e preservando o fundo do card. Vault alinhado em [[Previsão de Fluxo de Caixa]] e [[Componentes UI]].
- Usabilidade mobile de [[Investimentos]] em 2026-07-19: `investment-evolution-chart.tsx` ganha largura proporcional aos períodos e rolagem horizontal por toque; `FinancialListScreen.tsx` habilita o scroll do Expo DOM para encaminhar esse gesto. Vault alinhado em [[Investimentos]], [[Monitoramento de Investimentos]] e [[Componentes UI]].
- Refinamento visual de [[Investimentos]] em 2026-07-19: os rótulos dos eixos X e Y em `investment-evolution-chart.tsx` usam 11px, preservando todos os períodos e valores, com menos competição visual. Vault alinhado em [[Investimentos]] e [[Componentes UI]].
- Refinamento visual de [[Investimentos]] em 2026-07-19: `investment-evolution-chart.tsx` removeu o gradiente e o preenchimento sob as curvas; o gráfico agora mostra somente linhas e pontos de capital líquido e patrimônio estimado. Vault alinhado em [[Investimentos]], [[Monitoramento de Investimentos]] e [[Componentes UI]].
- Correção de contraste na antiga central manual de testes em 2026-07-19 (removida em 2026-07-23): os ícones e rótulos de **Ver diagnóstico** e **Abrir configurações de notificação** passaram a usar `submitButtonTextClassName`, preservando texto escuro sobre o fundo amarelo compartilhado.
- Padronização dos modais de [[Investimentos]] em 2026-07-19: configuração da taxa CDI e edição deixam o limite excepcional de 380px e passam a usar os mesmos 360px dos diálogos de aporte, resgate, sincronização e exclusão em `FinancialListScreen.tsx`; os formulários longos continuam roláveis e protegidos pelo teclado. Vault alinhado em [[Investimentos]] e [[Componentes UI]].
- Monitoramento completo de [[Investimentos]] em 2026-07-19: `FinancialListScreen.tsx` deixou de calcular CDI com uma taxa fixa e passou a carregar `investmentCdiRates` por pessoa e vigência, configurável pelo modal da própria carteira e exibida como histórico. `investmentPortfolio.ts` centraliza a projeção em centavos/ponto fixo, combina aplicação inicial, aportes, resgates e sincronizações para gerar rentabilidade de 30 dias/6 meses/12 meses/total, patrimônio estimado, rendimento acumulado, próximo dia, alocação por banco e curva comparativa; sem taxa vigente, conserva o valor confirmado. `HomeFirebase.ts` reutiliza a mesma taxa histórica, e o esquema reserva Tesouro, ações e fundos sem aplicar CDI automaticamente. O `AreaChart` Mantine está isolado em Expo DOM, a privacidade mascara indicadores/eixo/tooltip, e testes de cálculo, Jest completo, TypeScript e bundle Android foram validados. Vault alinhado em [[Investimentos]], [[Monitoramento de Investimentos]], [[Dashboard Home]], [[Componentes UI]] e [[Privacidade de Valores]].
- Destaque visual da sugestão de [[Despesas Fixas]] em 2026-07-19: o modal de `AddRegisterExpensesScreen.tsx` mantém o texto contextual e renderiza somente o nome e o valor do gasto obrigatório sugerido em amarelo adaptado aos temas claro e escuro, facilitando a confirmação antes do redirecionamento.
- Previsão de fluxo de caixa em 2026-07-19: a nova rota autenticada `/financial-forecast` abre `FinancialForecastScreen.tsx` pelo grupo Home do navigator e entrega cenários de 3/6/12 meses sem persistência automática. `FinancialForecastFirebase.ts` consolida snapshots, movimentos, recorrências, parcelas e investimentos; `financialForecast.ts` mantém o cálculo em centavos, prioriza compromissos fixos e lançamentos futuros e só projeta categorias variáveis recorrentes em pelo menos dois dos três meses fechados — lançamentos pontuais, inclusive múltiplos no mesmo mês, não entram. Lançamento futuro conhecido substitui a média da mesma categoria, transferências seguem neutralizadas e liquidez de investimento continua sem resgate implícito. O gráfico usa `@mantine/charts` em Expo DOM/WebView, com a tela restante nativa; TypeScript e testes de cálculo/navegação foram validados. Vault alinhado em [[Previsão de Fluxo de Caixa]], [[Navegação]], [[Balanço Mensal]], [[Despesas Fixas]], [[Receitas Fixas]], [[Investimentos]], [[Componentes UI]] e [[Privacidade de Valores]].
- Refinamento da sugestão de [[Despesas Fixas]] em 2026-07-19: `AddRegisterExpensesScreen.tsx` só intercepta novas despesas comuns do ciclo atual quando há um template pendente, único e de alta confiança. A regra é agnóstica ao tipo de gasto: compara todos os templates obrigatórios pendentes, e `Luz` é apenas um exemplo junto de aluguel, internet, academia e seguro. A categoria deixou de ser um veto; nome canônico único identifica o obrigatório mesmo com categoria distinta e valor variável, enquanto nome apenas parecido exige valor compatível (incluindo último pagamento) e categoria ou vencimento próximo. Itens já pagos, parcelamentos concluídos, períodos inativos e matches ambíguos não alertam; sinônimos sem palavras em comum não são supostos automaticamente. O CTA leva `focusMandatoryExpenseId` a [[Navegação|MandatoryExpensesListScreen]], que recarrega, revalida e abre a confirmação do pagamento identificado sem persistência automática. Pagamentos obrigatórios usam `registerMandatoryExpensePaymentFirebase()` para criar a despesa real e atualizar o ciclo em uma transação Firestore, prevenindo vínculo parcial e duplicidade concorrente; vínculos cujo documento de despesa sumiu voltam a ser pendentes para correção pelo fluxo oficial. Testes de sugestão/navegação e TypeScript foram validados; vault alinhado em [[Transações de Despesas]], [[Despesas Fixas]] e [[Navegação]].
- Tema do seletor Android de horário em 2026-07-19: o plugin datetimepicker gera cabeçalho, marcador do relógio e paleta clara/escura no amarelo padrão; TimePickerField também define as ações Cancelar/OK no mesmo amarelo. O `prebuild` sincroniza `android:timePickerStyle` no diretório nativo antes da recompilação; a alteração requer novo build instalado e o vault foi alinhado em [[Componentes UI]], [[Sistema de Temas]], [[Despesas Fixas]] e [[Receitas Fixas]].
- Seleção nativa de horário em 2026-07-19: os cards de lembrete de [[Despesas Fixas]] e [[Receitas Fixas]] substituíram a digitação manual por TimePickerField, que abre o seletor do sistema Android/iOS e mantém HH:MM antes de persistir reminderHour/reminderMinute; o web usa input type=time. O módulo datetimepicker e seu plugin foram incluídos, exigindo novo build instalado para validação em aparelho; vault alinhado em [[Componentes UI]], [[Despesas Fixas]] e [[Receitas Fixas]].
- Reimplementação integral das notificações locais em 2026-07-18: Notifee, handlers e agendas legadas foram removidos; `expo-notifications` passa a ser o único motor com limpeza migratória, canais Android próprios, datas concretas em horizonte móvel, reconciliação e planejador global seguro (400 agendas Android/60 iOS, descontando agendas externas e priorizando a próxima ocorrência de cada template). O motor mantém escopo por UID, preserva cold start memory-only, redistribui vagas após cancelamento/conclusão e suprime o ciclo pago/recebido. O logout transacional ficou vinculado ao UID originador, conserva snapshot local até o `signOut`, recusa callbacks obsoletos e restaura a agenda offline se a sessão não puder ser encerrada; o `AuthContext` também ignora resoluções antigas de `reload()`. O card de [[Despesas Fixas]] ganhou seleção cumulativa D-1/D-2/D-3 e D0 opcional; a então central manual recebeu agendamento de 15 segundos e diagnóstico, ambos removidos em 2026-07-23. `expo-dev-client` entrou no projeto e produção voltou ao AAB; TypeScript, Jest, Expo Doctor e bundle Android foram validados, com vault alinhado em [[Notificações]], [[Despesas Fixas]], [[Receitas Fixas]], [[Configurações]], [[Componentes UI]] e [[Autenticação]].
- Correção sistêmica da navegação Android production em 2026-07-12: redirects automáticos deixam de usar `dismissTo`/`POP_TO`, `dismissAll` e `withAnchor`; `utils/navigation.ts` serializa uma única ação `REPLACE` no frame seguinte, `usePostSubmitBehavior()` ignora conclusões de telas desfocadas, retornos inline aguardam o cleanup, timers de teclado são cancelados no unmount, o guard de autenticação mantém o Stack raiz via `Stack.Protected` e `/home` não desempilha histórico obsoleto pelo botão físico. O fluxo de diagnóstico sem Firebase então associado à rota `/app-tests` foi removido em 2026-07-23; testes e bundle Android minificado foram validados, com vault alinhado em [[Navegação]], [[Comportamento Pós-Registro]], [[Autenticação]], [[Hooks Customizados]] e [[Dashboard Home]].
- Remoção da implementação anterior de anotações locais em 2026-07-06: as rotas `/annotations` e `/annotation-editor`, telas, utilitários, assets, dependências Mantine/Tiptap, item do navigator e atalho de Configurações foram removidos. Em 2026-07-22, uma nova implementação enxuta foi reintroduzida em [[Anotações Locais]], sem Mantine ou Tiptap; vault alinhado em [[Navegação]], [[Configurações]] e [[Componentes UI]].
- Parcelamento por período em 2026-07-06: `AddMandatoryExpensesScreen.tsx` e `AddMandatoryGainsScreen.tsx` ganharam calendários de início/fim para parcelas, com fim desbloqueado após quantidade válida e recálculo bidirecional entre data final e quantidade; listagens recalculam parcelas já transcorridas por `installmentStartDate`; vault alinhado em [[Despesas Fixas]] e [[Receitas Fixas]].
- Testes financeiros manuais em 2026-07-06 (fluxo removido em 2026-07-23): a então central manual abria formulários de despesa ou ganho com R$ 0,01 por `templateValueInCents=1`, sem persistência automática; o pré-preenchimento de teste foi removido de [[Transações de Despesas]] e [[Transações de Receitas]].
- Atalho para configurações de notificação em 2026-07-06 (removido em 2026-07-23): a então central manual oferecia abertura das configurações de notificação Android com fallback para as configurações gerais.
- Nova tela de testes do aplicativo em 2026-07-06 (removida em 2026-07-23): a rota `/app-tests` concentrava testes manuais de notificação e aparecia no grupo Config do navigator; a remoção devolveu Configurações e Navegação aos fluxos de uso do produto.
- Ajuste fino nos cards dos accordions de `ConfigurationsScreen.tsx` em 2026-07-06: ilustrações contextuais passam a usar moldura quadrada fixa para manter tamanho visual consistente entre todas as seções; vault alinhado em [[Configurações]].
- Organização visual dos accordions de `ConfigurationsScreen.tsx` em 2026-07-06: todos os accordions avançados passaram a abrir com card de apresentação, SVG contextual de `assets/UnDraw`, descrição e ação principal. A antiga referência visual à central manual de notificação deixou de existir com sua remoção em 2026-07-23; o padrão de **Configurações por tela** permanece. Vault alinhado em [[Configurações]].
- Refatoração de notificações locais em 2026-07-06: `utils/localNotifications.ts` centralizou bootstrap, permissão, canais Android e o disparo manual então existente; o antigo canal de testes e o fluxo **Testes do aplicativo** foram removidos em 2026-07-23. Os testes Jest permaneceram offline; vault alinhado em [[Notificações]] e [[Configurações]].
- Ajuste visual em `BankMovementsScreen.tsx` em 2026-07-06: despesas obrigatórias na timeline de movimentos passam a usar a paleta vermelha de despesa no ícone, linha, card expandido e valor monetário; vault alinhado em [[Gerenciamento de Bancos]].
- Comportamento pós-registro configurável em 2026-07-06: `PostSubmitBehaviorProvider` persiste preferências por formulário, `/screen-settings` permite escolher retorno/limpeza por tela, o padrão volta para [[Dashboard Home]] e fluxos inline de categoria preservam retorno à origem; vault alinhado em [[Comportamento Pós-Registro]], [[Configurações]], [[Navegação]], [[Transações de Despesas]], [[Transações de Receitas]], [[Despesas Fixas]], [[Receitas Fixas]], [[Gerenciamento de Bancos]], [[Gerenciamento de Tags]], [[Gerenciamento de Usuários]], [[Transferências]], [[Resgate de Caixa]], [[Investimentos]] e [[Balanço Mensal]].
- Sugestão conservadora de gasto obrigatório em 2026-05-25: `AddRegisterExpensesScreen.tsx` valida novos registros comuns contra templates de [[Despesas Fixas]] via `utils/mandatoryExpenseSuggestions.ts` e, em match único de alta confiança, mostra modal para ignorar ou ir para `MandatoryExpensesListScreen`; vault alinhado em [[Transações de Despesas]] e [[Despesas Fixas]].
- Ajuste contextual no `components/uiverse/navigator.tsx`: em `/bank-movements`, o grupo Home passa a exibir **Início**, **Movimentos do banco** e **Análise por Categoria**, mantendo a tela de movimentos indicada e preservando o retorno explícito para `/home?tab=0`; vault alinhado em [[Navegação]] e [[Gerenciamento de Bancos]].
- Ajuste de extrato bancário em 2026-05-25: `getBankMovementsByPeriodFirebase()` passa a reforçar a leitura de transferências pelos metadados `bankTransferSourceBankId`/`bankTransferTargetBankId`, para que a saída apareça no banco de origem e a entrada no banco de destino; vault alinhado em [[Gerenciamento de Bancos]] e [[Transferências]].
- Refatoração de navegação/rotas: `utils/navigation.ts` centraliza `APP_ROUTE_PATHS`, `HOME_TAB_INDEX` e helpers imperativos; `navigator.tsx` usa esse registro, resolve `/home?tab=*` corretamente e telas deixam de chamar `router.push()` diretamente. A estratégia antiga de `dismissTo` com fallback foi substituída pela correção production de 2026-07-12 descrita acima; vault alinhado em [[Navegação]], [[Componentes UI]], [[Configurações]] e [[Gerenciamento de Tags]].
- Ajuste de fluxo em `screens/AddRegisterTagScreen.tsx`: categorias abertas a partir de despesas, ganhos e recorrências usam tipo/obrigatoriedade como pré-preenchimento editável, sem bloquear radios ou switches. Entradas inline removeram `lockUsageType`/`lockMandatorySelection`; vault alinhado em [[Gerenciamento de Tags]], [[Despesas Fixas]] e [[Receitas Fixas]].
- Ajuste no navigator: o item de cadastro em `/add-register-tag` agora aparece como "Nova categoria" no grupo Config; vault alinhado em [[Navegação]].
- Ajuste visual em `screens/ConfigurationsScreen.tsx`: o filtro de categorias passou a usar `fieldContainerCardClassName`, no mesmo padrão de categorias das telas de registro, para acomodar ícone e helper dentro do card; vault alinhado em [[Configurações]].
