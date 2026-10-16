---
tags: [release, auditoria, scripts, testes, dependencias, firebase]
relacionado: [[Processo de Release]], [[Firebase Config]], [[Versão Web]], [[Validação de Segurança de Ponta a Ponta]]
status: ativo
tipo: arquitetura
versao: 1.0.0
---

# Auditoria do Processo de Release

Análise de 16/10/2026 do log fornecido e do fluxo de `script/release.js`, lockfiles independentes, configuração Firebase/EAS, testes e exports. O objetivo é distinguir falha de teste, requisito remoto e vulnerabilidade; testes locais aprovados não equivalem a publicação concluída.

## Bloqueios confirmados

| Prioridade | Causa e evidência | Efeito | Situação |
|---|---|---|---|
| Alta | O deploy Firebase chega a `cloudbuild.googleapis.com` e informa que o projeto `finances-app-e8685` exige Blaze. | Functions não são publicadas, mesmo após integração e App Check passarem. | Depende do plano/cobrança do projeto. Não alterado nesta análise. |
| Alta | Audit raiz reproduzido: 61 alertas, 24 altos e 37 moderados. Cada comando Web/APK/AAB termina em `npm audit --audit-level=high falhou (1)`. | Nenhum desses comandos alcança Hosting/EAS. | Correção compatível reduziu para 53 alertas, 20 altos e 33 moderados; bloqueio preservado. |
| Alta | `braces@3.0.3` e `node-forge@1.4.0` são as duas origens dos alertas altos remanescentes, sem versão corrigida publicada na data. | Atualizar somente o pacote direto não resolve necessariamente o grafo; `audit fix --force` propõe alterações incompatíveis. | Não há exceção ou aceite automático. Reavaliar versões e advisories antes da próxima tentativa de release. |
| Alta | Ao habilitar a suíte de lotes, ajuste, transferência, Caixa, investimento e correção no razão falharam sob o limite distribuído de 120 chamadas por minuto/UID/operação. | Lotes documentados de 211 itens não completam; a preparação dos ajustes pode terminar sem rascunhos. | Bloqueio funcional adicional revelado pelo gate ampliado. Proteção do servidor preservada. |
| Alta | `npm --prefix backend ci --ignore-scripts --no-audit` falhou com `EUSAGE`: 26 entradas opcionais ausentes no lockfile, incluindo plataformas do esbuild e `fsevents`. | O ambiente instalado compilava/testava, mas uma instalação congelada em máquina/worker novo falhava. | Lockfile reparado sem atualizar as versões de negócio; instalação limpa aprovada. Gates agora verificam a consistência com `npm ci --dry-run` antes dos audits. |
| Média | A suíte de recorrências semeava início/fim do parcelamento como strings, mas as Rules atuais exigem timestamps. | Todos os 211 pagamentos/recebimentos da fixture eram recusados, apesar de os fluxos básicos passarem. | Fixture alinhada ao contrato atual, sem flexibilizar Rules. Rodada específica verifica as duas famílias. |
| Média | Functions declaravam Node 20 em `firebase.json` e `backend/package.json`, mas os emuladores usavam Node 22. | Diferença de ambiente e runtime remoto já descontinuado; retirada prevista para 30/10/2026. | Alinhado a Node 22, incluindo lockfile do backend e validação de preflight. |
| Média | O gate de integração executava somente `lumusAssistantLegacyEmulator.test.ts`. Outras três suítes funcionais dependiam de flags nunca ativadas pelo release. | O resultado de 68 testes não cobria lotes, conversa persistida e leitores do razão. | Runner passa a habilitar as quatro suítes e rejeita projeto/portas incompatíveis. |
| Média | `patch-package@6.0.7` incluía `tmp@0.0.33` e `cross-spawn@5.1.0` por ferramentas antigas. | Alertas corrigíveis de escrita em diretório temporário e ReDoS bloqueavam o release. | Atualizado para 8.0.1; grafo usa `tmp@0.2.7` e `cross-spawn@7.0.6`. |
| Média | `postinstall` não usava `--error-on-fail`; falha de aplicação de patches podia não bloquear instalação local. | Uma instalação local podia aparentar sucesso sem as correções de NativeWind/carrossel. | Falha de patch agora encerra a instalação com erro; ambos os patches existentes aplicaram. |
| Baixa | O compilador remoto de Rules avisava `Invalid type ... null ... string` na passagem de `cycle` ao helper de histórico. | Aviso real, mas o próprio log confirma compilação concluída. | Normalizado ciclo não textual para string vazia, que continua inválida para histórico alterado. Casos nulo, numérico e vazio cobertos nos dois domínios. |
| Baixa | A validação do argumento de perfil EAS acontecia depois das verificações longas. | Um comando inválido gastava tempo antes de ser recusado. | Validação movida para antes dos gates. |
| Baixa | O script mostrava apenas a primeira falha; executar quatro comandos separados repetia verificações e misturava os resultados. | Dificuldade para enxergar bloqueios independentes. | Novo diagnóstico por etapa; publicação conserva interrupção na primeira falha. |

