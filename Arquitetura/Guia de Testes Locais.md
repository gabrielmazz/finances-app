---
tags: [testes, firebase, spark, web, mobile]
relacionado: [[Status da Implementação Spark]], [[Processo de Release]], [[Cadastros de Contas Spark]], [[Operações Ordinárias Spark]]
status: em desenvolvimento
tipo: guia
versao: 0.4.0
spark_module: R02
spark_progress: 23
spark_reviewed_at: 2026-10-20
---

# Guia de Testes Locais

**Entrada da etapa de 23/10/2026:** após login, o app abre Configurações enquanto o Dashboard estiver desativado. Entre em **Configurações das telas** para liberar somente o fluxo em validação; todos os roteiros financeiros abaixo exigem habilitar seus destinos/dependências. Comece por bancos/saldo inicial, conforme [[Versão Usável por Telas]]. Uma escolha da nova etapa persiste no reload; **Desativar todas as telas** restaura o ponto de partida sem apagar o seed.

<!-- spark-progress:start -->
## Progresso Spark — 20/10/2026

**R02 — Homologação e transição controlada: 23% implementado / 77% restante.** Notas P/I/D/E: **25/25/0/50**; cálculo e evidências em [[Status da Implementação Spark]]. O ambiente sintético permite testar os fluxos conectados; aparelhos, piloto, reversão e ativação real permanecem pendentes.
<!-- spark-progress:end -->

## Conferir um envio após recarregar — 22/10/2026

O aviso compartilhado de [[Recuperação de Operações Spark]] permite verificar um envio pendente, cancelar sua confirmação tardia ou reconhecer o registro já confirmado. Não repete dinheiro automaticamente nem restaura todos os campos. Cancelamento confirmado exige outra identificação em uma nova confirmação; um ID cancelado não deve ser reutilizado por scripts de teste. Etapas descritivas preservam a fase financeira já confirmada enquanto a mesma sessão permanece montada.

Execute sequencialmente as suítes que manipulam autenticação no mesmo conjunto de emuladores. Preserve uma sessão sintética própria para explorar o aplicativo. Não trate testes de integração, exportações ou os 89 testes condicionais ignorados como homologação em aparelhos. Evidências finais e limites em [[Status da Implementação Spark]].

## Continuação v17 — 22/10/2026

Marcador protegido e destino do plano local: `financial-proof-v17`; o novo hash não habilita grupos reais. O histórico reconhece os nós de avaliação composta e a referência corretiva como checkpoints. O propósito exclusivo `valuation_undo` vincula uma única referência vigente excluída, permanece imutável e não autoriza comandos comuns. Contratos replanejados usam sucessor/predecessor e metadados no mesmo commit; listas atualizam a agenda depois da confirmação e não estendem lembretes de contrato vencido silenciosamente. Ver [[Protocolo Financeiro Spark]], [[Recorrências Spark]], [[Investimentos]] e [[Status da Implementação Spark]].


## Iniciar pela Web

No terminal Ubuntu/WSL, dentro de `/programacao/finances-app`, com dependências da raiz e do backend instaladas, Node 22 e Java 21 disponíveis:

```sh
npm run dev:spark:web
```

Abra `http://localhost:8082`. Entre com **spark@demo.lumus.local** e senha **Spark-teste-123!**. A conta é exclusivamente fictícia e só existe no emulador local. Os bancos começam com R$ 5.000,00 e R$ 2.000,00; Dinheiro com R$ 300,00. Há três categorias de teste.

O comando prepara Auth/Firestore, dados e Expo. Não inicia Functions, não publica nem muda plano, Remote Config ou dados reais. Use Ctrl+C para encerrar. **Os dados desta sessão são descartáveis e não são recuperados na próxima inicialização.** Ao iniciar novamente, o cenário volta aos saldos acima. Para exportar evidências próprias, use os procedimentos de backup aplicáveis antes de encerrar.

Portas 4000, 4400, 4500, 5001, 8080, 9099 e 8082 devem estar livres. A porta 5001 é conferida para não misturar a sessão com Functions de outro ambiente; este comando não a utiliza. Se já houver outro ambiente, encerre-o no terminal em que foi iniciado. O supervisor recusa reutilizar uma sessão existente; a preparação também recusa Auth/perfil/grupo já preenchidos e não executa limpeza do banco. O projeto é fixo `demo-lumus-financas`, com Admin restrito aos endpoints locais 8080/9099. O aplicativo usa apenas SDK cliente e as mesmas Rules do repositório. Não há inicialização administrativa no cliente.

