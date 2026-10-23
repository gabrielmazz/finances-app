---
tags: [firebase, spark, recorrencias, parcelas, financeiro, seguranca]
relacionado: [[Protocolo Financeiro Spark]], [[Operações Ordinárias Spark]], [[Despesas Fixas]], [[Receitas Fixas]], [[Importação Financeira Local Spark]], [[Plano de Funcionalidade Completa sem Blaze]]
status: em desenvolvimento
tipo: arquitetura
versao: 0.4.1
spark_module: F07
spark_progress: 80
spark_reviewed_at: 2026-10-22
---

# Recorrências Spark

<!-- spark-progress:start -->
## Progresso Spark — 22/10/2026

**F07 — Recorrências e parcelas: 80% implementado / 20% restante.** Notas P/I/D/E: **100/75/50/75**; cálculo e evidências em [[Status da Implementação Spark]].

O percentual corresponde ao módulo completo, incluindo integração e dados, e não somente ao serviço descrito nesta página. **Próxima entrega:** Concluir restauração integral das intenções, compatibilidade restante, assistente e homologação. Replanejamento com sucessor/configuração atômicos, desfazimento ordenado e liquidação de parcelas após o prazo já possuem serviço/Rules e entradas Web/mobile.

Esta revisão prevalece sobre listas de pendências datadas das entregas anteriores abaixo. Implementação local e logs não aprovam publicação nem migração real.
<!-- spark-progress:end -->

## Renegociação e parcelas após o prazo — 22/10/2026

`SparkRecurringReplanFirebase` cria sucessor finito para o **saldo negociado restante**, arquiva o predecessor e grava metadados/receipt/cota atomicamente. Nome, tipo, categoria e configuração são preservados pela ponte; a tela pede total, quantidade, primeiro ciclo e motivo, mostra a revisão do acordo e confirma uma vez. Não soma o novo valor aos pagamentos antigos nem inventa quitação pelo calendário. O primeiro ciclo deve ser atual/futuro e não pode já ter pagamento no predecessor. Total inteiro, divisão e resto são validados no cliente e nas Rules. Despesa e receita usam o mesmo protocolo.

O predecessor guarda sucessor/origem e não pode ser pago, restaurado ou ter pagamentos desfeitos isoladamente. O sucessor conserva o vínculo de origem. Desfazer replanejamento exige revisões atuais, ausência de pagamentos pendentes de desfazimento no sucessor e resolução de sucessores posteriores; reativa o anterior e marca o novo contrato como cancelado, preservando ambos. Contratos cancelados não ganham restauração comum. O fluxo está nas listas Web/mobile; falha de agenda posterior não repete o commit.

`lateSettlement:true` permite liquidar **parcelas finitas restantes** depois de `endCycle`, com motivo e ciclo/data compatíveis. Sem essa marca o prazo continua obrigatório; recorrências ilimitadas não a aceitam. Receipt/ciclo têm a mesma marca, quantidade e faixa originais; quitação negociada continua exclusiva de despesa finita. Home mostra o saldo vencido no vencimento original e a previsão o inclui uma única vez no primeiro mês, inclusive após uma liquidação parcial no mês. Leitura valida a marca antes de aceitar ciclo posterior ao prazo. O prazo original e os lembretes contratados não são prorrogados silenciosamente; um novo calendário exige renegociação.

Intenções incertas ainda precisam do formulário montado e dos mesmos dados/IDs. Após recarga, os vínculos permitem consultar/desfazer um acordo confirmado, mas não há journal geral para recuperar qualquer rascunho financeiro.


## Integração e quitação negociada — 22/10/2026

Datas de início/fim e do pagamento são adaptadas como campos civis para a interface; o serviço mantém instantes reais nos ciclos. As listas conferem o mês de São Paulo, inclusive quando o aparelho já está no dia/mês seguinte. O ensaio de Tóquio reproduziu e eliminou o avanço indevido do fim do contrato para o mês seguinte.

