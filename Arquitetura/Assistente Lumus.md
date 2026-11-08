---
tags: [frontend, arquitetura]
relacionado: [[MOC - Lumus Finanças]], [[Remoção do Backend]]
status: ativo
tipo: arquitetura
versao: 3.0.0
---

# Assistente Lumus

Hero, conversa, compositor, consentimento, sugestões, cartões, gráficos e estados de erro permanecem. O hook `useAssistantAvailability` informa indisponibilidade. Não existem modelo, parser de comandos, prompts, ferramentas financeiras, executor, cota, conversa simulada ou envio de áudio. Componentes e metadados de campos são somente apresentação.

## Arquivos de apresentação

LumusAssistantScreen em `screens/mobile/` e, quando existente, `screens/web/`. Os adaptadores em `app/` e os componentes usados por essas telas permanecem no projeto.

Ver [[Remoção do Backend]] para recuperação, validação e limites atuais.
