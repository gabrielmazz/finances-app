---
tags: [frontend, arquitetura]
relacionado: [[MOC - Lumus Finanças]], [[Remoção do Backend]]
status: ativo
tipo: arquitetura
versao: 3.0.0
---

# Anotações Locais

Lista e editor visual continuam no frontend. “Nova anotação” abre um rascunho somente em memória; salvar mostra indisponibilidade e preserva o texto, sem criar um registro. Leitura e gravação vinculadas ao usuário antigo foram removidas. Não há identidade temporária nem novo armazenamento de notas. Dados existentes no armazenamento do dispositivo não são lidos, migrados ou apagados nesta etapa.

## Arquivos de apresentação

LocalAnnotationsScreen em `screens/mobile/` e, quando existente, `screens/web/`. Os adaptadores em `app/` e os componentes usados por essas telas permanecem no projeto.

Ver [[Remoção do Backend]] para recuperação, validação e limites atuais.