As quatro telas de cadastro e quatro listas Web/mobile usam `SparkRecurringFormFirebase`/`useSparkRecurringForm`. Definição e configuração usam dois receipts não monetários retomáveis; efetivação/desfazimento usa uma única operação financeira com ciclo, contador, saldo e cota atômicos. Leitor expõe revisão dos metadados e estados validados de cada ciclo. Planos arquivados próprios podem ser restaurados na lista, sem novo pagamento. Fontes nativas nos formulários ordinários são encaminhadas para o serviço de recorrência antes de qualquer lançamento comum.

`settlementMode:'negotiated'` permite quitação de **despesa finita**, com valor pago positivo e motivo explícito. Receipt e ciclo guardam `contractAmountInCents`, reconstruído pela faixa contratual, além de `amountInCents`, que é o caixa real. Contador avança pela faixa, sem distribuir desconto pelo contrato nem alterar parcelas anteriores. Estorno devolve somente o valor pago e restaura a mesma quantidade. Sem modalidade, continua obrigatória a soma exata do contrato; ganho e recorrência ilimitada não aceitam a modalidade. O formulário usa a modalidade somente ao selecionar Quitar parcelas com quantia diferente do nominal; nesse caso, preencher observações com o motivo. Valor nominal não exige justificativa de negociação. Valores negativos/zero, motivo ausente, modo desconhecido, nominal forjado e ciclo divergente são recusados nas Rules, sem efeitos parciais.

Lembretes conservam D0, dias úteis e o contador confirmado; sincronização após login/retorno não presume pagamentos pelo calendário. A edição comum mantém o contrato imutável; renegociação e liquidação após o prazo usam os fluxos explícitos descritos acima. Intenções desta ponte ainda vivem em memória; retomada persistente da ativação mensal é outro fluxo.


## Leitura dos compromissos na Home — 19/10/2026

`SparkRecurringReadFirebase` pagina todas as definições e configurações do grupo, de 200 em 200, e lê os ciclos de cada definição no horizonte corrente de 24 meses adicionais. Limita a concorrência a dez planos. Compara revisões/cabeças das definições e dos metadados depois das leituras e refaz até três vezes; mudança contínua, rede/permissão recusada, UID trocado ou acesso revogado produzem erro. Não existe leitura financeira legada nesse serviço.

`sparkRecurringReadModel` valida schema, contrato, contador explícito, vigência e metadados. O resultado declara `cycleWindow`: uma lista de ciclos nessa janela não prova o restante do histórico. `buildSparkUpcomingMandatoryItems` usa dias civis/dias úteis existentes, pula os ciclos ativos conhecidos e respeita `historyFromCycle`. O calendário não incrementa `installmentsCompleted`; a última parcela conserva o resto contratual (333 + 333 + 334). Plano completo, inativo ou sem vencimento declarado não cria compromisso. A Home mostra até três itens de cada tipo; não efetiva nem altera ciclos durante a leitura.

O leitor valida também revisão, identidades da efetivação/conta, quantidade, faixa de parcelas, centavos e data civil de cada ciclo consultado. No contrato finito, reconstrói a quantia pela faixa original, incluindo o resto. Uma flag `active:true` incompleta não é prova de pagamento nem pode esconder compromisso.

Este leitor alimenta [[Dashboard Home]]. Listas, formulários, previsão, agendamento de lembretes e executor do assistente ainda precisam ser conectados ao mesmo domínio. A decisão sobre push foi resolvida pelo proprietário: aceitar avisos ao abrir/retornar ao app e manter lembretes locais; não há push de alterações remotas com todos os aplicativos fechados. Ver [[Notificações]].

Núcleo compartilhado de despesas/receitas recorrentes e parcelas implementado em 18/10/2026, protocolo v0.9, marcador protegido `financial-proof-v8`. `functions/SparkRecurringFirebase.ts` usa Firebase Auth, SDK Firestore e Rules, com Functions desligadas nos ensaios. Ainda não substitui os serviços publicados das telas e do assistente nem prepara recorrências reais automaticamente.

## Definição e cadastro

