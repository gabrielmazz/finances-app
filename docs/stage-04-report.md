# Etapa 04 — Bancos e Saldo Inicial

Implementação local sobre `6cdf312`, recuperável pela tag `recovery/banks-opening-stage04-20261109`. Não houve deploy, migração ou gravação financeira em produção. As evidências desta etapa usam exclusivamente `demo-lumus-foundation` e dados sintéticos. Ver também [[Gerenciamento de Bancos]] no vault e `docs/stage-04-spec.md`.

## Entrega implementada

Cadastro, consulta, listagem paginada, edição cadastral com revisão, abertura identificável e arquivamento de contas com saldo zero. Home e detalhes usam a mesma fonte persistida. Contas arquivadas ficam fora do total e têm consulta própria. Formulários de ambas as plataformas mantêm telas/rotas/seletores/cores/estilos existentes, com instituição, nome da conta, tipo, data e valor de abertura. Estados de carga, vazio, erro e confirmação dependem do resultado do servidor.

`domain/money.ts` converte texto BR em centavos inteiros com BigInt, sem arredondamento financeiro em ponto flutuante; rejeita casas excedentes, entradas malformadas e saldo por conta fora de ±9.000.000.000.000 centavos. Formatação BRL centralizada e soma com verificação de inteiro seguro.

Persistência nova:

- `financialContexts/{personal:UID|group:GID}/bankAccounts/{operationId}`: cadastro, valor/data de abertura, estado, revisão e auditoria.
- `financialContexts/{mesmo contexto}/accountOpenings/{mesmo operationId}`: evento de abertura imutável, `type: opening`, valor/data, justificativa para saldo negativo e autoria.

Conta e abertura são criadas juntas em transação. Rules/getAfter exigem correspondência e impedem órfãos. Abertura não é receita. Nesta etapa, o saldo atual de uma conta nova é a abertura, pois nenhuma movimentação posterior está habilitada. Futuros módulos precisarão de seu próprio protocolo atômico e Rules; não poderão editar o saldo livremente. Correção de abertura não é edição cadastral e permanece indisponível; arquivamento exige saldo zero e não apaga/reabre registros.

## Organização

| Responsabilidade | Arquivos principais |
|---|---|
| Domínio e moeda | `domain/banks.ts`, `domain/money.ts` |
| Persistência | `firebase/banks.ts` |
| Intenção durável/idempotência | `application/bankIntents.ts`, `application/bankIntentLock{,.web}.ts` |
| Dados compartilhados | `contexts/BankAccountsContext.tsx`, `hooks/useHomeScreenData.ts` |
| Interação | `hooks/useBankAccountForm.ts`, `hooks/useBankAccountDetails.ts` |
| UI preservada/integrada | AddRegisterBank, Home e BankMovements em `screens/mobile/` e `screens/web/`; componentes em `components/uiverse/banks/` |
| Segurança | `firestore.rules` candidata local; `security/stage03-published.rules` preserva a versão anterior |
| Verificação | `tests/banks.test.ts`, `tests/bankIntents.test.ts`, `tests/bankAccountsContext.test.ts`, `tests/integration/banks.integration.ts`, `tests/browser/banks.cjs` |
| Execução local | `script/firebase-local.cjs`, `script/stage04-seed.ts`, `script/stage04-device.cjs` |

Nenhuma dependência nova, serviço pago ou API do backend eliminado foi introduzido.

## Integridade e segurança

ID opaco de 20 caracteres guardado em AsyncStorage antes do envio, por UID/contexto. Repetição do mesmo ID e dados confirma o mesmo par; dados diferentes geram conflito. Resultado desconhecido é conferido no servidor, sem trocar automaticamente o ID. Reiniciar recupera o cadastro já persistido. Só “Cadastrar outra conta” gira a intenção confirmada. Web Locks/fila nativa e comparação do ID impedem que uma aba antiga apague a intenção de outra. Dados financeiros/credenciais não ficam nesse armazenamento. Limpar os dados do aplicativo elimina a continuidade dessa intenção local; IDs distintos representam contas distintas, pois nome de instituição não identifica uma conta de forma única.

