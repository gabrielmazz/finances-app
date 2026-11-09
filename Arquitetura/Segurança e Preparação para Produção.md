---
tags: [arquitetura, firebase, segurança, recuperação]
relacionado: [[Fundação Firebase Spark]], [[Autenticação]], [[Perfil do Usuário]], [[Processo de Release]]
status: ativo
tipo: arquitetura
versao: 1.0.0
---

# Segurança e Preparação para Produção — Etapa 03

A implementação local de isolamento, identidade e recuperação está em `firestore.rules`, `domain/authorization.ts`, `firebase/authorization.ts`, `script/firestore-snapshot.cjs` e `script/snapshot-encryption.cjs`. Não implementa módulos financeiros. A entrega local de 08/11 não alterou produção. **Em 09/11, com autorizações específicas, houve cópia real/recuperação isolada e publicação somente das Rules; nenhum documento financeiro ou conta foi alterado.** Detalhes definitivos em `docs/security-publication-20261109.md` e `artifacts/security-publication-20261109/`. Recuperação do código anterior: `recovery/security-stage03-20261108` (`e86a55f`). Uma tag Git não é backup do banco.

## Estados e critérios

| Critério | Implementado | Validado | Publicado / pendência |
| --- | --- | --- | --- |
| Rules com isolamento e negação por padrão | Sim | Emulador, matriz e ataques | Sim, hash exato verificado em 09/11 |
| Compartilhamento por autoridade confiável | Claim + autorização protegida | Claims reais do Auth emulator, revogação e rotação | Nenhuma concessão real criada |
| Compatibilidade de clientes | Matriz por operação | JS Web realmente publicado + reprodução sintética | Binários mobile instalados desconhecidos; fluxos financeiros antigos incompatíveis |
| Exportação criptografada e limitada | Sim | Sintéticos; tipos, hierarquia, falhas e orçamento | Cópia real criptografada: 987 documentos, raízes reconciliadas |
| Restauração e integridade | Somente emulador, create-only | Round-trip e leitura pela aplicação; formato v1 também | 987 documentos reais restaurados com hashes iguais; cópia por intervalo, Auth excluído |
| Auth/perfis/sessão | SDK oficial, mesmo projeto/app/UID | Integração e navegador com reinício de processo | Apenas compatibilidade de metadados em produção; sem login experimental |
| Frontend preservado | Todas as telas e rotas | Tipos, testes, Web, bundles Android/iOS | Execução instalada Android/iOS não disponível neste ambiente |
| Publicação/monitoramento/reversão | Arquivos e ferramentas prontos | Candidate e contenção compilados/testados localmente | Rules autorizadas/publicadas/verificadas; Hosting/app não publicados |
| Spark | Auth email/senha, Firestore Standard, Rules e emuladores | Projeto real sem faturamento na inspeção | Nenhum serviço pago introduzido |

**Resultados finais:** 19 suítes/98 testes unitários, tipos e estilos aprovados; 114 integrações; matriz de 90 cenários; 50 verificações de rotas e cinco fluxos no navegador; exports Web/Android/iOS aprovados. Nenhuma falha inesperada ou requisição externa no navegador. Reinício de processo comprovado na Web, não em aparelho.

Resultados exatos e hashes finais: `artifacts/security-stage03/validation-summary.json`, `rules-test-evidence.json`, `restoration-proof.json`, `session-restart.json`, `release-manifest.json`. Não confundir proposta/teste com mudança de produção.

## Auditoria real, sem alterações

Inspeção administrativa autorizada somente leitura de 08/11/2026: projeto `finances-app-e8685`, `(default)` Standard/freeTier, faturamento desativado; Auth básico, email/senha. Dois perfis corresponderam a dois UIDs existentes no Auth, ambos com provedor password, nenhum desabilitado. Não foram usadas senhas reais nem alteradas contas. Inventários guardam somente metadados, contagens, nomes/tipos e código público; não contêm UIDs, emails ou documentos reais.

Rules publicadas: ruleset `52c726fa-754d-442a-8ac7-cf89bb593056`, atualização `2026-08-16T12:51:06.751750Z`, SHA-256 `8d431eb2263a6b35a77676b230f821e08068425d0f6c55b4f5430f3b7188cd1d`. O `match /{document=**}` libera leitura/escrita para qualquer autenticado. Essa era a vulnerabilidade real na auditoria inicial. A release foi substituída em 09/11 pelo candidato restritivo, com hash verificado; a fonte antiga é mantida somente como evidência histórica. Arquivo capturado: `artifacts/security-stage03/published-rules.txt`; inspeção: `inspection.json` e nova verificação `production-readonly.json`, quando acessível.