## Roteiro funcional disponível

Para o primeiro fluxo, habilite **Cadastrar banco** nas Configurações das telas e abra **Bancos** em Configurações. Cadastre uma conta fictícia com R$ 1.234,56, volte à lista, abra a edição e altere somente o nome. Confira o saldo no extrato/dashboard habilitado para a sessão de teste: deve permanecer R$ 1.234,56 e não acrescentar receita. Repita o cadastro com zero e, em outra conta fictícia, negativo justificado. A referência atual é diferente da abertura mensal retroativa. Uma falha no carregamento oferece nova tentativa sem liberar o salvamento. Não use dados reais para esse roteiro.

| Fluxo | Ensaio sugerido | Resultado esperado |
|---|---|---|
| Login e Home | Entrar com a conta de teste | Dois bancos e Dinheiro com os saldos fictícios |
| Bancos e saldo inicial | Cadastrar com saldo zero ou R$ 1.234,56; depois alterar nome/ícone/cor | Abertura única com o valor declarado; edição preserva saldo e não cria receita |
| Receita comum | Adicionar R$ 100,00 ao banco novo | Saldo R$ 100,00 e receita no extrato/Home |
| Despesa comum | Adicionar R$ 25,00, escolhendo uma categoria | Saldo R$ 75,00; categoria preservada |
| Edição ordinária | Abrir a despesa pelo extrato e alterar para R$ 30,00 | Saldo R$ 70,00; efeito anterior substituído |
| Estorno ordinário | Estornar a despesa vigente pelo extrato | Saldo R$ 100,00; histórico preservado |
| Transferência | Transferir R$ 50,00 do banco novo para Reserva de teste | Banco novo R$ 50,00, reserva +R$ 50,00; totais econômicos inalterados |
| Saque | Sacar R$ 20,00 do banco novo | Banco novo R$ 30,00, Dinheiro +R$ 20,00; não vira despesa |
| Estorno dos pares | No extrato, estornar saque e transferência | Banco novo R$ 100,00, reserva/Caixa restaurados; histórico preservado |
| Dinheiro | Criar receita/despesa com pagamento em dinheiro | Somente o Caixa canônico muda |
| Abertura mensal | Selecionar banco/mês/saldo, preparar e confirmar | Referência canônica do ciclo; movimentos posteriores preservados |
| Ajuste de saldo | Conferir prévia de hoje, informar diferença e salvar | Só a diferença muda o banco; nova movimentação invalida a revisão |
| Edição/estorno do ajuste | Abrir ajuste vigente pelo extrato e editar ou estornar | Mesmo banco, autor e datas históricos; sem apagar movimentos |
| Categorias | Criar/editar categoria e usar em outro lançamento | Mesma identidade de categoria nos leitores |

As linhas abaixo ampliam o roteiro para teste manual dos fluxos conectados em 22/10. São passos disponíveis para executar; os testes SDK não comprovam que cada interação visual foi homologada.

| Fluxo adicional | Ensaio sugerido | Resultado esperado |
|---|---|---|
| Ciclo de vida de banco | Arquivar/restaurar em Configurações e alternar atividade | Identidade/saldo preservados; seletores excluem conta fora de atividade |
| Saldo mensal negativo | Preparar, alternar sinal, preencher motivo e preparar/confirmar novamente | Negativo somente com justificativa; revisão revalidada |
| Despesa/receita recorrente | Cadastrar plano com vencimento e registrar pelo calendário | Um evento real e um ciclo confirmado; sem dupla gravação de dinheiro |
| Parcelas e quitação | Contrato de R$ 10,00 em três parcelas; quitar com R$ 9,00 e motivo do desconto | Nominal R$ 10,00, caixa -R$ 9,00, três parcelas concluídas; estorno devolve R$ 9,00 |
| Arquivo/restauração recorrente | Arquivar e usar Restaurar na seção de arquivadas | Mantém contador/ciclos; não registra novo pagamento |
| Investimento | Aplicar R$ 100,00 com observado R$ 110,00; sincronizar, aportar e resgatar | Banco financia principal; observação e pares mantidos separados |
| Estorno de investimento | Pelo extrato bancário, estornar aporte/resgate vigente | Ambas as contas compensadas uma vez; capital/abertura não recebem estorno genérico |
| Carteira e CDI | Configurar taxa do titular e verificar posição/projeção | Simulação depende da abertura comprovada; não grava renda financeira |
| Previsão | Consultar 3/6/12 meses antes/depois de confirmar um ciclo | Parte do saldo atual e não projeta o compromisso já efetivado |
| Lembrete D0 | Escolher Somente no vencimento no cadastro | Configuração conserva D0; aparelho/build é necessário para validar notificação local |
| Abertura vencida | Quando houver contagem previamente agendada vencida, usar aviso no início do app | Preparar/pausar/continuar; reload recupera a prova privada da mesma cabeça |

