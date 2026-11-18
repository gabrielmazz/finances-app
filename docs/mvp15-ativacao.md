# Lumus Finanças 1.5 — validação de ativação

## Produção

Em 17/11/2026, a consulta oficial confirmou `finances-app-e8685` com faturamento desativado. A fonte publicada das Rules do Firestore coincidiu byte a byte com `security/stage03-published.rules`, SHA-256 `8673e2d0d47641cf787484013a418b642442595994bdcbcbb0e9091c5f6179c8`. A versão nova permanece candidata local. As duas contas fictícias oficiais, suas operações e a ativação da primeira conta real seguem pendentes. Nenhum documento, índice ou configuração oficial foi escrito nesta execução.

### Bloqueio de segurança

As listagens `tags` e `banks` que filtram o UID e os três campos de grupo nulos podem abranger um documento com vínculo protegido contraditório. A consulta de `_bankScopes` por titular também pode abranger um vínculo cujo banco já mudou de contexto. As validações que distinguem esses casos consultam outro documento por ID. O Firestore avalia o conjunto possível de resultados da consulta e não dispõe de filtro que expresse essa relação. `== null` também exclui os campos ausentes. A leitura pontual de um ID conhecido continua capaz de verificar o vínculo atual. [Documentação oficial](https://firebase.google.com/docs/firestore/security/rules-query)

Os testes que exigem listagem legítima e os que negam a mesma consulta na presença de vínculos contraditórios foram preservados. Uma possível revisão é registrar metadados de contexto verificáveis no próprio documento que será lido e definir como mantê-los consistentes com as alterações administrativas. Essa revisão depende de uma regra de autoridade comum para o legado e de autorização específica para preparar documentos oficiais. Toda liberação deve verificar os leitores existentes, inclusive registros com metadados ausentes e registros de grupo.

### Índice identificado

O índice da consulta nova da Home e do extrato tem escopo `COLLECTION` em `movements`, com `status ASC`, `accountId ASC`, `date DESC` e `__name__ ASC`. A inspeção do projeto oficial confirmou a ausência desse índice. Sua criação exige autorização específica, condicionada à validação da candidata e da consulta final. O arquivo integral de índices contém entradas de outros fluxos e não é o artefato de publicação. Índices não resolvem o conflito de autorização acima.

### Cópia de Rules e reversão

A cópia versionada está em `security/stage03-published.rules`, e `firebase.mvp121-rollback.json` referencia apenas essa fonte. Antes de publicar uma candidata aprovada, obtenha novamente a fonte oficial, preserve-a e compare sua soma com a versão guardada. Revise o diff inteiro contra essa fonte, incluindo permissões legadas, participação em grupo, categorias, contas, aberturas e movimentos. Depois do deploy, releia a fonte oficial e compare byte a byte com a candidata validada.

O diff completo desta revisão está em `artifacts/mvp-1.5/rules-publicadas-candidata.diff`. A candidata local testada tem SHA-256 `b8cd4e5e9db5efe97aca3a3675752d4191f945ab0f2ffc5a9c14a589963579e4`.

Se a nova versão bloquear acesso legítimo, interrompa os testes e preserve os IDs e os resultados confirmados. Para uma reversão autorizada ao arquivo verificado, use `npx -y firebase-tools@latest deploy --only firestore:rules --config firebase.mvp121-rollback.json --project finances-app-e8685`. Confirme a soma oficial e refaça as consultas autorizadas. A reversão troca as Rules, e lançamentos já confirmados continuam gravados.

### Primeira conta pessoal

O formulário de banco oferece **Definir saldo de referência** e **Simular referência**, com saldo em centavos, data e hora de São Paulo. A confirmação atômica foi exercitada apenas com dados sintéticos. A homologação oficial oferece prévia em modo de consulta. A próxima confirmação financeira exige identificar pela sessão o UID e o ID da conta, verificar o vínculo e a ausência de abertura, obter uma cópia atual e recuperável dos documentos exatos, verificar escritores concorrentes e obter do titular o saldo real, o instante e a conferência das pendências. O histórico permanece preservado, e os novos lançamentos respeitam a data de corte. A cópia de 09/11/2026 é histórica.

## Escopo validado localmente

- Bancos novos usam a abertura imutável e saldo em centavos. Cadastros e categorias novos operam no emulador. A descoberta legada continua parcial.
- Receitas, despesas e lançamentos obrigatórios avulsos atualizam o saldo pelo mesmo fluxo e o mantêm consistente após edição, cancelamento e reenvio. Os formulários originais de modelos recorrentes e a confirmação vinculada ao ciclo permanecem pendentes.
- Dois lançamentos vinculados e dois saldos são gravados em uma transação de transferência. A autorização e a fronteira de referência são verificadas nas duas contas. Cada extrato mostra sua ponta. O nome da contraparte é consultado ao expandir o detalhe, sob a autorização atual.
- Saques debitam a conta e aparecem no extrato com a identidade ciano. Transferências e saques ficam fora dos totais de receitas e despesas. Estorno e edição dessas operações especiais permanecem indisponíveis.

### Resultados

| Validação | Resultado |
| --- | --- |
| `npm run check` | Estilos, TypeScript e 163 testes aprovados |
| Firebase Emulator | 197 aprovados de 211. As 14 falhas dependem de consultas de descoberta e compatibilidade legadas |
| Chromium | Login, Home, extrato, lançamentos, operações de banco, edição e cancelamento exercitados com dados sintéticos |
| Referência no Chromium | Prévia sem escrita, cancelamento da prévia, confirmação e revogação comprovados abrindo um ID conhecido |
| Expo Doctor | 20 de 20 após alinhar quatro versões de correção do SDK 58 |
| Exportação Web | Builds do emulador e de homologação oficial somente leitura |
| Android | APK local de teste compilado, assinatura e alinhamento verificados. Teste em aparelho pendente |

O teste Web `tests/browser/bank-operations.cjs` usou o Firebase Client SDK e os formulários no emulador. A cada lançamento, leu o saldo persistido no servidor. As duas pontas da transferência e o saque apareceram no extrato. Uma recarga preservou a sessão e a Home mostrou o saldo final. O SDK também confirmou em testes de integração a recusa de um débito isolado, reenvio idempotente, limites em contas de referência e recusa de leitura da contraparte após a revogação.

| Operação sintética | Banco de teste A | Banco de teste B |
| --- | ---: | ---: |
| Abertura | R$ 1.000,00 | R$ 500,00 |
| Receita de R$ 200,00 | R$ 1.200,00 | R$ 500,00 |
| Despesa de R$ 80,00 | R$ 1.120,00 | R$ 500,00 |
| Gasto obrigatório de R$ 50,00 | R$ 1.070,00 | R$ 500,00 |
| Ganho obrigatório de R$ 100,00 | R$ 1.170,00 | R$ 500,00 |
| Transferência de R$ 300,00 | R$ 870,00 | R$ 800,00 |
| Saque de R$ 70,00 | R$ 800,00 | R$ 800,00 |

### Web e teste manual do APK

Inicie `npm run emulators:start` em um terminal e `npm run dev:local:web` em outro para a Web com escrita sintética. A exportação Web do emulador está em `artifacts/mvp-1.5/web-emulator/`. Para acessar dados oficiais em modo de consulta, use `npm run homologation:web`.

O APK `artifacts/mvp-1.5/Lumus-Financas-Emulador-1.5.0-arm64.apk` é a versão 1.5.0, versionCode 3, ARM64, Android 7 ou superior. Usa o pacote separado `com.gabrielmazz.lumusfinances.emulador` e a assinatura local de desenvolvimento. A configuração aponta para Auth e Firestore do emulador em `127.0.0.1`. SHA-256 `f62a566e8de03a7d4e06c4b9049397bb91a34a775762571d6f8d81c460986acd`.

Com o emulador em execução e o aparelho conectado por USB, use `adb devices`, `adb reverse tcp:9098 tcp:9098`, `adb reverse tcp:8089 tcp:8089` e `adb install -r artifacts/mvp-1.5/Lumus-Financas-Emulador-1.5.0-arm64.apk`. Entre com a mesma conta sintética na Web e no Android. Crie um lançamento na Web e consulte no Android. Crie outro no Android e consulte na Web. Feche e reabra os dois clientes e confira saldos, histórico e persistência da sessão. Esse roteiro é para o emulador. A sincronização no Firebase oficial depende da publicação e da validação de produção.

## Testes no Firebase oficial

| Item | Resultado |
| --- | --- |
| Bancos A e B e IDs sintéticos oficiais | Pendente. Criação condicionada à publicação validada |
| Saldos e operações persistidos no oficial | Pendente |
| Segurança e sincronização Web–Android no oficial | Pendente |
| Abertura de referência na primeira conta real | Pendente de validação, cópia atual e confirmação do titular |

## Revisão 1.5.1

Os formulários existentes de ganhos e gastos obrigatórios agora cadastram, editam e arquivam modelos. A confirmação manual usa o formulário original de lançamento. Cada ciclo usa o mesmo ID em reenvios e grava conjuntamente o andamento do modelo, a movimentação e o saldo. O último ciclo confirmado pode ser estornado pela lista original. Os modelos legados são preservados e as confirmações não executam automaticamente.

Quando a listagem legada é recusada no emulador, a tela de configurações permite consultar um banco ou categoria por ID conhecido. A consulta vai ao servidor e reavalia o vínculo atual. Um ID indisponível recebe a mesma resposta que um ID de outro usuário. A paginação de categorias também reconsulta a origem para cada página, para que o cliente respeite a revogação entre consultas.

| Verificação | Resultado |
| --- | --- |
| Suíte completa do Firebase Emulator, duas execuções | 196 aprovados e 17 reprovados de 213. Os dois novos cenários de ciclos passaram |
| Suíte original de 211 casos | 194 aprovados. Dos 14 casos reprovados no 1.5.0, 13 ainda dependem de listagens legadas. Quatro casos adicionais falharam com `auth/user-token-expired` na execução completa |
| Suíte de autenticação e perfis em emulador novo | 13 aprovados de 14. Os quatro casos adicionais passaram. O teste de listagem dos bancos legados foi o único reprovado |
| `npm run check` | Estilos, TypeScript e 163 testes aprovados |
| Expo Doctor | 20 de 20 verificações aprovadas |

O teste que exigia a antiga coleção de ponteiros passou a verificar sua recusa. A cobertura de acesso autorizado ao ID original, associação contraditória e revogação permanece. As listagens de categorias pessoais, consultas paginadas de bancos com vínculo protegido e leitores que dependem dessas consultas seguem bloqueados na candidata. Uma alteração oficial exige validar uma fonte de contexto confiável e provar a compatibilidade dos leitores que já estão em uso.

O Chromium confirmou os fluxos básicos e os novos ciclos, com saldos verificados no servidor. O cenário com os dois bancos terminou em R$ 800,00 em cada conta no emulador. O cenário dos modelos começou em R$ 100,00, confirmou despesa de R$ 25,00 e ganho de R$ 60,00 e terminou em R$ 160,00 após estornar a despesa. A consulta por ID abriu os dois registros autorizados e recusou o banco de outro usuário.

O projeto oficial segue sem faturamento habilitado. As Rules ativas continuam com SHA-256 `8673e2d0d47641cf787484013a418b642442595994bdcbcbb0e9091c5f6179c8`. O [diff desta candidata](../artifacts/mvp-1.5.1/rules-publicadas-candidata.diff) usa a fonte ativa preservada e tem como destino `firestore.rules`, SHA-256 `6c55941a46542861f81e80306ec4ffcde073cae9982ee20598eb38bd64b40a0f`. O procedimento de reversão descrito acima continua disponível. As permissões de produção, os documentos bancários existentes e os demais documentos oficiais ficaram intactos.

O índice de `movements` descrito acima continua ausente no oficial. A consulta atual usa `status == posted`, `accountId ==` ou `in`, ordenação por `date DESC` e desempate por `__name__ ASC`. A criação requer autorização específica. A criação dos bancos fictícios oficiais, a verificação de seus saldos e a confirmação da primeira conta real dependem da publicação validada.

Para usar a Web local, execute `npm run emulators:start` e, em outro terminal, `npm run dev:local:web`. A [exportação Web](../artifacts/mvp-1.5.1/web-emulator/index.html) usa o emulador. O [APK 1.5.1](../artifacts/mvp-1.5.1/Lumus-Financas-Emulador-1.5.1-arm64.apk) tem `versionCode` 4, ARM64, Android 7 ou superior, assinatura local v2 e alinhamento de 16 KiB verificados. SHA-256 `54e53eef1b1e6ee5197963c70884218d181f0173730abae13f81da88a5440b67`. Para o teste por USB, siga o roteiro anterior e use esse APK no `adb install -r`. A homologação em aparelho e a sincronização entre os dois clientes estão pendentes.

## Revisão 1.5.2 com o Firebase oficial

A Web e o APK desta revisão foram compilados com o Firebase oficial `finances-app-e8685`. Os comandos de desenvolvimento continuam apontando para o Firebase Emulator. O Android usa o pacote `com.gabrielmazz.lumusfinances.homologacao` do APK 1.4, com `versionCode` 5. O Firebase Authentication oficial confirmou o provedor de senha habilitado e recusou uma entrada com identidade sintética inexistente. No Chromium, o formulário exibiu a mensagem correspondente. Para validar sua sessão real, entre no Lumus Web local ou no APK usando seu e-mail e senha. Confira Home, bancos, categorias e extrato, reabra o aplicativo para confirmar a sessão, depois saia e entre novamente. A homologação física e a confirmação de login nesta compilação dependem do titular. [Lumus Web local](http://127.0.0.1:4174/web)

Use `npm run homologation:serve` para reabrir o servidor local oficial. Para gerar novamente a [exportação Web](../artifacts/mvp-1.5.2/web-oficial/index.html), execute `npm run homologation:export`. Os comandos de Android estão em [[Processo de Release]]. O emulador continua com os formulários, modelos obrigatórios e operações financeiras testáveis usando contas sintéticas.

O [APK oficial 1.5.2](../artifacts/mvp-1.5.2/Lumus-Financas-Oficial-1.5.2-arm64.apk) tem assinatura verificada contra o certificado do APK 1.4 e alinhamento de 16 KiB. Requer ARM64 e Android 7 ou posterior. O bundle embutido aponta para o Firebase oficial e foi compilado com o host do emulador vazio. SHA-256 `2bf11a18976d2691e37d34b49629cae833b79822da121c4a0cfb1fa0151c5d38`.

Na inspeção de 18/11/2026, o Firestore oficial mostrou 3 bancos raiz e 35 categorias raiz. Nenhum registro dessas coleções correspondeu à consulta que exige os três campos de grupo explicitamente nulos. As duas coleções de associação protegida estavam vazias. Essas contagens confirmam incompatibilidade da listagem candidata com os dados existentes. As Rules locais agora também recusam leituras por ID quando a associação protegida apresenta campos incompatíveis com seu esquema. A listagem precisa de uma classificação de contexto revisada e expressável na consulta, pois o Firestore autoriza o conjunto de resultados possíveis antes de entregar os documentos. [Documentação do Firestore](https://firebase.google.com/docs/firestore/security/rules-query)

| Verificação | Resultado |
| --- | --- |
| `npm run check` | Estilos, TypeScript e 163 testes aprovados |
| Expo Doctor | 20 de 20 verificações com Expo 58.0.26 |
| Integração com Firebase Emulator | 200 de 213 testes passaram. Login, logout, perfil, isolamento por ID, vínculos incompatíveis e revogação passaram em testes dedicados |
| Leitura com as Rules publicadas no emulador | Bancos, categorias, extrato, paginação e isolamento exercitados com dados sintéticos |
| Regressões | 5 cenários de categorias legadas, 2 de descoberta de bancos por associação protegida e 6 de listagem legada direta, incluindo recuperação e compatibilidade |

O [diff da candidata](../artifacts/mvp-1.5.2/rules-publicadas-candidata.diff) compara a fonte oficial e o arquivo local testado, com SHA-256 `43efff86892d7c4b814c25b20bfeb5e35de04f458cb40be21793545c5eb18370`. A validação deve confirmar quais registros históricos são pessoais e quais pertencem a um grupo. Depois dessa revisão, a consulta e a candidata precisam passar pela regressão completa antes da publicação. Os testes oficiais de escrita usarão bancos fictícios isolados após a homologação das Rules e do índice.

As Rules ativas continuam com SHA-256 `8673e2d0d47641cf787484013a418b642442595994bdcbcbb0e9091c5f6179c8` e o Spark foi confirmado com faturamento desativado. A ativação financeira e os testes de gravação no projeto oficial aguardam validação da candidata. Entre os 27 índices do Firestore, o índice `movements` com escopo `COLLECTION` e campos `status ASC`, `accountId ASC`, `date DESC`, `__name__ ASC` está ausente. Sua criação requer autorização específica.