Contagens agregadas de raízes: banks 3; bankTransfers 15; cashRescues 2; expenses 590; financeInvestmentSyncs 39; financeInvestments 2; gains 246; investmentCdiRates 1; mandatoryExpenses 16; mandatoryGains 1; monthlyBalances 34; tags 35; users 2. Total **986**. Não incluem subcoleções: metadados identificam `users/*/pushDevices`. Não foram lidos tokens. Não existem raízes financialGroups/_authorizations nesse inventário. Ausência em uma inspeção não garante ausência futura.

O histórico de Rules abertas impede certificar integridade passada de `personId`, saldos e relacionamentos. A proposta restringe acessos futuros conforme a titularidade armazenada; não recupera nem autentica automaticamente dados que possam ter sido adulterados. Revisar qualquer relação compartilhada por evidência independente antes de conceder acesso.

## Permissões propostas

| Caminho | get / list | create | update | delete |
| --- | --- | --- | --- | --- |
| users/{uid} | Próprio UID; list negado | Próprio perfil mínimo, email do token, adminUser false, data do servidor | Somente name válido + updatedAt do servidor; preservar campos legados | Negado |
| _authorizations/{uid} | Próprio UID, claim e geração correspondentes; list negado | Negado | Negado | Negado |
| 12 raízes financeiras conhecidas | personId próprio ou compartilhamento verificado; list com filtro e limite <=20 | Negado | Negado | Negado |
| financialGroups/{groupId} | get por autorização protegida e status active; list negado | Negado | Negado | Negado |
| financialGroups/{groupId}/{accounts,movements,monthlyBalances,tags}/{id} | Grupo ativo e autorização; list <=20 | Negado | Negado | Negado |
| Demais caminhos, incluindo pushDevices e descendentes desconhecidos | Negado | Negado | Negado | Negado |

As 12 raízes financeiras estão enumeradas em `legacyCollection()` e na matriz. Perfis incompletos podem receber um nome sem perder campos antigos. Nome tem limite 100, tipo string, conteúdo não vazio e sem caracteres de controle. Atualizar email, proprietário, createdAt, vínculos, grupo, permissões ou campos arbitrários é recusado. A exclusão de conta/perfil ainda não faz parte da aplicação.

Autoridade não vem de `adminUser`, `relatedIdUsers`, `financialGroupRole` ou `group.members`. Um marcador Auth **lumusAccess**, emitido por IAM, deve corresponder à geração em `_authorizations/{uid}`: enabled true, readOwners <=5 e groups <=5, papéis admin/member. Cliente não grava esse documento nem suas claims. Dois controles impedem confiar numa autorização Firestore pré-plantada durante o período de Rules abertas. Revogar enabled ou girar geração bloqueia leituras compartilhadas mesmo com token antigo.

Provisionamento real é uma tarefa separada: **primeiro publicar/verificar Rules restritivas; depois**, com autorização específica e relações independentemente verificadas, criar a autorização IAM e emitir claim aleatória de 16–64 caracteres permitidos. Nunca copiar vínculos antigos automaticamente. Não há emissor privilegiado no aplicativo ou credencial Admin distribuída. IAM/Admin ignora Rules; acesso dos operadores precisa continuar restrito fora do aplicativo. A API de claims em `emulator-fixtures.ts` tem destino loopback fixo, só aceita projeto demo e existe exclusivamente para testes.

I've set up prototype Security Rules to keep the data in Firestore safe. They are designed to be secure for private profiles, verified shared reads, immutable permissions and denied financial writes. However, you should review and verify them before broadly sharing your app. If you'd like, I can help you harden these rules.

## Compatibilidade comprovada e incompatibilidades

O HTML/JavaScript público do Hosting foi baixado e analisado sem execução. Release `2026-11-08T14:45:02.329Z`, versão Hosting `836231f2186f7f62`. Configuração Expo declara 2.3.3; bundle SHA-256 `5bb7e9a9b9705ebe6159aaeec82b5ff5a5d18fd5154e44c3a41662ce9610e0a0`. `published-client-inventory.json` registra origem, tamanho, trechos e referências Git 2.2.1/2.3.2/2.3.3. Referência Git não comprova instalação de binário.

