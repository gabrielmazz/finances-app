---
tags: [frontend, arquitetura]
relacionado: [[MOC - Lumus Finanças]], [[Remoção do Backend]]
status: ativo
tipo: arquitetura
versao: 3.0.0
---

# Notificações

Alertas in-app foram preservados para feedback da interface. Push, registro de aparelho, canais, permissão, agendamento, reconciliação e lembretes financeiros foram removidos. Os campos visuais de lembrete não agendam nada.

## Arquivos de apresentação

components/uiverse/feedback em `screens/mobile/` e, quando existente, `screens/web/`. Os adaptadores em `app/` e os componentes usados por essas telas permanecem no projeto.

Ver [[Remoção do Backend]] para recuperação, validação e limites atuais.
