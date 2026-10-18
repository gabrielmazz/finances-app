---
tags: [planejamento, firebase, spark, firestore, seguranca, release]
relacionado: [[Viabilidade do Plano Spark]], [[Firebase Config]], [[Processo de Release]], [[Comandos Financeiros Conversacionais]], [[Gerenciamento de Usuários]], [[Notificações]], [[Auditoria do Processo de Release]]
status: em desenvolvimento
tipo: arquitetura
versao: 2.9.0
---

# Plano de Funcionalidade Completa sem Blaze

Direção confirmada pelo proprietário em 16/10/2026: manter o sistema no Firebase Spark, sem Blaze e sem servidor externo, recuperando ou redesenhando as operações que antes usavam Firestore diretamente. Esta versão substitui a proposta anterior de API Node externa. Render, Worker/agendador externo e hospedagem alternativa não fazem parte deste plano.

A meta é preservar os recursos e dados, não publicar uma versão reduzida. A implementação local começou pelo [[Protocolo Financeiro Spark]], com serviço, Rules e testes em dados sintéticos. Nenhuma configuração remota, credencial ou dado real foi alterado. Funcionalidade ou garantia ainda não demonstrada permanece pendente; não será desabilitada silenciosamente para declarar sucesso.

## Base histórica identificada

| Referência | Evidência no Git | Uso no trabalho |
|---|---|---|
| `9d3984e`, 24/07/2026 | Não há `backend/` versionado; busca de `httpsCallable`/`firebase/functions` nos serviços não encontrou referências. Transferências usam `writeBatch` e investimentos têm gravações diretas. | Base inicial para comparação de fluxos sem Functions. Não comprova qual versão foi efetivamente publicada ou a segurança de todos os caminhos. |
| `67b62fc`, 11/08/2026 | Introdução de `backend/src/index.ts` e do núcleo do razão. | Distinguir compatibilidade legada de contas já migradas. |
| `70ebfc5`, 01/10/2026 | Introdução de `bankBalanceAdjustments.ts`. | Ajustes de saldo são recurso posterior, sem equivalente completo na base de julho. |
| `bf70099`, 04/10/2026 | Introdução de `legacyFinancialMovements.ts` e `userRelationships.ts`. No pai desse commit, transferências ainda usam batch direto. | Comparar a centralização de movimentos legados e vínculos com o fluxo anterior. |
| `1f7572d`, 12/10/2026 | Introdução de `accountDeletionRequests.ts` e mudanças de sessão/segurança. | Preservar as correções de autorização e tratar o pedido de exclusão separadamente. |

Não foi feito checkout, reset ou restauração desses commits. A última versão publicada com sucesso precisa de evidência de deploy/build do proprietário; o Git oferece candidatos de comparação, não comprovação de funcionamento remoto. Não restaurar a aplicação inteira nem Rules antigas para remover dependências recentes.

### Matriz das quinze callables e dois gatilhos

Em `9d3984e`, foram identificados os métodos diretos de bancos/saques/transferências, CRUD e sincronização/desfazimento de investimentos, categorias, pagamento/recebimento de recorrências e vínculos/exclusão de usuários. A existência desses métodos não comprova garantias de concorrência, consentimento ou ausência de perda de dados na versão antiga.

