# Categorias legadas e autorização

Tags em `financialGroups/{groupId}/tags` são autorizadas pelo contexto do caminho e pela participação atual. Para uma tag de raiz `tags/{id}`, a leitura continua exigindo uma associação protegida `_categoryScopes/{id}` e, para listagem, uma entrada do índice protegido existente. Sem autoridade verificável, o registro permanece inacessível; o nome do criador isoladamente não concede acesso ao grupo.

Não há incorporação automática, reservas de nomes ou scripts administrativos para usar categorias novas. Não são alterados IDs, tipos ausentes, categorias `both` ou referências históricas. Nenhuma migração ou escrita em produção foi realizada. Ver [[Gerenciamento de Tags]].
