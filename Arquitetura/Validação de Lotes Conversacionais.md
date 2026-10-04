---
tags: [assistente, lotes, validacao, desempenho, emulator]
relacionado: [[Assistente Lumus]], [[Cobertura Conversacional Lumus]], [[Comandos Financeiros Conversacionais]], [[Validação Conversacional Lumus]], [[Investimentos]]
status: ativo
tipo: validacao
versao: 1.0.0
---

# Validação de Lotes Conversacionais

Evidência local de 2026-10-03 em `tests/lumusAssistantBatchEmulator.test.ts`. A rodada final passou quinze testes: treze famílias com 211 alvos cada e dois cenários de recuperação. O benchmark de vinte amostras foi executado separadamente. Auth, Firestore e Functions usam exclusivamente `demo-lumus-financas` nos emuladores locais, com usuários/fixtures únicos e limpeza restrita aos documentos de cada fixture. A Suite compartilhada não foi resetada; nenhum dado financeiro de produção, deploy ou configuração externa foi alterado.

## Fronteira comprovada

Controlador conversacional compartilhado → catálogo completo com páginas de 200 → propostas tipadas → snapshot de confirmação → grant da mensagem autenticada → `financeCommandService` → executor legado/callable ou razão → persistência real → invalidação → resultado e progresso no chat. Cada seleção confirma uma vez, exibe `210 de 211` e `211 de 211`, preserva IDs distintos e não grava novamente com um “sim” posterior sem confirmação ativa. A instrumentação valida cada grant e delega a execução real. Recibos e replay de três posições do conjunto comprovam ausência de repetição dos efeitos.

Interpretação do modelo e notificações de aparelho são seams determinísticos. SDK, schemas, catálogo, permissões, grants, transações, callables, saldos e recibos não são simulados. Portanto estes testes comprovam a execução e a coordenação do lote; não comprovam interpretação universal de linguagem natural, rede do modelo, renderização, áudio ou comportamento em aparelho. A paridade do controlador e a validação das telas têm evidências próprias em [[Validação Conversacional Lumus]].

| Família / armazenamento | Operações e efeitos conferidos |
| --- | --- |
| Despesas legadas | 211 edições para 200 centavos, registros/recibos únicos e saldo do banco 99.957.800 centavos |
| Receitas legadas | 211 edições para 200 centavos e saldo 100.042.200 centavos |
| Recorrências de despesa / parcelas | 211 pagamentos de duas parcelas: 211 saídas de 200 centavos, contador 2 e ciclo civil de São Paulo; desfazer restaura contador/ciclo, remove as saídas e recompõe o saldo |
| Recorrências de receita / parcelas | 211 recebimentos de duas parcelas, entradas e histórico do ciclo; desfazer recompõe os contadores e o banco |
| Bancos | 211 alterações de cor, preservando cada abertura e a posição financeira |
| Categorias | 211 alterações por nome de ícone (“Café” → `ionicons/cafe-outline`), preservando saldos |
| Saldos de abertura | 211 aberturas mensais alteradas de 100.000 para 120.000 centavos, sem alterar a abertura do banco principal |
| Ajustes de saldo | 211 diferenças ativas de +20.000; estorno gera 211 diferenças de −20.000 e conserva os 211 originais como estornados; posições retornam a 100.000 |
| Transferências | 211 bancos de origem para um destino fixo: 211 transferências e 211 pares saída/entrada com IDs vinculados; origem 99.900, destino 100.021.100 e Caixa zero |
| Saques / Caixa | 211 saques de 100: origens 99.900 e Caixa 21.100; desfazer as 211 operações restaura origens 100.000 e Caixa zero |
| Investimentos | 211 aportes 1.000→1.100, resgates 1.100→1.000, sincronizações manuais 1.000→1.500 e desfazimentos 1.500→1.000; entradas/saídas, histórico de sync, banco e recibos conferidos |
| CDI | 211 vigências/taxas distintas persistidas. Onze mensagens de até vinte propostas respeitam o limite do gateway; um resumo final e uma confirmação aceitam todo o conjunto. Não se envia um array de 211 ao modelo |
| Despesas no razão / membro | 211 correções por estorno+novo lançamento; um 212º registro de outro membro fica somente leitura e é contado como sem permissão. Conta confirmada passa de 78.800 para 57.700, sem atualizar/apagar os eventos originais |

