---
tags: [spark, inventario, backup, restauracao, migracao, seguranca]
relacionado: [[Reconciliação de Dados Spark]], [[Plano de Funcionalidade Completa sem Blaze]], [[Protocolo Financeiro Spark]], [[Agregados Históricos Spark]], [[Firebase Config]]
status: em desenvolvimento
tipo: arquitetura
versao: 0.2.1
spark_module: D01
spark_progress: 48
spark_reviewed_at: 2026-10-19
---

# Inventário e Restauração Local Spark

<!-- spark-progress:start -->
## Progresso Spark — 19/10/2026

**D01 — Inventário, backup e restauração: 48% implementado / 52% restante.** Notas P/I/D/E: **75/0/50/75**; cálculo e evidências em [[Status da Implementação Spark]].

O percentual corresponde ao módulo completo, incluindo integração e dados, e não somente ao serviço descrito nesta página. **Próxima entrega:** Preparar captura autorizada real, Rules implantadas e produtos fora da cópia Firestore; ensaiar a cópia específica.

Esta revisão prevalece sobre listas de pendências datadas das entregas anteriores abaixo. Implementação local e logs não aprovam publicação nem migração real.
<!-- spark-progress:end -->

Ferramentas de manutenção local para capturar documentos brutos do Firestore Emulator, inventariar identidades e ensaiar sua restauração. O objetivo é preparar a compatibilidade dos dados antes de conectar o protocolo Spark ao aplicativo. Não há captura de produção ou corte de contas. A continuação em [[Importação Financeira Local Spark]] acrescenta normalização diagnóstica e importação do razão em grupo bloqueado no Emulator.

## Como funciona

`npm run spark:snapshot -- <operação>` começou com as quatro operações abaixo; a continuação acrescenta `normalize-legacy`, `plan-ledger` e `import-ledger`, documentadas em [[Importação Financeira Local Spark]]:

| Operação | Entrada | Resultado |
|---|---|---|
| `capture` | Projeto `demo-*`, host Firestore e Hub explícitos | Cópia tipada de todos os documentos encontrados, arquivos locais de Rules/índices e SHA-256 |
| `inventory` | Cópia local válida | Contagem por coleção/subcoleção, pais inexistentes, grupos, membros, perfis, cortes e pendências |
| `restore` | Cópia válida e emulador vazio do mesmo projeto | Recriação sem sobrescrita e conferência de caminhos/campos por leitura posterior |
| `prepare` | Cópia válida, grupo e instante | Relatório de preparação do razão, ligado ao bruto e ao reconciliador existente; nenhuma escrita |

A travessia enumera `listCollectionIds` e `listDocuments` até terminar a paginação, inclusive coleções desconhecidas, certificados, quotas, provas e subcoleções. `showMissing` permite visitar documentos ancestrais inexistentes; eles não são criados na restauração. Um documento real vazio continua distinto de um pai inexistente.

Dois percursos precisam produzir o mesmo conteúdo, incluindo metadados de versão. Isso detecta alterações observadas, mas não prova que os escritores ficaram pausados nem fornece uma visão de um único instante. O campo `consistency` declara `two-matching-scans-not-point-in-time`; o inventário usa `sourceCompleteness: emulator-traversal-only`. Isolar o emulador e pausar escritores durante captura/restauração são precondições operacionais. Não há alegação de completude ou consistência de um projeto remoto.

## Preservação dos dados

O arquivo usa o JSON `Value` oficial do Firestore, sem converter tudo em valores JavaScript:

- inteiros de 64 bits permanecem strings decimais;
- timestamps mantêm sua fração original, sem passar por `Date`;
- bytes, referências completas, GeoPoints, mapas e arrays conservam seus tipos;
- doubles especiais continuam textuais; a serialização conserva `-0`;
- coordenadas zero omitidas pelo ProtoJSON são aceitas;
- nomes de documentos e campos são dados, nunca caminhos de arquivo ou comandos.

O envelope guarda `createTime`/`updateTime` originais quando disponíveis. A API não permite atribuí-los ao recriar documentos: o recibo informa `serverMetadataPreserved: false`. A conferência considera os mesmos caminhos e campos tipados, sem comparar os novos metadados do servidor. Referências não são remapeadas; por isso o projeto `demo-*` de destino precisa ser o mesmo da cópia.

Rules e índices anexados são o conteúdo dos arquivos locais do repositório, **não uma comprovação da configuração carregada no emulador ou implantada**. `restore` não os aplica. Auth, senhas, sessões, Storage, configurações remotas e builds também não fazem parte dessa cópia de documentos. O recibo distingue essas exclusões. O export/import nativo da Emulator Suite permanece uma alternativa complementar para o estado dos produtos suportados.