Edição exige revisão esperada; edições concorrentes diferentes não sobrescrevem silenciosamente a vencedora. Listagem pós-save não reutiliza uma resposta iniciada antes do commit. Logout/troca de identidade descartam respostas antigas e escondem dados anteriores. Operações não confirmadas não recebem sucesso presumido.

Pessoal: proprietário do UID no caminho. Grupo: leitura admin/member e escrita admin, com claim da Etapa 03, `_authorizations` protegido, geração válida e grupo ativo. Roles do perfil/`members` não concedem acesso. Campos obrigatórios/tipos/limites, autoria/data de servidor, revisões e campos imutáveis são protegidos nas Rules, independentemente do frontend. Abertura, contexto, proprietário e saldo não podem ser editados/excluídos. Coleções desconhecidas continuam negadas. Grants legados readOwners não abrem novos contextos pessoais.

A auditoria limitada ao módulo está em `artifacts/banks-stage04/security-audit.json`; os cenários negativos e a matriz executada estão nos JSONs adjacentes. Não representa certificação de produção nem limitação de taxa por usuário: um cliente autorizado ainda pode consumir cotas compartilhadas com operações legítimas repetidas.

## Dados existentes

Inspeção protegida da cópia previamente autorizada identificou três bancos e 34 snapshots mensais, todos com histórico vinculado. Nenhum dado privado/valor real foi incluído no repositório. Leitura reconhece IDs/proprietários/contextos de `banks` e de contas em grupos. Edição legada altera somente metadados permitidos; snapshots/histórico não mudam. Registros incompletos ou ambíguos são bloqueados explicitamente.

O último snapshot mensal não comprova a abertura nem o saldo atual sem reconciliar as movimentações. Por isso contas antigas exibem conciliação pendente e impedem um total enganoso. Nenhuma conta/saldo inicial é recriado automaticamente. Essa reconciliação continua necessária antes da ativação financeira para esses registros. A matriz `stage03-to-stage04-compatibility.json` executa as operações representativas com os dois conjuntos de Rules; não certifica binários antigos instalados. As escritas financeiras antigas continuam negadas como naEtapa 03.

## Execução e evidências

1. `npm run emulators:start` em terminal separado, somente projeto demo.
2. `npm run emulators:seed:banks` para conta Android fictícia; email `banks-mobile@lumus.test`, senha de desenvolvimento `Lumus-local-2026!`.
3. Web: `npm run web:export:local`, `npm run web:serve`, `npm run test:banks:browser`. Chromium pode ser informado em `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.
4. Android: `npm run dev:local -- --localhost --port 8088`, Expo Go 57 compatível. ADB reverse8088/8089/9098; abrir `exp://127.0.0.1:8088/--/mobile`. Não usar conta produtiva.
5. `npm run check`; suíte completa `npm run test:integration` exige emuladores novos/vazios, pois o teste de recuperação se recusa a sobrescrever contas existentes. Não executar essa suíte sobre a sessão de homologação em uso.

Resultados finais e homologação física constam na tabela abaixo. JSONs/capturas ficam em `artifacts/banks-stage04/`. Exportação ou largura mobile no navegador não substituem aparelho físico.

## Spark e consumo

