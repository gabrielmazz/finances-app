---
tags: [firebase, spark, investimentos, principal, contas, seguranca]
relacionado: [[Investimentos]], [[Cadastros de Contas Spark]], [[Sincronização de Investimentos Spark]], [[Protocolo Financeiro Spark]], [[Agregados Históricos Spark]], [[Importação Financeira Local Spark]], [[Plano de Funcionalidade Completa sem Blaze]]
status: em desenvolvimento
tipo: feature
versao: 0.5.1
spark_module: F08
spark_progress: 75
spark_reviewed_at: 2026-10-22
---

# Financiamento Inicial de Investimentos Spark

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


Continuação local de 18/10/2026, protocolo v0.13/`financial-proof-v11`. `functions/SparkInvestmentOpeningFirebase.ts` cria um investimento com cadastro, principal financiado pelo banco e valor observado inicial numa única transação cliente. Auth/Firestore, sem Functions. Esta API usa o instante financeiro do commit; [[Criação Retroativa de Investimentos Spark]] acrescenta, em 19/10/2026, API específica com data explícita, sob `financial-proof-v15`. Nenhum grupo real é habilitado automaticamente.

[[Movimentos Datados em Par Spark]] passa o marcador vigente a `financial-proof-v12` e acrescenta datas próprias dos movimentos posteriores, sem alterar o instante desta abertura.

[[Edição do Principal Spark]] passa o marcador vigente para `financial-proof-v13` e permite corrigir o principal pelo mesmo banco de origem, na data original, preservando referências de avaliação. O receipt de criação permanece imutável; o capital passa a ter revisão/cabeça de correção.

Em 19/10/2026, [[Troca do Banco de Financiamento Spark]] passa o marcador vigente a `financial-proof-v14` e permite mudar o banco canônico e o principal numa intenção de três contas. Banco/valor originais continuam no receipt desta criação, enquanto capital contém banco/valor vigentes. `openingOperationId` permanece a âncora original em todas as correções.

## Contrato

`openFundedSparkInvestmentFirebase` recebe grupo/ator/ID estável da operação, identidade estável do investimento, banco de financiamento, revisão bancária confirmada, principal em centavos, valor observado em centavos, catálogo e nota opcional. Exige administrador atual, banco ativo do mesmo grupo com prazo mensal válido e saldo suficiente para o principal. O catálogo deve identificar esse mesmo banco como vínculo inicial.

Principal é positivo e limitado a 1.000.000.000.000 centavos; valor observado admite zero até esse limite. Ambos são inteiros. Criação sem principal continua no caminho de abertura zero já existente. Data explícita não é aceita por esta API de commit; usar `openDatedFundedSparkInvestmentFirebase` para a intenção datada. Ambos os modos gravam `dated` como argumento material. Identidades de Caixa e da própria origem não podem ser usadas como novo investimento.

O banco é debitado pelo principal, mesmo quando o valor observado é diferente. Não há cheque especial no financiamento inicial. Valor observado maior não autoriza aplicar principal maior que o saldo disponível.

## Efeitos atômicos

| Documento | Efeito |
|---|---|
| `sparkPositions/{banco}` | Débito do principal, revisão +1 e predecessor/cabeça conferidos. |
| `sparkPositions/{investimento}` | Nova posição `investment`, revisão zero, saldo igual ao valor observado e cabeça da abertura. |
| `sparkAccountCatalog/{investimento}` | Nome/aparência/produto/CDI/liquidez/descrição, revisão zero, ligado à abertura. |
| `sparkInvestmentCapital/{investimento}` | Principal inicial original e banco de financiamento, ator, operação original e revisão zero. |
| `sparkCheckpoints/{investimento}` | Referência exclusiva no instante do commit, com o valor observado inicial. |
| `sparkOperations/{clientActionId}` | Evento/receipt imutável `investment_opening`, principal, valor observado, diferença de avaliação, campos do cadastro e predecessor do banco. |
| `sparkTransferQuotas/{ator}` | Uma operação financeira, independentemente dos documentos auxiliares. |

Todos os documentos auxiliares do investimento devem estar ausentes antes da criação, inclusive cadastro/referência órfãos. Não há merge, adoção ou sobrescrita de conta existente. A falta/divergência de uma parte impede todo o commit. A transação lê todas as dependências antes de gravar.

