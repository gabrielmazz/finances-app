# Lumus Finanças 1.6.0-rc.1

O [relatório de conciliação de 20/11](mvp160-conciliacao.md) atualiza o inventário, os testes e o manifesto de corte.

## Inventário oficial

A captura de `finances-app-e8685` representa **18/11/2026 às 22:11:09**, horário de São Paulo. A ferramenta percorreu todas as páginas e subcoleções encontradas sob o mesmo instante de leitura. Uma consulta de contagem confirmou cada coleção. A restauração isolada reproduziu os 987 caminhos, campos e tipos do arquivo cifrado. O SHA-256 do conteúdo restaurado corresponde ao esperado, `88ad64957fa37d0f8401095c9ddc44beb648443d1bc29e0ccabfce76cc18b80e`, após remapear as referências internas para o namespace demo.

| Coleção | Documentos |
| --- | ---: |
| `banks` | 3 |
| `tags` | 35 |
| `gains` | 246 |
| `expenses` | 590 |
| `bankTransfers` | 15 |
| `cashRescues` | 2 |
| `mandatoryGains` / `mandatoryExpenses` | 1 / 16 |
| `monthlyBalances` | 34 |
| `financeInvestments` / `financeInvestmentSyncs` / `investmentCdiRates` | 2 / 39 / 1 |
| `users` / `pushDevices` | 2 / 1 |
| **Total** | **987** |

A leitura do Authentication identificou três UIDs e dois perfis. Os documentos declaram, sob pseudônimos, 538 registros para o titular 1, 445 para o titular 2 e um para um identificador histórico sem UID correspondente. Outros três documentos não têm `personId`. Esses totais se referem aos campos de origem. A captura não encontrou grupos, vínculos protegidos, permissões administrativas delegadas, revogações protegidas nem destinos em `financialContexts`. Os campos históricos de perfil e de pessoa permanecem no backup.

| Classificação da simulação | Registros | Resultado |
| --- | ---: | --- |
| `AUTO_MIGRATABLE` | 135 | Preservação administrativa na própria origem, incluindo saldo mensal e histórico de investimentos. |
| `REQUIRES_REVIEW` | 852 | 38 associações sem evidência independente, 697 dependências de conta sem associação verificada, 109 dependências de categoria sem associação verificada e 8 referências de conta ausentes. |
| `DUPLICATE_CANDIDATE` | 0 | A simulação com as evidências disponíveis não identificou candidatos. Reavalie após resolver as dependências. |
| `ALREADY_MIGRATED` | 0 | A captura oficial não encontrou documentos no modelo canônico. |
| `INVALID_SOURCE` | 0 | A revisão de transformação continuará à medida que as relações forem comprovadas. |

O resultado prevê **zero criações oficiais**. A revisão privada gerada no tmpfs reúne os 38 caminhos de banco e categoria. O manifesto cifrado preserva detalhes por documento, a revisão da origem e as relações para rastreabilidade. A origem tem registros de outros titulares. A ferramenta limita qualquer gravação futura aos contextos e UIDs especificados no manifesto aprovado.

## Cópia e recuperação

O arquivo cifrado está em `~/.local/share/lumus-backups/mvp160-20261118/firestore.enc`. Chave e arquivo ficam em diretórios privados distintos no mesmo host. Foi usada a captura desta execução. Os detalhes de associação estão em `inventory.enc` e `dry-run.enc` no diretório da captura, com hash do manifesto de simulação `4047f7f72c28e6c6026180d68ca8e099d131b0ac3340499229ab8fde08c65518`. Nenhum material de credencial ou dado real pertence ao repositório.

Foi verificada a restauração do Firestore em rede loopback com escopo demo, preservando caminhos, referências, valores e timestamps armazenados nos campos. A verificação interpretou dois perfis e recusou as duas leituras cruzadas. O arquivo mantém os timestamps internos de criação e atualização da origem. O Firestore atribui novos metadados internos na restauração. A coleta de Auth desta execução incluiu somente UID, estado e claim de acesso. Nenhuma conta foi migrada ou recriada.

## Homologação

`lumus-financas-hml` é um projeto Firebase real isolado com Authentication por senha e Firestore Standard no Spark, sem faturamento. A versão candidata da Web e o APK de teste selecionam esse destino antes da inicialização. A suíte `npm run staging:test` usa o SDK cliente e cria identidades sintéticas. Os saldos iniciais de R$ 1.000,00 e R$ 500,00 foram exercitados com as operações previstas.

