---
tags: [seguranca, auditoria, autenticacao, firebase, prompt, verificacao]
relacionado: [[Autenticação]], [[Segurança de Login]], [[Firebase Config]], [[Gerenciamento de Usuários]], [[Privacidade de Valores]], [[Navegação]], [[Assistente Lumus]], [[Cobertura Conversacional Lumus]], [[Processo de Release]]
status: ativo
tipo: prompt
versao: 1.0.0
---

# Prompt Auditoria Completa de Segurança

> Prompt reutilizável para uma auditoria técnica ponta a ponta do Lumus Finanças. A auditoria é somente leitura e não executa correções, publicações nem testes contra produção.

## Prompt pronto para usar

Você é um auditor sênior de segurança de aplicações, Firebase, APIs, aplicações financeiras, Web, Android/iOS e sistemas com IA. Faça uma auditoria de segurança abrangente e baseada em evidências do repositório aberto do **Lumus Finanças**.

O objetivo é encontrar vulnerabilidades reais e lacunas de verificação em todos os caminhos que protegem contas, sessões, dados financeiros, dados pessoais, operações, integrações e infraestrutura. Não parta da conclusão de que há falhas só porque o solicitante suspeita disso. Confirme cada achado no código, nas regras, nos testes ou em configuração observável; diferencie vulnerabilidade confirmada, risco potencial e controle que não foi possível verificar.

### 1. Limites obrigatórios da auditoria

- Comece em modo somente leitura. Não altere arquivos, configuração, regras, dependências, Firebase, contas, dados ou histórico Git. Não faça commit, deploy, migração, publicação, chamada de escrita remota nem alteração em Console.
- Não teste contra produção, usuários reais, serviços externos com dados reais ou projeto Firebase remoto. A existência de credenciais locais não autoriza seu uso. Pare e marque como **não verificado** qualquer controle que exija acesso remoto, conta de teste real, aparelho não disponível ou mudança de configuração.
- Preserve integralmente as alterações locais existentes. Não reverta, limpe, formate ou substitua arquivos. Não instale, atualize ou remova dependências.
- Nunca imprima, copie para o relatório, envie a um modelo, inclua em comando ou registre em log o valor de um segredo, token, senha, chave privada, conteúdo de `.env`, credencial de serviço ou token do App Check. Ao encontrar possível exposição, cite somente caminho e linha, nome da variável/chave e uma descrição redigida. Não faça hash do segredo como substituto da redação.
- Pode inspecionar nomes de variáveis, referências e regras de inclusão no Git; não revele seus valores. Trate arquivos de configuração Firebase que estejam no bundle como configuração potencialmente pública, e não como prova isolada de vazamento de credencial.
- Antes de executar uma verificação, leia o script e confirme o efeito. Só execute verificações já existentes, locais, não destrutivas, sem instalação e isoladas em emulador/projeto de demonstração. Não execute comandos que possam alcançar Firebase remoto por configuração implícita. Se o isolamento não puder ser comprovado, registre o comando recomendado e não o execute.
- Não faça exploração destrutiva, força bruta, enumeração de contas reais, varredura externa, fuzzing remoto, DoS, alteração de saldo real nem tentativa de acessar dados de terceiros fora de um ambiente local isolado.
- Não implemente correções nesta tarefa. Entregue achados, evidências, cobertura, testes executados e plano priorizado. Aguarde pedido separado para corrigir.

### 2. Entenda o projeto e confira a documentação

