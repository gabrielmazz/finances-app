---
tags: [firebase, spark, financeiro, receitas, despesas, seguranca]
relacionado: [[Protocolo Financeiro Spark]], [[Importação Financeira Local Spark]], [[Transações de Despesas]], [[Transações de Receitas]], [[Plano de Funcionalidade Completa sem Blaze]]
status: em desenvolvimento
tipo: arquitetura
versao: 0.4.0
spark_module: F04
spark_progress: 80
spark_reviewed_at: 2026-10-22
---

# Operações Ordinárias Spark

<!-- spark-progress:start -->
## Progresso Spark — 22/10/2026

**F04 — Despesas, receitas, edição e estorno: 80% implementado / 20% restante.** Notas P/I/D/E: **100/75/50/75**; cálculo e evidências em [[Status da Implementação Spark]].

O percentual corresponde ao módulo completo, incluindo integração e dados, e não somente ao serviço descrito nesta página. **Próxima entrega:** Conectar assistente, completar formatos legados/especiais e homologar. Sugestões recorrentes e origens de aporte/resgate já usam os serviços Spark.

Esta revisão prevalece sobre listas de pendências datadas das entregas anteriores abaixo. Implementação local e logs não aprovam publicação nem migração real.
<!-- spark-progress:end -->

Continuação de 19/10/2026 sob o marcador vigente `financial-proof-v16`: criação e correção podem conservar `details` com nome, explicação, formatos e indicador de dinheiro. O mapa tipado participa dos argumentos materiais do receipt e é espelhado em `sparkMovementDetails/{clientActionId}` na mesma transação. Não basta gravar descrição separadamente depois do saldo. O texto histórico abaixo preserva a evolução inicial v7/v8; não descreve o marcador atual.

## Descrição atômica e leitores

Continuação de 20/10/2026: criação/correção dos quatro formulários e edição/estorno ordinários do extrato já usam o comando compartilhado. `SparkMovementFormFirebase` conserva a intenção durante falhas e captura o rascunho antes de consultar o grupo; resposta incerta exige recuperar os mesmos campos/ID. Sucesso confirmado libera nova intenção somente por novo envio explícito, permitindo repetir lançamento com a preferência de manter campos. A edição do mesmo dia preserva o Timestamp completo; segunda edição intencional carrega o último substituto. Campos descritivos não editáveis pela tela de despesa, como formatos de pagamento, são conservados. Caixa exige escolha explícita.

`SparkOrdinaryReadFirebase` carrega documento imutável, claim e posição no namespace informado, recusa alvos especiais/resolvidos e apresenta data civil de São Paulo. `SparkMovementListFirebase` oferece os lançamentos econômicos vigentes antes de limitar/ordenar: não duplica original/inverso/substituto. Fontes especiais legíveis não ganham referência executável ordinária. O extrato conserva o journal e prepara estorno com ID/data/fingerprint estáveis. Mais detalhes e limites em [[Integração Financeira Spark]]. O contrato ainda não cobre todos os fluxos especiais, sugestões recorrentes, assistente, metadados importados e homologação em aparelhos; por isso F04 é 73%, não concluído.

Continuação de 19/10/2026: `executeSparkMovementCommandFirebase` é o contrato compartilhado para criar/corrigir/estornar. Recebe identidade estável, data Timestamp explícita, centavos, descrição tipada e, na resolução, referência executável ordinária + fingerprint do documento original. Não aceita campos de recorrência/investimento ou IDs de apresentação como substitutos dessa referência. A família econômica confirmada é conferida contra o original. Campos, detalhes e alvo são copiados antes de qualquer espera; o material serializado registra segundos/nanossegundos, sem reduzir a confirmação a milissegundos. Campos não textuais de identidade são recusados antes de consultar o grupo.

`commandMaterial`, `assistantRequestFingerprint` e `expectedFingerprint` são argumentos materiais do receipt com limites 16.000/160/160. Trocar proposta, alvo, fonte, campo, descrição ou data de um ID já confirmado recusa o reenvio. A versão do alvo é conferida dentro da transação, mas não concede autorização: grupo/papel, fonte especial, revisões, claim e efeitos continuam protegidos pelos protocolos/Rules. Serviços inferiores sem confirmação conservam o formato anterior para replay. A origem permanece imutável; uma correção pode ser reenviada depois de seu substituto ter sido corrigido novamente, sem aplicar novo efeito.

O primeiro ensaio com a confirmação adicional expôs estouro de 1.000 expressões na correção com duas contas, categoria nativa nova e descrição. O receipt agora exige o documento descritivo criado neste commit, cujo guard confere esquema, identidade, autoria e igualdade integral do mapa com o receipt. Essa igualdade substitui a comparação antiga só de quatro campos e recusa chaves extras. Validar o mesmo mapa novamente no receipt era redundante; posições, efeitos, claims e quota continuam obrigatórios. Os 109 cenários dirigidos finais incluem controles SDK brutos, partes ausentes, mapas divergentes, confirmação inválida, seleção bancária e a correção com oito formatos completos/Unicode nos limites. Logs em [[Status da Implementação Spark]].

