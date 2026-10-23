---
tags: [firebase, spark, firestore, seguranca, financeiro, testes]
relacionado: [[Plano de Funcionalidade Completa sem Blaze]], [[Firebase Config]], [[Transferências]], [[Investimentos]], [[Processo de Release]], [[Preparação Histórica Spark]]
status: em desenvolvimento
tipo: arquitetura
versao: 0.20.0
spark_module: F01
spark_progress: 80
spark_reviewed_at: 2026-10-22
---

# Protocolo Financeiro Spark

<!-- spark-progress:start -->
## Progresso Spark — 22/10/2026

**F01 — Protocolo, histórico e preparação: 80% implementado / 20% restante.** Notas P/I/D/E: **100/75/50/75**; cálculo e evidências em [[Status da Implementação Spark]].

O percentual corresponde ao módulo completo, incluindo integração e dados, e não somente ao serviço descrito nesta página. **Próxima entrega:** Concluir restauração dos argumentos/provas/fases descritivas e progresso/pausa no assistente; medir custo em volumes representativos. Identificação, conferência e cancelamento já sobrevivem ao reload pelo executor comum. Ativação mensal conserva sua fila própria.

Esta revisão prevalece sobre listas de pendências datadas das entregas anteriores abaixo. Implementação local e logs não aprovam publicação nem migração real.
<!-- spark-progress:end -->

## Contratos e avaliações — protocolo v17, 22/10/2026

Adição vigente: [[Recuperação de Operações Spark]] envolve o executor comum com uma reserva privada antes do envio. Recibo/cota financeira e confirmação da intenção são atômicos; cancelamento permanente do ID concorre com esse commit. Índice e admissão têm cota própria de 120 novas intenções/minuto, sem alterar a cota financeira existente. O marcador financeiro permanece v17; journal versão 1. Replays seguem conferência material e autoridade atuais. O aviso compartilhado recupera identificação/status após reload, sem restaurar rascunhos ou permissões conversacionais. A nota F01 permanece 80% por integração/dados/aceitação ainda parciais.

O marcador vigente é `financial-proof-v17`; o importador local incorpora esse destino no plano/hash e continua sem ativação real. Renegociação possui receipts `recurring_replan`/`recurring_replan_reversal`, vínculos recíprocos e bloqueio dos contratos substituídos/cancelados. Não reescreve parcelas anteriores.

A edição de capital/financiamento pode acrescentar um nó `investment_edit_valuation` na **mesma transação**: banco(s)/capital usam o pai na data original; o investimento aponta ao filho, com revisão +2 e referência observada no commit. Os dois receipts, posições, capital, checkpoint e cota são vinculados nas Rules. Nenhum observador lê um estado intermediário. A cota admite uma intenção composta, não dois envios independentes.

`valuation_undo` é uma finalidade exclusiva de preparação: `excludedCheckpointOperationId` fica imutável, deve ser a avaliação vigente e não pode aparecer em prova comum. A seleção ignora somente o checkpoint indicado, sem transformar sua diferença em movimento. `investment_valuation_reversal` exige prova concluída, cabeça/revisão, instante, claim e referência; não apaga a observação. Provas desse propósito não autorizam sincronizações/aberturas normais. Referências anteriores à vigente não têm estorno genérico.

Os novos ramos de conferência são selecionados antes dos contratos não pertinentes para manter margem no limite de expressões; todas as verificações de domínio/autoridade continuam aplicadas.

Na fronteira exata de uma referência, um movimento **sem data declarada**, confirmado no mesmo instante do servidor e com revisão posterior à referência, continua incluído na projeção. A revisão desempata esses commits; um movimento datado explicitamente na mesma fronteira mantém a regra de cobertura anterior. Segmentos não conservam essa distinção e por isso não são aplicados sobre uma fronteira exata não inclusiva: a preparação confere os nós individualmente. O caso foi reproduzido deterministicamente com resgate após sincronização no mesmo instante; posição atual e saldo histórico devem continuar iguais.


Implementação local em 16–18/10/2026. Prova de transferências, aportes/resgates, receitas/despesas comuns, abertura zero, contagens, aberturas mensais canônicas, ajustes retroativos, substituição atômica e estornos com Firebase Auth e transações do SDK Firestore compartilhado por Web/native. Inclui projeção histórica verificável, ponte de identidades importadas e análise local de snapshots legados/do razão. Não usa callable, servidor externo ou gatilho. Ainda não substitui os serviços das telas e do assistente nem habilita grupos reais.

## Como funciona

Atualização de 19/10/2026: o marcador v16 acrescenta [[Categorias e CDI Spark]], [[Ciclo de Vida de Contas Spark]] e abertura bancária com saldo declarado, catálogo e checkpoint atômicos em [[Cadastros de Contas Spark]]. O contexto protegido e a primeira integração de metadados estão em [[Integração Financeira Spark]]. Os avisos ao abrir/retornar ao aplicativo seguem a decisão do proprietário em [[Notificações]]. A enumeração v15 abaixo conserva o histórico das extensões anteriores; não implica que a integração completa ou o corte estejam concluídos.

Os serviços exigem o UID autenticado atual, um `clientActionId` estável e grupo protegido com `sparkProtocol: 'financial-proof-v16'`. A troca atual acrescenta [[Criação Retroativa de Investimentos Spark]]: modo/data materiais na abertura financiada, efeito bancário por referência e correções posteriores ancoradas na data financeira da raiz. Grupos v15 não são habilitados implicitamente. Preserva [[Troca do Banco de Financiamento Spark]], pares datados, abertura financiada de commit, edição do principal, sincronização datada, definições/ciclos, receitas/despesas, edição composta, identidades importadas, certificados, reservas, encadeamento e prazo de ativação. O cliente não pode criar/alterar o grupo nem importar saldos derivados de histórico. O executor comum em `sparkFinancialProtocol.ts` verifica identidade/papel em cada tentativa, confere recibos e torna a cota obrigatória. Comparação de timestamps materiais usa `Timestamp.isEqual`, para reconhecer um recibo após nova leitura. A abertura retroativa recusa precisão inferior a microssegundos, que o armazenamento não conserva. Ver também [[Edição do Principal Spark]], [[Movimentos Datados em Par Spark]], [[Financiamento Inicial de Investimentos Spark]], [[Sincronização de Investimentos Spark]], [[Conversão de Recorrências Spark]], [[Recorrências Spark]] e [[Operações Ordinárias Spark]].

