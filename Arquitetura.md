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
| Trabalhar no dashboard | `Dashboard Home.md`, `Hooks Customizados.md` |
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
| Trabalhar em testes manuais do app | `Testes do Aplicativo.md` |
| Configurar Firebase | `Firebase Config.md` |

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
Firebase Functions — functions/
    ↓
Firebase (Auth + Firestore)
```

### Stack

| Camada | Tecnologia |
|---|---|
| Framework | Expo ~54 / React Native 0.81 |
| Routing | Expo Router ~6 (file-based) |
| Backend | Firebase 12 (Auth + Firestore) |
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
- Classes Tailwind dinâmicas devem estar na safe list do `tailwind.config.js`

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
- Android usa os canais versionados `payment-reminders-v1`, `income-reminders-v1` e `system-tests-v1-expo`, todos criados no bootstrap
- Despesas usam schema `reminderConfigVersion: 1`, antecedência cumulativa D-1/D-2/D-3 e D0 opcional; documentos legados ficam opt-out até o usuário salvar a nova configuração
- O motor agenda datas concretas depois de resolver dia 29/30/31 e dias úteis; Android mantém horizonte móvel de seis meses e reconcilia a agenda ao abrir as listas/voltar ao foreground
- Toda agenda financeira é escopada por UID. Troca de conta e logout explícito limpam o UID anterior; o estado `user=null` de uma abertura fria não apaga alarmes porque a autenticação primária é memory-only
- Marcar o ciclo como pago/recebido cancela imediatamente os avisos restantes daquele `YYYY-MM`
- Não solicitar `USE_EXACT_ALARM` nem `SCHEDULE_EXACT_ALARM`; o horário é preferido e pode sofrer atraso por Doze/economia de bateria
- Notificações são locais (sem servidor) — reinstalar app as apaga
- Expo Go serve somente para smoke test local. Validar canais, segundo plano e aceite em development client e build de produção instalados
- Alterações em plugin, manifesto ou dependência nativa exigem novo build

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
```

> Prefixo `EXPO_PUBLIC_` = exposto no bundle. Não colocar secrets aqui.

---

## Active Context

> Atualizado em 2026-07-18.

