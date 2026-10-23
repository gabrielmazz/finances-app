---
tags: [firebase, spark, investimentos, principal, bancos, historico, seguranca]
relacionado: [[Edição do Principal Spark]], [[Financiamento Inicial de Investimentos Spark]], [[Sincronização de Investimentos Spark]], [[Cadastros de Contas Spark]], [[Protocolo Financeiro Spark]], [[Agregados Históricos Spark]], [[Importação Financeira Local Spark]], [[Plano de Funcionalidade Completa sem Blaze]]
status: em desenvolvimento
tipo: feature
versao: 0.2.1
spark_module: F08
spark_progress: 75
spark_reviewed_at: 2026-10-22
---

# Troca do Banco de Financiamento Spark

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


Continuação local de 19/10/2026, protocolo v0.16/`financial-proof-v14`. `functions/SparkInvestmentFundingFirebase.ts` acrescenta troca do banco de financiamento de investimento canônico, com correção opcional do principal na mesma intenção. Auth/Firestore, sem Functions. Os históricos passam a reconhecer três contas no evento; clientes/grupos v13 não são habilitados automaticamente. O destino/hash do importador local acompanha v14, conservando a ativação bloqueada.

## Contrato

`changeSparkInvestmentFundingFirebase` recebe os argumentos de `SparkInvestmentPrincipalInput` e também `newFundingAccountId`/`expectedNewFundingRevision`. `fundingAccountId` é o banco financiador canônico vigente, conferido no capital; `openingOperationId` é a âncora permanente da criação, mesmo depois de trocas sucessivas. Principal pode mudar ou permanecer igual, inclusive zero; exige inteiro entre zero e 1.000.000.000.000 centavos. Novo banco, banco anterior e investimento devem ser três identidades distintas, ativas e do mesmo grupo. Caixa não substitui banco de financiamento.

Administrador atual confirma revisões das três posições e revisão/cabeça do capital. Data efetiva deriva exclusivamente da abertura original, nunca do horário da edição, de nota ou de argumento livre. Cadastro descritivo do investimento tem intenção/revisão independentes; mudar o financiamento não determina a instituição na qual o ativo está custodiado. A integração dos formulários antigos precisa explicitar essas escolhas.

[[Criação Retroativa de Investimentos Spark]] passa o marcador vigente para `financial-proof-v15`. A data original é `opening.effectiveAt ?? opening.createdAt`, conferida também no guard do capital. Banco/avaliação com referência posterior não recebem novamente o efeito atual de uma aplicação retroativa; o histórico mantém as três pernas na data financeira.

## Efeito financeiro

O receipt imutável `investment_funding_change` tem três pernas na data original:

| Conta / campos de encadeamento | Delta histórico |
|---|---:|
| Banco novo: `fromAccountId`, `fromRevision`, `fromPreviousOperationId` | `−principalInCents` |
| Investimento: `toAccountId`, `toRevision`, `toPreviousOperationId` | `principalInCents − previousPrincipalInCents` |
| Banco anterior: `refundAccountId`, `refundRevision`, `refundPreviousOperationId` | `+previousPrincipalInCents` |

A soma das três pernas é zero. A devolução usa o principal canônico anterior, que pode já ter sido corrigido; não usa cegamente o valor do receipt de abertura. Cada posição recebe o próprio efeito atual depois da referência protegida dessa conta. Uma conferência posterior conserva o saldo atual, enquanto a consulta histórica conserva a perna completa. A avaliação inicial/sincronizações do investimento cobrem a correção na data original e continuam sendo valores observados independentes do principal.

Exemplo: principal vigente 1.000 financiado pelo banco A; novo principal 1.500 financiado por B. Histórico: A +1.000, B −1.500 e investimento +500. Se a avaliação inicial é 1.200, ela continua sendo 1.200, pois já é referência exclusiva na data da abertura. O capital passa a 1.500/B. Uma conferência posterior de A ou B cobre apenas o efeito atual da respectiva conta; não apaga a correção histórica.