A conta recém-criada pelo login ainda não é inicializada automaticamente no Spark. Capital/catálogo importados, replanejamento de contratos, edição financeira composta, desfazimento de avaliação e assistente ainda têm lacunas. Uma abertura que vence enquanto o app permanece continuamente aberto pode exigir retorno ao primeiro plano para reapresentar a fila. O bootstrap fictício não autoriza corte real. Consulte [[Status da Implementação Spark]].


## Android e iOS

`npm run dev:spark` abre o mesmo cenário para Expo Go. O projeto exige versão compatível com seu SDK; recursos que requerem módulos nativos/build próprio conservam as limitações documentadas. Para Android por USB, encaminhe as portas 8082, 8080 e 9099 com `adb reverse tcp:PORTA tcp:PORTA` e abra `exp://127.0.0.1:8082` no Expo Go do aparelho. O processo ADB precisa conseguir alcançar as portas do WSL; o comando não configura essa ligação automaticamente.

Para aparelho físico pela rede, inicie com `SPARK_DEV_CLIENT_HOST=IP_PRIVADO npm run dev:spark`, usando o endereço pelo qual o aparelho alcança o computador. No WSL, firewall, encaminhamento das três portas e acesso ao endereço anunciado pelo Expo precisam estar configurados. Esse comando valida que o endereço informado é privado, mas não configura a rede do Windows. Não abra portas em rede pública. Android/iOS em aparelhos ainda não foram homologados nesta entrega; exportar o pacote JavaScript Android não equivale a instalar/testar o aplicativo.

## Verificação reproduzível

```sh
npm run test:spark:demo
```

Sobe seu próprio cenário efêmero, executa nove ensaios reais Auth/Firestore dos serviços/formulários ordinários, dez de transferências/saques/estornos, treze de mensal/ajustes e um do leitor da aplicação Home/bancos/categorias: 33 casos ao todo. Incluem concorrência, reenvio, correção, estorno, relógio do navegador adiantado e tentativas de burlar as Rules. Functions ficam desligadas. Não há mocks de saldo, transações ou Rules; apenas a configuração do cliente em Node é injetada no teste de leitores. Esse comando deve terminar com código zero; falhas são propagadas e encerram os emuladores.

O ensaio inicial encontrou limite de 1.000 expressões na correção de uma despesa com categoria em banco recém-aberto com checkpoint. A seleção de contratos em `validSparkOperation` passou a avaliar as famílias ordinárias primeiro, sem retirar validação/autorização. A tentativa inicial fica em `.expo/spark-local-demo.log`; o ensaio corrigido em `.expo/spark-local-demo-fixed.log`. A regressão ampla das Rules e o gate geral são evidências complementares, não homologação de aparelho.

Validação visual de 20/10/2026: navegador autenticado em `http://127.0.0.1:8082` confirmou os três saldos iniciais, criação de “Banco de teste Web” com zero, sua seleção no formulário de receita, categoria Alimentação e registro de R$ 100,00. A Home mostrou saldo/ganhos de R$ 100,00 e a receita na timeline. Captura `.expo/spark-local-home.png`; log do ambiente `.expo/spark-local-live.log`. Na sessão deixada aberta, esse banco/receita fictícios já existem; uma nova inicialização volta ao cenário inicial. Edição, concorrência, despesa e estorno foram ensaiados pelo SDK, sem declarar a matriz visual integral concluída. A porta 8082 evita o encaminhamento de rede já existente do Windows em 8081, que foi preservado.

