---
tags: [firebase, financeiro, arquitetura]
relacionado: [[Dashboard Home]], [[Fundação Firebase Spark]], [[Segurança e Preparação para Produção]]
status: ativo
tipo: arquitetura
versao: 4.0.0
---

# Gerenciamento de Bancos

A etapa 04 introduziu cadastro, consulta, edição cadastral e arquivamento no Firebase Emulator. A versão 1.7 usa as Rules canônicas do Firebase oficial e exige a autorização do contexto e a abertura confirmada de cada conta para movimentar o saldo.

## Contas e origem do saldo

Novas contas ficam em `financialContexts/{personal:uid|group:groupId}/bankAccounts/{operationId}`. A abertura fica em `accountOpenings/{mesmo operationId}`, no mesmo contexto. Ambos são criados na mesma transação. Campos exatos e validações estão em `domain/banks.ts` e `firestore.rules`.

Cada conta tem nome, instituição, tipo, cor opcional, centavos iniciais, data da abertura, situação, revisão e autoria/datas de servidor. A abertura imutável contém `type: opening`, valor, data, conta e contexto, motivo obrigatório para valor negativo e autoria. Não gera receita ou movimento. O saldo atual parte da abertura e é atualizado atomicamente com receitas e despesas confirmadas; as Rules validam a diferença financeira junto ao lançamento.

`domain/money.ts` converte texto brasileiro em centavos com aritmética inteira, rejeita casas decimais excedentes e valores fora de +/-9.000.000.000.000 centavos. Soma exata com BigInt e limite de inteiro seguro. Formatação BRL centralizada; nenhuma multiplicação de valores financeiros por ponto flutuante.

Edição só altera nome/instituição/tipo/cor, incrementa revisão esperada e preserva abertura/contexto/autoria inicial. Duas edições diferentes com a mesma revisão não vencem simultaneamente. Correção de abertura não está disponível; exige futura operação explícita auditável. Arquivamento apenas de nova conta ativa com saldo zero; preserva os documentos, exclui do total e não permite reabrir/excluir nesta etapa.

## Idempotência e falhas

O ID aleatório de 20 caracteres é persistido em AsyncStorage antes do envio. Apenas esse identificador opaco fica no dispositivo. Uma tentativa repetida usa o mesmo ID e confirma o mesmo par no servidor; payload diferente é conflito. Na corrida de criação, uma rejeição pode ser recuperada somente se o par idêntico já existir e for lido do servidor. Falha de confirmação nunca vira sucesso presumido.

O formulário retém o ID até a ação explícita “Cadastrar outra conta”. Rotação compara o ID confirmado e usa o mesmo lock da alocação: Web Locks entre abas, fila por chave no processo nativo. Formulários antigos não apagam a intenção nova de outra aba. Reinício recupera a conta já gravada; campos financeiros não confirmados não são guardados localmente e precisam ser informados novamente. Apagar o armazenamento do aplicativo elimina essa continuidade local. IDs distintos representam cadastros distintos: nome de banco não identifica uma conta bancária de forma única.

## Segurança

Pessoal: somente UID proprietário. Grupo: leitura para admin/member com claim e `_authorizations` íntegros da Etapa 03 e grupo ativo; escrita somente admin. Perfil/`members` editável não concede acesso. Rules validam campos/tipos/limites, revisões, autoria/horário de servidor e campos imutáveis; `getAfter` exige abertura e conta compatíveis na mesma operação atômica. Exclusões e alterações de abertura são negadas. Grants legados `readOwners` não abrem novos contextos pessoais.

Rules locais são candidatas da Etapa 04 e não foram publicadas. `security/stage03-published.rules` preserva o código exato da versão produtiva anterior. Plano de implantação/reversão e evidências em `docs/stage-04-report.md`.

## Compatibilidade e interface

