---
tags: [firebase, spark, transferencias, investimentos, historico, seguranca]
relacionado: [[Transferências]], [[Investimentos]], [[Sincronização de Investimentos Spark]], [[Financiamento Inicial de Investimentos Spark]], [[Operações Ordinárias Spark]], [[Protocolo Financeiro Spark]], [[Agregados Históricos Spark]], [[Importação Financeira Local Spark]], [[Plano de Funcionalidade Completa sem Blaze]]
status: em desenvolvimento
tipo: feature
versao: 0.1.1
spark_module: F06
spark_progress: 80
spark_reviewed_at: 2026-10-22
---

# Movimentos Datados em Par Spark

<!-- spark-progress:start -->
## Progresso Spark — 22/10/2026

**F06 — Transferências, saques e pares: 80% implementado / 20% restante.** Notas P/I/D/E: **100/75/50/75**; cálculo e evidências em [[Status da Implementação Spark]].

O percentual corresponde ao módulo completo, incluindo integração e dados, e não somente ao serviço descrito nesta página. **Próxima entrega:** Completar fontes antigas sem identidade resolvível, assistente e homologação. Pares nativos de investimento e importados com permissão explícita já têm estorno no extrato.

Esta revisão prevalece sobre listas de pendências datadas das entregas anteriores abaixo. Implementação local e logs não aprovam publicação nem migração real.
<!-- spark-progress:end -->

## Integração Web/mobile — 20/10/2026

`SparkPairFormFirebase` e `useSparkPairForm` conectam os dois formulários de transferência e os dois de saque aos serviços Spark. Somente contexto legado confirmado permite o fluxo anterior; erro, revogação ou contexto ausente depois de preparar intenção não liberam o escritor antigo. Campos/data são copiados antes das esperas; resultado incerto conserva ID, modo e argumentos e impede alterar o material. Depois do sucesso, um envio explícito inicia outra intenção mesmo com campos iguais. Essa recuperação permanece em memória, sem promessa de retomada após reload/desmontagem.

Operações do dia civil de São Paulo usam o instante autoritativo do commit. Datas passadas usam o serviço datado e conservam o Timestamp no reenvio; datas futuras são recusadas. Isso evita rejeitar um lançamento de hoje por relógio do navegador ligeiramente adiantado. Se o dia muda com resultado incerto, só se recupera um receipt existente: não se cria silenciosamente uma operação em outro dia.

Os painéis usam `getBankCurrentBalanceInCentsFirebase`, com contexto e validade temporal Spark, em vez do leitor exclusivamente antigo. A leitura de origem descarta respostas atrasadas após trocar a seleção. Saque exige o Caixa canônico ativo; não aceita trocar o destino nem reivindicar propriedade do Caixa compartilhado. Justificativa de saldo bancário negativo, quando necessária no saque, mantém o contrato de 3–500 caracteres; Caixa não pode ficar negativo. O formulário de transferência continua exigindo saldo suficiente.

O extrato Web/mobile oferece Estornar para transferência/saque nativo vigente, com confirmação das duas contas, intenção estável e compensação atômica no commit. As Rules/serviço verificam autoria ou administrador, saldo e claim único. Se a contrapartida já foi gasta, o estorno é recusado sem alterar saldos; depois de recompor o saldo, o mesmo comando pode ser reenviado. Originais resolvidos e pares especiais/importados permanecem sem ações genéricas. Não existe exclusão física de movimentos Spark.

`SparkStatementFirebase` enriquece nomes com uma leitura por contraparte distinta do período e reconfere a sessão/contexto. Os nomes são rótulos atuais do catálogo, não snapshots imutáveis da operação nem prova de titularidade. Saques Spark e seus estornos ficam fora dos totais econômicos em `shouldIncludeMovementInGainExpenseTotals`; o comportamento anterior do saque legado é preservado.

