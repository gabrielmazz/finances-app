---
tags: [spark, usuarios, consentimento, firestore, seguranca]
relacionado: [[Gerenciamento de Usuários]], [[Perfil do Usuário]], [[Plano de Funcionalidade Completa sem Blaze]], [[Processo de Release]], [[Visibilidade de Rotas]]
status: em desenvolvimento
tipo: feature
versao: 1.0.0
spark_module: U02
spark_progress: 65
spark_reviewed_at: 2026-10-24
---

# Vínculos de Usuários Spark

Convites, aceite e revogação usam o SDK Firestore e Rules, sem chamar Functions. O protocolo autoriza a relação entre duas contas; não atribui papel, não altera membros e não concede acesso ao grupo financeiro de outra pessoa. Dados legados que já permitem relações e leitura do perfil seguem a relação aceita; dados canônicos Spark continuam exigindo filiação ao grupo.

## Como funciona

1. O par canônico ordena os dois UIDs e usa `sparkUserRelationships/{primeiroUid}/sparkRelationshipPairs/{segundoUid}`. Um único documento guarda participantes imutáveis, remetente/nome mínimo, estado, revisão, identidade do convite, datas e última operação/autor. `invited`, `linked` e `revoked` são estados distintos.
2. Qualquer participante autenticado pode enviar um convite para uma conta existente. Nome do alvo não é consultado/revelado antes do aceite; a pessoa convidada recebe apenas o nome validado do remetente. O convite vale por sete dias, medidos pelo servidor nas Rules. Convites cruzados preparados no mesmo estado não aceitam automaticamente: um vence, o outro precisa de nova revisão.
3. Somente o destinatário pode transformar um convite vigente em `linked`. Ambas as contas passam a ler os perfis e os dados que já autorizam relações, sem gravar `relatedIdUsers`, grants antigos, papéis ou grupo. Alteração concorrente/expiração exige nova revisão.
4. Qualquer participante pode revogar um convite ou vínculo existente. `revoked` permanece como registro que impede concessões antigas de voltar a autorizar leitura. Uma revogação inicial só pode substituir um vínculo legado comprovado; o cliente não cria registros revogados arbitrários nem regrava um estado já revogado. Revogação sem vínculo é um no-op.
5. Cada mudança grava um recibo próprio imutável em `sparkUserRelationshipOperations/{uid}/receipts/{clientActionId}`, na mesma transação do par. Rules ligam ator, alvo, revisão, ação e estado aos dois documentos. Retry com o mesmo ID/material recupera o recibo; replay de um aceite após revogação reconhece o resultado histórico, sem restaurar a autoridade atual.
6. Envios e aceites têm cota de dez mudanças por minuto/UID em `sparkUserRelationshipQuotas/{uid}`, também atômica e validada por horário do servidor. No-op e replay não consomem outra unidade. Revogar um consentimento existente continua permitido mesmo com cota de convites esgotada. Leituras de preview não expõem o perfil alvo e não criam escrita para contabilizar consulta.
7. Listas usam `collectionGroup('sparkRelationshipPairs')` com `participants array-contains uid`, páginas de cem documentos e cursor. O índice do campo está em `firestore.indexes.json`. Falha de consulta não volta para Functions ou produz lista vazia confirmada. Perfis relacionados são relidos no servidor; revogação entre lista e leitura causa erro/retry, sem usar cache como autorização.
8. Relações antigas comprovadas continuam legíveis apenas enquanto não houver estado nativo para o par. Listas e grants antigos não são modificados; convites antigos pendentes não são convertidos automaticamente e devem ser emitidos novamente no fluxo nativo. Migração completa de dados/relações e inclusão de membros continuam pendentes de U02/D03.

## Telas e sessão

As composições Web/mobile mantêm hero, teclado/scroll e retorno ao perfil. Um formulário compartilhado apresenta ID, atualização, listas recebidas/enviadas/vinculadas e revisão do efeito antes de confirmar. Nome/estado do alvo e ID do pedido ficam ligados à revisão apresentada. Revogar ou recusar também exige revisão explícita.

Durante envio, campos e nova consulta ficam bloqueados. Erro definitivo libera uma nova revisão; resposta incerta preserva ID, alvo e snapshot e oferece **Confirmar operação anterior**. Cancelar uma revisão ainda não enviada é permitido. Rascunho/preparação vivem em memória; após reload, a lista e o estado atual do par devem ser consultados, sem prometer restauração integral de um formulário.

UID reativo, Auth real, foco, montagem e geração protegem leitura/confirmacão/feedback. Sair do foco cancela a publicação da resposta e a continuidade antes do commit quando ainda possível. Retornar conserva a confirmação incerta e permite consultar o recibo com o mesmo ID. Operação já confirmada não é desfeita por navegação. Pós-submit configurado ocorre somente para link confirmado e tela/sessão vigente; revogação atualiza a lista sem forçar saída.

A antiga autorização de migração inserida no formulário dependia de callable e pertence a D03. Esses controles deixam a tela de vínculo; a API legada permanece no código para o trabalho próprio de migração, sem apresentar essa capacidade como Spark pronta. Criar vínculo não autoriza importar dados de outra conta.

## Arquivos principais

- `functions/SparkUserRelationshipFirebase.ts`: serviço puro do SDK, transação, recibo, cota e leitores.
- `functions/UserRelationshipFirebase.ts`: adaptador da sessão atual; contrato existente das telas/assistente preservado.
- `functions/RegisterUserFirebase.ts`: leitores de relacionados usam o novo catálogo e a compatibilidade comprovada.
- `hooks/useUserRelationships.ts`, `components/uiverse/users/user-relationships-form.tsx`.
- `screens/mobile/AddUserRelationScreen.tsx`, `screens/web/AddUserRelationScreen.web.tsx`.
- `firestore.rules`, `firestore.indexes.json`.
- `backend/src/userRelationships.ts`, `legacyFinancialMovements.ts`, `bankBalanceAdjustments.ts`, `index.ts`: guardas para que endpoints antigos não interpretem/revertam autorização nativa.
- `tests/useUserRelationships.test.ts`, `tests/userRelationshipScreens.test.ts`, `backend/tests/sparkUserRelationships.emulator.test.ts`.

## Configuração e liberação

Não exige nova dependência nem serviço pago. A revisão local `user-relationships-2026-10-24` libera só `addUserRelation` uma vez. Perfil, anotações, assistente e desligamentos posteriores conservam suas preferências.

No ambiente publicado, Rules e índice precisam estar atualizados. As Functions antigas usam Admin SDK e ignoram Rules: se ainda existirem endpoints implantados, devem estar desativados ou conter as guardas de compatibilidade antes de permitir a transição nativa. O perfil Spark não publica Functions. Nenhuma implantação foi feita nesta entrega; ver [[Processo de Release]].

## Validação e pendências

Evidências e roteiro em [[Versão Usável por Telas]] e [[Guia de Testes Locais]]. A suíte SDK usa Firestore Emulator isolado e tokens fictícios com `auth_time`; a fixture privilegiada usa somente REST loopback no projeto demo. Não utiliza Auth remoto, Functions ou credenciais reais. Testes de componentes simulam o shell nativo/Web e o transporte; não homologam layout, teclado/leitor de tela, temas ou aparelho.

U02: **65%**, notas P/I/D/E **75/75/25/75**. Restam filiação/grupos sem autoatribuição, conversão integral dos vínculos existentes, rollout com bloqueio do legado, abuso/volume e aceite em navegador/aparelhos. O núcleo financeiro conserva 78%; geral recalculado em [[Status da Implementação Spark]].