`createSparkRecurringPlanFirebase` cria `financialGroups/{groupId}/sparkRecurringPlans/{planId}` com proprietário, tipo `expense`/`gain`, nome, categoria opcional, valor mensal, início civil `YYYY-MM`, contrato finito opcional, revisão zero e parcelas efetivadas zero. ID estável, receipt e cota são atômicos. Reenvio exato retorna o receipt; outro ID não recria a mesma definição. Membro só cadastra para si.

`updateSparkRecurringPlanFirebase` edita nome/categoria, valor de recorrência sem parcelamento e estado ativo, exigindo revisão confirmada. Não muda proprietário, tipo, contrato, período nem contadores. Para parcelamento, valor mensal é derivado do contrato original e permanece imutável. Arquivar preserva definição/ciclos e bloqueia novas efetivações; desfazer pagamentos continua permitido ao proprietário. Reativar exige categoria compatível. Não há delete físico de definição/ciclo pelo cliente.

Esta definição cobre o contrato financeiro. Vencimento/dias úteis, descrição e configurações de lembrete têm serviço separado na continuação abaixo; integração dos metadados às telas/agendas ainda precisa de adaptação. Alterar o contrato finito exige o fluxo explícito de replanejamento descrito acima; não reescrever parcelas anteriores nem inferir quitação pelo tempo transcorrido.

Continuação v0.10: [[Conversão de Recorrências Spark]] introduziu o marcador `financial-proof-v9`, acrescenta `historyFromCycle` protegido e serviço próprio para vencimento/dias úteis/descrição/lembretes. Esses metadados têm revisão independente e não alteram dinheiro. A integração às telas/agendas continua pendente. Templates compatíveis do razão passam a ser convertidos por plano bloqueado, com contador e ciclos comprovados, sem reinício automático. O marcador vigente é `financial-proof-v15`, com [[Criação Retroativa de Investimentos Spark]]; candidatos de importação precisam ser revisados para esse destino.

## Efetivação

`settleSparkRecurringFirebase` recebe definição/ciclo, conta de banco ou Caixa, data efetiva, quantidade e revisão confirmada. Na mesma transação cria receipt `recurring_settlement`, atualiza posição/revisão/predecessor, definição/contador e `cycles/{YYYY-MM}`, além da cota obrigatória do UID. Ciclo ativo não pode ser pago outra vez. Quantidade e valor realmente lançados ficam no ciclo e no evento imutável.