| Funcionalidade | Firebase real de homologação |
| --- | --- |
| Bancos | Cadastro, consultas, edição e arquivamento foram exercitados. |
| Categorias | Cadastro, listagem, seletor e rejeição de categoria de contexto alheio foram exercitados. |
| Receitas e despesas | Criação, edição concorrente, cancelamento, reenvio, conflito e saldo após cada operação foram conferidos. |
| Ganhos e gastos obrigatórios | Modelo, listagem, confirmação de ciclo e estorno dos dois tipos foram conferidos. |
| Transferência e saque | Saldo das duas contas, efeitos distintos no histórico e recusas para conta inválida ou fora do contexto foram conferidos. |
| Home e extrato | Consultas canônicas paginadas, filtros por conta e sessão após novo login foram exercitados pelo SDK. |
| Compartilhamento e revogação | O membro leu o banco do grupo. Escrita sem papel de administrador e leitura após revogação foram negadas. |

A migração real com dados sintéticos restaurou um backup de 53 documentos. Aplicou três destinos, correspondentes ao banco, à categoria e ao lançamento. A verificação encontrou os três destinos esperados com a origem preservada e ajuste de saldo igual a zero. O teste do emulador também interrompeu e retomou a execução, repetiu a retomada e reverteu os destinos sob o mesmo manifesto. Depois da preparação da conta sintética, o rollback automático foi recusado. O SDK cliente no Firebase real conferiu a categoria sem tipo, a referência atômica no ID original, o reenvio, a recusa de lançamento no dia de corte e o histórico preservado. Um ganho novo de R$ 10,00 levou o saldo confirmado de R$ 420,00 a R$ 430,00.

## Rules e índices

A candidata `security/financial-canonical.rules` usa autorização pelo namespace, seleção por documento e paginação de 20, integridade das operações atômicas, contas preparadas e participação atual em grupos. A candidata fecha as coleções legadas para o cliente. Seu SHA-256 publicado no ambiente isolado é `4f5ba12847f49d876121e21737b490483d6824728cf8b77e9c85c9b0db1011ac`. As Rules oficiais continuam com o conteúdo da Stage 03, SHA-256 `8673e2d0d47641cf787484013a418b642442595994bdcbcbb0e9091c5f6179c8`, verificado em leitura. O histórico anterior permanece consultável e as gravações financeiras seguem fechadas. O [diff integral](mvp160-rules.diff) compara as duas fontes.

Os dois índices da [candidata](../security/financial-canonical.indexes.json) são `COLLECTION` em `movements`. A Home usa `status ASC, date DESC, __name__ ASC`. O extrato por conta acrescenta `accountId ASC` após `status`. As duas consultas responderam no projeto isolado. Entre os 27 índices consultados em produção, nenhum corresponde a essas duas definições. A publicação de índices oficiais depende de confirmação específica. O filtro visual por categoria do extrato opera sobre a página carregada e ainda não tem consulta canônica própria.

## Estado da entrega

`npm run check` passou 169 testes. O Expo Doctor passou 20 de 20 verificações. A suíte completa do emulador executou 214 testes, com 201 aprovados e 13 falhas conhecidas reproduzidas na base anterior, ligadas à compatibilidade legada. O ensaio dedicado à migração passou separadamente. A base executada em cópia temporária teve uma falha adicional ao iniciar a UI do teste de recuperação. A cobertura antiga permanece no projeto.

A compatibilidade legada do cliente oficial está em uso enquanto os dados canônicos oficiais não estão disponíveis. A criação de índices oficiais, a migração e a referência da primeira conta dependem das autorizações separadas. A sequência de recuperação e corte está em [[Migração Financeira Definitiva]].

A Web exportada está em `~/.cache/lumus-staging/web`. O teste de navegador confirmou login, Home, extrato com lançamentos anterior e posterior à referência e sessão após recarga em desktop e largura de celular. Para abrir localmente, execute `npm run staging:serve` e acesse `http://127.0.0.1:4175/web`.

O APK ARM64 está em `~/.cache/lumus-staging/android/Lumus-Financas-1.6.0-rc.1-HML-arm64.apk`. Pacote `com.gabrielmazz.lumusfinances.hml`, versão `1.6.0-rc.1`, `versionCode 6` e SHA-256 `69688fdde6968cc427b12c07f5f6d8b965f9e2f585e9da4897c8d00515eb29a9`. O build e a assinatura foram verificados. O aparelho não estava conectado durante a execução.