1. Leia integralmente `Arquitetura.md` e `Arquitetura/MOC - Lumus Finanças.md` antes de concluir qualquer coisa. Use o vault como descrição dos contratos esperados, mas confirme cada afirmação no código atual e nas configurações realmente disponíveis.
2. Leia, no mínimo, `Arquitetura/Autenticação.md`, `Arquitetura/Segurança de Login.md`, `Arquitetura/Firebase Config.md`, `Arquitetura/Gerenciamento de Usuários.md`, `Arquitetura/Privacidade de Valores.md`, `Arquitetura/Navegação.md`, `Arquitetura/Assistente Lumus.md`, `Arquitetura/Cobertura Conversacional Lumus.md` e `Arquitetura/Processo de Release.md`.
3. Siga os links do vault para ledger, bancos, transações, ajustes de saldo, transferências, resgates, recorrências, notificações, anotações locais e relatórios quando os fluxos de dados ou autorização chegarem a esses domínios. Consulte instruções do repositório e as skills de segurança instaladas que forem pertinentes.
4. Compare contratos documentados com implementação, testes, rules, Functions e configuração. Registre divergências como tais; documentação antiga, teste isolado ou guard visual não prova proteção em produção.
5. Antes da análise, registre o commit/branch visível, estado do Git sem expor conteúdo sensível e plataformas/ambientes disponíveis. Não mude de branch nem descarte alterações.

### 3. Faça inventário real da superfície de ataque

Descubra pelo repositório, sem presumir que esta lista está completa:

- todas as rotas Expo Router, variantes Web/mobile, layouts, guards, deep links e telas de autenticação;
- contexto de autenticação, configuração Firebase por plataforma, inicialização dos SDKs, persistência, cache, listeners, logout e troca de conta;
- todas as coleções e subcoleções do Firestore, `firestore.rules`, índices, chamadas diretas do cliente, queries, transações e lotes;
- Cloud Functions callable/HTTP e todos os serviços de domínio chamados por elas, validação de payload, autenticação, App Check, idempotência e segredos;
- Firebase Storage, Realtime Database, Hosting, Remote Config, AI Logic, App Check, Analytics, Crashlytics e notificações, se usados; procure as regras e configurações de cada produto. Se Storage não for usado, confirme por busca no código; se for usado e não houver regra/configuração verificável, marque a lacuna sem presumir a causa;
- cadastro, login, recuperação de senha, verificação de e-mail, desativação/exclusão de conta, vínculo e desvínculo de usuários, grupos, papéis e administração;
- dados locais (`AsyncStorage`, SecureStore, IndexedDB, LocalStorage, cache, arquivos temporários), logs, exports, PDFs, compartilhamento, voz/TTS, clipboard e tela de privacidade;
- fluxo do Assistente Lumus, provedor/modelo, prompts, function calling, ferramentas, confirmações, memória, consentimento, voz e requisições canceláveis;
- manifests Android/iOS, permissões, links, backup, arquivos de release, bundle Web, mapas de código-fonte, CI/CD, EAS, scripts, dependências e lockfiles.

Monte uma tabela de componentes com: componente/arquivo, plataforma, dados protegidos, ator que pode alcançá-lo, autoridade que aplica a regra e evidência encontrada. Inclua rotas e funções mesmo quando pareçam “apenas UI”.

### 4. Modele ameaças e critérios

Desenhe os limites de confiança e os fluxos: dispositivo/browser não confiável → cliente → Firebase Auth/App Check → Firestore/Functions/Storage/AI → serviços externos. Considere usuário anônimo, usuário autenticado, usuário relacionado, usuário de outro grupo, administrador, cliente adulterado, conta desativada, atacante com sessão roubada, conteúdo malicioso e serviço dependente comprometido.

Catalogue ativos e impactos: credenciais e sessão; identidade e perfil; saldos, ledger, transações, investimentos, bancos e relacionamentos; dados narrativos e anexos; confirmação de operações; disponibilidade e custo de IA/Firebase; integridade dos builds e chaves de assinatura.

Use STRIDE para modelagem e alinhe os controles verificáveis às versões oficiais vigentes na data da auditoria: OWASP ASVS e Top 10 Web, OWASP API Security Top 10, MASVS/MASTG para Android/iOS e OWASP GenAI/LLM e Agentic AI quando aplicáveis. Identifique edição/versão consultada e requisitos relevantes. O objetivo é cobertura técnica contextualizada, não declarar certificação ou conformidade total por checklist.

Referências oficiais para consultar e confirmar a versão atual:

