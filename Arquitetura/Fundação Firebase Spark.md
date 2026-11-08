---
tags: [arquitetura, firebase, segurança]
relacionado: [[Autenticação]], [[Perfil do Usuário]], [[Organização do Código]], [[Remoção do Backend]]
status: ativo
tipo: arquitetura
versao: 1.0.0
---

# Fundação Firebase Spark — Etapa 02

## Escopo e fronteira de produção

A fundação executa Authentication por email/senha, sessão persistente, leitura de perfis existentes, conclusão explícita de perfil ausente e edição transacional do nome. Reconhece contexto pessoal ou associação de grupo previamente estabelecida. Uma consulta paginada de bancos próprios comprova a leitura legada em testes; ainda não alimenta as telas financeiras.

**O cliente desta etapa aceita somente `EXPO_PUBLIC_FIREBASE_MODE=emulator`, projeto `demo-lumus-foundation`. Produção permanece bloqueada no código.** Isso é necessário porque a inspeção encontrou Rules publicadas permissivas. O emulador usa dados sintéticos, não uma cópia de usuários reais. Ausência de configuração exibe erro; nunca seleciona produção implicitamente.

Não foram implementados saldos, lançamentos, recorrências, transferências, extratos, indicadores, investimentos, compartilhamento ou assistente. Nenhuma operação financeira é simulada. Nenhuma Function, Cloud Run, Storage, Extension, SMS, backup gerenciado, PITR ou serviço pago foi configurado. O SDK modular importa apenas App, Auth e Firestore; os subpacotes de outros produtos distribuídos no pacote oficial não são inicializados ou usados.

## Investigação anterior à implementação

Em 08/11/2026, acesso autenticado administrativo **somente leitura** confirmou:

- Projeto existente `finances-app-e8685`, ativo; faturamento **desativado**.
- Banco `(default)`, Firestore Native **Standard**, `freeTier: true`, região `nam5`; PITR desativado.
- Authentication básico (`FIREBASE_AUTH`), email/senha habilitado. Nenhum provedor foi alterado.
- 13 coleções principais: `bankTransfers`, `banks`, `cashRescues`, `expenses`, `financeInvestmentSyncs`, `financeInvestments`, `gains`, `investmentCdiRates`, `mandatoryExpenses`, `mandatoryGains`, `monthlyBalances`, `tags`, `users`.
- Inspeção limitada a até três documentos por coleção: **32 documentos**, mantendo somente nomes/tipos dos campos no inventário. Não são amostras completas nem garantia de ausência de outros formatos.
- Perfis amostrados: `name`, `email`, `createdAt` Timestamp, `adminUser`, `relatedIdUsers`; uma subcoleção `pushDevices` foi identificada por metadados, sem ler tokens.
- Documentos financeiros amostrados usam `personId`, centavos inteiros e timestamps; campos opcionais podem ser nulos. Existem referências cruzadas banco/receita/despesa/transferência e snapshots de nomes. Nenhum saldo foi recalculado ou modificado.
- Nenhuma coleção principal `financialGroups` foi listada. O formato de grupos `members[uid] = admin|member`, `status: active` e `users.financialGroupId` vem do código arquivado, e é testado apenas em fixtures sintéticas. Não é afirmado que esteja implantado.

A release de Rules publicada, atualizada em **16/08/2026**, permite `read, write: if request.auth != null` em todo o banco. Isso possibilita leitura/alteração entre usuários autenticados. O frontend não pode corrigir essa vulnerabilidade. A evidência, hash, metadados e esquema sem valores pessoais estão em `artifacts/firebase-foundation/`. **Essas Rules não foram alteradas.**

O código arquivado reconhecia esquemas legados e protocolos posteriores; eles não equivalem à versão publicada. Não foi possível estabelecer quais versões binárias estão instaladas nos dispositivos nem inspecionar exaustivamente todos os documentos. A proposta local restringe operações de clientes antigos e **não deve ser publicada como substituição imediata**. Exige inventário de clientes, validação dos campos de autoridade e plano de transição aprovado, sem reescrever histórico.

## Organização implementada

