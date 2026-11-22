# Lumus Finances 1.6 — Ativação oficial

**Estado do corte — migração aplicada e conferida em 22/11/2026.** O Firebase oficial `finances-app-e8685` está no Spark com as Rules de transição. A releitura registrou os **829 destinos correspondentes**, as **987 origens intactas** e as **22 exceções preservadas**. As operações financeiras dos clientes permanecem bloqueadas enquanto as duas sessões oficiais são verificadas.

Após a aprovação, a restauração isolada repetiu a prova de igualdade dos 987 documentos. A releitura oficial de **22/11/2026 às 12:01:49 em São Paulo** confirmou as revisões, o inventário do Auth e os hashes do manifesto. O titular confirmou a pausa de suas sessões administrativas. O IAM confirmou a suspensão das duas contas de serviço às **12:07:18**. Os dois índices aprovados ficaram em `READY` às **12:12:21**, com os 27 originais preservados. A publicação das Rules de transição foi verificada às **12:12:29**, e o diário registrou o último lote às **12:17:00**. A verificação integral terminou às **12:23:43**. A reativação das duas contas de serviço foi conferida às **12:23:46**. Horários de São Paulo.

## Contagem da migração

A captura de **21/11/2026 às 23:45:28 em São Paulo** confirmou os mesmos 987 caminhos, campos e revisões do manifesto anterior. O Auth conserva as identidades inventariadas e os dois UIDs dos perfis ativos. Uma terceira identidade no inventário Auth fica fora dos dois contextos financeiros do corte. O backup cifrado restaurou todos os 987 documentos em um emulador com rede isolada. Os hashes de conteúdo da restauração e da origem coincidem. O procedimento conferiu a leitura de cada perfil e rejeitou as leituras cruzadas.

| Coleção de origem | Transformação validada | Preservada na origem | Exceção proposta | Total |
| --- | ---: | ---: | ---: | ---: |
| `bankTransfers` | 14 | 0 | 1 | 15 |
| `banks` | 3 | 0 | 0 | 3 |
| `cashRescues` | 2 | 0 | 0 | 2 |
| `expenses` | 563 | 14 | 13 | 590 |
| `financeInvestmentSyncs` | 0 | 39 | 0 | 39 |
| `financeInvestments` | 0 | 2 | 0 | 2 |
| `gains` | 200 | 42 | 4 | 246 |
| `investmentCdiRates` | 0 | 1 | 0 | 1 |
| `mandatoryExpenses` | 12 | 0 | 4 | 16 |
| `mandatoryGains` | 1 | 0 | 0 | 1 |
| `monthlyBalances` | 0 | 34 | 0 | 34 |
| `tags` | 35 | 0 | 0 | 35 |
| `users` | 0 | 2 | 0 | 2 |
| `pushDevices` | 0 | 1 | 0 | 1 |
| **Total** | **830** | **135** | **22** | **987** |

As 830 origens projetam **829 criações**. As 14 transferências já contam com duas pontas entre as origens. Seus cabeçalhos passam a ser representados pelo vínculo entre as pontas e 13 categorias históricas arquivadas são acrescentadas nos contextos aprovados. A conta é `830 − 14 + 13 = 829`. Os destinos são 3 bancos, 48 categorias, 765 movimentos e 13 modelos de obrigatórios. Há 765 origens de movimento distintas e cada transferência é balanceada entre as duas pontas. Todos os documentos de origem são preservados.

O ensaio isolado do manifesto atualizado aplicou os 829 destinos e comparou todos os seus campos. Os centavos, datas, estados, autores e vínculos coincidem com o plano conciliado anterior. O SDK paginou 337 e 428 movimentos nos dois contextos e recusou acessos cruzados no canário e nas Rules finais. A migração cria histórico, mantém as três contas aguardando referência e prevê ajuste de saldo de **R$ 0,00**.

O manifesto `4d276cc7c225a9b82e276425a7026092ad6e61d83495522eec64a4a0280dfaca` foi autenticado e reproduziu o plano da captura anterior, as fontes de Rules anteriores e os mesmos dois índices. O manifesto abaixo vincula a captura nova, o piso de referência das três contas e as Rules que tratam o horário do lançamento. A verificação oficial de leitura confirmou as 987 origens e as identidades com o manifesto atualizado.

### Exceções preservadas na origem

| Registros | Evidência e efeito |
| --- | --- |
| 1 despesa de luz | As origens preservam o caminho histórico para o segundo contexto e há rótulos semelhantes no principal. A comparação por IDs, caminho, categoria, data e valor não encontrou correspondência independente. Preservar a origem sem atribuição. |
| 4 modelos de gastos obrigatórios e 4 pagamentos | Os IDs dos pagamentos, datas e categorias coincidem. Os UIDs dos modelos e dos pagamentos divergem. Modelo e pagamento permanecem juntos na origem. Os quatro modelos ficam fora dos próximos compromissos até conciliação. |
| 1 transferência e 2 pontas | Valores, data e referências das pontas concordam. As contas de saída e entrada pertencem a contextos pessoais distintos. Preservar o conjunto sem compartilhar os contextos. |
| 7 movimentações com o mesmo banco ausente | O ID é citado por cinco despesas e dois ganhos. A conta está ausente na captura e nos backups de 09/11 e 18/11. Nenhuma referência de banco equivalente foi encontrada. |
| 1 ganho sem identificador bancário | A categoria também está ausente e o UID histórico não tem conta ativa correspondente. A associação permanece em revisão. |
| 2 despesas com categoria ausente | A conta existe. O documento da categoria referenciada está ausente na captura e nos backups de 09/11 e 18/11. |

