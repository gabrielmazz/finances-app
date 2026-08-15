---
tags: [bancos, financeiro, movimentos, saldo]
relacionado: [[Dashboard Home]], [[Análise por Categoria]], [[Transações de Despesas]], [[Transações de Receitas]], [[Transferências]], [[Resgate de Caixa]], [[Balanço Mensal]], [[Comportamento Pós-Registro]]
status: ativo
tipo: feature
versao: 1.7.0
---

# Gerenciamento de Bancos

Permite criar e gerenciar contas bancárias, visualizar movimentos por período e acompanhar o saldo de cada conta. É o núcleo financeiro do app.

> **Transição do razão (2026-08-11):** o fluxo abaixo continua sendo o legado para grupos ainda não migrados. Após o corte confirmado, bancos passam a ser financialAccounts do tipo bank, Caixa é uma conta do tipo cash e os saldos vêm de eventos imutáveis e reconciliações. Nenhum documento legado é removido; a ligação é preservada pelo legacyBankId.

## Como funciona

### Cadastro de Banco
1. `AddRegisterBankScreen.tsx` coleta nome, cor visual e ícone do banco
2. Chama `BankFirebase.ts` para salvar no Firestore
3. O banco fica disponível como destino/origem de despesas, receitas, investimentos, saques, saldos mensais e transferências via ActionSheet com ícone
4. Após criar ou editar um banco, `AddRegisterBankScreen.tsx` aplica [[Comportamento Pós-Registro]] depois do feedback de sucesso

### Desativação reversível
1. A tabela de bancos em `ConfigurationsScreen.tsx` exibe bancos ativos e desativados, mantendo o registro e o histórico financeiro no Firestore
2. A ação **Desativar banco** grava `isActive: false` no documento existente; a ação muda para **Reativar banco** enquanto o banco estiver desativado
3. Bancos desativados não são retornados por `getAllBanksFirebase()`, `getBanksByPersonFirebase()` ou `getBanksWithUsersByPersonFirebase()`, portanto deixam de aparecer nos seletores de despesas, ganhos, investimentos, saques, transferências e saldos
4. A alteração é confirmada em modal e o feedback informa que o cadastro/histórico foram preservados; excluir o documento continua sendo uma ação separada e destrutiva

### Visualização de Movimentos

```mermaid
graph TD
    BMS[BankMovementsScreen] --> DP[DatePicker - período]
    BMS --> FT[Filtro tipo: ganhos/gastos/todos]
    BMS --> FTG[Filtro por tag contextual]
    DP --> LOAD[Carrega movimentos do período]
    LOAD --> CARD[Card superior - totais gerais]
    LOAD --> RESUMO[Resumo filtrado do período]
    RESUMO --> PDF[Exportação PDF do resumo filtrado]
    LOAD --> LIST[Lista de movimentos]
    FT --> RESUMO
    FTG --> RESUMO
    FT --> LIST
    FTG --> LIST
```

1. `BankMovementsScreen.tsx` exibe todos os movimentos de um banco em um período selecionado
2. Filtra por data via `DatePicker` customizado
3. Permite refinar a listagem por tipo (`ganhos`, `gastos` ou `todos`) e por tag, usando apenas as tags presentes nas movimentações carregadas para aquele banco/período
4. O card superior do banco mantém os totais gerais do período carregado e **não reage** aos filtros de tipo/tag
5. Um resumo separado do período exibe ganhos, despesas, saldo líquido e quantidade de movimentações de acordo com os filtros ativos
6. O resumo filtrado permite baixar um PDF estilizado do período ativo, incluindo dados do banco/dinheiro, totais gerais, totais filtrados e a lista de movimentações visíveis
7. A lista pode ser recarregada manualmente por pull-to-refresh, preservando o período, o banco/dinheiro e os filtros locais
8. Cada movimento exibe: data, descrição, tag com ícone (via `<TagIcon />`), valor (entrada/saída colorido); despesas obrigatórias usam a paleta visual vermelha de despesa também no ícone, linha, card expandido e valor monetário
9. Edições acionadas pela timeline devem permanecer na tela atual após sucesso; movimentos comuns abrem `AddRegisterGainScreen.tsx`/`AddRegisterExpensesScreen.tsx`, e edição de investimento no modal local segue a mesma regra de permanência
10. Enquanto `BankMovementsScreen.tsx` está aberta, o grupo Home do `components/uiverse/navigator.tsx` exibe uma opção contextual **Movimentos do banco** entre **Início** e **Análise por Categoria**, permitindo reconhecer a tela atual e voltar para o Dashboard pela opção **Início**
11. Transferências bancárias são incluídas no extrato tanto pela associação direta `bankId` quanto pelos metadados `bankTransferSourceBankId`/`bankTransferTargetBankId`, garantindo que o banco de origem veja a saída e o banco de destino veja a entrada

### Saldo Calculado
- Saldo atual = saldo do último `MonthlyBalance` + movimentos posteriores a esse snapshot
- A função `computeMonthlyBankBalances()` em `utils/monthlyBalance.ts` agrega despesas, receitas e investimentos por banco
- `shouldIncludeMovementInGainExpenseTotals()` filtra movimentos internos para evitar dupla contagem
- A [[Análise por Categoria]] usa os bancos como dimensão de distribuição mensal da tag selecionada; movimentos sem `bankId` aparecem como **Dinheiro**

## Arquivos principais

