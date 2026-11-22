# Conciliação do Lumus Finanças 1.6.0

A RC.2 tem nova captura, ensaio integral e uma proposta de preservação das 22 exceções. O [manifesto de corte vigente](mvp160-corte.md) identifica as duas fases de Rules e os índices. As contagens e hashes abaixo registram a revisão anterior.

Em 20/11/2026, a captura de `finances-app-e8685` usou o instante de leitura **16:24:56 em São Paulo**. Os 987 documentos foram restaurados em um emulador sem rede externa. A contagem e o hash do conteúdo restaurado corresponderam ao esperado. A comparação por caminho, campos e revisão entre as capturas de 18 e 20/11 encontrou zero inclusões, exclusões ou alterações. O projeto segue no Spark, com Auth por senha e as Rules publicadas da Etapa 03.

## As 852 pendências

A tabela apresenta o primeiro motivo em cada documento. A coluna de impacto indica o resultado **condicional** de comprovar as 38 associações. Uma movimentação pode depender de mais de uma origem.

| Tipo | Ocorrências | Origens responsáveis | Evidência disponível | Correção | Desbloqueio possível | Confirmação humana |
| --- | ---: | ---: | --- | --- | ---: | --- |
| Banco sem associação comprovada | 3 | 3 | UID ativo, perfil e referências históricas. Nenhum vínculo independente na captura. | Comprovar destino pessoal ou de grupo por conta. | 3 | Sim, na origem |
| Categoria sem associação comprovada | 35 | 35 | UID ativo, perfil e referências históricas. Nenhum vínculo independente na captura. | Comprovar destino pessoal ou de grupo por categoria. Agrupar decisões com a mesma evidência. | 35 | Sim, na origem |
| Dependência de banco | 697 | 3 bancos | Os caminhos de conta existem. A associação está pendente. | Recalcular com a associação comprovada e verificar categoria, autor e demais referências do lançamento. | 427 | A confirmação da origem basta para os 427 |
| Dependência de categoria | 109 | 19 categorias | Os caminhos existem. A associação está pendente. | Recalcular com a associação comprovada e verificar conta, autor e recorrência quando aplicável. | 32 | A confirmação da origem basta para os 32 |
| Referência bancária incompleta | 8 | 1 conta ausente e 1 registro sem identificador | Sete apontam para o mesmo destino ausente. Um ganho veio sem identificador de conta. | Buscar documento ou prova histórica para o ID ausente e conciliar o ganho sem referência. | 0 com as confirmações das 38 origens | Sim, nesta captura |
| **Total** | **852** | | | | **497** | |

**38 entidades de origem** requerem comprovação. **806 documentos** apontam primeiro para uma dessas dependências. **459** deles passariam a ter destino validado se as 38 hipóteses pessoais fossem confirmadas e se os hashes de origem continuassem iguais.

O reprocessamento hipotético evidencia 355 documentos com problemas próprios, agrupados em 31 conjuntos por causa, titular declarado, contexto e referências. Os números abaixo são uma visão das mesmas 852 pendências.

| Tipo após a reavaliação | Ocorrências | Grupos / origens implicadas | Evidência disponível | Correção proposta | Desbloqueio possível | Confirmação humana |
| --- | ---: | --- | --- | --- | --- | --- |
| Escopos de dependências incompatíveis | 272 | 17 grupos, 15 caminhos de origem implicados | A hipótese para banco, categoria ou relação da operação produz contextos diferentes. | Reunir evidência para cada relação incompatível. Preservar a origem se a contradição persistir. | Até 272 mediante comprovação das relações | Sim |
| Titular incompatível com o contexto | 73 | 9 grupos, 9 caminhos de origem implicados | O UID declarado no lançamento diverge do titular pessoal do contexto projetado. | Comprovar vínculo ou referência correta sem conceder acesso a outro titular. | Até 73 mediante comprovação de autoridade | Sim |
| Referência bancária incompleta | 8 | 4 grupos, 1 conta ausente e 1 registro sem identificador | O backup de 09/11 também não contém a conta referenciada. | Recuperar a origem exata ou comprovar a relação do documento. | Até 8 com evidência adicional | Sim |
| Referência de categoria ausente | 2 | 1 grupo que aponta para 1 ID ausente | O cruzamento encontrou dois IDs de categoria ausentes no total. Uma terceira referência de categoria ausente está em um documento já bloqueado por conta. Nenhum dos dois IDs consta do backup de 09/11. | Comprovar a categoria histórica antes de aceitar a relação. | Até 2 nesta linha | Sim |

