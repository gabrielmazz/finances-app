---
tags: [notificacoes, lembretes, push-remoto, expo-notifications, android, web]
relacionado: [[Despesas Fixas]], [[Receitas Fixas]], [[Componentes UI]], [[Autenticação]], [[Versão Web]]
status: ativo
tipo: feature
versao: 3.4.0
---

# Notificações

Sistema de avisos do Lumus Finanças com três frentes: lembretes locais de vencimentos/recebimentos via `expo-notifications`, push remoto para alterações de recorrências compartilhadas e alertas in-app padronizados com `components/uiverse/notifier-alert.tsx`. O navegador não recebe nem registra push.

## Push remoto para dispositivos vinculados

1. Após autenticar em uma build Android/iOS instalada e com permissão concedida, `app/_layout.tsx` chama `registerRemoteNotificationDevice()`. O token Expo fica em `users/{uid}/pushDevices/{installationId}`; somente o próprio UID pode gravar ou ler esse documento.
2. `backend/src/index.ts` observa `mandatoryExpenses` e `mandatoryGains`. Criação, edição ou exclusão gera uma mensagem para o dono do template e seus `relatedIdUsers`, portanto a entrega não depende do celular que efetuou o save nem exige que as listas estejam abertas.
3. A Function usa o endpoint Expo Push, nunca aceita uma lista de destinatários do cliente, deduplica tokens e remove tokens que o Expo informar como `DeviceNotRegistered`. O conteúdo não inclui valores financeiros.
4. `sendLinkedDevicesNotificationTest` é uma callable autenticada que reusa a mesma lista de destinatários. A central **Testes do aplicativo** registra o aparelho atual e chama essa Function por **Testar dispositivos vinculados**.
5. Expo Go e Web não registram tokens. Cada pessoa vinculada precisa abrir ao menos uma vez a build instalada e permitir notificações para que seu aparelho entre na lista de entrega.

## Lembretes locais

### Como funciona

1. `app/_layout.tsx` chama `bootstrapLocalNotifications()` na inicialização. `utils/localNotifications.ts` registra o handler global de apresentação em foreground, executa a limpeza legada uma única vez e cria os canais Android atuais.
2. `utils/notificationsRuntime.ts` detecta o Expo Go por `executionEnvironment: storeClient` antes de avaliar `expo-notifications`. No Android SDK 53+, o pacote registra erro ao carregar APIs remotas nesse host; por isso, o Expo Go mantém os lembretes indisponíveis sem importar o pacote, enquanto development/production builds usam o motor nativo normalmente. `utils/notificationsRuntime.web.ts` nunca carrega esse pacote e declara o runtime indisponível. Uma falha de notificações não pode impedir o Expo Router, a autenticação ou o Assistente Lumus de abrir.
3. `expo-notifications` é o único motor nativo de notificação. `@notifee/react-native`, seus eventos `DELIVERED` e seu handler de background foram removidos; `index.ts` apenas inicia o Expo Router.
4. `utils/mandatoryReminderNotifications.ts` calcula datas concretas, agenda, cancela, persiste o mapa local e reconcilia os lembretes financeiros. `utils/mandatoryExpenseNotifications.ts` e `utils/mandatoryGainNotifications.ts` são wrappers finos por domínio.
5. A ocorrência mensal é resolvida primeiro por `resolveMonthlyOccurrence()`, respeitando dia 29/30/31 e a opção de dias úteis. Depois, o serviço subtrai dias de calendário para gerar D-3, D-2 e D-1, inclusive quando o lembrete cruza o início do mês ou do ano.
6. Cada notificação usa identificador determinístico por UID, tipo, template, configuração completa, ciclo `YYYY-MM` e antecedência. Alterar horário, vencimento ou combinação D-3/D-2/D-1/D0 produz uma agenda nova e permite remover a anterior sem duplicar avisos.
7. Android recebe um horizonte móvel de seis meses e iOS um horizonte de dois meses. Um planejador global limita o motor a 400 agendas gerenciadas no Android e 60 no iOS, descontando agendas externas já presentes. Primeiro reserva a próxima ocorrência de cada template em ordem estável e depois distribui as vagas restantes cronologicamente. Assim, uma conta recorrente não monopoliza o teto e todas recebem ao menos o próximo aviso enquanto houver capacidade. Uma agenda reduzida é recalculada em todo retorno ao foreground, portanto vagas liberadas por outros recursos são reaproveitadas sem esperar o ciclo diário.
8. Ao autenticar, `mandatoryReminderAccountSync.ts` carrega despesas/receitas do Firestore e restaura a agenda sem exigir que o usuário visite as listas. [[Despesas Fixas]] e [[Receitas Fixas]] reforçam a reconciliação ao carregar/recarregar; `app/_layout.tsx` renova a janela ao voltar ao foreground, respeitando o intervalo de 24 horas quando não há agendas ausentes.
9. O mapa local é serializado no AsyncStorage em `@lumusMandatoryReminders:expo-v1`. Todas as entradas incluem `accountId`. Uma troca real de UID cancela e limpa a conta anterior; o logout explícito chama `clearMandatoryReminderAccount(uid)` e só é aceito se esse UID ainda for a autoridade corrente. A varredura inclui alarmes nativos gerenciados mesmo se o mapa local tiver sido perdido.
10. A limpeza de logout é transacional: primeiro os alarmes são cancelados, mas as configurações locais ficam como snapshot de rollback. O mapa só é descartado por `finalizeMandatoryReminderAccountCleanup(uid)` depois que o Firebase confirma `signOut`; se o Firebase falhar, a agenda é reconstruída do snapshot local, inclusive sem rede.
11. A autenticação primária é memory-only. Por isso, o estado `user=null` observado numa abertura fria não limpa a agenda do último UID: os alarmes continuam válidos mesmo que o usuário precise entrar novamente. Ao autenticar outra conta, a ponte elimina a agenda anterior antes de ativar o novo UID.
12. Ao registrar uma despesa como paga ou uma receita como recebida, o ciclo concluído é suprimido imediatamente e as datas restantes daquele `YYYY-MM` são removidas. A sincronização das listas reforça a mesma regra por `lastPaymentCycle`/`lastReceiptCycle`. Cancelar um template ou concluir um ciclo redistribui imediatamente as vagas liberadas.
13. O bootstrap não solicita permissão sozinho. A solicitação acontece quando o usuário ativa ou salva um lembrete. Uma configuração salva sem permissão permanece no mapa local e é agendada ao voltar ao foreground depois que o usuário autorizar o app nas configurações do sistema.

