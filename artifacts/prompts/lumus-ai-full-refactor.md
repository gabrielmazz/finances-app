# Prompt mestre: integração completa do Lumus IA

Copie este prompt para uma tarefa do Codex neste repositório. Ele autoriza uma implementação ampla do Lumus IA e das integrações necessárias no aplicativo. Preserve os critérios de segurança, precisão, arquitetura e evidência abaixo.

---

## Objetivo

Reestruture e complete o Lumus IA para que seja uma interface conversacional clara e confiável para consultar e operar **todas as funcionalidades acessíveis do Lumus Finanças**. Inclua todas as rotas e os fluxos que elas iniciam, das raramente usadas às mais acessadas. A pessoa deve conseguir fazer qualquer pedido válido em linguagem natural, acrescentar informações, corrigir, confirmar operações que necessitem confirmação e cancelar diretamente na conversa. Ela não deve depender de escolher bancos, categorias ou registros em outro seletor; nem de revisar cartões, navegar paginação ou abrir uma tela financeira para concluir uma tarefa.

Entregue mudanças funcionais no código. Faça uma auditoria abrangente, implemente as lacunas encontradas de forma coerente, valide Web e mobile e continue o trabalho até todos os cenários deste escopo terem resultado verificável. Um plano, uma nova skill, um prompt melhor, uma tela bonita ou uma demonstração de chamada ao modelo isolada não concluem esta tarefa.

“Completo” significa cobrir as rotas, operações, dados e permissões reais do aplicativo, tanto em contas legadas quanto nos grupos com razão financeiro migrado. Não significa inventar uma integração que o repositório ou os serviços externos não oferecem, ignorar autorização, afirmar capacidades não entregues ou contornar uma limitação de plataforma. Identifique toda lacuna remanescente com o módulo afetado, causa e evidência.

## Instruções que se aplicam

Use `$lumus-assistant`, `$improve-lumus-financas` e `$karpathy-guidelines`. Leia os arquivos dessas skills e os documentos indicados neles. Se uma skill não carregar automaticamente, leia seu `SKILL.md` em `.agents/skills/` e as referências que o fluxo exigir. As skills descrevem o caminho; este prompt expressa a direção de produto aprovada: concluir operações conversacionalmente sem cliques em controles financeiros.

Leia `Arquitetura.md` em sua totalidade e `Arquitetura/Assistente Lumus.md` antes de mudar o produto. Siga os links do vault para cada domínio, consulte instruções `AGENTS.md` aplicáveis e inspecione os serviços e contratos vigentes. Regras antigas que exigem confirmação por botão devem ser migradas junto ao comportamento e à documentação, sem usar seu texto como motivo para ignorar a direção aprovada.

O trabalho autoriza mudanças locais e validações seguras no repositório. Não autoriza deploy, publicação, migração em produção, gravação em dados financeiros reais, compra de serviço, envio de mensagem a terceiros, alteração externa de Firebase nem operação de release. Não faça essas operações. Use emuladores e fixtures para reproduzir efeitos financeiros.

## Como conduzir o trabalho

1. **Proteja o trabalho existente.** Verifique o branch, o estado do repositório e as alterações locais antes de editar. Preserve mudanças staged, unstaged e arquivos novos que já estavam presentes. Não reverta, sobrescreva, formate em massa ou limpe arquivos fora do seu escopo.
2. **Meça o estado atual.** Execute os checks pertinentes antes de alterar código quando viável. Registre falhas e problemas preexistentes para distinguir regressão nova de baseline. Inspecione chat, ferramentas, serviços, rotas, telas, navegação, persistência, caches e dependências.
3. **Faça um inventário exaustivo de rotas e capacidades.** Derive as rotas físicas com `rg --files app`, compare-as com `APP_ROUTE_PATHS`, guards (`Stack.Protected`), visibilidade, navigator e rotas que compartilham uma tela ou adaptador. Cruze isso com o vault, botões/ações das telas, serviços e regras de papel/relacionamento. Para cada destino/fluxo, identifique leituras, escritas, operações em lote, dependências, APIs, permissões, variantes Web/mobile, caminho legado/razão migrado e verificações. Inclua telas principais, pouco acessadas, secundárias, internas, deep links, abas e etapas de formulário. Agrupe adaptadores que entregam a mesma capacidade, mas registre cada rota física e diferença de comportamento; não conte arquivos Expo alternativos como capacidades independentes.
4. **Cubra todas as áreas reais.** Inclua pelo menos dashboard, análise, despesas/receitas, categorias, recorrências/parcelas, bancos, Caixa, saldos/ajustes, extrato, transferências, saques, investimentos/CDI, previsão, notificações/preferências, perfil, usuários/relacionamentos e anotações, conforme rotas e acessos reais. Investigue operações acessíveis por navegação, atalhos e deep link mesmo que estejam ocultas do navigator. Nada deve ser omitido por ter pouco tráfego.
5. **Mantenha a matriz atualizada.** Registre `rota física | fluxo/capacidade | serviço usado | leitura/escrita/lote | lacuna | implementação | validação | estado`. Atualize-a durante o trabalho; não a trate como entrega se houver lacunas ainda acionáveis. Se não houver métricas confiáveis de frequência, não adivinhe: preserve prioridade funcional igual para rotas raras e comuns.
6. **Implemente em fatias completas.** Em cada fatia, altere a camada dona do comportamento, conclua conversa, efeito de domínio, lote aplicável, atualização de leituras, variantes Web/mobile e documentação. Continue por todos os módulos e rotas. Não pare na rota principal, na auditoria ou na tela do assistente.
7. **Valide e feche.** Rode os checks exigidos pelo projeto, testes relevantes, fluxos no Emulator e builds/exportações afetadas. Separe o que passou do que foi simulado e do que exigiria aparelho ou serviço externo. Corrija regressões introduzidas antes de concluir.

