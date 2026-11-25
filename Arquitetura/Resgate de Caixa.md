---
tags: [frontend, arquitetura]
relacionado: [[MOC - Lumus Finanças]], [[Remoção do Backend]]
status: ativo
tipo: arquitetura
versao: 3.0.0
---

# Resgate de Caixa

Na versão de teste, o formulário original debita em centavos uma conta ativa com saldo confirmado. O saque e o saldo são gravados na mesma transação. O extrato usa a identidade ciano de saque. O saque tem classificação própria e fica fora dos totais de receitas e despesas. A tentativa mantém o identificador até a confirmação. O estorno de um saque novo devolve o valor à mesma conta e marca o lançamento como cancelado em um único commit. O saque cancelado fica preservado no Firestore. Lançamentos históricos em dinheiro sem banco podem ser consultados no extrato de dinheiro. A carteira permanece disponível para consulta do histórico, sem saldo próprio estimado.

## Arquivos de apresentação

AddRescueScreen em `screens/mobile/` e, quando existente, `screens/web/`. Os adaptadores em `app/` e os componentes usados por essas telas permanecem no projeto.

Ver [[Remoção do Backend]] para recuperação, validação e limites atuais.

O saque usa a data financeira. A validação do saldo disponível se aplica ao novo efeito bancário. Saques já incluídos na referência e retroativos entram no histórico com efeito zero, conforme [[Gerenciamento de Bancos]].
