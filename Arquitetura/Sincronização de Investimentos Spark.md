---
tags: [firebase, spark, investimentos, saldo, historico, seguranca]
relacionado: [[Investimentos]], [[Protocolo Financeiro Spark]], [[Preparação Histórica Spark]], [[Agregados Históricos Spark]], [[Cadastros de Contas Spark]], [[Importação Financeira Local Spark]], [[Plano de Funcionalidade Completa sem Blaze]]
status: em desenvolvimento
tipo: feature
versao: 0.6.1
spark_module: F08
spark_progress: 75
spark_reviewed_at: 2026-10-22
---

# Sincronização de Investimentos Spark

<!-- spark-progress:start -->
## Progresso Spark — 22/10/2026

**F08 — Investimentos e carteira completa: 75% implementado / 25% restante.** Notas P/I/D/E: **100/75/25/75**; cálculo e evidências em [[Status da Implementação Spark]].

O percentual corresponde ao módulo completo, incluindo integração e dados, e não somente ao serviço descrito nesta página. **Próxima entrega:** Concluir restauração integral após reload, capital/catálogo importados, assistente e homologação. Principal/financiamento com avaliação no mesmo commit e desfazimento da avaliação vigente já estão conectados; avaliações anteriores não têm estorno genérico.

Esta revisão prevalece sobre listas de pendências datadas das entregas anteriores abaixo. Implementação local e logs não aprovam publicação nem migração real.
<!-- spark-progress:end -->

## Edição composta e desfazimento de avaliação vigente — 22/10/2026

`SparkInvestmentPrincipalFirebase` e `SparkInvestmentFundingFirebase` aceitam `valuation` com identidade própria e valor observado não negativo. Capital e banco(s) continuam corrigidos na data original da aplicação. `sparkInvestmentEditValuation` prepara o segundo nó e confirma a nova referência no instante do servidor, dentro da mesma transação, sem fase financeira intermediária. A posição do investimento avança duas revisões; capital e bancos avançam uma. O filho aponta ao pai, que aponta à cabeça anterior. Rules exigem os dois nós, efeitos, capital, checkpoint, cota e revisões exatos. Catálogo continua sendo fase não monetária com identidade estável. A ponte das quatro telas de cadastro/carteira usa o comando composto quando o valor observado muda.

`SparkInvestmentValuationReversalFirebase` desfaz a **avaliação vigente** por uma preparação exclusiva `valuation_undo`. Ignora somente essa referência na seleção do checkpoint, conserva os movimentos na mesma fronteira e soma a cauda posterior. O commit escreve uma referência corretiva na data da avaliação, a posição e um claim único; banco(s), principal e observação original permanecem. Não subtrai uma diferença antiga do saldo atual nem limita silenciosamente resultado negativo a zero. Saldo/valor histórico negativos recusam o comando inteiro. Avaliações cobertas por outra referência não possuem estorno genérico; a interface só oferece a vigente, com ID/revisão apresentados, motivo e confirmação. A referência corretiva não oferece um novo desfazimento que reativaria a observação cancelada.

Preparação trabalha em até vinte páginas por chamada; Pausar/Continuar conserva a prova no servidor, mas a identidade da intenção ainda depende do estado do formulário. Se a resposta de uma sincronização/desfazimento se perder, a ponte consulta primeiro o receipt e usa o replay do serviço; não tenta preparar novamente uma prova invalidada pelo próprio commit. Carteira, Home e histórico reconhecem os novos nós como referências de avaliação, excluídas de receitas/despesas. O titular CDI continua sendo o autor da abertura.

Marcador vigente `financial-proof-v17`, sem habilitar grupos reais. Compatibilidade de capital/cadastro importados, recuperação geral, assistente e homologação continuam pendentes.


