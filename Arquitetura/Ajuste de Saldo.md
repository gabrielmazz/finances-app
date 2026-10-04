---
tags: [bancos, saldo, reconciliacao, firebase, formularios, web, mobile]
relacionado: [[Gerenciamento de Bancos]], [[Balanço Mensal]], [[Configurações]], [[Navegação]], [[Previsão de Fluxo de Caixa]], [[Cache e Leituras Firebase]], [[Privacidade de Valores]], [[Auditoria de Design]]
status: ativo
tipo: feature
versao: 1.0.0
---

# Ajuste de Saldo

Recurso de último caso para registrar a diferença entre o saldo calculado no Lumus e o saldo real conferido pelo usuário no banco. O aplicativo não consulta nem altera a conta da instituição financeira.

## Como funciona

1. Abrir **Configurações → Relações dentro do Aplicativo → Ajuste de saldo** no Web ou mobile.
2. Escolher um banco ativo, informar seu saldo real em reais, a data e uma descrição opcional. O botão de sinal permite informar saldo negativo com o teclado numérico; nesse caso a descrição exige pelo menos três caracteres.
3. A callable calcula a prévia com dados autorizados do servidor. Todos os cálculos e valores persistidos são centavos inteiros seguros.
4. O registro contém somente `saldo informado − saldo calculado`. Com R$ 100,00 no Lumus e R$ 120,00 informados, é registrado **+R$ 20,00**. Se o saldo informado for R$ 80,00, o registro será **−R$ 20,00**.
5. A diferença afeta o saldo bancário, mas nunca os totais, médias ou gráficos de ganhos/despesas. O saldo-base da previsão de caixa incorpora ajustes posteriores à abertura da conta.
6. Salvar compara o saldo atual da prévia; se outro lançamento alterar a base, o servidor rejeita a operação e o formulário atualiza a prévia sem apagar o rascunho.
7. Um `clientActionId` identifica a tentativa. Recibos atômicos impedem duplicação por repetição/reconexão; uma resposta incerta conserva o mesmo comando para nova tentativa.
8. O sucesso invalida o cache financeiro e retorna ao extrato do banco, no mês da data escolhida, usando uma única navegação diferida. Conclusões de formulário desfocado não redirecionam a tela atual.

## Data e saldos de abertura

- A data é civil de **America/Sao_Paulo**. Hoje usa o instante da confirmação; datas passadas usam o fim daquele dia. Datas futuras e inválidas são rejeitadas no servidor.
- O usuário deve informar o saldo ao final do dia quando escolher uma data passada. Movimentações posteriores continuam sendo somadas/subtraídas normalmente.
- No legado, a base é o `MonthlyBalance` mais recente até a data, com corte no início do mês em São Paulo, acrescido de ganhos e ajustes e descontado de despesas, saques e investimento inicial. Sem abertura, o formulário orienta registrá-la primeiro.
- No razão, a base é o saldo atualizado de `financialAccounts`, descontadas as movimentações posteriores à data. A ação exige administrador do grupo ativo e conta bancária ativa; datas anteriores ou iguais à abertura mais recente não são aceitas.
- Uma abertura posterior estabelece uma nova referência. Reverter um ajuste histórico anterior a essa abertura preserva a correção do histórico sem alterar o saldo contado na abertura posterior.

## Edição, reversão e extrato

- Os dois `BankMovementsScreen` mostram o ajuste em **magenta**, definido em `LUMUS_BALANCE_ADJUSTMENT_TONE`, com ícone próprio, descrição, diferença assinada e saldos anterior/informado.
- Ajustes e estornos aparecem em **Todos**. Os filtros **Ganhos/Despesas**, os totais e o gráfico diário usam `shouldIncludeMovementInGainExpenseTotals` para excluí-los.
- Somente o autor pode editar/reverter um ajuste ativo original, sujeito às permissões e conta ativa. Estornos e registros substituídos/revertidos não oferecem alteração.
- A edição mantém o banco, calcula a base sem o ajuste anterior, registra seu inverso e cria um novo ajuste na mesma transação. O documento anterior recebe status `replaced`.
- A reversão cria um inverso na **mesma data efetiva do original**, que recebe status `reversed`. Isso evita descontar um ajuste antigo novamente após um snapshot posterior. `createdAt`/`reversedAt` preservam o instante em que o estorno foi confirmado.
- Eventos não são apagados. Os lançamentos anteriores, inversos e substituições continuam visíveis para auditoria.
- O card **Saldo atual** lê o saldo completo da conta, independentemente do período filtrado. No razão, o extrato alcança contas novas e migradas; outros lançamentos imutáveis são somente leitura pelos controles legados.

## Persistência e permissões

`bankBalanceAdjustments/{personId_clientActionId}` contém:

| Campo | Regra |
|---|---|
| `bankId`, `personId`, `groupId` | Conta, autor e grupo derivado da sessão; grupo nulo no legado |
| `date` | Data efetiva escolhida |
| `differenceInCents` | Diferença assinada |
| `previousBalanceInCents`, `targetBalanceInCents` | Base calculada e saldo informado |
| `description` | Motivo opcional, máximo 2000 caracteres |
| `status` | `active`, `reversed` ou `replaced` |
| `reversesAdjustmentId`, `replacesAdjustmentId` | Vínculos do histórico |
| `ledgerTransactionId` | Evento correspondente no razão, quando houver diferença não zero |
| `createdAt`, `reversedAt`, `reversedBy`, `reversalId` | Auditoria da confirmação/reversão |