| Export atual | Comparação com a base direta | Substituição e situação inicial |
|---|---|---|
| `postMovement` | Despesas/receitas existiam em coleções legadas; evento/posição do razão são posteriores. | Evento externo e posição atômicos, com categoria e recibo; pendente. |
| `transferFunds` | `transferBetweenBanksFirebase` usava batch no legado. | Dois saldos/revisões, evento/recibo e cota; prova sintética de transferência/aporte/resgate implementada, sem paridade histórica ainda. |
| `correctMovement` | Edição legada não equivale a estorno e substituição imutáveis do razão. | Estorno único + reposição + efeito final validados juntos; pendente. |
| `reverseTransaction` | Havia desfazimentos específicos em investimentos. | Estorno único de transferência/aporte/resgate provado; demais tipos e datas de execução ainda pendentes. |
| `reconcileAccount` | Snapshot mensal legado não equivale à reconciliação do razão. | Contagem atual/passada e abertura mensal canônica passada/atual/futura demonstradas; ativação por membro após vencimento e leitura guardada no servidor provadas. Bootstrap e integração do razão/leitores pendentes. |
| `manageFinancialMetadata` | Tags e definições recorrentes tinham CRUD direto. | CRUD protegido, referências/ciclos e exclusão consistente; pendente. |
| `completeFinancialRecurring` | Pagamentos/recebimentos já criavam movimentos no legado. | Ciclo único e movimento real, posição e recibo atômicos; pendente. |
| `manageAccount` | Bancos e investimentos tinham criação/edição direta. | Abertura zero concorrente e abertura mensal canônica por conta/ciclo, inclusive futura, provadas; cadastro completo, financiamento, metadados, arquivamento e demais operações com datas futuras pendentes. |
| `rebuildFinancialReadModels` | Não havia razão versionado nessa base. | Reconciliar modelos derivados; ferramenta administrativa local controlada ou protocolo provado, sem servidor permanente; pendente. |
| `migrateFinancialGroup` | Não havia corte legado→razão nessa base. | Analisador local de snapshots legado/razão implementado em [[Reconciliação de Dados Spark]]. Inventário remoto, consentimento, bootstrap, restauração e corte único pendentes. Não restaurar escrita legada de migrados. |
| `executeLegacyFinancialMovement` | Centralizou transferências, saques e investimentos antes diretos. | Preservar saldo civil, relações e desfazimentos; depende da prova de posições históricas, pendente. |
| `bankBalanceAdjustment` | Módulo introduzido depois da base, sem equivalente integral identificado. | Ajuste atual/retroativo, substituição atômica com duas datas, substituição sucessiva e estorno com referência posterior provados. Claim compartilhado impede resolver duas vezes; mesmo banco/autor e admin obrigatórios. Integração do fluxo/extrato e bootstrap dos ajustes existentes pendentes. |
| `userRelationship` | Havia alteração direta de relações nos perfis. | Convite, aceite, grants e revogação sem autoatribuição; pendente. Remoção de membro na prova não conclui esse fluxo. |
| `financialMigrationConsent` | Controle posterior ligado à migração. | Aprovação/revogação pelo próprio membro e corte específico; pendente. |
| `requestAccountDeletion` | Existia `deleteUserFirebase`; não equivale ao pedido atual com retenção. | Solicitação restrita ao UID e processamento controlado; pendente, sem declarar exclusão integral. |
| `notifyMandatoryExpenseChange` | Gatilho remoto posterior; lembrete local é recurso distinto. | Push com todos os clientes fechados depende de executor confiável; incompatibilidade em aberto. |
| `notifyMandatoryGainChange` | Mesma distinção entre gatilho remoto e lembrete local. | Mesma incompatibilidade, sem trocar silenciosamente por listener/inbox. |

Auth/cadastro/perfil, AI Logic, Remote Config, voz e lembretes locais continuam no escopo de homologação multiplataforma, mesmo sem uma dessas quinze callables como transporte principal.

## Arquitetura de destino

- Firebase Auth continua responsável por identidade e sessão; Firestore continua como banco, com Rules e índices versionados. Hosting e builds mantêm seus papéis atuais. AI Logic continua condicionado à disponibilidade de modelo/cota gratuita e atestação real.
- Serviços do cliente passam a preparar e executar transações Firestore com protocolo validado pelas Rules. A regra de segurança, não o JavaScript da interface, deve conferir propriedade, papel, consentimento e efeito financeiro.
- Cada comando financeiro possui identidade estável, argumentos materiais, evento/recibo imutável e efeitos atômicos. Não gravar saldo isoladamente nem permitir reutilizar um recibo antigo para aplicar novo débito/crédito.
- Reutilizar cálculos em centavos, esquemas, datas civis, autorização conversacional e componentes já existentes. O diretório `functions/` contém serviços cliente e deve permanecer. `backend/` fica como referência e teste durante a transição; sua remoção não é a primeira etapa.
- Legado e razão continuam identificados. Não apagar `financialCutovers`, `financialGroupId`, papéis ou histórico para fazer uma conta migrada voltar ao legado.

## Etapas e critérios de saída

