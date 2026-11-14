---
tags: [frontend, arquitetura]
relacionado: [[MOC - Lumus Finanças]], [[Remoção do Backend]]
status: ativo
tipo: arquitetura
versao: 3.0.0
---

# Gerenciamento de Tags

Campos de nome, ícone e disponibilidade visual, seletores e estruturas das tabelas permanecem. Consulta, cadastro, alteração e arquivamento estão implementados apenas no emulador; registros históricos não são excluídos.

Na investigação inicial da etapa 05, o inventário anterior identificou documentos legados `tags` com `personId`, `name`, `usageType`, flags de uso e metadados de ícone; há registros com tipo ausente e uso compartilhado. Não se deve inferir tipo exclusivo para esses casos nem trocar IDs ou apagar referências. O formulário histórico não possui seletor de cor identificado. Nenhuma escrita em produção ou migração de categorias foi realizada; a implementação e as Rules candidatas estão em validação local.

## Arquivos de apresentação

AddRegisterTagScreen em `screens/mobile/` e, quando existente, `screens/web/`. Os adaptadores em `app/` e os componentes usados por essas telas permanecem no projeto.

Ver [[Remoção do Backend]] para recuperação, validação e limites atuais.

## Etapa 05 — ambiente demo

O acordeão e os formulários originais usam `hooks/useCategories`, `hooks/useCategoryFormRecord` e `hooks/useCategoryMutations`. As categorias novas ficam em `financialContexts/{personal:uid|group:id}/categories/{id}`. Cadastro, edição e arquivamento preservam o ID e são confirmados pelo servidor. Nomes repetidos são permitidos; não há reserva de nomes, marcador administrativo ou preparação de conta. Nome, tipo, ícone, disponibilidade e situação preservam os campos necessários ao frontend.

A leitura e a escrita usam `mayReadContext` e `mayWriteContext`, com autenticação e autorização atual; a escrita de grupo segue a permissão de administrador da arquitetura existente. O arquivamento não remove documentos nem movimentações. O modelo anterior com `nameKey` opcional continua legível e editável sem modificar esse campo legado.

Tags de `financialGroups/{groupId}/tags` usam o contexto protegido do próprio caminho. Tags históricas de raiz são lidas somente quando já existe associação protegida `_categoryScopes/{id}`; a listagem usa o índice protegido existente. Sem associação verificável elas permanecem protegidas, e nenhum script ou migração é executado automaticamente. IDs, vínculos, tipo compartilhado `both` e tipo ausente são preservados; registros incompatíveis não são alterados.

Exceção autorizada pelo usuário para homologação oficial somente leitura: tags da raiz com `personId` igual ao UID autenticado e sem associação de grupo explícita podem ser mostradas mesmo se os campos de grupo estiverem ausentes. Essa ausência não prova propriedade pessoal. Os tipos ausentes continuam indefinidos e não autorizam novos lançamentos; um movimento histórico pode exibir o nome da tag sem atribuir tipo a ela. Nenhuma regra publicada ou documento é alterado.

A listagem mantém paginação por cursor, com consultas limitadas e sem listeners. A tela atualiza após as próprias operações, ao mudar de filtro, ao reabrir e ao retornar ao primeiro plano. Não existe atualização periódica de 60 segundos; alterações externas podem requerer reabertura da lista. Rules e código permanecem locais e restritos ao emulador, sem publicação ou uso de serviços pagos.