Somente Authentication email/senha, Firestore, Rules, transações e emuladores. Sem Functions, Run, Storage, SMS, Extensions ou faturamento. As cotas gratuitas são compartilhadas e não garantem disponibilidade ilimitada: [cotas oficiais](https://firebase.google.com/docs/firestore/quotas).

Estimativas por operação, sem retries e além de autenticação/perfil: criar  = 2 leituras transacionais +2 gravações +2 leituras de confirmação; consultar  = 2 leituras; editar/arquivar  = 1 leitura transacional +1 gravação +2 leituras de confirmação. Em seguida há refresh das páginas ativas (e arquivadas se abertas). Página  = até 20 contas novas e 20 legadas; consulta vazia também pode ter custo mínimo. Total só aparece quando todas as páginas estão completas e todos os saldos são conhecidos. Sem listeners ou leitura do histórico inteiro. Rules pessoais consultam o par na criação; grupos acrescentam documentos de autorização/grupo, com cache interno de avaliação e limites por operação. A faturação/medição exata depende dos acessos de Rules, retries e consultas reais; essas estimativas não são garantias de cota. Teste de lote com dois pares de grupo comprova o orçamento de acessos desse caso.

Referências: [atomicidade e retries](https://firebase.google.com/docs/firestore/manage-data/transactions), [getAfter e limites de Rules](https://firebase.google.com/docs/firestore/security/rules-conditions).

## Ativação controlada futura — não executada

1. Rever o diff exato entre `security/stage03-published.rules` (SHA-256 8673e2d0d47641cf787484013a418b642442595994bdcbcbb0e 9091c5f6179c8) e `firestore.rules` (hash nos recibos). Novos matches são contas/aberturas por contexto e edição cadastral limitada do legado; nenhum outro módulo financeiro é liberado.
2. Confirmar novamente a versão ativa por leitura, aprovação específica desse código/hash e condições de backup/compatibilidade. As limitações conhecidas da Etapa 03 (chave no mesmo ambiente, credenciais reais não integralmente recuperadas, Expo Go sem standalone/iOS) permanecem.
3. Somente depois da autorização, publicar Rules; conferir hash efetivo e testar com conta de homologação autorizada. Nenhum comando de deploy foi executado nesta etapa.
4. A API atual bloqueia projetos diferentes de `demo-lumus-foundation`. Uma liberação posterior deve substituir essa trava por configuração explícita aprovada, atualizar a comprovação de Rules e distribuir o cliente por canal controlado. Publicar apenas as Rules não ativa o módulo neste cliente.
5. Consultas novas usam status/documentId no caminho de contexto; consultas legadas usam personId/documentId. Não foi necessário novo índice composto no emulador. Conferir eventual recomendação de índice no projeto real antes da distribuição; não criar índices/infraestrutura automaticamente.
6. Após liberação, monitorar permissões, cotas, pares completos, duplicação, compatibilidade e totais sem registrar valores privados. Suspender ativação se surgirem órfãos, acesso indevido, divergência de saldo ou erros de permissão de usuários válidos.
7. Reversão: retirar a ativação do cliente e, com autorização operacional, reaplicar a fonte exata da Etapa 03. Isso bloqueia o módulo novo, preservando seus documentos; não apagar dados nem retornar às Rules antigas permissivas. Uma regressão pode deixar clientes novos temporariamente indisponíveis, sem perda financeira.

## Resultados da revisão

Revisão de requisitos: corrigidos refresh pós-commit que podia reaproveitar uma página antiga, rotação concorrente de intenção e isolamento de novos contextos pessoais frente a grants legados. Revisão de padrões: corrigido formulário habilitado durante recuperação assíncrona e removida persistência de componentes visuais em favor dos hooks. O teste adicional de duas abas reproduziu entrada perdida antes da identificação do contexto; o formulário agora espera contexto e consulta da intenção, com regressão automatizada. Validação de hash/revisão e casos negativos das Rules permanece independente do frontend. Revisão final automatizada e manual limitada a este módulo; nenhum certificado de segurança externa ou binário antigo foi presumido.

A validação física combina ações manuais do proprietário com consulta direta do estado final no Firestore e capturas/asserções da interface. Login inicial, criação e edição foram assistidos; fechamento/reabertura e confirmação do arquivamento foram verificados por ADB. O retorno do Expo Go à sua própria Home após force-stop exigiu abrir o projeto no histórico; isso não comprova o relançamento de um binário standalone. Hierarquias retidas expõem controles repetidos à automação; o driver da Etapa 04 seleciona o mais recente. A configuração temporária de tela acesa no USB foi restaurada ao valor original, com recibo. Após reimportar a sessão fictícia no emulador para a conferência final, houve novo login com a mesma conta sintética, sem recriar UID ou documentos; a persistência após reiniciar apenas o aplicativo havia sido comprovada antes desse reinício do servidor local.

## Estado final verificado

| Área | Implementado | Testado/homologado | Publicado |
|---|---|---|---|
| Cadastro/abertura, centavos e persistência | Sim | SDK/emulador, Web e Android físico | Não |
| Edição, consulta e arquivo de saldo zero | Sim | Web e Android físico, estado final conferido | Não |
| Home/total de contas ativas | Sim | R$ 1.500,00 após reinício/edição/arquivo, Web e Android | Não |
| Idempotência e concorrência | Sim | Oito tentativas do mesmo ID; duas abas reais; conflito de revisão; rotação de intenção | Não |
| Regras de isolamento/validação | Sim | 38 cenários do módulo + 90 cenários de segurança/compatibilidade e demais regressões | Não; sem nova publicação nesta etapa |
| Legado | Leitura/edição cadastral segura | Fixtures de legado, preservação de snapshots e matriz entre Rules | Sem migração; saldo antigo depende de conciliação |
| Spark | Sem novos recursos/dependências pagos | Auth/Firestore/Rules/emuladores, sem uso remoto financeiro | Plano inalterado |

- `npm run check`: estilos e tipos aprovados; **133 testes, 25 suítes aprovados**.
- `npm run test:integration`: **153 testes aprovados, zero falhas**, em emuladores novos. Inclui recuperação Auth/Firestore anterior, 38 cenários de bancos e 90 de segurança/compatibilidade. Tentativa de rodar recuperação sobre a sessão de homologação não vazia foi corretamente recusada pelo mecanismo que proíbe sobrescrita; a suíte foi repetida no ambiente vazio exigido, sem relaxar essa proteção.
- Web: fluxo completo aprovado em 1440×1000 e 390×844; conta de 150000 centavos, recarga/reabertura, edição, zero/arquivo/total, duplo clique, duas abas e rotação concorrente. Nenhum erro de página ou acesso externo no teste. JSON em `artifacts/banks-stage04/browser.json`.
- Android físico SM_S926B/Expo Go 57: criação de 150000 centavos, persistência após force-stop/reabertura, edição preservando abertura, criação de conta zero, arquivamento, lista de arquivadas e Home total 150000. Identificador do cadastro e UID sintético preservados; duas contas e duas aberturas correspondentes, uma conta ativa e uma arquivada. JSON em `artifacts/banks-stage04/android.json`, capturas adjacentes.
- Exportação Web e bundle Android/Hermes aprovados. Bundle/export não é certificação standalone/iOS.
- Teste de conexão interrompida usa endpoint gRPC local que retorna UNAVAILABLE; `disableNetwork()` não interrompe os RPCs unários de transações. Estado final comprova ausência de pares parciais; mesma operação recupera o resultado já confirmado. Não houve teste de falha de energia física ou esgotamento real de cota Spark.

Sessão fictícia de homologação preservada fora do Git em `/home/gabrielmazz/.cache/lumus-stage04-demo-20261109`. Para retomá-la: `npm run emulators:start -- --import /home/gabrielmazz/.cache/lumus-stage04-demo-20261109 --export-on-exit /home/gabrielmazz/.cache/lumus-stage04-demo-20261109`. Esse diretório contém somente dados sintéticos de desenvolvimento; não é backup de produção. A suíte de recuperação completa continua exigindo um emulador novo, sem esse import.

Permanecem fora da homologação: produção, binários antigos instalados, standalone e iOS; conciliação dos saldos financeiros históricos; correções de abertura e movimentações futuras; limites herdados de recuperação da Etapa 03. Nenhuma dessas situações é apresentada como publicada ou comprovada. O módulo é utilizável no ambiente de testes e aguarda avaliação/autorização específica de ativação produtiva.

O ajuste final do aviso superior respeita a safe area e foi conferido novamente na Home Android. Capturas finais não contêm dados de produção. Relatos assistidos só foram convertidos em aprovação após comparar os documentos persistidos; nenhuma confirmação do usuário substituiu a leitura de estado.

A fonte produtiva registrada é a versão homologada da Etapa 03; não foi realizada nova inspeção remota nesta etapa. Antes de qualquer liberação, o procedimento acima exige conferir novamente o estado efetivo do projeto.