| Fase | Entrega concreta | Critério de conclusão |
|---|---|---|
| 0 — Comparação histórica | Matriz de cada operação antiga/atual, mudanças de segurança, armazenamento e dependências | Todas as quinze callables e dois gatilhos classificados; identificar o que existia antes e o que é recurso novo. |
| 1 — Prova do protocolo | Transação e Rules para operações críticas em dados sintéticos | Concorrência, replay, permissão e correção retroativa demonstrados com Auth/Firestore e Functions desligadas, dentro dos limites de Rules. |
| 2 — Compatibilidade de dados | Inventário autorizado, snapshot e plano de inicialização/migração | Reconciliação exata de legado/razão, restauração ensaiada e nenhuma mudança de dados reais sem procedimento revisado. |
| 3 — Núcleo financeiro | Serviços Firestore compartilhados por formulário e chat | Todas as operações, inclusive ajustes e investimentos, com efeitos, saldos e recibos equivalentes aos contratos aprovados. |
| 4 — Usuários e privacidade | Convite, aceite, revogação, consentimento e exclusão solicitável | Nenhum cliente altera papel unilateralmente; compartilhamento exige consentimento e revogação funciona. |
| 5 — Integração completa | Web/mobile, IA, voz, consultas, notificações e recuperação | Mesmas regras em todas as entradas; classificar explicitamente os casos que exigem execução com apps fechados. |
| 6 — Release Spark | Scripts, testes, Rules/índices, Hosting e builds | Publicação não tenta Functions/Cloud Build/Artifact Registry; auditorias e validações pertinentes continuam obrigatórias. |
| 7 — Homologação e transição | Matriz de recursos, dados reconciliados e plano de reversão | Aprovação por recurso em ambiente isolado e aparelho; nenhuma pendência apresentada como funcionalidade concluída. |

## Fase 1: provar segurança antes de portar tudo

Prototipar transferência, aporte/resgate, abertura concorrente, ajuste retroativo e revogação. São os casos que melhor expõem se o protocolo preserva as garantias atuais. Usar emuladores locais, sem gravar em produção nem depender de Admin SDK no aplicativo.

Especificar documentos canônicos de conta/posição, abertura/período, operação, inversão e recibo. Cada tipo deve ter conjunto limitado e conhecido de documentos relacionados, com campos permitidos e validação cruzada por `getAfter`. As Rules não podem confiar em um hash ou total enviado pelo cliente: devem conferir os argumentos e efeitos materiais, revisões e origem dos valores. Um novo efeito exige uma nova operação criada na mesma transação; o recibo imutável não autoriza aplicar novamente seus efeitos.

Validar débito/crédito, ausência de contrapartida, alteração parcial, sobreposição de duas sessões, saldo insuficiente conforme a política do domínio, estorno duplicado, valor fora do limite inteiro, conta inativa e acesso por terceiro. Papéis vêm de documentos protegidos; uma justificativa de saldo negativo não substitui a autorização exigida pelo domínio.

O handler atual consulta seis coleções dentro de uma transação Admin. Não copiar essas consultas para antes de uma transação cliente e chamar isso de equivalência. A posição usada para autorizar uma operação deve ter origem verificável no protocolo novo. Correções em datas antigas, aberturas posteriores e resumos exigem modelagem própria; não prometer que Rules conseguem somar um histórico arbitrário por consulta.