Continuação visual de 20/10/2026: o mesmo banco recebeu transferência de saída de R$ 50,00 para Reserva de teste e saque de R$ 20,00 para Dinheiro. Após estornar ambos pela interface, o extrato confirmou saldo R$ 100,00, ganhos R$ 100,00, despesas zero e cinco movimentos (receita, dois pares e dois estornos). Reserva voltou a R$ 2.000,00 e Caixa a R$ 300,00; histórico e recibos ficaram preservados. Captura `.expo/spark-pairs-browser.png`. A sessão continua aberta, sem reinicializar os dados fictícios.

Os dez novos cenários passaram separadamente contra os emuladores já abertos, usando fixture única e removendo somente os documentos/usuário dessa fixture. O supervisor completo não foi reiniciado para preservar a sessão de teste. Evidência `.expo/spark-pairs-sdk-verified.log`; gate `.expo/spark-pairs-final-gate.log` com 960 testes comuns/104 de ferramentas, 89 condicionais ignorados; estilos/tipos finais em `.expo/spark-pairs-ui-final.log`. Exports finais `.expo/spark-pairs-web-final.log` e `.expo/spark-pairs-android-final.log` aprovados; Android mantém aviso conhecido com fallback de pacote. Sem teste instalado em aparelho.

Lançamentos do dia usam commit do servidor; retroativos preservam a data civil escolhida em São Paulo. Reenvio incerto não permite trocar campos/data, e a intenção existe apenas enquanto o formulário permanece montado. Pares importados/investimentos, assistente e demais bloqueios listados no quadro canônico continuam fora deste roteiro aprovado.

## Continuação de 21/10: mensal e ajustes

O ambiente anterior já estava encerrado. Foi iniciada nova sessão efêmera, com os saldos iniciais e a mesma conta fictícia; os lançamentos Web de 20/10 não foram recuperados. `dev:spark:web` continua em 8082, sem Functions. O teste novo cria usuário/grupo próprios com marcador único, confere o marcador antes de remover somente sua fixture e não reinicializa a demonstração do usuário. O calendário protegido é infraestrutura local comum, conservada no ensaio.

Os treze cenários de `sparkBalanceForms.emulator.test.ts` passaram separadamente contra essa sessão. O supervisor completo de 33 casos não foi reiniciado para preservar o ambiente aberto. O gate geral aprovou 966 testes comuns e 104 de ferramentas; 89 condicionais ignorados não são aceitação integrada. Logs `.expo/spark-balances-sdk-rules-ordered.log` e `.expo/spark-balances-closed-check.log`. A interface mensal prepara em até vinte páginas por chamada, permite pausar/continuar e exige outro envio explícito para confirmar. Uma abertura vencida é materializada antes da nova prévia; isso não ativa conta real nem substitui bootstrap/corte.

A ferramenta de navegador bloqueou a aquisição da aba local por sua política de segurança. Os novos caminhos mensais/ajustes têm ensaio pelos serviços e Rules reais locais, sem novo teste visual ou aparelho instalado nesta continuação. Teste manualmente os três fluxos novos da tabela; criação/edição/estorno, datas civis, histórico e replay também foram cobertos pelos treze cenários SDK. Intenção/identificador na UI continuam em memória, sem recuperação automática após reload. Assistente e fontes importadas ainda não usam essas pontes.

A edição com saldo negativo revelou esgotamento do limite de expressões. Foi antecipada a seleção do mesmo contrato `adjustment_replacement`, mantendo o validador e o papel administrativo; não se aceitou a recusa por esgotamento como proteção. A regressão nova `.expo/spark-balances-rules-regression.log` aprovou 1.037 cenários Spark e as cinco suítes anteriores, nos projetos isolados próprios dos testes, preservando o projeto `demo-lumus-financas` da demonstração. O formulário mensal passa a mostrar motivo após a primeira preparação Spark; é necessário se o saldo atual resultante ficar negativo. A entrada diretamente negativa no valor mensal continua pendente de controle de sinal, como registrada em F03.

