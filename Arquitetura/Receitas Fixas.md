---
tags: [frontend, arquitetura]
relacionado: [[MOC - Lumus Finanças]], [[Remoção do Backend]]
status: ativo
tipo: arquitetura
versao: 3.0.0
---

# Receitas Fixas

No emulador, os formulários e a lista originais cadastram, editam e arquivam modelos. Registrar um recebimento abre o formulário de ganho com a categoria e o valor do modelo e solicita a conta. O lançamento, o crédito e a quantidade de parcelas recebidas são gravados juntos. Um reenvio idêntico devolve o mesmo lançamento para o ciclo `YYYY-MM`. O último recebimento pode ser desfeito, com o saldo e o progresso revertidos juntos.

Modelos históricos exigem verificação antes de serem incorporados. Lembretes automáticos e renegociação continuam indisponíveis.

O formulário de ganho bancário permite registrar um recebimento avulso como ganho obrigatório usando uma categoria compatível. O lançamento credita a conta e preserva a categoria e a identificação no extrato. O recebimento avulso é independente dos modelos e ciclos históricos.

## Arquivos de apresentação

AddMandatoryGainsScreen / MandatoryGainsListScreen em `screens/mobile/` e, quando existente, `screens/web/`. Os adaptadores em `app/` e os componentes usados por essas telas permanecem no projeto.

Ver [[Remoção do Backend]] para recuperação, validação e limites atuais.
