---
tags: [bancos, saldo, reconciliacao, firebase, formularios, web, mobile]
relacionado: [[Gerenciamento de Bancos]], [[Balanço Mensal]], [[Configurações]], [[Navegação]], [[Previsão de Fluxo de Caixa]], [[Cache e Leituras Firebase]], [[Privacidade de Valores]], [[Auditoria de Design]]
status: ativo
tipo: feature
versao: 1.1.0
spark_module: F05
spark_progress: 75
spark_reviewed_at: 2026-10-23
---

# Ajuste de Saldo

<!-- spark-progress:start -->
## Progresso Spark — 23/10/2026

**F05 — Ajustes e reconciliações: 75% implementado / 25% restante.** Notas P/I/D/E: **100/75/25/75**; cálculo e evidências em [[Status da Implementação Spark]].

O percentual corresponde ao módulo completo, incluindo integração e dados, e não somente ao serviço descrito nesta página. **Próxima entrega:** Conectar assistente, ajustes importados/especiais, restauração integral após reload e homologação; criação/edição/estorno nativos já conectados.

Esta revisão prevalece sobre listas de pendências datadas das entregas anteriores abaixo. Implementação local e logs não aprovam publicação nem migração real.
<!-- spark-progress:end -->

## Ajuste utilizável Web/mobile — 23/10/2026

O hook compartilhado observa o UID pelo AuthContext e identifica abertura/prévia por sessão, rota, banco, data e revisão de recarga. Troca de sessão/rota limpa rascunho e tentativa anterior; carregamento impede usar dados da abertura anterior. Respostas substituídas não publicam base, erro, sucesso ou navegação. Cada seleção recebe um estado Spark próprio, evitando que uma preparação atrasada modifique a operação atual. Edição ausente, resolvida, de outra pessoa ou cujo banco saiu do catálogo bloqueia a entrada; não se converte em criação. Catálogos Spark/razão anterior descartam bancos inativos e arquivados.

**Atualizar prévia** aparece também quando a leitura terminou sem erro: uma prévia completa é descartada e preparada com a posição/revisão atual, conservando saldo informado e descrição. Preparação parcial/pausada mantém seu estado para continuar o histórico; preparar/pausar não confirma dinheiro. Falha de contexto ou preparação Spark nunca libera preview/escritor antigo. Bases inválidas permanecem indisponíveis, sem zero inventado. Catálogo vazio tem orientação e atualização explícita.

Resposta incerta trava banco, valor, sinal, data e descrição, inclusive nos callbacks do hook. **Confirmar ajuste anterior** reutiliza fonte, estado/comando, ID e argumentos capturados; uma falha posterior da prévia não exige alterar o material para recuperar o resultado. Rejeição definitiva conserva o rascunho e renova a preparação. Erros de envio permanecem visíveis junto ao formulário. Saldo negativo Spark valida justificativa de 3 a 500 caracteres e o limite monetário antes do envio; o serviço mantém a validação do saldo atual projetado em ajustes retroativos.

Sucesso confirmado desabilita novos envios e conserva a mensagem **Ajuste confirmado**, com acesso ao extrato enquanto a navegação ocorre. Invalidar o cache fica separado da confirmação financeira, incluindo falhas síncronas: erro de recarga não oferece outro ajuste nem vira falha do commit. Conclusão desfocada não redireciona; UID/rota substituídos não recebem feedback. Recuperação integral após reload continua pendente; o formulário conserva a intenção apenas em memória.

Liberação local `balance-adjustment-2026-10-23` habilita somente `bankBalanceAdjustment` uma vez ao recarregar; outras preferências e desligamentos posteriores permanecem. F05 mantém 75% (100/75/25/75), financeiro 78% e geral 56%. 71 testes focados distintos, tipagem do aplicativo, estilos e diff-check aprovados. Detalhes e roteiro manual em [[Versão Usável por Telas]]. Sem novo aceite visual autenticado, Emulator, export/build, aparelho, deploy ou escrita em dados reais nesta revisão.

## Abertura mensal e ajustes nas telas — 21/10/2026

