---
tags: [frontend, arquitetura]
relacionado: [[MOC - Lumus Finanças]], [[Remoção do Backend]]
status: ativo
tipo: arquitetura
versao: 3.0.0
---

# Perfil do Usuário

Hero, campos de identificação, edição do nome e acesso a vínculos permanecem. Perfil, ID, datas e resumo de acesso ficam indisponíveis; salvar não retorna sucesso e copiar não inventa um identificador.

## Arquivos de apresentação

PerfilPersonScreen em `screens/mobile/` e, quando existente, `screens/web/`. Os adaptadores em `app/` e os componentes usados por essas telas permanecem no projeto.

Ver [[Remoção do Backend]] para recuperação, validação e limites atuais.