### Razão após o corte do grupo

- O saldo materializado é verificável: última reconciliação com data/hora exata mais as partidas posteriores.
- Cada evento é balanceado em duas pernas. Despesa/receita usa contrapartida externa; transferência, saque e fluxo de investimento movem duas contas.
- Membros lançam e estornam apenas seus próprios eventos. Administradores também administram contas, reconciliações e migração.
- Banco pode ficar negativo com justificativa; Caixa nunca pode ficar negativo.


- `screens/AddRegisterBankScreen.tsx` — Formulário de cadastro
- `screens/ConfigurationsScreen.tsx` — Tabela administrativa com edição, exclusão e ativação/desativação reversível
- `components/uiverse/bank-actionsheet-selector.tsx` — Seletor de banco em ActionSheet com ícone e estado selecionado
- `hooks/useBankIcons.tsx` — Catálogo de ícones/monogramas para bancos brasileiros
- `screens/BankMovementsScreen.tsx` — Listagem de movimentos por período
- `functions/BankFirebase.ts` — CRUD de bancos e busca de movimentos
- `utils/monthlyBalance.ts` — `computeMonthlyBankBalances()` + filtros de movimentos
- `app/add-register-bank.tsx` — Rota de cadastro
- `app/bank-movements.tsx` — Rota de movimentos
- `app/bank-summary.tsx` — Redirect para `/home?tab=0` (rota legada)
- `components/uiverse/navigator.tsx` — Mostra a opção contextual **Movimentos do banco** no grupo Home apenas em `/bank-movements`
- `utils/navigation.ts` — Saída explícita para Home pelo voltar físico/navigator
- `hooks/usePostSubmitBehavior.ts` — Aplica retorno/limpeza após salvar nos formulários de bancos, transferências, saques e saldos

## Integrações

- [[Transações de Despesas]] — Despesas vinculadas a bancos
- [[Transações de Receitas]] — Receitas vinculadas a bancos
- [[Transferências]] — Movimentos de transferência entre bancos
- [[Resgate de Caixa]] — Resgate debita de banco específico
- [[Balanço Mensal]] — Snapshot usado como base do saldo
- [[Gerenciamento de Tags]] — Tags exibidas nos movimentos e disponíveis como filtro
- [[Dashboard Home]] — Bancos aparecem no carrossel e gráficos
- [[Análise por Categoria]] — Exibe quanto da categoria selecionada ocorreu em cada banco/dinheiro no mês atual
- [[Hooks Customizados]] — `useTagIcons` renderiza ícones nos movimentos
- [[Comportamento Pós-Registro]] — Define retorno/limpeza após salvar formulários bancários

## Configuração

- Cada banco tem `colorHex` (hex string) para personalização visual e `iconKey` opcional para exibir ícone/monograma
- Cada banco possui `isActive`; documentos legados sem o campo são tratados como ativos por compatibilidade
- Saldo inicial registrado como `MonthlyBalance` do mês de criação
- A exportação do resumo usa `expo-print` para gerar o PDF local, copia o arquivo para o cache com nome contextual `Lumus-Financas-Movimentos-[Banco|Dinheiro]-[conta]-[periodo]-[data].pdf` e usa `expo-sharing` para abrir o fluxo de download/compartilhamento do dispositivo

## Observações importantes

- Transferências entre bancos geram dois movimentos (débito em um, crédito em outro) — ambos do tipo especial para não duplicar totais
- A busca de movimentos bancários reforça transferências por metadados de origem/destino para exibir a saída no banco remetente e a entrada no banco recebedor, mesmo quando um registro antigo não é retornado apenas pelo `bankId`
- O `BankMovementsScreen` recebe o banco via parâmetros de rota do Expo Router
- Cores dos bancos são misturadas com gradiente em `bank-card-surface.tsx`
- O catálogo de ícones usa monogramas estilizados, não imagens oficiais externas; bancos sem `iconKey` caem no ícone genérico com iniciais do nome
- Seletores de banco em telas de criação devem usar `bank-actionsheet-selector.tsx`, não o `Select` padrão, para manter ícone, busca visual por instituição e consistência com o seletor de categorias
- Cadastros de banco, saques, transferências e saldos mensais seguem [[Comportamento Pós-Registro]] para retorno/limpeza e mantêm uma trava síncrona de submit enquanto o Firestore responde, evitando registros duplicados por toques repetidos
- O filtro de tags é contextual: as opções exibidas dependem do tipo selecionado e das movimentações já carregadas no período
- O resumo filtrado do período muda com os filtros locais, mas o card superior continua exibindo os totais gerais do período consultado
- O PDF segue o mesmo escopo do resumo filtrado: tipo/tag ativos, período selecionado e valores mascarados quando a [[Privacidade de Valores]] está ativa
- `BankMovementsScreen.tsx` intercepta o retorno físico pelo `Navigator` para cair em `/home?tab=0` sem depender de `router.back()`
- A opção **Movimentos do banco** no navigator é contextual e não deve aparecer em outras telas do grupo Home

## Integração com o Assistente Lumus

- Criar banco pelo [[Assistente Lumus]] exige nome, ciclo e saldo inicial; banco e `MonthlyBalance` são criados na mesma transação.
- Bancos enviados ao modelo usam handles opacos. Antes de editar/excluir, o aplicativo recarrega o documento do UID atual e compara o fingerprint mostrado no cartão.
