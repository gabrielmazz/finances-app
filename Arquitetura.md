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
4. Atualize a seção **Active Context** no final deste arquivo

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
5. **Mantenha a seção "Active Context" deste arquivo atualizada com o que está sendo trabalhado.**

## Regra para atualização de arquivos de código

1. **Antes de implementar, consulte o arquivo relevante no vault para entender o contexto completo.**
2. **Se a feature ou comportamento que você vai alterar não estiver documentado, pergunte ao usuário antes de implementar.**
3. **Após implementar, revise o vault para garantir que a documentação esteja alinhada com as mudanças feitas.**
4. **Mantenha a seção "Active Context" deste arquivo atualizada com os arquivos que foram modificados e o que está sendo trabalhado.**
5. **Evite mudanças que não estejam alinhadas com o que está documentado no vault sem antes atualizar a documentação.**
6. **Dentro do código, use comentários para referenciar o arquivo do vault quando fizer algo que tenha uma regra ou fluxo específico documentado.**
    - Exemplo: `// Esta função segue a regra X documentada em [[Regras Críticas]] no vault`
    - Evite código "mágico" sem referência à documentação.
    - Se o arquivo estiver sem nenhum comentários explicativos são ainda mais importantes para manter a clareza, ou seja, será adicionado esse comentário
7. Se caso encontre funções ou trechos de código desnecessarios, retire-os para manter o código limpo, mas antes de retirar, verifique se não há nenhuma regra ou fluxo documentado no vault que dependa desse código. Se houver, atualize o vault para refletir a remoção do código e as mudanças no comportamento ou fluxo.


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

### Notificações Push
- Detectar ambiente antes de carregar/agendar `expo-notifications`: Expo Go tem limitações
- Inicializações obrigatórias de notificações devem partir de `app/_layout.tsx`/`utils/localNotifications.ts`, porque o `main` atual usa `expo-router/entry`
- Android usa canais versionados `mandatory-expenses-v2` e `mandatory-gains-v2` com alta prioridade; mudar canais exige invalidar fingerprint para reidratar agendas antigas
- Em Android, preferir janelas de notificações `DATE` concretas para recorrências mensais; não depender do trigger mensal nativo para dias 29/30/31
- Notificações são locais (sem servidor) — reinstalar app as apaga
- Alterações em `app.json` para `expo-notifications` exigem novo build nativo
- Em Android, não tentar validar lembretes obrigatórios no Expo Go; usar build de desenvolvimento/produção

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

> Atualizado em 2026-05-02.

- Ajuste visual nas listas de obrigatórios: `screens/MandatoryExpensesListScreen.tsx` e `screens/MandatoryGainsListScreen.tsx` agora posicionam os botões de baixar PDF e adicionar item lado a lado em um `HStack`; vault alinhado em [[Despesas Fixas]] e [[Receitas Fixas]].

- Correção do seletor compartilhado de categorias: `components/uiverse/tag-actionsheet-selector.tsx` agora trata `isDisabled` como bloqueio total de abertura do ActionSheet, sem permitir que a ação interna de criar categoria contorne pré-requisitos das telas. Usos revisados em despesas, ganhos, despesas fixas, receitas fixas e análise por categoria; vault alinhado em [[Gerenciamento de Tags]] e [[Componentes UI]].

- Implementação em andamento: seletor ActionSheet compartilhado para bancos com ícones brasileiros.
- Código afetado: `components/uiverse/bank-actionsheet-selector.tsx`, `hooks/useBankIcons.tsx`, `functions/BankFirebase.ts`, telas de cadastro/seleção de bancos, despesas, ganhos, investimentos, saques, transferências e saldo mensal.
- Vault atualizado: [[Gerenciamento de Bancos]], [[Componentes UI]], [[Transações de Despesas]], [[Transações de Receitas]], [[Investimentos]], [[Resgate de Caixa]], [[Balanço Mensal]], [[Transferências]].
- Ajuste visual posterior: `hooks/useScreenStyle.ts` exporta `fieldBankContainerClassName` com altura mínima para seletores de banco com ícone, e `bank-actionsheet-selector.tsx` alinha nome/helper sem compressão vertical.

- Pull-to-refresh adicionado a telas com dados: `screens/HomeScreen.tsx` recarrega o snapshot via `hooks/useHomeScreenData.ts`, `screens/BankMovementsScreen.tsx` recarrega o período ativo, `screens/FinancialListScreen.tsx` recarrega a carteira de investimentos, `screens/MandatoryExpensesListScreen.tsx` recarrega despesas fixas e revalida lembretes, e `screens/LoginScreen.tsx` reconsulta o cooldown local do email digitado. Vault alinhado em dashboard, bancos, investimentos, despesas fixas, autenticação e hooks.

