---
tags: [spark, financeiro, importacao, migracao, reconciliacao, seguranca]
relacionado: [[Inventário e Restauração Local Spark]], [[Reconciliação de Dados Spark]], [[Protocolo Financeiro Spark]], [[Plano de Funcionalidade Completa sem Blaze]]
status: em desenvolvimento
tipo: arquitetura
versao: 0.1.0
---

# Importação Financeira Local Spark

Continuação da compatibilidade de dados: normalização diagnóstica de documentos brutos legados e importador executável do razão para **Emulator vazio, com grupo bloqueado ao final**. Não há captura de produção, migração de usuários reais ou comando de ativação. As telas e o assistente continuam no contrato anterior.

## Normalização legada

`normalize-legacy` recebe o snapshot tipado e um arquivo de escopo explícito. Seleciona `personId` entre os membros informados e normaliza bancos, despesas/receitas, pares de transferência, saques para Caixa, principal de investimentos, aberturas mensais e diferenças de ajustes para o analisador existente. Classificações e fontes desconhecidas geram pendência, sem converter campos ambíguos em dinheiro nem substituir valores ausentes por zero.

O escopo contém:

```json
{
  "schemaVersion": 1,
  "groupId": "grupo-proposto",
  "memberIds": ["uid-sintetico"],
  "asOf": "2026-09-30T12:00:00-03:00",
  "confirmedCashBalanceInCents": 0,
  "confirmedAt": "2026-09-30T23:59:59.999-03:00",
  "observedInvestmentBalancesInCents": {}
}
```

`asOf` é convertido para o fim do dia civil de São Paulo; o relatório declara `temporalPolicy: financial-civil-day-end`. Fechamento e conferência não podem extrapolar o snapshot. Não se usa esse resultado para inicializar um corte intradiário do razão. Caixa exige valor/instante declarados; investimento exige posição observada por ID, independente do principal. Esses dados fornecidos são afirmações para análise, não prova de consentimento ou conferência remota.

Datas usam o campo `date` e, somente quando ausente/null, o `createdAt` previsto no carregador antigo; o campo escolhido aparece no índice de fontes. Valores exigem campos conhecidos em centavos, inteiros seguros e dentro do limite. Para principal, `initialValueInCents` e o alias histórico `initialInvestedInCents` só são equivalentes se não divergirem. String de data, fração inferior a milissegundo, número fracionário, proprietário desconhecido ou `userId` divergente impedem aprovação local.

O índice de fontes preserva caminho, hash, proprietário, autor e campo de data de cada documento normalizado. A autoria das entradas de movimento é recuperada da fonte principal referenciada; não se transforma o primeiro membro do plano no autor das operações. O snapshot original permanece intacto. Metadados de recorrências/parcelas continuam no bruto; o normalizador não os declara portados para o contrato de escrita Spark.

Contrapartes marcadas `isBankTransfer` exigem identidade de par; pares ausentes, reutilizados, com valores/contas/datas divergentes e classificações financeiras conflitantes geram pendências. As flags de investimento/sincronização são conservadas ou bloqueadas explicitamente. `isBalanceAdjustment`, ajustes editáveis e sincronizações independentes exigem adaptadores próprios; originais `reversed/replaced` não são filtrados para fazer o saldo fechar.

O relatório contém entrada normalizada, índice de fontes, hash do bruto/normalização e reconciliação. `canReviewNormalization` só indica ausência dos bloqueios implementados. `canApply` e `readyForCutover` são sempre falsos. Uma linha malformada pode faltar na entrada candidata, mas gera pendência obrigatória; nunca se aprova o subconjunto silenciosamente. O importador do razão **não aceita esse relatório como entrada**.

## Plano do razão

`plan-ledger` reconstrói o preflight a partir do bruto. Exige grupo/perfis/cortes coerentes, saldos reconciliados, ausência de namespace Spark, contas ativas, datas suportadas e fontes existentes. O hash da normalização agora inclui grupo e corte, além dos arrays. Mudanças materiais exigem outro plano.

O candidato acrescenta:

- raiz neutra por conta e nós históricos imutáveis `imported_checkpoint`/`imported_movement`;
- links/revisões contíguos, proveniência por caminho/hash e mapeamento da conta fonte para a canônica, incluindo Caixa;
- posições calculadas, último checkpoint e ponteiros mensais bancários conferidos contra o calendário IANA;
- calendário protegido do intervalo necessário, recusando colisão com conteúdo divergente;
- manifesto e mapeamento de contas, com os campos originais do grupo preservados em formato tipado.

Os IDs derivam de hash do snapshot, versão `ledger-stage-v1`, grupo, corte, conta e fonte. Empates entre movimento/checkpoint usam ordenação determinística por instante/ID, sem alegar a ordem original de commits. Checkpoints empatados na mesma conta/instante permanecem bloqueados. `includesBoundary` conserva a diferença entre abertura mensal inclusiva e contagem exata exclusiva.

Antes de escrever, BigInt confere as fronteiras históricas, inclusive as que uma contagem posterior poderia esconder, e o envelope numérico da projeção. Autor de transação precisa ser UID textual válido; autor histórico não precisa continuar membro ativo. Estornos exigem original, inversão exata de todas as pernas e resolução única; uma referência existente isoladamente não basta. Não se inventa ator para raiz ou checkpoint sem autor explícito; a fonte integral continua preservada.

