---
tags: [frontend, arquitetura]
relacionado: [[MOC - Lumus Finanças]], [[Remoção do Backend]]
status: ativo
tipo: arquitetura
versao: 3.0.0
---

# Investimentos

Cadastro, carteira, gráfico de evolução e estruturas de modais de aporte, resgate, edição e avaliação estão preservados. Não existem projeção CDI, rentabilidade, financiamento, sincronização ou transação executável. Dados de carteira ficam indisponíveis.

## Arquivos de apresentação

AddFinanceScreen / FinancialListScreen em `screens/mobile/` e, quando existente, `screens/web/`. Os adaptadores em `app/` e os componentes usados por essas telas permanecem no projeto.

Ver [[Remoção do Backend]] para recuperação, validação e limites atuais.
