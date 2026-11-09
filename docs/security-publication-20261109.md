# Publicação de segurança — 09/11/2026

O usuário autorizou a publicação do candidato `8673e2d0d47641cf787484013a418b642442595994bdcbcbb0e9091c5f6179c8`, com suspensão das operações financeiras antigas, após verificar recuperação e transição. Em confirmação separada, autorizou a cópia real do Firestore até 1.500 documentos, 3.000 requisições e 32 MiB e a restauração isolada. Não autorizou alterações em documentos, contas, faturamento, Hosting ou distribuição de aplicativos.

A transição aceita é a suspensão explícita dos fluxos antigos incompatíveis, conforme a pergunta autorizada. Não foi certificada compatibilidade de todos os binários instalados. Nenhuma exceção ampla foi adicionada às Rules.

## Preparação e verificações

- Fonte aprovada e contenção mantêm os mesmos hashes da etapa 03. Configuração de publicação contém somente `firestore.rules`.
- Revalidação: 98 testes unitários, tipos/estilos e 114 integrações aprovados. Nenhum módulo financeiro foi adicionado.
- Auditoria somente leitura: Spark, Standard/freeTier, faturamento desativado, 986 documentos nas raízes e dois perfis correspondentes a dois UIDs Auth. Uso reportado: 5.545 leituras em janela móvel de 24h; não é saldo garantido da cota diária.
- Antes de processar dados reais, `npm run test:recovery-protected` comprovou round-trip de quatro documentos sintéticos e bloqueio de dois acessos a perfis de terceiros. Teste negativo exige falha se a proteção de dumps do Java não carregar.
- Revisão independente corrigiu comparação de caminhos não canônicos e exigiu confirmação do guard Java antes da restauração. Não foi feita leitura de backups/chaves pelos revisores.

## Proteção operacional da cópia

`script/firestore-recovery-run.cjs` reutiliza o exportador, criptografia e restaurador testados. A execução Linux exige `MemorySwapMax=0`, `LimitCORE=0` e proteção nativa `PR_SET_DUMPABLE=0`; o WSL possui capturador de core em pipe, para o qual somente RLIMIT_CORE seria insuficiente. `script/build-operator-protection.cjs` compila localmente os guards C usando GCC/headers já instalados, fora do Git e sem dependência no aplicativo. Java confirma a proteção por um canal privado antes de receber documentos.

Backup AES-256-GCM e chave 0600 ficam em diretórios privados 0700 distintos fora do repositório. Não se comprovou criptografia do volume inteiro: a confidencialidade em disco depende do arquivo cifrado e da proteção separada da chave. Mesma máquina não oferece redundância contra perda do host; não foi enviado conteúdo a serviços externos.

A restauração usa namespace de usuário/rede com somente loopback, Java sem credenciais e sem logs, scratch tmpfs e projeto demo. Todos os valores reais ficam em memória protegida e no arquivo cifrado; somente contagens/hashes/booleanos entram nas evidências versionadas. A cópia percorre um intervalo, não representa um instante consistente. Não inclui contas/hashes de senha do Auth.

## Evidências e estado

`artifacts/security-publication-20261109/` registra preflight, prova sintética protegida, cópia, recuperação e publicação, conforme cada etapa for efetivamente executada. Os dados/chaves reais não ficam nesse diretório. A situação definitiva deve ser lida no relatório final de publicação; autorização não equivale a execução bem-sucedida.

## Resultado executado

