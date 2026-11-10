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

Cada conta tem nome, instituição, tipo, cor opcional, centavos iniciais, data da abertura, situação, revisão e autoria/datas de servidor. A abertura imutável contém `type: opening`, valor, data, conta e contexto, motivo obrigatório para valor negativo e autoria. Não gera receita ou movimento. Nesta etapa, o saldo atual das contas novas é exclusivamente a abertura. Movimentações futuras precisarão de invariantes e Rules próprios; não basta atualizar um número no cliente.

`domain/money.ts` converte texto brasileiro em centavos com aritmética inteira, rejeita casas decimais excedentes e valores fora de +/-9.000.000.000.000 centavos. Soma exata com BigInt e limite de inteiro seguro. Formatação BRL centralizada; nenhuma multiplicação de valores financeiros por ponto flutuante.

Edição só altera nome/instituição/tipo/cor, incrementa revisão esperada e preserva abertura/contexto/autoria inicial. Duas edições diferentes com a mesma revisão não vencem simultaneamente. Correção de abertura não está disponível; exige futura operação explícita auditável. Arquivamento apenas de nova conta ativa com saldo zero; preserva os documentos, exclui do total e não permite reabrir/excluir nesta etapa.

## Idempotência e falhas

O ID aleatório de 20 caracteres é persistido em AsyncStorage antes do envio. Apenas esse identificador opaco fica no dispositivo. Uma tentativa repetida usa o mesmo ID e confirma o mesmo par no servidor; payload diferente é conflito. Na corrida de criação, uma rejeição pode ser recuperada somente se o par idêntico já existir e for lido do servidor. Falha de confirmação nunca vira sucesso presumido.

O formulário retém o ID até a ação explícita “Cadastrar outra conta”. Rotação compara o ID confirmado e usa o mesmo lock da alocação: Web Locks entre abas, fila por chave no processo nativo. Formulários antigos não apagam a intenção nova de outra aba. Reinício recupera a conta já gravada; campos financeiros não confirmados não são guardados localmente e precisam ser informados novamente. Apagar o armazenamento do aplicativo elimina essa continuidade local. IDs distintos representam cadastros distintos: nome de banco não identifica uma conta bancária de forma única.

## Segurança

Pessoal: somente UID proprietário. Grupo: leitura para admin/member com claim e `_authorizations` íntegros da Etapa 03 e grupo ativo; escrita somente admin. Perfil/`members` editável não concede acesso. Rules validam campos/tipos/limites, revisões, autoria/horário de servidor e campos imutáveis; `getAfter` exige abertura e conta compatíveis na mesma operação atômica. Exclusões e alterações de abertura são negadas. Grants legados `readOwners` não abrem novos contextos pessoais.

Rules locais são candidatas da Etapa 04 e não foram publicadas. `security/stage03-published.rules` preserva o código exato da versão produtiva anterior. Plano de implantação/reversão e evidências em `docs/stage-04-report.md`.

## Compatibilidade e interface

Leitura legada preserva `banks/{id}` com `personId` exato e `financialGroups/{id}/accounts`. Apenas metadados permitidos podem mudar. Três bancos observados na cópia real autorizada têm snapshots mensais e histórico: não é seguro chamar o último snapshot de abertura ou saldo atual sem reconciliar movimentos. Nenhuma migração, duplicação automática, abertura legada ou inferência de zero. Registros incompletos aparecem bloqueados, com total indisponível.

Telas AddRegisterBank e BankMovements e variantes web/mobile preservadas. Campos adicionais usam primitivas/tokens existentes; consulta exibe origem, saldo e situação. Formulário desabilitado durante carga/envio/recuperação; falhas preservam entradas. Home e consulta compartilham `BankAccountsContext`, páginas de 20 por contexto/situação, sem listener nem varredura histórica. Total somente após todas as páginas e saldos confirmados; conta antiga ou incompatível bloqueia um total enganoso. Refresh pós-gravação aguarda e substitui qualquer listagem anterior ao commit. Ver [[Hooks Customizados]] e [[Auditoria de Design]].