Pergunte ao usuário somente se uma decisão de produto material não puder ser inferida com segurança das regras atuais e da autorização deste prompt. Resolva sozinho detalhes de implementação. Se uma área estiver tecnicamente bloqueada por uma API ou configuração ausente, continue todas as áreas independentes, documente a evidência e informe exatamente o desbloqueio necessário.

## Cobertura completa de rotas

- Não use frequência de acesso, posição no menu, visibilidade padrão ou familiaridade com o código como critério para excluir uma rota. A rota pouco utilizada precisa aceitar seus pedidos tanto quanto o fluxo diário.
- Compare os arquivos de rotas físicas com o registro central, rotas protegidas/ocultáveis, destinos do navigator, tabs e referências de navegação. Confira parâmetros, ações inline, telas internas, modos criar/editar, estados vazios e caminhos alternativos de plataforma.
- Para cada rota, converta as ações da tela em capacidades conversacionais. Cubra localizar informação, filtrar/consultar, criar, editar, concluir/pagar/receber, desfazer/corrigir, preferências e navegação quando suportados. Descubra submissões e efeitos dos formulários nos hooks e serviços; o rótulo visual não define sozinho a operação.
- Confirme que o chat resolve referências naturais para o módulo e serviço corretos sem exigir navegação para executar. Se a ação realmente for abrir outra tela, use o mecanismo suportado sem perder o contexto da conversa.
- Documente rotas sem ação financeira elegível — como login ou etapa que exige permissão do sistema — e valide a resposta esperada. Todas as rotas auditadas não significa inventar escrita em login ou acessar função bloqueada.
- Teste ao menos um fluxo conversacional por capacidade única e cada regra especial de autorização, papel, armazenamento, grupo ou plataforma. Flows idênticos podem compartilhar teste; exceções exigem evidência própria.

## Rapidez e precisão

- Defina a resposta correta antes de otimizá-la: consulta ao domínio certo, busca completa, unidade/data/conta corretas, autorização certa e resposta baseada em resultado persistido ou calculado.
- Meça latência ponta a ponta antes e depois para consulta pontual, comando completo, pergunta complementar e lote. Registre p50/p95, tamanhos de conjuntos, viagens à rede/modelo e escritas por item com dados representativos. Estabeleça metas conforme o ambiente real; reduza regressões sem prometer tempos impossíveis para rede ou plataforma.
- Resolva localmente comandos inequívocos que dispensam o modelo. Busque apenas os dados relevantes, paralelize leituras independentes e cacheie somente com escopo e invalidação corretos. Evite enviar todo o histórico ou catálogo ao modelo. Não paralelize escritas dependentes.
- Mostre estado de processamento imediatamente e progresso útil durante lotes; conclua com resultado curto. Exponha etapas observáveis, sem raciocínio privado do modelo nem valores ocultados pela privacidade.
- Responda a perguntas pontuais sem preâmbulo ou relatório desnecessário. Se faltar dado, período, índice, permissão ou serviço, identifique a limitação em vez de adivinhar.
- Fast path e fallback precisam produzir o mesmo resultado e aplicar a mesma autorização. Timeout e retry exigem consulta do estado e idempotência.

## Operações em lote para todas as áreas

Trate lote como capacidade do aplicativo, não como um array enorme enviado ao modelo. Reutilize a base para todas as áreas que aceitam operações repetidas: lançamentos, pagamentos/recebimentos, correções, movimentos, categorias, preferências e outros domínios elegíveis. Audite os serviços antes de assumir suporte; não limite lotes a pagar contas.

