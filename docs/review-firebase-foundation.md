# Revisão da etapa 02

Base: `ea9e261f97c68fb67d30f8ce15f708b65f605b5d`, tag `recovery/firebase-foundation-20261108`. Revisão do worktree e arquivos novos; não foi criado commit final. Spec: `docs/stage-02-spec.md`. Padrões: `Arquitetura.md`, vault e skill improve-lumus-financas. Duas revisões independentes via skill code-review, com revalidação.

## Standards

Três achados P2 corrigidos: URLs de snapshot com IDs especiais; extração de caminho truncada por subcoleção chamada `documents`; recarregamento de perfil apagando rascunhos. Correções: segmentos codificados na fronteira HTTP, remoção do prefixo exato, perfil preservado no refresh da mesma sessão e rascunho com nome esperado para concorrência. Fixtures cobrem os caminhos e navegador verifica refresh/descarte. Na revalidação, nenhum achado concreto pendente.

## Spec

Um achado P2 corrigido: recursão podia ultrapassar o orçamento de documentos já lidos numa página de irmãos. A página inteira agora reserva seu orçamento antes da recursão; regressão comprova duas leituras para orçamento dois, com exportação recusada se árvore maior. Revisão reexecutou esse teste isolado: passou. Nenhum achado confirmado pendente na revalidação.

## Limites

A revisão estática não libera produção. Rules atualmente publicadas continuam permitindo acesso amplo entre usuários autenticados; o novo cliente bloqueia produção e as Rules propostas são somente locais. Não houve deploy nem backup real validado. Testes e evidências de execução são registrados em `artifacts/firebase-foundation/validation-summary.json`.
