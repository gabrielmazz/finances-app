---
tags: [frontend, arquitetura]
relacionado: [[MOC - Lumus Finanças]], [[Remoção do Backend]]
status: ativo
tipo: arquitetura
versao: 3.0.0
---

# Dashboard Home

Cards de bancos e dinheiro, indicadores, gráficos, calendário de compromissos e timeline permanecem nas composições existentes. `useHomeScreenData` consome contas compartilhadas em `BankAccountsContext`; contas antigas têm saldo em conciliação, nunca zero presumido. A timeline usa o mesmo adaptador e componente do extrato para mostrar até seis movimentos recentes das contas carregadas, em páginas limitadas, sem alterar dados. Receitas, despesas, transferências, saques e aportes ou resgates legados com tipo verificável conservam suas identidades; um vínculo explícito com a última ocorrência de um lançamento obrigatório preserva sua identificação. As demais ocorrências históricas sem vínculo verificável não recebem classificação inventada. Movimentos incompatíveis são omitidos e dados parciais não são apresentados como totais definitivos. Operações de investimentos e demais módulos não reconstruídos permanecem indisponíveis. Abertura de conta não é ganho. Sem prompt automático para novo saldo mensal. Ver [[Gerenciamento de Bancos]] e [[Fundação Firebase Spark]].

O projeto oficial permanece em homologação financeira somente leitura. O índice decrescente de saques `CICAgJiHgokK` foi publicado isoladamente com autorização específica e está `READY`. A consulta oficial descendente respondeu sem o fallback, mas a página consultada não retornou saques; a paginação com 45 registros foi verificada somente no emulador. O usuário informou um saque em conta vinculada, para a qual a sessão atual não apresentou autorização protegida verificável; dados dessa conta não foram consultados. Se o índice ficar indisponível, o fallback ascendente avisa quando uma página com 20 saques não comprovar que contenha os mais recentes. O modo pessoal aceita campos de grupo ausentes exclusivamente pela autorização expressa do usuário, com a limitação registrada em [[Fundação Firebase Spark]].

## Arquivos de apresentação

HomeScreen em `screens/mobile/` e, quando existente, `screens/web/`. Os adaptadores em `app/` e os componentes usados por essas telas permanecem no projeto.

Ver [[Remoção do Backend]] para recuperação, validação e limites atuais.