O requisito Blaze para deploy de Functions está na [documentação oficial Firebase](https://firebase.google.com/docs/functions/get-started). As datas de Node 20 estão no [calendário de runtimes do Google Cloud](https://docs.cloud.google.com/functions/docs/runtime-support). O estado de cobrança acima é evidência do log fornecido, não uma consulta atual ao Console.

## Dependências que permanecem no audit

Contagem de alertas não é contagem de vulnerabilidades independentes: npm também atribui gravidade aos pacotes que dependem de outro afetado.

| Origem | Gravidade | Caminho relevante | Situação |
|---|---|---|---|
| `braces <=3.0.3` | Alta | Tailwind → micromatch/chokidar; Metro → micromatch | [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm): sem versão corrigida. O risco descrito é exaustão de pilha por padrões profundamente aninhados. |
| `node-forge <=1.4.0` | Alta | Expo CLI / expo-updates → code-signing-certificates | [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv): sem versão corrigida. Afeta verificação RSA PKCS#1 v1.5; geração de chaves/certificados não comprova que toda verificação é segura. |
| `decode-uri-component <=0.4.2` | Moderada | Expo Router → query-string | [GHSA-vcc3-ghjq-m6fr](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr). Requer avaliação do componente de parsing e versão compatível com SDK 57. |
| `postcss-selector-parser <7.1.6` | Moderada | Tailwind / postcss-nested | [GHSA-rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf). Não forçar migração Tailwind 4 para corrigir dependência indireta. |
| `sprintf-js <=1.1.3` | Moderada | Jest/Babel → js-yaml → argparse | [GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c). Está no caminho de ferramentas/testes; não implica por si só execução no cliente instalado. |
| `uuid <11.1.1` | Moderada | Expo → xcode; no backend, bibliotecas Google Cloud | [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq). Troca de major indiscriminada pode quebrar consumidores CommonJS. |

O backend independente tem nove alertas moderados e nenhum alto/crítico nesta análise. Isso permite passar seu audit configurado com `--audit-level=high`; não significa audit sem alertas. Não foram promovidos Firebase Admin/Functions entre majors apenas para suprimir o aviso de versão antiga da CLI.

O grafo novo mantém Expo 57.0.22, React Native 0.86.3, NativeWind 4.2.1, Tailwind 3.4.18 e Gluestack 3.0.12. O [changelog de patch-package](https://github.com/ds300/patch-package/blob/master/CHANGELOG.md) documenta as mudanças de compatibilidade de 7/8 e a correção de `tmp`; os nomes dos dois patches locais são compatíveis com a versão nova.

## Mensagens que não eram falhas de publicação

- `PERMISSION_DENIED`, `evaluation error` e algumas mensagens de limite de expressões aparecem nos casos que usam `assertFails` para provar que uma escrita indevida é recusada. O log fornecido termina essas suítes com sucesso. Não ampliar Rules para fazer esses testes negativos deixarem de negar operações. Limite de expressão em um caso que deveria ser permitido seria falha; os cenários permitidos também precisam passar.
- `AlarmManager limit` era lançado explicitamente pelo teste de recuperação de agendamento. O teste agora captura somente esse log esperado e verifica que ele foi emitido, mantendo a validação do erro e da limpeza da agenda. Logs inesperados não foram silenciados globalmente.
- `MetadataLookupWarning` para `169.254.169.254` é a tentativa de detectar ambiente Google Cloud a partir do computador local. Pode causar espera; não foi a causa de encerramento nos resultados fornecidos.
- A CLI avisa sobre `firebase-functions` antigo. É uma pendência de manutenção, sem evidência de ser a causa dos bloqueios registrados.
- Metro avisa sobre um caminho exportado inexistente de `web-streams-polyfill` e usa resolução por arquivo como fallback. É uma pendência da dependência; só um erro final de export comprovaria bloqueio por esse aviso.
- Os 88 testes ignorados no Jest comum são testes que exigem emuladores ou medições opcionais. A suíte comum não deve ser apresentada como validação deles. O gate integrado agora habilita os casos funcionais das quatro suítes; o benchmark opcional de vinte lotes continua separado.

## Como reproduzir e interpretar

1. Usar Node >=22.13 e instalar a partir dos lockfiles: `npm ci` e `npm --prefix backend ci`. Conferir que os dois patches aplicam.
2. Rodar `npm run release:diagnose` na raiz, em WSL/Linux. O projeto já usa scripts de integração Bash; o runner novo não declara suporte integral a PowerShell nativo.
3. Ler os nomes `[Release]` e a tabela final. Código 1 pode significar audit bloqueado mesmo quando compilação, testes e exports passam. O diagnóstico não faz deploy nem build EAS.
4. Resolver a cobrança Blaze no Console com o titular do projeto, reavaliar as duas origens altas e compatibilizar os lotes com os limites atuais do servidor. Nenhuma alteração no relatório libera essas pendências.
5. Seguir [[Processo de Release]] para backup, preview isolado, validação de App Check real, revisão e commit. A árvore limpa continua obrigatória ao publicar; o diagnóstico aceita alterações locais.
6. Quando todos os gates estiverem liberados, `npm run release:production -- tudo` executa as verificações uma vez e as etapas em ordem. Quatro comandos em linhas separadas são execuções independentes: uma falha de Firebase não impede o shell de iniciar o comando Web seguinte. AAB produzido pelo EAS ainda exige submissão à loja.

## Falhas de lote antes invisíveis no gate

O histórico de sucesso de 03/10/2026 em [[Validação de Lotes Conversacionais]] antecede a proteção de chamadas atual; não é evidência de aprovação do código de 16/10/2026. A primeira rodada ampliada terminou com 79 testes aprovados, sete falhos e um benchmark ignorado nas quatro suítes. Executor legado, conversa e leitores passaram; a falha ficou na suíte de lotes.

- Duas falhas eram de fixture: `installmentStartDate`/`installmentEndDate` eram strings injetadas via Admin REST, pulando a validação que uma criação normal enfrentaria. `validRecurring()` exige timestamps e recusa a atualização posterior. A fixture agora usa datas civis convertidas para `Date`/timestamp; também remove `categoryId` redundante, mantendo o campo canônico `tagId`.
- Cinco famílias revelaram incompatibilidade entre volume e proteção: `enforceCallableRateLimit()` usa documento transacional por UID/operação e janela de um minuto, e as callables financeiras recebem limite 120. São 211 itens em cada seleção; transferência, investimento e correção no razão apresentaram 91 falhas, correspondentes ao restante após 120 chamadas. Caixa atravessou uma mudança de janela e apresentou 69 falhas. O número de recusas pode variar conforme o instante de início, mas não existe garantia de concluir 211 chamadas em uma janela.
- Ajustes consomem a mesma cota tanto em `preview` quanto em `save`/`revert`. A preparação faz previews em grupos de oito e `Promise.all` rejeita quando um preview falha; a rodada obteve zero rascunhos ao preparar 211 bancos. Mesmo lotes menores podem gastar a cota entre prévia e gravação.
- `financeCommandService.execute()` não tem classificação específica para `functions/resource-exhausted`; apresenta a recusa como resultado de gravação incerto. Nessa recusa de cota, o guard do servidor ocorre antes da lógica financeira. A mensagem genérica dificulta entender o que falhou e como retomar.

Correção necessária no produto: coordenar preparação/execução/retomada para respeitar a cota, preservar IDs e confirmações e representar a recusa corretamente, com testes de limite e passagem de janela. Não aumentar ou desabilitar o limite, reiniciar contadores de cota durante a suíte, reduzir o volume artificialmente ou ignorar as famílias para obter um gate verde. Esta auditoria identifica e reproduz a incompatibilidade; não implementa uma nova política de agendamento de lotes.

## Validação e limites

Ambiente: WSL Ubuntu 24.04, Node 22.19.0, npm 11.12.1 e Java 21. Resultados finais:

| Verificação | Resultado |
|---|---|
| Instalação limpa congelada na raiz e no backend, com scripts inicialmente desabilitados | Aprovada após reparar o lockfile do backend |
| `postinstall` obrigatório depois da instalação limpa | Os dois patches aplicaram com `--error-on-fail` |
| Consistência de ambos os lockfiles com `npm ci --dry-run` | Aprovada |
| `npm run check` depois da instalação limpa | Estilos, tipos do app/backend e 81 suítes/761 testes aprovados; 88 testes de emulador/medição ignorados nessa execução comum |
| Build do backend depois da instalação limpa | Aprovado |
| Scripts de Rules, Auth, Functions, relacionamentos, migração e ajustes | Aprovados na execução integrada; inclui os novos casos negativos de ciclo nulo/numérico/vazio |
| Quatro suítes do cliente habilitadas na primeira execução integrada | Executor legado, conversa e leitores aprovados; suíte de lotes com sete falhas, conforme seção anterior |
| Revalidação específica das fixtures de recorrência corrigidas | Quatro testes aprovados: duas famílias com 211 pagamentos/recebimentos e desfazimentos, recuperação e cancelamento; benchmark separado ignorado |
| Cinco famílias de lote dependentes de callable/cota | Permanecem bloqueadas; esta auditoria não alterou o produto para coordenar a cota |
| App Check | Transporte com tokens ausentes/falsificados e rejeição sem atestado nas 15 callables aprovados |
| Export Android e Web | Aprovados na execução do diagnóstico, incluindo artefatos Expo DOM |
| Audit final do aplicativo | 53 alertas: 20 altos e 33 moderados; bloqueado |
| Audit final do backend | Nove moderados; aprovado no limiar high/critical, com pendências registradas |
| `git diff --check` | Aprovado |

A execução completa do diagnóstico foi feita antes da correção das duas fixtures; depois houve revalidação específica dessas famílias, instalações limpas e gate comum completo. Não se anuncia uma segunda rodada integrada global aprovada. Os cinco casos dependentes de cota permanecem como falhas conhecidas.

Logs e snapshots de audit estão em `.expo/release-audit-2026-10-16/`, ignorado pelo Git: `lumus-release-diagnose.log`, `lumus-recurrence-check.log`, `final-check.log`, `lumus-audit-before.json`, `final-app-audit.json` e `final-backend-audit.json`. O log do diagnóstico mostra duas etapas locais com falha (audit do cliente e integração); o requisito Blaze vem do log remoto fornecido pelo usuário.

Não foram alterados plano Firebase, APIs remotas, dados de produção, credenciais EAS nem limites do servidor. Não foi solicitado build EAS ou deploy remoto. A publicação e o funcionamento instalado exigem validação própria.

O diagnóstico não confirma disponibilidade de cobrança, permissões IAM, credenciais remotas, `GOOGLE_SERVICES_JSON` no worker EAS, compatibilidade de APK/AAB instalado, Play Integrity real, domínios Auth/reCAPTCHA nem notificações em aparelho. O preflight do preview continua exigindo projeto e configuração próprios; os registros anteriores de falta desse ambiente não equivalem a homologação aprovada.

## Arquivos principais

- `script/release.js`, `script/test_client_emulators.js` e `script/check_assistant_emulator_target.js`.
- `package.json`, `package-lock.json`, `backend/package.json`, `backend/package-lock.json`, `firebase.json`, `firestore.rules` e `eas.json`.
- `tests/releaseSecurityGate.test.ts`, `tests/clientEmulatorGate.test.ts`, `tests/mandatoryReminderNotifications.test.ts` e `backend/tests/legacySchema.rules.test.ts`.

## Integrações

[[Processo de Release]] define as etapas de publicação e [[Firebase Config]] define os alvos, runtime e inicialização. As quatro suítes do cliente exercitam os contratos financeiros do [[Assistente Lumus]]. A auditoria não substitui os gates remotos de [[Validação de Segurança de Ponta a Ponta]].
