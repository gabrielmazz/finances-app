---
tags: [frontend, arquitetura]
relacionado: [[MOC - Lumus Finanças]], [[Remoção do Backend]]
status: ativo
tipo: arquitetura
versao: 3.0.0
---

# Transações de Despesas


Implementação local no Firebase Emulator, sem publicação: os formulários originais gravam e editam lançamentos bancários em `financialContexts/{contexto}/movements/{id}`. O extrato existente consulta páginas e permite cancelar sem exclusão física. Valores são inteiros em centavos e as datas civis são persistidas em UTC. A operação atual representa pagamento ou recebimento efetivo; datas futuras e dinheiro físico permanecem indisponíveis.

Cada criação, edição, troca de conta ou cancelamento ajusta atomicamente o `balanceCents` da conta, partindo da abertura imutável. As Rules locais verificam participação, categoria, conta, identidade do lançamento e diferença do saldo. O identificador persistido do cadastro protege reenvios; há verificação de revisão para edições concorrentes. Os dados originais não são modificados.

O extrato combina páginas novas e legadas em ordem por data, mantendo a origem e o ID. Registros pessoais em `gains` e `expenses` só entram na consulta quando declaram explicitamente os três vínculos de grupo como nulos e possuem categoria protegida e tipo compatível. No caminho protegido `financialGroups/{grupo}/movements`, exige participação atual e categoria identificável. Os documentos sem contexto ou tipo verificável não são classificados nem alterados. Leituras não atualizam saldo; consultas incrementais usam cursores independentes. Identidades em caminhos diferentes não são presumidas iguais sem referência verificável; se o mesmo ID e tipo aparecerem em origens distintas, ou se algum documento consultado não puder ser interpretado, os totais do período ficam indisponíveis para não sugerir uma soma confiável. Contas antigas com saldo não conciliado não aceitam novas movimentações. Não há migração, alteração em produção ou suporte a lançamentos previstos.

## Arquivos de apresentação

AddRegisterExpensesScreen em `screens/mobile/` e, quando existente, `screens/web/`. Os adaptadores em `app/` e os componentes usados por essas telas permanecem no projeto.

Ver [[Remoção do Backend]] para recuperação, validação e limites atuais.

Na 1.7.1, o cadastro e a edição usam a data civil de São Paulo. A edição no mesmo dia preserva o horário registrado e a criação original. A data ou conta nova é conciliada conforme [[Gerenciamento de Bancos]].

## Modalidade de pagamento

Na revisão de 25/11, o emulador e a candidata canônica registram paymentMethod opcional. Novas despesas bancárias começam com Débito selecionado. Registros sem o campo continuam sem classificação até o usuário escolher. Crédito entra nos totais de despesas e tem efeito bancário imediato de zero. Edição e cancelamento calculam a diferença entre os efeitos persistidos. Dinheiro usa accountId nulo, sem modalidade de cartão e sem atualização bancária.

A fatura, seu vencimento e sua liquidação ficam fora do modelo. Lançar a fatura como despesa comum acrescentaria outro gasto ao total. A distribuição oficial dos novos atributos depende das Rules candidatas e de um recibo que habilite paymentExtensionsEnabled. As referências migradas são preservadas.