No emulador, a leitura pessoal de `banks/{id}` exige `personId` autorizado e campos `groupId`, `financialGroupId` e `ledgerGroupId` explicitamente nulos. Na homologação oficial somente leitura, a pedido do usuário, campos ausentes também são aceitos para registros do UID autenticado: isso não comprova que não sejam registros de grupo. Associações explícitas a grupo na raiz continuam excluídas pelo cliente; a leitura de `financialGroups/{id}/accounts` exige participação atual. Apenas metadados permitidos podem mudar no emulador. Três bancos observados na cópia real autorizada têm snapshots mensais e histórico: não é seguro chamar o último snapshot de abertura ou saldo atual sem reconciliar movimentos. Nenhuma migração, duplicação automática, abertura legada ou inferência de zero. Registros incompletos aparecem bloqueados, com total indisponível.

Uma página sem bancos ativos pode ter continuação: o acordeão de Bancos mantém a paginação existente disponível para consultar a próxima página. A ausência de itens nessa página não é apresentada como prova de que não há bancos no histórico inteiro; fontes indisponíveis e registros não verificáveis são indicados separadamente.

Telas AddRegisterBank e BankMovements e variantes web/mobile preservadas. Campos adicionais usam primitivas/tokens existentes; consulta exibe origem, saldo e situação. Formulário desabilitado durante carga/envio/recuperação; falhas preservam entradas. Home e consulta compartilham `BankAccountsContext`, páginas de 20 por contexto/situação, sem listener nem varredura histórica. O painel adicional foi removido da Home em 10/11; o carrossel original permanece; a edição e o arquivamento usam a tabela original de Bancos em Configurações, e o extrato não exibe painel adicional de dados da conta. Total somente após todas as páginas e saldos confirmados; conta antiga ou incompatível bloqueia um total enganoso. Refresh pós-gravação aguarda e substitui qualquer listagem anterior ao commit. Ver [[Hooks Customizados]] e [[Auditoria de Design]].


### Receitas e despesas no emulador — etapa 06

Contas novas mantêm `initialBalanceCents` e abertura imutáveis. `balanceCents`, `balanceRevision` e `lastMovementId` são atualizados junto ao lançamento em transação, com verificação cruzada nas Rules locais. A edição aplica somente a diferença; troca de conta ajusta ambas; cancelamento reverte o efeito. Contas legadas continuam sem saldo calculado e exigem conciliação antes de novas operações. Nada foi publicado ou migrado.


### Contas anteriores e conciliação

A leitura conserva os IDs e não toma `valueInCents`, um marcador de conciliação legado ou um snapshot mensal isolado como saldo atual. Conta inativa ou com situação inválida permanece bloqueada; campos de grupo contraditórios não são atribuídos ao contexto pessoal. Um histórico supostamente completo sem prova independente de fronteira e completude não autoriza abertura nem nova movimentação. O protótipo de referência abaixo prepara uma conta sintética no emulador sem declarar o passado conciliado; não há autorização de incorporação produtiva.

### Análise de evidências — etapa 08

`readReconciliationPage` lê, sob demanda, a conta autorizada e uma página de até 20 snapshots mensais por proprietário ou grupo; preserva o cursor e rejeita associações contraditórias. Mesmo ao chegar ao fim, o histórico continua pendente: páginas retornadas não provam cobertura das outras fontes nem o instante em que seus efeitos foram incorporados. A versão oficial aceita a exceção de leitura pessoal anteriormente autorizada para metadados de grupo ausentes; isso não verifica propriedade ou abrangência financeira. Sem autorização ou em falhas de consulta, o erro não vira resultado vazio.

`assessReconciliation` compara referências e movimentos já identificados em centavos. O resultado reconciliado ou divergente é **condicional** à confirmação independente de abrangência fornecida ao procedimento: uma flag do cliente não é prova de cobertura. Contas incompatíveis, eventos ambíguos ou cobertura desconhecida ficam pendentes. O cálculo reconhece receitas, despesas, direção de transferências, saques, aplicações, resgates e ajustes; ignora cancelados e só deduplica uma identidade explicitamente comprovada. A análise é somente leitura e não fornece autorização para criação de abertura, liberação de conta ou gravação.