- Aceite conjuntos explícitos (“pague as cinco contas vencidas deste mês”) e vários itens ditados numa mensagem. Consulte o conjunto completo com paginação no aplicativo; conte encontrados, elegíveis, ambíguos, sem permissão, já concluídos e excluídos. Nunca trunque silenciosamente por limites de prompt, ferramenta, catálogo, página, Firestore ou modelo.
- Um pedido explícito pode autorizar a execução em lote. Se o escopo estiver ambíguo ou o domínio exigir confirmação adicional, apresente **um resumo agregado no chat** com filtro, período, quantidade, impacto/total disponível e exclusões relevantes; peça uma confirmação para aquele snapshot, nunca um clique ou confirmação repetida por item. Alterar item ou argumento material cria novo snapshot e invalida a autorização anterior.
- Execute por serviço determinístico com concorrência e tamanho de lote compatíveis com limites reais. Preserve a atomicidade definida pelo domínio; não prometa rollback integral para processamento item a item. Mantenha identificador do pedido, chave idempotente e estado/resultado por item.
- Mostre progresso agregado (“12 de 40 concluídas”). Permita cancelar em linguagem natural e pare de iniciar novos itens; identifique operações já persistidas e em andamento. Informe concluídas, falhas, ignoradas e motivo. Falha parcial não apaga sucessos nem libera dependentes de ações falhas.
- Retry reprocessa somente falhas comprovadas ou itens de resultado incerto depois de consultar a persistência. Não repita sucesso, não duplique recorrência e não processe lotes concorrentes com o mesmo identificador.
- Resuma lotes grandes e ofereça detalhes adicionais pelo chat. Relatório/paginação pode organizar a leitura, mas nenhum botão por item pode ser necessário. Não carregue todos os itens no prompt do modelo.
- Investigue limites de quantidade, valor total, tempo, memória, concorrência, quota e API. Use cursores, chunks e checkpoints quando o volume exigir. Se um limite real impedir o pedido, explique antes de executar, divida em partes explícitas com progresso preservado e não anuncie que o conjunto inteiro terminou.
- Aplique o padrão em Web/mobile e em todos os domínios elegíveis. Prove lotes pequenos e grandes, limites exatos, dependências, permissões mistas, falhas parciais, timeout, cancelamento e retry.

## Fluxo conversacional esperado

- Um pedido completo, direto e inequívoco pode ser executado sem pedir uma segunda autorização. Exemplo: “Registre R$ 82,90 de mercado hoje no Nubank, categoria alimentação.” Valide o comando e efetue a gravação pelo serviço financeiro correto antes de declarar sucesso.
- “Pague todas as contas de internet vencidas neste mês” deve localizar todas as elegíveis e concluir o lote como uma única intenção acompanhável; nunca abrir cartões nem pedir confirmação separada por conta. O mesmo princípio vale para os demais domínios e lotes suportados.
- Se faltarem dados, faça uma pergunta curta em português comum. A resposta pode preencher diversos campos de uma vez, usar um nome aproximado sem ambiguidade, responder por ordinal a opções citadas no chat, corrigir um campo, solicitar uma consulta paralela, cancelar ou iniciar outro assunto.
- O chat não pode ficar bloqueado por um rascunho, paginação ou cartão pendente. Mantenha cada intenção separada e permita que a pessoa se refira a ela naturalmente (“a despesa do mercado”, “a segunda”, “usa o Itaú”). Quando mais de um alvo couber, apresente distinções úteis em texto e espere a resposta; nunca escolha o primeiro por conveniência.
- Quando o domínio exigir confirmação adicional — por exemplo exclusão, estorno, alteração relevante, transferência, aporte/resgate ou ajuste de saldo — resuma o efeito atual no chat e aceite a resposta natural que o confirma. Um lote explícito e inequívoco não exige confirmação repetida por item. Se aquele pedido precisar de confirmação adicional, solicite uma única confirmação agregada para o conjunto atual. Uma correção após o resumo altera a proposta e invalida a confirmação anterior.
- “Sim” só autoriza quando responde a uma confirmação explícita e ativa ligada a uma versão específica da ação. Um “sim” para pergunta de relatório, texto citado, nome de registro ou resposta do modelo nunca autoriza uma escrita.
- Consultas entregam a resposta pontual antes de explicações. Pedidos compostos preservam todas as partes: uma escrita mais uma pergunta sobre saldo deve consultar o saldo atualizado após o commit confirmado. A falha de uma ação informa o resultado das demais sem repetir commits já concluídos.
- Voz e texto seguem as mesmas regras, referências, perguntas, autorização, gravação e resposta. Transcrição não é autorização separada nem prova de execução.

