---
tags: [arquitetura, segurança, homologação]
relacionado: [[Segurança e Preparação para Produção]], [[Autenticação]], [[Processo de Release]]
status: ativo
tipo: arquitetura
versao: 3.0.0
---

# Homologação e Recuperação da Etapa 03

Registro de 09/11/2026. Base de recuperação Git `e86a55f86754ddcda1acbf83f8accdd2932cf423`; alterações anteriores do worktree preservadas. Esta rodada não publicou Rules/Hosting, não escreveu documentos financeiros nem criou/excluiu/importou contas de produção. A publicação anterior das Rules e as exportações reais tiveram autorizações específicas.

## Estados e evidências

**Implementado** significa código disponível; **testado** exige execução; **homologado** identifica o ambiente efetivamente observado. Nenhum resultado de emulador substitui aparelho físico ou verificação de senhas SCRYPT em servidor Firebase.

| Área | Estado observado | Evidência em `artifacts/` |
|---|---|---|
| Rules publicadas | Publicado e verificado no projeto `finances-app-e8685`, sem nova publicação | `stage03-final/published-now.json`, `security-publication-20261109/published-verification.json` |
| Monitoramento | Testado: 61 amostras aprovadas em 3.608,019 segundos monotônicos; maior intervalo 62,657 s | `stage03-final/observation-hour.json`, `observation-samples.jsonl`, `observation-clock-analysis.json` |
| Métricas | Analisadas na hora completa posterior à publicação; limitações abaixo | `stage03-final/metrics-publication-hour.json` |
| Auth e perfil Web reais | Homologado com login manual da identidade autorizada, oito cenários; UID inalterado | `stage03-final/auth-web.json` |
| Aparelho Android | Homologado em Samsung SM_S926B real, Expo Go57.0.9: oito cenários verificados; login/menu/logout manuais, efeitos e persistência conferidos por ADB | `stage03-final/physical-homologation.json`, `expo-go-sdk57.json` |
| Firestore real | 987/987 restaurados novamente a partir da pasta aprovada, hashes iguais, dois perfis interpretados e acessos cruzados negados | `stage03-final/destination-recovery.json` |
| Criptografia | AES-256-GCM, formatos autenticados separados, adulteração/chave incorreta/tag inválida rejeitadas | testes `snapshotSecurity` e `authSnapshot`; `destination-recovery.json` |
| Chaves/destino | Gravação/leitura e permissões 0700/0600 verificadas; co-localização aceita expressamente pelo proprietário | `stage03-final/backup-destinations.json` |
| Auth real exportado | Três contas, três hashes e parâmetros de recuperação presentes dentro do arquivo cifrado; integridade verificada offline | `stage03-final/auth-real-backup.json`, `auth-real-offline-integrity.json` |
| Recuperação integrada | Testado: quatro contas sintéticas e sete documentos, login/perfil na interface restaurada, sem divergências | `stage03-final/integrated-recovery.json` |
| Frontend | Estilos/tipos e 105 testes passaram; 115 integrações passaram; 50 verificações de rotas e cinco fluxos no navegador; export Web e Android/iOS | `security-stage03/browser-validation.json`, relatório de validação final |
| Spark | Faturamento desativado e Firestore Standard `freeTier=true` verificados; sem recurso pago introduzido | `stage03-final/published-now.json`, amostras da observação |

## Rules e observação efetiva

Fonte aprovada SHA-256 `8673e2d0d47641cf787484013a418b642442595994bdcbcbb0e9091c5f6179c8`; ruleset `16a9d21b-64c9-4815-87c0-5e66b6b8b930`. Publicação anterior encerrada em **09/11/2026 08:21:30 -03**. A fonte local permaneceu byte a byte igual. Consultar [[Segurança e Preparação para Produção]] para matriz de acessos, autorização protegida, compatibilidade e contenção. Escritas financeiras e consultas ilimitadas antigas permanecem suspensas, conforme impacto aprovado; não há certificação universal de binários antigos.

Observação somente leitura: início civil **09:14:17 -03**, final civil **10:10:54 -03**; todos os 61 pontos confirmaram hash, plano gratuito e bloqueio anônimo HTTP 401/403. `process.hrtime.bigint()` registrou **60 min 8 s** contínuos. O relógio civil avançou 56 min 37 s, aproximadamente 211 s menos que o relógio monotônico; essa diferença está explicitamente registrada. A duração não foi inferida dos horários civis nem das sondagens pontuais de 15 min/1 h da publicação anterior.

