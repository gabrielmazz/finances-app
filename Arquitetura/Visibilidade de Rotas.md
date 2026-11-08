---
tags: [frontend, arquitetura]
relacionado: [[MOC - Lumus Finanças]], [[Remoção do Backend]]
status: ativo
tipo: arquitetura
versao: 3.0.0
---

# Visibilidade de Rotas

`RouteVisibilityContext` conserva seleção e persistência local de visibilidade. A etapa visual usa a chave `@finances/route-visibility:frontend-v1`; não lê ou sobrescreve as chaves anteriores. Todas as telas preservadas começam visíveis para permitir inspeção.

Alterações explícitas continuam respeitadas nos menus e em `Stack.Protected`; ocultar todas preenche as preferências com `false`. O grupo de plataforma alternativo permanece bloqueado. Essa preferência não substitui autenticação ou autorização de um futuro backend.