O envio dos quatro formulários, listas e executor conversacional ainda não usa esse contrato. A estabilidade de ID/data no estado da tela e a conservação do instante original na edição continuam pendentes; o serviço não gera uma nova data automaticamente para contornar essa integração.

`utils/sparkMovementDetails.ts` valida esquema fechado, nome obrigatório de até 160 caracteres, explicação nula ou até 2.000, até oito formatos não vazios de até 120 caracteres cada e indicador booleano. As Rules validam o documento descritivo, a cópia tipada no receipt, autoria/horário/identidade e todas as partes financeiras obrigatórias. Atualizar/remover o documento ou alterar os dados de um reenvio é proibido. O executor compara mapas/listas recursivamente e timestamps por igualdade exata, permitindo recuperar o mesmo receipt após uma nova sessão.

Correção conserva os detalhes anteriores no componente inverso e os novos no substituto; estorno herda a descrição original. O extrato preserva referência executável e resolução separadas do ID visual. `getSparkCurrentOrdinaryMovements` retorna somente alvos ordinários ainda não resolvidos, considera namespace nativo/importado e pode receber um corte de data. Isso prepara os formulários, mas não libera os botões antigos de edição/exclusão.

A comparação de efeito por checkpoint e a política de saldo negativo de cada correção ficam no guard obrigatório da posição correspondente. O receipt exige os updates de ambas as posições. Essa distribuição evita repetir a validação até esgotar o limite de expressões; não omite o cálculo dos efeitos. Trinta e quatro ensaios dirigidos aprovados incluem controle positivo de SDK bruto, oito formatos, primeira referência de categoria, ausência de qualquer parte, divergência entre cópias, imutabilidade e limites Unicode. O Emulator demonstrou que os limites de texto usam unidades UTF-16, iguais a `String.length` do JavaScript; contar pontos de código com `Array.from` permitia enviar textos que o servidor recusava. A descrição/leitura foi alinhada sem ampliar os limites das Rules. Evidências em `.expo/spark-proof-2026-10-19/closure/movement-details-unicode-approved.log`.

`projectSparkEconomicMovements` alimenta [[Análise por Categoria]] com valores assinados na família econômica original. Despesa corrigida de 100 para 120 resulta em `100 − 100 + 120`, não em despesa 220 e receita 100. Referências, transferências, financiamento e capital ficam fora. As telas Web/mobile e o PDF mantêm os estornos negativos e os limites civis do período. Home, formulários ordinários, ramos especiais e assistente ainda precisam de integração coordenada.

Implementação local de 18/10/2026, protocolo v0.8 e marcador protegido `financial-proof-v7`. `functions/SparkMovementFirebase.ts` implementa criação, estorno e edição imutável de receitas/despesas comuns com Auth e transações Firestore, compartilháveis por Web/native. Ainda não está ligado às telas ou ao assistente. Grupos reais permanecem no contrato anterior.

Continuação v0.9 em [[Recorrências Spark]] usa o marcador vigente `financial-proof-v8` e reutiliza os auxiliares de posição, categoria e efeito deste módulo. Tipos especiais recorrentes têm fluxo próprio e continuam recusados por edição/estorno ordinários.

## Criação e data

`postSparkMovementFirebase` recebe conta de banco/Caixa, tipo `income`/`expense`, centavos positivos inteiros, `effectiveAt` explícito, categoria opcional, nota e justificativa de saldo negativo. Não permite investir por esse caminho. Datas vão de 1970 ao instante do servidor; operações futuras exigem o protocolo próprio, ainda pendente para movimentos ordinários.

Uma transação grava evento/recibo, posição com revisão/predecessor e cota obrigatória. Reenvio do mesmo ID e argumentos retorna somente a leitura do recibo; mudar valor, data, categoria ou demais argumentos materiais falha. Autor precisa ser a sessão autenticada atual e membro ativo do grupo com marcador vigente.

A receita/despesa conserva sua diferença integral no histórico. Seu efeito na posição atual depende do checkpoint mais recente: contagem posterior cobre o movimento; contagem exata exclui a própria fronteira; abertura mensal a inclui. Mesmo quando o efeito atual é zero, o evento e a revisão são obrigatórios. Isso preserva o contrato de projeção do razão sem sobrescrever uma conferência posterior.

Categoria deve existir e pertencer ao grupo, ao ator ou a proprietário cujo perfil protegido aponta para o grupo. `usageType` ausente/`both` aceita ambos; `gain` aceita renda e `expense` aceita gasto. As Rules verificam novamente, independentemente da validação do cliente. Categoria removida posteriormente não impede estornar o lançamento antigo.

## Edição e estorno

`reverseSparkMovementFirebase` aplica o inverso exato na data solicitada. `correctSparkMovementFirebase` resolve o original e cria um substituto do mesmo tipo, admitindo troca de conta. **Inverso e substituto ficam na nova data**, como `correctMovement` do backend. É diferente da substituição de ajuste, cujo inverso conserva a data antiga.