### Navegador

- `platformCapabilities.supportsScheduledLocalNotifications` é `false` no Web. A verificação precede qualquer tentativa de canal, permissão, alarmes, sincronização ou agendamento.
- `notificationsRuntime.web.ts` retorna um contrato inofensivo e indisponível; não importa `expo-notifications`, não solicita a permissão de notificações do navegador e não cria canais Android fictícios.
- O site preserva a configuração de lembrete salva no Firestore, mas respostas de disponibilidade e telas devem informar que o agendamento acontece somente no aplicativo Android ou iOS instalado. Não transformar essa mensagem em push Web sem uma decisão arquitetural e documentação nova.
- O bootstrap e a ponte de autenticação podem continuar montados no navegador: os serviços retornam no-op seguro, sem bloquear login, CRUD financeiro, relatórios ou o [[Assistente Lumus]].

### Modelo de configuração

| Campo | Regra |
|---|---|
| `reminderEnabled` | Deve ser `true` para que o template participe da agenda |
| `reminderConfigVersion` | Deve ser `1`; documentos sem esta versão são considerados legados e ficam desativados |
| `reminderDaysBefore` | Despesas aceitam `1`, `2` ou `3`; receitas atuais usam `0` porque avisam no dia |
| `reminderOnDueDate` | Adiciona D0 quando `true` |
| `reminderHour` / `reminderMinute` | Horário local preferido, validado no formato de 24 horas |

Em [[Despesas Fixas]], a antecedência é cumulativa:

- `1` agenda D-1;
- `2` agenda D-2 e D-1;
- `3` agenda D-3, D-2 e D-1;
- `reminderOnDueDate: true` acrescenta D0 a qualquer uma das opções.

O versionamento é deliberadamente opt-out: um template criado por implementações anteriores não volta a notificar apenas por possuir `reminderEnabled` antigo. O usuário precisa abrir o formulário, ativar a nova configuração e salvá-la com `reminderConfigVersion: 1`.

### Migração do legado

Na primeira inicialização da nova versão, `ensureLegacyNotificationMigration()`:

1. cancela todas as agendas visíveis ao agendador `expo-notifications` atual;
2. remove os mapas AsyncStorage do motor Expo antigo e do Notifee;
3. exclui os canais Android legados `mandatory-expenses`, `mandatory-gains` e suas versões `v2`/`v3-notifee`;
4. grava `@lumusNotifications:legacy-cleanup-v1=complete` para não repetir a limpeza.

