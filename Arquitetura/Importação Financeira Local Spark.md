---
tags: [spark, financeiro, importacao, migracao, reconciliacao, seguranca]
relacionado: [[Inventário e Restauração Local Spark]], [[Reconciliação de Dados Spark]], [[Protocolo Financeiro Spark]], [[Plano de Funcionalidade Completa sem Blaze]]
status: em desenvolvimento
tipo: arquitetura
versao: 0.10.1
spark_module: D02
spark_progress: 48
spark_reviewed_at: 2026-10-19
---

# Importação Financeira Local Spark

<!-- spark-progress:start -->
## Progresso Spark — 19/10/2026

**D02 — Normalização e importação financeira: 48% implementado / 52% restante.** Notas P/I/D/E: **75/0/50/75**; cálculo e evidências em [[Status da Implementação Spark]].

O percentual corresponde ao módulo completo, incluindo integração e dados, e não somente ao serviço descrito nesta página. **Próxima entrega:** Concluir formatos legados/especiais, capital/cadastros e contas inativas/futuras, conservando proveniência.

Esta revisão prevalece sobre listas de pendências datadas das entregas anteriores abaixo. Implementação local e logs não aprovam publicação nem migração real.
<!-- spark-progress:end -->

## Continuação v17 — 22/10/2026

Marcador protegido e destino do plano local: `financial-proof-v17`; o novo hash não habilita grupos reais. O histórico reconhece os nós de avaliação composta e a referência corretiva como checkpoints. O propósito exclusivo `valuation_undo` vincula uma única referência vigente excluída, permanece imutável e não autoriza comandos comuns. Contratos replanejados usam sucessor/predecessor e metadados no mesmo commit; listas atualizam a agenda depois da confirmação e não estendem lembretes de contrato vencido silenciosamente. Ver [[Protocolo Financeiro Spark]], [[Recorrências Spark]], [[Investimentos]] e [[Status da Implementação Spark]].


Atualização de 19/10/2026: o plano passa a `ledger-stage-v4` sob `financial-proof-v16`. Cada identidade recebe `readModel` imutável com tipo, data, autoria, categoria, nota, fontes, pernas nas contas Spark e ID da identidade revertida. [[Integração Financeira Spark]] usa essa projeção para classificar os nós históricos sem somar identidades outra vez e sem depender de documentos anteriores mutáveis. O conteúdo financeiro das pernas é confrontado ao nó. Hashes do plano/destino mudam; planos anteriores não são ativados nem fundidos automaticamente. O bruto e a proveniência permanecem conservados. 21 ensaios de restore/importação aprovados em `.expo/spark-proof-2026-10-19/closure/restore-read-model.log`, incluindo leitura autenticada nativa/importada pelo mesmo serviço. A importação segue somente para Emulator vazio e grupo bloqueado.

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
- uma identidade imutável por transação em `sparkImportedIdentities`, com autor, tipo, conta(s), valor, data, fonte/hash e lista de nós históricos; identidades não entram de novo na cadeia nem repetem saldo;
- claims por original em `sparkImportedClaims` para estornos já registrados; recibos `correctMovement` com resultado ligam original, estorno e substituto. Fonte/resultado ausente, reutilização ou tipo/autor/data incompatíveis bloqueiam o plano.

Os IDs de plano/nós derivam de hash do snapshot, versão `ledger-stage-v3`, grupo, corte, conta e fonte; o destino atual é `financial-proof-v15`, com [[Criação Retroativa de Investimentos Spark]]. Trocar versão/protocolo altera o hash do plano e exige sua revisão. Identidade importada deriva de grupo e ID da transação, em namespace separado de operações novas. Empates entre movimento/checkpoint usam ordenação determinística por instante/ID, sem alegar a ordem original de commits. Checkpoints empatados na mesma conta/instante permanecem bloqueados. `includesBoundary` conserva a diferença entre abertura mensal inclusiva e contagem exata exclusiva. O registro de capital original de investimentos anteriores ainda não é convertido; o leitor não infere esse principal do saldo importado. Criação datada, correção do principal e troca de banco após importação são ensaiadas somente para investimento novo criado pelo protocolo canônico a partir de bancos importados. O ensaio v15 verifica saldos antes/no instante da aplicação e a data original nas correções, sem ativação na CLI.

