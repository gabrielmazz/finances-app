---
tags: [firebase, spark, viabilidade, backend, seguranca, release]
relacionado: [[Firebase Config]], [[Processo de Release]], [[Auditoria do Processo de Release]], [[Comandos Financeiros Conversacionais]], [[Gerenciamento de Usuários]], [[Ajuste de Saldo]], [[Notificações]]
status: ativo
tipo: arquitetura
versao: 1.0.0
---

# Viabilidade do Plano Spark

Análise do código em 16/10/2026, a pedido do proprietário que não pode ativar Blaze neste momento. Este documento é uma proposta de escopo e de implementação posterior. Não ativa faturamento, não publica serviços, não altera Rules nem implementa um modo Spark.

Atualização de escopo: o proprietário confirmou preservar as funcionalidades dentro do Firebase Spark, sem Blaze e sem servidor externo. O plano atual é [[Plano de Funcionalidade Completa sem Blaze]], com comparação histórica e redesenho de transações/Rules. A versão reduzida e o backend externo abaixo permanecem como alternativas estudadas e não escolhidas. As dependências descritas neste estudo pertencem ao código atual; não são uma afirmação de impossibilidade de redesenhar as operações no Firestore.

A implementação local posterior está registrada em [[Protocolo Financeiro Spark]], com serviço, Rules aditivas e teste separado sem Functions. As seções abaixo conservam o diagnóstico que orientou o plano; seus resultados de análise não substituem as novas evidências nem representam corte de dados reais.

## Conclusão

Uma versão reduzida sem Cloud Functions é tecnicamente viável para usuários ainda no modelo legado, com dados próprios, operações comuns e funcionalidades explicitamente limitadas. O aplicativo completo atual não é compatível com esse escopo: quinze callables e dois gatilhos executam responsabilidades financeiras, de compartilhamento e de administração.

Não basta retirar `functions,firestore` do deploy. Hosting/APK podem ser enviados separadamente, mas isso não implanta o backend que seus recursos chamam. Firestore, Rules e índices continuam necessários. O diretório `functions/` contém serviços do cliente, incluindo CRUD direto; ele não equivale às Cloud Functions de `backend/src/` e não deve ser apagado.

Preservar todas as funcionalidades exige manter um servidor confiável em outro ambiente ou redesenhar o protocolo de dados e suas Rules. Isso é trabalho de arquitetura e testes; não há ajuste de comando que substitua essas garantias.

## O que o Spark permite