Como o pacote Notifee e seus handlers também foram removidos do build nativo, não existe mais código capaz de entregar ou renovar suas agendas antigas; a exclusão dos canais completa o bloqueio desse caminho legado no Android.

Depois dessa migração, apenas agendas com marcador `lumus-mandatory-reminders-v1` e os canais Expo atuais são gerenciados pelo serviço.

## Canais Android e builds

- `payment-reminders-v1` — lembretes de pagamentos;
- `income-reminders-v1` — lembretes de recebimentos.

Os dois canais usam importância alta, som padrão, vibração, luz e conteúdo privado na tela bloqueada. `app.json` declara o plugin `expo-notifications`, o canal padrão `payment-reminders-v1` e `android.permission.POST_NOTIFICATIONS`.

Android API 24–25 não oferece canais de notificação. Nessas versões o serviço agenda normalmente, sem bloquear lembretes.

Antes de confirmar um agendamento, o serviço relê a importância do canal. Canal desativado pelo usuário gera `channel-disabled`, não um falso sucesso.

O projeto não solicita `USE_EXACT_ALARM` nem `SCHEDULE_EXACT_ALARM`. O horário escolhido é uma preferência entregue ao agendador do Android; economia de bateria, Doze ou decisões do fabricante podem atrasar a apresentação. A UI e o feedback não devem prometer precisão absoluta de minuto.

`expo-dev-client` faz parte do projeto e o perfil `development` do `eas.json` gera development client interno. `preview` gera APK para instalação manual, enquanto `production` gera AAB para a Play Store. Qualquer alteração no plugin, manifesto, canais padrão ou dependência nativa exige um novo build.

## Validação

### Validação em aparelho

Expo Go serve apenas como smoke test do fluxo JavaScript: se o módulo de notificações não estiver presente nesse host, o app deve abrir com lembretes indisponíveis. Para validar a entrega real, configure um lembrete de despesa ou receita obrigatória e confirme o comportamento em development build instalado e, depois, no build de produção — incluindo permissão, canal e execução em segundo plano.

A central opcional **Testes do aplicativo** pode disparar uma notificação imediata local por `sendLocalNotificationTest()` e um push remoto por `sendLinkedDevicesNotificationTest`. O teste remoto não altera dados financeiros e informa quantos aparelhos aceitaram o envio; a entrega visual continua exigindo development/production build instalado em cada aparelho.

### Testes automatizados

- `tests/mandatoryReminderConfig.test.ts` cobre normalização, combinações cumulativas D-3/D-2/D-1/D0, opt-out do legado e resumo visual.
- `tests/mandatoryReminderNotifications.test.ts` usa mock de `expo-notifications` e data fixa para validar canais/migração, Android sem canais (API 24–25), permissão, recuperação após autorização, datas concretas, virada de mês/ano, dias úteis, ciclo concluído, reconciliação, limites globais Android/iOS, prioridade justa, falha parcial do agendador, escopo/limpeza por UID, rollback/finalização do logout e o disparo imediato manual sem agenda adicional.
- `tests/notificationsRuntime.test.ts` simula a ausência do módulo nativo e garante que o fallback não derrube a inicialização.
- Rode com `npm test -- --runInBand`.

Os testes Jest validam as regras e chamadas do serviço, mas não substituem a matriz manual em aparelho Android real.

## Alertas in-app

1. `components/uiverse/notifier-alert.tsx` centraliza a API de feedback in-app. Android/iOS usam `react-native-notifier`; o Web resolve `notifier-alert.web.tsx` e apresenta `Alert` do Mantine em um portal anexado ao `document.body`.
2. A API pública é `showNotifierAlert({ title?, description, type, duration?, isDarkMode?, ... })`.
3. Tipos suportados: `error`, `warn`, `info`, `success`.
4. No Web, o alerta aparece fixo no canto superior direito, entra horizontalmente pela direita com `AnimatedContent`, retorna para a direita ao fim da duração configurada e só então é removido. Android/iOS continuam sob `notifier-boundary.tsx`; `notifier-boundary.web.tsx` não monta o wrapper nativo, evitando o visual padrão no navegador.
5. Novos fluxos devem reutilizar esse canal visual e não criar sistemas paralelos de toast/alerta.

## Arquivos principais

