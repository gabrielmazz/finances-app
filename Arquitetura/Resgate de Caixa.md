---
tags: [frontend, arquitetura]
relacionado: [[MOC - Lumus Finanças]], [[Remoção do Backend]]
status: ativo
tipo: arquitetura
versao: 3.0.0
---

# Resgate de Caixa

Seletor de banco, formulário de saque e painel de saldo foram preservados. Saque, lançamento em Caixa e validações ligadas ao razão removido não são executados.

## Arquivos de apresentação

AddRescueScreen em `screens/mobile/` e, quando existente, `screens/web/`. Os adaptadores em `app/` e os componentes usados por essas telas permanecem no projeto.

Ver [[Remoção do Backend]] para recuperação, validação e limites atuais.