Dos 852 documentos pendentes, 851 têm UID ativo declarado e um usa um identificador histórico sem correspondência no Auth. O cruzamento incluiu perfis e relações históricas, vínculos de grupo, autorizações protegidas, contas e categorias referenciadas, transferências e recorrências. O inventário não encontrou associação protegida, grupo ou delegação verificável. As relações históricas do perfil fornecem pistas para a revisão. A titularidade exige evidência independente.

## Entrega e evidência

| Métrica | RC.1 | Nova simulação oficial |
| --- | ---: | ---: |
| Pendências | 852 | 852 |
| Pendências efetivamente resolvidas de forma automática | 0 | 0 |
| Pendências efetivamente resolvidas por dependência | 0 | 0 |
| Origens que exigem comprovação | 38 | 38 |
| Candidatos a duplicidade no plano | 0 | 0 |
| Destinos validados para criação | 0 | 0 |
| Registros preservados onde estão | 135 | 135 |
| Documentos que bloqueiam o corte | 852 | 852 |
| Gravações oficiais | 0 | 0 |

A ferramenta mantém a titularidade e o contexto como precondições. Recalcula o plano a partir da mesma captura após cada decisão aprovada. Uma confirmação se vincula ao hash da origem e continua sujeita às evidências de Auth, grupo, titular e dependências. Os lançamentos históricos em dinheiro com ausência explícita de banco preservam o valor e ficam fora do saldo bancário. Parcelamentos antigos com total ausente podem recuperar o total pelo número de parcelas e pelo valor mensal registrados, em centavos. Um total armazenado com formato inválido exige revisão. Essas duas correções tornam mais 22 destinos possíveis na simulação condicional. A projeção financeira aplica ajuste de saldo igual a zero.

A revisão agrupada e o manifesto estão cifrados fora do repositório, no diretório privado `~/.local/share/lumus-backups/mvp160-20261120/`, em `review-r2.enc` e `dry-run-r2.enc`. A chave fica em diretório separado. O comando `review` recria a planilha e os detalhes em tmpfs privado a partir do relatório cifrado. Caminhos de registros, identidades, revisões e referências por documento estão na cópia privada. O procedimento completo está em [Migração Financeira Definitiva](../Arquitetura/Migração%20Financeira%20Definitiva.md).

## Simulação após confirmação de titularidade

O titular confirmou que os bancos e as categorias são seus. A consulta ao Firebase Auth confirmou dois UIDs ativos e identificou a conta da sessão oficial verificada. Os dois UIDs têm e-mails distintos e nenhum identificador de provedor federado em comum. A decisão pessoal foi aplicada às 35 origens que correspondem ao UID verificado, preservando o contexto desse UID.

| Métrica | Antes | Após confirmação |
| --- | ---: | ---: |
| Pendências | 852 | 462 |
| Origens comprovadas na simulação | 0 | 35 |
| Dependentes desbloqueados na simulação | 0 | 355 |
| Destinos canônicos validados no plano | 0 | 376 |
| Candidatos a duplicidade no plano | 0 | 0 |
| Gravações oficiais | 0 | 0 |

As 462 pendências atuais incluem um banco e duas categorias sob o segundo UID, 349 dependências bancárias, 29 de categoria, 71 divergências de titular, oito referências bancárias incompletas e duas referências de categoria ausentes. Confirmar a titularidade do segundo UID mantendo os registros no contexto dele poderia liberar mais 107 documentos. Nesse cenário, os 355 conflitos e referências pendentes descritos na seção inicial seguem em revisão. Uma eventual unificação dos dois UIDs exige uma decisão de escopo própria.

O manifesto cifrado dessa etapa é `dry-run-confirmed.enc`, com a revisão correspondente em `review-confirmed.enc`.

## Simulação após verificar o segundo login

O titular entrou pela interface oficial de consulta em uma sessão dedicada. O UID autenticado coincidiu com o UID do último banco e das duas categorias restantes. A simulação manteve os dois contextos pessoais originais e comprovou as 38 origens. O segundo login liberou 3 origens e 104 dependentes.

