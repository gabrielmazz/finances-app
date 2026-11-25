# Lumus Finances 1.7 — Resultado

**AGUARDANDO AÇÃO DO TITULAR.** Os dois logins foram validados. O titular A confirmou a referência de `JYvu` na Web oficial. A conta está habilitada e o primeiro lançamento manual aguarda confirmação.

## Produção

| Verificação | Resultado |
|---|---|
| Manifesto aprovado | `cac026c02613b47ff75bb926eca9c73713f15626379ca69555a554aaa610084e` |
| Resultado do corte | 829 destinos conferidos, 987 documentos de origem e 22 exceções preservados. Ajuste histórico de saldo de R$ 0,00. |
| Releitura dirigida | Os três IDs bancários coincidem com a origem e os dois UIDs coincidem com os do manifesto. Os dois usuários estão ativos no Auth. Os dois índices canônicos estão em `READY`. |
| Rules da transição | `7eddfa9a9f991ff322367bc79aa8ab4a2a94646e379ffa93f55bf46457cb362d`. |
| Rules finais | Ruleset `bf1c24e9-e699-4dfb-a0ca-a41d253810b7`, hash `dc8f48e69fbe1bc96bf1936a00fcc43fe32a58ffa37b822028cb506fef1b437d`. Fonte testada no Spark isolado e publicada em 23/11/2026 às 09h32 de São Paulo. |
| Spark | Firestore Standard gratuito. Faturamento desativado. |
| Sessão do titular A | UID original termina em `tyW2`. Login, persistência da sessão, 2 bancos, 35 categorias, 13 obrigatórios ativos, 337 lançamentos paginados e isolamento verificados no canário. |
| Sessão do titular B | UID original termina em `MMG3`. Login, persistência da sessão, 1 banco, 13 categorias, 428 lançamentos paginados e isolamento verificados no canário. |
| Compartilhamento oficial | O inventário apresentou os dois contextos pessoais e nenhum grupo ou grant protegido. |

O [manifesto do corte](mvp160-corte.md) documenta a conferência integral de 22/11 e a publicação da transição. Em 23/11/2026, a releitura antes e depois das Rules finais conferiu os campos e revisões dos 987 documentos originais, os campos dos 829 destinos e o inventário Auth. O histórico canônico contém 765 movimentos de origem distinta. A atribuição oficial dos bancos vem do manifesto e dos respectivos documentos canônicos.

| Banco migrado | Titular | Movimentos canônicos associados | Referência e saldo atual |
|---|---|---:|---|
| ID final `JYvu` | A, pessoal | 272 | Ativada pelo titular A. A abertura e o saldo foram conferidos no Firestore oficial. |
| ID final `lbq5` | A, pessoal | 64 | Aguardando confirmação |
| ID final `YX8P` | B, pessoal | 337 | Aguardando confirmação |

## Fluxos

| Funcionalidade | Implementada | Testada | Disponível no Firebase oficial |
|---|---|---|---|
| Login | Sim | Auth no Emulator, no Spark de homologação e em duas sessões oficiais | Os dois UIDs originais passaram no canário oficial. |
| Bancos | Sim | Busca, cadastro e edição em ambiente isolado | Três contas pessoais com confirmação de referência individual disponível. |
| Contas compartilhadas | Seleção de grupos, papéis e revogação. Convite e aceite aguardam autorização. | Duas identidades sintéticas no Spark | Nenhum vínculo protegido identificado. |
| Categorias | Sim | Leitura e isolamento no canário. Seleção no Spark isolado. | Categorias migradas nos contextos dos titulares. |
| Saldos | Sim | Abertura, referência, concorrência, edição e estorno isolados. Confirmação real em `JYvu`. | `JYvu` ativa. `lbq5` e `YX8P` aguardam confirmação dos titulares. |
| Ganhos | Sim | Cadastro, edição, cancelamento, reenvio e concorrência | Gravação em conta com referência confirmada. |
| Gastos | Sim | Cadastro, edição, cancelamento, reenvio e concorrência | Gravação em conta com referência confirmada. |
| Ganhos obrigatórios | Sim | Modelo, ciclo manual, confirmação única e estorno | Ciclos manuais em conta com referência confirmada. |
| Gastos obrigatórios | Sim | Modelo, ciclo manual, confirmação única e estorno | Ciclos manuais em conta com referência confirmada. |
| Transferências | Sim | Duas contas em transação, saldo e estorno | Exigem referência confirmada nas duas contas e autorização para ambas. |
| Saques | Sim | Saldo, extrato e estorno | Disponíveis em conta com referência confirmada. |
| Home | Sim | Totais, últimos movimentos e contas | Consulta canônica conforme o contexto autorizado. |
| Extrato | Sim | Paginação, autoria e detalhes das operações | Consultas paginadas com as duas identidades oficiais. |

## Verificação