Edição grava um único receipt `movement_correction` com duas contas e dois componentes. Cada conta recebe uma revisão; se forem iguais, recebe apenas uma revisão e o efeito líquido. Não se exige saldo para um débito intermediário fictício antes do crédito compensador. Cada efeito respeita o checkpoint da própria conta; banco negativo exige justificativa e Caixa não pode ficar negativo.

O claim canônico é compartilhado por edição e estorno: `sparkMovementClaims/{originalOperationId}` para originais novos; `sparkImportedClaims/{identityId}` para importados. Original, receipt e claim são imutáveis. Autor pode resolver o próprio lançamento; administrador pode resolver outro lançamento do grupo. Ao editar/estornar uma edição anterior, resolve-se somente o componente substituto, sem inverter novamente o efeito líquido composto.

As Rules do claim certificam autoria/papel, identidade e namespace original, tipo, conta e valor antigo. As do receipt certificam esquema fechado, valores novos, categoria, data, cota e posições atômicas. Posições exigem revisão/predecessor exatos e receipt novo. O cliente não cria identidades importadas nem altera claims existentes. Pares de investimento/transferência e ajustes mantêm os fluxos específicos.

## Histórico e importação

`sparkHistoryEvent` e as Rules de projeção/segmentos normalizam a edição para cada conta como `inverso antigo + substituto novo`, ambos no mesmo instante. A cadeia não recebe efeitos duplicados. Projeções anteriores à edição continuam vendo o original; posteriores incorporam os dois componentes. Segmentos certificados usam o mesmo valor líquido por conta e data.

[[Importação Financeira Local Spark]] v2 cria identidades separadas dos nós matemáticos existentes, liga todas as pernas por caminho/hash e importa claims de estornos/edições anteriores. `originalSource: imported` seleciona essa ponte; IDs iguais em namespaces diferentes não se confundem. Renda/gasto importado com `sourceReferences` ou em conta de investimento permanece fora da resolução ordinária até existir adaptador específico; desfazer genericamente uma recorrência deixaria seu ciclo incoerente. Pares com referências especiais também exigem adaptador, pelo campo protegido `pairResolutionAllowed`.

## Virada da cota

O executor comum recupera a operação preparada no minuto anterior e recusada após a virada. Somente `permission-denied` e recibo confirmado ausente por nova leitura autenticada permitem considerar **uma** nova tentativa. Se o relógio já avançou exatamente uma janela, a retomada é imediata. Se ainda estiver no primeiro ou último segundo da janela tentada, espera no máximo 1.050 ms e confere novamente a janela e o instante mínimo antes de tentar. Fora dessas condições, não reenvia; relógio parado ou deslocado arbitrariamente não é aceito como autorização.

A transação inteira revalida sessão, grupo, recibo, quota e efeitos, conservando a identidade da intenção. Recibo encontrado retorna sucesso somente se exato. Falha de rede ou resultado incerto permite apenas procurar o receipt, sem essa retomada de escrita. Uma falha na segunda tentativa continua sendo falha. As Rules da cota continuam exigindo a janela exata do servidor, sem tolerância adicional. Testes dirigidos provam a virada e a espera real diante de diferença próxima de um minuto; testes locais cobrem início/fim, janela distante e relógio parado.

Os controles de SDK bruto da suíte não têm essa recuperação. A preparação sintética espera sair das bordas antes de executar esses controles, para não confundir janela errada com aprovação de uma invariante financeira. Os testes específicos de fronteira continuam injetando o relógio e exigindo uma única operação/cota confirmada. Logs das execuções malsucedidas foram preservados.

## Validação histórica e limites

Testes de Emulator usam Auth real, Firestore e Functions desligadas: concorrência/replay, disputa edição versus estorno, autorização, saldo líquido na mesma conta, troca de conta, fronteiras de contagem, categoria, quotas, projeção e segmentos. Escritas forjadas tentam omitir partes, alterar fonte/tipo/valor original, predecessor, data e efeito. Recusas por esgotamento do orçamento de Rules não contam como proteção.

Resultado final: `npm run test:spark` aprovou 433 cenários (51 novos), zero ignorados, e os cinco scripts existentes de Rules. `npm run test:spark:restore` aprovou 12 ensaios, incluindo cinco novos da ponte importada. `npm run check` aprovou estilos, tipos e 87 testes locais das ferramentas, além de 815 testes comuns; seus 88 testes condicionais ignorados não contam como homologação integrada. Logs finais e tentativas iniciais que expuseram as falhas de relógio/orçamento estão em `.expo/spark-proof-2026-10-18/ordinary-movements/`.

Essa etapa inicial não concluiu os dois blocos integrais. A situação vigente v16, inclusive categorias/CDI, ciclo de atividade e leitores já conectados, está em [[Integração Financeira Spark]]. Ainda faltam os formulários e demais leitores, carteira/assistente, capital/formatos anteriores, avaliação simultânea, consentimentos/corte, privacidade e homologação/release. Não há migração real, deploy ou cobrança habilitada.
