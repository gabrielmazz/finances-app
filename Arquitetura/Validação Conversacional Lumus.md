---
tags: [assistente, validacao, desempenho, emulator]
relacionado: [[Assistente Lumus]], [[Cobertura Conversacional Lumus]], [[Comandos Financeiros Conversacionais]], [[Dashboard Home]], [[Auditoria de Design]]
status: ativo
tipo: validacao
versao: 1.1.0
---

# Validação Conversacional Lumus

Evidências locais de 2026-10-03 e fechamento de 2026-10-04. As matrizes de rotas e ações registram o comportamento integrado; esta nota distingue persistência real, interpretação simulada, navegador e execução instalada. Nenhuma execução abaixo usou dados financeiros de produção, deploy ou alteração externa do Firebase.

## Medição comparável da conversa

`tests/lumusAssistantConversationEmulator.test.ts` usa o controlador compartilhado, catálogo, executor, autorização e leitores reais, com Auth/Firestore/Functions locais no projeto `demo-lumus-financas`. Interpretação e notificações são seams determinísticos; não há renderer, áudio, aparelho ou viagem ao modelo nessas medições. Cada cenário recebe uma amostra de aquecimento e vinte amostras medidas. O conjunto começa com 501 despesas, maior que as três páginas de 200, e termina com 753 documentos: os 252 efeitos persistidos e a soma exata em centavos são conferidos.

O baseline usa o leitor de visão geral para saldo. A rodada posterior usa `getHomeBalancesFirebase`, que consulta somente as fontes do saldo. Ambos receberam o mesmo formato/quantidade de fixture e os mesmos pedidos; variação de carga do processo local continua possível.

| Cenário | p50 antes (ms) | p95 antes (ms) | p50 depois (ms) | p95 depois (ms) | Interpretações por amostra | Efeitos por amostra |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Registro completo local | 171,43 | 188,43 | 189,04 | 230,84 | 0 | 1 |
| Consulta pontual de saldo | 607,49 | 647,30 | 135,44 | 141,21 | 0 | 0 |
| Pergunta complementar com vários campos | 165,21 | 171,21 | 188,26 | 203,61 | 1 seam | 1 |
| Lote explícito de dez registros + confirmação | 362,90 | 381,37 | 359,40 | 392,14 | 1 seam | 10 |

A consulta pontual reduziu `getDocs` de 20 para sete, mantendo um `getDoc`, sem escritas. Registro e resposta complementar usam um `getDoc`, doze `getDocs` e uma transação com quatro leituras/dois writes. O lote de dez usa dez `getDoc`, doze ou treze `getDocs` e dez transações com quarenta leituras/vinte writes. Contadores são chamadas SDK, não uma promessa de viagens físicas de rede: o transporte pode agregar chamadas e fazer retry. Operações permanecem sequenciais.

A melhora medida é específica da consulta de saldo. O p95 das escritas/resposta complementar aumentou nesta rodada; não apresentar todos os cenários como acelerados. Metas locais de investigação: p95 abaixo de 200 ms para essa consulta, 250 ms para os dois comandos simples e 500 ms para esse lote de dez, com precisão em centavos e sem duplicação. Não são SLA de rede, aparelho ou produção; uma regressão exige nova medição no mesmo ambiente.

Uma repetição posterior, concorrente com os lotes grandes e builds no mesmo ambiente, também passou a contagem de 753 documentos e a soma exata. Sob essa carga, os p50/p95 foram 372,25/477,94 ms (registro), 199,21/284,01 ms (saldo), 270,72/2.202,51 ms (complemento) e 417,19/2.417,17 ms (lote de dez). Houve até onze tentativas de transação para os dez efeitos, com os mesmos IDs e sem duplicata. As metas leves não foram atingidas sob essa carga; esta rodada não substitui a comparação inicial nem permite prometer os tempos iniciais durante concorrência. Contadores SDK conservam as consultas descritas acima, com até 44 leituras/22 writes transacionais nas tentativas do lote.