A matriz executada contém operação, coleção, permissão, resultado das Rules realmente publicadas, resultado esperado/proposto, verificação e ajuste: `compatibility-matrix.json` e `compatibility-matrix.md`. Ela reproduz comportamentos com dados sintéticos; não usa contas reais. Não comprova que todos os caminhos de todos os binários antigos foram exercitados.

- Login/Auth e get do perfil próprio preservam UID e formato; edição apenas de nome/data pode continuar.
- `getBanksByPersonFirebase` publicado possui fallback `where(personId == uid)` sem limit. Será negado; atualização precisa paginação. Enumeração global também é negada.
- Perfis privados de terceiros não são compartilhados junto com finanças. Fluxos antigos que dependem disso precisam de uma futura projeção mínima independente.
- Cadastro antigo com `sparkFirstUseRequested`, migração/ativação Spark, escrita de membros e operações financeiras antigas serão negados. Não reintroduzir seus protocolos nem liberar campos sensíveis para compatibilidade.
- Escritas financeiras próprias também são negadas. Não existe uma substituição compatível pronta nesta etapa; aceitar suspensão explícita ou concluir a transição em etapa autorizada antes da publicação. Não prometer continuidade financeira.
- Versões Android/iOS atualmente instaladas não foram informadas. É necessário obter essa lista e homologar os fluxos necessários. Não há afirmação de compatibilidade universal.

## Autenticação e frontend

`SessionContext` observa **onIdTokenChanged**, compartilha perfil e contexto e descarta respostas da sessão anterior. Alteração/refresh de claims revalida contexto. Falha de contexto aparece no aviso existente sem apagar o perfil próprio. Login/cadastro/reset/logout continuam nos mesmos formulários; nenhum layout, asset, token ou primitiva foi refeito.

Login não cria perfil automaticamente. Perfil ausente é completado explicitamente; perfil legado é interpretado sem migração. Cadastro interrompido preserva UID/conta e permite retomar conclusão. Nome é atualizado por transação com comparação de versão lógica (nome esperado); concorrência retorna conflito. As Rules validam mesmo quando o cliente é contornado.

Web usa persistência oficial local do SDK; recuperação após fechar/reabrir o **processo Chromium** e logout persistente foram comprovados. Nativo usa persistência oficial AsyncStorage, com bundles compilados; sem adb/xcrun/dispositivo, sessão após reinício instalado ainda exige homologação. Não inserir senha/token em diagnóstico.

A verificação pós-publicação atualizou `firebase/production-readiness.json` com o hash exato publicado. O modo produtivo explícito pode ser configurado; o novo frontend não foi publicado. Há configuração para o **mesmo** projeto/app já existente, sem criação de conta/aplicativo paralelo. O guard só aceita produção após verificação da release exata e opções públicas explícitas. É uma proteção contra liberação acidental, não uma fronteira de segurança. A segurança efetiva são Auth/Rules. `.env.production.example` não habilita produção por si só.

## Exportação externa e recuperação