- Reimplementação integral das notificações locais em 2026-07-18: Notifee, handlers e agendas legadas foram removidos; `expo-notifications` passa a ser o único motor com limpeza migratória, canais Android próprios, datas concretas em horizonte móvel, reconciliação e planejador global seguro (400 agendas Android/60 iOS, descontando agendas externas e priorizando a próxima ocorrência de cada template). O motor mantém escopo por UID, preserva cold start memory-only, redistribui vagas após cancelamento/conclusão e suprime o ciclo pago/recebido. O logout transacional ficou vinculado ao UID originador, conserva snapshot local até o `signOut`, recusa callbacks obsoletos e restaura a agenda offline se a sessão não puder ser encerrada; o `AuthContext` também ignora resoluções antigas de `reload()`. O card de [[Despesas Fixas]] ganhou seleção cumulativa D-1/D-2/D-3 e D0 opcional, [[Testes do Aplicativo]] ganhou agendamento real de 15 segundos e diagnóstico de permissão/canais/agendas/capacidade, `expo-dev-client` entrou no projeto e produção voltou ao AAB; TypeScript, Jest, Expo Doctor e bundle Android foram validados, com vault alinhado em [[Notificações]], [[Despesas Fixas]], [[Receitas Fixas]], [[Testes do Aplicativo]], [[Configurações]], [[Componentes UI]] e [[Autenticação]].
- Correção de tema na tela [[Testes do Aplicativo]] em 2026-07-13: o ícone e rótulo de **Abrir configurações de notificação** deixam de usar `text-black` fixo e passam a consumir `bodyText` de `useScreenStyles()`, acompanhando os modos claro e escuro; vault alinhado em [[Testes do Aplicativo]].
- Correção sistêmica da navegação Android production em 2026-07-12: redirects automáticos deixam de usar `dismissTo`/`POP_TO`, `dismissAll` e `withAnchor`; `utils/navigation.ts` serializa uma única ação `REPLACE` no frame seguinte, `usePostSubmitBehavior()` ignora conclusões de telas desfocadas, retornos inline aguardam o cleanup, timers de teclado são cancelados no unmount, o guard de autenticação mantém o Stack raiz via `Stack.Protected`, `/home` não desempilha histórico obsoleto pelo botão físico e `/app-tests` ganha um redirect de diagnóstico sem Firebase; testes, bundle Android minificado e vault alinhados em [[Navegação]], [[Comportamento Pós-Registro]], [[Autenticação]], [[Hooks Customizados]], [[Dashboard Home]] e [[Testes do Aplicativo]].
- Remoção da área de anotações locais em 2026-07-06: as rotas `/annotations` e `/annotation-editor`, telas, utilitários, assets, dependências Mantine/Tiptap, item do navigator e atalho de Configurações foram removidos; vault alinhado em [[Navegação]], [[Configurações]] e [[Componentes UI]].
- Parcelamento por período em 2026-07-06: `AddMandatoryExpensesScreen.tsx` e `AddMandatoryGainsScreen.tsx` ganharam calendários de início/fim para parcelas, com fim desbloqueado após quantidade válida e recálculo bidirecional entre data final e quantidade; listagens recalculam parcelas já transcorridas por `installmentStartDate`; vault alinhado em [[Despesas Fixas]] e [[Receitas Fixas]].
- Testes financeiros manuais em 2026-07-06: `AppTestsScreen.tsx` ganhou card **Lançamento financeiro** com botões para abrir despesa ou ganho de teste em R$ 0,01 via `templateValueInCents=1`, sem persistência automática; vault alinhado em [[Testes do Aplicativo]], [[Transações de Despesas]] e [[Transações de Receitas]].
- Atalho para configurações de notificação em 2026-07-06: `AppTestsScreen.tsx` passa a oferecer botão que abre as configurações de notificação do app no Android via intent específico, com fallback para configurações gerais; vault alinhado em [[Testes do Aplicativo]] e [[Notificações]].
- Nova tela de testes do aplicativo em 2026-07-06: `/app-tests` renderiza `AppTestsScreen.tsx`, concentra o teste manual de notificação local, entra no navigator Config como **Testes do app** e `ConfigurationsScreen.tsx` passa a apenas navegar para essa tela; vault alinhado em [[Testes do Aplicativo]], [[Configurações]], [[Notificações]] e [[Navegação]].
- Ajuste fino nos cards dos accordions de `ConfigurationsScreen.tsx` em 2026-07-06: ilustrações contextuais passam a usar moldura quadrada fixa para manter tamanho visual consistente entre todas as seções; vault alinhado em [[Configurações]].
- Organização visual dos accordions de `ConfigurationsScreen.tsx` em 2026-07-06: todos os accordions avançados passam a abrir com card de apresentação, SVG contextual de `assets/UnDraw`, descrição e ação principal no mesmo padrão de **Notificação local** e **Configurações por tela**; vault alinhado em [[Configurações]].
- Refatoração de notificações locais em 2026-07-06: `utils/localNotifications.ts` centraliza bootstrap, permissão, canais Android e disparo manual; `system-tests-v1` vira canal padrão do plugin `expo-notifications`; o fluxo **Testes do aplicativo** usa `testsScreen.svg` para validar notificação local em build Android; testes Jest e vault alinhados em [[Notificações]] e [[Configurações]].
- Ajuste visual em `BankMovementsScreen.tsx` em 2026-07-06: despesas obrigatórias na timeline de movimentos passam a usar a paleta vermelha de despesa no ícone, linha, card expandido e valor monetário; vault alinhado em [[Gerenciamento de Bancos]].
- Comportamento pós-registro configurável em 2026-07-06: `PostSubmitBehaviorProvider` persiste preferências por formulário, `/screen-settings` permite escolher retorno/limpeza por tela, o padrão volta para [[Dashboard Home]] e fluxos inline de categoria preservam retorno à origem; vault alinhado em [[Comportamento Pós-Registro]], [[Configurações]], [[Navegação]], [[Transações de Despesas]], [[Transações de Receitas]], [[Despesas Fixas]], [[Receitas Fixas]], [[Gerenciamento de Bancos]], [[Gerenciamento de Tags]], [[Gerenciamento de Usuários]], [[Transferências]], [[Resgate de Caixa]], [[Investimentos]] e [[Balanço Mensal]].
- Sugestão conservadora de gasto obrigatório em 2026-05-25: `AddRegisterExpensesScreen.tsx` valida novos registros comuns contra templates de [[Despesas Fixas]] via `utils/mandatoryExpenseSuggestions.ts` e, em match único de alta confiança, mostra modal para ignorar ou ir para `MandatoryExpensesListScreen`; vault alinhado em [[Transações de Despesas]] e [[Despesas Fixas]].
- Ajuste contextual no `components/uiverse/navigator.tsx`: em `/bank-movements`, o grupo Home passa a exibir **Início**, **Movimentos do banco** e **Análise por Categoria**, mantendo a tela de movimentos indicada e preservando o retorno explícito para `/home?tab=0`; vault alinhado em [[Navegação]] e [[Gerenciamento de Bancos]].
- Ajuste de extrato bancário em 2026-05-25: `getBankMovementsByPeriodFirebase()` passa a reforçar a leitura de transferências pelos metadados `bankTransferSourceBankId`/`bankTransferTargetBankId`, para que a saída apareça no banco de origem e a entrada no banco de destino; vault alinhado em [[Gerenciamento de Bancos]] e [[Transferências]].
- Refatoração de navegação/rotas: `utils/navigation.ts` centraliza `APP_ROUTE_PATHS`, `HOME_TAB_INDEX` e helpers imperativos; `navigator.tsx` usa esse registro, resolve `/home?tab=*` corretamente e telas deixam de chamar `router.push()` diretamente. A estratégia antiga de `dismissTo` com fallback foi substituída pela correção production de 2026-07-12 descrita acima; vault alinhado em [[Navegação]], [[Componentes UI]], [[Configurações]] e [[Gerenciamento de Tags]].
- Ajuste de fluxo em `screens/AddRegisterTagScreen.tsx`: categorias abertas a partir de despesas, ganhos e recorrências usam tipo/obrigatoriedade como pré-preenchimento editável, sem bloquear radios ou switches. Entradas inline removeram `lockUsageType`/`lockMandatorySelection`; vault alinhado em [[Gerenciamento de Tags]], [[Despesas Fixas]] e [[Receitas Fixas]].
- Ajuste no navigator: o item de cadastro em `/add-register-tag` agora aparece como "Nova categoria" no grupo Config; vault alinhado em [[Navegação]].
- Ajuste visual em `screens/ConfigurationsScreen.tsx`: o filtro de categorias passou a usar `fieldContainerCardClassName`, no mesmo padrão de categorias das telas de registro, para acomodar ícone e helper dentro do card; vault alinhado em [[Configurações]].