Os 11 grupos originais ficam detalhados na revisão privada, com caminhos, hashes e dependências. A proposta de preservação cobre os 22 documentos em conjunto e mantém os oito lançamentos já conciliados com suas projeções e autoria originais. Se houver novas evidências, o plano precisa ser recalculado antes de alterar o tratamento desses itens. As referências confirmadas das contas precisam representar o saldo real em um instante a partir da captura. Assim a abertura não depende de somar um histórico incompleto.

## Escopo aprovado

| Operação | Escopo |
| --- | --- |
| Migração | Criar 829 destinos em `financialContexts`, nos dois contextos pessoais atuais. Preservar as 22 exceções e todos os documentos de origem. O plano prevê zero atualizações, exclusões, alterações Auth ou ajustes de saldo. |
| Índices | Criar individualmente os dois índices de `movements` que faltam em produção. Um atende a consulta por contexto e o outro às consultas por conta e por histórico em dinheiro sem banco. [Definições](../security/financial-canonical.indexes.json) |
| Rules | Publicar a transição de leitura antes da migração. Publicar a fonte canônica após verificar a migração, os dois acessos e a substituição dos clientes antigos. |
| Ativação | O titular confirma a referência de cada conta no formulário original, após conferir efeitos pendentes no banco. A primeira operação real também é confirmada pelo titular no formulário original. |

O manifesto cifrado, os hashes e o identificador abaixo vinculam a autorização ao conteúdo exato. O arquivo de aprovação privada inclui `projectId`, `runId`, `manifestSHA256`, `rulesSHA256` das Rules atuais, `ownerUids`, `contexts`, `clientFinancialWritesDenied`, `privilegedWritersPaused`, `publishRules` e `createIndexes`. O rollback automático exige `rollbackBeforeClientRelease`.

| Identificação | Valor |
| --- | --- |
| Projeto oficial | `finances-app-e8685` |
| Execução | `mvp160-20261121-cut` |
| Manifesto de corte | `cac026c02613b47ff75bb926eca9c73713f15626379ca69555a554aaa610084e` |
| Captura Firestore | `1c95b5490cd278ee375b0fdabc7b7229339796afcde36dead418fcef2c4bde06` |
| Rules oficiais da Etapa 03, anteriores ao corte | `8673e2d0d47641cf787484013a418b642442595994bdcbcbb0e9091c5f6179c8` |
| Rules de transição somente leitura | `7eddfa9a9f991ff322367bc79aa8ab4a2a94646e379ffa93f55bf46457cb362d` |
| Rules finais publicadas em homologação e candidatas a produção | `dc8f48e69fbe1bc96bf1936a00fcc43fe32a58ffa37b822028cb506fef1b437d` |