- `components/uiverse/tag-actionsheet-selector.tsx` agora renderiza a ação de criar nova categoria dentro do próprio ActionSheet; `screens/AddRegisterGainScreen.tsx`, `screens/AddRegisterExpensesScreen.tsx`, `screens/AddMandatoryExpensesScreen.tsx` e `screens/AddMandatoryGainsScreen.tsx` removeram o botão externo desalinhado e passam o callback de criação ao seletor compartilhado. Vault alinhado em tags, componentes, transações e recorrências.

- Exportações PDF de análise por categoria, movimentos bancários/dinheiro e resumos de despesas/receitas fixas agora copiam o arquivo gerado pelo `expo-print` para o cache com nomes contextuais antes do `expo-sharing`.
- Arquivos alterados: `utils/pdfFileName.ts`, `screens/CategoryAnalysisScreen.tsx`, `screens/BankMovementsScreen.tsx`, `screens/MandatoryExpensesListScreen.tsx`, `screens/MandatoryGainsListScreen.tsx`, `package.json`, `package-lock.json` e docs dos módulos afetados.

- Nova tela **Análise por Categoria** adicionada em `/category-analysis`: `components/uiverse/navigator.tsx` ganhou a opção no grupo Home, `screens/CategoryAnalysisScreen.tsx` renderiza relatório dinâmico por tag com `assets/UnDraw/analyzeGainExpensesTag.svg`, e `functions/CategoryAnalysisFirebase.ts` compara mês atual com a média dos 3 meses anteriores, respeitando `shouldIncludeMovementInGainExpenseTotals()` e quebrando o resultado por banco/dinheiro; vault alinhado em `Arquitetura/Análise por Categoria.md`, `Arquitetura/Navegação.md`, `Arquitetura/Dashboard Home.md`, `Arquitetura/Gerenciamento de Tags.md` e `Arquitetura/Gerenciamento de Bancos.md`.
- `screens/CategoryAnalysisScreen.tsx` ganhou exportação **Baixar análise em PDF** usando `utils/categoryAnalysisPdf.ts`, `expo-print` e `expo-sharing`, com valores respeitando a privacidade ativa; `functions/CategoryAnalysisFirebase.ts` passou a expor flags de tag obrigatória, e `components/uiverse/tag-actionsheet-selector.tsx` aceita `description` opcional para mostrar labels de categoria no ActionSheet. Vault alinhado em `Arquitetura/Análise por Categoria.md`, `Arquitetura/Gerenciamento de Tags.md` e `Arquitetura/Componentes UI.md`.
- `screens/CategoryAnalysisScreen.tsx` refinada para usar `components/uiverse/tag-actionsheet-selector.tsx` na seleção de categorias, manter texto/ícones dos botões Gastos/Ganhos legíveis no modo escuro e exibir o percentual correto de variação contra a média histórica, separando esse percentual da participação por banco/dinheiro; vault alinhado em `Arquitetura/Análise por Categoria.md` e `Arquitetura/Gerenciamento de Tags.md`.
- Footer do modal de saldo mensal em `screens/HomeScreen.tsx` reorganizado para manter os botões "Agora não" e "Registrar saldo" lado a lado, com largura flexível e texto ajustável dentro do modal.
- `screens/HomeScreen.tsx` passou a abrir um modal quando há bancos registrados sem `MonthlyBalance` no mês corrente, listando as contas pendentes e levando para `/register-monthly-balance`; vault alinhado em `Arquitetura/Dashboard Home.md` e `Arquitetura/Balanço Mensal.md`.
- Testes automatizados adicionados para notificações obrigatórias: `npm test` roda Jest com mocks de `expo-notifications`, `react-native` e AsyncStorage; `__tests__/mandatoryReminderNotifications.test.ts` força agendamento local com data do sistema fixada e valida canais Android, janela de 12 datas, trigger iOS e bloqueio no Expo Go. Vault alinhado em `Arquitetura/Notificações.md`.
- `screens/AddRegisterTagScreen.tsx` ajustada para separar o bloqueio da escolha exclusiva de tipo do switch "ganhos e despesas": fluxos inline comuns ainda preservam o tipo de origem no rádio, mas permitem ampliar a categoria para `both`; fluxos obrigatórios continuam travando tipo e obrigatoriedade. Vault alinhado em `Arquitetura/Gerenciamento de Tags.md`.
- Formulários com inputs editáveis passaram a usar `hooks/useKeyboardAwareScroll.ts` para manter campos de texto/número acima do teclado; modais de edição em `screens/FinancialListScreen.tsx`, `screens/BankMovementsScreen.tsx` e a busca de ícones em `screens/AddRegisterTagScreen.tsx` foram protegidos com `KeyboardAvoidingView` e área rolável própria, com vault alinhado em `Arquitetura/Hooks Customizados.md` e `Arquitetura/Componentes UI.md`.
- `screens/AddMandatoryExpensesScreen.tsx` e `screens/AddMandatoryGainsScreen.tsx` agora reforçam a rolagem de todos os inputs textuais acima do teclado, incluindo quantidade de parcelas, observações e horário do lembrete; vault alinhado em `Arquitetura/Despesas Fixas.md` e `Arquitetura/Receitas Fixas.md`.
- `screens/MandatoryGainsListScreen.tsx` e `screens/MandatoryExpensesListScreen.tsx` agora exibem resumo mensal do ciclo corrente e permitem baixar PDF local via `expo-print`/`expo-sharing`; `utils/mandatoryPeriodSummaryPdf.ts` centraliza o HTML do relatório e o vault foi alinhado em `Arquitetura/Receitas Fixas.md` e `Arquitetura/Despesas Fixas.md`.
- Parcelamento opcional implementado em `screens/AddMandatoryExpensesScreen.tsx`, `screens/AddMandatoryGainsScreen.tsx`, `screens/MandatoryExpensesListScreen.tsx` e `screens/MandatoryGainsListScreen.tsx`: templates obrigatórios agora podem salvar `installmentTotal`/`installmentsCompleted`, avançam uma parcela ao registrar o ciclo em `functions/MandatoryExpenseFirebase.ts` e `functions/MandatoryGainFirebase.ts`, exibem `Parcela X de Y` na timeline/calendário via `utils/mandatoryInstallments.ts` e bloqueiam novos registros após a última parcela; vault alinhado em `Arquitetura/Despesas Fixas.md` e `Arquitetura/Receitas Fixas.md`.
- Sistema de notificações corrigido para o entry real `expo-router/entry`: `app/_layout.tsx` chama `utils/localNotifications.ts`, os canais Android migraram para `mandatory-expenses-v2`/`mandatory-gains-v2` com alta prioridade e `utils/mandatoryReminderNotifications.ts` agenda uma janela de 12 datas concretas no Android para evitar falhas do trigger mensal nativo.
- Categorias em `screens/AddRegisterGainScreen.tsx`, `screens/AddRegisterExpensesScreen.tsx`, `screens/AddMandatoryExpensesScreen.tsx` e `screens/AddMandatoryGainsScreen.tsx` agora usam `components/uiverse/tag-actionsheet-selector.tsx`, substituindo o menu padrão do Android por ActionSheet estilizado com ícone, nome e estado selecionado; vault alinhado em tags, transações e recorrências.
- `screens/BankMovementsScreen.tsx` agora permite baixar um PDF estilizado do resumo filtrado do período, usando `expo-print` e `expo-sharing`; a documentação foi alinhada em `Arquitetura/Gerenciamento de Bancos.md` e `Arquitetura/Privacidade de Valores.md`.
- Fluxo de retorno pós-submit centralizado em `utils/navigation.ts`: telas de criação/edição de registros financeiros e administrativos agora retornam para `/home?tab=0` com `router.dismissTo`, evitando empilhamento indefinido e uso de `router.back()` após salvar.
- Timeline e calendário de `screens/MandatoryGainsListScreen.tsx` e `screens/MandatoryExpensesListScreen.tsx` agora exibem o valor previsto apenas antes da efetivação do ciclo; após registrar o mês, passam a mostrar o valor real da transação vinculada, com enriquecimento em `functions/MandatoryGainFirebase.ts` e `functions/MandatoryExpenseFirebase.ts` e renderização via `displayValueInCents` em `components/uiverse/date-calendar.tsx`.
- Fluxo pós-submit de `screens/AddRegisterGainScreen.tsx` e `screens/AddRegisterExpensesScreen.tsx` ajustado para voltar à Home após novos registros e edições, incluindo fluxos derivados de recorrências e investimentos.
- Documentação do vault atualizada em `Arquitetura/Navegação.md`, `Arquitetura/Transações de Receitas.md`, `Arquitetura/Transações de Despesas.md`, `Arquitetura/Balanço Mensal.md`, `Arquitetura/Gerenciamento de Bancos.md`, `Arquitetura/Investimentos.md`, `Arquitetura/Transferências.md`, `Arquitetura/Resgate de Caixa.md`, `Arquitetura/Despesas Fixas.md`, `Arquitetura/Receitas Fixas.md`, `Arquitetura/Gerenciamento de Tags.md`, `Arquitetura/Gerenciamento de Usuários.md` e `Arquitetura/Configurações.md` para refletir o retorno seguro para a Home.
- Padronização do seletor de categoria obrigatória nas telas `screens/AddMandatoryExpensesScreen.tsx` e `screens/AddMandatoryGainsScreen.tsx` para seguir o mesmo fluxo das telas de registro, com criação inline de tag e retorno automático.
- Paginação numérica adicionada às tabelas da `screens/ConfigurationsScreen.tsx` quando a listagem visível ultrapassa 5 registros.
- `screens/ConfigurationsScreen.tsx` migrada para `components/uiverse/notifier-alert.tsx` como canal padrão de alertas in-app.
- Documentação revisada em `Arquitetura/Configurações.md` para refletir a presença de tabelas administrativas, ações inline e o reaproveitamento de `useScreenStyle()`.
- Card de privacidade da `screens/ConfigurationsScreen.tsx` realinhado para manter o popover ao lado do título, o switch no extremo direito e os textos de helper/status consistentes com o fluxo documentado em `Arquitetura/Configurações.md` e `Arquitetura/Privacidade de Valores.md`.
- Card de tema da `screens/ConfigurationsScreen.tsx` padronizado com a mesma composição visual do toggle de privacidade, incluindo popover inline, status textual e `Switch` alinhado à direita.
- Listagem da `screens/FinancialListScreen.tsx` portada para uma timeline expansível no mesmo padrão das telas recorrentes, preservando as ações de aporte, resgate, sincronização manual, edição e exclusão dentro do card expandido, agora com paleta própria em degradê rosa com azul para diferenciar investimentos do restante do sistema e grade de ações fixa em duas linhas: 3 ações na primeira e 2 na segunda.
- `Arquitetura/Investimentos.md` revisado para documentar a timeline da carteira, os dados exibidos em cada card e o papel da sincronização manual como etapa obrigatória antes de aportes e resgates.
- `components/uiverse/navigator.tsx` alinhado ao fluxo de `screens/FinancialListScreen.tsx` e `screens/AddFinanceScreen.tsx`, passando a exibir `Registrar investimento` como rótulo ativo quando a rota corrente é `/add-finance`, no mesmo padrão já aplicado aos ganhos obrigatórios.
- Vault atualizado em `Arquitetura/Navegação.md` e `Arquitetura/Investimentos.md` para documentar a troca dinâmica de rótulo do navigator em fluxos de cadastro derivados de listagens.
- Sistema legado de alertas in-app baseado em `components/uiverse/floating-alert.tsx` removido; `components/uiverse/notifier-alert.tsx` passa a ser o canal único de feedback visual em telas de investimentos, transferências, resgates, vínculos, bancos e tags, com o vault alinhado em `Arquitetura/Notificações.md`, `Arquitetura/Componentes UI.md` e `Arquitetura/Configurações.md`.
- `components/uiverse/navigator.tsx` consolidado como padrão único de navegação inferior e o vault atualizado em `Arquitetura/Navegação.md` e `Arquitetura/Componentes UI.md` para refletir a remoção do componente legado.
- `screens/AddFinanceScreen.tsx` ajustada para seguir o fluxo progressivo de preenchimento já usado nas telas de cadastro: cada campo principal é liberado pela etapa anterior, o banco só abre após nome/valor/data/CDI e o salvamento aguarda a consulta do saldo atual.
- `Arquitetura/Investimentos.md` revisado para documentar o cadastro guiado em etapas na criação de investimentos e o bloqueio de envio durante a consulta do saldo bancário.
- `screens/AddFinanceScreen.tsx` deixou de usar skeletons: o formulário aparece imediatamente e o carregamento de bancos/saldo é comunicado por mensagens inline, com documentação alinhada em `Arquitetura/Investimentos.md`.
- `screens/AddFinanceScreen.tsx` passou a exibir popovers explicativos nos labels dos campos principais do cadastro de investimento; `components/uiverse/date-picker.tsx` recebeu `accessibilityLabel` customizado para sustentar labels externos com acessibilidade preservada, com vault atualizado em `Arquitetura/Investimentos.md` e `Arquitetura/Componentes UI.md`.
- `screens/BankMovementsScreen.tsx` passou a separar os totais gerais do card superior do resumo filtrado do período, adicionando filtro contextual por tags e cards próprios para ganhos/despesas que acompanham os filtros ativos; vault alinhado em `Arquitetura/Gerenciamento de Bancos.md` e `Arquitetura/Gerenciamento de Tags.md`.
- `components/uiverse/date-picker.tsx` teve o modal realinhado ao padrão visual do sistema: botão de fechar alinhado ao heading, navegação mensal em largura total acima do calendário, remoção do divisor inferior e rodapé com ações `Cancelar`/`Hoje` reaproveitando os tokens de `useScreenStyle()`, incluindo cores derivadas explicitamente do tema dentro do portal do modal para evitar faixas claras indevidas no modo escuro.