Fechamento de 21/10/2026: exports finais Web e Android aprovados em `.expo/spark-balances-web-final.log` e `.expo/spark-balances-android-final.log`, após a inclusão do motivo mensal. `.expo/spark-balances-ui-final.log` confirma estilos/tipos e ferramentas dessa fonte final; o gate geral com 966 comuns/104 ferramentas está em `.expo/spark-balances-closed-check.log`. Android mantém o aviso conhecido de fallback do `web-streams-polyfill`. Nenhum APK/AAB, aparelho, ensaio visual novo, deploy ou corte real foi realizado. A regressão nova de Rules terminou com 1.037 cenários Spark e cinco suítes anteriores aprovados; os 13 cenários novos dos formulários também passaram. O ambiente local foi preservado, com a demonstração sintética em 8082.


## Fechamento local de 22/10/2026

O supervisor de `test:spark:demo` agora encadeia 53 casos: 9 ordinários, 10 de pares, 15 de saldos/fila, 10 de recorrências, 8 de investimentos e 1 da Home. Não foi reiniciado contra a demonstração aberta. Os 25 casos de saldos/recorrências e oito de investimentos foram executados em fixtures próprias, com limpeza somente dessas fixtures. Dezoito casos de importação passaram em outro conjunto Auth/Firestore isolado, encerrado ao final, sem atingir a demonstração em 8082.

Gate final: 104 ferramentas e 986 comuns aprovados, 89 condicionais ignorados. Regressão: 1.050 cenários Spark e cinco scripts anteriores aprovados, com logs separados. A primeira tentativa de continuar a regressão não herdou as variáveis do emulador; os scripts anteriores foram reexecutados com o ambiente correto. O primeiro ensaio de importação encontrou namespace de Auth diferente no ambiente aberto; foi repetido em emuladores próprios. Logs anteriores preservados, sem contabilizar essas tentativas como aprovadas.

Evidências: `.expo/spark-financial-final-check.log`, `spark-activation-sdk.log`, `spark-investment-undo-sdk.log`, `spark-financial-import-isolated.log`, `spark-financial-closure-rules.log` e `spark-financial-closure-legacy.log`. Os mesmos 44 cenários dirigidos passaram em Tóquio/Los Angeles; não contar como 88 requisitos. Exports finais Web/Android em `spark-financial-{web,android}-closure.log` aprovados, preservando o aviso conhecido de fallback Android. Sem APK/AAB/iOS instalado, ensaio visual novo, migração real ou publicação. A ferramenta de navegador continua bloqueada por política; a sessão fictícia do usuário foi preservada.

## Fechamento de 22/10 após a correção das datas

O ensaio em Tóquio reproduziu início/fim de contrato avançando um dia no formulário, inclusive ultrapassando o último mês. `sparkRecurringFormRecord` agora devolve campos civis para os calendários/inputs, enquanto os ciclos canônicos conservam o instante real para efetivação/estorno. As listas Spark conferem o ciclo de São Paulo e resolvem o vencimento nesse calendário. Pagamento/aporte e consultas capturam cópias das datas antes das esperas; mutar um Date compartilhado não altera a intenção em andamento. Falha reproduzida em `.expo/spark-recurring-date-repro.log`; correção dirigida em `spark-recurring-date-fixed.log`.

Após esses ajustes, o gate integral foi repetido e aprovado em `.expo/spark-financial-last-check.log`: estilos/tipos, 104 testes de ferramentas e **989 comuns**, com 89 condicionais ignorados. `.expo/spark-financial-last-sdk.log` aprovou os **33 casos** de saldos/fila, recorrências e investimentos, zero ignorados, em fixtures próprias. Os **47 cenários** dirigidos passaram tanto em Tóquio como em Los Angeles (`spark-financial-last-tokyo.log` e `spark-financial-last-la.log`), sem contar a repetição como requisitos distintos. Exports finais da fonte corrigida foram aprovados em `spark-financial-web-last.log` e `spark-financial-android-last.log`; aviso Android de fallback mantido. Rules não mudaram após a regressão de 1.050 casos e os cinco scripts anteriores; as 18 importações isoladas também continuam identificadas pelo log próprio, sem serem reapresentadas como ensaio de produção.

Conferidos os cinquenta cartões, 24 módulos, pesos, fórmulas e referências: financeiro **76%**, integração **65%**, geral **55%**. O módulo completo ainda não está encerrado: replanejamento de contratos, edição composta/desfazimento de avaliação, recuperação persistente das demais intenções, integração do assistente e compatibilidade restante seguem explicitamente abertos. Sem nova homologação visual/aparelho, alteração de dados reais, cobrança, migração ou publicação. O ambiente sintético principal foi preservado em 8082.

