---
tags: [spark, financeiro, migracao, reconciliacao, seguranca]
relacionado: [[Protocolo Financeiro Spark]], [[Plano de Funcionalidade Completa sem Blaze]], [[Balanço Mensal]], [[Ajuste de Saldo]], [[Investimentos]], [[Firebase Config]]
status: em desenvolvimento
tipo: arquitetura
versao: 0.2.0
---

# Reconciliação de Dados Spark

Análise local de snapshots normalizados do legado ou do razão. Compara posições com histórico e prepara entradas temporais por conta para revisão. Não acessa Firebase, não contém credenciais, não inicializa saldos reais e não executa migração.

## Como funciona

`utils/sparkFinancialReconciliation.ts` reutiliza `createLegacyMigrationPlan`, `calculateLegacyBankBalanceInCents`, o validador do razão e o adaptador civil IANA existente. A análise distingue abertura mensal inclusiva de reconciliação exata exclusiva, soma diferenças/inversos históricos e mantém referências aos documentos fonte. Caixa recebe a identidade de destino `cash`, preservando `sourceAccountId` no relatório.

O relatório contém contas, entradas temporais, saldo calculado, saldo fonte, diferença e saldos nas datas de verificação solicitadas. `sourceCompleteness: provided-snapshot-only` significa que o programa analisou os documentos fornecidos; ele não prova que a exportação contém tudo que existia no projeto. `eligibleForReviewedBootstrap` só é verdadeiro quando não há pendências locais. Esse campo nunca autoriza importação nem corte de grupo.

São bloqueios: contas/documentos/eventos duplicados, aberturas ambíguas no mesmo instante, contrapartidas ausentes ou reutilizadas, bancos/valores/datas divergentes em pares, tipos desconhecidos, datas/centavos inválidos, referências ausentes, saldo fonte divergente, saldo negativo em caixa/investimento, abertura bancária ausente, caixa não conferido, classificação legada sem normalização e investimento sem posição observada independente. Uma abertura posterior pode esconder uma divergência antiga; por isso conferir apenas o saldo atual é insuficiente.

Valor atual de investimento precisa ser fornecido por `observedInvestmentBalancesInCents`, por ID legado, obtido independentemente do principal importado. Principal de 1.000 e valor observado de 1.500 produzem diferença de -500 e bloqueiam bootstrap; não se cria rendimento, sincronização ou saldo fictício para zerar o relatório. O protocolo v0.4 de [[Protocolo Financeiro Spark]] já demonstra agendamento/ativação de aberturas futuras, mas este analisador continua bloqueando dados futuros: o importador ainda precisará conferir e inicializar o menor `nextActivationAt`, os ponteiros mensais e o calendário protegido. Não basta somar essas entradas nem preencher o prazo com null.

## Execução local

```sh
npm run spark:reconcile -- --mode ledger --input /caminho/snapshot.json --output /caminho/relatorio.json
npm run spark:reconcile -- --mode legacy --input /caminho/snapshot.json --output /caminho/relatorio.json
```

Caminhos relativos são resolvidos a partir da pasta em que o comando foi chamado. A saída precisa ser diferente da entrada e ainda não existir. O programa imprime somente quantidade de contas/pendências; o relatório local contém valores e referências e deve receber a mesma proteção da exportação. Retorno zero significa análise local sem pendências; retorno diferente de zero significa pendência ou erro de execução. O wrapper npm pode normalizar o código não zero do processo filho.

## Contrato de entrada

Não é o formato binário de exportação gerenciada nem uma cópia bruta das coleções. O adaptador de inventário/migração real ainda precisa preparar este formato e comprovar sua completude, preservando o snapshot original.

Modo `ledger`: contrato de `reconcileSparkLedgerSnapshot`:

- `groupId`, `asOf` ISO com instante/fuso explícitos;
- `accounts`: `FinancialAccountSeed[]`, incluindo o saldo armazenado independente `currentBalanceInCents`;
- `transactions`: `LedgerTransaction[]`, incluindo legs, ator, data e referências;
- `reconciliations`: `AccountReconciliation[]` com fonte `manual` ou `legacyMonthStart`;
- `verificationDates`: datas ISO opcionais; `preflightIssues`: pendências opcionais do inventário.

Modo `legacy`: contrato de `LegacyMigrationInput` mais `asOf`, `verificationDates` opcional e `observedInvestmentBalancesInCents` quando houver investimentos. Arrays esperados: `memberIds`, `banks`, `expenses`, `gains`, `bankTransfers`, `cashRescues`, `investments`, `monthlyBalances`; ajustes em `balanceAdjustments` são opcionais. Datas de movimentos são `effectiveAt`. Valores normalizados permanecem em centavos. Caixa precisa de `confirmedCashBalanceInCents` e `confirmedAt` explícitos.