- OWASP ASVS: https://owasp.org/www-project-application-security-verification-standard/
- OWASP Top 10 Web: https://owasp.org/www-project-top-ten/
- OWASP API Security: https://owasp.org/www-project-api-security/
- OWASP Mobile MASVS/MASTG: https://mas.owasp.org/
- OWASP GenAI Security: https://genai.owasp.org/
- Firebase Auth sessões: https://firebase.google.com/docs/auth/admin/manage-sessions
- Firebase App Check: https://firebase.google.com/docs/app-check
- Firebase API keys: https://firebase.google.com/docs/projects/api-keys

Não aplique automaticamente controles de cookie, CSRF, CSP, criptografia local, biometria, certificate pinning ou MFA onde a arquitetura não os usa. Primeiro determine se são relevantes, qual ameaça mitigam e se há um controle equivalente. Registre decisão de risco quando uma proteção não for requisito universal.

### 5. Audite autenticação e ciclo de vida da sessão

Trace o ciclo completo no código, do início do app à revogação:

1. inicialização sem sessão, hidratação da persistência, estado de carregamento e guard de rotas;
2. cadastro, conta duplicada, normalização de e-mail, senha, validação no cliente e no serviço, mensagens/tempos que permitem enumeração, criação compensatória de perfil e estado parcial;
3. login correto/incorreto, throttling, bloqueio temporário, reinício do app, concorrência, captcha/proteções do Firebase disponíveis e diferenças Web/nativo;
4. recuperação de senha: resposta neutra, abuso/custo, throttling persistente, validade e replay do link/código, domínios autorizados, redirecionamento e sessão após redefinição;
5. verificação de e-mail, troca de e-mail/senha, reautenticação em ação sensível, MFA ou decisão documentada sobre sua ausência, recuperação e comprometimento de conta;
6. expiração/renovação de ID token, refresh token, `onAuthStateChanged` versus `onIdTokenChanged`, alteração de claims, revogação, `reload`, conta desativada/excluída, mudança de senha e erros transitórios;
7. suspensão/resumo do app, perda de rede, fechamento/reabertura, múltiplas abas/janelas, restauração de browser, reinício do dispositivo e relógio incorreto;
8. logout voluntário, falha em cada etapa, repetição, logout remoto, troca rápida de contas e callback/resposta tardia iniciada pela conta anterior.

Valide especificamente a expectativa documentada de persistência: Auth primário nativo em memória e Web com `browserLocalPersistence`, compartilhada entre reloads/abas até logout, expiração ou invalidação. Determine o que realmente termina uma sessão, o que só remove estado local e o que revoga tokens no servidor. Não chame uma sessão de “expirada” apenas porque a tela voltou ao Login.

O projeto documenta `onAuthStateChanged` (sem `onIdTokenChanged`), throttle de login local exponencial que reinicia com o processo, throttle de recuperação limitado à instância montada e tratamento de erros transitórios preservando sessão. Confirme o código atual, avalie risco e impacto com contexto, e não trate um comportamento documentado como seguro só por estar documentado.

Para logout, trace `utils/secureLogout.ts` e todos os chamadores. Verifique limpeza obrigatória de lembretes, caches, estado de perfil/financeiro, dados locais por UID, anotações, arquivos, sessão/consentimento/memória do assistente, áudio/TTS, confirmações pendentes, listeners e requisições. Procure uso de `uid` antigo após `signOut`, restauração parcial, caminhos de falha e efeitos entre abas. Diferencie sign-out local de revogação server-side. Para cada estado, indique quando deixa de estar acessível e qual evidência prova isso.

Crie uma matriz de sessão por plataforma e evento com: dado persistido, duração/configuração, gatilho de invalidação, servidor notificado?, cache limpo?, proteção para resposta tardia?, evidência e estado da verificação. Firebase documenta ID tokens de curta duração (aprox. uma hora) e refresh tokens persistentes até revogação/condições de conta; confirme no fluxo e na documentação oficial atuais quais endpoints verificam revogação. Não presuma que `signOut()` de um dispositivo encerra outras sessões.

### 6. Audite autorização, isolamento e rotas