| Local | Responsabilidade |
| --- | --- |
| `firebase/config.ts`, `client.ts`, `authPersistence*` | Ambiente isolado, inicialização única e SDK oficial; persistência Auth Web/local e nativa/AsyncStorage |
| `application/account.ts`, `errors.ts` | Login/cadastro/logout/reset e mensagens de erro sem detalhes sensíveis |
| `domain/profile.ts` | Nome válido e leitura tolerante de perfis legados, sem importar SDK |
| `firebase/profiles.ts` | Leitura de um perfil próprio e transação idempotente com verificação de concorrência |
| `firebase/financialContext.ts` | Contexto sem migração/ativação automática e consulta de bancos próprios com cursor/limite 20 |
| `firebase/diagnostics.ts` | Contadores locais por operação, documentos, falhas e observadores; sem PII ou telemetria remota |
| `contexts/SessionContext.tsx` | Um observador Auth, perfil compartilhado entre hooks, descarte de respostas de sessão anterior |
| `hooks/useAccountAccess`, `useUserProfile`, `useLogoutConfirmation`, `useSession` | Contratos de interação do frontend |
| `firestore.rules`, `firestore.indexes.json`, `firebase.local.json` | Proposta local, índices automáticos suficientes e Emulator Suite |
| `script/firebase-local.cjs`, `emulator-fixtures.ts` | Execução local explícita e fixtures apenas no projeto demo/loopback |
| `script/firestore-snapshot.cjs` | Exportação REST somente leitura, integridade e restauração restrita ao emulador |

Sem container de injeção, barramento de comandos, protocolos de recuperação, listeners Firestore ou camadas de compatibilidade sobre funções antigas. Tipos de apresentação continuam independentes do SDK. As telas/componentes/tokens/assets e os caminhos das rotas permanecem.

## Identidade, perfil e falhas

Login usa as contas existentes, sem novo cadastro e sem mudar UID. A compatibilidade com UID e formato legados foi testada com contas sintéticas no Auth emulator; **nenhum login experimental em produção** foi executado. Auth é persistido pelo SDK: `browserLocalPersistence` na Web e `getReactNativePersistence(AsyncStorage)` no nativo. O armazenamento local de Auth é o mecanismo oficial do SDK; não constitui cofre contra acesso a um dispositivo comprometido. Firestore não usa persistência financeira em disco nesta etapa.

O cadastro é público para o próprio usuário desautenticado, usa a sessão primária e cria um perfil mínimo. Não é o antigo fluxo administrativo de cadastrar outra pessoa; cadastrar estando conectado é recusado. Login não cria/migra perfis automaticamente. Perfil ausente pode ser completado explicitamente em Meu perfil. Datas Timestamp, Date, ISO e `seconds` são lidas; campos ausentes recebem estados visuais claros. Email exibido vem do Auth, não do campo legado modificável. `adminUser` não concede poder.

Auth e Firestore não compartilham transação: se o cadastro de Auth funcionar e o perfil falhar, a conta e UID são preservados. A mensagem orienta continuar e completar o perfil. Testes desativam leituras de rede e injetam uma falha gRPC local nas transações do perfil, comprovando recuperação por login sem deletar/recriar contas. O SDK trata throttling/rede; não há promessa de rate limit financeiro seguro implementado no cliente.

Edição de nome é transacional: lê o perfil, compara o nome esperado, só grava se houver mudança e preserva os demais campos. Duas edições concorrentes diferentes produzem um sucesso e um conflito explícito. Repetir a mesma conclusão não duplica perfil ou altera `createdAt`. Falhas de serviço na transação não geram confirmação antecipada. `disableNetwork` do SDK não desativa RPCs unários de transação; por isso o teste de falha usa um endpoint gRPC local que sempre recusa o serviço. Refresh preserva rascunho e nome esperado; um conflito exige revisar/descartar explicitamente antes de reaplicar a edição.

Contexto e perfil têm falhas separadas. Grupo desconhecido, inativo ou sem membro autorizado não gera fallback silencioso para dados compartilhados. Não se confia em `adminUser`/`relatedIdUsers` para conceder acesso. O histórico de Rules abertas impede tratar esses campos legados como autoridade sem verificação independente.