- `utils/localNotifications.ts` — Bootstrap, canais, permissão e limpeza legada.
- `utils/notificationsRuntime.ts` / `.web.ts` — Carregamento seguro do módulo nativo e contrato Web indisponível sem importar `expo-notifications`.
- `utils/platformCapabilities.ts` — Contrato central que distingue alarmes nativos instalados da capacidade Web.
- `utils/mandatoryReminderConfig.ts` — Schema v1, normalização, offsets cumulativos e resumo.
- `utils/mandatoryReminderNotifications.ts` — Motor compartilhado de datas concretas, persistência, agenda e reconciliação.
- `utils/mandatoryReminderAccountSync.ts` — Normaliza Firestore e restaura despesas/receitas automaticamente após autenticação.
- `utils/mandatoryExpenseNotifications.ts` / `utils/mandatoryGainNotifications.ts` — Wrappers de despesas e receitas.
- `utils/remoteNotifications.ts` — Registro privado de Expo Push Token e chamada do teste remoto.
- `backend/src/index.ts` — Callable de teste e gatilhos confiáveis de alteração das recorrências.
- `app/_layout.tsx` — Bootstrap e ponte de autenticação/foreground.
- `components/uiverse/navigator.tsx` — Limpeza síncrona da autoridade do UID antes do logout explícito.
- `components/uiverse/notifier-alert.tsx` — Feedback in-app.
- `components/uiverse/notifier-alert.web.tsx` — Ponte Web e apresentação Mantine do feedback in-app.
- `components/uiverse/notifier-boundary.tsx` / `.web.tsx` — Mantém o wrapper nativo fora do navegador.
- `tests/mandatoryReminderConfig.test.ts` / `tests/mandatoryReminderNotifications.test.ts` — Cobertura automatizada.

## Integrações

- [[Despesas Fixas]] — Configuração cumulativa de lembretes de pagamento.
- [[Receitas Fixas]] — Lembrete de recebimento no dia e supressão do ciclo recebido.
- [[Autenticação]] — Ativa a agenda pelo UID, preserva cold start memory-only e limpa em logout explícito/troca de conta.
- [[Componentes UI]] — Resumo de lembrete no calendário e alertas in-app.

## Observações importantes

- Lembretes de vencimento são locais: desinstalar o app apaga as agendas nativas e o mapa local. O token remoto também deixa de ser válido e é removido quando o Expo reportar `DeviceNotRegistered`.
- Sem permissão concedida, o template financeiro ainda pode ser salvo, mas o app informa que o lembrete não foi agendado.
- Sem módulo nativo de notificações, o app mantém lembretes como indisponíveis e não tenta solicitar permissão nem criar alarmes; instalar o development build restaura o motor nativo.
- No navegador, essa indisponibilidade é permanente e intencional: não oferecer push Web, canal, alarme ou diálogo de permissão como substituto dos lembretes de aplicativos instalados.
- Alterações feitas enquanto a permissão está bloqueada cancelam agendas nativas antigas; quando a permissão volta, entries sem agenda ignoram o throttle diário e são reidratadas no próximo foreground/login.
- Quando a capacidade segura é insuficiente, o motor preserva a próxima ocorrência de cada template antes de alocar repetições futuras. O formulário informa agenda reduzida; não ampliar os limites sem nova validação nativa.
- A fila serializada usa epoch/UID em memória: sincronizações ou submits iniciados por uma sessão antiga não podem reativar notificações depois de logout/troca de conta. A limpeza também revalida o epoch após cada leitura assíncrona e é abortada se um UID novo assumir a sessão.
- Órfãos nativos marcados como `lumus-mandatory-reminders-v1` são removidos mesmo quando a entrada correspondente do AsyncStorage foi perdida.
- Entradas locais são normalizadas na leitura; registros estruturalmente inválidos são descartados e metadados de agenda danificados voltam ao estado pendente para recuperação. O fuso atual participa da identidade da agenda, forçando reagendamento após uma mudança de fuso detectada no foreground.
- A agenda respeita início/fim de parcelamento e ignora parcelamentos concluídos.
- Troca de conta e logout explícito não podem deixar lembretes do UID anterior ativos; `user=null` de cold start não equivale a logout explícito.
- Não reintroduzir Notifee, handler `DELIVERED`, canais `v3-notifee` ou um segundo agendador paralelo.
- O serviço deve continuar usando datas concretas; recorrência mensal nativa não representa corretamente dia 29/30/31, dias úteis ou offsets que cruzam meses.
