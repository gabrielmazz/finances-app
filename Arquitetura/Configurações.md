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

Na revisão de 25/11, a tabela de bancos usa a largura do acordeão. A coluna de ações tem largura compacta e o nome ocupa o espaço restante. O acordeão de categorias consulta por destino, situação e nome. O arquivamento mantém a categoria consultável na situação Arquivadas e no histórico financeiro. A tela de configurações das telas mantém a camada decorativa dentro do hero, com a navegação lateral acima da área de conteúdo.