- Firestore possui uma franquia de uma base gratuita por projeto: 1 GiB armazenado, 50.000 leituras/dia, 20.000 escritas/dia, 20.000 exclusões/dia e 10 GiB/mês de saída. TTL, backup gerenciado, PITR, restore e clone exigem faturamento. Fonte: [limites oficiais do Firestore](https://firebase.google.com/docs/firestore/quotas).
- O bloqueio observado vem do deploy de Cloud Functions e das APIs Cloud Build/Artifact Registry, não da compilação de Rules. Functions remotas exigem Blaze; emulação local não exige ativá-lo. Fonte: [primeiros passos de Functions](https://firebase.google.com/docs/functions/get-started).
- Firebase AI Logic com Gemini Developer API pode usar o free tier sem conta de cobrança, conforme modelo, recursos e cota. Os adaptadores atuais usam `GoogleAIBackend`. Isso não comprova disponibilidade dos modelos configurados, App Check ou cota no projeto remoto. Fonte: [preços de AI Logic](https://firebase.google.com/docs/ai-logic/pricing).

Não foram consultados faturamento, uso diário, versões de Rules implantadas, inventário de Functions remotas ou perfis reais. Nenhum dado de produção foi lido. Essas condições permanecem desconhecidas; Emulator não simula o plano de cobrança nem sua franquia.

## O divisor principal é o estado de migração

`functions/FinancialLedgerFirebase.ts:96` seleciona o razão por `users/{uid}.financialGroupId` e `financialGroupRole`. As Rules são mais abrangentes: `userHasCutOver()` também considera `financialCutovers/{uid}` (`firestore.rules:70`). Não basta conferir apenas o grupo retornado pelo cliente.

Antes do corte, as Rules permitem determinadas gravações do proprietário em coleções legadas. Depois do corte, `canCreateLegacy`, `canUpdateLegacy` e `canDeleteLegacy` as recusam. Contas, eventos do razão, recibos de grupo, auditoria, reconciliações e resumos materializados têm escrita exclusivamente administrativa (`firestore.rules:484–572`).

Na implementação atual, retirar o servidor deixa usuários migrados sem um caminho de escrita autorizado. O plano confirmado deverá redesenhar esse caminho e reconciliar os dados antes de liberar gravações. Não remover campos de grupo, marcadores de corte, consentimentos ou histórico para forçar o caminho antigo: isso reabriria duas fontes divergentes de saldo. Leitura autorizada pode permanecer enquanto o novo protocolo não for validado. Reverter uma migração exigiria um projeto separado de reconciliação e backup.

## Matriz de funcionalidades

“Candidata” significa caminho existente identificado e sujeito aos critérios de implementação abaixo; não significa uma release Spark já validada. As escritas legadas também dependem das Rules correspondentes estarem implantadas.

| Funcionalidade | Caminho atual | Viabilidade sem Functions |
|---|---|---|
| Login, cadastro padrão, recuperação de senha e logout | Firebase Auth; cadastro com `secondaryAuth`/`secondaryDb` em `RegisterUserFirebase.ts` | Candidata. Preservar sessão, compensação de cadastro e políticas de segurança; não depende de callable. |
| Nome do perfil, preferências e anotações locais | `UserProfileFirebase.ts`, contextos e armazenamento por UID | Candidata; manter isolamento de conta e privacidade. |
| Home, extratos, categorias, previsão e relatórios | Consultas em `HomeFirebase.ts`, `CategoryAnalysisFirebase.ts`, `FinancialForecastFirebase.ts` | Candidatas no legado; conferir escopo, índices, integridade da fonte e uso da franquia. Razão existente apenas para leitura autorizada. |
| Despesas e receitas comuns | `ExpenseFirebase.ts` / `GainFirebase.ts`: gravações Firestore; executor conversacional escolhe legado/razão | Candidatas no legado. Formulários e chat precisam da mesma decisão de capacidade; movimentos especiais não podem ser disfarçados de despesas comuns. |
| Bancos e saldos de abertura | `BankFirebase.ts`, `MonthlyBalanceFirebase.ts`; assistente tem outro fluxo transacional | Candidatas após tratar abertura obrigatória e concorrência descritas abaixo. No razão usam servidor. |
| Categorias: criar/editar | `TagFirebase.ts`: `setDoc`; comandos migrados usam `manageFinancialMetadata` | Candidatas no legado. |
| Categorias: excluir | `TagFirebase.ts:160` chama `manageFinancialMetadata` mesmo sem grupo | Indisponível na primeira versão. O servidor verifica referências, inclusive histórico de outros grupos; a prévia cliente não substitui esse guard. |
| Despesas/receitas fixas e parcelas | `MandatoryExpenseFirebase.ts` / `MandatoryGainFirebase.ts`: transações Firestore; chat migrado usa `completeFinancialRecurring` | Candidatas no legado, com testes de pagar/receber, desfazer, ciclo e concorrência. Confirmar limites do histórico; não inferir ciclos antigos sem evidência. |
| Transferências e saques/Caixa | `BankFirebase.ts:157–187`: `executeLegacyFinancialMovement` no legado e `transferFunds` no razão | Indisponíveis na primeira versão; exigem novo protocolo validável ou servidor alternativo. Não transformar saque/transferência em despesa/receita comum. |
| Investimentos: criar, editar, aportar, resgatar e desfazer aporte/resgate | `FinancesFirebase.ts:148–216,577`: executor legado ou callables do razão | Indisponíveis na primeira versão. A escolha do legado não elimina a dependência do servidor. |
| Investimentos existentes: consulta, CDI e sincronização manual | Leitura e alguns caminhos de sincronização do legado usam Firestore; razão usa reconciliação | Consulta/CDI podem permanecer. Adiar escritas e sincronizações de investimento no primeiro escopo para não oferecer controles parciais que alterem a posição sem os demais fluxos. |
| Ajuste de saldo: prévia, salvar, substituir e estornar | `BankBalanceAdjustmentFirebase.ts:23`; coleções de ajuste negam escrita cliente | Indisponível inclusive no legado. Não substituir por um saldo mensal arbitrário. |
| Convidar, aceitar, listar convites e desvincular usuários | `UserRelationshipFirebase.ts` e `RegisterUserFirebase.ts` chamam `userRelationship` | Novo compartilhamento indisponível. Vínculos existentes exigem solução de revogação antes da release; ocultar o botão não revoga acesso. |
| Pedido de exclusão de conta | `RegisterUserFirebase.ts:87` chama `requestAccountDeletion` | Necessita alternativa autenticada e procedimento de atendimento. O backend atual só registra `pending-retention-policy`; exclusão completa já era pendente, independentemente do Spark. |
| Lembretes locais Android/iOS | `mandatoryReminderNotifications.ts` / `expo-notifications` | Candidatos em build instalada, respeitando permissão e limitações de plataforma. Web/Expo Go não ganham agenda por mudar de plano. |
| Push de alterações compartilhadas | Dois gatilhos `onDocumentWritten` em `backend/src/index.ts:700–708` | Indisponível sem remetente confiável externo. Registrar token Expo sozinho não envia notificações. |
| Lumus IA: conversa e consultas | AI Logic, App Check, Remote Config; execução financeira separada | Condicional à disponibilidade gratuita real do modelo. Ferramentas e executor precisam limitar ações ao escopo Spark; resposta do modelo não pode liberar ação indisponível. |
| Migração, consentimento e reconstrução de resumos | `migrateFinancialGroup`, `financialMigrationConsent`, `rebuildFinancialReadModels` | Não oferecer no modo Spark; administração e backfill dependem de ambiente confiável. |

## Inventário das dependências de servidor

Foram identificadas quinze callables exportadas pelo backend. Dez cobrem o núcleo/razão: `postMovement`, `transferFunds`, `correctMovement`, `reverseTransaction`, `reconcileAccount`, `manageFinancialMetadata`, `completeFinancialRecurring`, `manageAccount`, `rebuildFinancialReadModels` e `migrateFinancialGroup`. As outras cinco são `executeLegacyFinancialMovement`, `bankBalanceAdjustment`, `userRelationship`, `financialMigrationConsent` e `requestAccountDeletion`. Reconstrução/migração incluem uso administrativo, não apenas chamadas de tela.

Os dois gatilhos são `notifyMandatoryExpenseChange` e `notifyMandatoryGainChange`. Nenhuma integração de produção com `firebase/storage`, `getStorage` ou `uploadBytes` foi encontrada na busca dos fontes; o campo público `storageBucket` da configuração não comprova uso de upload de arquivos. Não remover configuração genericamente a partir desse nome.

## Por que não basta copiar os handlers para o aplicativo

O cliente é uma fronteira não confiável: alterações de saldo, autorização, data, ID e documentos podem ser enviadas fora da interface. Uma função JavaScript, um campo de capacidade ou uma confirmação no chat não substitui as Rules.

O executor legado carrega seis coleções bancárias **dentro de transação administrativa**, calcula saldo civil completo, confere proprietário/relações e fingerprints e grava efeitos e recibo juntos (`backend/src/legacyFinancialMovements.ts:50–92,214`). No SDK Firestore do cliente, `Transaction.get` recebe uma referência de documento, não a query que o Admin SDK usa (`node_modules/@firebase/firestore/dist/index.d.ts:2991`). Mover as consultas para antes da transação perde a mesma garantia de concorrência; uma revisão local do banco não prova que todos os escritores atualizaram esse marcador.

Rules podem verificar documentos determinados com `getAfter`, mas não executar consultas arbitrárias sobre todo o histórico, loops gerais ou chamadas externas. Há limite de dez acessos por operação e vinte na transação/lote. Fonte: [condições de Rules](https://firebase.google.com/docs/firestore/security/rules-conditions). Um protocolo Spark completo precisaria de documentos de saldo e recibos determinísticos, conjuntos limitados de contrapartidas e validação cruzada de cada efeito; correções retroativas, estornos e compartilhamento ampliam esse trabalho.

As Rules atuais já permitem alguns cadastros/edições de investimento e exclusões de categoria do proprietário. Isso **não comprova equivalência** às verificações globais dos handlers. A interface chamar o servidor não transforma as validações JavaScript em uma fronteira de segurança. Antes de ampliar qualquer escrita, comparar create/update/delete contra as invariantes do servidor; não usar essas permissões existentes como um atalho de migração.

As cotas distribuídas, auditoria e recibos de servidor também não podem ser substituídos por contadores ou registros voluntários no aparelho. Uma eventual equivalência em Rules deve ser demonstrada por testes adversariais, não presumida.

## Ajustes necessários mesmo na versão reduzida

1. **Identificar usuários elegíveis.** Inventariar de forma autorizada grupo/papel, marcadores de corte e vínculos; distinguir estado desconhecido de usuário comprovadamente legado. Não usar falha de rede ou `functions/not-found` para escolher um armazenamento alternativo. Não houve esse inventário remoto nesta análise.
2. **Capacidades comuns a todas as entradas.** Limitar navegação Web/mobile, deep links, formulários, serviços, ferramentas do modelo, parser local, execução, retry e restauração de pedidos. Recusar a operação antes de preparar/confirmar/gravar, com explicação consistente. Não basta esconder cards nem filtrar apenas ferramentas do modelo.
3. **Aberturas consistentes.** `addBankFirebase()` cria somente o banco e os formulários Web/mobile anunciam sucesso sem criar a abertura. O fluxo conversacional já possui caminho transacional distinto. Para cumprir [[Gerenciamento de Bancos]], unificar banco+abertura ou impedir operações dependentes do saldo até a abertura explícita.
4. **Concorrência de abertura.** `upsertMonthlyBalanceFirebase()` consulta banco/ano/mês e, se vazio, usa `addDoc()` com ID aleatório fora de transação (`functions/MonthlyBalanceFirebase.ts:32–110`). Duas sessões podem criar aberturas duplicadas. É risco inferido do código, não um novo teste de reprodução. A implementação Spark deve definir identidade canônica, tratar dados já duplicados e demonstrar a transação concorrente correta; não simplesmente trocar a seleção do primeiro registro.
5. **Compartilhamento e revogação.** Grants e listas existentes continuam autorizando leitura nas Rules mesmo sem a callable disponível. Uma versão individual deve restringir consultas e autoridade nas Rules, ou prover revogação confiável antes de liberar usuários com vínculos. Mudar apenas queries/flags do cliente não revoga acesso. Não abrir escrita de grants, papéis ou listas para contornar o problema.
6. **Exclusão solicitável.** Definir registro autenticado limitado ao próprio UID e canal de atendimento efetivo, com política de retenção e processamento controlado. Não apagar apenas Auth/perfil nem chamar solicitação de exclusão concluída. Essa adaptação ainda não foi implementada/aprovada.
7. **Publicação própria.** O seletor atual já separa Hosting e builds, mas `verify()` continua validando o backend e não possui perfil Spark nem etapa isolada de Rules/índices. Criar um fluxo explícito que publique Rules/índices compatíveis antes do cliente e não tente ativar APIs de Functions; preservar auditoria, testes e isolamento de ambientes. Manter o fluxo completo atual disponível.
8. **Uso da franquia e continuidade.** Medir documentos retornados, listeners, leituras das Rules e retries. `assistantCatalogService.ts:152` carrega várias coleções; onze consultas não equivalem a onze documentos cobrados. Um lote de 211 ações também pode escrever vários documentos por item. Não prometer operação gratuita ilimitada. Backup/exportação e restauração precisam de procedimento compatível com a ausência de backup gerenciado.

Também há diferenças de roteamento: formulários comuns ainda gravam diretamente no legado, enquanto o executor do chat escolhe callables para grupos migrados. A release deve validar essa distinção em serviços e Rules, sem deixar uma tela aparentar que pode gravar e terminar somente em `permission-denied`.

## Alternativas avaliadas no estudo inicial

A alternativa inicial, não escolhida pelo proprietário, era uma implementação **legada, individual e reduzida**, preservando Auth, Firestore e suas proteções. Candidatos: despesas/receitas comuns, recorrências e parcelas, bancos/aberturas corrigidos, categorias sem exclusão, perfil, consultas/relatórios e lembretes locais. Nessa alternativa, investimentos existentes poderiam ser consultados, e movimentações/ajustes ficariam indisponíveis. O plano confirmado busca preservar essas operações por redesenho, conforme [[Plano de Funcionalidade Completa sem Blaze]].

Esse caminho não é apropriado para uma conta migrada ou com compartilhamento sem revogação resolvida. Esses usuários exigem tratamento próprio antes da distribuição. As restrições fazem parte do produto e precisam ser apresentadas antes de confirmar qualquer pedido, não descobertas por erro em produção.

Se transferências, aportes/resgates, ajustes ou compartilhamento forem indispensáveis agora, a alternativa é estudar um backend externo. O [Admin SDK pode ser executado em servidores fora do Google](https://firebase.google.com/docs/admin/setup), mas os handlers precisam ser separados do transporte `secureOnCall`. Exigir verificação de Firebase Auth/App Check, autorização, validação, transações, cota compartilhada, segredos exclusivos do servidor e recibos preservados. Não colocar service account no app. Não foi escolhido provedor, criado serviço nem comprovado que um plano externo gratuito cobre disponibilidade, tempo de execução, rede e franquias do Firestore.

Portar integralmente o razão para escrita cliente é uma terceira opção, de maior escopo: exige protocolo novo, migração/reconciliação de dados e revisão adversarial das Rules. Não é a primeira medida recomendada para resolver o bloqueio atual de publicação.

## Critérios de aceitação da futura implementação

- Executar fluxos permitidos com Auth/Firestore locais e Functions desligadas; nenhum pedido permitido pode tentar callable nem depender de gatilho para concluir.
- Provar disponibilidade idêntica em Web/mobile, chat, parser local, retry e acesso por URL; propostas indisponíveis não podem gerar escrita parcial.
- Recusar usuários migrados/estado desconhecido; preservar leitura autorizada e impedir retorno ao legado ou alteração de papel/grants pelo cliente.
- Testar UID trocado, acesso de outra conta, sessão vencida, replay, pedido alterado, dois dispositivos, duas aberturas concorrentes, falha entre documentos e cancelamento.
- Provar centavos inteiros, recibos atômicos, ciclos `YYYY-MM`, parcelas exatas, saldo por fonte correta e ausência de dupla contagem de transferência/investimento.
- Validar revogação de compartilhamento, solicitação de exclusão e plano de recuperação de dados.
- Executar auditoria de dependências e testes relevantes; testar índices/Rules no projeto isolado e builds instaladas. Não reduzir proteção, ignorar famílias ou rotular testes skipped como aprovados para liberar upload.

## Verificação realizada nesta análise

Os cinco scripts existentes `test:legacy:rules`, `test:profile:rules`, `test:assistant:rules`, `test:auth-session:rules` e `test:rules` passaram com código 0, usando **somente Firestore Emulator**, sem iniciar Auth Emulator nem Functions Emulator. Autenticação dos testes foi simulada pelo Rules Unit Testing; fixtures administrativas são restritas aos projetos demo locais. Os casos incluem operações válidas e recusas esperadas de permissões, histórico, movimentos compostos e escrita no razão.

Essa execução confirma os contratos das Rules atuais, não o funcionamento de todas as telas sem backend, a cota gratuita, o faturamento remoto ou a disponibilidade dos modelos de IA. Não foram criados novos caminhos de persistência nem executada a integração completa novamente. Os resultados anteriores de 788 testes comuns, 86 testes integrados e App Check pertencem à correção anterior, não constituem aprovação de um modo Spark inexistente.

Evidência local ignorada pelo Git: `.expo/spark-feasibility-2026-10-16/run-rules.sh` e `rules-without-functions.log`. Mensagens `PERMISSION_DENIED` dos testes negativos são esperadas; o processo final terminou com sucesso e encerrou o emulador. Plano Firebase, credenciais, dados reais, dependências e aplicação permanecem inalterados.

Os bloqueios anteriores de audit do cliente continuam independentes do Blaze: o último diagnóstico registrou 20 alertas altos e 33 moderados. O audit não foi repetido nesta análise; o estado precisa ser reavaliado antes de qualquer release, inclusive Spark. Ver [[Auditoria do Processo de Release]].

## Arquivos principais e integrações

`firebase.json`, `firestore.rules`, `script/release.js`, `functions/FinancialLedgerFirebase.ts`, `BankFirebase.ts`, `FinancesFirebase.ts`, `BankBalanceAdjustmentFirebase.ts`, `MonthlyBalanceFirebase.ts`, `MandatoryExpenseFirebase.ts`, `MandatoryGainFirebase.ts`, `TagFirebase.ts`, `RegisterUserFirebase.ts`, `UserRelationshipFirebase.ts`, `services/lumusAssistant/financeCommandService.ts`, `assistantApplicationService.ts`, `assistantCatalogService.ts` e `backend/src/`.

[[Firebase Config]] descreve a separação cliente/servidor. [[Processo de Release]] governa publicação. [[Comandos Financeiros Conversacionais]], [[Ajuste de Saldo]], [[Gerenciamento de Usuários]] e [[Notificações]] preservam as regras de domínio; este estudo não substitui seus contratos por um fallback inseguro.
