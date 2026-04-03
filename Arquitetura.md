# Arquitetura.md — Lumus Finanças

> Guia operacional para este projeto.
> Leia este arquivo **inteiro** antes de qualquer alteração.

---

## Vault de Documentação

**Localização:** `C:\Users\Gabriel Mazzuco\Documents\Programação\Documentações\Lumus Finance`
**MCP Obsidian:** `http://localhost:22363/sse`

O vault é a **fonte de verdade** do projeto. Toda feature, decisão arquitetural e regra de negócio está documentada lá. Antes de implementar qualquer coisa, consulte o arquivo relevante no vault.

### Mapa do Vault por Tipo de Tarefa

| Tarefa | Arquivo no Vault |
|---|---|
| Entender o projeto todo | `MOC - Lumus Finanças.md` |
| Trabalhar em autenticação | `Autenticação.md`, `Segurança de Login.md` |
| Trabalhar no dashboard | `Dashboard Home.md`, `Hooks Customizados.md` |
| Trabalhar em bancos | `Gerenciamento de Bancos.md`, `Balanço Mensal.md` |
| Trabalhar em transações | `Transações de Despesas.md`, `Transações de Receitas.md` |
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
- Detectar ambiente antes de agendar: Expo Go tem limitações
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

## Lacunas de Documentação Identificadas

As seguintes áreas não têm documentação detalhada no vault ainda:

- [ ] **Regras de segurança do Firestore** — não estão no repositório, apenas no console Firebase
- [ ] **Estrutura de coleções do Firestore** — schema dos documentos não documentado
- [ ] **Processo de build e deploy EAS** — fluxo de publicação não documentado
- [ ] **BankSummaryScreen** — tela existe mas não tem arquivo dedicado no vault
- [ ] **Cálculo CDI detalhado** — algoritmo exato de `FinancesFirebase.ts` não documentado
- [ ] **Relacionamento entre usuários** — como a visibilidade compartilhada funciona em detalhe

---

## Active Context

> Atualizar manualmente a cada sessão com o que está sendo trabalhado.

**Branch atual:** `NS31-redesign-das-telas-de-gastos-ganhos-e-investimentos`

**Em andamento:**
- NS31 — refatoração dos lembretes de vencimento/recebimento para obrigatórios
- Novo serviço compartilhado em `utils/mandatoryReminderNotifications.ts`
- Novo utilitário de máscara e validação em `utils/mandatoryReminderTime.ts`
- Horário customizável de lembrete nas telas de gastos e ganhos obrigatórios
- Feedback de lembrete com próxima data real agendada e mensagens personalizadas por gasto/ganho
- Remoção do carregamento por Skeleton nas telas de cadastro/edição de obrigatórios, mantendo o formulário visível durante prefill e carregamento de tags
- Configuração nativa ajustada em `app.json` para `expo-notifications`
- Correção do estado inicial dos switches de lembrete em obrigatórios: formulário novo/resetado começa com lembrete desligado e controle bloqueado até os campos mínimos serem preenchidos
- Refino visual do modal `Resumo diário` dos obrigatórios com linha-resumo clicável + card expansível no padrão da timeline, metadados compactados em duas linhas, altura responsiva com rolagem interna e remoção da borda vermelha do botão de cancelar compartilhado
- Padronização visual do `ModalCloseButton` nos modais compartilhados
- Ajuste do `components/uiverse/navigator.tsx` para refletir as rotas de cadastro/edição de obrigatórios e alinhar o card do menu ao tema escuro do app
- Padronização da timeline de últimas movimentações da `HomeScreen` com o mesmo modelo visual das telas de movimentações e obrigatórios
- Padronização das cores do skeleton do carrossel de bancos da `HomeScreen`, removendo o fundo cinza e alinhando a paleta do card aos tokens globais de tela
- Suporte a recorrências por dia útil em gastos/ganhos obrigatórios, com cálculo do mês baseado em fins de semana e feriados nacionais do Brasil
- Destaque visual de feriados nacionais no `components/uiverse/date-calendar.tsx`, incluindo marcador roxo e círculo dividido quando o item cai em feriado
- Propagação do contexto de dia útil para o prefill das telas de lançamento manual e para o agendamento dos lembretes obrigatórios

**Arquivos com mudanças não commitadas:**
- `components/uiverse/date-calendar.tsx`
- `hooks/useScreenStyle.ts`
- `components/uiverse/navigator.tsx`
- `components/ui/modal/index.tsx`
- `functions/MandatoryExpenseFirebase.ts`
- `functions/MandatoryGainFirebase.ts`
- `screens/AddMandatoryExpensesScreen.tsx`
- `screens/AddMandatoryGainsScreen.tsx`
- `screens/AddRegisterExpensesScreen.tsx`
- `screens/AddRegisterGainScreen.tsx`
- `screens/AddRegisterTagScreen.tsx`
- `screens/BankMovementsScreen.tsx`
- `screens/MandatoryExpensesListScreen.tsx`
- `screens/MandatoryGainsListScreen.tsx`
- `screens/HomeScreen.tsx`
- `functions/HomeFirebase.ts`
- `utils/businessCalendar.ts`
- `utils/mandatoryExpenseNotifications.ts`
- `utils/mandatoryGainNotifications.ts`
- `utils/mandatoryReminderNotifications.ts`
- `utils/mandatoryReminderTime.ts`
- `Arquitetura.md`

**Último commit:** `NS30 - Alteração na tela de movimento de bancos, trazendo as novas implementações de tags`

**Próximos passos:** validar em build nativo o disparo dos lembretes com horário customizado e revisar a experiência de edição/exclusão após reagendamento.