## Arquitetura e integração

Investigue, entre outros módulos identificados no estado atual, `contexts/LumusAssistantContext.tsx`, `types/lumusAssistant.ts`, `utils/lumusAssistant.ts`, schemas, prompt e declaração de ferramentas, `services/lumusAssistant/assistantGatewayCore.ts`, `assistantCatalogService.ts`, `financeCommandService.ts`, `assistantReportService.ts`, adaptadores Web/native/Expo Go, ambas as telas e os componentes de chat, além das APIs em `functions/`, `backend/src/`, hooks, cálculos e cache afetados.

Não coloque negócio financeiro ou execução em componentes de tela. Compartilhe o fluxo entre Web e mobile; deixe diferenças de teclado, áudio, layout e capacidades nativas nos adaptadores corretos. Reutilize os serviços de domínio e atualize leituras/cache/estado das telas atingidas após o commit.

Feche o caminho completo de toda ação que declarar suportada: mensagem → classificação → busca contextual suficiente → validação tipada → autorização conversacional conforme a política → revalidação no executor/backend → persistência real → atualização das leituras → resposta baseada no resultado. Leitura precisa usar a fonte completa do período, paginação/índice necessário e escopo correto; lista limitada recente ou catálogo truncado não comprova inexistência.

Não altere somente o system prompt. Ajuste em conjunto ferramentas, schemas, parsers, consultas/catálogos, contexto estruturado, máquina de estados, serviços de execução, camada de domínio/backend, UI, erros, cancelamento, retry, idempotência e testes sempre que forem afetados. O estado crítico do pedido (alvo, campos, origem, dependências, versão autorizada e resultado) não pode depender apenas de um histórico de texto truncável.

O modelo interpreta e propõe; o aplicativo valida e governa os efeitos. A IA não pode escrever diretamente no Firestore nem se conceder permissão. A evidência de autorização precisa vir do evento/mensagem do usuário autenticado e estar vinculada à sessão e à versão dos argumentos. Nunca aceite `confirmed: true` proposto pelo modelo como autorização. Revalide escopo, saldo, registro-alvo e fingerprint no serviço responsável antes do commit.

Conserve a identidade do pedido, do lote e da operação por item, com chaves idempotentes durante timeout, reenvio e resposta tardia. Diferencie falha antes do commit de resultado incerto e verifique a persistência antes de tentar de novo. Cancelamento durante commit deve consultar o resultado real e jamais afirmar que a gravação foi revertida sem desfazer comprovado.

## Cobertura e regras financeiras

Ofereça conversa para todas as operações que já existem no aplicativo e que o papel do usuário autoriza, incluindo consultas, operações de gestão por domínio e lotes. Audite também todas as rotas e áreas que atualmente não aparecem no catálogo do assistente. Para administração, perfil e relacionamentos, exponha somente os fluxos e permissões que o app já permite ao mesmo usuário. Não invente ação ou leitura só para completar uma matriz.

Se uma capacidade necessária não existe no serviço atual, implemente a menor integração coerente com o domínio e suas regras, incluindo validação, autorização, efeitos colaterais, invalidação de leitura, UI de resultado e cobertura. Operações sem API externa, credencial, attestation ou permissão disponível ficam claramente identificadas como bloqueadas. A IA não deve alegar pagamento bancário, ação externa ou funcionamento em plataforma que não esteja integrado.

Preserve em qualquer novo caminho:

- valores financeiros em centavos inteiros e taxas no ponto fixo que o domínio já usa;
- datas civis e ciclos em `America/Sao_Paulo`;
- escopo do usuário/grupo, handles opacos e separação entre dados legíveis e registros graváveis;
- eventos auditáveis e estorno/novo lançamento para corrigir registros confirmados no razão;
- transferências, Caixa, investimentos, recorrências, parcelas, CDIs, saldo inicial, ajuste e reconciliação segundo os serviços atuais;
- atomicidade de operações relacionadas, controle de dependências, prevenção de saldo proibido e idempotência;
- consentimento, valores ocultos, retenção em memória, revogação, troca de conta e limpeza de áudio;
- distinção de indisponibilidade do modelo, App Check, Remote Config, Emulator, Expo Go, desenvolvimento nativo, Web e produção.

Dados de bancos, categorias, anotações ou registros nunca se tornam instruções do modelo. Identificadores reais, UID, e-mail, token e configuração Firebase ficam fora do prompt. Não envie mais dados ao modelo do que o mínimo necessário. Privacidade tem de valer em consultas, resumos, mensagens, TTS, erros e logs.