- Publicação concluída às **08:21 de 09/11/2026 (America/Sao_Paulo)**, somente Rules do `(default)` em `finances-app-e8685`. Ruleset novo: `16a9d21b-64c9-4815-87c0-5e66b6b8b930`; SHA-256 aprovado e publicado idênticos. Estado local `published-verified` após leitura da release. Nenhuma publicação de Hosting/app.
- Cópia real: **987 documentos**, dos quais 986 nas raízes e um em subcoleção; **961.887 bytes** serializados. Fonte reconciliada com o inventário de raízes. Intervalo `11:13:36Z–11:17:40Z`; `pointInTime:false`, sem promessa de consistência instantânea.
- Restauração real: **987/987**, todos os caminhos/campos/tipos e referências normalizadas com hashes iguais. Dois perfis interpretados pela aplicação, IDs preservados e duas leituras de perfis alheios negadas no emulador. Queries paginadas de bancos próprios passaram. Não houve teste com senha real ou criação de conta produtiva.
- Verificação posterior: contagens de raízes inalteradas, mesmos dois perfis correspondendo a dois UIDs Auth, email/password habilitado, Standard/freeTier e **billingEnabled:false**. Consulta anônima com projeção vazia de dados privados retornou **HTTP 403**. Nenhuma escrita financeira, mudança de Auth/IAM/plano ou deploy de Hosting foi realizada.
- Um primeiro monitor retornou HTTP 400 por usar nome reservado na máscara de projeção. Foi corrigido no monitor, sem alterar Rules/dados, e repetido com HTTP 403. A evidência inicial e a corrigida foram preservadas.
- Revalidação após abrir o gate produtivo: **98 testes/19 suítes**, tipos e estilos aprovados. O teste de configuração agora injeta explicitamente o estado não publicado, evitando depender da data real de implantação. As 114 integrações passaram antes da publicação, com a mesma fonte de Rules. O novo teste operacional protege e recupera sintéticos e comprova falha fechada quando a biblioteca Java não carrega.
- Monitoramento adicional somente leitura agendado para **08:36 e 09:21 de 09/11** (15min/1h após publicação), em timers transitórios do usuário. Depende de máquina/WSL e systemd ativos. Consultar `monitor-15m.json` e `monitor-1h.json`; agendamento não é comprovação de execução. Não envia mensagens nem altera recursos remotos.

A documentação oficial informa até um minuto para novas consultas e até dez minutos para listeners já ativos: [propagação das Rules](https://firebase.google.com/docs/firestore/security/get-started). A verificação de hash confirma a release, sem substituir teste autenticado produtivo com identidade especificamente autorizada.

## Local da cópia e recuperação futura

Cópia e recibo privados: `/home/gabrielmazz/.local/share/lumus-backups/20261109-20261109111058626-16f9ffca/`. A chave está em diretório 0700 separado sob `/home/gabrielmazz/.config/lumus-backup-keys/`, conforme o recibo privado. Arquivos de backup e chave foram conferidos com 0600; **nenhum valor de chave ou documento foi incluído no Git**. Não remover a chave. Transferir cópia e chave separadamente para destinos independentes aprovados continua sendo necessário contra perda do host.

Para repetir uma recuperação real, usar o recibo privado como entrada do wrapper `firestore-recovery-run.cjs restore`, em processo protegido e namespace de rede isolado. Compilar guards com `node script/build-operator-protection.cjs` e validar com `npm run test:recovery-protected`; o wrapper recusa ausência de swap-zero, dump guards, scratch tmpfs, rede somente loopback e destino demo. Não executar o CLI genérico sem essas proteções com dados reais neste ambiente. Não há restauração automática para produção.

O backup cobre documentos Firestore, **não contas/hashes do Auth**. O banco original continua intacto. Não há garantia de redundância externa nem certificação de integridade histórica dos saldos. O cliente publicado antigo terá operações financeiras bloqueadas conforme autorizado; o novo frontend ainda precisa de distribuição/homologação separadas. Não foram iniciados bancos/saldo inicial ou outros módulos financeiros.

## Checagem após propagação

A checagem de aproximadamente 15 minutos executou com sucesso (`monitor-15m.json`, `2026-11-09T11:36:13.576Z`): mesmo ruleset/hash, Spark/Standard gratuito, faturamento desativado, email/password ativo e consulta anônima HTTP 403. A checagem de uma hora permanece agendada para aproximadamente 09:21 locais; ainda não foi declarada executada. O resultado futuro será `monitor-1h.json`.

Revisão final independente confirmou escopo somente leitura do monitor e ausência de operações de conta/escrita financeira. Um texto antigo do README que negava qualquer deploy foi corrigido para registrar a publicação autorizada das Rules. Nenhuma pendência de backup Auth, redundância externa ou homologação foi ocultada.