Um lote compartilha a coordenação, mas mantém a atomicidade do seu domínio por item. Transferências e movimentos de investimento são atômicos dentro de cada operação; a rodada inteira não promete rollback. O teste de membro migrado cobre a exceção de armazenamento/permissão; testes do executor e das regras cobrem outras negações. Esta tabela não significa executar todas as combinações de 38 ações × volumes × papéis × armazenamentos.

## Falha, resultado incerto e cancelamento

Uma seleção de 211 despesas injeta apenas dois defeitos de transporte: falha comprovada antes de um commit e perda da resposta depois de outro commit real. A primeira rodada persiste 210 alterações/recibos, informa 209 sucessos e duas falhas. “Tente novamente” não grava; a confirmação seguinte visita somente os dois IDs falhos. O executor confere o recibo do commit cuja resposta se perdeu, grava apenas o item realmente ausente e termina com 211 alterações e 211 recibos únicos, saldo 99.957.800 e duas invalidações. Sucessos anteriores não são repetidos.

Outra seleção pausa a chamada do item 51, aceita “cancele” e deixa a operação em andamento concluir pelo executor real. Persistem 51 alterações/recibos; os 160 itens não iniciados conservam o valor anterior e ficam cancelados. Saldo confirmado 99.973.800. Pedir retry não reabre os cancelados nem apaga os commits. A pausa/falha é simulada na fronteira de transporte; os efeitos e a reconciliação são reais.

O lote também revelou uma falha real de categoria: depois dos aportes, a busca geral podia escolher “Investimento” restrita a despesas para um resgate. O backend recusava corretamente. O helper agora exige uso compatível (`gain`, `both` ou legado sem `usageType`); os 211 resgates seguintes passaram com a categoria de ganho correta.

## Latência por família

Uma amostra por fase na rodada final. A coluna de lote mede pedido + preparação + confirmação + execução + resposta, excluindo fixture, asserts adicionais e limpeza. p50/p95 por item vêm das 211 chamadas reais do executor e **não** são percentis ponta a ponta do lote. Tempo do Emulator, carga local e aquecimento variam entre fases; não usar esta tabela como comparação antes/depois ou SLA.

| Fase, 211 itens | Lote (ms) | Item p50 (ms) | Item p95 (ms) | getDoc / getDocs | TX / leituras / writes do cliente | Callables |
| --- | ---: | ---: | ---: | --- | --- | ---: |
| Despesa: editar | 5.323,18 | 21,66 | 31,10 | 634 / 11 | 211 / 422 / 422 | 0 |
| Receita: editar | 4.176,90 | 18,30 | 22,70 | 634 / 11 | 211 / 422 / 422 | 0 |
| Recorrência despesa: pagar | 7.320,15 | 31,22 | 45,07 | 634 / 11 | 211 / 1.055 / 633 | 0 |
| Recorrência despesa: desfazer | 5.358,93 | 23,75 | 28,53 | 634 / 12 | 211 / 633 / 633 | 0 |
| Recorrência receita: receber | 8.005,84 | 34,93 | 48,38 | 634 / 11 | 211 / 1.055 / 633 | 0 |
| Recorrência receita: desfazer | 5.700,56 | 25,08 | 31,06 | 634 / 12 | 211 / 633 / 633 | 0 |
| Banco: editar | 4.516,39 | 20,12 | 26,11 | 634 / 11 | 211 / 422 / 422 | 0 |
| Categoria: editar | 4.366,58 | 18,72 | 25,40 | 634 / 11 | 211 / 422 / 422 | 0 |
| Abertura: alterar | 5.575,21 | 24,99 | 30,99 | 423 / 222 | 211 / 422 / 422 | 0 |
| Ajuste: criar | 18.844,53 | 67,76 | 85,57 | 212 / 11 | 0 / 0 / 0 | 422 |
| Ajuste: estornar | 18.158,22 | 82,62 | 103,68 | 423 / 12 | 0 / 0 / 0 | 211 |
| Transferir | 18.424,18 | 83,81 | 105,93 | 423 / 11 | 0 / 0 / 0 | 211 |
| Sacar | 18.503,21 | 84,10 | 108,60 | 423 / 11 | 0 / 0 / 0 | 211 |
| Saque: desfazer | 4.150,10 | 18,14 | 22,66 | 634 / 12 | 211 / 422 / 422 | 0 |
| Investimento: aportar | 19.950,36 | 88,83 | 118,11 | 634 / 11 | 0 / 0 / 0 | 211 |
| Investimento: resgatar | 7.880,36 | 34,89 | 43,04 | 634 / 12 | 0 / 0 / 0 | 211 |
| Investimento: sincronizar | 5.218,73 | 22,33 | 30,96 | 634 / 13 | 211 / 633 / 633 | 0 |
| Investimento: desfazer sync | 5.391,57 | 22,58 | 31,88 | 634 / 14 | 211 / 633 / 633 | 0 |
| CDI: onze partes | 4.515,66 | 14,80 | 19,26 | 433 / 110 | 211 / 422 / 422 | 0 |
| Razão: corrigir despesa | 19.381,61 | 87,36 | 110,55 | 634 / 11 | 0 / 0 / 0 | 211 |