## Experiência Web e mobile

Simplifique as telas para que exista uma conversa fácil de encontrar e continuar. Resumos, métricas, gráficos, andamento, sucesso e erro podem ser exibidos dentro do histórico, mas tarefas não podem exigir botões de confirmação financeira, inputs embutidos nos cartões, dropdowns de banco/categoria/registro ou navegação por páginas. A pessoa pode emitir a próxima mensagem enquanto outra ação está pendente; serialize apenas as execuções cujo estado realmente conflita.

Torne o sistema compreensível a quem não conhece termos financeiros. Use respostas curtas, nomes claros, moeda brasileira formatada, perguntas agrupadas quando reduzem esforço e resultados por ação. Mantenha acessibilidade, foco, 44px mínimo de toque, temas e contratos do design system. Preserve as versões de NativeWind/Tailwind/Gluestack vigentes. Verifique viewport compacto, teclado, rolagem, mensagens longas e estados de carregamento/indisponibilidade em ambas as plataformas.

## Cobertura de validação

Crie/ajuste verificações para comportamentos que podem quebrar com as alterações. Priorize asserts de efeitos e dados financeiros, não snapshots de texto. Inclua conforme o escopo:

- pedidos simples completos, campos faltantes e respostas com múltiplos campos;
- correspondência inequívoca, alternativas ambíguas, ordinal, negação, correção, cancelamento e mudança de assunto com pedido pendente;
- consulta pontual além dos limites da Home/catálogo e janela de data/ciclo de São Paulo;
- múltiplos comandos, dependências e combinação consulta + escrita;
- inventário comparado de todas as rotas, incluindo raras, ocultáveis, internas, deep links e adaptadores de plataforma;
- lote em cada domínio aplicável: volume alto, paginação completa, limites, permissões mistas, duplicata, dependência, falha parcial, cancelamento, progresso, retry e reconciliação do resultado incerto;
- latência p50/p95 antes/depois em comandos simples, consultas pontuais e lotes representativos, sem regressão de precisão;
- confirmação no chat, “sim” fora de contexto, correção depois de confirmação e confirmação da versão certa;
- ação negada por permissão, referência somente leitura, concorrência, fingerprint stale e mudança de UID;
- reenvio/timeout após commit, falha parcial, retry e notificação pós-commit;
- número em centavos, saldo, recorrência, transferência, investimento, Caixa, grupo legado e grupo migrado no razão;
- paridade Web/mobile, teclado, envio de voz/texto, privacidade, revogação e indisponibilidade.

Use Emulator e dados sintéticos. Passe os testes focados e os gates documentados em `Arquitetura.md`; rode `npm run lint:styles` para UI e checks de tipo/exportação das plataformas afetadas. Inspecione flows em navegador/aparelho se o ambiente permitir e distinga essa evidência do que foi mockado. Conserte falhas que sua alteração causar; não oculte baseline que já falhava.

## Critério de conclusão

Não finalize após apresentar descobertas ou um plano. Para o escopo completo:

1. Todas as rotas físicas e os fluxos únicos foram comparados com o roteador, guards, navigator e permissões. Nenhuma foi excluída por baixa frequência; cada item tem evidência de integração ou bloqueio com motivo exato.
2. Toda capacidade marcada como suportada percorre o caminho real de ponta a ponta, funciona por conversa e atualiza o sistema afetado. Os cenários passam sem selecionar cartões ou opções fora do chat.
3. Lotes em todos os domínios aplicáveis demonstram completude, progresso, estado por item, concorrência controlada, autorização, cancelamento e retry sem duplicatas.
4. Métricas comparáveis mostram a rapidez obtida e a precisão mantida em Web/mobile e nos fluxos simples/de alto volume; metas e limites reais são informados.
5. Web e mobile oferecem comportamento conversacional equivalente dentro das capacidades próprias da plataforma.
6. Código, testes, `Arquitetura/Assistente Lumus.md`, notas dos domínios afetados e `Active Context` descrevem o comportamento efetivamente entregue.
7. `git diff --check` e as validações pertinentes passam; toda falha preexistente ou limitação de execução está identificada separadamente.
8. As alterações locais do usuário continuam preservadas. Nenhuma ação externa ou financeira de produção foi realizada.

Na resposta final, informe os módulos concluídos, os principais fluxos conversacionais adicionados, os checks executados com resultado, o estado da matriz de cobertura e as limitações remanescentes com evidência. Não use “completo”, “perfeito” ou “100% funcional” para capacidades não verificadas.