`SparkBalanceFormFirebase` conecta as duas telas de abertura mensal e o formulário compartilhado de ajuste Web/mobile aos serviços existentes. Contexto Spark é selecionado antes de consultas/escritores antigos; erro, ausência de contexto depois de preparar intenção ou acesso revogado não autorizam fallback. O papel é conferido no grupo protegido e as Rules/serviços continuam exigindo administrador para a conferência. As fachadas antigas recusam mutação/consulta genérica de ajustes Spark, em vez de chamar Functions ou apresentar uma lista antiga vazia.

A abertura mensal usa a identidade canônica banco/ciclo, o início do mês no calendário protegido e o ponteiro da abertura existente. O primeiro envio prepara o histórico; somente outro envio explícito com o mesmo banco/mês/valor confirma. Alterar o material exige reapresentar a preparação. O estado mostra preparação parcial e oferece continuar/pausar; cada chamada trabalha no máximo vinte páginas. As cotas e os limites anteriores permanecem. Pausar não confirma saldo. Se há abertura vencida, a preparação do formulário materializa primeiro a abertura previamente autorizada usando `refreshSparkMonthlyOpeningFirebase`, e só então prepara a nova contagem. A ativação não usa o valor ainda digitado como novo saldo.

`MonthlyBalanceFirebase` lê `sparkMonthlyOpenings` e preserva o ID da operação vigente. A gravação direta antiga é recusada no Spark: somente a ponte com revisão, prova completa e ponteiro esperado pode confirmar. Abertura futura registra o prazo e mantém o saldo atual; a passada/atual conserva movimentos posteriores à referência. Uma segunda confirmação com prévia concorrente fica desatualizada, sem sobrescrever o novo saldo.

O ajuste de hoje sem alvo de edição usa `countSparkAccountFirebase` com revisão esperada e commit do servidor. Retroativos usam o fim do dia civil protegido e uma projeção completa. Edição prepara a base sem o efeito do ajuste anterior e chama `replaceSparkBalanceAdjustmentFirebase`, mantendo o banco, o autor, a data original do inverso e a nova data do substituto. Na edição de hoje, a projeção usa o maior instante entre o início civil e o último commit certificado da posição, preservando nanossegundos e exigindo a mesma revisão; não depende de um relógio do navegador adiantado. Saldo negativo exige motivo de 3–500 caracteres. A interface conserva o rascunho quando a revisão muda e exige atualizar a prévia.

O extrato oferece editar/estornar somente para ajustes nativos vigentes do autor, sujeitos ao papel administrativo revalidado pelo serviço. O ID visual do componente não vira ID executável: o adaptador fornece `sparkAdjustmentOperationId` separado e marca originais resolvidos. Estorno usa claim único, conserva a data efetiva e não altera uma contagem posterior que já cobriu o ajuste. Mensais, referências, inversos e ajustes importados não recebem ações genéricas. Ajustes/estornos permanecem fora dos totais econômicos.

Resposta incerta conserva a intenção e o mesmo ID/material; mudar os argumentos é recusado. Falha ao atualizar as consultas depois do commit não é tratada como falha financeira. Troca de UID impede feedback/navegação da sessão anterior. O progresso no servidor é conservado, mas a interface mantém o identificador da preparação/intenção somente em memória: retomada automática após reload/desmontagem continua pendente. Não declarar ativação/consentimento/corte de contas reais, nem integração do assistente, como concluídos por esta entrega.

Evidências: `.expo/spark-balances-closed-check.log` (estilos/tipos, 104 testes de ferramentas e 966 comuns; 89 condicionais ignorados); `.expo/spark-balances-sdk-rules-ordered.log` (13 cenários Auth/Firestore/Rules, zero ignorados); exports finais em `.expo/spark-balances-web-final.log` e `spark-balances-android-final.log`, com resultado registrado no fechamento abaixo. Os cenários cobrem revisão concorrente, reenvio, mensal atual/futuro, preparação parcial/pausa/retomada, ativação vencida, edição/estorno retroativos e atuais, tipo de papel, revogação, motivo negativo e dia impossível. A edição de hoje com alvo negativo expôs esgotamento de 1.000 expressões; `validSparkOperation` agora seleciona `adjustment_replacement` logo depois dos contratos ordinários, com o mesmo papel, schema e validador. A justificativa é enviada somente quando o alvo ou saldo atual projetado fica negativo. Treze cenários dirigidos, 1.037 cenários Spark e cinco suítes anteriores de Rules passaram nesta continuação, em projetos de teste distintos da demonstração aberta. Logs de falha preservados em `.expo/spark-balances-sdk-closed.log`/`spark-balances-sdk-budget.log`; resultado corrigido em `.expo/spark-balances-sdk-rules-ordered.log` e regressão em `.expo/spark-balances-rules-regression.log`. A ferramenta de navegador bloqueou a aquisição da aba por política de segurança; esta continuação não possui ensaio visual novo nem aparelho instalado. Sem dados reais, cobrança, migração ou publicação.

