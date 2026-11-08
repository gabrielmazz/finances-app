---
tags: [frontend, arquitetura]
relacionado: [[MOC - Lumus Finanças]], [[Remoção do Backend]]
status: ativo
tipo: arquitetura
versao: 3.0.0
---

# Perfil do Usuário

Hero, campos de identificação, edição do nome e acesso a vínculos permanecem. Nome, UID, email de Auth e data legada são lidos do perfil próprio; copiar usa o UID real. Data ausente/inválida fica sem valor. Nome é validado e salvo por transação com comparação do nome esperado, sem sobrescrever campos antigos ou repetir escrita idêntica.

Perfil ausente não é criado pelo login; o usuário completa o nome explicitamente. Resumo de permissões, contagens e contas vinculadas continuam indisponíveis, sem tratar `adminUser` ou `relatedIdUsers` como autorização. Os vínculos são preservados nos documentos. Uma falha no contexto de grupo não apaga o perfil privado. Ver [[Fundação Firebase Spark]].

## Arquivos de apresentação

PerfilPersonScreen em `screens/mobile/` e, quando existente, `screens/web/`. Os adaptadores em `app/` e os componentes usados por essas telas permanecem no projeto.

Ver [[Remoção do Backend]] para recuperação, validação e limites atuais.
