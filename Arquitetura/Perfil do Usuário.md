---
tags: [frontend, arquitetura]
relacionado: [[MOC - Lumus Finanças]], [[Remoção do Backend]]
status: ativo
tipo: arquitetura
versao: 3.0.0
---

# Perfil do Usuário

Hero, campos de identificação, edição do nome e acesso a vínculos permanecem. Nome, UID, email de Auth e data legada são lidos do perfil próprio; copiar usa o UID real. Data ausente/inválida fica sem valor. Nome é validado e salvo por transação com comparação do nome esperado, sem sobrescrever campos antigos ou repetir escrita idêntica.

Perfil ausente não é criado pelo login; o usuário completa o nome explicitamente. Resumo de permissões, contagens e contas vinculadas continuam indisponíveis, sem tratar `adminUser` ou `relatedIdUsers` como autorização. Os vínculos são preservados nos documentos. Uma falha no contexto de grupo não apaga o perfil privado e aparece no aviso existente do workspace. Revogação foi exercitada na interface com dados sintéticos. As Rules negam perfil/email de terceiros mesmo quando há compartilhamento financeiro autorizado. Auth claims e `_authorizations` são a autoridade, nunca campos legados. Ver [[Segurança e Preparação para Produção]] e [[Fundação Firebase Spark]].

## Arquivos de apresentação

PerfilPersonScreen em `screens/mobile/` e, quando existente, `screens/web/`. Os adaptadores em `app/` e os componentes usados por essas telas permanecem no projeto.

Ver [[Remoção do Backend]] para recuperação, validação e limites atuais.

## Homologação e preservação

Perfil próprio existente e UID foram conferidos na Web com login manual autorizado. A restauração real de 987 documentos interpretou os dois perfis e negou acesso cruzado. O inventário Auth cifrado contém três contas; uma não possui perfil Firestore e foi preservada sem criação automática. Ausência/incompletude são tratadas explicitamente e não concedem permissões. Estado e evidências: [[Homologação e Recuperação da Etapa 03]].

No Android físico, nome/email/data legada e UID foram conferidos, inclusive após reiniciar e reconectar. `InputField` preserva agora os rótulos nativos fornecidos pelo consumidor; ver [[Componentes UI]] e o registro assistido de [[Homologação e Recuperação da Etapa 03]].
