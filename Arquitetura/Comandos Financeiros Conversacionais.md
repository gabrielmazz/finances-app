---
tags: [assistente, financeiro, validacao, firestore]
relacionado: [[Assistente Lumus]], [[Cobertura Conversacional Lumus]], [[Gerenciamento de Bancos]], [[Investimentos]], [[Despesas Fixas]], [[Receitas Fixas]], [[Gerenciamento de Tags]], [[Ajuste de Saldo]]
status: ativo
tipo: arquitetura
versao: 1.1.0
---

# Comandos Financeiros Conversacionais

Matriz do executor financeiro do Lumus IA, auditada em 2026-10-04. As 38 ações de `ASSISTANT_ACTION_KINDS` têm executor concreto no legado e no razão; esta nota descreve efeitos e evidências, enquanto [[Cobertura Conversacional Lumus]] compara as rotas físicas e os demais módulos do aplicativo. O modelo propõe argumentos, o aplicativo valida a autorização autenticada vinculada ao pedido/versão e o domínio revalida escopo e persistência. Confirmações são mensagens da conversa, sem controles financeiros obrigatórios.

## Como funciona

`financeCommandService.execute` recebe uma autorização emitida pelo aplicativo para a mensagem atual do usuário. Consulta recibos antes do alvo já alterado pelo commit, revalida fingerprints e escolhe o armazenamento pelo estado do grupo. Bancos, categorias e registros do modelo são handles temporários. O catálogo local é paginado em páginas de 200, mantém todos os dados elegíveis e envia somente uma projeção reduzida ao modelo. `assistantActionId` criado no domínio é conservado nas edições para resolver dependências como criar banco/categoria e registrar nele.

Dinheiro e diferenças são centavos inteiros seguros; CDI usa basis points. Ciclos, validade do plano e resumos mensais usam São Paulo. Operações no razão conservam eventos imutáveis e usam estorno/substituição; contas excluídas são arquivadas. Caixa/investimento não ficam negativos, bancos exigem justificativa auditável quando o domínio permite saldo negativo. Efeitos financeiros não são sucesso por texto do modelo: a resposta usa o resultado persistido.

## Matriz de efeitos