Prova Spark v0.5 em desenvolvimento: [[Protocolo Financeiro Spark]] implementa ajuste atual/retroativo, substituição atômica e estorno único. `SparkAdjustmentReplacementFirebase.ts` exige o mesmo banco e autor ainda administrador, calcula a base sem a contribuição antiga elegível e grava evento composto com inverso na data antiga e substituto na nova. Claim único compartilhado impede substituir e estornar o mesmo original. É possível substituir o componente novo de um substituto e depois estorná-lo, sem desfazer novamente inversos anteriores. Projeção pelas Rules confere ambas as datas, abertura elegível, fim do dia passado São Paulo ou commit de hoje e referências posteriores. Originais permanecem imutáveis; estado substituído/revertido é derivado do claim. Bootstrap, adaptação do extrato/formulário/chat e integração desta prova permanecem pendentes; os serviços publicados descritos abaixo continuam sendo o caminho atual. Ver [[Reconciliação de Dados Spark]].

Recurso de último caso para registrar a diferença entre o saldo calculado no Lumus e o saldo real conferido pelo usuário no banco. O aplicativo não consulta nem altera a conta da instituição financeira.

## Como funciona

1. Abrir **Configurações → Relações dentro do Aplicativo → Ajuste de saldo** no Web ou mobile.
2. Escolher um banco ativo, informar seu saldo real em reais, a data e uma descrição opcional. O seletor de banco mantém altura mínima de controle e cresce para acomodar ícone, nome e descrição, no mesmo padrão visual do registro de despesas. Quando a prévia está pronta, o saldo calculado no Lumus aparece centralizado em uma extensão recuada nas laterais e ligada ao contorno inferior do seletor, cuja borda fica visualmente à frente da extensão; após informar o saldo real, a extensão ligada ao campo mostra a diferença a registrar e mantém o carregamento, erro e atualização da prévia no mesmo lugar, sem card separado. O hero das duas plataformas usa a altura proporcional/mínima compartilhada mais o inset superior, e o sheet mantém a sobreposição de 64 px. O botão de sinal permite informar saldo negativo com o teclado numérico; nesse caso a descrição exige pelo menos três caracteres.
3. A callable calcula a prévia com dados autorizados do servidor. Todos os cálculos e valores persistidos são centavos inteiros seguros.
4. O registro contém somente `saldo informado − saldo calculado`. Com R$ 100,00 no Lumus e R$ 120,00 informados, é registrado **+R$ 20,00**. Se o saldo informado for R$ 80,00, o registro será **−R$ 20,00**.
5. A diferença afeta o saldo bancário, mas nunca os totais, médias ou gráficos de ganhos/despesas. O saldo-base da previsão de caixa incorpora ajustes posteriores à abertura da conta.
6. Salvar compara o saldo atual da prévia; se outro lançamento alterar a base, o servidor rejeita a operação e o formulário atualiza a prévia sem apagar o rascunho.
7. Um `clientActionId` identifica a tentativa. Recibos atômicos impedem duplicação por repetição/reconexão; uma resposta incerta conserva o mesmo comando para nova tentativa.
8. O sucesso invalida o cache financeiro e retorna ao extrato do banco, no mês da data escolhida, usando uma única navegação diferida. Conclusões de formulário desfocado não redirecionam a tela atual.

## Data e saldos de abertura

