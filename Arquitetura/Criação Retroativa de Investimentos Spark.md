---
tags: [firebase, spark, investimentos, historico, principal, seguranca]
relacionado: [[Investimentos]], [[Financiamento Inicial de Investimentos Spark]], [[Edição do Principal Spark]], [[Troca do Banco de Financiamento Spark]], [[Sincronização de Investimentos Spark]], [[Agregados Históricos Spark]], [[Importação Financeira Local Spark]], [[Plano de Funcionalidade Completa sem Blaze]]
status: em desenvolvimento
tipo: feature
versao: 0.1.1
spark_module: F08
spark_progress: 75
spark_reviewed_at: 2026-10-22
---

# Criação Retroativa de Investimentos Spark

<!-- spark-progress:start -->
## Progresso Spark — 22/10/2026

**F08 — Investimentos e carteira completa: 75% implementado / 25% restante.** Notas P/I/D/E: **100/75/25/75**; cálculo e evidências em [[Status da Implementação Spark]].

O percentual corresponde ao módulo completo, incluindo integração e dados, e não somente ao serviço descrito nesta página. **Próxima entrega:** Concluir restauração integral após reload, capital/catálogo importados, assistente e homologação. Principal/financiamento com avaliação no mesmo commit e desfazimento da avaliação vigente já estão conectados; avaliações anteriores não têm estorno genérico.

Esta revisão prevalece sobre listas de pendências datadas das entregas anteriores abaixo. Implementação local e logs não aprovam publicação nem migração real.
<!-- spark-progress:end -->

Continuação local de 19/10/2026, protocolo v0.17/`financial-proof-v15`. `openDatedFundedSparkInvestmentFirebase`, em `functions/SparkInvestmentOpeningFirebase.ts`, cria investimento financiado com data efetiva explícita e referência inicial nessa mesma data. Usa Auth/Firestore e os guards financeiros existentes, sem Functions. O destino/hash do importador acompanha v15; nenhum grupo anterior é ativado ou convertido automaticamente.

## Contrato e datas

Recebe `SparkInvestmentOpeningInput` e `effectiveAt: Timestamp`. Exige administrador atual, banco ativo do grupo e revisão bancária confirmada. Principal positivo e valor observado não negativo são inteiros até 1.000.000.000.000 centavos. Cadastro inicial deve identificar o banco financiador; posição, catálogo, capital e referência do novo investimento precisam estar ausentes.

Aceita uma data desde a época Unix até a confirmação; data futura, string, `Date` e aliases `date`/`observedAt` são recusados. A data deve ser representável em microssegundos: frações menores são recusadas antes de gravar. Firestore corta precisão adicional ao armazenar timestamps; aceitá-las como argumentos materiais causaria divergência entre prévia/efeito persistido e replay. Fonte: [tipos de dados do Firestore](https://firebase.google.com/docs/firestore/manage-data/data-types).

`openFundedSparkInvestmentFirebase` continua sendo a API do instante da confirmação. Ambos os modos gravam `dated` obrigatório. Somente o datado recebe `effectiveAt` e `fromCurrentEffectInCents`. O mesmo ID com modo/data/principal/avaliação/cadastro/revisão diferentes é conflito; replay exato exige autorização atual e não cria outro débito ou cota.

O valor observado inicial **é uma observação na data escolhida**, não uma cotação atual transferida implicitamente para o passado. Para uma observação em outra data, usar [[Sincronização de Investimentos Spark]], preservando suas próprias confirmação/revisão. O formulário antigo ainda precisa ser adaptado para distinguir essas datas.

## Efeitos atômicos

| Documento | Efeito |
|---|---|
| Posição do banco | Revisão +1, novo receipt/cabeça e débito atual somente quando a data não está coberta pela referência bancária protegida. |
| Posição do investimento | Nova raiz, revisão zero e saldo igual ao valor observado inicial. |
| Catálogo e capital | Cadastro completo e principal/banco/âncora original, revisão zero. |
| Referência do investimento | Valor observado e data efetiva, exclusiva na fronteira. |
| Operação | `investment_opening`, autoria e instante administrativo `createdAt`, data financeira explícita e valores distintos de principal/avaliação. |
| Cota | Uma confirmação financeira por UID, validada pelo tempo do servidor. |

Todas as leituras precedem as escritas. As Rules recusam gravação parcial, schema aberto, origem/tipo/ator/revisão/predecessor divergentes e valores inventados. O guard do banco recalcula seu efeito pelo checkpoint anterior ao commit; declarar um efeito zero ou debitar novamente um movimento já coberto não é suficiente para autorizar a escrita.

O saldo bancário resultante deve ser não negativo. Se uma conferência posterior já cobre a aplicação, o efeito atual é zero, mesmo que o principal supere o saldo atual conferido. O histórico conserva o débito integral na data antiga. Essa política não certifica um saldo mínimo não negativo em todos os instantes intermediários do passado; não se calcula uma disponibilidade histórica arbitrária a partir de consultas do cliente.

## Histórico, correções e referências posteriores

No banco, a operação é movimento de `−principal` na data efetiva; no investimento, é raiz/checkpoint com o valor observado. Antes dessa raiz, sem outros movimentos retroativos, o valor provado do investimento é zero. A diferença de avaliação não vira receita, despesa ou aporte adicional.

[[Edição do Principal Spark]] e [[Troca do Banco de Financiamento Spark]] passam a derivar a data de `opening.effectiveAt ?? opening.createdAt`. As Rules do capital impõem a mesma âncora. A data administrativa da criação não pode substituir uma data financeira explícita. Conferências posteriores de cada banco e observações posteriores do investimento continuam cobrindo as correções, com efeito atual zero quando aplicável; as pernas históricas permanecem completas.

Projeção e certificados reutilizam a normalização existente de `effectiveAt`: podem agregar débitos de financiamentos no banco, inclusive com efeito atual zero, mas não podem saltar a raiz/referência do investimento como movimento comum. O estorno genérico de pares continua recusando a raiz; correções usam os contratos específicos.

## Estado da entrega

Serviço compartilhado e Rules implementados; integração aos leitores/formulários Web/mobile e ao assistente permanece pendente. Também faltam avaliação simultânea na edição, categorias/CDI, arquivamento, capital/formatos legados restantes, consentimentos/corte e release/homologação. O ensaio com bancos importados é sintético; não converte capital de investimentos antigos nem ativa contas reais.

Evidências em `.expo/spark-proof-2026-10-19/retro-opening/`. A primeira execução dirigida identificou uma diferença de precisão submicrossegundo e foi conservada: 46 passaram e um controle positivo falhou. A validação passou após a recusa explícita de precisão não representável, com 52 casos dirigidos repetidos. Um caso adicional combina duas conferências bancárias posteriores e uma observação posterior do investimento.

Resultado final: 854 cenários Spark aprovados, incluindo os 53 novos, zero falhas/ignorados, mais os cinco scripts existentes de Rules. Vinte ensaios de restore/importação aprovados, incluindo banco importado que financia abertura datada e conserva a data nas correções. `check` passou com estilos/tipos, 103 testes de ferramentas e 815 comuns/88 condicionais ignorados. Não houve homologação de tela/chat/aparelho, alteração de dados reais, publicação ou cobrança.