## Rules locais e invariantes

Protótipo de Rules com negação por padrão, leitura de perfil apenas pelo UID, enumeração de usuários proibida, criação própria com campos fechados, email igual ao token e data de servidor. Atualização aceita somente nome limitado e `updatedAt`; campos legados/permissões/criação ficam imutáveis. Perfis antigos incompletos podem receber nome sem apagar campos desconhecidos. Excluir perfil não é permitido.

Grupos são somente leitura para membros de ACL previamente estabelecida; clientes não criam grupos nem alteram papéis. O cadastro não se associa a grupo automaticamente. Subcoleções e todas as escritas financeiras são negadas. Bancos próprios são somente leitura, consultas limitadas a 20 e filtradas por `personId`; não há leitura financeira cruzada por vínculo legado.

O bloqueio de escritas financeiras é a garantia desta etapa contra corrupção por operações ainda não implementadas. Não há afirmação de invariantes de saldo protegidos para futuros módulos. Cada módulo precisará de provas/testes de autorização, concorrência e consistência nas Rules; se não couber em suas garantias/limites, deverá permanecer indisponível, sem contornar por validação apenas no cliente.

I've set up prototype Security Rules to keep the data in Firestore safe. They are designed to be secure for owner-only profiles, immutable permissions, bounded reads and denied financial writes. However, you should review and verify them before broadly sharing your app. If you'd like, I can help you harden these rules.

A compilação e os testes de Rules acontecem no emulador. Não houve deploy, dry-run remoto, alteração de plano ou ativação de APIs.

## Spark e consumo