Validação: gate geral com estilos/tipos, 104 testes de ferramentas e 960 comuns aprovados (89 condicionais ignorados); dez novos cenários SDK Auth/Firestore/Rules, zero ignorados, incluindo relógio +1,5 s, retry, concorrência, histórico/checkpoint, estornos, saldo insuficiente e acesso revogado. Exports finais Web/Android aprovados; Android conserva o aviso conhecido de `web-streams-polyfill` com fallback. Navegador autenticado registrou transferência de R$ 50,00 e saque de R$ 20,00, estornou ambos e confirmou saldo R$ 100,00, ganhos R$ 100,00 e despesas zero no banco de teste. Evidências `.expo/spark-pairs-final-gate.log`, `spark-pairs-sdk-verified.log`, `spark-pairs-ui-final.log`, `spark-pairs-web-final.log`, `spark-pairs-android-final.log` e `spark-pairs-browser.png`. Nenhuma Rule foi alterada nesta entrega; a regressão de 1.037 cenários é evidência anterior reaproveitada, não nova execução integral.

F06 passa a 80% (P/I/D/E = 100/75/50/75). Assistente, pares importados e de investimentos nas telas, formatos antigos e homologação em aparelhos permanecem pendentes. Não houve dado real, migração, publicação ou cobrança.

Continuação local de 18/10/2026, protocolo v0.14/`financial-proof-v12`. O serviço compartilhado `SparkTransferFirebase.ts` acrescenta `transferSparkDatedFundsFirebase` e `reverseSparkDatedTransferFirebase`. Transações Auth/Firestore, Functions desligadas. Grupos v11 não são habilitados automaticamente; o destino/hash do importador local acompanha v12.

## Contrato e datas independentes

O movimento datado mantém os tipos existentes `transfer`, `investment_deposit` e `investment_redemption`, com duas contas distintas, valor positivo em centavos e data efetiva Timestamp não futura/desde 1970. Tipos de conta, limite de valor, permissões, justificativa de saldo negativo bancário e proibição de saldo negativo em Caixa/investimento seguem os contratos existentes.

A data do valor observado permanece em `synchronizeSparkInvestmentFirebase.observedAt`. A data do aporte/resgate é `transferSparkDatedFundsFirebase.effectiveAt`. Podem ser diferentes, inclusive com observação posterior ao movimento. Cada intenção tem ID próprio; uma sincronização já confirmada é um fato independente, não é desfeita automaticamente se o movimento seguinte falhar. Esta entrega torna o par atômico, não combina a sincronização e o par em uma única transação.

Os serviços anteriores `transferSparkFundsFirebase` e `reverseSparkTransferFirebase` continuam no instante do commit e recusam data explícita. Os novos serviços recusam aliases `date`/`observedAt` para não ignorar silenciosamente uma segunda data. Abertura financiada inicial continua no commit; este protocolo não acrescenta data retroativa à criação.

## Efeito em cada conta

O histórico sempre conserva duas pernas iguais e opostas na data escolhida. O efeito na posição atual é calculado separadamente para cada conta:

```text
delta histórico da origem = -valor
delta histórico do destino = +valor

para cada conta:
  sem referência, data após referência ou na fronteira mensal inclusiva:
    efeito atual = delta histórico
  data anterior à referência ou na fronteira de contagem exclusiva:
    efeito atual = 0
```

Exemplo: investimento tem valor confirmado de 8.000 em 10/09. Registrar aporte de 1.000 em 05/09 debita o banco se sua referência não cobrir essa data, mas conserva os 8.000 do investimento: a observação posterior já incorporou o aporte. A consulta em 06/09 ainda mostra o aporte histórico. A referência do investimento não é reescrita pelo movimento.

Podem ocorrer dois efeitos atuais não nulos, um só ou ambos zero. Isso não altera o valor do par histórico. Cada posição avança revisão/cabeça mesmo com efeito zero; receipt e cota continuam obrigatórios. Leituras de referências e posições ocorrem na mesma transação antes de qualquer escrita. Prazo mensal vencido continua bloqueando a operação até ativação.

