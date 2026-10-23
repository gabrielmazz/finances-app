---
tags: [firebase, spark, investimentos, principal, historico, seguranca]
relacionado: [[Investimentos]], [[Financiamento Inicial de Investimentos Spark]], [[Sincronização de Investimentos Spark]], [[Movimentos Datados em Par Spark]], [[Protocolo Financeiro Spark]], [[Importação Financeira Local Spark]], [[Plano de Funcionalidade Completa sem Blaze]]
status: em desenvolvimento
tipo: feature
versao: 0.3.1
spark_module: F08
spark_progress: 75
spark_reviewed_at: 2026-10-22
---

# Edição do Principal Spark

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


Continuação local de 18/10/2026, protocolo v0.15/`financial-proof-v13`. `functions/SparkInvestmentPrincipalFirebase.ts` acrescenta correção do principal de investimentos criados pelo financiamento canônico Spark. Auth/Firestore, sem Functions. Grupo v12 não é habilitado automaticamente; o destino/hash do importador local acompanha v13. Não há migração ou ativação real.

Continuação de 19/10/2026: [[Troca do Banco de Financiamento Spark]] passa o marcador vigente a `financial-proof-v14`. O banco canônico pode mudar pelo serviço específico de três contas; esta API continua corrigindo pelo mesmo banco **vigente**, mesmo se diferente do banco da criação. A âncora original permanece imutável.

## Confirmação e efeitos

`updateSparkInvestmentPrincipalFirebase` recebe grupo/ator/ID estável, investimento, banco de origem, ID permanente da abertura, revisões confirmadas do banco/investimento/capital, cabeça confirmada do capital, novo principal inteiro em centavos e nota/justificativa opcionais. Exige administrador atual. O principal admite zero até 1.000.000.000.000; zero conserva a âncora original e permite correções posteriores. Não se infere principal em posições antigas/importadas sem capital canônico.

A data não é livre: deriva exclusivamente de `effectiveAt ?? createdAt` da abertura financiada imutável. [[Criação Retroativa de Investimentos Spark]] passa o marcador vigente a `financial-proof-v15` e exige essa distinção entre data financeira e criação administrativa. A origem deve ser o banco canônico vigente registrado no capital, mesmo se o vínculo descritivo do catálogo tiver mudado. Trocar essa origem usa [[Troca do Banco de Financiamento Spark]]. Importação do capital antigo e alteração simultânea do valor observado continuam pendentes. O cadastro descritivo tem intenção/revisão próprias.

```text
diferença = novo principal − principal canônico anterior
perna histórica do banco = −diferença
perna histórica do investimento = diferença
efeito atual de cada perna = valor da perna quando não coberta pela referência dessa conta; zero se coberta
```

O evento `investment_principal_update` é um par datado com `amountInCents` **assinado**, exclusivamente neste tipo de receipt. Transferências/aportes/resgates comuns continuam exigindo valor positivo e seus modos explícitos. Cliente e Rules já normalizam cada perna pelo sinal e consideram `effectiveAt` nos históricos e certificados. O evento não deve ser classificado como receita/despesa, novo aporte ou nova avaliação nos futuros adaptadores de relatórios.

| Documento | Alteração atômica |
|---|---|
| Posição do banco | Efeito líquido depois da referência, revisão +1 e nova cabeça. |
| Posição do investimento | Efeito depois da própria referência, revisão +1 e nova cabeça, inclusive com efeito zero. |
| Capital | Novo principal, revisão +1, cabeça e horário. Ator criador, banco vigente e ID permanente da abertura não mudam nesta API; a troca do banco tem serviço específico. |
| Receipt | Principal anterior/novo, diferença assinada, data original, cabeças/revisões confirmadas, efeitos atuais, nota/justificativa e autoria atual. Imutável. |
| Cota do UID | Uma operação, compartilhada com os demais serviços financeiros. |

Não se gera um estorno intermediário com saldo artificialmente negativo: apenas a diferença líquida é aplicada. O saldo final bancário negativo exige justificativa com pelo menos três caracteres após trim; os limites de centavos continuam obrigatórios. Investimento não admite saldo negativo. Prazos mensais vencidos impedem a confirmação nos dois lados.

## Avaliações e histórico

A abertura já criou referência exclusiva para o valor observado do investimento. Essa referência cobre a correção na mesma data, portanto corrigir o principal não reescreve essa avaliação nem sincronizações posteriores. Exemplo: abertura com principal 1.000 e observado 1.200; correção para 1.500 acrescenta débito bancário de 500, capital passa a 1.500 e posição observada continua 1.200. A rentabilidade relativa ao capital muda; não há crédito fictício de 500 na avaliação. Para alterar a avaliação existe a sincronização explícita.

