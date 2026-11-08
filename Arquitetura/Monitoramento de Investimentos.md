---
tags: [frontend, arquitetura]
relacionado: [[MOC - Lumus Finanças]], [[Remoção do Backend]]
status: ativo
tipo: arquitetura
versao: 3.0.0
---

# Monitoramento de Investimentos

Layout de períodos, indicadores, histórico, gráfico e modais permanece. As fórmulas de projeção e a consulta de taxas foram removidas. Coleções vazias e mensagens de indisponibilidade não representam posição de investimento.

## Arquivos de apresentação

FinancialListScreen em `screens/mobile/` e, quando existente, `screens/web/`. Os adaptadores em `app/` e os componentes usados por essas telas permanecem no projeto.

Ver [[Remoção do Backend]] para recuperação, validação e limites atuais.