[[Conversão de Recorrências Spark]] acrescenta conversão dos templates/ciclos compatíveis do razão, metadados, vínculos para desfazimento e proveniência. Pagamentos não são somados outra vez; sua matemática fica nos nós já importados. Pendências são separadas por template, preservam o bruto e descartam seu candidato parcial; `recurringImport` faz parte do plano e manifesto. Histórico incompleto conserva eventos conhecidos e restringe novas efetivações ao mês posterior ao corte. A cópia continua bloqueada mesmo quando todos os templates selecionados são convertidos.

Antes de escrever, BigInt confere as fronteiras históricas, inclusive as que uma contagem posterior poderia esconder, e o envelope numérico da projeção. Autor de transação precisa ser UID textual válido; autor histórico não precisa continuar membro ativo. Estornos exigem original, inversão exata de todas as pernas e resolução única; uma referência existente isoladamente não basta. Não se inventa ator para raiz ou checkpoint sem autor explícito; a fonte integral continua preservada.

O plano não aplica metadados do arquivo externo nem confia em um `canApply` enviado pelo usuário. `import-ledger` reconstrói tudo do snapshot original e exige o `planSha256` correspondente. Esse hash vincula a revisão local; não é assinatura nem autorização para atuar em produção.

## Execução bloqueada e recuperação

O writer reutiliza as restrições de [[Inventário e Restauração Local Spark]]: projeto `demo-*`/loopback explícitos, Hub sem Functions/Eventarc, mesmo projeto da cópia, destino vazio, lotes de até 100 creates com `exists:false`, limite de documentos/bytes e ausência de reset, merge ou retry automático.

Antes de qualquer publicação do grupo no destino, sua cópia é transformada para `status: spark_importing`, sem acrescentar `sparkProtocol`. Os demais documentos originais e papéis/perfis/cortes permanecem como fornecidos. Depois de gravar, o writer lê o conjunto inteiro e confere seu hash; cria um recibo separado `verified-locked` e repete a conferência incluindo esse recibo. Manifesto e recibo não concedem ativação. Uma falha parcial mantém o grupo bloqueado quando ele já tiver sido criado; usar outro destino vazio, sem apagar evidências ou continuar cegamente.

O writer não promete congelar outros aplicativos ou dados legados sem grupo. O Emulator precisa estar isolado, com escritores pausados. Dois percursos iguais continuam sem garantir snapshot de instante único. Também não há restauração dos metadados de servidor `createTime`/`updateTime`.

[[Operações Ordinárias Spark]] passa a editar/estornar renda/gasto importado em banco/Caixa sem referências especiais, usando `originalSource: imported` e claim compartilhado; pares importados sem referências especiais usam `reverseSparkTransferFirebase` com a mesma seleção de origem/claim. Estorno anterior importado bloqueia uma segunda resolução. Histórico matemático permanece nos nós genéricos, sem conversão que duplicaria pernas. Renda/gasto com `sourceReferences` ou em investimento recebe `ordinaryResolutionAllowed: false`; pares com referências recebem `pairResolutionAllowed: false`, até um adaptador conferir também os metadados/ciclos específicos. Recibos auxiliares de edição sem resultado precisam estar vinculados a um resultado principal válido; ciclos de originais/substitutos são recusados.

O estado bloqueado continua necessário: essa ponte parcial não certifica paridade de todos os formatos nem o corte dos escritores anteriores. Para legado, ainda é preciso preservar o saldo **desconhecido antes da primeira abertura**, que não equivale a raiz zero; por isso o writer executável aceita somente razão já identificado. Ajustes editáveis/compostos, aberturas futuras, contas arquivadas/inativas e alguns formatos especiais continuam bloqueados, sem declarar perda silenciosa desses recursos. Não existe comando de ativação segura nesta entrega.

## Comandos

Com emulador isolado e arquivos sob a proteção indicada em [[Inventário e Restauração Local Spark]]:

