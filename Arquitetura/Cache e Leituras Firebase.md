# Cache e Leituras Firebase

<!-- spark-progress:start -->
## Progresso Spark — 19/10/2026

F10 — Home/extrato/análise: **78% implementado / 22% restante** no módulo completo. O cache da Home Spark já revalida montagem/foco/primeiro plano/reconexão e o vencimento conhecido, ocultando o snapshot durante revalidação, erro ou expiração. Restam medição por volume/custo e homologação em aparelhos. Ver [[Status da Implementação Spark]] e [[Dashboard Home]].
<!-- spark-progress:end -->

## Política do cliente

- As queries financeiras anteriores usam TanStack Query com `staleTime` de **10 minutos**, sem refetch automático por foco/reconexão/remount. A Home Spark opta por revalidação nesses eventos e agenda o vencimento conhecido; o snapshot anterior não é apresentado durante a conferência, erro ou expiração. Pull-to-refresh continua sendo recarga explícita.
- A chave começa sempre com `['finance', uid, ...]`. Assim, consumidores simultâneos deduplicam a mesma promessa e dados de contas diferentes não se misturam.
- A Home é uma única query compartilhada. Ela não usa mais `useFocusEffect` para disparar uma consulta a cada retorno de tela.
- `ReadAuditEntry` registra em desenvolvimento chave, origem, gatilho e duração. Novas leituras devem passar por hooks/gateway, não por effects de tela.
- `utils/firebaseReadAudit.ts` adiciona `ReadScope` e `ReadReport` para adapters de repository: operações SDK, documentos entregues, estimativa de leituras, cache/servidor, listener inicial/deltas e unsubscribe. `getReadReport()` e `resetReadReport()` são a API para testes; a estimativa não inclui leituras de regras, índices ou backend.
- Repositories Firebase retornam o `unsubscribe` nativo; `MemoryEntityRepository` usa `Map` e observers idempotentes exclusivamente em testes unitários. Queries e Security Rules completas pertencem aos testes no Emulator.

## Persistência e privacidade

- Auth é `memory-only` no Android/iOS; no navegador, a sessão primária usa persistência local compartilhada entre abas, separada deste cache financeiro. Ver [[Autenticação]] e [[Firebase Config]].
- Metadados podem ser persistidos por UID. Valores e resumos financeiros só são persistidos quando **Confiar neste dispositivo** está ativado em Configurações → Privacidade dos valores.
- A preferência começa desligada. Desligá-la ou sair da conta remove imediatamente o cache financeiro persistido; a memória atual só dura até a sessão encerrar.
- A hidratação acontece somente depois que o `uid` autenticado é conhecido. O armazenamento usa AsyncStorage no nativo e sua implementação web baseada em localStorage.
- Logout explícito aposenta a geração do UID, aguarda todas as gravações de cache e preferência de confiança, então remove metadados, valores e preferência antes de encerrar Auth. Uma gravação tardia de **Confiar neste dispositivo** não pode restaurar o consentimento após a saída. Falha no logout reabilita mutações da conta atual; novo login começa com cache próprio. Ver [[Remediação da Auditoria de Segurança]].

## Consultas e rollout

- Listagens extensas devem usar `limit` e cursor (`startAfter`), nunca offset.
- A Home calcula saldos legados em lote: carrega o último `MonthlyBalance` por banco e movimentos posteriores ao menor corte necessário, não o histórico inteiro por banco.
- A consulta otimizada de `monthlyBalances` exige o índice composto versionado em `firestore.indexes.json`; o gateway mantém fallback escopado por `personId` durante o rollout do índice para que a Home não falhe por uma defasagem temporária da infraestrutura.
- Previsão consulta movimentos somente dos três meses anteriores e do horizonte selecionado. A atividade de investimentos começa em seis meses e não relê todo o histórico.
- `financeMonthlySummaries/{groupId-YYYY-MM}` é atualizado dentro da transação que cria a `ledgerTransaction`; o callable `rebuildFinancialReadModels` reconstrói páginas idempotentemente por mês, aceita `dryRun`, cursor e tamanho de página, e deriva o grupo do administrador autenticado.
- O rollout permanece dual-read: regras/índices e functions, dry-run/backfill, comparação em centavos, depois remoção do fallback. Nenhum deploy é feito automaticamente.

## Ajuste de saldo — 2026-09-30

[[Ajuste de Saldo]] invalida as queries financeiras após salvar/editar/reverter. A prévia é autoritativa no servidor, cancela respostas obsoletas no hook e não persiste valores localmente. A Home legada lê `bankBalanceAdjustments` uma vez por escopo autorizado e reaproveita a coleção para todas as contas. O extrato lê ajustes do usuário/relacionados e grupo, deduplica por ID e filtra conta/período. No backend do razão, a prévia consulta somente eventos posteriores à data e a abertura mais recente da conta, com os índices financeiros existentes. O legado consulta as coleções do banco para reconstruir a base; seu custo é proporcional ao histórico dessa conta e não há polling.
