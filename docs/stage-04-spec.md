# Etapa 04 — Bancos e abertura

Base de recuperação: tag `recovery/banks-opening-stage04-20261109`, HEAD `6cdf312`. Worktree inicialmente limpo. Escopo: contas, abertura, edição cadastral, consulta, arquivamento, Home e testes. Nenhuma receita/despesa/transferência ou publicação/gravação financeira real.

Modelo: novas contas em `financialContexts/{kind:scopeId}/bankAccounts/{operationId}`, abertura imutável em `financialContexts/{kind:scopeId}/accountOpenings/{operationId}`, criadas na mesma transação e vinculadas por Rules/getAfter. Saldo atual nesta etapa deriva somente da abertura; não é receita. Mesmo ID de operação tem o mesmo resultado; IDs distintos representam intenções distintas (não há identificação bancária externa/IBAN para deduplicar contas reais por nome).

Contexto pessoal: proprietário; grupo: leitura admin/member, gravação somente admin com autorização protegida da etapa03 e grupo ativo. Edição com revisão esperada; saldo/origem/contexto imutáveis. Arquivamento apenas com saldo zero, sem exclusão/reabertura. Correção financeira posterior não é edição cadastral.

Legado observado por inspeção protegida da cópia já autorizada, somente nomes/tipos de campos: três bancos (`name/personId/colorHex/createdAt/updatedAt`) e 34 snapshots mensais (`bankId/personId/year/month/valueInCents`); os três bancos têm histórico vinculado. Não inferir abertura nem saldo atual desses snapshots sem reconstruir movimentos, que estão fora do escopo. Mostrar conciliação pendente, preservar IDs/dados; editar somente metadados autorizados, sem abertura automática.

Paginação por contexto/estado, sem listeners. Total somente quando completo e todos os saldos conhecidos; arquivados excluídos. Leituras/transações e estado final comprovados em emuladores com dados sintéticos. API de bancos bloqueada no projeto produtivo até ativação específica posterior. Frontend/rotas/estilos preservados, com apenas campos/ações necessários.