Continuação local em 18/10/2026, protocolo v0.12 com marcador protegido `financial-proof-v10`. Auth/Firestore, sem Functions. O novo evento `investment_sync` passa a ser uma referência histórica; clientes do protocolo anterior não podem tratá-lo apenas como uma diferença comum. Por isso grupos v9 não são habilitados automaticamente. O plano local de importação também passa a apontar para v10 e seu hash muda. Nenhum grupo real é ativado.

A continuação [[Financiamento Inicial de Investimentos Spark]] passa o marcador vigente para `financial-proof-v11`, preserva este evento e acrescenta criação financiada com avaliação inicial no commit. O leitor agora retorna também `principal`, independente de saldo/referência, nulo para posições antigas sem registro canônico do capital.

O marcador vigente passa a `financial-proof-v12` com [[Movimentos Datados em Par Spark]], permitindo data de aporte/resgate/estorno independente desta observação. A referência existente determina o efeito atual do par, sem trocar a data do lançamento.

[[Edição do Principal Spark]] passa o marcador vigente para `financial-proof-v13`. Corrige o capital no mesmo banco de origem, sem reescrever referências de avaliação. O leitor retorna revisão/cabeça do capital para confirmar essa intenção separadamente.

[[Troca do Banco de Financiamento Spark]] passa o marcador vigente a `financial-proof-v14`: banco/valor canônicos podem mudar com três pernas atômicas, mantendo esta observação independente.

[[Criação Retroativa de Investimentos Spark]] passa o marcador vigente para `financial-proof-v15`: aplicação e referência inicial podem ter data explícita. Observação em data diferente continua usando esta sincronização, sem atribuir uma cotação atual automaticamente à data da aplicação.

## Preparação e confirmação

`functions/SparkInvestmentFirebase.ts` fornece:

- `prepareSparkInvestmentSyncFirebase`: prepara/retoma a prova histórica para `observedAt`, com o mesmo ID da intenção. Reutiliza páginas, progresso, pausa, cotas e certificados existentes. Não altera saldo.
- `synchronizeSparkInvestmentFirebase`: confirma o valor observado por meio do motor temporal compartilhado e grava um receipt imutável `investment_sync`. Exige administrador atual, investimento ativo, valor inteiro entre zero e 1.000.000.000.000 centavos, data não futura e revisão explicitamente confirmada.
- `readSparkInvestmentStateFirebase`: lê posição e referência na mesma transação, com UID atual e verificação de atualidade no servidor. Retorna `currentBalanceInCents`, revisão/cabeça e `reference`, nula se ainda não houver uma referência canônica. Quando existir, conserva ID, valor, instante e inclusividade, inclusive de referência importada.

A confirmação exige a prova completa do próprio ator, conta, data, propósito e cabeça/revisão. Um movimento posterior à prévia exige outra preparação com novo ID. Confirmação não recalcula silenciosamente uma intenção desatualizada. Datas materiais são comparadas com precisão de Timestamp; reenvio exato em outra sessão recupera o receipt, sem repetir saldo ou cota. Trocar valor/data/argumentos sob o mesmo ID é recusado. A autorização atual também é exigida no replay.

## Efeito financeiro e histórico

O evento é uma avaliação manual da posição, não um aporte, resgate ou rendimento estimado. O banco não é debitado/creditado; principal e catálogo não são editados. O valor observado pode ser menor ou maior que a referência anterior, inclusive zero. Diferença zero também conserva receipt, revisão e referência auditáveis.

```text
diferença histórica = valor observado − saldo provado na data observada

se existe referência posterior que já cobre a data observada:
  efeito atual = 0
  conservar a referência posterior
senão:
  saldo atual novo = valor observado + movimentos posteriores à data observada
  efeito atual = saldo atual novo − saldo atual anterior
  atualizar a referência para o valor e a data observados
```

Exemplo: posição de 5.000, aporte posterior de 1.000 e valor observado antigo de 6.200 produzem saldo atual de 7.200. A referência permanece 6.200 na data observada. O aporte continua sendo 1.000 e seu banco continua debitado uma única vez. Outra sincronização mais antiga pode corrigir a consulta histórica, mas não substitui a referência mais recente nem o saldo atual que ela determina.

