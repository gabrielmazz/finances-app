---
tags: [frontend, arquitetura]
relacionado: [[MOC - Lumus Finanças]], [[Remoção do Backend]]
status: ativo
tipo: arquitetura
versao: 3.0.0
---

# Transações de Despesas

Campos, seletores, datas, observações e estruturas de criação/edição permanecem. Não há consulta, gravação, estorno, detecção de pagamentos ou atualização de saldo. O formulário mostra a indisponibilidade sem simular registro.

## Arquivos de apresentação

AddRegisterExpensesScreen em `screens/mobile/` e, quando existente, `screens/web/`. Os adaptadores em `app/` e os componentes usados por essas telas permanecem no projeto.

Ver [[Remoção do Backend]] para recuperação, validação e limites atuais.