A cópia real foi autorizada e executada em 09/11: 987 documentos, 961.887 bytes de conteúdo serializado, AES-GCM fora do Git. Restauração em rede somente loopback comparou todos os campos/caminhos/tipos, com hashes iguais. Dois perfis foram interpretados pela aplicação e duas leituras cruzadas foram negadas no emulador. O arquivo conserva os IDs e referências originais; somente a cópia do emulador remapeia o namespace de referências tipadas. O mecanismo implementado usa REST de leitura, não exportação gerenciada (que exige faturamento/Storage): [documentação oficial](https://firebase.google.com/docs/firestore/manage-data/export-import). Nenhum backup/PITR pago foi introduzido.

O formato v2 preserva caminho/ID/hierarquia e valores tipados Firestore, incluindo inteiros, Timestamp com microssegundos, bytes, referências, GeoPoint, null, arrays/maps e filhos de pais ausentes. Registra intervalo, contagem, documentos examinados, bytes, complete e SHA-256 canônico de metadados + conteúdo. Limite/erro interrompe sem gerar arquivo final. Não registra valores financeiros em logs.

A exportação percorre os dados durante **um intervalo**, com pointInTime false; usuários concorrentes podem causar divergência entre entidades. Hash e contagens não garantem consistência em um instante nem autenticidade histórica. Não chamar uma cópia real de backup válido sem conferir cobertura e recuperar. Uma janela de escritas suspensas, por implantação explicitamente autorizada, permitiria uma evidência mais forte; não foi aplicada. O script atual não usa readTime fixo nem PITR.

Saída real é obrigatoriamente AES-256-GCM, nonce aleatório 12 bytes, tag 16, cabeçalho autenticado; chave aleatória 32 bytes em arquivo privado, fora do repositório. Arquivo final 0600 publicado atomicamente, sem substituir cópia existente; chave e dados ficam em destinos privados **separados**, controlados pelo responsável. O processo mantém conteúdo descriptografado em memória, sem streaming, e exige proteção contra swap e dumps. Na execução autorizada de 09/11, a criptografia do volume inteiro não pôde ser comprovada: a proteção em disco é o próprio arquivo AES-GCM, com chave em diretório privado separado. Processos Node/Java usam cgroup com swap zero, PR_SET_DUMPABLE=0 e confirmação do guard Java; restauração em namespace de rede somente loopback e scratch tmpfs. Chave e cópia na mesma máquina não constituem proteção contra perda do host; transferir cópia e chave separadamente para destinos aprovados continua necessário para recuperação de desastre.

### Antes de autorizar uma cópia real

1. Revalidar projeto/banco, contagens de raízes, subcoleções e uso/cotas no painel. A métrica observada foi 2.778 leituras em janela móvel de 24h, com atraso; não equivale ao saldo diário disponível. Os clientes atuais continuam consumindo.
2. Escopo proposto: todas as raízes/subcoleções Firestore, até **1.500 documentos examinados**, **3.000 requisições REST**, **32 MiB** de conteúdo serializado, pausa de 25ms entre chamadas. 986 documentos principais conhecidos + subcoleções/pais ausentes ainda precisam ser reconciliados. Uma execução nesse teto pode falhar por crescimento, e não deverá ser declarada completa.
3. Estimar leituras aproximadamente pelo número de documentos + mínimos por consultas/páginas, metadados e tráfego. 1.500 não é garantia do total cobrado; aceitar orçamento somente com folga observada e janela aprovada. Não repetir automaticamente se falhar.
4. Operador IAM somente leitura (`datastore.entities.get/list`, inventário necessário); token curto em variável de ambiente, nunca em histórico, Git ou logs. Roles/admin da inspeção não devem ser copiadas para o cliente. Não alterar IAM/APIs/plano automaticamente.
5. Definir responsável, diretório 0700 fora do workspace em volume privado criptografado, destino secundário aprovado e retenção. Gerar chave fora do Git com permissão 0600, armazená-la separadamente e testar recuperação da chave. Perder a chave torna a cópia irrecuperável.
6. Confirmar autorização de tratamento dos dados reais e usar emulador isolado, sem acesso externo, no teste posterior. Nada real entra nas fixtures ou artefatos versionados.

Com essas condições e **autorização específica**, comando preparado (não executado):

```bash
# Token curto e LUMUS_BACKUP_KEY_FILE fornecidos por canal seguro; não digitá-los aqui.
node script/firestore-snapshot.cjs export-readonly finances-app-e8685 /volume-privado/lumus-UNICO.enc 1500 3000 33554432
# Somente projeto demo e emuladores locais; chave fora do Git:
node script/firestore-snapshot.cjs restore-encrypted-local demo-lumus-restore /volume-privado/lumus-UNICO.enc
```

A restauração só aponta para loopback/demo. Verifica checksum, rejeita colisões antes de escrever e usa precondição create-only em lotes de 100. Interrupção entre lotes pode deixar resultado parcial; falha não é sucesso e repetição não sobrescreve. Usar outro namespace demo vazio e investigar, sem apagar produção. Referências internas são remapeadas para o namespace demo; referências externas permanecem externas, sem serem lidas pelo restaurador. Reexporta o destino e compara caminhos/campos/tipos/hashes, descontando apenas esse remapeamento deliberado. Versão v1 permanece restaurável, inclusive sem scannedDocuments.

A prova sintética restaurou **26 documentos**, preservou UID de conta importada sintética, data legada, relação despesa/banco, centavos, saldo inteiro grande, histórico e órfãos. A aplicação abriu o perfil e paginou bancos em 20 + 2; a referência resolveu no emulador. Foram testados falha entre lotes, cópia incompleta, limite de bytes/requisições, arquivo existente, chave errada, adulteração e tag truncada.

**Alcance:** cópia de documentos Firestore; não inclui contas Auth/hashes de senha, Rules/índices/recursos nem estado de dispositivos. A importação UID sintética não comprova restauração de hashes reais. Recuperação completa das contas após perda do Auth exige procedimento separado autorizado e protegido; esta etapa não modificou contas existentes e não declara backup total do projeto. Exportar Rules/índices/configuração separadamente por leitura autorizada.

## Spark e orçamento de acesso

Recursos ativos: SDK App/Auth/Firestore, Authentication email/senha, Firestore Standard e Rules, Emulator Suite local. Não há Functions, Run, Storage, Extensions, SMS, backup gerenciado ou PITR. Spark documenta 50 mil leituras/dia, 20 mil escritas/dia, 20 mil exclusões/dia, 1 GiB e 10 GiB de saída/mês: [cotas oficiais](https://firebase.google.com/docs/firestore/quotas). Estimativas não garantem permanência dentro da cota, que inclui clientes antigos.

Perfil pessoal normalmente lê um documento. Perfil com grupo usa perfil + autorização + grupo, com até uma leitura dependente adicional da autorização na avaliação do grupo (estimativa conservadora ~4). Página própria lê até 20 documentos, sem get dependente nas Rules; consulta vazia pode cobrar mínimo. Compartilhada adiciona até uma autorização dependente; filho de grupo exige autorização + pai, até dois caminhos distintos por avaliação, abaixo dos limites de 10/20 descritos na documentação. Cache de avaliação pode reduzir cobranças, não é premissa de segurança. Repetições/conflitos podem aumentar o consumo.

Zero listeners Firestore; um observador Auth, encerrado no unmount. Diagnóstico local mede chamadas/documentos/falhas, não faturamento. Nenhuma tela de dashboard ou histórico inicia scan. As consultas complexas sintéticas validam autorização no emulador, **não índices de produção**; a consulta ativa de compatibilidade usa personId/documentId/limit20 e índices automáticos. Antes de ativar novas consultas, definir/testar índices e custo, sem carregar histórico completo.

## Publicação controlada — executada com autorização em 09/11

Pacote exato: **firestore.rules** via **firebase.production.json**, que contém somente a referência às Rules; não inclui Hosting, índices ou Auth. Os hashes atuais, comando e hash de contenção constam em `release-manifest.json`. Gate local verifica que Rules e contenção correspondem às evidências aprovadas. Inspeção real deve ser refeita se outra pessoa alterar produção.

1. Obter autorização específica para a mudança de Rules e seu impacto: suspensão de todas as escritas financeiras, recusa de consultas ilimitadas/cadastros Spark antigos/compartilhamento legado. Não é uma release transparente. Sem aprovação, nenhuma publicação.
2. Antes da janela: resolver versões mobile conhecidas, comunicar impacto pelo responsável, revisar matriz, validar/autorizar cópia real quando aplicável e garantir acesso IAM de reversão. Relações não verificadas ficam sem acesso compartilhado. Não manter a vulnerabilidade como exceção de compatibilidade.
3. Executar check, integração e navegador; conferir hashes/manifesto e captura da release atual. Aprovar o **hash exato**; mudança de fonte exige nova validação.
4. Com autorização, o responsável executa somente:

```bash
npx -y firebase-tools@15.35.0 deploy --only firestore:rules --config firebase.production.json --project finances-app-e8685
```

5. `npm run production:verify`, com OAuth curto, faz somente leitura: deve confirmar o hash exato publicado, Spark/Standard e configuração do Auth/app existente. Sem correspondência, não libera o novo cliente. Só então grava localmente `firebase/production-readiness.json` como published-verified. A ferramenta não publica nada. `production:audit` refaz inventário/contagens/metadados, também sem escrita.
6. Após verificar: preparar opções públicas do **mesmo** app com `node script/production-readiness.cjs prepare-client-env`, fora do Git; compilar cliente de produção e homologar por procedimento separado. Esse comando apenas grava configuração pública local, não credencial Admin; não foi executado. Publicar/distribuir cliente também requer autorização específica. Não testar automaticamente contas reais.
7. Monitorar por 15min e 1h após publicação: erros permission-denied por fluxo/versão sem PII, disponibilidade de login/perfil e contagens de falhas; no console verificar uso/quota/erros. Reavaliar em 24h. Console e diagnóstico não precisam de serviço pago. Nenhum rastreador/telemetria adicional foi introduzido.
8. Interromper promoção se hash divergir, acesso de terceiros funcionar, perfil próprio/login falhar fora do impacto aprovado, erro de quota surgir ou escrita financeira inesperadamente passar. Reproduzir primeiro com emuladores; não fazer escritas de teste em produção. Leitura positiva/negativa produtiva com identidades de teste exigirá contas e autorização específicas, sem credenciais reais automatizadas.
9. Reversão segura, com autorização de implantação, usa **security/containment.rules** por **firebase.containment.json**: somente leituras privadas próprias limitadas, sem qualquer escrita/grupo/compartilhamento. Nunca restaurar as antigas Rules abertas. Verificar hash publicado de contenção por inspeção; `production:verify` do candidato deve falhar, e retirar qualquer cliente ainda em promoção.

```bash
npx -y firebase-tools@15.35.0 deploy --only firestore:rules --config firebase.containment.json --project finances-app-e8685
```

A contenção preserva confidencialidade com indisponibilidade adicional de edição/cadastro de perfil. A autorização para publicar o candidato deve explicitar se inclui essa contenção emergencial; na ausência, solicitar aprovação do responsável. Manter a fonte antiga somente como evidência, nunca como fallback executável.

## Validação e limites restantes

`npm run check`; `npm run test:integration` (processos serializados, emuladores efêmeros); export Web e Android/iOS; navegador com 25 rotas em desktop e 390px, cinco fluxos e capturas. O preloader de testes bloqueia fetch fora das portas loopback dos emuladores antes de importar SDKs. Projetos demo e configuração fixa impedem que fixtures/restore alcancem produção. Não desabilitar esse isolamento para homologar conta real.

`npm audit --omit=dev`: zero altas/críticas e cinco moderadas herdadas de glob/minimatch/Expo; nenhuma dependência foi adicionada nesta etapa. A correção da árvore visual/tooling exige atualização separada e homologação, sem `audit fix --force`. Detalhes em `dependency-audit.json`.

Revisão independente em dois eixos encontrou restauração v1 sem orçamento e aceitação de tags GCM truncadas; ambos corrigidos e com regressões. Relatório: `docs/review-security-stage03.md`. Evidências detalhadas ficam em `artifacts/security-stage03/`. O coletor `npm run security:evidence -- CHECK_LOG INTEGRATION_LOG WEB_EXPORT_LOG NATIVE_EXPORT_LOG` reconcilia resultados, hashes e preservação, sem copiar logs brutos/tokens para o Git.

Publicação e recuperação real de documentos Firestore foram concluídas com evidências. Permanecem: inventário/homologação dos binários instalados, login produtivo com identidade autorizada, recuperação separada de contas Auth e proteção contra perda do host (cópia/chave em destinos independentes). A suspensão dos clientes antigos foi aceita, sem certificar compatibilidade universal. Monitoramento de 15min/1h está agendado e só pode ser marcado como executado quando seus artefatos existirem. A próxima etapa deve definir bancos/saldo inicial e seus invariantes antes de permitir qualquer escrita financeira; nenhum módulo foi antecipado.

A fonte de Rules foi preservada byte a byte para corresponder ao hash aprovado. Seu comentário inicial registra o estado de autoria anterior à publicação; o estado efetivo é o da release/verificação, não esse comentário histórico. O teste inicial de monitoramento recebeu HTTP 400 por uma máscara com nome reservado; a projeção foi corrigida e a consulta anônima retornou HTTP 403, sem alteração de Rules. A falha de configuração e o resultado corrigido estão registrados.

## Atualização de finalização — 09/11/2026

Os itens acima descrevem a entrega inicial e sua publicação. O estado posterior comprovado está em [[Homologação e Recuperação da Etapa 03]]: hora monotônica de observação, métricas, oito fluxos Web reais, cópia Auth cifrada e recuperação de 987 documentos a partir do destino aprovado. Login produtivo Web e backup Auth não permanecem pendentes; homologação física, independência de armazenamento (dispensada pelo proprietário) e limitações de restauração SCRYPT/OAuth não devem ser confundidas com esses resultados. Não houve nova publicação.
