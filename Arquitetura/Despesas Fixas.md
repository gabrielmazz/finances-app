---
tags: [frontend, arquitetura]
relacionado: [[MOC - Lumus Finanças]], [[Remoção do Backend]]
status: ativo
tipo: arquitetura
versao: 3.0.0
---

# Despesas Fixas

No emulador, os formulários e a lista originais cadastram, editam e arquivam modelos. O botão de registrar abre a despesa com a categoria e o valor do modelo e solicita a conta. A confirmação grava a despesa, o saldo bancário e o progresso das parcelas na mesma transação. O ID de lançamento identifica o modelo e o ciclo `YYYY-MM`. O último ciclo confirmado pode ser desfeito por transação, com estorno do saldo e das parcelas. O arquivamento do modelo preserva os lançamentos já confirmados.

Parcelas e quitação antecipada usam centavos inteiros. A última confirmação absorve os centavos restantes. Metadados do parcelamento ficam protegidos depois de confirmar parcelas. Modelos históricos exigem verificação antes de serem incorporados. Lembretes automáticos e renegociação continuam indisponíveis.

O formulário de despesa bancária permite registrar um pagamento avulso como gasto obrigatório usando uma categoria compatível. O lançamento debita a conta, mantém a categoria e aparece como despesa obrigatória no extrato. O pagamento avulso é independente dos modelos e ciclos históricos.

## Arquivos de apresentação

AddMandatoryExpensesScreen / MandatoryExpensesListScreen em `screens/mobile/` e, quando existente, `screens/web/`. Os adaptadores em `app/` e os componentes usados por essas telas permanecem no projeto.

Ver [[Remoção do Backend]] para recuperação, validação e limites atuais.