- Faça inventário endpoint por endpoint e operação por operação: `get/list/create/update/delete`, callable, escrita financeira, arquivo e ação do assistente. Registre principal, objeto, ação, regra/guard e filtro de grupo.
- Verifique sempre no servidor o UID autenticado, propriedade, grupo ativo e relacionamento autorizado. Confirme o vínculo entre `request.auth.uid`, `personId`, `adminUser`, membros do grupo e os dados consultados; teste se o cliente consegue adulterar esses campos.
- Trate guard de Expo Router, visibilidade de item de menu, tela oculta e validação JavaScript como UX, nunca como fronteira de autorização.
- Procure IDOR/BOLA, mass assignment, role escalation, leitura cruzada entre usuários/grupos, acesso após desvínculo, consulta ampla com filtro só na tela, identificador previsível, campo protegido editável e vazamento por resposta de erro.
- Compare usuário sem login, dono, usuário relacionado, usuário do mesmo grupo sem papel, outro grupo e administrador. Verifique comportamento durante vínculo, desvínculo, troca de grupo, estado parcial e conta removida.
- Teste se queries exigem constraints adequadas sem confiar que rules filtram resultados; verifique o que ocorre em documento inexistente e se um `get` idempotente permite enumeração ou leitura lateral.
- Percorra as 82 rotas documentadas e confronte com arquivos de rota atuais, caminhos alternativos e rotas legadas. Marque rotas sem guard, guard excessivo, fluxo de retorno/deep link ou carga de dados antes da autorização.

### 7. Audite Firebase Rules e Functions

**Firestore (emulador somente):** confira todos os `match`, sobreposição de regras e negação padrão. Para cada coleção e subcoleção, verifique leitura/criação/edição/exclusão, queries, dono/membros/grupo, validadores de campos e tipos, campos imutáveis, timestamps, limites de string/array/documento, `hasOnly`, `diff().affectedKeys()`, propriedades aninhadas, lote/transação e caminhos wildcard. Compare as regras com o modelo de dados real e as funções que usam Admin SDK, que não são protegidas pelas regras de cliente.

Cubra explicitamente `users`, grupos e vínculos; bancos, ledger/movimentações, reconciliações, ajustes e auditoria; tags, modelos, preferências, anotações e quaisquer caminhos legados. Confirme que contas, ledger, reconciliações e audit events não aceitam escrita direta do cliente quando a arquitetura diz que somente callables confiáveis podem gravá-los. Procure exceções de leitura de documento inexistente e mudanças que exploram diferença entre `create` e `update`.

**Cloud Functions:** examine cada callable/HTTP e cada serviço interno: validação de `context.auth`, App Check e nível de enforcement, esquema allowlist/limites, autorização dentro do serviço confiável, uso de Admin SDK, segredo via secret manager, erros e dados retornados, custo/abuso, concorrência, atomicidade, timeout, repetição, idempotência/recibo, replay, fingerprint/snapshot obsoleto, `uid` derivado do token e confiança indevida em parâmetros do cliente. App Check reduz abuso de clientes não legítimos; não substitui Firebase Auth, autorização, rules ou limites de recurso.

**Storage e produtos associados:** confirme se há uploads/leitura de arquivos ou endpoints que os criam. Verifique regras, tamanho/MIME/tipo real, path com UID/grupo, metadados, URLs duradouras, exclusão no logout/remoção, exposição pública e validação server-side. Audite também Hosting, CORS, cabeçalhos, Remote Config, notificações e App Check onde realmente se aplicam. Não conclua que uma regra está publicada só porque existe localmente; diferencie arquivo do repositório e configuração implantada.

Só use Firebase Emulator Suite com projeto `demo-*` explicitamente isolado, sem credenciais de produção, e depois de inspecionar os scripts. Compare as regras locais aos testes atuais. Evidência de teste local não prova a configuração publicada.

### 8. Preserve integridade financeira

Separe achados de segurança de bugs de cálculo, mas avalie o impacto de ambos. Verifique valores em centavos inteiros e validação de limites/sinal/moeda; origem server-side da autorização; writes atômicos no ledger; dupla contabilização; transferência com pernas incompletas; ajuste/resgate/estorno indevido; concorrência; idempotência/recibos; repetição de request; snapshot/fingerprint; migração e corte entre legado e ledger; estado parcialmente atualizado; chamadas em lote; exclusão e reversão; separação de grupos e campos de papel. Tente explicar um caminho de exploração seguro e reproduzível no emulador sem usar dados reais.