As três posições incrementam revisão/cabeça, mesmo com efeito zero. Capital atualiza valor, banco, revisão/cabeça e horário; conserva ator criador e âncora da abertura. Receipt e cota do UID são obrigatórios no mesmo commit. Justificativa é obrigatória quando qualquer saldo bancário final for negativo; limites de centavos e prazo mensal são conferidos nas três posições. Não há passos intermediários de devolução/débito executáveis isoladamente.

Depois da troca, `updateSparkInvestmentPrincipalFirebase` corrige pelo banco canônico vigente, preservando a mesma âncora original. Trocar novamente, inclusive de volta ao banco inicial e depois de principal zero, mantém a cadeia completa. Nova intenção explicitamente confirmada é necessária para desfazer a troca; estorno genérico de par não aceita este tipo.

## Histórico, segurança e concorrência

`sparkHistoryEvent`, projeção de nós e certificados nas Rules reconhecem a conta de devolução e seu predecessor/revisão próprios. Conta alheia não pode usar esse terceiro vínculo. A matemática histórica usa principal novo, diferença e principal anterior; não usa efeitos atuais reduzidos a zero. Certificados conferem deltas assinados e soma de absolutos nas três cadeias.

O receipt exige as três posições e capital atualizados, esquema fechado, valores/revisões tipados e cota. Cada posição recalcula seu efeito com a referência anterior ao commit. O guard do capital confere banco anterior, novo banco, valor anterior/novo, revisão/cabeça, abertura e data imutáveis. Edição comum de principal continua sem poder alterar o banco; apenas o tipo específico autoriza essa mudança. Papel vem do grupo protegido, não do capital ou da intenção. Outro administrador pode agir mantendo a autoria original do capital.

Reenvio exato recupera o receipt sem repetir dinheiro/cota, inclusive após nova correção. Argumentos alterados sob o mesmo ID e revisões stale são recusados. Disputa de intenções diferentes na mesma revisão tem um vencedor; resultado incerto não autoriza nova devolução. Datas/partes/cabeças inventadas, escrita parcial, saldo extra, troca de autor ou exclusão são bloqueados.

As verificações de origem/data ficam no guard do capital e as referências em cada posição. O receipt lê posições antes/depois, capital antes/depois, grupo e cota dentro do limite individual; o lote inteiro também precisa caber no limite compartilhado. Controles positivos de escrita direta incluem referências nas três contas. Erros de limite de acesso/expressões não contam como prova de recusa segura.

## Limites e evidências

Serviços e Rules permanecem sintéticos e não estão ligados às telas Web/mobile nem ao assistente. Capital legado ausente não é inferido. A criação datada está em [[Criação Retroativa de Investimentos Spark]]. Edição com avaliação simultânea, categorias/CDI, arquivamento, formatos antigos restantes, consentimentos/corte e release continuam pendentes. Nenhum dado real, cobrança ou publicação foi alterado.

Evidências em `.expo/spark-proof-2026-10-19/funding-change/`. Os testes cobrem três pernas, aumento/redução/zero/mesmo principal, principal corrigido antes da troca, trocas sucessivas, novo administrador, revisões stale, replay/concorrência, referências por conta, certificados, limites, prazos, partes obrigatórias e adulteração direta. Importação ensaia investimento novo financiado por dois bancos importados, sem alterar o histórico anterior.

Resultado: 801 cenários Spark aprovados (53 novos), zero ignorados, mais os cinco scripts existentes de Rules; 119 cenários dirigidos de troca/certificados/regressões aprovados; 19 ensaios de restore/importação aprovados. `check` passou com estilos/tipos, 103 testes de ferramentas e 815 comuns/88 condicionais ignorados. A primeira suíte completa revelou seis falhas de orçamento em certificados; a execução foi conservada e a normalização por forma de evento foi corrigida antes da regressão dirigida e da execução completa finais. Nenhum erro de limite de Rules é contado como aprovação de segurança. Não houve validação em telas ou aparelhos.
