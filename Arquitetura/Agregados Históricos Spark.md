---
tags: [firebase, spark, financeiro, desempenho, seguranca]
relacionado: [[Preparação Histórica Spark]], [[Protocolo Financeiro Spark]], [[Reconciliação de Dados Spark]], [[Plano de Funcionalidade Completa sem Blaze]]
status: em desenvolvimento
tipo: arquitetura
versao: 0.3.1
spark_module: F01
spark_progress: 80
spark_reviewed_at: 2026-10-22
---

# Agregados Históricos Spark

<!-- spark-progress:start -->
## Progresso Spark — 22/10/2026

**F01 — Protocolo, histórico e preparação: 80% implementado / 20% restante.** Notas P/I/D/E: **100/75/50/75**; cálculo e evidências em [[Status da Implementação Spark]].

O percentual corresponde ao módulo completo, incluindo integração e dados, e não somente ao serviço descrito nesta página. **Próxima entrega:** Concluir restauração dos argumentos/provas/fases descritivas e progresso/pausa no assistente; medir custo em volumes representativos. Identificação, conferência e cancelamento já sobrevivem ao reload pelo executor comum. Ativação mensal conserva sua fila própria.

Esta revisão prevalece sobre listas de pendências datadas das entregas anteriores abaixo. Implementação local e logs não aprovam publicação nem migração real.
<!-- spark-progress:end -->

## Continuação v17 — 22/10/2026

Segmentos que abrangem exatamente uma referência não inclusiva recuam para conferência nó a nó. Eles não armazenam se a data foi declarada ou veio do commit; só a leitura individual permite incluir commits posteriores pela revisão, sem incluir indevidamente movimentos retroativos na mesma fronteira.

Marcador protegido e destino do plano local: `financial-proof-v17`; o novo hash não habilita grupos reais. O histórico reconhece os nós de avaliação composta e a referência corretiva como checkpoints. O propósito exclusivo `valuation_undo` vincula uma única referência vigente excluída, permanece imutável e não autoriza comandos comuns. Contratos replanejados usam sucessor/predecessor e metadados no mesmo commit; listas atualizam a agenda depois da confirmação e não estendem lembretes de contrato vencido silenciosamente. Ver [[Protocolo Financeiro Spark]], [[Recorrências Spark]], [[Investimentos]] e [[Status da Implementação Spark]].


Continuação de 19/10/2026: [[Troca do Banco de Financiamento Spark]] acrescenta devolução como terceira cadeia, com revisão/predecessor próprios, delta positivo do principal anterior, débito do novo principal e diferença no investimento. Marcador vigente `financial-proof-v14`. A normalização das folhas separa evento de uma conta, correção comum e par/três contas; cada forma calcula somente seus campos aplicáveis para conservar o limite de 1.000 expressões após a extensão. Schema, vinculação, somas, referências e cotas dos certificados continuam obrigatórios.

Implementação local em 17/10/2026, protocolo v0.7 e marcador protegido `financial-proof-v6`. Certifica blocos imutáveis de movimentos para reutilizar trabalho entre consultas de datas diferentes, usuários autorizados e novas cabeças. O transporte continua no SDK Firestore compartilhado por Web/native, sem Functions ou servidor externo. As telas publicadas ainda não usam esse protocolo.

Continuação em 18/10/2026: [[Operações Ordinárias Spark]] v0.8 usa marcador `financial-proof-v7` e normaliza edições comuns pelo líquido por conta na nova data. O guard da folha calcula uma representação por evento, reaproveitando revisão, predecessor e termos. O guard do nó exige cota realmente nova/alterada nesta transação e timestamp atual; os guards obrigatórios dos documentos de cota conferem os totais e a cobrança do projeto. Evita repetir esse cálculo no nó para caber no limite real de 1.000 expressões, conservando a validação atômica. O harness de projeção após contagem usa o timestamp confirmado pelo servidor para não depender da ordem de relógios/precisão local.

## Como funciona

Cada conta tem uma floresta binária em `financialGroups/{groupId}/sparkHistorySegments/{accountId}/nodes/{nodeCount}_{lastRevision}`. Identidade canônica, intervalo alinhado, eventos e referências completos impedem aliases e omissões. O documento é create-only e tem schema fechado de 15 campos: versão, ator da certificação, conta, tamanho, revisões inicial/final, fontes esquerda/direita, operação da cabeça, predecessor externo, menor/maior data, soma líquida, soma absoluta dos componentes e instante de criação do servidor.