### Cadastros de contas

Os ensaios temporais de ativação agora observam `createdAt` confirmado pelo servidor em uma conta auxiliar antes de exigir rejeição por vencimento. Esperar apenas o relógio local ultrapassar a data não comprova `request.time`. A conta e a prova sob teste permanecem intactas; o batch bruto usa a cota corrente, para que a recusa venha do prazo financeiro. A evolução do caso e os logs malsucedidos ficam em `.expo/spark-proof-2026-10-19/closure/`.

Continuação v16: [[Ciclo de Vida de Contas Spark]] já possui atividade/arquivamento/restauração protegidos; o formulário ainda precisa da ponte. [[Operações Ordinárias Spark]] acrescenta detalhes materiais tipados e imutáveis, com documento descritivo atômico e replay recursivo. A validação final do saldo e dos efeitos de uma correção é feita pelos guards obrigatórios das posições. [[Integração Financeira Spark]] conecta extratos, análise por categoria e Home; os demais formulários/listas, previsão, carteira completa e assistente continuam pendentes.

[[Cadastros de Contas Spark]] acrescenta catálogo descritivo com revisão própria e administração protegida. A abertura zero aceita investimento e catálogo opcional atômico. Nome/aparência, banco vinculado, produto, método de avaliação, percentual contratado do CDI, liquidez e descrição não alteram saldos. [[Financiamento Inicial de Investimentos Spark]] cria investimento financiado com principal e avaliação inicial distintos no commit; [[Criação Retroativa de Investimentos Spark]] acrescenta a data explícita da aplicação/referência inicial. [[Edição do Principal Spark]] corrige capital pelo banco canônico vigente; [[Troca do Banco de Financiamento Spark]] troca essa origem e pode corrigir o principal na mesma intenção, preservando avaliações. Avaliação simultânea na edição e integração dos formulários de ativação/arquivamento permanecem pendentes; os serviços de ciclo de vida já existem; sincronização em outra data possui o caminho próprio descrito em [[Sincronização de Investimentos Spark]].

### Transferências e aportes/resgates

Os serviços de commit abaixo continuam disponíveis. [[Movimentos Datados em Par Spark]] acrescenta APIs explícitas de data; novos receipts de ambos os modos incluem `dated`, e somente os datados incluem os três campos de data/efeitos atuais. Nesse modo, cada posição recebe seu efeito após a própria referência, enquanto a projeção conserva as duas pernas históricas completas. Não confundir esse comportamento com o débito/crédito integral do modo commit descrito a seguir.

Na mesma transação:

1. Ler grupo, recibo, posições de origem/destino e cota do UID. Um recibo existente só retorna sucesso quando todos os argumentos materiais coincidem, inclusive ator, tipo, valor, contas, nota e justificativa.
2. Conferir centavos inteiros e limites; validar direção do investimento; caixa/investimento nunca ficam negativos. Banco negativo exige justificativa persistida com pelo menos três caracteres após trim.
3. Criar a operação imutável, debitar/creditar as posições e incrementar suas revisões. Atualizar também a cota global desse UID, obrigatória em qualquer grupo da prova.
4. As Rules verificam os quatro documentos em conjunto com `getAfter`, usam `request.time` para timestamps/cota e recusam efeitos com recibo preexistente. Também recusam recibo sem contrapartida, alteração de tipo/atividade, posição extra, cota isolada ou saldo inventado.

Se o SDK devolver recusa ou resultado incerto após disputa concorrente, o serviço faz reconciliação por leitura. Só confirma sucesso se houver recibo exato e o usuário ainda tiver acesso ao grupo. Não transforma uma recusa genérica em rate limit. A única exceção de reenvio é a virada exata de um minuto da cota, após confirmar recibo ausente e autorização atual, com uma tentativa adicional limitada; ver [[Operações Ordinárias Spark]]. O retry nativo do SDK para conflitos transacionais continua utilizando o mesmo ID e os mesmos argumentos.

### Abertura e contagem explícita

`openSparkAccountFirebase` cria posição de banco/Caixa/investimento com **zero**, revisão zero e recibo na mesma transação, somente por administrador. `accountId` é a identidade estável do recurso; duas tentativas com action IDs distintos para a mesma conta não podem abrir duas posições. Caixa usa sempre `cash` dentro do grupo. O cliente que futuramente integrar esse serviço deve reutilizar a identidade do banco, sem gerar outra conta a cada reenvio. Abertura zero é raiz neutra, não uma contagem posterior que apagaria uma abertura mensal anterior ao cadastro. O catálogo pode acompanhar a abertura atomicamente; sua integração aos formulários continua pendente.

`countSparkAccountFirebase` recebe conta, `expectedRevision`, saldo contado, nota e justificativa. Requer administrador e conta ativa de banco/caixa. Investimentos não podem ser financiados por essa contagem. A Rule confere saldo anterior, alvo, diferença, incremento da posição, recibo e cota. Valor negativo bancário exige justificativa. Mudança na revisão desde a prévia recusa o comando; o callback não recalcula silenciosamente a intenção confirmada. Diferença zero também cria evento/revisão, preservando a referência auditável.

- `account_count`: estabelece uma nova referência no instante do commit e atualiza `sparkCheckpoints/{accountId}`. O histórico da contagem está na operação imutável; o checkpoint é o ponteiro protegido da contagem mais recente.
- `balance_adjustment`: registra a diferença atual de uma conta bancária, sem estabelecer uma nova referência. Pode ser invertido pelo autor, que também precisa continuar administrador.

Uma contagem é um valor declarado pelo administrador autorizado, com fonte explícita e efeito conferido pelas Rules. Ela não comprova o saldo de uma coleção histórica nem substitui o bootstrap auditado dos dados reais.

### Estorno único e efeito histórico

`reverseSparkTransferFirebase` inverte origem/destino e mantém o valor exato do original. Membro só estorna a própria operação; administrador pode estornar outra operação do grupo, conforme o contrato atual. O original precisa ser transferência/aporte/resgate. Estorno de estorno e uso desse caminho para ajuste são recusados. O claim canônico `sparkReversals/{originalOperationId}` impede nova inversão mesmo sob outro action ID; claim, dois saldos, nova operação e cota são atômicos.

