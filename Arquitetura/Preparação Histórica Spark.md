---
tags: [firebase, spark, financeiro, cotas, seguranca]
relacionado: [[Protocolo Financeiro Spark]], [[Plano de Funcionalidade Completa sem Blaze]], [[Reconciliação de Dados Spark]], [[Ajuste de Saldo]], [[Balanço Mensal]]
status: em desenvolvimento
tipo: arquitetura
versao: 0.2.1
spark_module: F01
spark_progress: 80
spark_reviewed_at: 2026-10-22
---

# Preparação Histórica Spark

<!-- spark-progress:start -->
## Progresso Spark — 22/10/2026

**F01 — Protocolo, histórico e preparação: 80% implementado / 20% restante.** Notas P/I/D/E: **100/75/50/75**; cálculo e evidências em [[Status da Implementação Spark]].

O percentual corresponde ao módulo completo, incluindo integração e dados, e não somente ao serviço descrito nesta página. **Próxima entrega:** Concluir restauração dos argumentos/provas/fases descritivas e progresso/pausa no assistente; medir custo em volumes representativos. Identificação, conferência e cancelamento já sobrevivem ao reload pelo executor comum. Ativação mensal conserva sua fila própria.

Esta revisão prevalece sobre listas de pendências datadas das entregas anteriores abaixo. Implementação local e logs não aprovam publicação nem migração real.
<!-- spark-progress:end -->

## Continuação v17 — 22/10/2026

A projeção desempata por revisão os movimentos confirmados sem data declarada no mesmo instante de uma referência. Se a revisão do movimento for posterior à referência, ele continua no saldo; operações com data explícita conservam a cobertura original. Segmentos que cruzam essa fronteira não inclusiva não aceleram a página, para que cada nó seja conferido. O ensaio de resgate após sincronização reproduz esse empate de forma determinística.

Marcador protegido e destino do plano local: `financial-proof-v17`; o novo hash não habilita grupos reais. O histórico reconhece os nós de avaliação composta e a referência corretiva como checkpoints. O propósito exclusivo `valuation_undo` vincula uma única referência vigente excluída, permanece imutável e não autoriza comandos comuns. Contratos replanejados usam sucessor/predecessor e metadados no mesmo commit; listas atualizam a agenda depois da confirmação e não estendem lembretes de contrato vencido silenciosamente. Ver [[Protocolo Financeiro Spark]], [[Recorrências Spark]], [[Investimentos]] e [[Status da Implementação Spark]].


## Fila de ativação e retomada persistente — 22/10/2026

`SparkActivationQueueFirebase` lista posições bancárias ativas com prazo vencido, sem materializar durante a leitura. O aviso na raiz compartilha a entrada Web/mobile e reapresenta a fila ao retornar ao primeiro plano. Cada continuação trabalha até vinte páginas; pausa aborta as próximas etapas e conserva trabalho confirmado. A conclusão invalida consultas financeiras do mesmo UID. O guard autoritativo continua decidindo atualidade; leitura de relógio local somente seleciona candidatos.

Ao retomar, a consulta privada de provas filtra UID/conta/finalidade/cabeça e ordena por `asOf`; conserva instante e identidade de prova elegível, em vez de começar outra a cada reload. O índice composto foi registrado. Revisão alterada, prova de outra conta/ator, frontier já ultrapassada ou sessão revogada não autorizam ativação. Membro pode aplicar a referência previamente autorizada; não pode criar nova contagem. Dois controles SDK novos ensaiam preparação parcial, pausa, reload sem estado local, replay e revogação.

Essa descoberta não recupera automaticamente novos lançamentos/contagens/intenção composta. Persistência das demais intenções, integração do progresso na carteira/chat e medições representativas permanecem pendentes. A varredura de posições/consulta de provas tem custo adicional e não é contabilização da franquia.


Controla o trabalho admitido para certificar o histórico sem Functions. Implementação isolada, compartilhada por Web/native, usando Auth e transações do SDK Firestore. Não conecta os serviços publicados nem habilita grupos reais. O marcador atual é `financial-proof-v6`; provas/grupos anteriores exigem transição explícita.

## Como funciona

