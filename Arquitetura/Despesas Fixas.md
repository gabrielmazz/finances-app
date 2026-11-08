---
tags: [frontend, arquitetura]
relacionado: [[MOC - Lumus Finanças]], [[Remoção do Backend]]
status: ativo
tipo: arquitetura
versao: 3.0.0
---

# Despesas Fixas

Cadastro, lista, calendário, gráficos, opções de parcelas e campos de lembretes estão preservados. Pagamentos, quitações, avanços de ciclo, renegociações, restaurações e notificações não são executados. Não há cálculo de saldo contratual ou inferência de parcelas pagas.

## Arquivos de apresentação

AddMandatoryExpensesScreen / MandatoryExpensesListScreen em `screens/mobile/` e, quando existente, `screens/web/`. Os adaptadores em `app/` e os componentes usados por essas telas permanecem no projeto.

Ver [[Remoção do Backend]] para recuperação, validação e limites atuais.