Folha contém **dois eventos adjacentes** sem checkpoint nem raiz. As Rules leem os eventos imutáveis preexistentes e conferem conta, revisões e predecessor. Transferência normaliza a direção da conta; substituição conserva diferença nova e inverso antigo nas duas datas. A soma absoluta inclui ambos, mesmo quando o líquido é zero. Contagem, reconciliação, abertura mensal e raiz ficam fora da floresta. Ativação neutra pode participar, mas sua data ainda conserva um limite temporal conservador.

Pai contém dois filhos certificados **preexistentes**, do mesmo tamanho/conta, adjacentes e ligados por `right.previousOperationId == left.lastOperationId`. Soma, soma absoluta, extremos de data e endpoints são derivados dos filhos. Raiz da indução é tamanho dois; pai tem o dobro. Intervalo deve começar em múltiplo do tamanho. Limite por segmento: 1.048.576 eventos. Não é limite de tamanho da conta: usar mais blocos e fallback. Filhos criados na mesma transação não servem como autoridade por `getAfter`.

Somente membros atuais com sessão recente podem obter/criar certificados. Listagem, update e delete são recusados. O ator que certificou não concede autoridade duradoura a si mesmo: revogar o membro retira leitura/criação, e futuras provas exigem autorização atual. Outros membros ativos podem reutilizar a matemática sem ler a prova privada do criador.

## Admissão e construção

Cada certificado novo grava atomicamente **certificado + cota UID + cota do projeto**. Custo de admissão: 20 unidades de leitura e três de escrita, usando os mesmos tetos e janela UTC de [[Preparação Histórica Spark]]. A cota privada usa um schema fechado alternativo com `workKind: segment`, `groupId`, `accountId` e `segmentId`; os totais anteriores são preservados mesmo ao alternar entre certificado e reserva histórica. O agregado do projeto continua contendo somente totais numéricos e timestamp.

As Rules exigem incremento real de ambos os contadores e documento novo correspondente. Certificado sem cotas, cotas isoladas, reembolso, nonce antigo e dois certificados usando uma cobrança são recusados. Não existe lease de construção reutilizável: cada create é cobrado diretamente. Documento existente é somente lido, sem nova escrita/cobrança de admissão. Leitura/retry continua consumindo Firestore; política de admissão não equivale à fatura.

`certifySparkHistorySegmentFirebase` cria uma folha/pai ou retorna o certificado existente pelo ID canônico. Fontes diferentes para a mesma folha são erro. Checkpoint, filho ausente ou soma absoluta que excede inteiro seguro devolvem `segment: null`, sem alterar cotas; conservar filhos/caminho individual. Resultado de rede incerto continua sendo erro; uma retomada explícita obtém primeiro o ID canônico, sem duplicar material nem contador.

`warmSparkHistorySegmentsFirebase` percorre a cadeia com até **32 pares examinados e 64 novos certificados por chamada**. Retorna cursor e quantidade criada. Em interrupção, os próprios certificados confirmados são progresso durável; retomar pelo último cursor recebido ou reiniciar pela cabeça é seguro. O cursor é dica de navegação, não autoridade financeira: cada create recertifica fontes e cotas. Não há documento adicional de progresso por certificado. Construção de um prefixo imutável pode continuar após novas operações na posição.

Construção exige aplicativo/rede e consentimento do fluxo que vier a integrá-la; nada executa com todos os apps fechados. `AbortSignal` pausa quando observado, preservando commits já enviados/confirmados. Orçamento esgotado permite retomada em outro dia sem apagar material. Não disparar aquecimento integral em toda consulta: mesmo reexecutar creates idempotentes tem custo de leitura.

## Uso na preparação

`SparkPreparationOptions.useSegments` é **opt-in**, falso por padrão. A prova acrescenta `segmentId`, nulo em criação, página individual e mudança de fase. Uma página com certificado exige conta, revisão da cabeça e ID da operação exatamente iguais ao cursor da prova; o predecessor e a revisão seguintes vêm do extremo antigo certificado. Consome uma única `workRevision` e um slot já reservado. Cabeça stale e autorização continuam sendo conferidas antes de sondar certificados e pelas Rules na escrita.

