---
tags: [firebase, spark, contas, bancos, investimentos, seguranca]
relacionado: [[Protocolo Financeiro Spark]], [[Gerenciamento de Bancos]], [[Investimentos]], [[Plano de Funcionalidade Completa sem Blaze]]
status: em desenvolvimento
tipo: feature
versao: 0.9.0
spark_module: F02
spark_progress: 75
spark_reviewed_at: 2026-10-22
---

# Cadastros de Contas Spark

## Primeiro fluxo: banco e saldo inicial — 23/10/2026

As telas Web/mobile de cadastro Spark agora coletam o saldo disponível no momento da criação. Abertura zero continua válida; saldo negativo exige justificativa. Banco, catálogo, posição, checkpoint, receipt e cota usam a transação existente de abertura declarada. Não registrar esse patrimônio como receita nem criar um segundo saldo mensal automaticamente. A referência é o instante do commit: saldo de início de mês continua no fluxo específico de [[Balanço Mensal]], que preserva lançamentos posteriores.

Nome/ícone/cor continuam editáveis por revisão canônica sem alterar dinheiro. O valor inicial e o motivo integram a assinatura da intenção: reenvio incerto exige os mesmos argumentos e conserva conta/ID. Contexto inválido não cai no escritor legado; a abertura com saldo não é ignorada caso o contexto deixe de ser Spark.

Novo cadastro confere o contexto antes de liberar o formulário. Carregamento e falha são visíveis, com **Tentar carregar novamente** e salvamento bloqueado enquanto a conferência estiver incompleta. O campo de saldo aparece somente no cadastro Spark; o fluxo legado confirmado conserva cadastro e saldo mensal separados. Não há ativação automática de grupo real nem alteração das preferências de telas já escolhidas pelo usuário.

Arquivos: SparkBankFormFirebase, useSparkBankForm, BankOpeningBalanceFields e AddRegisterBankScreen Web/mobile. [[Versão Usável por Telas]] acompanha o aceite. Testes de serviço/hook/controles e tipos verificam a entrega; aceite visual autenticado e execução instalada permanecem pendentes.

<!-- spark-progress:start -->
## Progresso Spark — 22/10/2026

**F02 — Bancos, cadastro e ciclo de vida: 75% implementado / 25% restante.** Notas P/I/D/E: **100/75/25/75**; cálculo e evidências em [[Status da Implementação Spark]].

O percentual corresponde ao módulo completo, incluindo integração e dados, e não somente ao serviço descrito nesta página. **Próxima entrega:** Converter cadastros antigos e homologar aparelhos. Criação, edição, arquivamento, restauração e atividade já possuem entradas Web/mobile.

Esta revisão prevalece sobre listas de pendências datadas das entregas anteriores abaixo. Implementação local e logs não aprovam publicação nem migração real.
<!-- spark-progress:end -->

Atualização de 20/10/2026: criação/edição de bancos conectadas ao Spark nas telas Web/mobile via `useSparkBankForm` e `SparkBankFormFirebase`. Na entrega de 20/10, a criação abria com zero e catálogo/checkpoint/receipt/cota atômicos; a coleta do saldo declarado foi conectada em 23/10, conforme o primeiro fluxo acima. Edição lê catálogo/revisão do servidor e só altera dados descritivos; concorrência exige recarregar. Reenvio incerto conserva identidade/material e bloqueia campos diferentes. UID/papel/grupo continuam obrigatórios; sucesso invalida as consultas financeiras, sem transformar erro de atualização da tela em erro do commit. Ciclo de vida nas telas, conversão legada e recuperação após desmontar/reabrir continuam pendentes. Roteiro reproduzível em [[Guia de Testes Locais]].


Implementação sintética de 18–19/10/2026, com Auth/Firestore e Functions desligadas. Compartilha serviços TypeScript entre Web, mobile e assistente; ainda não está conectada aos leitores/formulários/executor publicados. O cadastro foi entregue como extensão aditiva de `financial-proof-v9`; o marcador vigente é `financial-proof-v15`, com [[Criação Retroativa de Investimentos Spark]], preservando troca de financiamento, pares datados, financiamento inicial de commit e sincronização datada. Nenhum grupo é convertido ou habilitado automaticamente.

## Cadastro e edição

Continuação de 19/10/2026: a seleção bancária já usa catálogo/posição/ciclo canônicos pelas três fachadas de `BankFirebase`, inclusive nos quatro formulários de despesas/receitas. Exclui arquivados/inativos por padrão e recusa catálogo ausente; o editor não é apresentado como dono da conta. A inclusão administrativa de inativos é explícita. A criação/edição do banco, ações de ciclo de vida e conversão dos cadastros anteriores ainda precisam da integração completa; seleção não certifica atualidade do saldo.

Atualização v16 de 19/10/2026: `openSparkBankFirebase` abre um banco com saldo inicial explicitamente declarado pelo administrador, catálogo, posição, checkpoint, receipt `bank_opening` e cota na mesma transação. Centavos são inteiros dentro do teto; saldo negativo exige justificativa. A referência é o instante do commit, não receita e não prova de histórico importado. Antes dessa referência o saldo inicial não é atribuído ao passado; movimentos anteriores ficam cobertos na posição atual, enquanto os posteriores continuam sendo aplicados. A API de abertura zero neutra abaixo permanece disponível e distinta. A identidade do banco não pode ser reutilizada por outra abertura. 21 cenários dirigidos aprovados, incluindo projeção antes/depois, controles positivos e ataques parciais, em `.expo/spark-proof-2026-10-19/closure/bank-opening-targeted.log`.

