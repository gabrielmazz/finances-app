---
tags: [frontend, arquitetura]
relacionado: [[MOC - Lumus Finanças]], [[Remoção do Backend]]
status: ativo
tipo: arquitetura
versao: 3.0.0
---

# Sistema de Temas

`ThemeContext` persiste somente a escolha de tema no AsyncStorage. `ValueVisibilityContext` persiste somente a máscara visual. Esses estados continuam independentes de usuário e serviços remotos.

`design-system/tokens.ts`, `web-dashboard.ts`, `web-forms.ts`, `mantine.ts` e `native-styles.ts` mantêm a identidade visual. `global.css`, Tailwind, fontes, imagens, ícones e animações foram preservados. Não alterar cores/layout para compensar a ausência de dados. As novas mensagens usam tokens existentes e passam pelo lint de estilos.