## Leitores do razão

`tests/ledgerProjectionEmulator.test.ts`, com `RUN_ASSISTANT_EMULATOR_READS=1` e `MEASURE_ASSISTANT_EMULATOR_READS=1`, executou três testes com SDK real e fixture de 253 eventos/251 despesas/duas contas. Vinte amostras intercaladas por caminho, sem modelo ou writes durante a medição:

| Caminho | p50 (ms) | p95 (ms) | getDoc | getDocs |
| --- | ---: | ---: | ---: | ---: |
| Home completa | 93,17 | 99,68 | 2 | 11 |
| Visão mensal | 87,28 | 94,74 | 2 | 7 |
| Carteira | 75,12 | 84,29 | 2 | 5 |
| Apenas saldos | 11,16 | 13,34 | 2 | 1 |

Os caminhos comparáveis conservam os saldos/totais que compartilham. Eles entregam conjuntos diferentes de dados auxiliares, portanto a tabela não compara renderização de telas inteiras. Fixtures em UTC também comprovam inclusão do dia civil de São Paulo e exclusão do dia seguinte.

## Alto volume com persistência real

O benchmark opt-in de `tests/lumusAssistantBatchEmulator.test.ts` executou vinte amostras medidas e um aquecimento de 211 alterações de despesa por lote, com novos argumentos, snapshots e IDs em cada rodada. Conferiu 4.431 IDs/receipts únicos e efeitos persistidos. p50 de lote: 3.896,63 ms; p95: 4.693,50 ms; mínimo/máximo: 3.598,45/5.118,76 ms. Cada amostra usou 634 `getDoc`, onze `getDocs`, 211 transações, 422 leituras e 422 writes transacionais. Uma interpretação seam por lote; nenhuma viagem ao modelo real. Não existe baseline anterior comparável deste volume, portanto não se anuncia melhora antes/depois para ele. Percentis por item, quando apresentados em testes de famílias, não substituem estes percentis do lote inteiro.

Preparos de ajuste que requerem callable têm concorrência limitada a oito. Execuções financeiras dependentes permanecem sequenciais, com progresso e IDs por item. O catálogo completo fica no aplicativo; o modelo propõe o filtro, não recebe 211 registros para executá-los.

## Navegador e serviço de interpretação

No navegador local, com conta sintética, passaram: criar anotação, corrigir o conteúdo por confirmação textual, ler o conteúdo persistido depois de reload, registrar R$ 82,90 sem seletor/confirmador e consultar o saldo atualizado de R$ 1.000,00 para R$ 917,10. Viewport de 390 × 844 não apresentou overflow horizontal; o compositor ficou entre y=671 e y=753. A revisão corrigiu o acompanhamento da resposta depois de ler mensagens antigas e eliminou o warning DOM de `accessibilityLiveRegion` na etapa de processamento.

A rodada atual repetiu registro/saldo e verificou tema escuro, ocultação de valores em todo o histórico e nas regiões `aria-live`, Shift+Enter com foco preservado e sem envio, renomeação de anotação por resumo + “confirmo”, abertura do perfil e retorno ao assistente com histórico conservado. Em 390 × 844, `scrollWidth` continuou 390 e o compositor y=671–753. `AssistantTextBubble` anuncia somente o texto já mascarado, por `aria-live`/`aria-atomic` Web e `accessibilityLiveRegion` mobile; os seis testes dos adaptadores reais passam sem depender de autoRead/TTS. Não equivale a teste de leitor de tela instalado. Evidência visual local: `lumus-conversa-privacidade.png`, na pasta de visualizações desta tarefa.

Uma pergunta conceitual real (“O que são juros?”) recebeu resposta do modelo de apoio com o aviso de indisponibilidade do principal. A gramática geral envia catálogo vazio. Isso comprova a chamada de interpretação Web/App Check/fallback nesse ambiente; não comprova compreensão universal, latência p50/p95 do modelo ou integração de áudio/aparelho. Configuração remota não foi alterada.