A cadeia imutável e as duas passagens financeiras de [[Protocolo Financeiro Spark]] permanecem iguais. Sem aceleração, cada página valida **um evento**, ou uma mudança de fase, e grava apenas a prova. Páginas maiores foram descartadas após ultrapassarem 1.000 expressões das Rules em histórias válidas. Os predicados distinguem checkpoint, movimento comum e substituição com dois termos, conservando a mesma matemática.

A prova acrescenta quatro inteiros protegidos:

- `workRevision`: páginas confirmadas, incluindo mudanças de fase; inicia em zero.
- `leaseRevision`: reservas confirmadas; inicia em um e cresce somente com nova cobrança atômica.
- `leaseWindowStartInMillis`: início do dia UTC conferido por `request.time`.
- `leaseEndWorkRevision`: revisão máxima já reservada naquele dia.

Criação/refill grava três documentos atômicos: prova, `sparkPreparationUserQuotas/{uid}` e `sparkPreparationQuotas/project`. A cota privada identifica grupo, prova, revisão e páginas reservadas. O documento do projeto contém somente versão, janela, totais numéricos e timestamp; não expõe UID, grupo ou conta. O próprio UID pode obter sua cota; outro UID não pode. Sessões recentes podem obter o agregado; listagem e exclusão são recusadas.

As Rules vinculam cada incremento aos estados anterior/posterior dos três documentos. Não basta reutilizar um timestamp, apontar uma cota antiga ou enviar só o incremento declarado. Prova sem cobrança, cobrança sem prova, reserva em outro grupo, reinício de contador no mesmo dia, campos extras e devolução de slots são recusados. Só uma prova pode ser atendida pela reserva do UID naquela transação.

Uma reserva admite de uma até 64 páginas, nunca mais que o trabalho restante. Renovar exige reserva esgotada ou dia anterior, fase incompleta e cabeça da posição ainda idêntica. Reserva não utilizada continua consumida até expirar; não há reembolso nem transferência de slots para outro dia. Alterações de saldo continuam exigindo sua própria transação financeira e cota de 120/minuto.

## Configuração e limites

Política fixa versionada em `utils/sparkPreparationBudget.ts` e nas Rules:

| Limite | Valor |
|---|---:|
| Eventos por página | 1 |
| Páginas por reserva | até 64 |
| Páginas por chamada de preparação | até 100 |
| Unidades de leitura de admissão por página | 10 |
| Unidades de leitura de admissão por reserva | 40 |
| Unidades de escrita por reserva | 3 + páginas reservadas |
| Unidades de leitura por UID/dia UTC | 22.000 |
| Unidades de escrita por UID/dia UTC | 6.000 |
| Unidades de leitura do projeto/dia UTC | 24.000 |
| Unidades de escrita do projeto/dia UTC | 8.000 |