Na primeira passagem, o bloco é neutro porque não contém checkpoints. Não altera baseline, checkpoint mais recente nem próximo futuro. Na segunda, classificar datas nesta ordem:

1. `tail`: posterior a `asOf`, ou igual na finalidade mensal.
2. `balance`: posterior à baseline, ou igual com inclusividade.
3. `ignore`: anterior/igual à baseline exclusiva.

Somente se as classes da menor e da maior data forem iguais pode-se aplicar a soma inteira. A classe é monotônica para o estado certificado da prova. **Líquido zero não autoriza pular uma janela mista.** Uma janela entre datas antigas/novas de substituição precisa dos eventos individuais.

Para somar a `balance`/`tail`, exigir que acumulador ± soma absoluta permaneça dentro de ±9.007.199.254.740.991. Isso conserva a segurança dos intermediários; se a verificação conservadora falhar, usar o evento individual. O cálculo individual acumula primeiro o efeito líquido por janela e só depois o soma ao acumulador, evitando arredondamento intermediário quando dois componentes se cancelam perto desse limite. Limites financeiros de saldo/diferença/justificativa **não foram ampliados**.

O cliente sonda no máximo quatro tamanhos por página, do maior bloco alinhado possível para baixo. Ausência, limite temporal misto ou envelope numérico incompatível conservam a página individual. Cada chamada continua limitada a 100 páginas. Com aceleração ativa, reservas de até 16 páginas reduzem desperdício de slots; sem aceleração mantêm até 64. `getSparkPreparationProgress` identifica sua estimativa como `unaccelerated-upper-bound`; não é contagem exata do trabalho restante acelerado. Slots não utilizados continuam cobrados até expirar, sem reembolso.

Contagens novas e futuras continuam no caminho individual. Certificados antigos não congelam `latestCheckpointAt`/`nextCheckpointAt`: cada nova prova seleciona suas referências novamente, inclusive aberturas futuras e substituições recentes. Alterar a cabeça invalida uma prova parcial existente, mas não os certificados imutáveis do prefixo. Nova intenção “hoje” pode reutilizar blocos, sem reaproveitar silenciosamente a confirmação do dia anterior.

## Medição local

Fixtures sintéticas de 1.000 eventos, Auth/Firestore Emulator, Rules ligadas e Functions desligadas. Seed e confirmação financeira ficam fora do cronômetro. Baseline linear executada na mesma suíte; três consultas usam datas diferentes. Tempos locais não preveem produção.

| Trabalho | Páginas | Certificados criados | Leituras explícitas SDK | Escritas reconhecidas | Duração |
|---|---:|---:|---:|---:|---:|
| Uma consulta linear | 2.002 | 0 | 8.226 | 2.098 | 21.654 ms |
| Construção completa, 16 chamadas | 0 | 985 | 6.956 | 2.955 | 17.030 ms |
| Consulta anterior aos movimentos | 32 | 0 | 154 | 38 | 379 ms |
| Consulta histórica posterior aos movimentos | 32 | 0 | 154 | 38 | 351 ms |
| Nova consulta “hoje” | 32 | 0 | 154 | 38 | 391 ms |

Construção mais três consultas: **3.069 escritas**, contra `3 × 2.098 = 6.294` no caminho linear, redução de **51,2%**. Cada consulta reutiliza 1.996 nós em 26 saltos; totaliza 32 páginas incluindo caminho individual e mudanças de fase. As cotas persistidas somam 20.900 unidades de leitura e 3.069 de escrita. A primeira consulta com construção custa 2.993 escritas, cerca de 42,7% a mais que uma consulta linear isolada. Não esconder o custo de construção nem prometer ganho para um único uso.

Evidências em `.expo/spark-proof-2026-10-17/history-segments/`. Não são leituras faturadas: Rules, retries, consultas sem escrita, misses e outros serviços não são integralmente medidos pela admissão. Não houve teste volumoso contra dados reais.

## Validação e segurança