O cálculo antigo, no commit `594f2d2`, partia do último saldo de abertura mensal e incluía receitas, despesas, saques, aplicação inicial e ajustes após o começo do mês; transferências tinham efeitos nas suas pontas. Valores de investimento posteriores e sincronizações não eram automaticamente novos débitos. Sem uma referência externa e prova de cobertura inclusive das fontes legadas, reproduzir a soma não garante o saldo. Na sessão oficial, a primeira página de duas contas continha snapshots, com continuação disponível; isso não determina o saldo nem autoriza incorporar as contas. A listagem distingue fontes por `source:id`; o ID igual, isoladamente, não comprova associação.

### Referência manual — protótipo local MVP 1.1

`previewLegacyReference` simula sem gravar e `prepareLegacyReference` cria atomicamente `bankAccounts/{id}` e `accountOpenings/{id}` no projeto demo. O ID legado, o documento antigo e suas movimentações não mudam. A referência contém centavos confirmados, instante UTC informado, `confirmed` e `pendingReviewed`, além do instante de gravação do servidor. O usuário precisa conferir com o banco os eventos pendentes e todos os efeitos não registrados entre referência e ativação; as Rules não têm acesso ao extrato bancário e não podem verificar essa declaração. O resultado não concilia o histórico anterior.

O protótipo exige que `personId` seja o UID e que os três campos de contexto existam explicitamente com valor nulo, ou então um vínculo pessoal específico e protegido em `_bankScopes/{id}`. Esse vínculo só pode ser criado por autoridade administrativa após verificar a associação; clientes não podem criá-lo ou alterá-lo. Campos de grupo explícitos continuam bloqueados. A leitura somente para homologação autorizada de campos ausentes não é autoridade suficiente para ativar. As duas contas visíveis na sessão oficial tinham UID compatível, mas faltavam campos de contexto; o titular declarou a primeira exclusivamente pessoal, sem autorizar escrita. Ambas permanecem protegidas em produção. Grupo não é suportado. A listagem elimina duplicação somente quando a nova conta traz o vínculo protegido `legacyBankId` com o mesmo ID; arquivamento de uma conta de referência fica bloqueado por enquanto.

A candidata local não permite listar `bankAccounts` diretamente: o aplicativo pagina aberturas imutáveis do tipo `opening` e consulta cada conta por ID. Contas de referência são descobertas nas páginas legadas e de vínculos autorizados, e também consultadas individualmente. Movimentações novas são consultadas por conta, em grupos pequenos na Home, com a autoridade atual verificada pelas Rules. A revogação impede novas leituras protegidas, inclusive páginas seguintes; uma atualização negada limpa os dados previamente exibidos. Não há listener de revogação: dados já carregados em memória são substituídos na próxima atualização. A estratégia adiciona leituras pontuais por conta. As Rules continuam locais e não foram publicadas.

Nas Rules candidatas MVP 1.2.1, um `get` de banco ou movimentação legada por ID aceita o UID proprietário com campos de grupo ausentes ou nulos, somente para leitura. Campos de grupo explícitos exigem participação atual e autorização prévia de leitura do titular; associações divergentes são negadas. Essa exceção é distinta do vínculo protegido necessário para ativar uma conta de referência. Consultas diretas por proprietário ainda exigem campos de grupo explicitamente nulos; sem o índice de descoberta abaixo, elas não retornam documentos em que os campos estão ausentes. A candidata permanece bloqueada para publicação; detalhes e teste de segurança em `docs/mvp-ativacao-controlada.md`.

Histórico do experimento descontinuado: o titular havia autorizado um índice de descoberta separado: `financialContexts/personal:{uid}/legacyBankReadIndex/{id}` aponta ao banco original, e `legacyMovementReadIndex` guarda ID original, origem, conta e data para paginação. Somente a conta pessoal correspondente lê esses índices; clientes não podem gravá-los. O leitor consulta o documento original com as Rules e ignora ponteiros divergentes ou sem autorização. O índice de banco não é `_bankScopes` e não autoriza abrir conta, gravar saldo ou efetuar movimentos. O comando de preparação foi removido e as Rules locais agora negam leitura desses ponteiros; registros com associação explícita a grupo não são indexados. A regra de leitura pessoal para metadados ausentes continua sendo uma exceção autorizada, não prova de que o registro nunca pertenceu a um grupo.

