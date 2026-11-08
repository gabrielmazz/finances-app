---
tags: [frontend, arquitetura]
relacionado: [[MOC - Lumus Finanças]], [[Remoção do Backend]]
status: ativo
tipo: arquitetura
versao: 3.0.0
---

# Configurações

Tema, máscara de valores, visibilidade e preferências de navegação continuam locais. Tabelas, formulários e accordions permanecem. O controle de confiança para cache financeiro não ativa persistência; cadastros e dados remotos ficam indisponíveis.

## Arquivos de apresentação

ConfigurationsScreen / ScreenSettingsScreen em `screens/mobile/` e, quando existente, `screens/web/`. Os adaptadores em `app/` e os componentes usados por essas telas permanecem no projeto.

Ver [[Remoção do Backend]] para recuperação, validação e limites atuais.
