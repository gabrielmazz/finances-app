---
tags: [frontend, arquitetura]
relacionado: [[MOC - Lumus Finanças]], [[Remoção do Backend]]
status: ativo
tipo: arquitetura
versao: 3.0.0
---

# Resgate de Caixa

Na versão de teste, o formulário original debita em centavos uma conta ativa com saldo confirmado. O saque e o saldo são gravados na mesma transação. O extrato usa a identidade ciano de saque. O saque tem classificação própria e fica fora dos totais de receitas e despesas. A tentativa mantém o identificador até a confirmação. Edição, estorno e lançamento em uma carteira de Caixa seguem indisponíveis.

## Arquivos de apresentação

AddRescueScreen em `screens/mobile/` e, quando existente, `screens/web/`. Os adaptadores em `app/` e os componentes usados por essas telas permanecem no projeto.

Ver [[Remoção do Backend]] para recuperação, validação e limites atuais.
