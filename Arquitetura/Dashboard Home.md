---
tags: [frontend, arquitetura]
relacionado: [[MOC - Lumus Finanças]], [[Remoção do Backend]]
status: ativo
tipo: arquitetura
versao: 3.0.0
---

# Dashboard Home

Cards de bancos e dinheiro, indicadores, gráficos, calendário de compromissos e timeline permanecem nas composições existentes. `useHomeScreenData` consome as contas reais de teste compartilhadas em `BankAccountsContext`. O painel de bancos lista contas ativas/arquivadas, abre cadastro/consulta e calcula apenas o total completo de contas ativas com saldo confirmado. Contas antigas têm saldo em conciliação, nunca zero presumido. Movimentos, receitas, despesas e investimentos continuam indisponíveis; abertura não é ganho. Sem prompt automático para novo saldo mensal. Ver [[Gerenciamento de Bancos]].

## Arquivos de apresentação

HomeScreen em `screens/mobile/` e, quando existente, `screens/web/`. Os adaptadores em `app/` e os componentes usados por essas telas permanecem no projeto.

Ver [[Remoção do Backend]] para recuperação, validação e limites atuais.