Se o banco já foi conferido depois do financiamento, seu saldo atual permanece conferido; a consulta entre o financiamento e a conferência conserva o principal corrigido. Antes da abertura, essa correção não cria financiamento anterior. A avaliação inicial e o receipt original permanecem imutáveis. Certificados conservam deltas assinados e soma de valores absolutos, sem confundir efeito atual zero com evento histórico zero.

Este contrato conserva referências de avaliação do modelo Spark. O fluxo antigo `manageFinancialAccount` estorna/substitui o aporte original e pode reconciliar um valor contado na mesma intenção; a equivalência desse formulário completo ainda precisa do adaptador, da prévia e da opção explícita de avaliação. Não trocar silenciosamente a chamada existente por este serviço.

## Segurança e concorrência

Receipt exige incremento das duas posições e do capital, efeitos declarados coerentes com os saldos e cota. Cada guard de posição recalcula seu efeito na própria referência. O guard do capital confere valor anterior, revision/head, banco e ID imutáveis, origem de tipo `investment_opening` e data exata. `diff().affectedKeys().hasOnly` preserva campos da criação; novas chaves e exclusões são proibidas. A autoridade vem do grupo protegido, não de campos do capital/receipt.

Outro administrador atual pode corrigir, mantendo a autoria original do capital e registrando sua própria autoria no novo receipt. Reenvio exato, inclusive após outras correções, recupera a intenção original sem efeitos/cota adicionais. Mesmo ID com argumentos diferentes é recusado. Duas intenções independentes na mesma revisão não podem confirmar ambas. Não há recálculo silencioso de prévia stale. Estorno genérico de par não aceita esse tipo; nova correção explícita conserva toda a cadeia.

Centavos zero no efeito bancário são normalizados para `0`: o SDK codifica `-0` como double, incompatível com a regra de inteiros. Diferença zero ainda cria registro/revisões, permitindo auditoria da confirmação.

## Validação e limites

Continuação de 19/10, pasta `closure`: a regressão integral encontrou um ensaio cujo pressuposto de ordenação de timestamps entre commits não estava verificado. O cenário de referência anterior agora cria uma reconciliação com data histórica explícita e confere a ordem antes da tentativa forjada. Outro cenário conserva contagem/abertura adjacentes e calcula a expectativa com os timestamps exatos, recusando o efeito oposto. Nenhuma Rule de autorização/efeito foi relaxada; o primeiro log malsucedido foi conservado. Passar esse ensaio isoladamente não foi usado para declarar a suíte integral aprovada.

Os testes do serviço e de escrita direta em `backend/tests/sparkTransfer.rules.test.ts` cobrem aumento/redução/zero/mesmo valor/limite, referências posteriores, autoria, prazos, partes obrigatórias, concorrência/replay, revisões stale, adulteração de saldo/data/origem/capital/cota, histórico e certificados. O ensaio do importador cria investimento novo a partir de banco importado, corrige seu principal e conserva o histórico anterior. Investimento importado sem capital permanece bloqueado para esta edição.

Evidências desta entrega em `.expo/spark-proof-2026-10-18/principal/`; continuações em `.expo/spark-proof-2026-10-19/funding-change/` e `.expo/spark-proof-2026-10-19/retro-opening/`. Esta implementação ainda não está ligada a telas Web/mobile ou ao assistente, nem foi homologada em aparelhos. Serviços de categorias/CDI e ciclo de vida já existem; sua integração à carteira, avaliação simultânea, capital/formatos legados restantes, consentimentos/corte e release continuam em aberto. Nenhum dado real foi alterado e nenhuma publicação foi executada.

Resultado: 748 cenários Spark aprovados (55 novos), zero ignorados, mais cinco scripts existentes de Rules; 18 ensaios de restore/importação aprovados. `check` passou com estilos/tipos, 103 testes de ferramentas e 815 comuns/88 condicionais ignorados; tipos da raiz foram repetidos depois da normalização final de zero. A primeira execução dirigida conservada encontrou quatro falhas: o caso real de `-0` no efeito bancário e três erros do harness, corrigidos antes dos 48 casos dirigidos e das duas suítes completas aprovadas (747 e depois 748). Nenhum limite de acessos/expressões foi aceito como evidência de recusa segura.