SDK conta invocações, não viagens físicas de rede; pode haver agregação/retry no transporte. Zero TX/writes do cliente nas callables significa que o commit ocorreu no servidor, cujos registros/contas/recibos são conferidos, e não ausência de efeito. Essas colunas não medem operações internas do Admin SDK. Cada fase tem uma interpretação seam e zero chamadas ao modelo externo; CDI tem onze interpretações seam. Execução financeira é sequencial. Criar ajustes faz 211 previews e 211 saves; o pico observado e assertado de previews foi oito, sem perder itens ou ordem. Demais callables tiveram pico um.

## Vinte amostras ponta a ponta

`MEASURE_ASSISTANT_REAL_BATCH=1` executou uma amostra de aquecimento e vinte medidas de edição de 211 despesas. Mesma fixture, data civil e conta; valor material muda a cada rodada (300 no aquecimento, 301–320 centavos nas medidas), portanto catálogo/fingerprints e IDs são novos. Cada rodada tem dois envios e uma confirmação, todos os 211 efeitos são conferidos e o banco é recalculado depois do commit. Os 4.431 IDs/recibos das vinte e uma rodadas são únicos.

| Métrica | Resultado |
| --- | ---: |
| Lote p50 | 3.896,63 ms |
| Lote p95 | 4.693,50 ms |
| Mínimo / máximo | 3.598,45 / 5.118,76 ms |
| Execuções por amostra | 211 |
| getDoc / getDocs por amostra | 634 / 11 |
| Transações por amostra | 211 |
| Leituras / writes de transação por amostra | 422 / 422 |
| Writes do cliente por item | 2 (registro e recibo) |
| Interpretações seam / chamadas externas ao modelo | 1 / 0 |

Percentis usam a ordem de vinte amostras (posições 10 e 19). A janela inclui carregamento do catálogo, proposta seam, validação, autorização, commit, invalidação e resposta; exclui preparação de fixture, conferência posterior e limpeza. Não há baseline anterior comparável desse lote, logo não se anuncia ganho percentual. O valor é referência local atual. Para esse mesmo formato de fixture/ambiente, p95 de 6 s é orçamento de investigação de regressão; não é limite garantido para rede real, mobile, quotas ou conjuntos maiores.

## Limites e reprodução

Catálogo pagina em 200 sem truncar 211. Gateway aceita até vinte propostas por resposta; a expansão de seleção fica no aplicativo e CDI usa onze partes explícitas. Previews de ajuste limitam concorrência a oito; commits relacionados seguem a atomicidade do serviço e os itens são executados um de cada vez. Seeds/cleanup locais usam chunks de 400 e ficam fora da medição. Não foi determinado um máximo universal de itens, memória, quota ou tempo de produção: a evidência real desta nota é 211 por fase, e a cobertura sintética maior/especial fica separada em `tests/lumusAssistantBatchCoverage.test.ts`.

Use Suite demo com Auth 9099, Firestore 8080 e Functions 5001, Node compatível e:

```sh
RUN_ASSISTANT_BATCH_EMULATOR=1 npm test -- --runInBand tests/lumusAssistantBatchEmulator.test.ts
# Benchmark separado; não repete as treze famílias.
RUN_ASSISTANT_BATCH_EMULATOR=1 MEASURE_ASSISTANT_REAL_BATCH=1 ASSISTANT_BATCH_EMULATOR_FAMILIES=none npm test -- --runInBand tests/lumusAssistantBatchEmulator.test.ts
```

`ASSISTANT_BATCH_EMULATOR_FAMILIES` também aceita uma lista separada por vírgula de famílias. Sem opt-in, a suite fica skipped e não escreve. A primeira execução do benchmark passou todos os asserts financeiros e imprimiu as métricas, mas o processo acusou uma tabela Jest vazia no filtro `none`; o registro foi corrigido para skip explícito. A rodada final sem benchmark passou quinze testes em 220,90 s; nenhuma falha financeira ficou pendente nesta suite.
