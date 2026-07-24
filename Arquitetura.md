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
