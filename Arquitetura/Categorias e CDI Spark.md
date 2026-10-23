---
tags: [firebase, spark, categorias, cdi, seguranca]
relacionado: [[Protocolo Financeiro Spark]], [[Gerenciamento de Tags]], [[Investimentos]], [[Integração Financeira Spark]]
status: em desenvolvimento
tipo: feature
versao: 0.1.1
spark_module: F09
spark_progress: 85
spark_reviewed_at: 2026-10-19
---

# Categorias e CDI Spark

<!-- spark-progress:start -->
## Progresso Spark — 19/10/2026

**F09 — Categorias e configuração do CDI: 85% implementado / 15% restante.** Notas P/I/D/E: **100/75/75/75**; cálculo e evidências em [[Status da Implementação Spark]].

O percentual corresponde ao módulo completo, incluindo integração e dados, e não somente ao serviço descrito nesta página. **Próxima entrega:** Concluir a conversa/replay Spark e ensaiar os formatos antigos restantes; projeção do investimento pertence a F08.

Esta revisão prevalece sobre listas de pendências datadas das entregas anteriores abaixo. Implementação local e logs não aprovam publicação nem migração real.
<!-- spark-progress:end -->

Serviços locais de 19/10/2026 sob `financial-proof-v16`, com Firebase Auth/Firestore e Functions desligadas. Nenhum grupo real foi ativado. As coleções `tags` e `investmentCdiRates` são mantidas para referências existentes; documentos nativos recebem esquema fechado, grupo, revisão, cabeça de operação e tempos do servidor. Cada alteração exige receipt novo e cota atômicos. Identidade/papel/propriedade são conferidos nas Rules, independentemente do código do formulário.

## Categorias

`saveSparkCategoryFirebase` exige proprietário autenticado, grupo ativo, revisão confirmada e oito campos descritivos tipados. Uso de despesa/receita e flags recorrentes permanecem coerentes. Outro administrador não assume a categoria alheia. `deleteSparkCategoryFirebase` conserva a identidade por tombstone; não permite recriar, apagar fisicamente ou remover uma categoria usada.

O primeiro movimento, correção ou plano recorrente cria `sparkCategoryReferences/{categoryId}` na mesma transação. Todos esses escritores exigem o marcador nas Rules. O marcador é permanente, inclusive depois de estorno, reclassificação ou arquivamento: o histórico imutável ainda contém a referência. Exclusão verifica sua ausência no estado final, impedindo que uma exclusão e um primeiro uso concorrentes vençam juntos. Escritores legados recusam referências a categorias nativas. A contagem da tela é informativa e inclui movimentos/correções/planos; `permanentHistory` explica a proteção quando os planos atuais já foram reclassificados.

Categorias antigas são preservadas integralmente em `sparkMetadataOrigins` antes da adoção. Recebem `historyKnown:false`, impedindo exclusão até inventário confiável das referências anteriores. Um `schemaVersion:1` desconhecido ou com campos adicionais é recusado sem perda de dados. Não afirmar que essa adoção conclui a migração de categorias existentes.

## CDI

`saveSparkCdiRateFirebase` salva um registro por UID e dia `YYYYMMDD`, com inteiro entre 0 e 100.000 pontos-base. Zero é uma vigência válida: interrompe o rendimento da taxa anterior. Taxa anual e percentual contratado do investimento são conceitos diferentes. As projeções continuam em ponto fixo/centavos; a atualização não cria rendimento confirmado nem movimenta saldo.

O dia real de 1970–2100 é validado contra `sparkCivilMonths`. A vigência começa à meia-noite de São Paulo no calendário protegido, inclusive em anos com mudanças de horário. O leitor transforma somente o timestamp nativo em data civil para os calculadores locais, conservando a mesma data em aparelhos de outros fusos. Uma vigência legada divergente não é deslocada silenciosamente: exige inventário. A origem antiga também é conservada antes da adoção. Não há exclusão nativa de taxas; a interface existente faz upsert e conserva o histórico.

## Formulários e conversa

`SparkMetadataCommandFirebase` traduz comandos de formulário/chat para esses serviços. O comando completo e os fingerprints opcionais integram o receipt; não são fonte de autoridade. Replay é conferido antes de reler uma versão já editada posteriormente. IDs de criação são determinísticos e limitados; colisão com cadastro existente falha, nunca sobrescreve outro cadastro. `TagFirebase` e `InvestmentCdiRateFirebase` escolhem Spark pelo contexto autenticado protegido, sem fallback após erro, e unem os metadados do grupo aos vínculos legados sem duplicar documentos. Tombstones não aparecem nos seletores.

Web e mobile mantêm o ID ao repetir o mesmo salvamento de categoria/CDI e aceitam CDI zero. A fachada `manageFinancialMetadataFirebase` resolve Spark mesmo sem `groupId` explícito. Isso não conclui a integração do assistente: descoberta de receipts Spark, referências e todas as famílias financeiras ainda precisam do adaptador comum descrito em [[Integração Financeira Spark]].

## Evidências

Seletores Spark passam a filtrar o mesmo escopo de grupo/dono/uso do serviço financeiro. Categoria nativa de outro grupo não aparece mesmo se tiver o UID atual. Relações antigas servem para descobrir candidatos legados, cuja inclusão depende do perfil protegido apontar para o grupo; elas não atribuem autoridade ao grupo Spark. O contexto é revalidado depois das leituras. Categorias de membros sem relação antiga continuam vindo pela consulta `groupId`.

60 cenários dirigidos aprovados no emulador, incluindo disputa de uso/exclusão, correção entre duas contas, limites/forjamentos, revisão stale, recuperação, origem integral e CDI zero. O teste de correção revelou o limite de 1.000 expressões; cada posição passou a conferir seu efeito contra o próprio checkpoint, enquanto o receipt exige os dois updates. Logs iniciais e aprovados estão em `.expo/spark-proof-2026-10-19/closure/`. Leitura/CDI e cálculo foram exercitados também com `TZ=America/Los_Angeles` e `TZ=Asia/Tokyo`. A validação completa do protocolo e de telas/aparelhos é registrada separadamente; testes dirigidos não a substituem.