- A data é civil de **America/Sao_Paulo**. Hoje usa o instante da confirmação; datas passadas usam o fim daquele dia. Datas futuras e inválidas são rejeitadas no servidor.
- O usuário deve informar o saldo ao final do dia quando escolher uma data passada. Movimentações posteriores continuam sendo somadas/subtraídas normalmente.
- No legado, a base é o `MonthlyBalance` mais recente até a data, com corte no início do mês em São Paulo, acrescido de ganhos e ajustes e descontado de despesas, saques e investimento inicial. Sem abertura, o formulário orienta registrá-la primeiro.
- No razão, a base é o saldo atualizado de `financialAccounts`, descontadas as movimentações posteriores à data. A ação exige administrador do grupo ativo e conta bancária ativa; datas anteriores ou iguais à abertura mais recente não são aceitas.
- Uma abertura posterior estabelece uma nova referência. Reverter um ajuste histórico anterior a essa abertura preserva a correção do histórico sem alterar o saldo contado na abertura posterior.

## Edição, reversão e extrato

- Os dois `BankMovementsScreen` mostram o ajuste em **magenta**, definido em `LUMUS_BALANCE_ADJUSTMENT_TONE`, com ícone próprio, descrição, diferença assinada e saldos anterior/informado.
- Ajustes e estornos aparecem em **Todos**. Os filtros **Ganhos/Despesas**, os totais e o gráfico diário usam `shouldIncludeMovementInGainExpenseTotals` para excluí-los.
- Somente o autor pode editar/reverter um ajuste ativo original, sujeito às permissões e conta ativa. Estornos e registros substituídos/revertidos não oferecem alteração.
- A edição mantém o banco, calcula a base sem o ajuste anterior, registra seu inverso e cria um novo ajuste na mesma transação. O documento anterior recebe status `replaced`.
- A reversão cria um inverso na **mesma data efetiva do original**, que recebe status `reversed`. Isso evita descontar um ajuste antigo novamente após um snapshot posterior. `createdAt`/`reversedAt` preservam o instante em que o estorno foi confirmado.
- Eventos não são apagados. Os lançamentos anteriores, inversos e substituições continuam visíveis para auditoria.
- O card **Saldo atual** lê o saldo completo da conta, independentemente do período filtrado. No razão, o extrato alcança contas novas e migradas; outros lançamentos imutáveis são somente leitura pelos controles legados.

## Persistência e permissões

`bankBalanceAdjustments/{personId_clientActionId}` contém:

| Campo | Regra |
|---|---|
| `bankId`, `personId`, `groupId` | Conta, autor e grupo derivado da sessão; grupo nulo no legado |
| `date` | Data efetiva escolhida |
| `differenceInCents` | Diferença assinada |
| `previousBalanceInCents`, `targetBalanceInCents` | Base calculada e saldo informado |
| `description` | Motivo opcional, máximo 2000 caracteres |
| `status` | `active`, `reversed` ou `replaced` |
| `reversesAdjustmentId`, `replacesAdjustmentId` | Vínculos do histórico |
| `ledgerTransactionId` | Evento correspondente no razão, quando houver diferença não zero |
| `createdAt`, `reversedAt`, `reversedBy`, `reversalId` | Auditoria da confirmação/reversão |

`bankBalanceAdjustmentOperations` guarda recibos privados da callable. O cliente não pode escrever nas duas coleções nem ler os recibos. Ajustes são legíveis pelo autor, pelos usuários relacionados autorizados ou pelos membros de seu grupo.

No razão, a transação também grava uma `ledgerTransaction` balanceada de `reconciliation_adjustment`/`reversal`, atualiza `financialAccounts.currentBalanceInCents`, incrementa o mapa `bankDeltaInCents` do resumo mensal e grava `financialAuditEvents`. Nenhum snapshot novo é criado. O estorno genérico de `reverseTransaction` rejeita eventos deste recurso para impedir um segundo caminho de reversão sem atualizar o histórico dedicado.

O dry-run/backfill de migração incorpora os ajustes legados e seus inversos como diferenças assinadas, com referências à coleção original. O filtro temporal da reconciliação evita reaplicar ajustes anteriores ao saldo de abertura migrado.

## Arquivos principais

