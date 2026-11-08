---
tags: [frontend, arquitetura]
relacionado: [[MOC - Lumus Finanças]], [[Remoção do Backend]]
status: ativo
tipo: arquitetura
versao: 3.0.0
---

# Receitas Fixas

Cadastro, lista, calendário, gráficos, campos de parcelas e lembretes permanecem. Recebimentos, atualização de ciclos, renegociação e notificações estão indisponíveis. Prévia de datas e máscaras de campos são operações de interface.

## Arquivos de apresentação

AddMandatoryGainsScreen / MandatoryGainsListScreen em `screens/mobile/` e, quando existente, `screens/web/`. Os adaptadores em `app/` e os componentes usados por essas telas permanecem no projeto.

Ver [[Remoção do Backend]] para recuperação, validação e limites atuais.
