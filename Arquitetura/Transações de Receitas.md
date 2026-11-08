---
tags: [frontend, arquitetura]
relacionado: [[MOC - Lumus Finanças]], [[Remoção do Backend]]
status: ativo
tipo: arquitetura
versao: 3.0.0
---

# Transações de Receitas

Campos, formatos de recebimento, seletores, datas e observações permanecem. Não há consulta, gravação, recebimento ou alteração de saldo. Rascunhos da interface não representam operações confirmadas.

## Arquivos de apresentação

AddRegisterGainScreen em `screens/mobile/` e, quando existente, `screens/web/`. Os adaptadores em `app/` e os componentes usados por essas telas permanecem no projeto.

Ver [[Remoção do Backend]] para recuperação, validação e limites atuais.
