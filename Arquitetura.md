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

## Active Context

> Atualizado em 2026-04-03.

- Padronização dos botões e ações da `screens/ConfigurationsScreen.tsx` para o componente `Button` do design system, seguindo o mesmo padrão visual das telas de cadastro.
- Coluna de ações das tabelas da `screens/ConfigurationsScreen.tsx` refinada para uma faixa fixa à direita com botões compactos por ícone.
- Classes compartilhadas das tabelas da `screens/ConfigurationsScreen.tsx` centralizadas em `hooks/useScreenStyle.ts`.
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
