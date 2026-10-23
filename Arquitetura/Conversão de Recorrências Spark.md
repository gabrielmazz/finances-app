---
tags: [firebase, spark, recorrencias, importacao, parcelas, metadados]
relacionado: [[Recorrências Spark]], [[Importação Financeira Local Spark]], [[Despesas Fixas]], [[Receitas Fixas]], [[Plano de Funcionalidade Completa sem Blaze]]
status: em desenvolvimento
tipo: arquitetura
versao: 0.1.1
spark_module: D02
spark_progress: 48
spark_reviewed_at: 2026-10-19
---

# Conversão de Recorrências Spark

<!-- spark-progress:start -->
## Progresso Spark — 19/10/2026

**D02 — Normalização e importação financeira: 48% implementado / 52% restante.** Notas P/I/D/E: **75/0/50/75**; cálculo e evidências em [[Status da Implementação Spark]].

O percentual corresponde ao módulo completo, incluindo integração e dados, e não somente ao serviço descrito nesta página. **Próxima entrega:** Concluir formatos legados/especiais, capital/cadastros e contas inativas/futuras, conservando proveniência.

Esta revisão prevalece sobre listas de pendências datadas das entregas anteriores abaixo. Implementação local e logs não aprovam publicação nem migração real.
<!-- spark-progress:end -->

Continuação local em 18/10/2026, protocolo v0.10/`financial-proof-v9`, plano `ledger-stage-v3`. O importador do razão converte templates compatíveis de `mandatoryExpenses`/`mandatoryGains`, ciclos ativos comprovados e metadados. A cópia bruta continua intacta e o grupo permanece bloqueado. Não há captura, migração ou ativação de usuários reais.

## Preparação e pendências

`backend/scripts/lib/sparkRecurringImport.ts` integra `buildSparkLedgerImport`, usado por `plan-ledger`/`import-ledger`. Seleciona templates com grupo explícito ou proprietário membro do grupo analisado, recusa conflito de proprietário/grupo e valida tipos sem converter números fracionários/string em centavos. O nome, contrato, contadores, datas e referências precisam ser representáveis pelo contrato Spark. O alias ambíguo `installments` não é convertido por suposição.

Cada template é preparado isoladamente: só acrescenta todos os documentos canônicos depois de passar suas verificações. Um erro conserva a fonte e gera `recurringImport.issues` com caminho/código, sem gravar parte de uma definição ou reiniciar seu contador. Os demais templates podem compor um **candidato parcial bloqueado**. `converted`, `warnings` e `allScopedTemplatesConverted` são diagnóstico local, não autorização de ativação. A versão/protocolo/cópia/grupo/corte entram no hash do plano, e importar exige sua reconstrução e o hash revisado.

## Ciclos e parcelas comprovados

Pagamentos vêm das transações do razão que referenciam exatamente aquele template. Precisam de tipo compatível, mesmo autor/proprietário, uma única referência recorrente, conta bancária/Caixa e valor positivo. Fontes especiais ou múltiplas referências exigem adaptadores próprios. Estornos já presentes no razão resolvem o original: ele não volta a ser ciclo ativo.

`completedCycles` é conferido contra ID, mês civil de São Paulo, quantidade e valor reais. Últimos vínculos `lastPayment*`/`lastReceipt*` precisam apontar para uma dessas efetivações ativas no ciclo correto. Referência órfã, duplicidade no mês, valor incompatível ou histórico declarado completo que omite pagamento geram pendência. Vínculo legado em `expenses/gains` sem correspondente comprovado no razão ainda exige normalização própria.

Contrato finito exige total contratual explícito em centavos, quantidade entre 1 e 360, valor mensal compatível e início/fim coerentes. O contador armazenado precisa ser exatamente a soma das quantidades ativas comprovadas; não há inferência por meses decorridos nem multiplicação para inventar principal ausente. A distribuição é revalidada pelo utilitário existente, incluindo o resto na última parcela.

Quando há mais de uma efetivação ativa parcelada, a ordem é dada por `createdAt` dos commits originais, preservando a precisão de até nanossegundos do bruto. Datas efetivas podem ser retroativas. Instantes ausentes/empatados ou valores incompatíveis com essa ordem geram pendência; não se escolhe uma ordem arbitrária para conceder autoridade ao desfazimento. Cada ciclo recebe a faixa anterior/posterior comprovada para a proteção de desfazimento de [[Recorrências Spark]].

## Cobertura histórica