| Métrica | Após a primeira confirmação | Após verificar os dois logins |
| --- | ---: | ---: |
| Pendências | 462 | 355 |
| Origens comprovadas | 35 | 38 |
| Dependentes desbloqueados desde o inventário | 355 | 459 |
| Destinos validados para criação | 376 | 483 |
| Candidatos a duplicidade | 0 | 0 |
| Gravações financeiras oficiais | 0 | 0 |

Os 497 documentos de origem validados correspondem a 483 destinos. Em 14 transferências, o cabeçalho e as duas pontas são representados no destino pelas duas pontas vinculadas. Os registros originais permanecem preservados.

| Pendência atual | Registros | Evidência para revisão agrupada |
| --- | ---: | --- |
| Banco e autor coincidem, com categoria do outro login | 256 | O banco e o UID declarado apontam para o mesmo contexto. |
| Categoria e autor coincidem, com banco do outro login | 9 | A categoria e o UID declarado apontam para o mesmo contexto. |
| Transferência entre os dois contextos pessoais | 3 | Um cabeçalho e duas pontas referenciam bancos dos dois logins. |
| Modelos obrigatórios com vínculo de ciclo incompatível | 4 | O modelo e o lançamento associado ao ciclo têm referências incompatíveis entre os contextos. |
| Titular incompatível com a categoria | 73 | São 72 movimentos e um modelo. A categoria aponta para o outro UID e a triagem não encontrou conta que comprove o contexto. |
| Referência bancária incompleta | 8 | Sete compartilham um ID de conta ausente. Um ganho sem ID de conta também usa um identificador histórico sem UID ativo correspondente. |
| Referência de categoria ausente | 2 | Os dois documentos têm uma conta identificada. A categoria segue sem documento de origem comprovado. |

O manifesto desta etapa `dry-run-two-logins.enc`, a revisão `review-two-logins.enc` e a prova da sessão `second-login-proof.enc` estão cifrados no mesmo diretório privado. O titular escolheu manter os dois contextos pessoais e conciliar as referências por grupo.

## Conciliação agrupada com os dois contextos preservados

A simulação dos 12 grupos por banco e categoria projeta **252 movimentações conciliadas**. O banco e o UID declarado concordam em todos os casos. Cada categoria usada no histórico recebe uma cópia canônica arquivada no mesmo contexto do banco. As 12 cópias mantêm o ID, o nome e a proveniência da categoria histórica. A categoria do outro login conserva o seu destino e fica sujeita às Rules do próprio contexto. As cópias arquivadas podem ser consultadas pelo histórico e ficam fora dos seletores de novas operações. O corte oficial exige aprovação desse tratamento no manifesto.

Quatro movimentos inicialmente elegíveis estavam ligados a ciclos obrigatórios. Eles seguem com seus modelos em revisão. Três observações antigas com quebra de linha ou tabulação foram adaptadas para exibição, com o texto original preservado no campo histórico e no backup.

| Resultado | Dois logins verificados | Após projetar a conciliação |
| --- | ---: | ---: |
| Pendências | 355 | 103 |
| Documentos de origem com transformação validada no plano | 497 | 749 |
| Destinos validados no plano | 483 | 747 |
| Grupos de exceções restantes | 31 | 21 |
| Candidatos a duplicidade | 0 | 0 |
| Gravações financeiras oficiais | 0 | 0 |

| Exceção restante | Registros | Grupos | Decisão ou evidência necessária |
| --- | ---: | ---: | --- |
| Contextos incompatíveis | 20 | 7 | Oito documentos de ciclos obrigatórios, nove lançamentos ligados a banco do outro login e os três documentos de uma transferência entre contextos. Confirmar as relações por grupo antes de transformar. |
| Titular incompatível com a categoria | 73 | 9 | São 72 movimentações explicitamente em dinheiro, com banco nulo, e um modelo obrigatório. Confirmar o contexto de cada grupo sem propagar a associação da categoria. |
| Referência bancária incompleta | 8 | 4 | Confirmar a conta dos sete documentos com ID ausente e a origem do ganho que veio sem ID. |
| Referência de categoria ausente | 2 | 1 | Recuperar a categoria original ou confirmar a referência correta. |

O plano `dry-run-categories-r2.enc` e o relatório `review-categories-r2.enc` usam a captura restaurada e guardam os caminhos, os hashes das origens, os destinos projetados e os dependentes. O plano não ajusta saldos e as 103 pendências impedem sua aplicação.

## Conciliação dos lançamentos em dinheiro

