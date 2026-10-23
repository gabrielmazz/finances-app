---
tags: [spark, financeiro, recuperacao, web, mobile, seguranca]
relacionado: [[Protocolo Financeiro Spark]], [[Integração Financeira Spark]], [[Status da Implementação Spark]], [[Assistente Lumus]]
status: em desenvolvimento
tipo: arquitetura
versao: 0.1.0
spark_module: F01
spark_progress: 80
spark_reviewed_at: 2026-10-22
---

# Recuperação de Operações Spark

<!-- spark-progress:start -->
## Progresso Spark — 22/10/2026

**F01 — Protocolo, histórico e preparação: 80% implementado / 20% restante.** Notas P/I/D/E: **100/75/50/75**; cálculo e evidências em [[Status da Implementação Spark]].

A identificação e a conferência do resultado sobrevivem ao reload. Restaurar todos os argumentos/provas e concluir automaticamente fases descritivas ainda está pendente; esta entrega não aumenta os percentuais do módulo completo.
<!-- spark-progress:end -->

## Como funciona

`runSparkOperation` reserva uma intenção privada no servidor antes de enviar a transação de domínio. O recibo financeiro e a passagem de `pending` para `committed` são gravados juntos. O cancelamento disputa o mesmo documento; uma intenção cancelada nunca volta a aceitar dinheiro, mesmo se uma tentativa antiga chegar depois. Consultar um recibo ausente, isoladamente, não autoriza descartar a intenção.

O aviso na raiz compartilhada de Web/mobile consulta a última intenção do UID. Usa somente respostas confirmadas do servidor, descarta callbacks de outro usuário/assinatura e oferece conferir resultado, cancelar explicitamente um envio pendente ou reconhecer um registro confirmado. Cancelar um envio confirmado conserva seu registro. O aviso não estorna dinheiro nem repete automaticamente a operação. Enquanto não houver conferência válida, outra intenção no executor comum fica bloqueada.

Na sessão ininterrupta, o executor lembra em memória os resultados conferidos. A próxima intenção pode reconhecer o registro anterior atomicamente, sem pedir outra confirmação em cada lançamento. Esse conhecimento não é persistido e é descartado na troca de autenticação. Outra sessão ou um reload precisa conferir o aviso. Replays com o mesmo ID continuam exigindo todos os argumentos materiais e autorização atual; não deslocam o índice para um recibo antigo.

Falhas definitivas são acompanhadas por cancelamento autenticado. O formulário só abandona o ID quando o servidor confirma o cancelamento. Uma nova confirmação usa outro ID; uma falha incerta conserva o anterior. No investimento e na recorrência, uma fase descritiva cancelada ganha outro ID sem repetir o principal ou o contrato já confirmado na mesma sessão. Argumentos diferentes continuam bloqueados durante a conclusão dessa fase.

## Documentos e proteção

| Caminho | Conteúdo |
|---|---|
| `sparkOperationRecovery/{uid}` | Índice privado: versão, grupo, ID da operação e atualização. |
| `sparkOperationRecovery/{uid}/intents/{operationId}` | Versão, grupo, tipo, estado e timestamps. Estados: `pending`, `committed`, `cancelled`, `resolved`. |
| `sparkOperationIntentQuotas/{uid}` | Admissão de até 120 novas intenções por minuto, global ao UID. Cancelar/reconhecer não zera essa cota. |

As Rules fecham os campos, tipos, limites, propriedade e transições. Reservar exige grupo Spark ativo/papel protegido, índice e cota atômicos, sem recibo antes ou depois da reserva. Confirmar exige recibo novo do mesmo autor/tipo no mesmo commit. Cancelar não exige papel financeiro ainda ativo, mas exige o próprio UID com login válido e ausência de recibo após a escrita. Intenções terminais e índice não podem ser apagados pelo cliente. Dados extras de rascunho, conversa, autorização do assistente ou valores não são aceitos.

A guarda da cota financeira recusa outro ID enquanto existir intenção pendente e impede confirmar um ID cancelado. Operações compostas usam a reserva do pai; os vínculos financeiros do filho continuam obrigatórios. A cota financeira existente de 120 operações/minuto não foi alterada. A nova cota limita também o armazenamento de reservas canceladas.

O protocolo financeiro continua `financial-proof-v17`; o journal tem versão própria 1. Escritores diretos anteriores que não criaram intenção conservam as validações de domínio existentes. O bloqueio adicional de reconhecimento de um registro já confirmado pertence ao executor atual; não representa idempotência universal para novos IDs inventados por qualquer cliente autorizado.

## Custo e retenção

Além do caminho anterior, a reserva escreve índice, intenção e admissão; pode reconhecer a intenção anterior em uma quarta escrita. O commit financeiro acrescenta uma escrita de estado da intenção e duas leituras explícitas. A reserva acrescenta leituras de grupo, recibo, índice, intenção e admissão, mais a intenção anterior quando existe; o preparo material de algumas famílias possui leituras adicionais. Replays, conflitos, listeners e leituras cobradas pelas Rules também têm custo. Medição em volumes representativos e adequação às cotas diárias Spark permanecem pendentes.

Tombstones cancelados não recebem TTL que volte a liberar o ID antigo. Permanecem ligados ao UID e à identidade financeira para bloquear confirmações tardias. Sua exportação/retenção/exclusão precisa integrar o fluxo geral de privacidade ainda pendente em U03; o cliente não dispõe de limpeza administrativa.

## Arquivos principais

- `functions/SparkOperationRecoveryFirebase.ts` e `functions/sparkFinancialProtocol.ts`.
- `components/uiverse/banks/spark-operation-recovery-notice.tsx`, montado em `components/app/app-root.tsx`.
- `firestore.rules`, `backend/tests/sparkTransfer.rules.test.ts` e os testes SDK dos formulários.
- `tests/sparkPartialRecoveryForms.test.ts`, `tests/sparkMovementForm.test.ts` e `tests/sparkPairForm.test.ts`.

## Limites atuais

O journal não salva campos financeiros, rascunhos, provas ou autorizações do assistente. Após reload, permite reconhecer/cancelar a identidade e conferir o resultado, sem restaurar todos os campos ou terminar sozinho o catálogo/configuração parcialmente gravados. Preparação histórica anterior ao envio conserva seus protocolos próprios. Contas/dados antigos, executor conversacional completo, ensaio visual autenticado e homologação em aparelhos continuam pendentes. Esta entrega não habilita grupo real nem publica Rules ou aplicativo.

## Evidências locais

1.147 cenários Spark e cinco scripts anteriores, 51 SDK, 22 de snapshot/importação isolados, gate com 104 ferramentas/999 comuns e exports Web/Android concluídos. Os mesmos 32 testes passaram em dois fusos. Logs, ressalvas e critérios em [[Status da Implementação Spark]]. Captura/restauração genérica preserva os tombstones e a cota; não é autorização de transição real.