Alvo e saldo atual final do investimento não podem ser negativos, mesmo com justificativa. Se um resgate posterior de 4.500 e valor observado anterior de 1.000 produziriam saldo atual -3.500, a sincronização inteira é recusada. Não se desfaz o resgate já confirmado nem se deixa receipt/posição/referência parcial.

`investment_sync` participa da busca de checkpoints tanto no cliente quanto nas Rules. A mesma data é resolvida pela revisão mais recente da cadeia; uma referência exata exclui os movimentos já incorporados naquela fronteira. A certificação de segmentos não pode atravessar esse novo checkpoint como se ele fosse um movimento comum. Provas posteriores e anteriores à sincronização mantêm seus resultados próprios.

## Segurança

Receipt, posição, cota e, quando aplicável, referência são confirmados juntos. Todos os esquemas permanecem fechados. Rules conferem tipo de conta, prova imutável já concluída, matemática, prazo, revisão/cabeça, autoria do receipt e cota. Falta, divergência, referência inclusiva, data alterada, campo de principal ou tentativa de alterar também um banco recusam o lote inteiro. `account_count`, reconciliação bancária, ajuste e abertura mensal continuam sem permitir contagem em investimento; o caminho específico é `investment_sync`.

O administrador declara um valor observado; o protocolo não certifica o extrato da instituição. Essa autorização é a mesma classe de reconciliação manual do contrato atual. O evento não deve entrar nos totais de receitas/despesas comuns nem nos aportes da carteira. Os futuros adaptadores de relatório precisam conservar essa classificação ao converter eventos Spark.

## Limites da entrega

Os serviços ainda não estão conectados aos formulários/leitores Web/mobile ou ao executor do assistente. [[Movimentos Datados em Par Spark]] acrescenta a data própria dos aportes/resgates, preservando o serviço de commit; montar o fluxo de tela com as duas datas e recuperação de cada intenção continua pendente. Financiamento/avaliação inicial numa única intenção está em [[Financiamento Inicial de Investimentos Spark]] e [[Criação Retroativa de Investimentos Spark]]. Avaliação simultânea na edição, histórico CDI do usuário, arquivamento, categorias, formatos legados restantes e transição de grupos reais permanecem pendentes.

O leitor não inventa referência, data inicial ou taxa quando faltam dados. A referência importada pode ter origem em uma contagem/abertura comprovada, por isso o retorno se chama `reference`, sem apresentá-la automaticamente como última sincronização manual. Consulta de um período arbitrário continua usando a prova histórica.

## Validação

Os testes em `backend/tests/sparkTransfer.rules.test.ts` cobrem ganhos/perdas/zero/limites, aportes e resgates posteriores, saldo negativo, duas referências, empate de data, replay, prova incompleta/stale, conta incorreta, permissões, data futura, prazo vencido, tipo de evento, partes obrigatórias e falsificação por escrita direta. Os ensaios em `backend/tests/sparkLedgerImport.emulator.test.ts` incluem sincronização após importação sintética e consulta do histórico anterior. Evidências em `.expo/spark-proof-2026-10-18/investment-sync/`.

Resultado: suíte completa com 594 cenários Spark e os cinco scripts existentes de Rules aprovados; verificação dirigida final com 43 casos novos aprovados (40 já incluídos na suíte completa e três adicionais de concorrência/certificados). União: 597 cenários únicos verificados, sem ignorados nessas execuções. Restore/importação com 15 ensaios aprovados. `check` passou com estilos/tipos, 103 testes locais de ferramentas e 815 comuns/88 condicionais ignorados. A primeira falha de expectativa de sessão simulada foi corrigida e conservada nas evidências. Nenhum aparelho ou fluxo de tela/chat foi homologado neste bloco.