```sh
npm run spark:snapshot -- normalize-legacy --input spark-backups/legacy.json --scope spark-backups/scope.json --output spark-backups/normalized.json
npm run spark:snapshot -- prepare --input spark-backups/ledger.json --group grupo-sintetico --as-of 2026-10-01T12:00:00Z --output spark-backups/preflight.json
npm run spark:snapshot -- plan-ledger --input spark-backups/ledger.json --group grupo-sintetico --as-of 2026-10-01T12:00:00Z --output spark-backups/plan.json
npm run spark:snapshot -- import-ledger --input spark-backups/ledger.json --group grupo-sintetico --as-of 2026-10-01T12:00:00Z --project demo-lumus-snapshot --host 127.0.0.1:8080 --hub 127.0.0.1:4400 --plan-sha256 HASH_DO_PLANO --output spark-backups/receipt.json
```

Usar IDs, corte e hash da fixture revisada. As saídas são exclusivas; normalização com pendências retorna código 2 e falha de execução retorna 1. O snapshot legado nunca é passado ao writer como se fosse razão. Não existe opção para remover o bloqueio do grupo.

O `import-ledger` local retoma o mesmo plano após interrupção: compara todos os documentos existentes com o conjunto planejado, recusa extras ou divergências e cria somente os faltantes em lotes de até 100 com pré-condição de inexistência. Imprime a contagem de documentos concluídos. Um recibo existente só é aceito após conferir seus campos e o hash do conjunto completo; o resultado repetido informa `idempotent: true`. Para repetir pela CLI, use o mesmo snapshot, grupo, corte e hash e um novo arquivo de saída, pois os relatórios são exclusivos. O Emulator deve permanecer isolado e sem escritores concorrentes durante toda a operação: a varredura não é atômica. Não existe reversão automática; preserve a cópia e use um emulador vazio para restauração quando houver divergência.

Teste dirigido com Firestore Emulator e Hub simulado pelo harness local confirmou a retomada após commit com resposta perdida e o retry do recibo. Testes com transporte simulado verificam rejeição de divergências. Essa evidência aplica-se ao importador de razão e não torna o candidato legado executável nem prova recuperação de dados oficiais.

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


### Diagnóstico de conta antes da migração — 27/10/2026

`inspect-account` analisa um snapshot local validado e um UID, identificando perfil desconhecido, grupo do razão/Spark ou fontes legadas observadas por coleção. Documentos financeiros sem `personId` inequívoco, com identidade malformada ou divergente, são listados como ambíguos; a contagem não infere saldos ou titularidade de dados duvidosos. O relatório fica vinculado ao hash do snapshot e não altera a origem.

Um snapshot sem documentos financeiros não comprova que uma conta seja nova: ele não inclui Auth e usa duas varreduras que não garantem instante único. Por isso `canInitialize`, `canMigrate` e `readyForCutover` permanecem falsos em todos os resultados. O diagnóstico não cria grupos, importa dados, concede permissões ou altera o banco oficial. Ainda faltam bootstrap seguro, preservação dos formatos legados, consentimentos, corte e recuperação. Ver [[Importação Financeira Local Spark]] e [[Status da Implementação Spark]].

```sh
npm run spark:snapshot -- inspect-account --input spark-backups/demo.json --uid UID_FICTICIO --output spark-backups/account-report.json
```

O comando usa exclusivamente os snapshots `demo-*` validados pelo formato local; a saída é criada de forma exclusiva e privada. Não é captura ou migração de produção.

Em 28/10/2026, o diagnóstico passou a incluir também a coleção antiga `investments`. A normalização registra uma pendência para documentos dessa coleção no escopo ou sem titular identificável, pois ainda não há adaptador que preserve e reconcilie esse formato. A presença desses documentos não pode ser tratada como histórico vazio. A alteração não habilita importação nem corte de contas reais.

A normalização também recusa fontes cuja identidade alternativa `userId` conflite com `personId` e possa apontar para um membro analisado, mesmo quando `personId` está fora do escopo. Fontes de outro titular que referenciem um banco selecionado geram pendência para revisão dos vínculos e participantes. Isso impede que sejam descartadas silenciosamente do candidato; não prova que o snapshot seja completo nem autoriza migração.