O titular confirmou os 72 lançamentos identificados nos nove grupos de dinheiro sem conta. A decisão registra a categoria de origem, o UID confirmado e o hash de cada lançamento. O plano resolveu 71 dos 72. O último pagamento pertence a um gasto obrigatório ativo ainda sem categoria futura definida no próprio contexto. O UID, a categoria histórica, a data e a ligação com o ciclo coincidem. O pagamento e o modelo permanecem vinculados na revisão.

| Resultado | Antes da confirmação do dinheiro | Após a confirmação |
| --- | ---: | ---: |
| Pendências | 103 | 32 |
| Documentos de origem com transformação validada | 749 | 820 |
| Destinos validados no plano | 747 | 818 |
| Grupos de revisão | 21 | 13 |
| Candidatos a duplicidade | 0 | 0 |
| Gravações financeiras oficiais | 0 | 0 |

Os 71 lançamentos mantêm banco nulo. As categorias históricas arquivadas que o plano já previa atenderam aos nove grupos. O efeito histórico por banco permaneceu idêntico e o ajuste de saldo é zero.

| Exceção restante | Registros | Grupos | Evidência |
| --- | ---: | ---: | --- |
| Contextos incompatíveis | 20 | 7 | Quatro modelos ativos e seus pagamentos têm UIDs diferentes. Nove lançamentos apontam para banco do outro login. Cabeçalho e duas pontas da transferência concordam em valores, data e vínculos, com UID diferente do dono da conta de saída. |
| Gasto obrigatório com último pagamento em dinheiro | 2 | 1 | O titular do pagamento foi confirmado. Falta definir a categoria ativa do modelo para as próximas ocorrências. |
| Referência bancária incompleta | 8 | 4 | Sete documentos apontam para a mesma conta ausente. Um ganho não tem identificador de conta e declara um UID histórico sem correspondência. |
| Referência de categoria ausente | 2 | 1 | A conta está identificada. A categoria de origem permanece ausente. |

O plano atual está em `dry-run-cash.enc` e a revisão em `review-cash.enc`. Ambos permanecem cifrados no diretório privado da captura. A aplicação continua bloqueada pelas 32 pendências.

## Categoria futura do gasto obrigatório pago em dinheiro

O titular escolheu uma categoria ativa do mesmo login, compatível com gastos obrigatórios. O plano mantém o modelo e o último pagamento no mesmo contexto pessoal. O modelo aponta para a categoria escolhida nas próximas ocorrências. O pagamento permanece ligado ao ciclo original, com banco nulo e sua categoria histórica arquivada nesse contexto. A decisão registra os hashes do modelo e da categoria ativa e depende da confirmação anterior do pagamento.

| Resultado | Antes da escolha | Com a categoria futura |
| --- | ---: | ---: |
| Pendências | 32 | 30 |
| Documentos de origem com transformação validada | 820 | 822 |
| Destinos validados no plano | 818 | 821 |
| Grupos de revisão | 13 | 12 |
| Gravações financeiras oficiais | 0 | 0 |

Os três destinos adicionais representam o modelo, seu último pagamento e a cópia arquivada da categoria histórica. O efeito histórico em cada conta bancária permaneceu igual. As 30 pendências restantes são 20 conflitos de contexto, oito referências bancárias incompletas e duas referências de categoria ausentes. Dos 20 conflitos, nove lançamentos formam dois grupos para conferência do banco indicado.

O manifesto `dry-run-mandatory-category.enc` e a revisão `review-mandatory-category.enc` estão cifrados no diretório privado da captura. A categoria e os caminhos específicos da revisão ficam nesses arquivos.

## Conta confirmada e autoria original

O operador confirmou oito lançamentos de dois grupos para a conta indicada no contexto secundário. A declaração esclareceu que titularidade da conta e acesso aos dois logins são evidências distintas. Cada decisão vinculou os hashes do banco, da categoria e dos lançamentos confirmados. O plano usa o contexto da conta e preserva o autor histórico e a categoria arquivada. A migração dessas origens não concede acesso de um login ao outro.

| Resultado | Antes | Após a confirmação |
| --- | ---: | ---: |
| Pendências | 30 | 22 |
| Documentos de origem com transformação validada | 822 | 830 |
| Destinos validados no plano | 821 | 829 |
| Grupos de revisão | 12 | 11 |
| Gravações financeiras oficiais | 0 | 0 |