### Evidência posterior: compilação de Rules sem avisos de tipo

A compilação local deixou de emitir os avisos de `null` versus string/map. Histórico recorrente mantém o fallback anterior para campo ausente/nulo, mas usa referência textual na validação. A cadeia histórica valida explicitamente a raiz antes de aceitar ponteiro nulo. Cotas passam mapa anterior e presença separadamente, obtidos de `resource`/`exists`, sem adicionar flag controlada pelo cliente nem permitir reiniciar uma cota existente. Limites, receitas e efeitos não foram afrouxados.

Depois da mudança, `.expo/spark-no-warning-rules.log` aprovou **1.050 cenários Spark e os cinco scripts anteriores de Rules na mesma cadeia**, com saída zero. `.expo/spark-no-warning-sdk.log` aprovou **33 cenários**; `spark-no-warning-import.log` aprovou **18** em emuladores próprios, com compilação sem aqueles avisos. Testes positivos de páginas, reservas e agregados continuam dentro do orçamento de expressões; recusas não são aceitas por esgotamento. A Home também conserva o saldo confirmado quando faltam taxas CDI do titular, mesmo se a consulta retornar sucesso com lista vazia ou somente taxa de outro membro.

O gate e os bundles foram repetidos após esse último ajuste da Home: `.expo/spark-financial-accepted-check.log` (**104 ferramentas, 989 comuns**, 89 condicionais ignorados) e `spark-financial-{web,android}-accepted.log` (ambos exportados, aviso conhecido de fallback Android). Os 47 cenários dirigidos passaram nos dois fusos em `spark-financial-accepted-{tokyo,la}.log`. “Accepted” nesses nomes identifica somente a verificação local, sem aprovação de release. Sem dado real, publicação ou nova homologação visual/aparelho; percentuais e pendências anteriores permanecem.

## Fechamento dos contratos e avaliações v17 — 22/10/2026

As entradas nativas Web/mobile agora incluem renegociação com sucessor/configuração atômicos, desfazimento ordenado e liquidação de parcelas vencidas; principal/financiamento com avaliação no mesmo commit e desfazimento da avaliação vigente. O último requer ID/revisão apresentados, motivo, prova exclusiva, referência corrigida e claim. Não apaga observação, principal, banco ou movimentos posteriores. Recuperação do acordo confirmado por seus vínculos não equivale a journal persistente de todos os rascunhos.

A regressão encontrou e corrigiu dois problemas adicionais: conferências legítimas excediam o orçamento de expressões após os novos ramos; e um resgate sem data declarada, posterior por revisão mas no mesmo instante de uma referência, podia desaparecer da prova histórica. Despacho temporal foi antecipado sem remover invariantes. A projeção desempata esses commits pela revisão; os datados explicitamente conservam cobertura. Segmentos sobre essa fronteira são conferidos nó a nó. O caso foi reproduzido deterministicamente; outro ensaio de referência estritamente posterior passou a garantir essa ordem no relógio do servidor, sem depender de dois commits terem instantes diferentes.

Evidência final, da fonte vigente:

- `.expo/spark-v17-regression-closed.log`: **1.120 cenários Spark**, zero falhas/ignorados, seguidos dos cinco scripts anteriores de Rules na mesma cadeia com saída zero.
- `.expo/spark-v17-sdk-closed.log`: **40 cenários** autenticados de saldos/fila, recorrências e investimentos, zero falhas/ignorados; `.expo/spark-v17-import-closed.log`: **18 de importação** em emuladores isolados, com compilação sem avisos de tipos.
- `.expo/spark-v17-check-closed.log`: estilos, tipos do app/backend/ferramentas, **104 testes de ferramentas e 992 comuns** aprovados; 89 condicionais ignorados não contam como aceitação.
- `.expo/spark-v17-tokyo.log` e `spark-v17-la.log`: os mesmos **57 cenários** aprovados em cada fuso; não somar repetições como requisitos novos.
- `.expo/spark-v17-web-closed.log` e `spark-v17-android-closed.log`: exportações concluídas. Android mantém aviso conhecido de fallback de `web-streams-polyfill`; export não equivale a APK/AAB instalado.