SHA-256 detecta alteração acidental e liga os relatórios à cópia fornecida. Não é assinatura, autorização de migração nem prova de origem confiável; quem modifica um arquivo também pode recalcular seu hash.

## Restrições de execução e recuperação

Captura e restauração exigem banco `(default)`, projeto `demo-*`, hosts literais `127.0.0.1` ou `[::1]` e portas explícitas. URLs são construídas internamente; redirects são recusados. Não há SDK administrativo, ADC, login ou fallback remoto. O token `owner` existe apenas no transporte administrativo do Emulator; esse ensaio não comprova permissões de clientes nas Rules.

O Hub precisa confirmar a porta local do Firestore e a ausência de Functions/Eventarc. A restauração repete essa verificação a cada lote, evitando a execução acidental dos gatilhos emulados. Os ensaios iniciam somente Firestore, sem Functions.

O destino deve estar vazio. Cada escrita possui `currentDocument.exists: false`, conferido pelo servidor; uma corrida não permite substituir documento existente. Não existe reset, delete, merge ou repetição automática. Os lotes têm até 100 documentos e são atômicos individualmente. Uma falha posterior ou resposta perdida pode deixar lotes anteriores gravados: preserve o recibo de falha e recomece em outro emulador vazio. Não retome cegamente nem apague o destino para esconder uma divergência.

Há limites locais de 100.000 posições visitadas na árvore, 1.000 páginas por enumeração, profundidade de documentos/campos e arquivo de 128 MiB. Captura, validação e leitura usam limite de bytes compatível, para não declarar sucesso com uma cópia que a própria ferramenta recusaria restaurar. Estes são limites da ferramenta, não estimativas de cota Spark.

Arquivos de saída são exclusivos e criados com modo `0600` no Linux/WSL. Uma saída já existente não é sobrescrita. O comando reserva o arquivo antes de acessar o emulador; em caso de falha, ele pode conter um recibo `status: failed`, que não é snapshot restaurável. O diretório sugerido `spark-backups/` está ignorado pelo Git; isso não equivale a criptografia ou política de retenção.

## Inventário e preparação

O inventário relata os nomes das coleções, inclusive vínculos, convites, consentimentos, ajustes e recibos que estiverem no bruto. Também identifica grupos/papéis, perfis/cortes divergentes, ausência de administrador conhecido, membros sem perfil e aberturas mensais duplicadas por banco/ciclo. É diagnóstico estrutural, não auditoria integral do domínio.

O modelo de um perfil é classificado como `legacy`, `ledger`, `spark-marked` ou `unknown`. Campos malformados, marcadores contraditórios ou membros conflitantes conservam `unknown`; não autorizam voltar à escrita legada. `spark-marked` descreve a presença de marcador, não a homologação desse grupo.

`prepare` normaliza somente os campos conhecidos das coleções brutas `financialAccounts`, `ledgerTransactions` e `accountReconciliations` de um grupo já identificado. Mantém o bruto intacto, deriva as identidades dos caminhos, preserva datas/atores/referências selecionados e chama `reconcileSparkLedgerSnapshot`. O relatório inclui hash da cópia, hash da entrada normalizada, contas, projeções e pendências. Inteiros sem precisão segura e datas financeiras com fração inferior a milissegundo são bloqueados, sem arredondamento. O instante escolhido não pode ser posterior à captura.

São bloqueios adicionais: grupo ausente/inativo ou já marcado Spark, perfil/papel/corte divergentes, reivindicação de grupo por perfil alheio aos membros, fonte financeira sem grupo, conta duplicada por origem, referência ausente, original de estorno ausente, reconciliação órfã e ajustes editáveis que ainda exigem normalização própria. Erros do contrato ou da reconciliação impedem a elegibilidade local; documentos problemáticos não são descartados para aprovar saldos.

`canReviewInitialization: true` significa somente que esse exame local não encontrou os bloqueios implementados. `canApply` e `readyForCutover` permanecem falsos e `writes` permanece vazio em todos os casos. O comando `prepare` não gera/aplica posições, calendário, pontes de ajuste ou marcadores. `plan-ledger` e `import-ledger`, em [[Importação Financeira Local Spark]], acrescentam geração/escrita local em estado bloqueado; continuam sem ativação. O relatório mantém pendentes a revisão do adaptador, a restauração da cópia específica, metadados/ciclo de vida, consentimentos, corte dos escritores antigos e o bootstrap revisado.

