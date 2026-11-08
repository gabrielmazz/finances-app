---
tags: [frontend, arquitetura]
relacionado: [[MOC - Lumus Finanças]], [[Remoção do Backend]]
status: ativo
tipo: arquitetura
versao: 3.0.0
---

# Previsão de Fluxo de Caixa

Horizontes 3/6/12 meses, resumo, gráfico e detalhes permanecem. O gerador de previsão e suas regras financeiras foram removidos. O hook retorna ausência de dados com mensagem explícita.

## Arquivos de apresentação

FinancialForecastScreen em `screens/mobile/` e, quando existente, `screens/web/`. Os adaptadores em `app/` e os componentes usados por essas telas permanecem no projeto.

Ver [[Remoção do Backend]] para recuperação, validação e limites atuais.
