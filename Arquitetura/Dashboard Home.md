---
tags: [frontend, arquitetura]
relacionado: [[MOC - Lumus Finanças]], [[Remoção do Backend]]
status: ativo
tipo: arquitetura
versao: 3.0.0
---

# Dashboard Home

Cards de bancos e dinheiro, indicadores, gráficos, calendário de compromissos e timeline permanecem nas composições existentes. `useHomeScreenData` entrega coleções vazias acompanhadas de erro de indisponibilidade, sem consulta, cache ou saldos confirmados.

## Arquivos de apresentação

HomeScreen em `screens/mobile/` e, quando existente, `screens/web/`. Os adaptadores em `app/` e os componentes usados por essas telas permanecem no projeto.

Ver [[Remoção do Backend]] para recuperação, validação e limites atuais.