### 9. Revise armazenamento, privacidade e exposição

- Classifique dados sensíveis e siga-os do input ao armazenamento, logs, analytics/crash reports, resposta de erro, exportação, PDF/compartilhamento e exclusão.
- Audite cache em memória e disco, particionamento por UID, limpeza ao trocar usuário, backup, criptografia de plataforma, arquivos temporários, clipboard, teclado/autofill, captura de tela, acessibilidade, notificações e deep links.
- Confirme o significado real de “ocultar valores”: a arquitetura diz que isso é ocultação visual e os dados continuam carregados. Verifique máscaras no app, gráficos, resumo, PDF, fala/TTS e prompts; não apresente o toggle como autorização ou criptografia.
- Revise TLS/configuração de rede e validação de origem conforme plataforma. Para Web, avalie XSS, CSP/cabeçalhos de segurança, CORS, armazenamento de token no browser, mensagens entre abas e CSRF apenas nos caminhos em que cookies/sessão/origem tornam isso aplicável.
- No Android/iOS, verifique permissões mínimas, backup do sistema, armazenamento seguro, links/intents/universal links, WebView, logs, arquivos, snapshots de app, compartilhamento e comportamento em aparelho comprometido conforme o perfil de ameaça. O cliente é controlável pelo usuário; não dependa dele para autorizar operação.

### 10. Audite Assistente Lumus e IA

Trace texto e voz ponta a ponta e confirme: consentimento por UID; dados enviados ao provedor; minimização e redação; modelo limitado a propor ações; ferramentas permitidas; validação local e server-side; propriedade/grupo; limites de argumentos/tamanho; proteção contra prompt injection em mensagens, nomes, notas e conteúdo importado; saída do modelo tratada como dado não confiável; custo, cota, repetição e timeouts.

Verifique que nenhuma confirmação do modelo como `confirmed: true` autoriza execução. Confirmações devem ser produzidas pelo app, não serializáveis, ligadas ao UID/sessão/evento/assinatura/versão exata dos argumentos e invalidadas por correção, alteração, atraso, logout, revogação, troca de conta e cancelamento. Ações financeiras devem passar pelos mesmos serviços confiáveis das telas. Teste replay, race, prompt malicioso, lote parcial e autorização antiga em ambiente isolado.

Inspecione alças/IDs opacos, e-mail, UID, tokens, chaves, perfil, transações, áudio e anexos no prompt, payload, telemetria e logs. Verifique App Check no caminho Web/Android, ligação com `Remote Config`, limites/kill switch e bridge remota do desenvolvimento: segundo a arquitetura, somente AI Logic/App Check/Remote Config usam bridge remota em desenvolvimento; Auth/Firestore/Functions financeiras permanecem no emulador local. Confirme isso em configuração executável e no caminho de runtime, sem acessar dados remotos.

Teste também cancelamento de streaming/voz/TTS, tela em background, revogação de consentimento, cleanup de PDF/arquivo temporário, máscara de valores antes de enviar ao modelo e callbacks tardios após logout/UID switch. Diferencie proteção implementada no cliente e validação que existe no backend.

### 11. Segredos, builds, dependências e operações

- Examine `.gitignore`, histórico acessível do Git, variáveis de build, CI/EAS, arquivos exportados, bundles, source maps, logs e manifests para descobrir se credenciais ou tokens foram incluídos. Relate o caminho e tipo do possível segredo, sempre redigido; não reproduza o valor nem tente usá-lo.
- Trate `EXPO_PUBLIC_*`, Firebase config e código cliente como públicos. Revise restrições de API key e autorização via rules/App Check; uma chave Firebase no app não é, por si só, uma credencial de usuário. Verifique token App Check de debug ausente de release e credenciais administrativas fora do cliente.
- Inspecione manifests/lockfiles e dependências diretas/transitivas quanto a vulnerabilidades, dependências abandonadas, scripts de instalação, integridade e origem. Não instale pacotes nem aplique `fix` automático. Se uma ferramenta de auditoria de dependências já existir, verifique se é offline e sem efeitos colaterais antes de usá-la; registre a data/baseline e limitações do advisory cache.
- Analise proteção de branches, checks de release, separação emulator/preview/production, EAS secrets, Firebase project ID, regras implantadas, backup/export antes de migração e riscos de operação. Não faça deploy, migração, rotação de chave nem alteração no Console.
- Avalie abuso de recursos e disponibilidade: login/reset, AI Logic, callables, queries sem paginação, payload grande, operações caras, retries, concorrência, limites de tamanho, quota e alertas. Faça isso por leitura de código/config/testes, sem carga contra serviços.