Legado sem grupo/razão não é convertido implicitamente. A normalização diagnóstica dos formatos conhecidos está em [[Importação Financeira Local Spark]]. Parcelas, classificações especiais, ajustes editáveis e suas identidades ainda precisam de paridade para escrita e importação executável. O analisador normalizado legado já existente continua disponível separadamente em [[Reconciliação de Dados Spark]]. Aberturas futuras continuam bloqueadas nesse analisador até haver importador que confira prazos e ponteiros.

## Execução local

Exemplo em WSL, com dados de teste e sem outros escritores. Em um terminal:

```sh
npx -y firebase-tools@15.33.0 emulators:start --project demo-lumus-snapshot --only firestore
```

Em outro terminal, na raiz do repositório:

```sh
mkdir -m 700 -p spark-backups
npm run spark:snapshot -- capture --project demo-lumus-snapshot --host 127.0.0.1:8080 --hub 127.0.0.1:4400 --output spark-backups/snapshot.json
npm run spark:snapshot -- inventory --input spark-backups/snapshot.json --output spark-backups/inventory.json
npm run spark:snapshot -- prepare --input spark-backups/snapshot.json --group grupo-sintetico --as-of 2026-10-18T12:00:00Z --output spark-backups/prepare.json
```

Para ensaiar restauração, encerrar o emulador de origem e iniciar outro vazio com o mesmo projeto, somente Firestore. Não usar `--import` nesse destino:

```sh
npm run spark:snapshot -- restore --project demo-lumus-snapshot --host 127.0.0.1:8080 --hub 127.0.0.1:4400 --input spark-backups/snapshot.json --output spark-backups/restore.json
```

Usar o ID/instante que existirem na fixture. `prepare` retorna código 2 quando encontra pendências; erros de execução retornam 1. Npm pode normalizar códigos não zero. Uma preparação sem bloqueios retorna zero, mas continua sem autorizar escrita. Caminhos relativos partem da pasta em que o comando foi chamado.

## Arquivos principais e validação

- `backend/scripts/lib/sparkLocalSnapshot.ts`: formato, validação, transporte REST, captura, restauração e inventário.
- `backend/scripts/lib/sparkBootstrapPreflight.ts`: adaptador parcial do razão e relatório de preparação.
- `backend/scripts/sparkSnapshot.ts`: CLI e arquivos exclusivos.
- `backend/tsconfig.spark-tools.json`: verificação de tipos específica das ferramentas.
- `backend/tests/sparkSnapshot.test.ts`: integridade, precisão, escopo, falha parcial e diagnósticos.
- `backend/tests/sparkSnapshot.emulator.test.ts`: captura/restauração efetiva e execução da CLI.

`npm run check` inclui os tipos e testes locais dessas ferramentas. `npm run test:spark:restore` inicia o ensaio dedicado no Emulator. A suíte usa somente fixtures `demo-lumus-snapshot`; seu reset pertence ao harness e não existe no utilitário de restauração. A política de Rules desse harness nega clientes e o ensaio usa transporte administrativo local, sem alegar validação de autorização financeira.

O ensaio percorre mais de 100 coleções e 205 documentos em uma coleção, exercitando ambas as paginações. Recria 316 documentos e confere campos tipados, pais inexistentes, documento vazio, caracteres especiais, int64 extremo, bytes, referência, timestamps finos e doubles especiais. Também verifica destino ocupado, integridade adulterada, precondição de criação, saídas privadas/exclusivas e relatório de falha. Validação de 18/10/2026: 47 testes locais novos e quatro ensaios no Emulator aprovados, zero ignorados nessas duas suítes. `npm run check` também passou com 815 testes comuns e 88 condicionais ignorados. Evidências em `.expo/spark-proof-2026-10-18/local-snapshot/`. Não foi repetida a suíte financeira Spark de 382 cenários, pois esta entrega não modifica o protocolo ou as Rules financeiras.

Continuam pendentes inventário/backup **reais**, captura das Rules efetivamente implantadas, backup de Auth/Storage conforme inventário, normalização completa legado/razão, bootstrap apto à ativação, consentimentos/corte e integração Web/mobile/chat. Esta entrega não conclui a fase 2 nem a migração integral.

## Referências

[ListDocuments e showMissing](https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents/list), [ListCollectionIds](https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents/listCollectionIds), [Value](https://firebase.google.com/docs/firestore/reference/rest/v1/Value), [metadados de Document](https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents), [precondições](https://firebase.google.com/docs/firestore/reference/rest/v1/Precondition), [Commit](https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents/commit), [ProtoJSON](https://protobuf.dev/programming-guides/json/), [integração com gatilhos emulados](https://firebase.google.com/docs/emulator-suite/connect_firestore), [export/import nativo local](https://firebase.google.com/docs/emulator-suite/install_and_configure).
