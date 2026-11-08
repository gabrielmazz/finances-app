---
tags: [frontend, arquitetura]
relacionado: [[MOC - Lumus Finanças]], [[Remoção do Backend]]
status: ativo
tipo: arquitetura
versao: 3.0.0
---

# Gerenciamento de Usuários

Formulário de vínculo, listas e diálogos de revisão estão preservados como interface. Convites, aceite, revogação, permissões e gestão de grupos estão indisponíveis. Não há conta fictícia nem implementação de autorização.

## Arquivos de apresentação

AddUserRelationScreen em `screens/mobile/` e, quando existente, `screens/web/`. Os adaptadores em `app/` e os componentes usados por essas telas permanecem no projeto.

Ver [[Remoção do Backend]] para recuperação, validação e limites atuais.