As regras iniciais da referência exigiam data posterior ao dia UTC da confirmação. A regra atual consta na seção da versão 1.6. A ativação usa o mesmo formulário de edição da conta.

### MVP 1.4 — retirada dos ponteiros experimentais

As origens `legacyBankReadIndex` e `legacyMovementReadIndex` não são mais consultadas pelo aplicativo e as Rules negam sua leitura, inclusive para o antigo titular. Os documentos originais continuam intactos. Listagens pessoais seguras exigem os três campos de grupo explícitos e nulos; registros sem esses campos não aparecem nessa listagem, embora IDs conhecidos ainda possam ser lidos conforme as Rules. A incompatibilidade com as listas amplas das Rules oficiais permanece um bloqueio para publicá-las sem perda de histórico. O cliente oficial continua somente leitura.

A candidata também verifica o documento original ao consultar `_bankScopes`; após mudança de grupo não expõe o vínculo antigo. Como a listagem dessa coleção não é autorizada no emulador com a verificação, a descoberta das contas vinculadas fica indisponível e a tela sinaliza a fonte parcial. Isso bloqueia a ativação pela listagem.

O MVP 1.5.1 acrescenta a consulta pontual pelo ID informado nas Configurações do emulador quando a fonte legada está indisponível. O formulário abre somente após a consulta autorizada. A consulta preserva o ID e encaminha ao fluxo de referência existente quando elegível. A listagem automática de documentos com associação ambígua depende de uma decisão sobre como revisar e manter os metadados de contexto.

### MVP 1.6 — referência no modelo canônico

O manifesto grava `referenceNotBefore` na conta migrada. O formulário existente e as Rules recusam referências anteriores a esse instante. A abertura registra o saldo confirmado no mesmo ID, sem reaplicar o histórico anterior. Uma conta ainda sem abertura fica protegida contra gravações de movimentações.

Na 1.7.1, receitas, despesas, ciclos, transferências e saques usam somente a data civil de São Paulo. A confirmação do saldo de referência continua registrando o instante informado pelo titular. Conta aberta sem referência usa a data da abertura como primeiro dia elegível.

Uma data posterior à referência entra no saldo normalmente. No dia da referência, o formulário pergunta se o valor já estava incluído. As Rules exigem a escolha ou reconhecem o instante comprovado dos registros com horário. Um lançamento anterior fica no histórico com efeito zero no saldo. As duas pontas da transferência são avaliadas separadamente e gravadas na mesma transação. A edição reavalia a data e a conta. O cancelamento desfaz somente o efeito efetivamente aplicado. A abertura e o saldo original da referência são imutáveis.

O campo `referenceTreatment` indica `historical` para retroativos, `included` para itens já incluídos no dia e `after` para novos efeitos no dia. Em referências anteriores a 2020, as Rules usam o corte mais tardio no intervalo em que UTC−02 e UTC−03 podem produzir dias diferentes. As referências oficiais a partir da captura de 2026 usam UTC−03. Ver [[Migração Financeira Definitiva]].

### Versão 1.7

As três contas oficiais usam os IDs migrados e o contexto pessoal de cada titular. O formulário original confirma a abertura com o recibo canônico ativo. Na edição de uma conta migrada com referência pendente, a ação de salvar o cadastro fica disponível após a confirmação da abertura. A conta `JYvu` foi ativada pelo titular A em 23/11/2026. `lbq5` e `YX8P` aguardam referências individuais. A soma apresentada como saldo geral exige saldos confirmados de todas as contas da lista. Os seletores de movimentação aceitam individualmente as contas ativas com saldo confirmado.
