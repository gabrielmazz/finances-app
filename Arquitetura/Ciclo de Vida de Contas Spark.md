---
tags: [firebase, spark, contas, arquivamento, seguranca]
relacionado: [[Cadastros de Contas Spark]], [[Protocolo Financeiro Spark]], [[Integração Financeira Spark]]
status: em desenvolvimento
tipo: feature
versao: 0.1.1
spark_module: F02
spark_progress: 75
spark_reviewed_at: 2026-10-22
---

# Ciclo de Vida de Contas Spark

Continuação de 19/10/2026: os seletores de lançamentos de `BankFirebase` consultam o ciclo canônico e excluem arquivados/inativos por padrão. A opção administrativa explícita conserva esses cadastros; a seleção histórica permanece separada. As ações de arquivar/restaurar/ativar nas telas e assistente continuam pendentes.

<!-- spark-progress:start -->
## Progresso Spark — 22/10/2026

**F02 — Bancos, cadastro e ciclo de vida: 75% implementado / 25% restante.** Notas P/I/D/E: **100/75/25/75**; cálculo e evidências em [[Status da Implementação Spark]].

O percentual corresponde ao módulo completo, incluindo integração e dados, e não somente ao serviço descrito nesta página. **Próxima entrega:** Converter cadastros antigos e homologar aparelhos. Criação, edição, arquivamento, restauração e atividade já possuem entradas Web/mobile.

Esta revisão prevalece sobre listas de pendências datadas das entregas anteriores abaixo. Implementação local e logs não aprovam publicação nem migração real.
<!-- spark-progress:end -->

## Entradas Web/mobile — 22/10/2026

Configurações de bancos e seção de investimentos retidos conectam `SparkAccountLifecycleFormFirebase`/`useSparkAccountLifecycle`. Os botões deixam claro Arquivar/Restaurar/Ativar, preservando a independência de atividade e arquivo. A lista de investimentos retidos aparece também com carteira ativa vazia. A resposta é conferida por UID antes do feedback, e os leitores financeiros do mesmo ator são invalidados após sucesso. Contas arquivadas mantêm saldo retido; não são divulgadas como saldo corrente sem guard do servidor.


`setSparkAccountLifecycleFirebase` permite desativar, ativar, arquivar e restaurar banco/investimento por administrador atual. Caixa canônico permanece ativo. Estado descritivo fica em `sparkAccountStates/{accountId}`, com flags independentes `isActive`/`archived`, data de arquivamento, revisão própria e receipt/cota novos. `sparkPositions.active` deve ser exatamente `isActive && !archived`.

A transação confere revisão financeira e de estado confirmadas e altera apenas a flag de atividade da posição. Saldo, cabeça, revisão financeira, prazo e tempo do último efeito financeiro permanecem intactos. Rules ligam a mudança de atividade ao estado e receipt novos; não admitem saldo/arquivo parcial ou mudança de tipo. Movimentações continuam exigindo posições ativas antes e depois. A disputa de arquivamento com movimento invalida a prévia perdedora.

Desarquivar não ativa um banco desativado. Ativar não remove arquivamento. A data original é preservada enquanto arquivado e limpa ao restaurar; novo arquivamento recebe novo tempo do servidor. Dados, categorias, capital, checkpoints e eventos não são apagados. Leitores devem oferecer histórico arquivado e distinguir saldo retido de saldo atual com prazo mensal vencido. Reativação não dispensa ativar aberturas mensais vencidas antes de movimentar.

23 cenários dirigidos aprovados com Functions desligadas: preservação do histórico e projeção após restaurar, estados independentes, investimento/Caixa, replay, revisões, disputa concorrente, papel/sessão/grupo, atomicidade e forjamentos por SDK direto. Evidências `.expo/spark-proof-2026-10-19/closure/lifecycle-targeted-final.log`. Os leitores canônicos, a seleção histórica, o extrato e a Home já distinguem contas arquivadas/inativas. Formulários/assistente e conversão de contas antigas inativas continuam pendentes.