`bankBalanceAdjustmentOperations` guarda recibos privados da callable. O cliente não pode escrever nas duas coleções nem ler os recibos. Ajustes são legíveis pelo autor, pelos usuários relacionados autorizados ou pelos membros de seu grupo.

No razão, a transação também grava uma `ledgerTransaction` balanceada de `reconciliation_adjustment`/`reversal`, atualiza `financialAccounts.currentBalanceInCents`, incrementa o mapa `bankDeltaInCents` do resumo mensal e grava `financialAuditEvents`. Nenhum snapshot novo é criado. O estorno genérico de `reverseTransaction` rejeita eventos deste recurso para impedir um segundo caminho de reversão sem atualizar o histórico dedicado.

O dry-run/backfill de migração incorpora os ajustes legados e seus inversos como diferenças assinadas, com referências à coleção original. O filtro temporal da reconciliação evita reaplicar ajustes anteriores ao saldo de abertura migrado.

## Arquivos principais

- `screens/mobile/BankBalanceAdjustmentScreen.tsx` / `screens/web/BankBalanceAdjustmentScreen.web.tsx` — composições de plataforma.
- `components/uiverse/banks/bank-balance-adjustment-form.tsx` — formulário compartilhado, controles existentes de banco/data e prévia.
- `hooks/useBankBalanceAdjustmentForm.ts` — abertura, validação, prévia, draft, locks e retry.
- `functions/BankBalanceAdjustmentFirebase.ts` — comandos e leitura autorizada do histórico.
- `backend/src/bankBalanceAdjustments.ts` — callable `bankBalanceAdjustment`, região `southamerica-east1`.
- `utils/bankBalanceAdjustment.ts` / `utils/monthlyBalance.ts` — diferenças e regras de saldo/totais.
- `assets/UnDraw/bankBalanceAdjustmentScreen.svg` — ilustração fornecida, renomeada de `undraw_printing-invoices_g6c9.svg`.
- `tests/bankBalanceAdjustment*.test.ts` / `backend/tests/bankBalanceAdjustments.emulator.test.ts` — cálculos, retry, preservação do draft, integração e regras.

## Navegação, privacidade e configuração

- Rotas `/mobile/bank-balance-adjustment` e `/web/bank-balance-adjustment` registradas em `APP_ROUTE_PATHS` e protegidas pelo guard autenticado derivado do registro central.
- Entrada pela seção de relações e edição pelo extrato; não há novo item no navigator.
- Este fluxo de conferência tem retorno fixo ao extrato com `bankId`, `bankName` e `focusDate`, sem preferência de limpeza/permanência em [[Comportamento Pós-Registro]]. O histórico precisa ser revisável imediatamente após a confirmação; não usa `router.back` como pós-submit.
- A prévia, detalhes e PDF do extrato respeitam [[Privacidade de Valores]]. Com valores ocultos, a edição exige digitar o saldo real novamente, sem expor o valor anterior no campo.
- Antes de liberar o cliente em produção, publicar a callable, as regras e os índices financeiros versionados. Não há nova dependência, Remote Config nem serviço externo. A implementação foi validada localmente, sem deploy remoto.

## Validação e limites

Cálculos, migração, forecast, retry e navegação passaram em 46 testes focados; testes de Emulator cobrem ganhos posteriores, saldo divergente positivo/negativo, edição, estorno, recibos repetidos/concorrentes, bloqueio de saldo stale, autenticação e acesso indevido. O atalho em Configurações abriu o formulário no navegador local; prévia e validação de saldo negativo também foram verificadas, inclusive em largura de celular. Bundles Web e Android de produção e Android de desenvolvimento foram gerados.

Não houve execução instalada Android/iOS nem medição de Core Web Vitals: o conector Chrome DevTools requerido pela skill `cloudflare:web-perf` não estava disponível. O lint de estilos permanece bloqueado somente por dívida anterior de `ConfigurationsScreen.web.tsx`; a suíte completa mantém duas falhas anteriores de perfil/login. Ver [[Auditoria de Design]] para evidências e riscos residuais.

## Integração conversacional — 2026-10-03

O chat usa a mesma callable `bankBalanceAdjustment` das telas para salvar, substituir ou estornar. A proposta é versionada, confirma o efeito por mensagem e envia a identidade do pedido, `expectedActorId`, `expectedFingerprint` do ajuste e saldo anterior esperado. O servidor consulta o recibo antes do documento já alterado pelo próprio commit, compara um fingerprint SHA-256 de todos os argumentos materiais e recusa reenvio que mude valor, data, descrição, alvo ou saldo esperado. Troca tardia de UID, saldo stale, banco inativo e papel insuficiente não gravam. O teste real `bankBalanceAdjustments.emulator.test.ts` cobre legado/razão, retry concorrente, argumentos alterados, substituição/estorno e revalidação de identidade. Ver [[Comandos Financeiros Conversacionais]].