A data deve estar dentro do mês civil de São Paulo escolhido e da vigência contratual. As Rules usam o calendário protegido de [[Reconciliação de Dados Spark]], sem depender do fuso do aparelho. O índice mensal do contrato usa ano/mês do início UTC do calendário, que nesta zona cai no mesmo mês civil; métodos disponíveis em [Firebase Rules Timestamp](https://firebase.google.com/docs/reference/rules/rules.Timestamp). Datas financeiras futuras continuam fora desse comando.

Sem parcelas, quantidade é um e o valor pode ser ajustado na confirmação, como no comando existente do razão. Com parcelas, quantidade vai de um ao saldo restante, no máximo 360, e valor deve ser a soma exata do contrato. O cliente reutiliza `getMandatoryInstallmentValueInCents`; as Rules reconstroem divisão inteira e resto. Contrato de 1.000 centavos em três parcelas produz 333 + 333 + 334. Quitar várias parcelas antecipa essa quantidade em um único lançamento, incluindo o resto somente ao completar o contrato.

Não existe backfill automático por meses decorridos. Para definições novas, zero é a quantidade inicial declarada pelo cadastro. Para dados antigos, contador e cobertura histórica precisam ser conferidos pela ponte de importação antes de criar a definição equivalente; não usar este cadastro para reinicializar um contrato existente.

## Desfazimento

`undoSparkRecurringFirebase` exige ciclo, receipt de efetivação original e revisão atual da definição. Cria evento inverso na data solicitada, na mesma conta e valor exatos; desativa o ciclo e restaura a quantidade original na mesma transação. Recibo original permanece imutável. A revisão global serializa pagamentos e desfazimentos entre ciclos; revisão e identidade do ciclo impedem desfazer novamente um recibo já desfeito ou substituído.

Para contratos finitos, somente a faixa de parcelas mais recentemente efetivada pode ser desfeita. O contador atual deve coincidir com `installmentsAfter` daquele ciclo. Isso evita desfazer 333 de uma parcela antiga e cobrar 334 como nova última parcela, alterando o total do contrato. Depois de desfazer as faixas posteriores, a faixa anterior pode ser desfeita. Essa verificação existe também nas Rules, independentemente do cliente.

Uma nova efetivação do ciclo desfeito cria outro receipt, incrementa as revisões e conserva os anteriores no histórico. Recorrências sem prazo, cujo contador fica zero, permitem desfazer ciclos independentes. Administrador não substitui o proprietário nessa operação, seguindo `completeFinancialRecurring` do backend. Operações genéricas de edição/estorno não aceitam `recurring_settlement`.

## Saldos, segurança e histórico

Recorrências reutilizam as funções de posição, categoria e efeito após checkpoint de [[Operações Ordinárias Spark]]. Um pagamento anterior a uma conferência posterior conserva o evento, mas pode ter efeito atual zero. O inverso usa a data escolhida para desfazer. Caixa/investimento não podem ficar negativos; recorrências não movimentam conta de investimento; banco negativo exige justificativa. Prazo mensal vencido, limite monetário, cota por UID e sessão/grupo atuais continuam obrigatórios.

As Rules têm schemas fechados e verificam os documentos em conjunto. O guard da definição certifica contrato/valor, titularidade, quantidade e fonte do desfazimento; o do ciclo certifica estado e identidade; o do receipt obriga mutação das duas estruturas e da posição. Não basta gravar uma flag de pago. Alterar contrato/autor, omitir qualquer parte, inventar centavos ou usar receipt anterior é recusado. As transações leem antes de escrever; callbacks não enviam notificações.

Os eventos de pagamento/desfazimento entram nas cadeias financeiras existentes, com diferença assinada, instante e predecessores. Projeção individual e agregados de movimentos usam o mesmo normalizador. Adaptadores futuros de extrato/totais devem classificar `recurring_settlement` pelo `recurringType`, e tratar `recurring_reversal` como inverso; não somar também o estado do ciclo como outra receita/despesa.

## Limites da entrega

Validação: `npm run test:spark` aprovou 486 cenários, zero ignorados (53 novos nesta continuação), e os cinco scripts existentes de Rules. `npm run test:spark:restore` aprovou os 12 ensaios anteriores com o marcador vigente, sem ativar grupos reais. `npm run check` aprovou estilos/tipos, 87 testes locais de ferramentas e 815 testes comuns; 88 condicionais ignorados não contam como homologação integrada. Evidências em `.expo/spark-proof-2026-10-18/recurring/`. A verificação de Rules inclui gravações diretas sem usar o serviço, omissão de cada parte da transação, valores/categorias/quantidades inventados, contrato alterado e desfazimento de parcela fora da ordem.

`import-ledger` continua bloqueado e conserva templates/ciclos antigos em bruto. [[Conversão de Recorrências Spark]] converte os formatos compatíveis do razão em `sparkRecurringPlans`, com pendências explícitas para os demais; fontes especiais continuam sem permissão de resolução ordinária. Habilitar grupo sintético no harness não autoriza ativação real. Compatibilidade de todo o legado/parcelas inferidas, corte dos escritores anteriores e consentimentos continuam pendentes.

Integração de formulários/listas/assistente, agendamento de notificações, demais relatórios e homologação em navegador/aparelhos permanecem pendentes. O protocolo de metadados já foi implementado em [[Conversão de Recorrências Spark]] e sua leitura foi conectada aos compromissos da Home nesta continuação. A limitação de push com todos os aplicativos fechados foi aceita explicitamente pelo proprietário. Não houve deploy, dados reais nem habilitação de cobrança nesta entrega.
