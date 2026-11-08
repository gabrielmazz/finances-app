---
tags: [frontend, arquitetura]
relacionado: [[MOC - Lumus Finanças]], [[Remoção do Backend]]
status: ativo
tipo: arquitetura
versao: 3.0.0
---

# Ajuste de Saldo

Formulário compartilhado, banco, saldo informado, data e observações permanecem. Prévia, diferença contabilizada, edição e estorno estão indisponíveis. `useBankBalanceAdjustmentForm` mantém apenas estado local de campos.

## Arquivos de apresentação

BankBalanceAdjustmentScreen em `screens/mobile/` e, quando existente, `screens/web/`. Os adaptadores em `app/` e os componentes usados por essas telas permanecem no projeto.

Ver [[Remoção do Backend]] para recuperação, validação e limites atuais.
