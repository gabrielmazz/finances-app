---
tags: [frontend, arquitetura]
relacionado: [[MOC - Lumus Finanças]], [[Remoção do Backend]]
status: ativo
tipo: arquitetura
versao: 3.0.0
---

# Comportamento Pós-Registro

As preferências de retorno e limpeza dos formulários permanecem como configuração local de interface em `PostSubmitBehaviorContext` e `usePostSubmitBehavior`.

Nenhuma operação indisponível dispara o fluxo de sucesso, limpa campos alegando ter salvo ou navega como confirmação de um registro. A integração futura poderá usar essas preferências somente após uma operação real concluída.