[[Ciclo de Vida de Contas Spark]] acrescenta arquivamento/restauração e atividade independentes, sem apagar ou reencadear saldo/histórico. [[Categorias e CDI Spark]] implementa a taxa anual do usuário. Avaliação simultânea na edição, conversão completa dos metadados/capitais antigos e integração dos leitores/formulários ainda permanecem pendentes.

`openSparkAccountFirebase` aceita banco, Caixa canônico `cash` e investimento. A posição começa com saldo zero e receipt `account_opening`, como raiz do histórico. O parâmetro opcional `catalog` cria posição, cadastro, receipt e cota na mesma transação. Se qualquer parte falhar, nenhuma parte é confirmada. Abertura sem catálogo permanece compatível com as provas anteriores; um administrador pode cadastrá-lo depois.

`saveSparkAccountCatalogFirebase` cadastra/edita `financialGroups/{groupId}/sparkAccountCatalog/{accountId}`. Exige administrador atual do grupo, sessão válida, posição ativa do mesmo tipo, identidade estável e revisão de cadastro explicitamente confirmada (`null` para inexistente). A revisão é independente da posição financeira. Alterar nome ou percentual não troca a cabeça do histórico, não consome revisão financeira e não exige preparar o histórico.

O esquema fechado contém:

| Campo | Contrato |
|---|---|
| `name` | Texto sem espaços nas extremidades, 1–160 caracteres. |
| `colorHex` / `iconKey` | Nulos ou cor `#RRGGBB` / texto de até 160 caracteres. |
| `bankAccountId` | Apenas investimento: nulo ou outra posição bancária ativa do mesmo grupo. Nunca constitui autorização para debitar o banco. |
| `assetType` | Investimento: `fixed_income`, `treasury`, `stock` ou `fund`. |
| `valuationMethod` | Investimento: `cdi` ou `manual`; CDI somente com `fixed_income`. |
| `cdiPercentageInBasisPoints` | Investimento: inteiro entre 0 e 1.000.000, sem conversão por ponto flutuante. É o percentual contratado do CDI, não a taxa anual do usuário. |
| `redemptionTerm` / `description` | Investimento: nulos ou textos de até 300 / 2.000 caracteres. |

Campos de investimento são obrigatoriamente nulos em bancos/Caixa. `schemaVersion`, `accountKind`, `actorId` da última edição, `revision`, `lastOperationId` e `updatedAt` completam o documento. `actorId` é autoria da edição, não fonte de autorização: outro administrador atual também pode editar. Todos os membros atuais podem ler o catálogo do grupo. Nenhuma exclusão cliente é permitida.

O receipt imutável `account_catalog_update` conserva os argumentos completos, inclusive a revisão esperada. O guard do catálogo confere igualdade dos campos com o receipt novo; o guard do receipt exige a nova revisão/cabeça do catálogo e cota compartilhada. Não se pode gravar somente catálogo, receipt ou cota. Reenvio exato recupera o mesmo resultado sem novo consumo; mesmo ID com argumentos diferentes e prévia stale são recusados. Concorrência serializa pela revisão do catálogo. Replay continua exigindo autorização atual.

## Efeito financeiro e limites

Nenhum campo de cadastro aceita saldo, principal, status de ativação/arquivamento ou papel. Investimento novo pode receber aporte do serviço de pares existente depois da abertura; aporte/estorno continuam movimentos balanceados, com recibos próprios. Abertura não pode atribuir principal ou valor observado sem contrapartida/reconciliação. Os dados de projeção nunca geram receita, despesa ou rendimento confirmado.

[[Financiamento Inicial de Investimentos Spark]] implementa principal financiado e avaliação inicial com cadastro numa única intenção no commit; [[Criação Retroativa de Investimentos Spark]] acrescenta aplicação/referência inicial datadas. [[Edição do Principal Spark]] corrige capital no banco vigente; [[Troca do Banco de Financiamento Spark]] troca a origem e pode corrigir o principal na mesma intenção. Catálogo e avaliações têm serviços próprios. Configuração CDI e arquivamento/desativação/restauração já têm serviços protegidos em [[Categorias e CDI Spark]] e [[Ciclo de Vida de Contas Spark]]. Ainda faltam avaliação simultânea na edição, titularidade para projeção CDI e conversão de metadados/capital importados. [[Sincronização de Investimentos Spark]] e [[Movimentos Datados em Par Spark]] mantêm data própria de valor observado e de aporte/resgate, sem alterar o catálogo. Home e extrato já usam leitores canônicos; formulários/chat, carteira completa e bootstrap/consentimentos/corte continuam em aberto. Não usar o catálogo como substituto de `financialAccounts`, nem habilitar posições derivadas de dados reais por escrita cliente.

## Validação

Os cenários em `backend/tests/sparkTransfer.rules.test.ts` exercitam serviços e escritas diretas com SDK autenticado: abertura/cadastro atômicos, investimento zero com aporte/estorno e prova histórica, banco/Caixa, replay, disputa entre sessões, revisão stale, campos/limites, CDI/tipo de ativo, vínculo de banco, autoria, membro/outsider/sessão vencida, grupo bloqueado e tentativa de atribuir saldo pelo cadastro. A recusa de ataques deve decorrer das invariantes; o helper recusa como evidência qualquer erro de limite de expressões/acessos.

Evidências da execução ficam em `.expo/spark-proof-2026-10-18/account-catalog/`.

Resultado: 554 cenários Spark aprovados (52 novos), zero ignorados, mais cinco scripts existentes de Rules; repetição direcionada dos 52 novos após reforçar a preparação das escritas de update; 14 ensaios de restore/importação aprovados. `check` passou com estilos/tipos, 103 testes das ferramentas locais e 815 comuns/88 condicionais ignorados. A primeira execução com duas falhas de preparação dos testes foi conservada, junto à execução completa aprovada. Nenhum teste de aparelho ou fluxo de tela/chat foi realizado neste bloco.