Uma despesa cuja conta foi indicada com incerteza continua pendente. Os backups anteriores preservam a referência original e há lançamentos com o mesmo rótulo em ambos os contextos. A comparação de rótulo, data e valor não encontrou correspondência exata que comprovasse outra conta. A divergência está documentada em `note-bank-authorship.enc`, vinculada ao hash da origem.

Dos 22 documentos pendentes, 12 têm conflito de contexto e dez têm referências bancárias ou de categoria incompletas. Os 12 correspondem à despesa ainda sem conta confirmada, a quatro modelos obrigatórios com seus quatro pagamentos e aos três documentos de uma transferência entre contextos. O ajuste de saldo previsto é zero. O manifesto `dry-run-bank-authorship.enc` e a revisão `review-bank-authorship.enc` continuam cifrados e bloqueados para aplicação pelas 22 pendências.

## As 13 falhas reproduzidas

| Caso | Classificação | Verificação após a correção |
| --- | --- | --- |
| Restauração e enumeração de bancos recuperados | Configuração do ensaio | Restauração validada com a fonte exata das Rules hoje publicadas, UID, referências e paginação. |
| Bancos legados incompletos e ambíguos | Descoberta legada descontinuada | Listagem bloqueada, sem retornar contas incompletas ou ambíguas. |
| Arquivamento e IDs históricos de categorias | Descoberta legada descontinuada | Categoria conhecida pode ser lida pelo ID nas Rules de transição. Arquivamento e ID preservados. |
| Categoria raiz de grupo | Consulta incompatível com a autoridade exigida | Listagem raiz negada. Listagem do contexto e acesso por ID autorizado continuam cobertos. |
| Categorias homônimas com IDs distintos | Descoberta legada descontinuada | Os dois IDs continuam acessíveis pelos caminhos autorizados. |
| Paginação de mais de 1.000 categorias | Dependência de migração e do ponteiro legado | Mais de 1.000 registros paginados no namespace canônico, incluindo ID migrado. A leitura do ponteiro é negada. |
| Enumeração dos bancos do próprio usuário | Descoberta legada descontinuada | A listagem da raiz é negada na candidata. A leitura de ID próprio e o isolamento continuam exercitados. |
| Remoção de acesso de criador de banco de grupo | Expectativa legada no teste de segurança | Acesso ao banco pessoal por ID continua. Banco de grupo e listagens legadas são negados. Revogação canônica testada. |
| Categorias pessoais sem ponteiro | Descoberta legada descontinuada | A origem pessoal valida por ID. A categoria do grupo e a descoberta na raiz ficam bloqueadas. |
| Listagem de bancos pessoais por campos históricos | Consulta incompatível com a autoridade exigida | Listagem negada e leituras por ID verificadas para os dois contextos. |
| Preparação de conta com vínculo protegido | Expectativa legada no teste de segurança | A preparação exige o vínculo correto por ID. O cliente não pode criar ou listar vínculos. |
| Paginação de vínculos protegidos | Descoberta de metadados descontinuada | Vínculo próprio por ID e recusa de UID de terceiro. Paginação financeira testada nas coleções canônicas. |
| Matriz `query.own` | Expectativa legada da matriz | Registra a recusa na candidata e mantém a prova da consulta publicada no ensaio de recuperação. |

A suíte completa do Emulator passou **215 de 215**. `npm run check` passou **179 testes**, com verificação de estilo e tipos. O Firebase Spark isolado passou **7 de 7** pelo SDK cliente sob o hash exato da candidata. As duas exportações Web foram servidas localmente e renderizaram o login em largura de desktop e de celular.

O ensaio completo bloqueou a aplicação de um manifesto com pendências e aceitou as revisões explícitas de categorias sintéticas. A execução verificou 22 destinos, origem preservada, IDs estáveis, retomada sem duplicidade, valores históricos, transferência em duas pontas, saque, lançamento em dinheiro, isolamento e revogação. Pelo SDK cliente, um lançamento com autor de outro login ficou acessível somente no contexto da conta confirmada e conservou a autoria original. Um ciclo futuro usou a categoria ativa escolhida, o ciclo histórico foi recusado para nova confirmação e apenas o lançamento futuro afetou o saldo sintético. Um segundo ensaio cobriu paginação, rollback e referência atômica no ID original. No Firebase real isolado, cadastro e manutenção de bancos e categorias, receitas, despesas, obrigatórios, transferências, saques, consultas da Home e do extrato, concorrência, reenvio e saldos após operações passaram. O ensaio com o manifesto oficial aguarda a conciliação das referências restantes.