No legado, `asOf` segue o fim do dia civil do calculador existente; no razão, representa o instante exato. Snapshots mensais são convertidos pelo calendário São Paulo, inclusive DST. O módulo antigo permanece intacto; esta análise corrige a aproximação UTC−03 somente na projeção candidata Spark. Não altera o histórico publicado.

## Calendário e bootstrap

`createSparkCivilMonthCalendar(firstYear, lastYear)` produz ciclos com `startAt`, `endAt` e até 31 `dayEnds`, com São Paulo/IANA. Intervalo permitido: 1970–2100, selecionado explicitamente. Preparar o calendário junto do futuro bootstrap administrativo, conferir versão/intervalo e ampliar se necessário. As Rules permitem apenas leitura autenticada; cliente não escolhe o horário do ciclo.

O teste integrado importa **somente fixtures no Emulator**, com Rules desabilitadas no harness, e compara sua projeção autenticada pelas Rules aos saldos históricos do relatório. Entradas importadas usam uma raiz neutra seguida de `imported_checkpoint`/`imported_movement` encadeados. Esses tipos não possuem create cliente. Isso demonstra o contrato temporal; não é um procedimento de migração remota.

Antes de dados reais: inventário autorizado, snapshot de dados/Rules, consentimentos, conferência independente dos saldos e referências, manifesto completo, resolução de pendências, ensaio de restauração e bloqueio dos escritores antigos. Importação, administração de credenciais e corte não fazem parte deste comando. Não executar cliente antigo e protocolo Spark em paralelo na mesma conta.

## Arquivos principais

- `utils/sparkFinancialReconciliation.ts`: projeção, análise legado/razão e gerador civil.
- `backend/scripts/reconcileSparkSnapshot.ts`: entrada/relatório local, sem acesso remoto.
- `tests/sparkFinancialReconciliation.test.ts`: cálculos, fonte independente, duplicados e DST.
- `backend/tests/sparkTransfer.rules.test.ts`: equivalência com projeção real autenticada e ataques.
- `functions/SparkHistoryFirebase.ts` e `functions/SparkTemporalBalanceFirebase.ts`: protocolo validado pelas Rules.

## Limites

Esta análise não resolve automaticamente ambiguidades nem garante integridade de dados omitidos do snapshot. Este analisador não implementa importador remoto nem bootstrap de usuários reais. O ensaio de restauração de documentos sintéticos foi acrescentado em [[Inventário e Restauração Local Spark]]; não equivale a backup ou restauração reais. A prova v0.5 de [[Protocolo Financeiro Spark]] implementa substituição atômica; o futuro inventário/importador precisa normalizar seus dois termos sem perder referências, autoria e estado de resolução, e preservar a identidade/tipagem dos ajustes existentes que continuam editáveis. O analisador recebe eventos já normalizados, não uma exportação bruta dessas novas coleções. Importação de aberturas futuras com prazo inicial conferido, homologação do custo/volume dos agregados de movimentos, integração da preparação v0.6 com telas/assistente e bootstrap continuam nos critérios do [[Plano de Funcionalidade Completa sem Blaze]].

A preparação v0.6 tem reservas por UID/projeto e progresso retomável, descritos em [[Preparação Histórica Spark]]. O analisador local não reserva cotas remotas nem autoriza bootstrap; a estimativa de preparação não comprova disponibilidade da franquia ou paridade para contas grandes.

A v0.7 acrescenta [[Agregados Históricos Spark]] como material derivado imutável. O futuro inventário/restore precisa incluí-lo; sua construção não certifica a completude do bootstrap nem permite inventar checkpoints. Aceleração reaproveita matemática conferida, com fallback para datas mistas e contagens.


## Integração com inventário bruto local

[[Inventário e Restauração Local Spark]] acrescenta `spark:snapshot prepare`, adaptador parcial de coleções brutas do razão capturadas no Emulator. O relatório referencia o hash da cópia, bloqueia perda de precisão e divergências de identidade, e conserva `canApply: false`, `readyForCutover: false` e `writes: []`. A cópia tipada mantém os dados originais e não é regravada pela reconciliação. Legado bruto, ajustes editáveis/compostos e importação ainda exigem normalização própria; um relatório local sem pendências não concede autorização de bootstrap.


[[Importação Financeira Local Spark]] acrescenta `normalize-legacy` para preparar o contrato a partir de documentos brutos conhecidos, sem assumir ator do primeiro membro: o relatório recebe autoria pelo índice de fontes originais. O helper normalizado anterior, isolado, ainda reutiliza o planejador legado; seu ator padrão não constitui autoria de importação. O novo writer aceita somente razão revalidado do bruto, usa matemática inteira exata nas fronteiras e termina bloqueado. Ativação de legado depende de preservar saldo desconhecido anterior à primeira abertura e as identidades editáveis; não usar uma raiz neutra para declarar conhecido um saldo que era null.