Exemplo: principal 1.000, valor observado 1.200. Banco perde 1.000; investimento começa em 1.200; principal original permanece 1.000; diferença de avaliação é +200. Os termos auditáveis correspondem a banco -1.000, posição +1.200 e contrapartida externa de avaliação -200. Essa diferença não é outro aporte, débito bancário, receita ou despesa comum.

## Histórico e leitura

O mesmo evento tem dois papéis por conta:

- No banco, é um movimento de `-amountInCents`, revisão anterior +1 e predecessor bancário. Não cria checkpoint bancário.
- No investimento, é raiz de revisão zero e referência de `openingBalanceInCents`. Sem lançamentos retroativos anteriores, antes da criação o saldo provado é zero; no instante e após a criação vale o observado, acrescido dos movimentos posteriores. Lançamentos datados registrados depois podem aparecer antes da criação administrativa; a referência inicial cobre esses eventos anteriores no saldo atual.

Cliente e Rules normalizam a classificação pela conta consultada. Certificados bancários podem agregar esses débitos usando somente os principais; o lado do investimento não pode ser certificado como movimento comum para pular a referência. A troca para v11 impede que clientes v10 interpretem a nova raiz como um par antigo. O destino/hash do importador local acompanha a versão, conservando o grupo bloqueado.

`readSparkInvestmentStateFirebase` retorna `principal` separado de `currentBalanceInCents` e `reference`. Contém principal/banco canônicos vigentes (corrigíveis pelos protocolos próprios), ID permanente da abertura e revisão/cabeça do capital. Valor e banco originais permanecem no receipt de criação. Investimentos anteriores/importados sem esse registro retornam `principal: null`; não se infere capital do saldo ou de uma avaliação. Sincronizações e aportes/resgates posteriores não alteram esse principal. Trocar o banco do catálogo não reescreve a origem do financiamento.

O registro de capital é legível somente por membros atuais do grupo Spark; update exige o protocolo atômico de [[Edição do Principal Spark]] e delete continua proibido. Não liberar alteração direta do número nem reaproveitar o estorno genérico de um par para apagar uma raiz de investimento.

## Confirmação e segurança

Reenvio exato compara argumentos materiais escalares, inclusive principal, valor observado, banco, revisão confirmada e todos os campos do cadastro. Recupera o receipt sem novo débito/cota. Outro ID para a mesma conta não cria uma segunda posição. Duas intenções independentes preparadas sobre a mesma revisão do banco não podem confirmar ambas; a perdedora exige nova conferência explícita. O replay continua exigindo o papel atual do administrador.

Os guards distribuem a verificação: operação confere schema, banco, valores, revisão, existência anterior/efeitos auxiliares e cota; posição valida predecessor, atualidade, tipo e saldo; catálogo valida campos/igualdade com o receipt; referência valida data/valor; capital valida sua origem imutável e principal tipado. Campos extras, principal divergente, crédito arbitrário, referência inclusiva, data injetada ou outra autoria são recusados. Nenhum dado do cliente concede papel ou acesso ao grupo.

## Limites e validação

Não há integração aos formulários Web/mobile ou ao executor do assistente neste bloco. [[Criação Retroativa de Investimentos Spark]] implementa o serviço datado e deriva as correções posteriores de `effectiveAt ?? createdAt` da abertura. Ainda faltam avaliação simultânea na edição, CDI/categorias, arquivamento, conversão dos registros de capital antigos e corte/consentimentos de grupos reais. A avaliação inicial está no mesmo commit do financiamento; observação em outra data, correção do principal, troca do banco e pares datados têm protocolos próprios, ainda sem adaptação completa dos fluxos de tela.

Os cenários em `backend/tests/sparkTransfer.rules.test.ts` conferem a operação por serviço e escrita direta, efeitos parciais, limites, saldo insuficiente, conta incorreta, órfãos, replay/concorrência, capital protegido, referência, consulta histórica antes/depois do instante e agregação bancária sem confundir avaliação com fluxo. O ensaio de importação cria investimento novo com saldo de banco importado, preservando seu histórico anterior. Evidências em `.expo/spark-proof-2026-10-18/investment-opening/`.

Resultado: 652 cenários Spark aprovados (55 novos), zero ignorados, seguidos dos cinco scripts existentes de Rules; 55 casos dirigidos repetidos e aprovados; 16 ensaios de restore/importação aprovados. `check` passou com estilos/tipos, 103 testes de ferramentas e 815 comuns/88 condicionais ignorados. A recusa final dos aliases de data foi conferida também na repetição dirigida e nos tipos. Nenhum aparelho ou fluxo de tela/chat foi homologado neste bloco.
