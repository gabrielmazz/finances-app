---
tags: [firebase, financeiro, arquitetura]
relacionado: [[Dashboard Home]], [[Fundação Firebase Spark]], [[Segurança e Preparação para Produção]]
status: ativo
tipo: arquitetura
versao: 4.0.0
---

# Gerenciamento de Bancos

Etapa 04 implementa cadastro, consulta, edição cadastral e arquivamento em ambiente Firebase Emulator. Nenhuma operação financeira produtiva está liberada: `requireBankEnvironment` exige o projeto `demo-lumus-foundation`, além da identidade e do contexto corretos. Não foram recuperados serviços da arquitetura abandonada.

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

A leitura conserva os IDs e não toma `valueInCents`, um marcador de conciliação legado ou um snapshot mensal isolado como saldo atual. Conta inativa ou com situação inválida permanece bloqueada; campos de grupo contraditórios não são atribuídos ao contexto pessoal. Um histórico supostamente completo sem prova independente de fronteira e completude não autoriza abertura nem nova movimentação. A implementação atual não possui prova verificável de completude ou procedimento seguro para incorporar uma conta legada reconciliada; nenhuma conta antiga foi liberada ou migrada. São necessários dados autoritativos da conta e um método verificável de incorporação antes de executar isso, inclusive em produção.