As validações de solvência conferem o saldo materializado resultante e a política de cada tipo de conta. O protocolo não declara ter provado todos os saldos intermediários de um histórico arbitrário. Uma contagem posterior pode cobrir um lançamento antigo; não usar o saldo atual sozinho como prova do saldo daquele dia.

## Registro, replay e estorno

Receipts de pares novos passam a conter `dated: boolean`. No modo datado também exigem `effectiveAt`, `fromCurrentEffectInCents` e `toCurrentEffectInCents`; no modo commit esses três campos são proibidos. O modo integra os argumentos materiais, impedindo que a API de hoje aceite como seu um receipt datado sob o mesmo ID, ou vice-versa.

`reverseSparkDatedTransferFirebase` recebe o ID/fonte do original e a data explícita do estorno. A inversão conserva contas/valor exatos; seu efeito atual considera a referência de cada conta na data do estorno. Essa data pode ser a original ou outra data passada/atual expressamente escolhida. Não trocar automaticamente pela data do commit ou da sincronização.

Autor ainda membro pode estornar a própria operação; administrador pode estornar a operação de outro autor do grupo. Originais elegíveis são transferência/aporte/resgate nativos ou identidades importadas com `pairResolutionAllowed: true`. Fontes especiais, abertura financiada e estorno de estorno continuam recusados por este caminho.

Estornos datados e de commit compartilham os mesmos claims `sparkReversals`/`sparkImportedClaims`, portanto somente um resolve o original. Reenvio exato é somente leitura; alterar data, modo, valor ou argumentos sob o mesmo ID é recusado. Concorrência entre os dois modos não duplica crédito/débito.

## Rules e projeção

O guard do receipt valida schema, modo/data, tipos monetários, matemática entre efeitos declarados e posições, papéis, par, cota e eventual fonte/claim. O guard de cada posição recalcula seu próprio efeito pela referência protegida. Assim o receipt de um estorno não precisa ler os dois checkpoints além do original/claim e das posições: as verificações cabem no orçamento por operação e no lote. Escrita direta não pode omitir uma perna nem declarar efeito zero arbitrário.

Projeção e certificados continuam usando o valor histórico ±`amountInCents` e a data efetiva, nunca os efeitos atuais. Um certificado pode somar débitos antigos mesmo quando todos seus efeitos atuais foram cobertos por contagem posterior. Janelas mistas preservam o fallback histórico, sem colapsar datas. O estado de sincronização e o capital original do investimento continuam separados e não são editados pelo par.

## Limites e validação

Ainda falta integrar estes serviços aos formulários/leitores Web/mobile e ao executor do assistente. Edição do principal, criação retroativa do investimento, categorias/CDI, arquivamento, formatos antigos restantes, consentimentos/corte e homologação em aparelhos continuam pendentes. Transferências e fluxos de investimento devem permanecer fora dos totais comuns de receitas/despesas nos adaptadores futuros.

Os testes autenticados em `backend/tests/sparkTransfer.rules.test.ts` cobrem datas, duas referências independentes, fronteiras exata/mensal, valores atuais/históricos, estorno por autor/admin, concorrência/replay entre modos, falsificação de efeitos, campos obrigatórios, cota, prazo e perda de acesso. O ensaio de importação acrescenta um aporte datado novo e estorna com data um aporte original importado, conferindo as duas cadeias. Evidências em `.expo/spark-proof-2026-10-18/dated-pairs/`.

Resultado: 693 cenários Spark aprovados (41 novos), zero ignorados, mais os cinco scripts existentes de Rules; 39 casos iniciais aprovados isoladamente antes da suíte completa; 17 ensaios de restore/importação aprovados. `check` passou com estilos/tipos, 103 testes locais e 815 comuns/88 condicionais ignorados. Nenhum fluxo de tela/chat ou aparelho foi homologado neste bloco.