## Remoção de compatibilidade

O cliente canônico usa somente `bankAccounts`, `accountOpenings`, `categories`, `movements` e `mandatoryTemplates` para dados financeiros. Os formulários e as telas atuais usam os mesmos caminhos de aplicação. O cliente oficial passa a selecionar o modelo canônico quando seu registro de release contiver o hash do manifesto aplicado e o hash verificado das Rules canônicas, com a liberação financeira habilitada. Conta migrada permanece com operações bloqueadas até confirmar a referência. O fluxo atual de referência pelo cliente é pessoal.

| Candidatos à remoção física após a validação oficial | Dependência antes do corte |
| --- | --- |
| Fallbacks e leitura legada em `firebase/banks.ts`, `firebase/categories.ts`, `firebase/movements.ts` e `contexts/BankAccountsContext.tsx` | Cliente oficial de consulta e ensaios de recuperação |
| Sondagens de reconciliação e busca por ID legado em `firebase/reconciliation.ts`, `firebase/financialContext.ts` e `hooks/useLegacyRecordLookup.ts` | Testes da transição e recuperação sob as Rules publicadas |
| Regras, fixtures e registros de lookup para ponteiros legados | Os testes negativos continuam provando que o ponteiro não concede acesso. A candidata lê diretamente pelo namespace. |
| Comandos das etapas de preparação anteriores e conversões dos leitores legados | Validar consumidores com a versão oficial. Manter transformação administrativa, arquivo, verificação e rollback para recuperação. |

As coleções de origem continuam preservadas. A remoção física do código dependente da leitura oficial aguarda a validação dos destinos oficiais. O APK de homologação existente é o da RC.1. O corte e a distribuição oficial continuam pendentes.

## Manifesto para autorização

| Campo | Valor ou condição |
| --- | --- |
| Projeto | `finances-app-e8685` |
| Identificação do ensaio | `conciliation-20261120` |
| Manifesto de revisão mais recente | `8efddf3faf69f10768d2a8891c8a9c0aa34b3d535c57d4d88ca4fe338f36e7f6`. Bloqueado pelas 22 pendências. |
| Backup associado | `e04bf7209264793b291265ff467c93c152814ccf66dd1ea0bf304c2d7f9bbd87`. Recibo de restauração com 987 documentos e hashes iguais. |
| Rules atuais | `8673e2d0d47641cf787484013a418b642442595994bdcbcbb0e9091c5f6179c8` |
| Rules candidatas | `4f5ba12847f49d876121e21737b490483d6824728cf8b77e9c85c9b0db1011ac` |
| Índices | Dois índices canônicos de `movements` ausentes entre os 27 oficiais. [Definições](../security/financial-canonical.indexes.json). Criação mediante autorização específica. |
| Escopo executável | Obter a aprovação dos UIDs, dos contextos, das origens, dos destinos e das projeções financeiras no manifesto privado da execução. |
| Janela | Fechar a revisão, obter backup restaurado com menos de 24 horas, confirmar a pausa de escritores privilegiados e refazer a comparação integral de origens, destinos e Auth. A pausa ainda não foi confirmada. |
| Gravação | Aguardar aprovação explícita do novo hash e do escopo. Somente criações previstas, em lotes retomáveis. A aplicação oficial exige zero pendências. |
| Verificação | Conferir destinos e origens, índices `READY`, testes críticos e Rules publicadas pelo hash. Validar SDK, Home e extrato com a versão oficial antes de distribuir. |
| Reversão | Com a escrita ainda fechada, reverter apenas os destinos criados pelo procedimento e suas revisões esperadas. Mudança concorrente exige recuperação dirigida. |
| Ativação por conta | Após validar a sequência, registrar o hash aplicado e as Rules verificadas no cliente. Confirmar o saldo e a data/hora da referência na conta antes de qualquer operação financeira nova. |

O operador deverá entregar o manifesto cifrado sem pendências e o escopo aprovado antes da fase de gravação. A aprovação privada contém `projectId`, `runId`, `manifestSHA256`, `rulesSHA256`, `ownerUids`, `contexts`, `clientFinancialWritesDenied` e `privilegedWritersPaused`. A reversão automática requer também `rollbackBeforeClientRelease`. As Rules oficiais e os índices só são publicados na sequência prevista.
