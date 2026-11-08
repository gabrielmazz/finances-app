---
tags: [frontend, arquitetura]
relacionado: [[MOC - Lumus Finanças]], [[Remoção do Backend]]
status: ativo
tipo: arquitetura
versao: 3.0.0
---

# Gerenciamento de Bancos

Formulários de nome, ícone, cor e saldo inicial, seletores, cards e extrato estão preservados. Cadastros, alterações de saldo e movimentações estão indisponíveis. Máscaras monetárias e seleções locais são apenas apresentação.

## Arquivos de apresentação

AddRegisterBankScreen em `screens/mobile/` e, quando existente, `screens/web/`. Os adaptadores em `app/` e os componentes usados por essas telas permanecem no projeto.

Ver [[Remoção do Backend]] para recuperação, validação e limites atuais.
