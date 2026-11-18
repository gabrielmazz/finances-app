---
tags: [frontend, arquitetura]
relacionado: [[MOC - Lumus Finanças]], [[Remoção do Backend]]
status: ativo
tipo: arquitetura
versao: 3.0.0
---

# Transferências

Na versão de teste, os formulários originais Web e Android aceitam duas contas ativas com saldo confirmado no mesmo contexto. A origem precisa cobrir o valor em centavos. Um único commit do Firestore grava as duas movimentações e atualiza os dois saldos. As Rules exigem a contraparte no mesmo commit, com valor e data iguais, sentido oposto e conta diferente. Cada conta de referência preserva seu próprio corte de data e sua autoridade atual.

O extrato mostra a ponta correspondente à conta e consulta o nome da contraparte sob as Rules quando o detalhe é aberto. As duas pontas são excluídas dos totais de receitas e despesas. Cada tentativa mantém o ID até a confirmação. Transferências confirmadas são preservadas no extrato; edição e estorno ainda estão indisponíveis. O Firebase oficial permanece em modo de consulta.

## Arquivos de apresentação

TransferScreen em `screens/mobile/` e, quando existente, `screens/web/`. Os adaptadores em `app/` e os componentes usados por essas telas permanecem no projeto.

Ver [[Remoção do Backend]] para recuperação, validação e limites atuais.