`reverseSparkBalanceAdjustmentFirebase` preserva `effectiveAt == original.effectiveAt ?? original.createdAt`, incluindo o ajuste retroativo novo. O evento registra a diferença inversa, mas seu `currentEffectInCents` depende da referência atual:

- Sem contagem posterior ao original: aplicar a diferença inversa ao saldo atual.
- Com contagem que já cobre o original: efeito atual zero; manter o inverso no histórico e incrementar revisão mesmo assim.

Uma abertura mensal inclui os movimentos exatamente na sua fronteira; uma contagem exata os exclui. O estorno na mesma fronteira de uma abertura mensal continua produzindo efeito atual, pois o movimento original permanece incluído nessa abertura.

Exemplo demonstrado: saldo 10.000, ajuste +2.000, nova contagem 8.000, transferência posterior de 500. Estornar o ajuste antigo conserva saldo 7.500. O teste compara esse resultado com `calculateAccountBalanceInCents` do domínio existente. `sparkAdjustmentReversals/{originalOperationId}` garante exclusividade. Esse estorno exige autor e administrador, preservando a autorização específica do ajuste.

Count e estorno concorrentes são serializados pela posição e pelo checkpoint. O Emulator pode recusar a tentativa que observou a versão anterior antes de o SDK refazer o callback. O teste exige pelo menos um commit, ausência de recibo/efeito parcial da tentativa recusada, saldo coerente e retomada explícita do estorno com a mesma identidade. Se a contagem perder por revisão stale, precisa de nova prévia. Não prometer que duas intenções concorrentes terminam sempre com sucesso nem classificar toda recusa como disputa.

### Substituição atômica de ajustes

`replaceSparkBalanceAdjustmentFirebase` mantém a mesma conta bancária e exige autor autenticado ainda administrador. O original elegível é `balance_adjustment`, `dated_adjustment` ou o componente novo de `adjustment_replacement`. Conta inativa, original de outro autor, estorno e ajuste já resolvido são recusados. A data nova segue o contrato civil existente: passado no fim do dia autorizado, hoje no commit, com prévia incluindo o último update da posição e sem data futura.

A transação grava uma operação imutável `adjustment_replacement`, atualiza a posição uma vez, cria o claim compartilhado `sparkAdjustmentReversals/{originalOperationId}` e consome uma cota financeira. Não há estado intermediário em que só o inverso foi aplicado. O original continua imutável; o estado `replaced` é derivado do claim ligado ao receipt de substituição, e `reversed` do claim ligado ao receipt de estorno. As telas atuais ainda usam o modelo publicado; seu futuro adaptador deverá apresentar esses estados e os dois efeitos do evento composto.

O receipt contém dois termos históricos de tamanho fixo:

- inverso na data antiga: `originalEffectiveAt`, `-originalDifferenceInCents`;
- novo ajuste: `effectiveAt`, `differenceInCents`.

O líquido não pode ser atribuído somente à data nova. Ao consultar entre as duas datas, a projeção precisa considerar cada termo separadamente. A segunda passagem de `SparkHistoryFirebase.ts` e das Rules aplica ambos à janela elegível e à cauda temporal; a seleção de checkpoints permanece igual. Uma nova substituição ou estorno do substituto resolve **somente seu componente novo**; os inversos anteriores permanecem no histórico e não são desfeitos novamente.

A prova completa continua sem exclusões arbitrárias. A confirmação calcula a base sem o original:

```text
originalNaJanela = dataAntiga <= proof.asOf
  e (dataAntiga > baselineAt ou dataAntiga == baselineAt com includesBoundary)
baseSemOriginal = proof.balanceInCents - (originalNaJanela ? diferençaAntiga : 0)
diferençaNova = alvo - baseSemOriginal
efeitoAtual = inversoAntigoElegívelNoCheckpointAtual + diferençaNovaElegívelAgora
```

Uma abertura posterior pode já ter retirado a diferença antiga da base. Nesse caso, não subtraí-la novamente. A inclusividade do checkpoint distingue abertura mensal de contagem exata, inclusive quando a data antiga coincide com a fronteira. Abertura futura não vencida não cobre nenhum termo antecipadamente; prazo vencido bloqueia a substituição até a ativação certificada.

Saldo alvo/final e cada diferença histórica mantêm o teto absoluto de 1.000.000.000.000 centavos. A base contrafactual `previousBalanceInCents` e o efeito líquido derivado admitem o dobro, sempre inteiros e com igualdade exata. Exemplo: prova -MAX, diferença antiga +MAX, base sem original -2MAX e novo alvo -MAX produzem diferença nova +MAX e efeito atual zero. Bloquear essa base impediria uma correção válida, sem haver posição armazenada fora do teto. A projeção histórica continua usando acumuladores inteiros seguros; uma correção retroativa não valida automaticamente todos os saldos intermediários como posições materializadas.

As Rules distribuem a validação para caber no orçamento: o claim novo certifica a conta, o autor, a data e a diferença do original imutável. O guard do receipt exige esse claim ausente antes e ligado a si depois, e confere prova, matemática, calendário, revisão e cota. Posição valida predecessor, prazo e efeito. Não repetir toda a leitura do original no receipt; não permitir que um claim anterior autorize outro efeito. Estorno e substituição competem pelo **mesmo** claim, portanto apenas um resolve o original.

Replay compara conta, original, data solicitada, alvo, revisão e textos. O recibo existente é conferido antes de recusar pelo claim criado pela própria operação. Resultado incerto só é recuperado pela leitura do recibo exato; revisão stale ou argumentos alterados exigem nova prévia/ID, sem repetição genérica de `permission-denied`.

## Documentos