O banco Standard gratuito tem 1 GiB de armazenamento, 50 mil leituras/dia, 20 mil escritas/dia, 20 mil exclusões/dia e 10 GiB de saída/mês. É uma cota por projeto, com um banco gratuito; o consumo dos clientes antigos também conta. Consulte a [documentação oficial de cotas](https://firebase.google.com/docs/firestore/quotas). Auth por email/senha não exige Blaze; reset por email no Spark tem limite documentado de 150 emails/dia, sujeito às demais proteções de abuso: [limites Auth](https://firebase.google.com/docs/auth/limits). Nenhuma alteração para Identity Platform foi feita.

| Operação | Estimativa de documentos por tentativa normal |
| --- | --- |
| Recuperar sessão e perfil | 1 leitura de perfil; +1 somente se houver `financialGroupId` |
| Perfil ausente, apenas login | 1 leitura, nenhuma escrita |
| Concluir/criar perfil | 1 leitura transacional +1 escrita; depois leitura explícita para atualizar UI |
| Alterar nome | 1 leitura +1 escrita; depois atualização de perfil/contexto |
| Repetir nome idêntico | 1 leitura, nenhuma escrita |
| Página de bancos | Até 20 leituras; consulta vazia pode cobrar mínimo de 1 |
| Navegar em telas financeiras preservadas | Nenhuma consulta financeira nesta etapa |

Conflitos, tentativas, leituras dependentes das Rules e consultas por índices podem acrescentar consumo. Não são garantias de faturamento/limite. O contador `getFirebaseDiagnostics()` mede chamadas e documentos lógicos no processo, não substitui o painel de uso do Firebase. Há um observador Auth por provider e zero listeners Firestore. Não existem scans de histórico para dashboard/saldo/movimentos. A próxima etapa deverá manter paginação por cursor, carregar sob demanda e definir índices a partir da consulta real. A consulta atual usa índices automáticos, sem índice composto adicional.

## Execução e testes

Node >=22.13, Java >=21, npm. SDK Firebase 12.19.0 e Rules Unit Testing 5.0.0 foram escolhidos por compatibilidade com Node 22 e Expo; SDK 13/Rules Testing 6 exigem Node >=24.12. O CLI local é fixado em 15.35.0. Não é necessário login administrativo para desenvolvimento demo.

```bash
npm ci
# Terminal 1: somente Auth e Firestore no projeto demo
npm run emulators:start
# Terminal 2: fixtures sintéticas, sem limpar banco local já existente
npm run emulators:seed
npm run dev:local:web
# Ou Expo Go/mobile:
npm run dev:local
```

Fixtures: `legacy@lumus.test`, `incomplete@lumus.test`, `outsider@lumus.test`, `missing@lumus.test`; senha **somente sintética** `Lumus-local-2026!`. O seed cria dados ausentes, sem sobrescrever edições existentes. Emuladores não persistem ao encerrar, por padrão. Ports: Auth 9098, Firestore 8089, hub 4402, logging 4502; bind loopback. Android emulator usa `.env.local` com `EXPO_PUBLIC_FIREBASE_EMULATOR_HOST=10.0.2.2`. Dispositivo físico exige configurar separadamente bind/host numa rede local confiável; não exponha o emulador à internet.

```bash
npm run check
# Emuladores devem estar parados: o comando cria uma instância efêmera e a encerra.
npm run test:integration
npm run web:export:local
npm run web:serve
# Emuladores ativos, seed executado e exportação servida em 4173:
npx playwright install chromium
npm run test:browser
# Exports nativos não equivalem a execução instalada:
EXPO_PUBLIC_FIREBASE_MODE=emulator npx expo export --platform android --platform ios
```

`test:integration` usa Auth real no emulador, testes de Rules com identidades, concorrência, falha offline, cadastro interrompido, consulta limitada e round-trip de snapshot. O teste de navegador cria contas sintéticas novas com identificador por execução; prefere-se emulador recém-iniciado/seed para limpar o estado de testes anteriores. Evidências e limitações finais ficam em `artifacts/firebase-foundation/validation-summary.json`.

## Preservação, exportação e recuperação gratuita

Produção não sofreu escritas, deploys, migrações ou exclusões. Recuperação do código antes da etapa 02: `recovery/firebase-foundation-20261108` (`ea9e261`). A tag/bundle da etapa 01 preserva a implementação antiga, **não os dados do banco**.

Exportação/importação gerenciada exige faturamento e Cloud Storage, logo não é usada: [documentação oficial](https://firebase.google.com/docs/firestore/manage-data/export-import). A alternativa disponível é leitura autorizada via REST/Admin e armazenamento externo sob controle do responsável. Ela consome leituras/tráfego e **não é um snapshot consistente em um instante** enquanto clientes escrevem.

O script REST implementado percorre coleções, documentos e subcoleções (inclusive pais ausentes), mantém os valores Firestore tipados e caminhos, exige orçamento de documentos, calcula SHA-256 e recusa arquivo de saída existente. Exportação incompleta por limite/erro não gera um arquivo final. SHA-256 detecta corrupção acidental; não substitui assinatura/autenticidade, confidencialidade ou auditoria de completude. Guarde arquivo em volume criptografado, acesso restrito e fora do Git; nunca envie tokens/PII para logs ou chat.

```bash
# Exemplo local executável; não aponta para produção:
node script/firestore-snapshot.cjs export-local demo-lumus-foundation /caminho-privado/copia.json 1000
node script/firestore-snapshot.cjs restore-local demo-lumus-restore /caminho-privado/copia.json
```

Para uma futura exportação de produção: aprovar escopo, responsável, janela e orçamento de leitura; usar identidade IAM somente leitura e token OAuth curto fornecido por `GOOGLE_OAUTH_ACCESS_TOKEN`; executar `export-readonly PROJECT OUTPUT MAX_DOCUMENTS` em máquina confiável/volume criptografado. O script proíbe requisições remotas de escrita. A autorização usada na inspeção desta etapa era administrativa; não foi exportada como credencial nem incluída no projeto. O token de exportação não deve ser digitado em comando registrado no histórico.

Antes de considerar backup válido, reconciliar inventário e contagens com a origem, revisar erros/limite/coleções ocultas por IAM, validar hash e restaurar em namespace demo vazio; comparar caminhos, valores tipados e amostras com as leituras autorizadas. Exportar também Rules/índices separadamente. Exportação Firestore não inclui contas Auth, hashes de senha, recursos, configurações ou arquivos. Referências a documentos mantêm o namespace original: restaurar em outro projeto exige revisão explícita dessas referências. Batches de restauração são create-only, com preflight de colisões; uma falha entre batches pode deixar restauração parcial, sempre isolada no emulador.

O round-trip **sintético** foi testado com centavos inteiros, timestamps de microssegundos, bytes, referências, arrays/maps, GeoPoint, null e subcoleções de pai inexistente. **Nenhum backup de produção foi executado ou validado. Restauração remota é proibida pelo script.** Não declarar recuperabilidade dos dados reais apenas com a existência deste procedimento.

## Sequência seguinte

1. Revisão das Rules publicadas, formatos reais e versões em circulação; plano aprovado para fechar o acesso amplo sem invalidar operações existentes. Não publicar o protótipo automaticamente.
2. Validar a integração de login/UID e contexto com produção somente após resolver essa fronteira. Não promover campos legados a permissões sem validação independente.
3. Bancos e saldo inicial, com centavos inteiros, invariantes transacionais protegidos por Rules e fixtures de concorrência.
4. Categorias; receitas/despesas; movimentos; extratos; dashboard, um fluxo completo por etapa.
5. Compartilhamento e demais módulos somente depois dos invariantes e de uma fonte de autoridade confiável.

## Dependências e revisão

O audit inicial do SDK apontou `@grpc/grpc-js` transitivo antigo. O override restrito a `@firebase/firestore` fixa 1.14.7, com correções descritas pelos [mantenedores do gRPC](https://github.com/grpc/grpc-node/security/advisories/GHSA-m9gg-hp2v-232j); as transações reais do SDK foram revalidadas no emulador. `npm audit --omit=dev` final: zero altas/críticas, cinco moderadas propagadas pelo tooling existente (glob/minimatch/Expo). Incluindo ferramentas de desenvolvimento: três baixas e 34 moderadas. Não se aplicou upgrade forçado da stack visual. Evidência: `artifacts/firebase-foundation/dependency-audit.json`.

A revisão independente de padrões e especificação identificou quatro achados P2, todos corrigidos e revalidados: codificação de caminhos, prefixo de subcoleção `documents`, orçamento recursivo do snapshot e preservação de rascunhos. Ver `docs/review-firebase-foundation.md`. Isso não substitui revisão de produção.

## Resultado final da validação local

- `npm run check`: estilos e tipos aprovados; **17 suítes, 92 testes**, zero falhas.
- `npm run test:integration`: **15 testes**, zero falhas, Auth/Firestore nos emuladores. Inclui ataques às Rules, concorrência, perfis incompletos, cadastro interrompido e snapshot/restauração sintéticos.
- `npm run test:browser`: **25 rotas × 2 larguras = 50 verificações**, quatro fluxos de Auth/perfil; zero erros de página/console inesperados, requisições externas ou overflow horizontal. A rota antiga `bank-summary` continua redirecionando para Home.
- Exportação Web e exports Android/iOS com Hermes aprovados. A última revisão do texto/identificador do diálogo também foi exportada como JavaScript Android/iOS (`--no-bytecode --no-minify`).
- Expo/Metro iniciou em 8088 e renderizou login, sem erro de página. Exportação estática validada em 4173.
- Inventário: **51 telas, 82 arquivos de rota**, nenhum removido. Assets, `design-system` e primitivas `components/ui` sem alterações em relação à base da etapa 02.
- Inspeção final de produção confirmou faturamento desativado e mesmo hash das Rules publicadas. Nenhuma escrita/deploy de produção por esta execução.
- Sem `adb`/`xcrun` neste ambiente: persistência e renderização nativas em aparelho ainda precisam de homologação; exportar bundles não substitui esse teste.

Limites restantes: Rules produtivas abertas; novo cliente de produção bloqueado; nenhuma cópia real de produção validada; amostragem de 32 documentos sem inventário completo dos clientes em circulação; módulos financeiros/compartilhamento adiados; cinco avisos moderados no audit de dependências de produção. A exportação REST mantém documentos em memória e precisa de orçamento compatível com RAM, volume e cotas; para grandes bases, exigir processamento em fluxo antes de aprovar sua execução. Somente o round-trip sintético foi verificado.