| Ação tipada | Legado: serviço e efeito | Razão: serviço e efeito | Evidência | Estado |
|---|---|---|---|---|
| `create_expense` | SDK transação → expenses + recibo | postMovement(expense) | E + F + U | efeito verificado localmente |
| `update_expense` | SDK transação → expenses; fingerprint | correctMovement(expense): estorno + substituição | E + F + U | efeito verificado localmente |
| `delete_expense` | SDK transação → remove expenses + recibo | reverseTransaction(expense) | E + F + U | efeito verificado localmente |
| `create_gain` | SDK transação → gains + recibo | postMovement(income) | E + F + U | efeito verificado localmente |
| `update_gain` | SDK transação → gains; fingerprint | correctMovement(income): estorno + substituição | E + F + U | efeito verificado localmente |
| `delete_gain` | SDK transação → remove gains + recibo | reverseTransaction(income) | E + F + U | efeito verificado localmente |
| `upsert_monthly_balance` | SDK transação → monthlyBalances | reconcileAccount(bank); administrador | E + F + U | efeito verificado localmente |
| `create_transfer` | executeLegacyFinancialMovement → par expenses/gains + bankTransfers | transferFunds(bank→bank) | E + F + U | efeito verificado localmente |
| `create_cash_withdrawal` | executeLegacyFinancialMovement → cashRescues | transferFunds(bank→cash) | E + F + U | efeito verificado localmente |
| `undo_cash_withdrawal` | SDK transação → remove cashRescues | reverseTransaction(transfer) | E + F + U | efeito verificado localmente |
| `create_mandatory_expense` | SDK transação → mandatoryExpenses | manageFinancialMetadata(mandatoryExpense,create); proprietário | E + F + U | efeito verificado localmente |
| `update_mandatory_expense` | SDK transação → contrato/due/reminder | manageFinancialMetadata(mandatoryExpense,update); proprietário | E + F + U | efeito verificado localmente |
| `delete_mandatory_expense` | SDK transação → remove template; conserva lançamentos | manageFinancialMetadata(mandatoryExpense,delete); proprietário | E + F + U | efeito verificado localmente |
| `pay_mandatory_expense` | SDK transação → despesa + ciclo/parcelas | completeFinancialRecurring(settle); proprietário/ciclo/parcelas | E + F + U | efeito verificado localmente |
| `undo_mandatory_expense_payment` | SDK transação → desfaz vínculo + quantidade exata | completeFinancialRecurring(undo); proprietário/ciclo/parcelas | E + F + U | efeito verificado localmente |
| `create_mandatory_gain` | SDK transação → mandatoryGains | manageFinancialMetadata(mandatoryGain,create); proprietário | E + F + U | efeito verificado localmente |
| `update_mandatory_gain` | SDK transação → contrato/due/reminder | manageFinancialMetadata(mandatoryGain,update); proprietário | E + F + U | efeito verificado localmente |
| `delete_mandatory_gain` | SDK transação → remove template; conserva lançamentos | manageFinancialMetadata(mandatoryGain,delete); proprietário | E + F + U | efeito verificado localmente |
| `receive_mandatory_gain` | SDK transação → ganho + ciclo/parcelas | completeFinancialRecurring(settle); proprietário/ciclo/parcelas | E + F + U | efeito verificado localmente |
| `undo_mandatory_gain_receipt` | SDK transação → desfaz vínculo + quantidade exata | completeFinancialRecurring(undo); proprietário/ciclo/parcelas | E + F + U | efeito verificado localmente |
| `create_investment` | executeLegacyFinancialMovement → financeInvestments; débito de abertura calculado pelo domínio | manageAccount(create): abertura/aporte atômicos; administrador | E + F + U | efeito verificado localmente |
| `update_investment` | executeLegacyFinancialMovement → metadados/principal/valor; fingerprint e saldo projetado do banco | manageAccount(update): metadados, principal corrigido, valor reconciliado; administrador | E + F + U | efeito verificado localmente |
| `delete_investment` | SDK transação → remove cadastro/syncs se sem aportes/resgates | manageAccount(archive); administrador | E + F + U | efeito verificado localmente |
| `deposit_investment` | executeLegacyFinancialMovement → despesa + valor investimento | transferFunds(bank→investment) | E + F + U | efeito verificado localmente |
| `redeem_investment` | executeLegacyFinancialMovement → ganho + valor investimento | transferFunds(investment→bank) | E + F + U | efeito verificado localmente |
| `sync_investment` | SDK transação → valor + financeInvestmentSyncs | reconcileAccount(investment); administrador | E + F + U | efeito verificado localmente |
| `undo_investment_deposit` | executeLegacyFinancialMovement → remove despesa + restaura valor; recusa aporte já resgatado | reverseTransaction(investment_deposit) | E + F + U | efeito verificado localmente |
| `undo_investment_redemption` | executeLegacyFinancialMovement → remove ganho + restaura valor com saldo atual revalidado | reverseTransaction(investment_redemption) | E + F + U | efeito verificado localmente |
| `undo_investment_sync` | SDK transação → restaura valor anterior + remove sync | reverseTransaction(reconciliation_adjustment) | E + F + U | efeito verificado localmente |
| `upsert_cdi_rate` | SDK transação → investmentCdiRates | manageFinancialMetadata(cdi); somente proprietário | E + F + U | efeito verificado localmente |
| `create_bank` | SDK transação → banks + saldo inicial | manageAccount(create): abertura/reconciliação/resumo; administrador | E + F + U | efeito verificado localmente |
| `update_bank` | SDK transação → banks; nome/cor/ícone/isActive | manageAccount(update): isActive/nome/cor/ícone; administrador | E + F + U | efeito verificado localmente |
| `delete_bank` | SDK transação → remove banks; contrato legado | manageAccount(archive); administrador | E + F + U | efeito verificado localmente |
| `create_category` | SDK transação → tags + ícone opcional | manageFinancialMetadata(category,create) | E + F + U | efeito verificado localmente |
| `update_category` | SDK transação → tags; fingerprint | manageFinancialMetadata(category,update) | E + F + U | efeito verificado localmente |
| `delete_category` | manageFinancialMetadata → guard completo + remove tag | manageFinancialMetadata(category,delete); guard histórico completo | E + F + U | efeito verificado localmente |
| `upsert_balance_adjustment` | bankBalanceAdjustment → diferença/substituição auditável | bankBalanceAdjustment → evento/conta/auditoria; administrador | A + U | efeito verificado localmente |
| `revert_balance_adjustment` | bankBalanceAdjustment → inverso na data original | bankBalanceAdjustment → inverso no razão; administrador | A + U | efeito verificado localmente |