Produção tem 29 índices compostos. A operação adicionou apenas os dois índices aprovados, ambos em `READY`, e preservou os 27 anteriores. A aplicação fez 829 criações. A ferramenta releu o inventário e usou precondições para detectar escritas concorrentes. O projeto segue no Spark. A cota diária gratuita inclui 50 mil leituras e 20 mil gravações. [Cotas do Firestore](https://firebase.google.com/docs/firestore/quotas)

## Sequência autorizável e recuperação

1. Confirmar o hash aprovado, o recibo de restauração com menos de 24 horas e a pausa de console, jobs, scripts e demais escritores administrativos durante a janela. Esta captura atende à janela para iniciar o corte até **22/11/2026 às 23:45:28 em São Paulo**. As Rules da Etapa 03 e da transição recusam gravações financeiras de clientes.
2. Criar os dois índices aprovados, conferir o estado `READY` e publicar as Rules de transição com o hash conferido. Gerar a configuração isolada com `node script/financial-release-rules.cjs dist/mvp-1.6.0/rules` e usar apenas o arquivo de Rules da transição.
3. Executar `apply` com o manifesto, o recibo e a confirmação da execução. A ferramenta exige o hash do canário e a aprovação vinculada. O diário retoma lotes com `resume`. Conferir as 829 criações e as origens por `verify`. Emitir o recibo privado `verify --release-view canary --client-readiness CAMINHO --approval APROVACAO`. Incorporá-lo ao cliente e verificar as duas sessões oficiais independentes, as consultas históricas e o acesso às páginas. As ações financeiras ficam fechadas nesta fase.
4. Depois de validar as leituras e a substituição dos clientes antigos, publicar as Rules finais do manifesto. Conferir índice, hash e inventário. Emitir `verify --release-view canonical`, incorporar o recibo e gerar a Web e o APK estáveis antes da primeira ativação.
5. Na Home, abrir a edição da conta selecionada e usar **Definir saldo de referência**. Conferir no banco o saldo, a data, a hora de São Paulo e as operações históricas e pendentes. A primeira conta da Home do titular confirmado termina em `JYvu` e o UID termina em `tyW2`. A revisão verificou a propriedade exclusiva e 272 movimentos canônicos. O mais recente é de 12/10/2026. Entre os 393 documentos com referência a essa conta, dois continuam em exceção e nenhum apresenta marcador explícito de pendência. A verificação de efeitos ainda pendentes no banco precisa ser feita pelo titular.
6. Confirmar a referência somente na conta selecionada. Pelos formulários originais de ganho ou despesa, selecionar o banco ativo e a categoria e informar uma descrição, um valor e uma data reais. Para o dia da referência, informar um minuto posterior em **Horário em São Paulo**. Uma data posterior admite o preenchimento apenas da data. O saldo de referência já inclui o histórico confirmado. Conferir um documento, o delta em centavos, o extrato, a Home, a reabertura e a leitura no Android depois que o titular salvar.

Para recuperar antes de liberar escritas, pausar a migração, repor as Rules exatas da Etapa 03 e executar `rollback` com o diário e o recibo da mesma captura. A ferramenta usa precondições para remover apenas criações daquela execução e confere as origens e identidades novamente. Após liberar operações reais, interromper novas escritas com a transição de leitura, preservar as revisões recentes e comparar a captura em ambiente isolado. Aplicar apenas correções dirigidas, com os lançamentos posteriores já reconciliados. A captura e a chave ficam em diretórios privados distintos. [Procedimento detalhado](../Arquitetura/Migra%C3%A7%C3%A3o%20Financeira%20Definitiva.md)

## Web e Android

A Web da transição usa o Firebase oficial e está disponível em `http://127.0.0.1:4176/web`. A rota privada redirecionou ao login em 1440 px e 390 px. O [pacote Web da transição](../dist/mvp-1.6.0/canario/web/index.html) mantém apenas consultas. Cada titular entra com a própria conta para validar o acesso antes da liberação das operações.

O APK ARM64 assinado para consulta [está disponível no workspace](../dist/mvp-1.6.0/pre-corte/Lumus-Financas-1.6.0-oficial-arm64-consulta.apk). Seu SHA-256 é `59bbafd73171c314a21475bcc0de1bf6b29f6c45e7670322e7a29c7808ec18c5`. O APK com gravações habilitadas depende do recibo canônico oficial. A homologação física exige um aparelho conectado e os logins independentes dos titulares. Use o mesmo ID de pacote e a assinatura da instalação anterior para atualizar. Confirme login, perfil, bancos, categorias, Home, extrato, reabertura e logout nos dois clientes. Confira a sincronização após a primeira operação que o titular salvar.

## Verificações da 1.6.0

| Verificação | Resultado |
| --- | --- |
| `npm run check` | Estilo, tipos e 180 testes aprovados. |
| Firebase Emulator | 217 testes aprovados. Inclui migração, restauração, retomada, rollback, leitura no canário, operações financeiras e permissões. |
| Firebase Spark real de homologação | 11 testes aprovados sob o hash final da tabela. Inclui dois logins sintéticos, ativação idempotente, lançamento no mesmo dia, reenvio, concorrência, revogação, estornos, obrigatórios, paginação e histórico. |
| Cenário de saldo de referência no Spark isolado | A referência sintética de R$ 100,00 foi confirmada duas vezes com o mesmo resultado. Uma despesa de R$ 9,99 no minuto posterior deixou R$ 90,01. O extrato registrou uma única movimentação. |
| Consulta vazia e reconexão | O extrato vazio retornou sem erro. O envio sem rede manteve o saldo. Após reconectar, dois envios com o mesmo identificador deixaram uma movimentação e um único delta. |
| Web no Spark de homologação | Login, Home, totais, extrato, ganhos, gastos, transferências, saques, estornos, dois modelos de obrigatórios e seus ciclos. A reabertura conservou a sessão. O logout protegeu o acesso por URL direta. |
| Web oficial | Exportada e servida localmente. Login renderizado e rota privada protegida em 1440 px e 390 px. A validação autenticada do canário aguarda o corte. |
| Expo Doctor | 20 de 20 verificações aprovadas. |
| Android oficial | Build assinado com Expo SDK 58.0.26, variante ARM64, pacote `com.gabrielmazz.lumusfinances.homologacao`, versionCode 8, alinhamento de 16 KB e certificado da instalação anterior conferidos. A instalação e a sincronização em aparelho estão pendentes. |

O Emulator e o Spark isolado recusaram alteração direta de saldo, atribuição de contexto a terceiros, acesso cruzado e acesso de membro revogado nos cenários testados. O compilador do Firebase aceitou as duas fontes. A primeira operação real e os dois logins no canário estão pendentes. O saldo real depende da confirmação do titular no aplicativo.
