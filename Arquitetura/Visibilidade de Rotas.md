---
tags: [frontend, arquitetura]
relacionado: [[MOC - Lumus Finanças]], [[Remoção do Backend]]
status: ativo
tipo: arquitetura
versao: 3.0.0
---

# Visibilidade de Rotas

`RouteVisibilityContext` conserva seleção e persistência local de visibilidade. Usa a chave `@finances/route-visibility:frontend-v1`, sem sobrescrever as chaves anteriores. A disponibilidade de arquitetura é independente dessa preferência: Home, cadastro e consulta de bancos, cadastro de categorias e perfil estão liberados no cliente; operações de categorias e bancos permanecem restritas ao emulador. A tela de configurações de visibilidade continua acessível. Os demais módulos financeiros permanecem bloqueados até sua reconstrução e validação; categorias ainda não está liberada para produção. A lista está em `utils/availableRoutes.ts` e deve ser atualizada ao concluir cada módulo.

Alterações explícitas continuam respeitadas nos menus e em `Stack.Protected`; ocultar todas preenche as preferências com `false`. Uma preferência antiga não habilita módulo indisponível, inclusive por link direto. O grupo de plataforma alternativo permanece bloqueado. Workspace exige sessão Auth. A visibilidade não substitui a autorização nas Security Rules. Ver [[Fundação Firebase Spark]].
