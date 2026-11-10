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

Etapa04: abertura de contas novas usa evento imutável próprio, sem criar `MonthlyBalance`, receita ou snapshot. Documentos mensais legados são preservados e não determinam automaticamente o saldo novo. Ver [[Gerenciamento de Bancos]].