- `screens/mobile/BankBalanceAdjustmentScreen.tsx` / `screens/web/BankBalanceAdjustmentScreen.web.tsx` — composições de plataforma.
- `components/uiverse/banks/bank-balance-adjustment-form.tsx` — formulário compartilhado, controles existentes de banco/data e prévia.
- `hooks/useBankBalanceAdjustmentForm.ts` — abertura, validação, prévia, draft, locks e retry.
- `functions/BankBalanceAdjustmentFirebase.ts` — comandos e leitura autorizada do histórico.
- `backend/src/bankBalanceAdjustments.ts` — callable `bankBalanceAdjustment`, região `southamerica-east1`.
- `utils/bankBalanceAdjustment.ts` / `utils/monthlyBalance.ts` — diferenças e regras de saldo/totais.
- `assets/UnDraw/bankBalanceAdjustmentScreen.svg` — ilustração fornecida, renomeada de `undraw_printing-invoices_g6c9.svg`.
- `tests/bankBalanceAdjustment*.test.ts` / `backend/tests/bankBalanceAdjustments.emulator.test.ts` — cálculos, retry, preservação do draft, integração e regras.

## Navegação, privacidade e configuração

- Rotas `/mobile/bank-balance-adjustment` e `/web/bank-balance-adjustment` registradas em `APP_ROUTE_PATHS` e protegidas pelo guard autenticado derivado do registro central.
- Entrada pela seção de relações e edição pelo extrato; não há novo item no navigator.
- O formulário não exibe botão **Voltar**; o retorno continua disponível pela navegação do aplicativo e pelo botão físico no Android.
- O CTA usa o foreground escuro `lumus-on-accent` pelo contrato `LUMUS_CLASS_NAMES.primaryButtonText`, sobre o amarelo do tema.
- Este fluxo de conferência tem retorno fixo ao extrato com `bankId`, `bankName` e `focusDate`, sem preferência de limpeza/permanência em [[Comportamento Pós-Registro]]. O histórico precisa ser revisável imediatamente após a confirmação; não usa `router.back` como pós-submit.
- A prévia, detalhes e PDF do extrato respeitam [[Privacidade de Valores]]. Com valores ocultos, a edição exige digitar o saldo real novamente, sem expor o valor anterior no campo.
- Antes de liberar o cliente em produção, publicar a callable, as regras e os índices financeiros versionados. Não há nova dependência, Remote Config nem serviço externo. A implementação foi validada localmente, sem deploy remoto.

## Validação e limites

Cálculos, migração, forecast, retry e navegação passaram em 46 testes focados; testes de Emulator cobrem ganhos posteriores, saldo divergente positivo/negativo, edição, estorno, recibos repetidos/concorrentes, bloqueio de saldo stale, autenticação e acesso indevido. O atalho em Configurações abriu o formulário no navegador local; prévia e validação de saldo negativo também foram verificadas, inclusive em largura de celular. Bundles Web e Android de produção e Android de desenvolvimento foram gerados.

Não houve execução instalada Android/iOS nem medição de Core Web Vitals: o conector Chrome DevTools requerido pela skill `cloudflare:web-perf` não estava disponível. O lint de estilos permanece bloqueado somente por dívida anterior de `ConfigurationsScreen.web.tsx`; a suíte completa mantém duas falhas anteriores de perfil/login. Ver [[Auditoria de Design]] para evidências e riscos residuais.

## Integração conversacional — 2026-10-03

O chat usa a mesma callable `bankBalanceAdjustment` das telas para salvar, substituir ou estornar. A proposta é versionada, confirma o efeito por mensagem e envia a identidade do pedido, `expectedActorId`, `expectedFingerprint` do ajuste e saldo anterior esperado. O servidor consulta o recibo antes do documento já alterado pelo próprio commit, compara um fingerprint SHA-256 de todos os argumentos materiais e recusa reenvio que mude valor, data, descrição, alvo ou saldo esperado. Troca tardia de UID, saldo stale, banco inativo e papel insuficiente não gravam. O teste real `bankBalanceAdjustments.emulator.test.ts` cobre legado/razão, retry concorrente, argumentos alterados, substituição/estorno e revalidação de identidade. Ver [[Comandos Financeiros Conversacionais]].