- `npm run check` aprovou estilos, tipos e 181 testes. A regressão cobre o botão de atualização numa conta migrada que aguarda referência. O Emulator aprovou 217 testes e uma execução adicional de oito verificações de compatibilidade com as Rules exatas da transição. Essas verificações usam a configuração dos clientes anteriores ao corte.
- O Spark `lumus-financas-hml` aprovou 11 testes com as Rules finais. A cobertura inclui consulta por duas identidades, saldo único, autoria, revogação, referência, reenvio, concorrência, saldos e estornos.
- O compilador do Firebase aceitou as duas fontes de Rules. A revisão conferiu a origem da autoridade, campos imutáveis, limites e validação atômica entre lançamento e saldo. [Auditoria](../dist/mvp-1.7.0/rules-audit.json)
- Duas sessões Web separadas no Spark abriram o mesmo grupo e viram uma despesa de R$ 12,34 reduzir o saldo de R$ 77,77 para R$ 65,43. O extrato mostrou a autoria nas duas sessões. A revogação retirou a conta e o lançamento do navegador do participante e restabeleceu o acesso pessoal.
- As telas Web no Spark usaram os formulários originais para registrar receitas, despesas, obrigatórios, transferências e saques, e verificaram o extrato e a Home.
- Após as Rules finais, a sessão A abriu a Web publicada, consultou os dados canônicos e recebeu `permission-denied` nas consultas a dados privados do outro titular e às coleções legadas. A validação de revogação de grupos ocorreu no Spark de homologação.

## Contas vinculadas

O histórico de `594f2d2` registra que os vínculos de pessoas começavam pelo ID copiado de Meu perfil. A interface exibia uma prévia, o destinatário aceitava na própria conta e qualquer participante podia revogar. O vínculo pessoal era distinto dos papéis do grupo financeiro. O modelo atual protege o acesso pelo grupo ativo, pela claim no Auth e pelo grant em `_authorizations/{uid}`. O papel `member` consulta e o papel `admin` pode movimentar no ambiente liberado. A autoria vem de `createdBy`. O cliente retorna às contas pessoais ao detectar a revogação.

Para confirmar um vínculo voluntário, os dois titulares identificam separadamente, em suas sessões oficiais, o mesmo contexto desejado. Cada um indica quem pode consultar e quem pode movimentar, e quais contas devem fazer parte dele. O operador apresenta para aprovação os dois UIDs, o grupo, os papéis e o escopo. Somente com autorização específica é possível provisionar os grants e as claims existentes. A listagem no **Meu perfil** então verifica a autorização e permite abrir o grupo. A saída com revogação exige retirar o grupo do grant do participante. Os mecanismos de convite e aceite pela interface dependem de permissões que o manifesto atual não contempla.

## Ativação acompanhada pelos titulares

Em 23/11, os dois titulares entraram em janelas independentes e consultaram o Firestore oficial. A checagem do titular A foi refeita porque os obrigatórios canônicos identificam o contexto pelo caminho do documento. A sessão do titular B havia concluído as consultas e o isolamento. Com os dois resultados registrados e a troca de clientes confirmada pelo responsável, a Web 1.7 substituiu a 2.3.3 no site `finances-app-e8685` antes da publicação das Rules finais.

A primeira tentativa de salvar o cadastro de `JYvu` recebeu uma recusa das Rules porque a conta ainda aguardava referência. A leitura de produção confirmou que nenhuma abertura ou saldo parcial foi gravado. A edição de conta migrada agora exibe a confirmação de referência e oculta a atualização separada enquanto a conta aguarda ativação. Após a correção, o titular A confirmou a referência de `JYvu` no formulário oficial. A abertura, o titular e o saldo inicial coincidiram no Firestore.

1. Em **Configurações → Bancos**, abrir a edição do banco e escolher **Definir saldo de referência**. Cada titular confere o saldo real e os efeitos pendentes no banco. Informa data e horário de São Paulo, revisa a prévia e confirma apenas aquela conta.
2. O titular registra a primeira operação real no formulário original. No dia da referência, o horário precisa ser posterior ao minuto confirmado. Após salvar, conferir persistência, diferença em centavos, Home, extrato e leitura no outro cliente.

## Web e Android

