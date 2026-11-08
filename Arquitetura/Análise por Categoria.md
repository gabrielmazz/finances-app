---
tags: [frontend, arquitetura]
relacionado: [[MOC - Lumus Finanças]], [[Remoção do Backend]]
status: ativo
tipo: arquitetura
versao: 3.0.0
---

# Análise por Categoria

Filtros, períodos, gráficos, tabelas e apresentação do relatório foram preservados. A consulta e o cálculo dos indicadores foram removidos. A tela apresenta indisponibilidade; o template visual de PDF permanece sem gerar relatório financeiro sem dados.

## Arquivos de apresentação

CategoryAnalysisScreen em `screens/mobile/` e, quando existente, `screens/web/`. Os adaptadores em `app/` e os componentes usados por essas telas permanecem no projeto.

Ver [[Remoção do Backend]] para recuperação, validação e limites atuais.