### Evidências reproduzíveis

- **E**: `tests/lumusAssistantLegacyEmulator.test.ts`, SDK JavaScript/Auth/Firestore/Functions reais em `demo-lumus-financas`. Verifica as 36 ações financeiras legadas (incluindo os dois undo de ciclos), efeito persistido e retry sem repetir sucesso. Inclui 68 cenários de efeito/retry/concorrência/guardas e serviços de formulário. Só a escolha de armazenamento e os adaptadores de notificações locais são substituídos. Também valida referências stale/inativas, serviços de formulário e concorrência nas oito famílias confiáveis, correção do principal/banco e estorno depois de gastar o resgate ou resgatar o aporte.
- **F**: `backend/tests/functions.emulator.test.ts`, callables reais. Verifica os efeitos únicos de post/correct/reverse, par transferência/Caixa, contas/abertura/arquivo, metadados/categorias/CDI, parcelas de despesa/receita com resto inteiro, histórico e revalidação de autorização. Variantes que compartilham a mesma callable são cruzadas pelos testes U. Inclui negações por outro proprietário/papel, banco inativo, UID tardio, saldo insuficiente, limite de inteiro, fim do plano e exclusão de categoria em uso.
- **A**: `backend/tests/bankBalanceAdjustments.emulator.test.ts`, serviço real de ajuste em legado e razão; diferença, data civil, substituição, estorno, retry simultâneo, saldo stale, argumentos materiais alterados e acesso indevido.
- **U**: `tests/lumusAssistantCommand.test.ts`, fronteira pública do executor com armazenamento/API simulados. Cada ação é validada contra o destino correto do domínio e os grants reais; não substitui E/F/A como evidência de persistência.
- `backend/tests/lumusAssistant.rules.test.ts` prova recibos privados, criação imutável no legado, leituras de metadados compartilhados do grupo e recusa de escrita legada após o corte.
- `tests/lumusAssistantCatalogCompleteness.test.ts` prova 251 registros locais, grupo/ownership, identidade de criação e 502 propostas locais com dependência global além do antigo limite de 20.

O gate opt-in `npm run test:assistant:executor:emulator` exige hosts locais exatos e executa E. O gate `npm run test:integration` compila o backend e inicia um projeto demo local com regras, callables, ajustes e E; nunca aponta para produção. Os testes em uma Suite já aberta usam UIDs/prefixos próprios, sem apagar fixtures de outro fluxo.

## Operações legadas confiáveis

`executeLegacyFinancialMovement` governa transferência, saque, abertura de investimento, aporte/resgate, correção de investimento e estornos de aporte/resgate. Carrega os seis conjuntos completos de saldo do banco por queries **dentro** da transação e reutiliza `calculateLegacyBankBalanceInCents`; lê banco ativo, usuário/cutover, vínculo/propriedade do investimento e seu fingerprint. A revisão do banco participa do mesmo commit para serializar pedidos de diferentes sessões. Débito/crédito, ajuste do investimento, categoria necessária, auditoria e recibo persistem juntos. O SHA-256 de todos os argumentos materiais protege retries; os documentos financeiros usam IDs derivados com SHA-256. A reapresentação do mesmo pedido não repete a escrita, e uma segunda intenção que ultrapasse saldo ou tenha proposta stale é recusada.

