---
tags: [frontend, arquitetura]
relacionado: [[MOC - Lumus Finanças]], [[Remoção do Backend]]
status: ativo
tipo: arquitetura
versao: 3.0.0
---

# Balanço Mensal

Banco, mês, ano, valor e estrutura da prévia continuam na tela. Abertura mensal, checkpoints, preparação e execução financeira foram removidos. Nenhum snapshot é criado ou consultado.

## Arquivos de apresentação

AddRegisterMonthlyBalanceScreen em `screens/mobile/` e, quando existente, `screens/web/`. Os adaptadores em `app/` e os componentes usados por essas telas permanecem no projeto.

Ver [[Remoção do Backend]] para recuperação, validação e limites atuais.