As métricas históricas cobrem outra janela completa: **08:21:30–09:21:30 -03**, após a publicação. Foram observadas **30 leituras**, **41 solicitações** (30 OK, dez permission-denied, uma invalid-argument) e dez avaliações DENY. As sondagens anônimas esperavam negação; a projeção inválida inicial foi corrigida. Métricas agregadas não identificam o chamador de cada negação, portanto não provam que todos os bloqueios foram sondagens ou que nenhum cliente válido sofreu impacto. A hora anterior teve 3.752 leituras e 1.024 solicitações, incluindo inventário/exportação administrativos; não atribuir essa diferença a ganho de desempenho.

Escritas, exclusões e métricas granulares de falhas Auth/perfil não forneceram séries suficientes: **ausência de série não significa zero**. Não foram ativados APIs, faturamento, Data Access Logging ou observabilidade paga. Recursos `datastore_request` e `firestore.googleapis.com/Database` podem expor os mesmos eventos: não somar ambos. Falha em uma página torna o total desconhecido, com regressões automatizadas para os dois casos.

## Autenticação e ambiente

`homologation:prepare` confirma projeto/app/Rules e grava somente configuração SDK pública em pasta privada fora do Git. `homologation:export` e `homologation:serve` servem a interface local real em `127.0.0.1:4174`; `homologation:native` usa Metro 8088. Não há mudança na versão publicada. Modo padrão continua sendo emulador; uso real é explícito, nunca fallback de testes.

O cache Metro agora varia com modo/host/chave pública Firebase, pois foi reproduzida a reutilização indevida de transformação entre exportações produtivas e demo. O bloqueio de rede do teste impediu acesso remoto, e a alternância produção → emulador foi reexportada/verificada. A identidade visual foi preservada; textos incorretos sobre indisponibilidade/configuração foram ajustados. A inspeção física também reproduziu rótulos nativos sobrescritos por `Input Field` no core Gluestack. Uma linha em `InputField` preserva `aria-label` explícito ou encaminha `accessibilityLabel`, sem alterar classes/layout. Nome e data legada passaram a expor os rótulos corretos no Android; ver [[Componentes UI]].

Oito cenários Web reais passaram: login/perfil/UID; reload sem login duplicado; reinício completo de Chromium; erro offline explícito; reconexão preservando identidade; logout e deep link protegido; senha inválida rejeitada; sessão local adulterada voltando ao login sem revogação remota. Houve dois logins válidos manuais e uma tentativa inválida; nenhuma credencial foi enviada pelo chat ou registrada. Cadastro, reset e alterações de perfil/conta/documentos foram bloqueados no roteiro real. Cadastro/reset e perfis ausentes/incompletos foram validados com identidades sintéticas nos emuladores.

Depois do teste funcional real, a revisão identificou que `exec` do Chromium reinicializa a proteção de dumps do processo pai. Foi corrigido com guarda própria carregada em cada processo e verificação de `/proc/PID/mem` sem ler memória. Controle positivo e navegador sem guarda confirmaram que a verificação não produz falso sucesso. Essa proteção posterior foi testada com a tela real sem credenciais, não retroativamente atribuída aos logins anteriores. Não foi observado crash/dump no teste anterior. Java/Node de recuperação exigem guardas, swap desativado e rede isolada; ausência da guarda Java impede a restauração.

A conta autorizada e os identificadores do aparelho permanecem exclusivamente na configuração privada do operador. O inventário Auth mostrou **três contas e somente dois perfis Firestore**: há uma conta sem perfil, preservada. Isso é tratado como perfil ausente pelo frontend; não criar ou associar grupos automaticamente. Não há evidência de que essa conta tenha sido criada por esta homologação.

## Backups e chave

Destino autorizado: `/programacao/finances-app-recovery-20261108/encrypted-data-20261109`. Cópias `firestore-c1ee1b62.enc` e `auth-20261109.enc`; chaves em `.keys/`, arquivos 0600 e diretórios 0700. Arquivo e chave não estão no Git. O proprietário aceitou explicitamente o mesmo ambiente para ambos: **não há independência de dispositivo, principal de acesso ou proteção comprovada contra perda do WSL/host**. Nenhuma cópia externa foi enviada ou declarada existente. As cópias originais foram mantidas.