## Limites da evidência

Testes comuns do gateway, engine, adapters e preferências simulam serviços selecionados. Testes opt-in do SDK/callables comprovam gravações em fixtures locais e autorização/retry observados. Exportação Expo comprova empacotamento, não teclado nativo, áudio, entrega de notificação ou instalação Android/iOS. Medição do executor sintético de 211 itens é evidência separada de qualquer medição com persistência real.

O baseline geral tinha duas expectativas falhando (`userProfile.test.ts`, clipboard; `loginResponsiveLayout.test.ts`, classe de espaçamento) e dívida de estilos de Configurações Web. Esses problemas ficam separados de regressões desta implementação. A rodada geral final passou 670 testes em 66 suites, com as mesmas duas falhas preexistentes; quatro suites opt-in/88 testes não executados nessa rodada aparecem como skipped. As suites opt-in abaixo foram executadas separadamente com hosts locais validados.


## Gates de fechamento — 2026-10-04

| Verificação | Resultado e limite |
| --- | --- |
| Tipos do aplicativo e backend | Ambos passaram após as correções finais |
| Build do backend | Passou; sem deploy |
| Jest geral | 670 passaram, duas falhas preexistentes, 88 skipped/opt-in |
| Executor legado com SDK/Auth/Functions reais | 68 testes passaram; 36 ações legadas, concorrência, recibos, guards e formulários |
| Regras, callables do razão, vínculos e ajustes | Suites locais passaram em execuções próprias; não são attestation de produção |
| Lotes financeiros reais | 15 testes passaram: treze famílias de 211 itens e dois cenários de recuperação; [[Validação de Lotes Conversacionais]] |
| Conversa com SDK real e leitores do razão | Um cenário composto e dois testes de leitores passaram na última repetição; medições detalhadas acima |
| Exportação Expo Web e Android | Ambas passaram em `/tmp/lumus-export-web-final` e `/tmp/lumus-export-android-final`; Android manteve o warning preexistente de resolução de `web-streams-polyfill` |
| `lint:styles` | Continua falhando somente por dívida preexistente de Configurações Web: 10 inline, seis hex, dois arbitrary, uma fachada. Métricas globais 976/1114/357/52 iguais ao baseline |
| Revisão final | Corrigiu histórico migrado sem evidência, mudança de privacidade durante PDF e estorno de aporte já resgatado; testes focados passaram |

Os testes de PDF usam os builders e a fronteira de transporte para conferir filtros, histórico parcial, mascaramento e cancelamento de sessão/privacidade. Android exportado não comprova impressão/compartilhamento em aparelho. O navegador local recebe o relatório gerado e a instrução para concluir no diálogo de impressão; salvar um arquivo pelo sistema é uma etapa da plataforma e não uma operação financeira. Não foi realizado pagamento externo, envio a terceiros, publicação ou migração em produção.


### Smoke final de relatórios Web

Na conta sintética do Emulator, os quatro pedidos do chat concluíram a leitura/geração e retornaram pelo adaptador Web sem erro: extrato Nubank de outubro (um movimento), despesas fixas (zero cadastros), receitas fixas (zero cadastros) e análise Alimentação de três meses (um movimento). O texto identifica a etapa do diálogo de impressão e não declara salvamento. A automação não inspecionou o diálogo nativo nem salvou um PDF: a evidência observada é o retorno do transporte e da conversa, enquanto conteúdo/filtros/privacidade são cobertos nos testes dos builders. Screenshot `lumus-relatorios-chat.png`; viewport de teste restaurada ao tamanho normal e assistente mantido aberto. O inventário foi repetido depois das atualizações documentais: três testes passaram, incluindo referência a todas as rotas físicas. `git diff --check` passou no fechamento.