Falhas anteriores permanecem nos logs `spark-financial-v17-rules`, `spark-financial-v17-rules-final` e `spark-financial-v17-sdk-final`; não são evidência aprovada. Nos scripts anteriores, algumas recusas de payloads legados continuam atingindo o limite de expressões: a saída zero desses scripts não certifica a regra de negócio dessas recusas. Os controles Spark usam a recusa explícita sem aceitar esgotamento como prova, além dos casos positivos.

Conferidos **50 cartões e 24 módulos**: financeiro sem arredondar **77,875%**, geral **56,0875%**, exibidos **78% / 56%**; serviços nativos P=100 e integração=65. E permanece no máximo 75. O financeiro completo **não está em 100%**: faltam recuperação persistente, compatibilidade de dados/capital antigos, consumidores do assistente e matriz de aceitação Web/aparelhos. Referências anteriores à avaliação vigente não possuem estorno genérico. Publicação, corte real, privacidade e release seguem seus bloqueios próprios. Sem alteração de dados reais, ativação, cobrança ou deploy; sem nova inspeção visual por bloqueio de política do navegador e sem aparelho.


## Vínculos Spark isolados - 24/10/2026

Execute a partir de `backend/`, em WSL com dependências instaladas para Linux:

```sh
npx -y firebase-tools@15.33.0 emulators:exec --project demo-lumus-relationships --config ../firebase.json --only firestore "npm run test:relationships:spark"
```

A suíte usa somente Firestore local e tokens fictícios; não precisa de Functions, Auth remoto ou credencial real. Aceita loopback nas portas 8080/8185/8186 e fixa o projeto demo. A fixture REST usa autorização administrativa exclusiva do emulador. Onze cenários verificam convite, aceite, revogação, compatibilidade, receipts, autorização, concorrência e cota. O comando também passa a compor `test:spark:emulator`. Não usar esse teste contra projeto real.

Na execução Windows/UNC desta revisão, a transpilação TypeScript temporária substituiu esbuild de Linux somente no processo e JRE local iniciou o emulador 1.19.8. Emulador e SDK precisaram do mesmo processo pai para conectar; logs finais em `.expo/lumus-continue/relationships-*-final.log`. Onze casos passaram com Functions desligadas, seguidos dos cinco scripts existentes de Rules. Esses logs não são homologação de Auth instalado, layout, aparelho ou publicação.

## Aporte recusado em conta criada no cadastro - 25/10/2026

O roteiro financeiro usa a conta preparada `spark@demo.lumus.local`, senha fictícia `Spark-teste-123!`. O cadastro público cria acesso/perfil, mas ainda não configura grupo, protocolo e papéis Spark de uma conta nova. Por isso não substitui a conta do seed para testar investimentos. Saia da conta criada e entre com a conta preparada na mesma sessão; não é necessário reiniciar/limpar emuladores.

Na carteira, conta sem contexto nativo da demonstração recebe uma orientação explícita antes de tentar um escritor legado. A falha conserva o formulário e não envia aporte para Functions. Usuários/grupos existentes não são ativados nem migrados automaticamente. Ver [[Investimentos]] e D03 em [[Status da Implementação Spark]].


### Entrada única da demonstração Spark — 27/10/2026

`npm start`, `npm run web`, `npm run dev:local`, `npm run start:expo-go` e `npm run dev:local:web` usam o mesmo supervisor da demonstração Spark (`dev:spark` / `dev:spark:web`). Os modos `start`, `--web`, `--android` e `--dev-client` de `script/build_and_run.sh` também seguem esse supervisor. A conta `spark@demo.lumus.local` é preparada somente em Auth/Firestore locais novos; não há reinicialização automática de sessões existentes. Os emuladores e seus dados são efêmeros. O comando antigo que recriava a conta legada e limpava o emulador deixa de ser usado nesses atalhos. Outros comandos explícitos de seed legado permanecem distintos.

Esta alteração de entrada não implementa bootstrap de contas reais ou migração legada, nem comprova por si só login no navegador, funcionamento completo ou deploy. Ver [[Guia de Testes Locais]] e [[Status da Implementação Spark]].