`npm run backup:verify:local` reabre os dois arquivos e suas chaves do destino, verifica GCM/checksums e restaura o Firestore em namespace demo vazio, com rede exclusivamente loopback, sem swap/dumps/logs financeiros. Reexporta e compara os 987 documentos, caminhos/tipos/subcoleções/referências; lê os perfis pela aplicação e verifica isolamento. O comando não acessa produção e não exclui arquivos. A inspeção Auth lê os três registros e confere associação de dois perfis, sem imprimir valores sensíveis.

Política operacional preparada: verificação semanal manual; revisão de conservação a cada 30 dias; conservar esta base até uma cópia mais nova ter restauração comprovada. **Nenhuma eliminação ou rotação automática está habilitada e nenhum agendamento externo foi criado.** Corrupção/perda da chave exige recuperar uma cópia válida; não tentar reparar ou sobrescrever o arquivo original. Exportações percorridas durante um intervalo não são snapshots atômicos/PITR: Firestore e Auth também foram exportados em momentos diferentes.

## Recuperação separada do Authentication

O mecanismo real consulta `accounts:batchGet` por páginas, com limite explícito e somente leitura; configuração `signIn.hashConfig` é obtida separadamente quando as permissões existentes permitem. Exporta registros e material disponível dentro de AES-GCM. Não altera IAM/plano, não importa em produção e não registra hashes/parâmetros. Os três registros desta cópia têm material SCRYPT disponível. As permissões/limitações oficiais estão em [Admin: listar usuários](https://firebase.google.com/docs/auth/admin/manage-users#list_all_users) e [CLI auth export/import](https://firebase.google.com/docs/cli/auth).

Procedimento de recuperação:

1. Identificar recibo e par arquivo/chave corretos; verificar acesso privado, GCM, checksum e completude. Trabalhar em processo protegido, sem swap/dumps e com diretório temporário tmpfs privado.
2. Restaurar documentos em demo vazio e conferir contagens/caminhos/referências/tipos/saldos históricos. Nunca usar produção como destino de teste.
3. `restoreAuthToEmulator` aceita somente projeto `demo-*`, porta local 9098 e destino Auth vazio; `allowOverwrite=false`, lotes de 100 e rejeição de falhas parciais. Preserva `localId`/UID, email, nome, verificação, disabled e registros de provedores disponíveis.
4. Conferir os mesmos UIDs em `users/{uid}`; perfil ausente permanece explícito e não implica permissão de grupo. Comparar provedores/estado e executar login/perfil pela interface restaurada.
5. Em recuperação real de desastre, preparar nova autorização e destino Firebase vazio, sem sobrepor contas existentes. A ferramenta desta etapa **não possui importação produtiva**. O responsável deve usar importação Admin/CLI oficial revisada, com os parâmetros SCRYPT cifrados recuperados e o material entregue por canal privado; não colar parâmetros em terminal/histórico/chat. Conferir retorno por registro e testar conta de homologação antes de promover. Não executar esse procedimento no projeto ativo para testar.
6. Contas sem hash exportável exigem recuperação de senha pelo fluxo oficial; provedores externos dependem da configuração/chaves/conta do provedor e de novo login. Tokens/sessões existentes, fatores MFA, configuração de provedores e identidades externas não são garantidos por esta cópia. Ver [importação oficial](https://firebase.google.com/docs/auth/admin/import-users).

A prova integrada restaurou quatro contas sintéticas (password, provedor externo representado e conta desativada) e sete documentos: perfis, banco, despesa, referência, histórico sob pai ausente, timestamp e inteiro grande em centavos. Os hashes do emulador são fictícios: login sintético comprovado **não valida senhas SCRYPT reais nem OAuth externo**. O arquivo real passou na integridade/associação, sem importação de contas em produção. Essa limitação está explicitamente marcada nos recibos.

## Arquivos e continuidade

Novos operadores: `auth-snapshot.cjs`, `auth-recovery-run.cjs`, `verify-private-backups.cjs`, `observe-security.cjs`, `collect-security-metrics.cjs`, `homologation.cjs`, `homologation-device.cjs`, `native-ui.cjs`, `browser-protection.cjs`. Criptografia Firestore existente foi generalizada sem invalidar o formato anterior; guarda C/build e teste de recuperação protegida foram reforçados. Testes de Auth/recuperação integrada, métricas e navegador comprovam os comportamentos acima. `package.json`, Metro, erros/textos de disponibilidade e documentos correspondentes foram atualizados; nenhuma dependência nova foi adicionada.

A matriz de versões publicadas e o plano de contenção continuam em [[Segurança e Preparação para Produção]]. A homologação do código atual via Expo Go não certifica automaticamente APKs antigos ou um build standalone. O resultado físico foi registrado e os riscos de recuperação continuam explícitos. Nenhuma implementação da Etapa 04 foi iniciada.

O APK oficial Expo Go57.0.9 foi baixado (208.916.626 bytes) e conferido com o SHA-256 publicado pelo repositório oficial. `adb install -r -d` foi recusado por downgrade; posteriormente, o proprietário autorizou explicitamente a remoção/substituição. Somente `host.exp.exponent` foi removido, o APK57.0.9 foi instalado e a versão conferida. O estado do pacote Lumus permaneceu igual. Fonte: [download oficial para SDK57](https://expo.dev/go?sdkVersion=57&platform=android&device=true). O projeto permanece no SDK57 e o aplicativo publicado não foi substituído.

O roteiro físico está em `tests/device/homologation.cjs`, executado em processo protegido. O proprietário confirmou o login manual após instalação limpa do Expo Go; a automação começou observando a sessão já autenticada, sem capturar a transição inicial nem inserir credenciais. O recibo explicita esses limites. A reconexão reinicia o processo e exige perfil lido do servidor, evitando interpretar perfil antigo em memória como sucesso de rede. Localizadores aceitam a caixa alta e prefixos de ícones da navegação, rejeitam bounds de nós fora da tela e preferem o contêiner clicável. As rolagens começam em rótulos estáticos para não serem consumidas pelos campos.

## Resultado efetivo no Android

Em **09/11/2026, 13:58:51–14:12:58 -03**, a sequência consolidada confirmou oito cenários no aparelho físico: workspace autenticado; perfil/UID autorizado; nome/email/data legada; sessão após encerrar o processo; erro explícito sem conexão; nova leitura de perfil após reconexão e reinício; saída para login; persistência do logout após reinício e deep link privado. O login foi feito e informado pelo proprietário, sem captura automática da transição inicial.

As seis verificações pós-login foram executadas por `tests/device/homologation.cjs`. A automação de toque no menu não foi confiável; o usuário abriu CONFIG e efetuou/confirmou a saída. `tests/device/verify-logout.cjs` observou a tela de login, encerrou/reabriu o processo pelo link de perfil e confirmou ausência do UID/perfil anterior. O resultado é uma **homologação assistida**, não uma única execução inteiramente automática. A tentativa anterior incompleta e os segmentos estão preservados em `physical-before-manual-logout.json` e `physical-logout.json`; o consolidado é `physical-homologation.json`.

Foi experimentado `useRNModal` durante a investigação do menu e depois removido; `navigator.native.tsx` permaneceu byte a byte igual ao ponto de recuperação. A comparação durante recarregamento não foi usada como certificação causal. A única alteração de apresentação mantida nesta rodada é o encaminhamento dos rótulos de `InputField`. As falhas intermediárias dos localizadores e o limite da automação não foram ocultados. Nenhuma senha, UID, email ou captura de tela real foi incluída nas evidências.

Validação final após a correção: 105 testes/21 suítes, estilos/tipos, 50 verificações de rota e cinco fluxos Web aprovados; export Web e Android/iOS aprovados. As 115 integrações de segurança/recuperação anteriores continuam válidas, pois não houve alteração posterior de Rules/persistência/criptografia. Casos locais de caixa alta, prefixo de ícone e bounds negativos/invertidos também foram executados. Permanecem os limites de Auth SCRYPT/OAuth real, cópia/chave no mesmo host por decisão do proprietário e ausência de certificação de builds standalone/iOS físico.

Após o encerramento das verificações físicas, uma leitura opcional das configurações de rede não pôde ser realizada por indisponibilidade do transporte ADB. O recibo `device-network-final.json` registra essa limitação; ele não afirma os valores finais de Wi-Fi/dados móveis. A reativação seguida de nova leitura do perfil no servidor e as verificações de logout/reinício ocorreram antes e estão comprovadas nos segmentos físicos.