| Entrega | Resultado |
|---|---|
| Web oficial 1.7 | Publicada em 23/11/2026 às 09h42 e atualizada às 09h54 com a correção no formulário. Os três bundles do Hosting correspondem à exportação canônica. O login redireciona o acesso anônimo ao perfil em 1440 px e 390 px. [Abrir Lumus](https://finances-app-e8685.web.app/web) |
| APK oficial com gravações | Expo SDK 58.0.26, ARM64, `com.gabrielmazz.lumusfinances.homologacao`, versionCode 11. Inclui a correção do formulário e habilita cada conta após a confirmação do titular. [Baixar o APK](../dist/mvp-1.7.0/ativacao/operacional/Lumus-Financas-1.7.0-oficial-arm64.apk) |
| Integridade do APK | SHA-256 `b23eaaead548f98e1bc2ab729a446fa4b100d3869c999b82a2fe9593a4f22bcc`. Certificado igual ao APK oficial anterior. O bundle inicial foi descartado porque o Gradle reutilizou a configuração de consulta. A nova compilação confirmou o recibo das Rules finais e a correção do formulário dentro do APK, a assinatura e o alinhamento ZIP e ELF de 16 KiB. [Recibo](../dist/mvp-1.7.0/ativacao/operacional/apk-verification.json) |
| Android instalado | ADB encontrou zero aparelhos conectados. Instalação, navegação no Android e sincronização Web–Android em aparelho físico continuam pendentes. |

As verificações de alinhamento do APK e assinatura usam as ferramentas do Android SDK. [zipalign](https://developer.android.com/tools/zipalign) · [apksigner](https://developer.android.com/tools/apksigner)

## Alterações

- A autorização e a seleção de contexto passam por `firebase/financialContext.ts`, `contexts/SessionContext.tsx` e `hooks/useUserProfile.ts`. A seção original dos dois perfis usa `components/uiverse/users/linked-financial-contexts.tsx`.
- A atualização financeira usa `firebase/movements.ts`, `contexts/BankAccountsContext.tsx`, `hooks/useHomeScreenData.ts`, `hooks/useRecentMovements.ts`, `hooks/useMovementList.ts` e `hooks/useMandatoryList.ts`.
- O extrato preserva os detalhes expandidos durante uma nova leitura do mesmo contexto, inclusive o nome da contraparte de uma transferência. A troca de contexto descarta os detalhes. Os nomes de banco passaram a ser consultados pelo aplicativo e saíram dos parâmetros de navegação.
- Os formulários respeitam consulta e escrita em `firebase/config.ts`, `hooks/useMovementSubmit.ts`, `hooks/useMovementOptions.ts`, `hooks/useMandatoryTemplate.ts`, `hooks/useRescueFormData.ts` e `hooks/useTransferFormData.ts`. A Home e o extrato nas duas plataformas usam os nomes das contas lidas no contexto selecionado.
- `components/app/app-root.tsx` descarta as telas do contexto anterior. `app.json`, o manifesto npm, o lockfile e as telas de login identificam a versão 1.7.0. A verificação final inclui os testes de autorização, recibo, compatibilidade e Spark.

<details>
<summary>Arquivos modificados</summary>

- `Arquitetura.md`
- `Arquitetura/Dashboard Home.md`
- `Arquitetura/Gerenciamento de Bancos.md`
- `Arquitetura/Gerenciamento de Usuários.md`
- `Arquitetura/Perfil do Usuário.md`
- `Arquitetura/Processo de Release.md`
- `app.json`
- `components/app/app-root.tsx`
- `components/uiverse/users/linked-financial-contexts.tsx`
- `contexts/BankAccountsContext.tsx`
- `contexts/SessionContext.tsx`
- `docs/mvp170-resultado.md`
- `firebase/config.ts`
- `firebase/financialContext.ts`
- `firebase/movements.ts`
- `firebase/production-readiness.json`
- `hooks/useBankAccountForm.ts`
- `hooks/useHomeScreenData.ts`
- `hooks/useMandatoryList.ts`
- `hooks/useMandatoryTemplate.ts`
- `hooks/useMovementList.ts`
- `hooks/useMovementOptions.ts`
- `hooks/useMovementSubmit.ts`
- `hooks/useRecentMovements.ts`
- `hooks/useRescueFormData.ts`
- `hooks/useTransferFormData.ts`
- `hooks/useUserProfile.ts`
- `package-lock.json`
- `package.json`
- `screens/mobile/AddRegisterExpensesScreen.tsx`
- `screens/mobile/AddRegisterGainScreen.tsx`
- `screens/mobile/AddRegisterBankScreen.tsx`
- `screens/mobile/BankMovementsScreen.tsx`
- `screens/mobile/ConfigurationsScreen.tsx`
- `screens/mobile/HomeScreen.tsx`
- `screens/mobile/LoginScreen.tsx`
- `screens/mobile/PerfilPersonScreen.tsx`
- `screens/web/AddRegisterExpensesScreen.web.tsx`
- `screens/web/AddRegisterGainScreen.web.tsx`
- `screens/web/AddRegisterBankScreen.web.tsx`
- `screens/web/BankMovementsScreen.web.tsx`
- `screens/web/ConfigurationsScreen.web.tsx`
- `screens/web/HomeScreen.web.tsx`
- `screens/web/LoginScreen.web.tsx`
- `screens/web/PerfilPersonScreen.web.tsx`
- `tests/browser/bank-operations.cjs`
- `tests/bankAccountForm.test.ts`
- `tests/browser/mandatory-cycles.cjs`
- `tests/homologationReadOnly.test.ts`
- `tests/integration/authorization.integration.ts`
- `tests/integration/homologation-read.integration.ts`
- `tests/staging/finance.ts`

</details>