Verificação de 27/10: sete testes de configuração dos atalhos passaram. Auth e Firestore iniciaram em ambiente isolado, mas a preparação da conta foi interrompida por revisão automática após tentativa de acesso a metadados da infraestrutura; login, interface e operações financeiras não foram validados nesta rodada. A execução de WSL também foi negada no ambiente do agente. Não declarar a demonstração homologada.


### Diagnóstico de conta antes da migração — 27/10/2026

`inspect-account` analisa um snapshot local validado e um UID, identificando perfil desconhecido, grupo do razão/Spark ou fontes legadas observadas por coleção. Documentos financeiros sem `personId` inequívoco, com identidade malformada ou divergente, são listados como ambíguos; a contagem não infere saldos ou titularidade de dados duvidosos. O relatório fica vinculado ao hash do snapshot e não altera a origem.

Um snapshot sem documentos financeiros não comprova que uma conta seja nova: ele não inclui Auth e usa duas varreduras que não garantem instante único. Por isso `canInitialize`, `canMigrate` e `readyForCutover` permanecem falsos em todos os resultados. O diagnóstico não cria grupos, importa dados, concede permissões ou altera o banco oficial. Ainda faltam bootstrap seguro, preservação dos formatos legados, consentimentos, corte e recuperação. Ver [[Importação Financeira Local Spark]] e [[Status da Implementação Spark]].

```sh
npm run spark:snapshot -- inspect-account --input spark-backups/demo.json --uid UID_FICTICIO --output spark-backups/account-report.json
```

O comando usa exclusivamente os snapshots `demo-*` validados pelo formato local; a saída é criada de forma exclusiva e privada. Não é captura ou migração de produção.


### Recuperação do perfil no cadastro — 27/10/2026

A criação pública de acesso usa a sessão Firebase secundária. O perfil é criado por transação que verifica primeiro sua ausência, sem sobrescrever um perfil existente. Se a gravação falhar ou a resposta for incerta, a conta Auth é preservada; uma nova tentativa com o mesmo nome, e-mail e senha reautentica na sessão secundária, confere o UID e retoma a transação. Se a primeira gravação já tiver sido confirmada, o perfil não é reescrito. Nenhuma senha é armazenada nessa recuperação, e a sessão principal não é substituída.

Depois que o UID é recebido, a intenção de perfil é preservada localmente, sem senha ou token, e pode ser retomada após reinício com as mesmas credenciais. Se a resposta de criação Auth for perdida ou o processo encerrar antes da gravação local do UID, a recuperação ainda não é automática. O cadastro continua sem preparar o grupo financeiro Spark; a mensagem informa essa limitação. Não houve migração legada, alteração de Rules, escrita real nem deploy. Ver [[Autenticação]] e [[Status da Implementação Spark]].


### Primeiro uso Spark com autorização protegida — 27/10/2026

O cadastro de perfil novo marca `sparkFirstUseRequested`. Na primeira leitura de contexto, `initializeSparkFirstUseFirebase` consulta a autorização protegida do mesmo UID. Quando disponível, perfil, grupo `first_{uid}`, Caixa zero e operação `first_use_cash` são criados na mesma transação. O grupo recebe somente o titular como administrador e o protocolo vigente. A transação recusa perfil já vinculado e preserva o histórico existente; um reenvio após commit reconhece o grupo e o Caixa sem repetir gravações.

As Rules exigem autorização prévia em `sparkFirstUseLocks/{uid}`, emitida por autoridade confiável, vinculada ao UID, grupo determinístico, `createdAt` do perfil, ciclo do calendário protegido e expiração, e negam sua alteração pelo cliente. O documento começa em revisão e só se torna autorizado após a verificação. O calendário protegido precisa existir e cobrir o instante do servidor. As quatro escritas são verificadas conjuntamente; saldo inicial deve ser zero e a sessão atual precisa pertencer ao titular. A autorização não é uma prova gerada pelo cliente nem deve ser emitida somente por ausência de documentos.

**Ainda não há emissor confiável automático dessa autorização.** Verificação de criação real do Auth, inventário completo, ausência de legado e corte de escritores precisam ser implementados antes de conceder a autorização a contas reais. Sem autorização, o cadastro financeiro continua pendente. Esta etapa não migra contas legadas e não publica Rules ou cliente. Os testes em Emulator não constituem ativação de produção. Ver [[Status da Implementação Spark]] e [[Importação Financeira Local Spark]].
