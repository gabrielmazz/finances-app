---
tags: [frontend, arquitetura]
relacionado: [[MOC - Lumus Finanças]], [[Remoção do Backend]]
status: ativo
tipo: arquitetura
versao: 3.0.0
---

# Transferências

Na versão de teste, os formulários originais Web e Android aceitam duas contas ativas com saldo confirmado no mesmo contexto. A origem precisa cobrir o valor em centavos. Um único commit do Firestore grava as duas movimentações e atualiza os dois saldos. As Rules exigem a contraparte no mesmo commit, com valor e data iguais, sentido oposto e conta diferente. Cada conta de referência preserva seu próprio corte de data e sua autoridade atual.

O extrato mostra a ponta correspondente à conta e consulta o nome da contraparte sob as Rules quando o detalhe é aberto. As duas pontas são excluídas dos totais de receitas e despesas. Cada tentativa mantém o ID até a confirmação. Estornar uma transferência nova cancela ambas as pontas e reverte os dois efeitos no mesmo commit. A conta que recebeu a transferência deve cobrir o débito do estorno. O reenvio com o mesmo ID não reaplica a diferença. Os registros cancelados permanecem no Firestore e saem da listagem de lançamentos ativos. A edição de transferência continua indisponível. O Firebase oficial permanece em consulta até [[Migração Financeira Definitiva]].

## Arquivos de apresentação

TransferScreen em `screens/mobile/` e, quando existente, `screens/web/`. Os adaptadores em `app/` e os componentes usados por essas telas permanecem no projeto.

Ver [[Remoção do Backend]] para recuperação, validação e limites atuais.

A transferência usa a data financeira. Cada conta no dia da sua referência pede a confirmação correspondente. Cada ponta já contemplada pela referência tem efeito zero. O estorno considera o efeito original de cada ponta. Ver [[Gerenciamento de Bancos]].

Na revisão de 25/11, o seletor recebe as contas elegíveis do contexto ativo. Quando a lista está completa e há menos de duas contas elegíveis, a tela orienta o cadastro em Configurações. A validação de origem e destino distintos permanece no fluxo financeiro.
