---
tags: [frontend, arquitetura]
relacionado: [[MOC - Lumus Finanças]], [[Remoção do Backend]]
status: ativo
tipo: arquitetura
versao: 3.0.0
---

# Privacidade de Valores

A preferência visual de ocultar valores permanece em `contexts/ValueVisibilityContext.tsx`, com máscara `••••` e persistência local independente de conta. Não carrega nem armazena dados financeiros.

A aplicação não restaura o antigo cache. Sem um backend, indicadores e relatórios devem apresentar indisponibilidade em vez de saldo zero confirmado. Os contratos de privacidade dos componentes de gráficos permanecem preservados para integração futura.