| Caminho | Conteúdo e autoridade |
|---|---|
| `financialGroups/{groupId}` | `status`, `members` e `sparkProtocol` protegidos; nenhuma escrita cliente. |
| `financialGroups/{groupId}/sparkPositions/{accountId}` | `schemaVersion: 1`, `kind`, `active`, `balanceInCents`, `revision`, `lastOperationId`, `nextActivationAt`, `updatedAt`. Criação zero vinculada à abertura admin com prazo nulo; exclusão proibida; update exige novo evento correspondente e prazo válido. |
| `financialGroups/{groupId}/sparkAccountCatalog/{accountId}` | Catálogo descritivo de [[Cadastros de Contas Spark]]: revisão própria, campos limitados por tipo de conta, edição admin e vínculo ao receipt novo; sem efeitos financeiros ou exclusão cliente. |
| `financialGroups/{groupId}/sparkInvestmentCapital/{accountId}` | Principal e banco canônicos corrigíveis pelos serviços próprios; operação permanente da abertura financiada, autoria da criação, revisão/cabeça. Update somente pelo protocolo atômico específico; delete proibido. Posições anteriores sem esse registro não recebem principal inferido. |
| `financialGroups/{groupId}/sparkCurrentPositions/{accountId}` | Caminho virtual de leitura, sem documento gravado: Rules conferem na posição `nextActivationAt == null || request.time < nextActivationAt`. Sem listagem/escrita. Usado em transação para certificar atualidade no servidor. |
| `financialGroups/{groupId}/sparkOperations/{clientActionId}` | `schemaVersion`, `actorId`, `kind`, `fromAccountId`, `toAccountId`, `amountInCents`, `fromRevision`, `toRevision`, `note`, `overdraftReason`, `createdAt`. Imutável; é evento e recibo da prova. |
| `financialGroups/{groupId}/sparkReversals/{originalOperationId}` | Claim imutável de estorno de transferência/aporte/resgate: `schemaVersion`, `actorId`, `reversalOperationId`, `createdAt`. |
| `financialGroups/{groupId}/sparkAdjustmentReversals/{originalOperationId}` | Mesmo formato, resolução única compartilhada por estorno/substituição de ajuste; `reversalOperationId` aponta ao receipt que resolveu o original. Não pode substituir o claim de transferência. |
| `financialGroups/{groupId}/sparkCheckpoints/{accountId}` | `operationId`, `countedBalanceInCents`, `effectiveAt`, `includesBoundary`. Ponteiro da referência elegível mais recente, atualizável somente com contagem/abertura ou ativação certificada, de data igual ou posterior; exclusão proibida. Ativação conserva o ID original e acrescenta `activationOperationId` do recibo novo. |
| `financialGroups/{groupId}/sparkHistoryProofs/{clientActionId}` | Trabalho privado do ator, cabeça/revisão fixas, data/finalidade, cursor, fase e acumuladores. Nenhum efeito financeiro. Só avança um passo conferido; exclusão proibida. |
| `financialGroups/{groupId}/sparkMonthlyOpenings/{accountId}/cycles/{YYYY-MM}` | Uma identidade por conta/ciclo. Ponteiro para operação mensal imutável, valor contado e data efetiva; upsert só com nova operação atômica e predecessor mensal esperado. |
| `sparkCivilMonths/{YYYY-MM}` | Calendário protegido: `startAt`, `endAt`, `dayEnds`, fuso São Paulo. Leitura autenticada; nenhuma escrita cliente. Gerador local usa o adaptador IANA já existente. |
| `sparkTransferQuotas/{uid}` | `groupId`, `windowStartInMillis`, `count`, `lastOperationId`, `updatedAt`. Até 120 novas operações por minuto/UID, compartilhadas entre todos os tipos da prova. Sem listagem/exclusão cliente; get apenas do próprio UID; escrita só com operação correspondente. O nome foi conservado da primeira etapa. |

Variantes de `sparkOperations`: `account_opening` contém conta/tipo e abertura zero; `account_count`/`balance_adjustment` contêm conta, revisão esperada, saldo anterior/alvo e diferença/efeito; `transfer_reversal` acrescenta `reversesOperationId` aos campos do par; `adjustment_reversal` contém conta, revisão, original, data efetiva e diferença/efeito atual. As variantes temporais `dated_adjustment`, `dated_reconciliation`, `monthly_opening` acrescentam prova, instante solicitado, instante efetivo, modo civil, ciclo/dia e predecessor mensal. Cada variante possui schema fechado próprio nas Rules. Campos derivados de saldo/revisão não são argumentos alteráveis do pedido no replay; os argumentos materiais de cada serviço são comparados integralmente.

Todo update de posição exige predecessor exato: `previousOperationId` nos eventos de uma conta e `fromPreviousOperationId`/`toPreviousOperationId` nos pares. O incremento de revisão e o predecessor vêm da posição anterior. Não é possível omitir um evento nem usar um recibo existente para criar outro efeito. Raízes/entradas `account_bootstrap`, `imported_checkpoint`, `imported_movement` só podem vir de preparação administrativa conferida; não há create cliente para esses tipos. Nenhuma conta real foi preparada.

## Projeção histórica e bloco financeiro temporal

`SparkHistoryFirebase.ts` fornece `start`, `step` e `prepareSparkHistoryProofFirebase`. A prova usa o mesmo ID da confirmação futura, fixa a cabeça/revisão da posição e percorre sua cadeia **duas vezes**, de trás para frente:

1. Encontrar a abertura máxima elegível até a data pedida, com desempate pela revisão e seu `baselineOperationId`; acumular a referência mais recente até o `createdAt` protegido da prova e o menor checkpoint posterior a `asOf` (`nextCheckpointAt`). Uma abertura futura não pode neutralizar ajuste atual antecipadamente.
2. Somar os movimentos na janela elegível e acumular a cauda posterior ao instante candidato, aplicando separadamente os dois termos de cada `adjustment_replacement`. A finalidade mensal deixa movimentos exatamente no início do mês para a cauda; a finalidade instantânea os inclui no saldo consultado, respeitando o tipo da referência.

Cada passo verifica a revisão e o predecessor de uma operação imutável. Só a raiz de revisão zero termina a cadeia; saltos, troca de conta, conclusão antecipada, alteração de intenção e acumulador informado pelo cliente são recusados. Os passos não alteram saldos. O trabalho pode ser retomado com o mesmo ID; `prepare` executa no máximo 100 passos por padrão (configurável até 1.000) e devolve fase incompleta explicitamente, para que o chamador retome. UID, login recente, papel e grupo ativo são revalidados a cada passo. `instant` e `monthly` exigem admin; `activation` permite membro porque materializa somente uma contagem já autorizada, sem aceitar valor informado pelo membro.