O plano não aplica metadados do arquivo externo nem confia em um `canApply` enviado pelo usuário. `import-ledger` reconstrói tudo do snapshot original e exige o `planSha256` correspondente. Esse hash vincula a revisão local; não é assinatura nem autorização para atuar em produção.

## Execução bloqueada e recuperação

O writer reutiliza as restrições de [[Inventário e Restauração Local Spark]]: projeto `demo-*`/loopback explícitos, Hub sem Functions/Eventarc, mesmo projeto da cópia, destino vazio, lotes de até 100 creates com `exists:false`, limite de documentos/bytes e ausência de reset, merge ou retry automático.

Antes de qualquer publicação do grupo no destino, sua cópia é transformada para `status: spark_importing`, sem acrescentar `sparkProtocol`. Os demais documentos originais e papéis/perfis/cortes permanecem como fornecidos. Depois de gravar, o writer lê o conjunto inteiro e confere seu hash; cria um recibo separado `verified-locked` e repete a conferência incluindo esse recibo. Manifesto e recibo não concedem ativação. Uma falha parcial mantém o grupo bloqueado quando ele já tiver sido criado; usar outro destino vazio, sem apagar evidências ou continuar cegamente.

O writer não promete congelar outros aplicativos ou dados legados sem grupo. O Emulator precisa estar isolado, com escritores pausados. Dois percursos iguais continuam sem garantir snapshot de instante único. Também não há restauração dos metadados de servidor `createTime`/`updateTime`.

O estado bloqueado é necessário porque nós genéricos demonstram a matemática, mas os serviços Spark de edição/estorno exigem identidades nativas, recibos compartilhados e claims de resolução. Não se ativa o conjunto enquanto essas pontes não estiverem implementadas. Para legado, ainda é preciso preservar o saldo **desconhecido antes da primeira abertura**, que não equivale a raiz zero; por isso o writer executável aceita somente razão já identificado. Ajustes editáveis/compostos, aberturas futuras, contas arquivadas/inativas e alguns formatos especiais continuam bloqueados, sem declarar perda silenciosa desses recursos.

## Comandos

Com emulador isolado e arquivos sob a proteção indicada em [[Inventário e Restauração Local Spark]]:

```sh
npm run spark:snapshot -- normalize-legacy --input spark-backups/legacy.json --scope spark-backups/scope.json --output spark-backups/normalized.json
npm run spark:snapshot -- prepare --input spark-backups/ledger.json --group grupo-sintetico --as-of 2026-10-01T12:00:00Z --output spark-backups/preflight.json
npm run spark:snapshot -- plan-ledger --input spark-backups/ledger.json --group grupo-sintetico --as-of 2026-10-01T12:00:00Z --output spark-backups/plan.json
npm run spark:snapshot -- import-ledger --input spark-backups/ledger.json --group grupo-sintetico --as-of 2026-10-01T12:00:00Z --project demo-lumus-snapshot --host 127.0.0.1:8080 --hub 127.0.0.1:4400 --plan-sha256 HASH_DO_PLANO --output spark-backups/receipt.json
```

Usar IDs, corte e hash da fixture revisada. As saídas são exclusivas; normalização com pendências retorna código 2 e falha de execução retorna 1. O snapshot legado nunca é passado ao writer como se fosse razão. Não existe opção para remover o bloqueio do grupo.

## Arquivos e validação

- `backend/scripts/lib/sparkLegacyNormalization.ts`: normalizador e autoria das fontes legadas.
- `backend/scripts/lib/sparkLedgerImport.ts`: plano determinístico, matemática exata e writer bloqueado.
- `backend/scripts/lib/sparkBootstrapPreflight.ts`: decodificação compartilhada, corte e preflight.
- `backend/scripts/lib/sparkLocalSnapshot.ts`: validação de conjuntos e escrita conservadora reutilizada.
- `backend/scripts/sparkSnapshot.ts`: três operações adicionais da CLI.
- `backend/tests/sparkLedgerImport.test.ts` e `sparkLedgerImport.emulator.test.ts`: normalização, bloqueios, execução e equivalência autenticada.

O ensaio importa quatro contas sintéticas e compara oito projeções de bancos, Caixa e investimento pelas Rules reais, sem Functions. A habilitação necessária para esse teste existe **somente no harness privilegiado**, após comprovar que o resultado do importador está bloqueado e que clientes não acessam suas posições. A CLI não recebe essa capacidade. Os testes incluem autoria de ex-membro, classificação de pares, estorno exato/duplicado/inconsistente, observações independentes, precisão, saldo histórico oculto, plano diferente, readback e reexecução contra destino ocupado.

Continuam pendentes normalização integral dos formatos especiais, pontes de edição/estorno/claims, limite histórico do legado, migração executável do legado, políticas/consentimentos, corte de escritores antigos, dados reais e integração Web/mobile/chat. A fase 2 integral continua aberta.


Validação final de 18/10/2026: `npm run check` passou com 75 testes locais das ferramentas (28 acrescentados neste bloco), 815 comuns e 88 condicionais ignorados. `npm run test:spark:restore` passou com sete ensaios, zero ignorados (três acrescentados neste bloco). Evidências `.expo/spark-proof-2026-10-18/financial-import/`. A suíte financeira Spark completa de 382 cenários não foi repetida, pois o protocolo cliente e suas Rules não foram alterados; a equivalência desta importação usa os oito casos autenticados descritos acima.