382 cenários Spark aprovados na execução completa, zero ignorados: 62 novos além dos 320. Os cinco scripts existentes de Rules também passaram. `check`: 815 testes comuns aprovados, 88 condicionais ignorados. Cobertura inclui folhas/pais exatos, ataques diretos com controles positivos, schemas, aliases, fontes, revisão, datas, somas, cobranças obrigatórias, mudança de modo de quota, concorrência/replay, retomada após exaustão, revogação e login expirado; salto stale, soma zero com janela mista, inclusividade, extremo seguro, contagens posteriores/futuras, transferências reais em ambas as direções/aportes/resgates e confirmação de ajuste/substituição/estorno contra prova acelerada. As recusas Spark não podem vir de esgotamento das Rules. O teste que atravessa um vencimento sincroniza a espera com timestamp confirmado pelo servidor em outra conta, preservando o banco/deadline ensaiado; não depende apenas de 40 ms no relógio local.

Auditoria restrita a esta prova, sem autorização de publicação:

```json
{
  "score": 4,
  "summary": "Segmentos imutáveis, autoridade protegida, derivação recursiva finita por documentos preexistentes, endpoints conferidos e cobrança obrigatória. Sem bypass material identificado nos cenários locais.",
  "findings": [
    {
      "check": "Resource Exhaustion/DoS",
      "severity": "minor",
      "issue": "Construção custa O(N), ocupa armazenamento e a alternativa sem cache/com fronteiras adversariais continua linear. Leituras recusadas, retries e outros serviços não são limitados integralmente pela admissão.",
      "recommendation": "Integrar orçamento/progresso e aquecimento explícito ao produto, medir volumes reais autorizados e conservar fallback sem prometer desempenho universal."
    },
    {
      "check": "Business Logic vs. Rules",
      "severity": "minor",
      "issue": "Relógio cliente pode divergir da janela UTC do servidor; concorrência pode recusar a tentativa anterior e exigir retomada explícita.",
      "recommendation": "Manter request.time como autoridade e tratar retomada/resultado incerto no fluxo de produto antes do corte real."
    }
  ]
}
```

## Observações importantes

Os segmentos somam variações de posição, não totais de receitas/despesas. Transferência, aporte e resgate conservam sua exclusão dos totais econômicos; relatórios precisam continuar usando a classificação dos eventos originais.

A floresta atual agrega **movimentos**, sem tentar resumir todos os seletores de checkpoints. Muitas contagens ou componentes com datas cruzando fronteiras podem manter o custo próximo do linear. Os benchmarks demonstram o ganho de um caso cronológico concreto, não paridade universal de volumes. Não existe limite permanente artificial de tamanho da conta; preparação/construção podem atravessar dias e a intenção financeira pode exigir nova prévia.

Os certificados acrescentam armazenamento imutável O(N); incluir a coleção no inventário de backup, restauração, retenção/exclusão e bootstrap antes de dados reais. Não há importador, coletor administrativo ou nova política de exclusão nesta entrega. Progressos das telas/chat, execução integral de despesas/receitas/recorrências/metadados, compatibilidade real e publicação continuam pendentes. Não houve deploy, cobrança ou homologação em navegador/aparelho.

## Arquivos principais

- `functions/sparkHistorySegments.ts`: certificação, construção limitada, seleção e aplicação.
- `functions/sparkHistoryEvent.ts`: normalização compartilhada e timestamps exatos.
- `functions/SparkHistoryFirebase.ts`: salto opcional, progresso, lease e aritmética individual segura.
- `functions/sparkFinancialProtocol.ts`: marcador protegido.
- `utils/sparkPreparationBudget.ts`: política de admissão, erros e diagnóstico.
- `firestore.rules`: schemas, derivações, endpoints, cotas e imutabilidade.
- `backend/tests/sparkTransfer.rules.test.ts`: testes reais locais, ataques e benchmarks.

Referências de implementação: [agregação por transações cliente](https://firebase.google.com/docs/firestore/solutions/aggregation), [validação atômica com getAfter](https://firebase.google.com/docs/firestore/manage-data/transactions), [limites e condições das Rules](https://firebase.google.com/docs/firestore/security/rules-conditions), [conversão canônica para string](https://firebase.google.com/docs/reference/rules/rules.String). A modelagem específica dos certificados e sua segurança foram conferidas nos testes locais descritos acima.