Há limites de dez acessos por operação e vinte por transação/lote, além de limites de expressões e tamanho de documento. Medir todos os caminhos permitidos e negados, inclusive com grupos e vínculos. Fonte: [condições de Rules](https://firebase.google.com/docs/firestore/security/rules-conditions). Se uma garantia não couber em um protocolo limitado, registrar a incompatibilidade e redesenhar antes de liberar a escrita; não abrir `allow write` genérico.

Cota por UID/operação, quando preservada, deve participar da transação e ser validada com tempo do servidor nas Rules. Contador voluntário no aparelho não é proteção. Uma negação genérica do Firestore não fornece os metadados de erro da callable: revisar a espera/retomada sem tratar toda negação como cota nem repetir resultado incerto automaticamente.

## Fase 2: preservar e preparar os dados existentes

Identificar por projeto/conta os grupos, papéis, marcadores de corte, relações aceitas, aberturas duplicadas, saldos, ajustes e recibos. Estado desconhecido ou falha de rede não autoriza trocar o modelo de armazenamento. Não houve esse inventário remoto nesta etapa.

Criar snapshot revisado e procedimento compatível com Spark; backup gerenciado não é pressuposto. Calcular e reconciliar as posições canônicas, por conta e período, contra os dados antigos e atuais. Inicializar um saldo obtido de histórico ilimitado não pode depender apenas da soma afirmada pelo app. Se necessário, usar ferramenta administrativa local, controlada e auditável para a inicialização, sem servidor permanente e sem embutir credenciais no cliente. Essa manutenção precisa de autorização específica antes de tocar dados reais.

Para contas no razão, preservar contas, eventos originais, atores, saldos, operações e histórico de reversão. Para contas legadas, preservar transações, abertura mensal, parcelas, investimentos e suas referências. Novos campos/coleções devem ser aditivos e ter versão explícita. Antes do corte de escrita, comparar saldo atual e histórico, sem duplicar a abertura nem recontar movimentos importados.

Definir uma transição única por conta/grupo, com bloqueio de escritores antigos quando exigido. Não permitir que clientes antigos continuem escrevendo sem atualizar documentos canônicos obrigatórios. Falha de migração conserva checkpoint e impede escrita divergente; não limpar marcadores para destravar a interface.

## Fase 3: paridade de operações

| Família | Trabalho e prova obrigatórios |
|---|---|
| Bancos/aberturas | Cadastro e abertura consistentes; identidade por banco/período, transação concorrente e tratamento explícito de duplicados existentes. |
| Despesas/receitas | Criar, editar e excluir conforme modelo, com posição e recibos coerentes; preservar tratamento de lançamentos especiais. |
| Transferências/Caixa | Contrapartidas e débito/crédito atômicos; não inflar receitas/despesas e não criar dinheiro em replay ou cancelamento. |
| Investimentos | Criação, mudança de principal/banco, aporte, resgate, sincronização e desfazimentos; preservar saldo da posição e do banco. |
| Recorrências/parcelas | Definição, pagar/receber, antecipar, quitar, desfazer e histórico por ciclo; parcelas e valores em centavos. |
| Ajustes de saldo | Prévia verificável, concorrência stale, salvar/substituir/estornar e efeito correto antes/depois de aberturas posteriores. |
| Categorias/CDI | CRUD com referências válidas, cotação manual e impedimento de exclusão inconsistente. Verificação apenas por query no app não substitui invariante nas Rules. |
| Razão/resumos | Eventos imutáveis, posições, reconciliações e resumos por período coerentes; sem voltar à escrita legada de usuário migrado. |

Revisar todas as formas de alterar um documento: formulário, chat, helper, edição, exclusão, sincronização e reenvio. Um índice/contador de referências só protege exclusão se todas as criações/alterações de referência forem obrigadas pelas Rules a atualizá-lo; histórico preexistente exige inicialização conferida.

## Fases 4 e 5: usuários, interfaces e automação

Redesenhar convites/grants para permitir que cada participante faça somente sua parte autorizada. Não liberar escrita de perfil alheio, lista recíproca ou papel. O aceite precisa de convite válido, identidade correta e estado verificável; o unlink deve retirar a autoridade de leitura de quem perdeu acesso, inclusive durante uma operação preparada. Adequar queries ao novo contrato; ocultar dados no aplicativo não revoga permissão no Firestore.

Preservar nome/perfil, sessão de oito horas e troca de UID. O pedido de exclusão pode ser uma solicitação autenticada restrita ao próprio UID, mas exclusão completa depende de inventário, retenção e procedimento aprovado. Não apagar Auth/perfil primeiro nem declarar `pending-retention-policy` como exclusão concluída. Consentimento e migração também precisam de autoridade verificada no protocolo cliente/Rules; tarefas administrativas eventuais podem ter ferramenta local, sem API permanente.

Unificar serviços de Web/mobile e assistente. Manter confirmação da versão atual, grant local por sessão, dependências, execução por item, cancelamento, reconciliação de resposta perdida e IDs estáveis. A autorização de segurança continua nas Rules. Não disponibilizar um botão ou ferramenta que apenas termine em erro de callable ausente. Firebase AI Logic é separado da execução financeira e depende de modelo/cota/atestados disponíveis no Spark.

Lembretes locais continuam no aplicativo instalado. Uma caixa de eventos no Firestore pode permitir atualização em tempo real e recuperação quando o destinatário abrir o app, desde que protegida por consentimento e com conteúdo mínimo. Isso não equivale a push do sistema com todos os aplicativos fechados.

**Pendência técnica explícita:** o push remoto atual é emitido por dois gatilhos de servidor. Sem Functions, servidor externo ou outro executor confiável, não há código do aplicativo executando para enviar esse push quando todos os clientes estão fechados. Não expor credenciais de envio no app, não prometer que um listener permanece ativo e não trocar esse recurso silenciosamente por aviso ao abrir. A equivalência exata desse comportamento entra como condição de viabilidade; se permanecer incompatível com as restrições, apresentar a decisão ao proprietário antes de declarar o plano integral concluído.

## Fases 6 e 7: validar e publicar somente o necessário

Adicionar perfil de release Spark com etapas separadas de Rules/índices, Hosting e builds. Remover a tentativa de publicar Cloud Functions apenas desse perfil. Não apagar os serviços Firestore de `functions/` nem remover o banco do deploy. Manter verificação de ambiente, árvore limpa, auditoria de dependências, tipos, testes, exports e comparação das Rules a implantar. O histórico de alertas altos do cliente é bloqueio independente, sujeito a reavaliação; não usar `audit fix --force` ou suprimir o gate.

Toda a matriz de destino deve rodar com Auth/Firestore locais e Functions desligadas. Preservar as treze famílias de 211 itens, concorrência entre dois dispositivos, autorização, parcelas, saldos, receipts, resposta perdida, cancelamento, troca de UID, corte de grupo e revogação. Acrescentar os testes de equivalência dos casos retroativos e dos limites das Rules. Testes do backend anterior podem servir de oráculo dos efeitos durante a migração, mas não aprovam o transporte Spark.

Ensaiar backup/restauração, corte de escritores antigos, clientes antigos/novos e reversão de versão. Rollback não desfaz commits financeiros: precisa de versão compatível com o protocolo e os dados; na ausência dela, interromper novas escritas de forma explícita. Não reabrir Rules antigas nem direcionar para Functions ausentes.

Homologar navegador e builds instaladas, inclusive contas legadas e migradas. Export não comprova funcionamento em aparelho. Medir documentos retornados, writes, listeners e leituras das Rules; franquia gratuita não é ilimitada. Fonte: [limites do Firestore](https://firebase.google.com/docs/firestore/quotas). Não publicar testes volumosos contra dados reais para medir isso.

## Definição de pronto e primeira entrega

Pronto significa: todas as operações contratadas funcionam com Firestore/Rules, sem chamada obrigatória a Functions ou servidor externo, posições e histórico reconciliados, controles preservados e testes reais por plataforma registrados. Pendências de automação ou política de exclusão não podem ser marcadas como concluídas apenas porque o upload passou.

A primeira entrega local começou com a matriz acima e 62 testes da prova de transferência/aporte/resgate. A continuação em [[Protocolo Financeiro Spark]] ampliou para **141 testes** com Auth/Firestore, Functions desligadas, além dos cinco scripts existentes de Rules. Foram implementados abertura zero concorrente por conta, contagem atual com revisão esperada, estorno único do par, ajuste atual e seu inverso histórico quando uma referência posterior já cobre o original. O resultado histórico foi comparado ao calculador existente. `npm run check` passou com 788 testes comuns; os 88 condicionais ignorados desse comando não contam como aprovação integrada.

Continuação do bloco financeiro temporal: **185 testes Spark aprovados**, zero ignorados, seguidos dos cinco scripts existentes de Rules. `SparkHistoryFirebase.ts` percorre uma cadeia imutável em duas passagens conferidas pelas Rules; `SparkTemporalBalanceFirebase.ts` usa a prova completa e a revisão confirmada para abertura mensal passada/atual, ajuste civil e reconciliação em instante passado. O estorno preserva a data efetiva. A prova permite retomada com limite explícito de passos e custa O(N) leituras/escritas; ainda exige medição/otimização antes de grupos grandes.

[[Reconciliação de Dados Spark]] acrescenta análise local de snapshots e calendário IANA protegido, sem acesso remoto. Dezoito testes unitários cobrem saldos, fronteiras, DST, ambiguidades, investimento observado independentemente e pares de transferência divergentes escondidos por abertura posterior. O teste integrado confere entradas importadas sintéticas contra a projeção real das Rules. Isso não certifica a completude do inventário remoto nem executa bootstrap/corte. O gate `check` passou com 806 testes comuns e 88 condicionais ignorados.

Continuação das aberturas futuras, protocolo v0.4: **224 testes Spark aprovados**, zero ignorados (39 além dos 185), com os cinco scripts existentes de Rules. `nextActivationAt` obrigatório na posição e marcador protegido `financial-proof-v3` bloqueiam todos os escritores comuns no vencimento. Agendar/editar mês futuro conserva o saldo atual e o checkpoint; `SparkMonthlyActivationFirebase.ts` permite a qualquer membro ativo materializar a projeção certificada no retorno ao aplicativo. O evento de ativação é neutro no histórico e conserva ID/data da abertura original. O caminho virtual de leitura confere atualidade com `request.time`, impedindo chamar saldo vencido de atual por cache/relógio local. `check` passou com 806 comuns/88 condicionais ignorados. Evidências locais em `.expo/spark-proof-2026-10-16/future-openings/`.

Continuação de substituição atômica, protocolo v0.5: `SparkAdjustmentReplacementFirebase.ts` e marcador protegido `financial-proof-v4` acrescentam receipt composto com dois efeitos históricos de tamanho fixo, uma revisão e uma cota. A prova considera separadamente o inverso antigo e o novo ajuste, inclusive na cauda usada por reconciliações retroativas. Claim compartilhado com estorno, base sem contribuição já coberta por abertura, autor/admin, mesmo banco, duas sessões, substituições sucessivas, hoje no commit, prazo futuro e limites derivados fazem parte da validação. A interface e os dados reais ainda não consomem a prova.

Validação dessa continuação: **275 testes Spark aprovados**, zero ignorados (51 novos), seguidos dos cinco scripts existentes de Rules; `check` passou com 806 comuns/88 condicionais ignorados. As recusas novas não aceitam esgotamento de orçamento como prova de proteção. Evidências em `.expo/spark-proof-2026-10-16/adjustment-replacement/`. Naquela versão, a preparação continuava linear e sem cota própria; a continuação v0.6 abaixo acrescenta admissão limitada.

Permanecem explícitos: homologação de volumes/fronteiras e integração dos agregados, integração de pausa/progresso no produto, inventário/restore/bootstrap reais, normalização de ajustes editáveis/eventos compostos, adaptação de extrato/resumos, integração Web/mobile/chat e paridade integral das demais operações. O analisador ainda bloqueia snapshots futuros até o bootstrap conferir o prazo mínimo e os ponteiros; não houve importação. A raiz neutra não autoriza ajuste histórico sem abertura. Datas suportadas começam em 1970; o calendário pode ser preparado até 2100. As telas/chat e os dados reais continuam no contrato anterior. Não houve deploy nem habilitação de cobrança; o prazo da migração completa depende dos critérios restantes.


Continuação de preparação, protocolo v0.6: marcador protegido `financial-proof-v5`, quatro campos de reserva/trabalho na prova e cotas privadas por UID mais agregado numérico sem IDs no projeto. Reservas de até 64 páginas são atômicas com a prova; cada página avança um único evento e uma revisão durável. Reenvios da mesma revisão não repetem trabalho nem cobrança; stale é detectado antes de ler outro evento. Limite de 100 páginas por chamada, pausa por `AbortSignal`, progresso e diagnóstico compartilhados. As cotas usam `request.time` e dia UTC; nenhuma reserva é devolvida ou carregada para outro dia.

[[Preparação Histórica Spark]] registra políticas, estimativas e benchmark local. Cotas limitam admissão confirmada, não toda a franquia/cobrança do Firestore. Esta entrega não elimina O(N), não implementa agregados reutilizáveis e acrescenta overhead de proteção. Histórico extenso pode atravessar dias; intenção “hoje/commit” exige nova prévia se mudar o dia civil. Telas Web/mobile/chat, bootstrap/importação e dados reais continuam no contrato anterior; a fase 1 integral permanece aberta.

Validação v0.6: 320 testes Spark aprovados, zero ignorados (45 novos), e `check` com 815 comuns/88 condicionais ignorados. Para 1.000 eventos, o benchmark local autenticado confirmou 2.098 escritas, 8.226 leituras explícitas SDK e 33.296 ms, sem Functions. Ver evidências e limites em [[Preparação Histórica Spark]].


Continuação v0.7 em 17/10/2026: [[Agregados Históricos Spark]] implementa floresta imutável de movimentos por conta, criada por membros ativos com cotas UID/projeto obrigatórias. Folhas conferem dois eventos; pais conferem dois filhos preexistentes. A prova salta somente endpoints exatos e janela homogênea; checkpoints, datas mistas e envelopes numéricos incompatíveis conservam fallback. Opt-in `useSegments`, marcador protegido `financial-proof-v6`, construção limitada/retomável e sem autoridade no cursor do cliente. Não há servidor, nova dependência ou execução com app fechado.

382 cenários Spark aprovados na execução completa, zero ignorados, cinco scripts existentes de Rules e `check` com 815 comuns/88 condicionais ignorados. Para 1.000 nós, construir 985 certificados e executar três consultas diferentes custa 3.069 escritas, contra 6.294 lineares (-51,2%); cada consulta aquecida usa 38 escritas. Primeiro uso com construção custa mais; datas adversariais e muitas contagens podem continuar lineares. Evidências em `.expo/spark-proof-2026-10-17/history-segments/`. Agregados de movimentos estão implementados, mas a fase integral não está concluída: faltam produto/volumes, inventário/restore/bootstrap, normalização, demais operações, Web/mobile/chat e release.


Continuação da compatibilidade local em 18/10/2026: [[Inventário e Restauração Local Spark]] adiciona captura bruta tipada, SHA-256, inventário de grupos/perfis/cortes/coleções e restauração create-only verificada no Emulator. Duas varreduras iguais não provam consistência de instante único. Há guardas de projeto demo/loopback, Hub sem Functions/Eventarc, destino vazio e limite de arquivo compatível entre captura/leitura. O ensaio cobre 316 documentos, paginações e tipos especiais; Rules/índices anexados são arquivos locais e não são implantados pelo restore.

O preflight adapta parcialmente o razão bruto ao reconciliador e liga relatório/cópia por hash. Conflitos de identidade, tipos sem precisão, ajustes editáveis e fontes ausentes bloqueiam a revisão local. `canApply` e `readyForCutover` continuam falsos e não há writes. Inventário remoto, backup real de todos os produtos necessários, normalização bruta completa (incluindo legado), bootstrap executável, consentimentos e corte de escritores continuam pendentes. Esta continuação não encerra a fase 2, não habilita grupos reais e não integra as telas.


Continuação do importador em 18/10/2026: [[Importação Financeira Local Spark]] adiciona normalização diagnóstica bruta legada com autoria da fonte, escopo/conferência explícitos e fechamento civil; pares, flags, tipos e fontes ambíguas bloqueiam aprovação local. `plan-ledger` gera candidato determinístico ligado ao bruto/grupo/corte/protocolo. `import-ledger` executa somente no Emulator vazio, conserva o bruto (exceto o bloqueio explícito do grupo, cujo original fica no manifesto), cria cadeias/posições/calendário e confere o conjunto inteiro antes/depois do recibo `verified-locked`. Não existe ativação na CLI.

BigInt confere fronteiras históricas e estornos precisam de original/inversão exata/uso único. O ensaio autenticado cobre bancos/Caixa/investimento após habilitação privilegiada SOMENTE pelo harness. Nós genéricos ainda não conservam interfaces nativas de edição/estorno: pontes/claims e limite histórico desconhecido do legado permanecem condições de ativação. Legado executável, formatos especiais/ajustes/contas inativas/futuras, dados reais e integração continuam pendentes. A fase 2 integral permanece aberta.