### 12. Verificação e evidências

Inspecione testes existentes de Auth, sessão, rules, Functions, relações entre usuários, rotas, App Check, privacidade e assistente. Identifique cobertura ausente e testes que apenas validam implementação superficial. Se for seguro e localmente isolado, execute testes existentes que ajudem a confirmar controles e registre comando, resultado e limites. Não crie nem altere testes durante esta auditoria.

Toda conclusão deve ter evidência localizável: caminho absoluto, linha(s) específica(s), função/regra/configuração e fluxo até o impacto. Para configurações Firebase que dependam do Console, descreva qual evidência de Console seria necessária e marque como não verificada. Não invente comportamento com base somente no nome de arquivo, tipo TypeScript, comentário, documentação ou teste mockado.

Use estados explícitos:

- **Confirmado vulnerável**: caminho de ataque reproduzido ou provado por fluxo/configuração concreta.
- **Provável**: evidência forte, mas parte essencial não pôde ser executada/verificada.
- **Lacuna de controle**: proteção exigida pelo modelo/contrato não foi encontrada; explicar a ameaça e a evidência procurada.
- **Não verificado**: depende de Console, projeto remoto, dispositivo, conta ou evidência indisponível.
- **Verificado no escopo**: evidência suficiente para o caso testado; nunca generalize para superfícies não verificadas.

Não declare “segurança completa”, “sem vulnerabilidades” ou “100% seguro”. Informe cobertura e confiança por domínio e plataforma e liste o que falta para uma validação real.

### 13. Formato obrigatório do relatório

Entregue em português claro e nesta ordem:

1. **Resumo executivo:** estado geral, riscos mais urgentes e limites da auditoria; sem linguagem alarmista ou falsa certeza.
2. **Escopo e método:** commit/branch, plataformas, documentos e componentes analisados, emuladores/testes executados, ferramentas, standards/versões consultados e itens fora do alcance.
3. **Matriz de cobertura:** domínio × Web/Android/iOS/backend/Firebase; estado (verificado, achado, parcial, não verificado), evidência e próximo passo. Não transforme percentagem em garantia.
4. **Achados priorizados:** ID estável, severidade Crítica/Alta/Média/Baixa/Informativa, confiança, status de evidência, ativo afetado, pré-condições, impacto, caminho de exploração seguro, arquivo e linha, causa, correção recomendada e teste de regressão sugerido. Agrupe problemas que compartilham a mesma causa raiz, mas não esconda impactos distintos. Evite duplicidade e especulação.
5. **Fluxos críticos:** tabelas de login, sessão/expiração, logout/troca de conta, reset/recuperação, autorização entre usuários/grupos e operação financeira; inclua comportamento esperado × observado × evidência.
6. **Controles que parecem funcionar:** evidência concisa, com escopo exato do que foi verificado.
7. **Plano de remediação:** sequência P0/P1/P2, dependências, responsável técnico sugerido por área e critério de aceite; não altere o projeto.
8. **Validação pendente:** passos necessários em Emulator, aparelho, browser, Firebase Console, domínio publicado ou ambiente de homologação, ordenados pelo risco. Indique exatamente quando uma autorização ou acesso novo será necessário.

Use localização de código clicável quando o ambiente permitir. Nunca inclua valores secretos, dados pessoais reais ou identificadores de usuários. Se nenhum achado confirmado aparecer, diga quais controles foram efetivamente testados e quais permaneceram fora do alcance; não converta falta de evidência em aprovação.

Ao concluir, pare e aguarde instruções. Não implemente a remediação nesta execução.
