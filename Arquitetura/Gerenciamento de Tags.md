---
tags: [frontend, arquitetura]
relacionado: [[MOC - Lumus Finanças]], [[Remoção do Backend]]
status: ativo
tipo: arquitetura
versao: 3.0.0
---

# Gerenciamento de Tags

Campos de nome, ícone e disponibilidade visual, seletores e estruturas das tabelas permanecem. Consulta, cadastro, alteração e exclusão de categorias estão indisponíveis; não existem verificações de referências no banco.

## Arquivos de apresentação

AddRegisterTagScreen em `screens/mobile/` e, quando existente, `screens/web/`. Os adaptadores em `app/` e os componentes usados por essas telas permanecem no projeto.

Ver [[Remoção do Backend]] para recuperação, validação e limites atuais.