`SparkTemporalBalanceFirebase.ts` confirma somente prova `done`, do ator/conta/data/finalidade correspondentes e na cabeça/revisão atual. Movimento concorrente exige nova projeção com novo ID; conferir o recibo continua permitindo retry de uma confirmação já efetivada. A prova é lida antes do commit: fabricá-la na mesma escrita não autoriza a operação.

- `dated_adjustment`: diferença = saldo informado menos saldo histórico provado. Exige banco e abertura elegível; raiz neutra não inventa base zero. Com referência posterior, efeito atual zero e diferença preservada no histórico.
- `dated_reconciliation`: contagem autorizada em instante exato passado. Se for a última referência, saldo atual = novo contado + cauda verificada; referência posterior conserva o saldo atual. Disponível para banco/caixa, sem financiar investimento.
- `monthly_opening`: abertura/upsert de banco por conta/ciclo, no início do mês do calendário protegido. Mês passado/atual usa contado + movimentos desde a fronteira, inclusive movimentos exatamente nela. Mês antigo coberto por referência posterior não altera o saldo atual. Mês futuro registra contagem agendada com diferença/efeito atual zero, sem alterar o checkpoint elegível. Atualização exige o ID mensal anterior; dois criadores concorrentes não conseguem duplicar o ciclo. O histórico antigo não é apagado.

Ajuste passado exige o fim daquele dia civil, conferido contra `dayEnds`; ajuste de hoje usa `effectiveAt == createdAt == request.time` na confirmação. Seu instante de prévia precisa incluir o último update conhecido da posição. `requestedEffectiveAt` preserva a intenção material preparada, enquanto o instante de commit é derivado. Isso permite replay mesmo depois da mudança do dia, sem comparar o novo relógio ao instante financeiro já gravado. Calendário ausente, horário histórico arbitrário, ajuste futuro ou virada de dia invalidam o pedido sem efeitos. Reconciliação exata é uma operação distinta, que admite horário específico passado. A finalidade mensal admite consulta futura até 2100, sem prometer previsão de movimentos ainda inexistentes.

### Aberturas futuras e retorno após a virada

`nextActivationAt` é obrigatório em todas as posições. Na abertura zero começa `null`; ao agendar mês futuro passa a ser o mínimo entre o prazo existente e a data nova. Valor agendado é uma contagem administrativa, não receita nem diferença a aplicar antecipadamente. Agendamentos fora de ordem e atualização do valor no mesmo ciclo conservam a fronteira mais próxima. Não há cancelamento nem mudança de data nesse contrato, assim como o upsert mensal publicado não oferece exclusão; esses recursos exigiriam comprovar outro mínimo, não simplesmente apagar o prazo.

Todos os updates comuns de posição exigem prazo anterior nulo ou **`request.time < nextActivationAt`**, inclusive os dois lados de pares/estornos, contagens, ajustes, reconciliações e novos agendamentos. Ao vencer, igualdade já bloqueia. As Rules impedem apagar/adiar o prazo junto de uma transferência, alterar o saldo com evento antigo ou usar cliente da versão anterior sem esse campo.

`SparkMonthlyActivationFirebase.ts` fornece três serviços:

- `readCurrentSparkPositionFirebase`: lê posição e caminho virtual de atualidade em transação no servidor. Um relógio atrasado ou cache local não autoriza retornar uma posição vencida como atual. O resultado é válido no instante da leitura; futuras escritas continuam conferindo o prazo no commit.
- `refreshSparkMonthlyOpeningFirebase`: se houver vencimento, prepara/retoma prova `activation`, retorna `preparing` quando incompleta e só retorna `current` após materialização e leitura guardada. Reutiliza a data da prova ao retomar em outra sessão. Falhas/revisão stale/nova fronteira exigem tratamento explícito e novo ID quando necessário; não há repetição indiscriminada de escrita negada.
- `activateSparkMonthlyOpeningFirebase`: qualquer membro ativo pode confirmar prova própria completa. Exige cabeça/revisão atuais, `asOf >= updatedAt`, `asOf >= nextActivationAt`, `asOf <= request.time` e abertura selecionada não anterior ao prazo vencido. O próximo checkpoint futuro deve permanecer estritamente posterior ao commit; se outra fronteira vencer durante a preparação, a prova não confirma.

A ativação substitui o saldo materializado pelo saldo certificado, incrementa revisão e conserva em `sparkCheckpoints` o ID/data/valor/inclusividade da referência original. `monthly_activation` é evento neutro para projeção: `differenceInCents == 0`, não é checkpoint nem receita/despesa; seu `currentEffectInCents` apenas materializa a diferença entre duas posições. Esse efeito admite ±2.000.000.000.000 centavos, porque ambas as posições válidas de ±1.000.000.000.000 podem estar em extremos opostos. Saldo final e valor contado mantêm o limite original. Isso evita uma conta permanentemente bloqueada no vencimento.