Essas unidades são **política de admissão**, não um medidor de fatura ou limite de toda a aplicação. Leituras explícitas para consultar progresso, tentativas recusadas, retries, leituras dependentes das Rules, listeners, outros protocolos e outros escritores não são integralmente contabilizados. As cotas de preparação também não substituem App Check, controle de abuso ou monitoramento do projeto. A franquia gratuita do Firestore tem reset próximo da meia-noite do Pacífico, diferente deste dia UTC. Não prometer disponibilidade gratuita apenas porque existe saldo de reserva. Fontes: [franquia e limites](https://firebase.google.com/docs/firestore/quotas), [cobrança de Rules](https://firebase.google.com/docs/firestore/pricing#cloud_firestore_security_rules).

O aparelho propõe a janela; somente o dia de `request.time` é aceito. Clock skew e virada de dia podem recusar uma tentativa. Não classificar toda recusa como orçamento esgotado nem repetir automaticamente uma escrita incerta.

## API, progresso e pausa

- `startSparkHistoryProofFirebase(db, input, options?, requestedPages?)`: cria prova e reserva. Repetir ID/material retorna somente o trabalho existente; material diferente é erro.
- `stepSparkHistoryProofFirebase(db, identity, expectedWorkRevision, options?)`: exige revisão esperada. Se essa revisão já avançou, retorna progresso por leitura, sem executar a página seguinte. Revisão adiantada é erro. A cabeça é conferida antes de ler o evento seguinte, inclusive em replay.
- `renewSparkHistoryBudgetFirebase(db, identity, expectedLeaseRevision, options?, requestedPages?)`: reserva novo bloco. Repetir uma revisão já renovada é leitura; não duplica cobrança.
- `prepareSparkHistoryProofFirebase(db, input, maxPages = 100, options?)`: orquestra chamadas limitadas; retornar prova com fase incompleta significa preparação parcial. Zero páginas permite criar/ler o trabalho, ainda reservando pelo menos uma página se ele for novo.
- `getSparkPreparationProgress(proof)`: estimativa total, páginas concluídas/restantes e slots ainda utilizáveis no dia local. Esse indicador é informativo; a Rule decide validade da janela.
- `options.signal`: pausa antes de iniciar, entre páginas e antes da escrita quando o aborto é observado. Não cancela um commit já enviado. Conserva progresso e reservas; não é estado persistido de cancelamento. Retomar usa o mesmo ID/material. A atualização mensal também observa pausa antes de ativar.
- `options.metrics`: tentativas, chamadas explícitas de leitura, escritas com commit reconhecido, páginas e reservas. Sem IDs/tokens/conteúdo financeiro. Resultado incerto recuperado por leitura não é contabilizado como escrita reconhecida. Isso não mede leituras faturadas das Rules.

`SparkPreparationError.reason` diferencia `paused`, `budget-exhausted`, `lease-required`, `stale` e `revision`. Orçamento esgotado só vem do pré-check dos contadores concretos, sem inferir a causa de um `permission-denied`. Resultados SDK ambíguos permitem somente recuperação por leitura da revisão confirmada, com ator, papel e cabeça revalidados. Um erro sem progresso correspondente continua sendo erro.

## Estimativa e medição

Para `N = headRevision + 1` eventos: `P = 2N + 2` páginas. Com reservas plenamente aproveitadas de até 64 páginas, `G = ceil(P/64)`, escritas `P + 3G`, leituras de eventos `2N`, unidades de leitura reservadas `10P + 40G`. A confirmação financeira é separada. Pausas, reservas menores, expiração, concorrência e retries podem aumentar custo/duração. `estimateSparkPreparation` não impõe um máximo permanente de tamanho da conta.

O benchmark usa fixtures sintéticas de 1, 129 e 1.000 eventos, Auth real no Emulator e Rules ligadas, sem Functions. Confere saldo final, revisões, número de reservas, escritas reconhecidas e totais persistidos. Evidências em `.expo/spark-proof-2026-10-16/preparation-budget/`; duração local não é previsão de latência de produção.

Medição final local (não inclui seed das fixtures nem confirmação financeira):

| Eventos | Duração | Páginas | Reservas | Leituras explícitas SDK | Escritas reconhecidas | Unidades de leitura reservadas |
|---|---:|---:|---:|---:|---:|---:|
| 1 | 95 ms | 4 | 1 | 19 | 7 | 80 |
| 129 | 5.156 ms | 260 | 5 | 1.069 | 275 | 2.800 |
| 1.000 | 33.296 ms | 2.002 | 32 | 8.226 | 2.098 | 21.300 |

O custo foi medido do início até a prova completa, retomando a cada 100 páginas. A execução de 1.000 nós cabe na política de admissão de um UID sem reservas concorrentes; isso não estabelece um tamanho máximo universal nem mede reads faturados. As estimativas do caminho completo e os totais persistidos coincidiram.

Validação: **320 testes Spark**, zero ignorados (45 novos além dos 275), seguidos dos cinco scripts existentes de Rules; `check` passou com **815 comuns**, 88 condicionais ignorados. Cotas/atomização, isolamento entre UID/grupos, replay de página/reserva, concorrência de sessões, pausa antes/durante leitura, expiração sintética da janela, recusa sem escrita parcial, aritmética composta e casos financeiros anteriores fazem parte da matriz. As recusas Spark não podem ser causadas por esgotamento das Rules. O teste de janela prepara documentos sintéticos do dia anterior; não altera o relógio do servidor. Não houve homologação de interface ou aparelho.

## Observações importantes

O algoritmo continua O(N). Para 1.000 eventos são 2.002 páginas e, em condições ideais, 32 reservas, **2.098 escritas** e 21.300 unidades de leitura admitidas. A versão sem reservas usava 2.003 escritas de preparação: o controle adiciona cerca de 4,7%, em troca de limitar trabalho admitido e tornar replay de páginas idempotente. Não apresentar esta entrega como redução do custo linear.

Histórico maior pode consumir vários dias, especialmente com orçamento compartilhado entre usuários. Uma consulta histórica fixa pode retomar se a cabeça não mudou. Ajuste “hoje/commit” não pode conservar silenciosamente uma intenção do dia anterior: mudança de dia civil exige nova prévia/intenção e pode demandar nova prova. **Agregados certificados de movimentos estão disponíveis na v0.7, descritos em [[Agregados Históricos Spark]].** Datas/fronteiras adversariais podem manter custo linear; paridade prática de volumes ainda exige homologação.

Integração de progresso, pausa e retomada nas telas/chat, homologação em aparelhos, bootstrap/restauração e publicação continuam pendentes. Os serviços publicados não passam a usar esta prova por estar presente no repositório. Não houve acesso a dados reais ou deploy.

## Arquivos principais

- `functions/SparkHistoryFirebase.ts`: reservas, avanço, replay, pausa e progresso.
- `functions/SparkMonthlyActivationFirebase.ts`: propagação da preparação e pausa antes da ativação.
- `functions/sparkFinancialProtocol.ts`: marcador do protocolo.
- `utils/sparkPreparationBudget.ts`: política, estimativa e diagnóstico.
- `firestore.rules`: autoridade e vínculos atômicos.
- `backend/tests/sparkTransfer.rules.test.ts`: testes integrados e medição sintética.
- `tests/sparkPreparationBudget.test.ts`: fórmulas e limites de estimativa.

## Continuação com agregados

A v0.7 acrescenta `segmentId` à prova e `useSegments` opcional. O caminho sem aceleração e seus números históricos acima permanecem válidos. Consultas aquecidas reservam até 16 páginas; cada certificado novo consome 20 unidades de leitura/três escritas nos mesmos contadores, usando schema privado alternativo `workKind: segment`. Totais não reiniciam ao alternar modos. A estimativa de progresso é explicitamente o limite sem aceleração; diagnóstico acrescenta páginas de segmento/nós reutilizados. Ver custos completos e limites em [[Agregados Históricos Spark]].

### Evidência posterior: compilação de Rules sem avisos de tipo

A compilação local deixou de emitir os avisos de `null` versus string/map. Histórico recorrente mantém o fallback anterior para campo ausente/nulo, mas usa referência textual na validação. A cadeia histórica valida explicitamente a raiz antes de aceitar ponteiro nulo. Cotas passam mapa anterior e presença separadamente, obtidos de `resource`/`exists`, sem adicionar flag controlada pelo cliente nem permitir reiniciar uma cota existente. Limites, receitas e efeitos não foram afrouxados.

Depois da mudança, `.expo/spark-no-warning-rules.log` aprovou **1.050 cenários Spark e os cinco scripts anteriores de Rules na mesma cadeia**, com saída zero. `.expo/spark-no-warning-sdk.log` aprovou **33 cenários**; `spark-no-warning-import.log` aprovou **18** em emuladores próprios, com compilação sem aqueles avisos. Testes positivos de páginas, reservas e agregados continuam dentro do orçamento de expressões; recusas não são aceitas por esgotamento. A Home também conserva o saldo confirmado quando faltam taxas CDI do titular, mesmo se a consulta retornar sucesso com lista vazia ou somente taxa de outro membro.

O gate e os bundles foram repetidos após esse último ajuste da Home: `.expo/spark-financial-accepted-check.log` (**104 ferramentas, 989 comuns**, 89 condicionais ignorados) e `spark-financial-{web,android}-accepted.log` (ambos exportados, aviso conhecido de fallback Android). Os 47 cenários dirigidos passaram nos dois fusos em `spark-financial-accepted-{tokyo,la}.log`. “Accepted” nesses nomes identifica somente a verificação local, sem aprovação de release. Sem dado real, publicação ou nova homologação visual/aparelho; percentuais e pendências anteriores permanecem.
