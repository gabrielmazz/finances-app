# Cache e Leituras Firebase

## Política do cliente

- As queries financeiras usam TanStack Query com `staleTime` de **10 minutos**. Foco, reconexão e remount não fazem refetch automático; pull-to-refresh faz uma única recarga explícita.
- A chave começa sempre com `['finance', uid, ...]`. Assim, consumidores simultâneos deduplicam a mesma promessa e dados de contas diferentes não se misturam.
- A Home é uma única query compartilhada. Ela não usa mais `useFocusEffect` para disparar uma consulta a cada retorno de tela.
- `ReadAuditEntry` registra em desenvolvimento chave, origem, gatilho e duração. Novas leituras devem passar por hooks/gateway, não por effects de tela.
- `utils/firebaseReadAudit.ts` adiciona `ReadScope` e `ReadReport` para adapters de repository: operações SDK, documentos entregues, estimativa de leituras, cache/servidor, listener inicial/deltas e unsubscribe. `getReadReport()` e `resetReadReport()` são a API para testes; a estimativa não inclui leituras de regras, índices ou backend.
- Repositories Firebase retornam o `unsubscribe` nativo; `MemoryEntityRepository` usa `Map` e observers idempotentes exclusivamente em testes unitários. Queries e Security Rules completas pertencem aos testes no Emulator.

## Persistência e privacidade

- Auth continua `memory-only`.
- Metadados podem ser persistidos por UID. Valores e resumos financeiros só são persistidos quando **Confiar neste dispositivo** está ativado em Configurações → Privacidade dos valores.
- A preferência começa desligada. Desligá-la ou sair da conta remove imediatamente o cache financeiro persistido; a memória atual só dura até a sessão encerrar.
- A hidratação acontece somente depois que o `uid` autenticado é conhecido. O armazenamento usa AsyncStorage no nativo e sua implementação web baseada em localStorage.

## Consultas e rollout

- Listagens extensas devem usar `limit` e cursor (`startAfter`), nunca offset.
- A Home calcula saldos legados em lote: carrega o último `MonthlyBalance` por banco e movimentos posteriores ao menor corte necessário, não o histórico inteiro por banco.
- Previsão consulta movimentos somente dos três meses anteriores e do horizonte selecionado. A atividade de investimentos começa em seis meses e não relê todo o histórico.
- `financeMonthlySummaries/{groupId-YYYY-MM}` é atualizado dentro da transação que cria a `ledgerTransaction`; o callable `rebuildFinancialReadModels` reconstrói páginas idempotentemente por mês, aceita `dryRun`, cursor e tamanho de página, e deriva o grupo do administrador autenticado.
- O rollout permanece dual-read: regras/índices e functions, dry-run/backfill, comparação em centavos, depois remoção do fallback. Nenhum deploy é feito automaticamente.