`historyFromCycle` é um limite protegido da definição, usado somente para **novas efetivações**. Definição nova o recebe igual a `startCycle`; o cliente não pode alterá-lo depois. Quando há histórico completo declarado e início conhecido, a conversão usa esse início. Sem evidência suficiente de completude, conserva os pagamentos conhecidos e limita novos registros ao mês posterior ao corte, com aviso `recurring-history-restricted-after-cutoff`. Meses anteriores não viram pendentes por ausência de um campo.

Desfazer um pagamento comprovado continua possível antes desse limite, pois depende do receipt exato e do estado do ciclo. O limite não apaga eventos nem altera saldos históricos. Sem data inicial conhecida, um início mínimo baseado nas evidências recebe aviso; declarar histórico completo sem data inicial comprovável gera pendência. Categoria inexistente/incompatível é preservada com aviso para revisão antes de novos pagamentos.

## Representação sem duplicar dinheiro

A conversão acrescenta:

- `sparkRecurringPlans/{planId}`: definição, contador comprovado, vigência e cobertura, revisão inicial zero;
- `cycles/{YYYY-MM}`: efetivação ativa, conta, valor, quantidade e faixa comprovados;
- receipt imutável `imported_recurring_settlement`, identificado por grupo/transação fonte e aceito somente pelo desfazimento específico;
- `sparkRecurringMetadata/{planId}` e `sparkImportRecurringMappings/{planId}`, com proveniência por caminho/hash;
- receipt administrativo `imported_recurring_plan`, sem efeito financeiro.

A matemática original permanece nos nós `imported_movement` já construídos para cada conta. Receipts de vínculo **não são inseridos novamente nas cadeias**. Leitores futuros não devem somá-los como outra receita/despesa. A projeção de saldo continua percorrendo cada perna uma vez. O inverso novo de uma efetivação importada entra normalmente na cadeia na data escolhida, e as revisões/cotas/ciclo impedem duplicação.

O calendário protegido se estende aos anos necessários à vigência dos contratos convertidos, dentro do limite já suportado até 2100. Isso não ativa pagamentos futuros. Fontes originais com referências especiais continuam bloqueadas para estorno ordinário, inclusive após a conversão; usar somente o fluxo do ciclo.

## Metadados e serviço compartilhado

`utils/sparkRecurringMetadata.ts` valida esquema fechado. `functions/SparkRecurringMetadataFirebase.ts` salva vencimento, dias úteis, descrição e configuração versionada de lembrete, com revisão própria, receipt imutável e cota obrigatória. Apenas o proprietário atual da definição, ainda membro do grupo, pode editar; ser administrador não transfere essa autoridade. Edição de configuração não muda contrato, contador, revisão financeira ou saldo.

Vencimento pode ficar não configurado (`null`), ou entre 1 e 31; descrição até 2.000 caracteres; antecedência entre zero e três dias; hora/minuto válidos. Habilitar lembrete exige vencimento e ao menos uma ocorrência antes/no dia. O importador preserva configurações v1 válidas. Configurações anteriores à v1 permanecem desativadas com aviso, como no serviço de lembretes existente; versão futura desconhecida ou configuração inválida exige revisão. Salvar configuração não agenda nem envia notificação por si só.

## Limites

Validação final: `npm run test:spark` aprovou 502 cenários, zero ignorados (16 novos), seguidos dos cinco scripts existentes de Rules. `npm run test:spark:restore` aprovou 14 ensaios, incluindo conversão/desfazimento/projeção e restrição de cobertura. `npm run check` aprovou estilos/tipos, 103 testes locais das ferramentas (16 novos) e 815 comuns; 88 condicionais ignorados não contam como homologação integrada. Evidências em `.expo/spark-proof-2026-10-18/recurring-conversion/`. Recusas de Rules por esgotamento do orçamento de expressões/acessos não são aceitas como proteção.

Esta ponte atende formatos do razão com evidências compatíveis. Normalização executável de todo o legado, parcelas inferidas/sem principal, ajustes importados, fontes compostas e contas inativas/futuras continuam pendentes conforme os relatórios. Definições/ciclos antigos em bruto não são alterados. Grupo continua `spark_importing`, sem CLI de ativação; consentimento/corte e proteção dos escritores antigos permanecem necessários.

Home, extrato e análise por categoria já leem termos/ciclos compatíveis do Spark. Listas/formulários Web/mobile, assistente, previsão, agendamento de lembretes e aparelhos ainda precisam ser integrados e homologados. Outros cadastros e ciclo completo dos investimentos continuam no plano. Não houve publicação, alteração de dados reais ou cobrança habilitada.