`addCashRescueFirebase`, `transferBetweenBanksFirebase`, `addFinanceInvestmentFirebase`, `moveFinanceInvestmentFirebase`, `updateFinanceInvestmentFirebase` e `revertFinanceInvestmentDepositFirebase` e `revertFinanceInvestmentRedemptionFirebase` compartilham esse executor no legado e escolhem as APIs do razão após o corte. A correção do principal que debita o banco projeta o investimento atualizado nas consultas completas do banco, verifica o período original e o saldo atual; trocar banco valida o destino, sem débito parcial. Reduzir principal no mesmo banco pode reparar saldo legado já negativo sem gerar novo débito. Desfazer resgate verifica o saldo atual após retirar o crédito e restaura a posição no mesmo commit; se o crédito já foi gasto, nada muda. Desfazer aporte exige posição atual suficiente para devolver aquele aporte: se o valor já foi resgatado, a operação inteira é recusada, sem zerar a posição nem devolver dinheiro inexistente ao banco. Fingerprints normalizam somente Date/Timestamp reais e preservam nomes e centavos, evitando interpretar nomes de banco como datas no fuso da plataforma.

A preparação de ajustes em lote faz no máximo oito previews simultâneos; mantém todos os itens e a ordem das dependências. `deleteTagFirebase` utiliza o mesmo guard autoritativo de referência histórica da conversa.

Os handlers de aporte/resgate das listas Web/mobile chamam uma única operação de domínio; não sincronizam e depois gravam um lançamento separado.

## Limites e negações comprovadas

- Templates antigos com apenas último ciclo não provam a situação de ciclos anteriores. Novos templates têm `assistantCycleHistoryComplete` e `completedCycles` (ID, quantidade, valor); quando falta evidência, o histórico é declarado indisponível e não se inventa um pagamento/pendência. Nenhum backfill de produção foi executado.
- Corrigir o principal de um investimento no razão exige evento original ou evento importado identificável, propriedade/papel e saldo final permitido. Ausência do original ou estorno anterior bloqueiam com motivo próprio; não há atualização silenciosa do principal sem compensar o banco.
- Excluir categoria exige ausência de referências em lançamentos/templates e no histórico do razão, inclusive outros grupos. Não basta o catálogo recente estar vazio. A callable protege tanto a exclusão conversacional quanto `deleteTagFirebase` usado por Configurações; o guard da UI é apenas uma prévia.
- Lote é um conjunto de operações por item com progresso/recibos; não há promessa de rollback integral. Cancelamento para de iniciar itens e consulta estados já persistidos. Limites de query/transação podem produzir falha explícita, nunca truncamento silencioso ou sucesso do conjunto incompleto. O volume real por família é registrado em [[Validação de Lotes Conversacionais]]: treze famílias com 211 itens e dois cenários reais de recuperação/cancelamento. Isso não equivale a testar todas as combinações das 38 ações em cada papel/plataforma.
- O Emulator comprova regras/efeitos locais com dados sintéticos. Não comprova quota, latência ou attestation de produção, alarmes em aparelho instalado, pagamento bancário externo ou implantação das novas callables/regras. Nenhum deploy/produção foi realizado.

## Arquivos principais e integrações

`services/lumusAssistant/financeCommandService.ts`, `assistantCatalogService.ts`, `functions/FinancialLedgerFirebase.ts`, `LegacyFinancialMovementFirebase.ts`, `BankBalanceAdjustmentFirebase.ts`, `backend/src/index.ts`, `legacyFinancialMovements.ts`, `bankBalanceAdjustments.ts`, `utils/tagIconCatalog.ts` e `firestore.rules`. A máquina de conversa/lote, invalidação de leituras, voz e UI compartilhada estão documentadas em [[Assistente Lumus]]. As notas de bancos, transações, recorrências, tags, transferências, Caixa, investimentos e ajustes descrevem seus contratos específicos.