### Candidato de razão a partir do legado

`candidate-legacy-ledger` transforma as fontes reconhecidas em contas, eventos e reconciliações de razão em memória. Exige snapshot `demo-*` íntegro e normalização sem pendências; preserva o hash do snapshot e do escopo, os caminhos/hashes das fontes e a autoria comprovada. Eventos sem uma autoria única são recusados. As posições são conferidas novamente contra o reconciliador, usando as datas civis calculadas na normalização. O resultado e seu hash são determinísticos para a mesma entrada.

O candidato é apenas um arquivo local de revisão: `canApply` e `readyForCutover` são sempre falsos. A conversão não inclui todos os metadados/formatos especiais, não prova completude ou consentimento, não prepara o protocolo Spark e não pode ser aplicada pelo importador de razão existente. Ajuste de Caixa sem autoria verificável permanece bloqueado. Os dados de produção não são lidos nem escritos.

```sh
npm run spark:snapshot -- candidate-legacy-ledger --input spark-backups/demo.json --scope spark-backups/scope.json --output spark-backups/ledger-candidate.json
```

### Prévia Spark a partir do legado

`preview-legacy-spark` liga o candidato de razão ao planejador Spark existente em memória. Para um escopo suportado, gera posições, nós históricos, identidades e cadastro bancário com nome, cor e ícone; associa o resultado ao hash da fonte e do candidato. O grupo da prévia permanece `spark_importing`, sem protocolo ativo. O primeiro membro é usado apenas como administrador hipotético da simulação; nenhum papel é concedido.

O caminho converte categorias legadas suportadas em documentos propostos `tags/{id}` com grupo, titular, `historyKnown:false` e origem integral em `sparkMetadataOrigins`. Quando há movimento histórico, gera também `sparkCategoryReferences`; os movimentos preservam o ID. Recusa titular ou grupo incompatível, referência ausente ou externa, uso incompatível, formatos nativos/desconhecidos e colisões de origem/marcador. As tags propostas substituiriam documentos existentes: somente aparecem no resultado em memória e não são aplicadas pelo writer. Recorrências legadas continuam bloqueadas nesta prévia. A proteção efetiva de exclusão após uma importação ainda requer teste integrado e procedimento de corte.

O caminho rejeita investimentos, contas inativas e demais metadados não convertidos, além de colisões e dados bancários incompatíveis. Ele não altera o snapshot nem executa importação. O saldo antes da primeira abertura continua desconhecido; contas sem abertura comprovada são recusadas. `canApply` e `readyForCutover` continuam falsos. O hash `sparkPlanSha256` identifica o plano base; `previewSha256` também vincula as categorias e cadastros bancários acrescentados. Auth, consentimentos, corte dos escritores e ativação permanecem pendentes.

```sh
npm run spark:snapshot -- preview-legacy-spark --input spark-backups/demo.json --scope spark-backups/scope.json --output spark-backups/spark-preview.json
```

### Volume do ensaio local

A normalização, o candidato e o planejamento reutilizam índices em memória para localizar documentos, contas e referências, evitando buscas repetidas em listas completas. Um teste sintético com 1.500 receitas adicionais conferiu contagem, autoria e saldo final; as suítes locais do candidato, da prévia e do importador passaram (83 testes), assim como a checagem de tipos das ferramentas. Isso não estabelece limite máximo de volume, consumo de memória ou tempo de execução em uma base real. A captura e a prévia continuam em memória e restritas ao ambiente de demonstração.

As categorias propostas são uma conversão parcial para revisão local; recorrências, visibilidade autenticada e proteção efetiva de exclusão ainda precisam de validação integrada. Nenhuma dessas verificações autoriza ativação ou certifica completude do histórico.

Validação local da prévia de categorias: 12 testes passaram, incluindo ausência, grupo externo, tipo incompatível, uso por titular externo e recusa de recorrência. A suíte do planejador de razão passou em 69 testes. A presença do marcador no plano foi conferida em memória; não foi demonstrada sua aplicação por writer nem a exclusão concorrente pelas Rules nesta etapa.