Firestore não modifica documentos somente porque o tempo passa. Com todos os apps fechados, a contagem continua datada no início do mês e o saldo persistido pode ficar vencido; o próximo cliente autorizado materializa a projeção antes de apresentar o saldo como atual ou movimentar. Vários meses vencidos são resolvidos pela última abertura elegível, sem aplicar cada contagem como se fosse um movimento. Não se cria nova contagem no horário em que o aplicativo voltou. Offline não é possível certificar essa atualização. Fonte: [request.time](https://firebase.google.com/docs/reference/rules/rules.firestore.Request) e [transações cliente](https://firebase.google.com/docs/firestore/manage-data/transactions).

O relógio local ainda prepara `asOf` e a janela de cota. Clock skew pode impedir a atualização e exige erro/retomada no produto, mas a leitura guardada e as Rules não certificam saldo vencido nem permitem movimentá-lo. Não chamar o `get` bruto de posição de saldo atual: futuros leitores Web/mobile/chat devem consumir o serviço guardado e tratar `preparing`/erro.

Intervalo de consulta: a partir de 1970; gerador civil disponível de 1970 a 2100, com intervalo escolhido explicitamente. O calendário precisa ser preparado e conferido no bootstrap. Dados históricos de São Paulo não assumem UTC−03 fixo. A contagem é uma declaração autorizada de saldo, não uma prova do extrato bancário externo.

[[Reconciliação de Dados Spark]] descreve o analisador local e o contrato do snapshot. Ele compara legado/razão, preserva referências e detecta divergências; não importa nem certifica sozinho a completude do inventário remoto.

### Custo e limites desta prova

Com revisão `r`, há `N = r + 1` nós. A preparação conserva **um nó por página**, duas passagens e duas mudanças de fase: `P = 2N + 2`. Uma reserva de até 64 páginas grava prova, cota privada do UID e agregado numérico do projeto na mesma transação. Cada página posterior grava somente a prova. Não adicionar um contador por página: isso multiplicaria as escritas. Em condições ideais, sem expiração/retry, `G = ceil(P/64)` reservas e `P + 3G` escritas de preparação. Essa proteção adiciona overhead frente à prova anterior; não reduz sua complexidade linear. A confirmação financeira fica fora desses números e mantém a cota de 120/minuto.

[[Preparação Histórica Spark]] descreve contrato, limites UTC por UID/projeto, medição local, pausa e retomada. `expectedWorkRevision` é obrigatório em cada página: repetir a versão já confirmada apenas lê o progresso. A posição é conferida antes de ler outro evento; mudança na cabeça exige nova prévia. `prepareSparkHistoryProofFirebase` admite no máximo 100 páginas por chamada. `AbortSignal` pausa antes da escrita quando observado, preservando o que já foi confirmado; não desfaz um commit em andamento nem constitui cancelamento persistido.

As cotas limitam **admissão de trabalho confirmado**, não toda a cobrança/franquia: leituras de Rules, recusas, retries, listeners e outros serviços continuam consumindo recursos. O reset UTC deste protocolo não é o reset da franquia do Firestore. Histórico grande pode exigir vários dias e a intenção “hoje/commit” pode precisar ser refeita se mudar o dia civil. Agregados de movimentos estão disponíveis por opt-in; integração de progresso/pausa nas telas/chat e homologação de volumes continuam necessárias antes do corte real.

[[Agregados Históricos Spark]] acrescenta uma floresta imutável de movimentos. `useSegments: true` pode substituir vários nós por uma página certificada, sem pular checkpoints ou misturar classes temporais. As fórmulas anteriores descrevem o limite sem aceleração; reservas aceleradas usam até 16 páginas, sem reembolso de sobras. Cada certificado novo custa três escritas atômicas e 20 unidades de leitura de admissão nos mesmos contadores UID/projeto. Construção e reutilização devem ser medidas juntas.

Os caminhos mensais usam calendário, prova, posição, cota, checkpoint e ponteiro canônico. Seus casos completos permitidos passaram dentro do orçamento real das Rules; os testes adversariais recusam explicitamente falhas por esgotamento de acessos/expressões. Não acrescentar documentos ao commit sem reavaliar esse orçamento.

Os campos são limitados por `hasAll`/`hasOnly` e revisões/valores por inteiros. Saldo armazenado absoluto máximo: 1.000.000.000.000 centavos; transferência estritamente positiva dentro desse limite. Efeito derivado de ativação/substituição e base contrafactual da substituição admitem o dobro, conforme os contratos acima. Nota até 2.000 caracteres, justificativa até 500, IDs até 160. Os limites do cliente podem ser mais restritivos para strings Unicode por contagem UTF-16. Identidade de ação reutiliza `assertClientActionId`.

Transferência comum não toca investimento; aporte vai de banco/caixa para investimento; resgate faz o inverso. É uma validação de domínio mais estrita do que o handler atual do razão, que não verifica todas essas combinações. Nenhum desses três tipos é receita/despesa econômica. Relatórios atuais ainda não consomem os eventos da prova; não somar estes documentos ao legado/razão.

## Segurança e limites de acesso

Autoridade vem de `financialGroups` protegido e do token Auth com login recente de oito horas. A remoção do membro invalida tanto leitura quanto uma escrita já preparada. Essa prova de revogação de membro não implementa o novo fluxo de convite/unlink dos vínculos legados.

Na validação de escrita, a contagem estática conservadora é: três acessos por posição (grupo, existência anterior da operação, operação após), seis na criação da operação (grupo, duas posições antes/depois, cota após) e três na cota (grupo, operação antes/depois): quinze no total, antes dos reads da transação. Cada escrita está abaixo de dez. O caminho completo permitido foi aceito pelo Emulator dentro do limite agregado de vinte; isso não mede franquia gratuita nem aprova futuras ampliações. Cada novo documento/guard deve reavaliar esse orçamento. Documentos repetidos podem ser cacheados pelo mecanismo de Rules. Fontes: [condições de Rules](https://firebase.google.com/docs/firestore/security/rules-conditions), [validação atômica](https://firebase.google.com/docs/firestore/manage-data/transactions).

O estorno do par chega a vinte acessos estáticos de validação sem deduplicação (original/claim na operação e operação antes/depois no claim). O claim não repete o schema financeiro nem consulta o grupo: exige ator autenticado e uma operação nova correspondente, que obrigatoriamente valida grupo, papel e original. O caso completo passou com SDK/Auth reais no Emulator. Contagem e estorno de ajuste também tiveram commits permitidos e ataques negados sem estouro; não acrescentar guards/efeitos sem rever acessos e expressões.

A substituição distribui a certificação do original no claim, em vez de repeti-la no receipt. Estimativa conservadora das escritas sem deduplicação: até dez acessos no receipt, três no claim, três na posição e três na cota, dezenove no total antes dos reads do SDK. Caminhos completos, limites monetários, referências inclusivas/exclusivas e ataques diretos passaram no Emulator; isso não aprova acrescentar outro documento nem mede custo de franquia. A projeção usa exatamente dois termos por substituição, sem lista arbitrária nem loop nas Rules.

O relógio cliente prepara o início da janela, mas a Rule só aceita o minuto real do servidor. Relógio incorreto e corrida na virada do minuto podem recusar uma operação válida, sem alterar saldo. O serviço ainda precisa de tratamento de sincronização/retomada antes de integrar esse protocolo ao executor do assistente; não substituir esse erro por repetição indiscriminada.

Avaliação restrita às novas Rules da prova, após os testes locais; não representa auditoria integral do projeto nem autorização de publicação:

```json
{
  "score": 4,
  "summary": "Prova isolada com identidade protegida, efeitos e cota obrigatoriamente atômicos, recibos imutáveis e testes adversariais. Ainda não apta ao corte de produção.",
  "findings": [
    {
      "check": "Resource Exhaustion/DoS",
      "severity": "minor",
      "issue": "A preparação possui reservas limitadas por UID/projeto, mas continua linear e não mede tentativas recusadas, leituras de Rules, retries ou os demais serviços; existem agregados certificados de movimentos, mas fronteiras adversariais e ausência de cache conservam o fallback linear.",
      "recommendation": "Usar as evidências locais de preparação, integrar pausa/progresso ao produto e validar agregados certificados antes de habilitar contas grandes. As reservas não garantem disponibilidade de toda a franquia gratuita."
    },
    {
      "check": "Business Logic vs. Rules",
      "severity": "minor",
      "issue": "Preparação da janela de cota e dos instantes civis/ativação depende do relógio cliente e pode recusar uma operação válida na virada das janelas de minuto/dia ou com clock skew. A leitura guardada usa request.time e não certifica posição vencida.",
      "recommendation": "Demonstrar tratamento de relógio/retomada e classificação de erros antes da integração às telas e ao assistente, conservando request.time como autoridade e recibos estáveis."
    },
    {
      "check": "Business Logic vs. Rules",
      "severity": "minor",
      "issue": "Sob disputa de cota/posição entre dois comandos distintos, o Emulator pode recusar uma transação válida por sua leitura anterior. A operação fica sem efeitos e exige retomada explícita; a recusa genérica não identifica a causa com segurança.",
      "recommendation": "Integrar apresentação do erro, conferência de recibo e retomada explícita ao produto. Contagens stale exigem nova prévia; não reenviar automaticamente qualquer permission-denied."
    }
  ]
}
```

Create/update bypass, origem de papéis, identidade, tamanhos, tipos e integridade cruzada foram considerados. As Rules atuais das demais coleções não foram reclassificadas por esta avaliação.

## Configuração e execução

Executar `npm run test:spark` na raiz com Node 22 e Java disponíveis. O comando sobe **somente Auth e Firestore**, projeto demo `demo-lumus-spark`, e executa a nova suíte e as cinco suítes existentes de Rules. Não compila/inicia Functions nem faz login/deploy remoto. As portas são as do projeto: 9099/8080. Os testes recusam hosts diferentes antes de inicializar os clientes.

O SDK do serviço é o Firebase JS existente. O parâmetro Firestore recebe a instância de `FirebaseConfig.ts`/`.web.ts` quando houver integração de produto. Não há módulo Expo novo, dependência nova ou credencial administrativa no aplicativo. Fixtures com Rules desabilitadas existem somente no harness local e não são uma estratégia de bootstrap remoto.

## Validação em 16/10/2026

- `npm run test:spark`: a base anterior tinha 141 testes. O bloco temporal adiciona abertura mensal, projeção retomável, ajuste civil, contagem retroativa, equivalência de importação sintética e ataques ao encadeamento/cálculo. Total final e evidências registrados no Active Context. Autenticação real pelo Auth Emulator em duas sessões do mesmo UID; token vencido simulado separadamente. Functions desligadas.
- Casos positivos: transferir, aportar, resgatar, saldo negativo bancário justificado, limites máximos, concorrência, reenvio após resposta perdida e identidade conflitante.
- Ataques: efeitos/recibo/cota incompletos, terceiro saldo, replay, revisão stale, spoofing, revogação, bootstrap não autorizado, alteração de tipo/atividade, campos/horário injetados, quota reset/exclusão, leitura alheia, valores negativos/fracionários/overflow e direção de investimento inválida. Todos recusados sem efeitos parciais.
- A primeira versão repetia a validação completa das posições dentro da regra do evento e esgotava 1.000 expressões em recusas. O incremento obrigatório de ambas as revisões já exige o update das posições, cujas próprias Rules conferem schema/atividade/imutabilidade. A regra do evento passou a conferir a vinculação e os efeitos, sem repetir esse schema. A suíte nova rejeita também erros de orçamento: uma recusa por limite não é aceita como prova de uma invariante. Os casos finais conservam essa exigência.
- Continuação: abertura concorrente por identidade de conta, caixa único, contagem com diferença verificável, revisão stale, estornos concorrentes/repetidos, referência posterior, comparação com o domínio histórico, claims/checkpoints adulterados, papéis e autores, reenvio com timestamp, cota e recusa explícita de data efetiva não suportada.
- `npm run check`: estilos, tipos cliente/backend e testes comuns; o total do bloco temporal consta no Active Context. Há 88 testes condicionais ignorados nesse comando; não são novas aprovações de integração. A matriz completa das treze famílias continua no gate antigo e não foi portada pelo teste Spark. A análise local possui suíte própria em `tests/sparkFinancialReconciliation.test.ts`.

Continuação v0.4: 224 testes Spark, zero ignorados (39 novos além dos 185 da v0.3), com os cinco scripts existentes de Rules. Inclui agendamento/edição futura, preservação do saldo/checkpoint atual, prazo mínimo, atualização por membro após meses sem acesso, cota/recibo/checkpoint obrigatórios, mudança nos extremos monetários, concorrência/replay, prova com data/finalidade incorretas, revogação, relógio atrasado e fronteira seguinte vencendo entre projeção e commit. Um teste usa calendário sintético protegido somente no Emulator para atravessar uma fronteira real de três segundos, bloquear escrita e materializar a abertura original. Os demais calendários usam IANA/São Paulo, incluindo DST. Não há simulação de passagem de vários meses no relógio do servidor: esse caso usa documentos sintéticos previamente agendados. `check` passou com 806 testes comuns e 88 condicionais ignorados.

Continuação v0.5: **275 testes Spark**, zero ignorados (51 novos além dos 224), mais os cinco scripts existentes de Rules. Substituição com valor maior/menor/zero, data anterior/posterior/hoje, referências posteriores, fronteiras inclusivas/exclusivas, ajuste atual sem data explícita, substituição sucessiva e estorno, concorrência com estorno, replay/material alterado, autor/banco/papel inválidos, prova stale, dois efeitos históricos/cauda completa, justificativa negativa e extremos/contrafactual de ±2MAX. Ataques com campos antigos plausíveis e saldo líquido correto são recusados pelo certificado do claim. O gate `check` passou com 806 comuns e 88 condicionais ignorados; essas contagens não são testes em aparelho nem homologação de telas. Evidências em `.expo/spark-proof-2026-10-16/adjustment-replacement/` (`tests.log`, `check.log`, `firestore-debug.log`).

As suítes antigas também passaram, mas seus logs ainda contêm estouros de expressão em alguns cenários negativos legados. Os guards legados não foram alterados nesta etapa; seus `assertFails` não exigem ainda a mesma distinção de motivo da suíte nova. Rever essa cobertura antes de usá-la como prova de paridade completa. Evidências ignoradas pelo Git em `.expo/spark-proof-2026-10-16/`; etapas anteriores preservadas em `continuation/` e `block1/`, e esta etapa em `future-openings/` (`tests.log`, `firestore-debug.log`, `check.log`).

Continuação v0.6: **320 testes Spark**, zero ignorados (45 novos), seguidos dos cinco scripts existentes de Rules, incluindo reservas UID/projeto atômicas, duas sessões, isolamento entre grupos/usuários, pausa durante leitura, expiração sintética, replay e avanços forjados. Controles positivos diretos conferem que as recusas aritméticas usam uma reserva válida. `check`: 815 comuns aprovados, 88 condicionais ignorados. Benchmark com Rules/Auth reais: 1.000 nós, 2.002 páginas, 32 reservas, 8.226 leituras explícitas SDK e 2.098 escritas em 33.296 ms locais. Isso acrescenta 4,7% de escritas à prova anterior, sem eliminar O(N). Evidências em `.expo/spark-proof-2026-10-16/preparation-budget/`, contrato e limitações em [[Preparação Histórica Spark]].

Continuação v0.7, em 17/10/2026: **382 cenários Spark aprovados** na execução completa (zero ignorados, 62 novos), cinco scripts existentes de Rules e `check` com 815 comuns/88 condicionais ignorados. Construção de 985 certificados sobre 1.000 nós custa 2.955 escritas; cada consulta aquecida usa 32 páginas/154 leituras explícitas/38 escritas. Construção + três consultas com datas diferentes: 3.069 escritas contra 6.294 lineares, redução de 51,2%. Primeiro uso com construção custa mais; fronteiras adversariais continuam com fallback. Ver [[Agregados Históricos Spark]] e `.expo/spark-proof-2026-10-17/history-segments/`. Nenhum consumidor publicado foi trocado.

## Próximos critérios antes de habilitar usuários

A prova agora cobre abertura mensal passada/atual/futura, contagem em instante passado, ajuste no fim do dia civil, substituição atômica e estorno com referências posteriores. A análise de snapshots produz diagnóstico local; inventário real, bootstrap conferido, restauração e corte de escritores continuam na fase de compatibilidade. Depois vêm as demais operações, resumos/relatórios, consentimento/vínculos e integração ao chat/formulários Web/mobile. Não executar o protocolo novo em paralelo sobre posições ainda escritas pelo backend antigo.

**Aberturas futuras, substituição de ajustes, reservas e agregados imutáveis de movimentos estão implementados na prova v0.7.** O analisador de snapshots ainda bloqueia dados futuros, pois não há importador que confira e inicialize o menor `nextActivationAt`, ponteiros e calendário no bootstrap. Não retirar esse bloqueio só porque o serviço de agendamento passou nos testes. Homologação de volumes com muitas fronteiras, progresso/pausa nas interfaces, normalização dos ajustes existentes/eventos compostos no bootstrap e integração dos leitores/escritores continuam pendentes; a fase 1 integral permanece aberta.

Os serviços antigos da prova continuam recusando parâmetros de data que não suportam; o serviço temporal tem contrato próprio e explícito. Nenhuma data é descartada silenciosamente para transformar uma intenção retroativa em operação atual.

Não houve teste em aparelho, export que inclua a integração nova, consulta a dados reais, mudança de faturamento, ativação remota ou deploy. Push com todos os apps fechados continua pendência explícita no plano. Os comandos atuais de deploy ainda incluem Functions; `test:spark` é um teste local, não um novo perfil de publicação.

## Arquivos principais e integrações

- `functions/sparkFinancialProtocol.ts`: execução transacional comum, identidade, papel, cota e reconciliação de recibos.
- `functions/SparkTransferFirebase.ts`: transferências, aportes/resgates e estorno do par.
- `functions/SparkAccountFirebase.ts`: abertura zero por identidade da conta.
- `functions/SparkBalanceFirebase.ts`: contagem atual, ajuste atual e inverso histórico com referência posterior.
- `functions/SparkAdjustmentReplacementFirebase.ts`: substituição atômica, duas datas históricas e resolução compartilhada com estorno.
- `functions/SparkHistoryFirebase.ts`: projeção sequencial limitada, completa e retomável.
- `functions/SparkTemporalBalanceFirebase.ts`: abertura mensal, ajuste civil e contagem retroativa confirmados contra a prova.
- `functions/SparkMonthlyActivationFirebase.ts`: ativação mensal certificada, retomada e leitura de posição atual conferida no servidor.
- `functions/sparkHistorySegments.ts`, `functions/sparkHistoryEvent.ts`: certificados reutilizáveis e normalização compartilhada.
- `utils/sparkPreparationBudget.ts`: política, estimativas e diagnóstico da preparação.
- `utils/sparkFinancialReconciliation.ts`, `backend/scripts/reconcileSparkSnapshot.ts`: diagnóstico local e calendário protegido, ver [[Reconciliação de Dados Spark]].
- `firestore.rules`: guards e matches aditivos, sem reabrir escrita nas coleções atuais.
- `backend/tests/sparkTransfer.rules.test.ts`: clientes reais locais e ataques diretos que não usam o serviço.
- `package.json`, `backend/package.json`: execução separada sem Functions.
- `utils/financialLedger.ts`: validação de identidade reutilizada.

[[Plano de Funcionalidade Completa sem Blaze]] define as fases de paridade. [[Transferências]] e [[Investimentos]] continuam descrevendo os fluxos publicados atuais até o corte validado. [[Processo de Release]] conserva seus gates existentes.
