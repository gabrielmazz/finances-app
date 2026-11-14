# Arquitetura.md — Lumus Finanças

Leia este guia antes de alterar o projeto. O vault `Arquitetura/` descreve a base atual; o histórico da arquitetura encerrada está no ponto de recuperação, fora do código ativo.

## Estado atual

Frontend Expo 58 / React Native 0.88 / React 19.3 / TypeScript 6. Fundação Firebase Spark reconstruída com SDK oficial: Auth, perfis, contexto de acesso e Rules locais testadas. Etapa 03 acrescenta autorização verificada, isolamento, exportação criptografada e recuperação isolada. Bancos, Saldo Inicial, Categorias e operações bancárias de receitas e despesas têm implementação local para o emulador; o extrato inclui o histórico legado cujo contexto e tipo possam ser comprovados; os demais formatos, a conciliação antiga e a homologação física permanecem pendentes. Ver [[Fundação Firebase Spark]] e [[Segurança e Preparação para Produção]].

A entrada mantém os formulários existentes, agora integrados ao Auth emulator. Workspace exige sessão real no ambiente isolado. Fixtures sintéticas existem somente no emulador, por seed explícito; não criar identidade fictícia no frontend ou confirmar operações indisponíveis. Em 09/11, as Rules restritivas foram publicadas com autorização e o hash exato foi verificado. O cliente permite configuração produtiva explícita do mesmo projeto/app, sem fallback automático; o novo frontend não foi distribuído. Uma cópia real criptografada de 987 documentos Firestore foi restaurada em rede isolada com hashes iguais. Contas Auth têm agora cópia cifrada separada autorizada (três contas), com integridade verificada. Web real homologada com identidade autorizada; observação contínua das Rules comprovada. Estado atual e limites em [[Homologação e Recuperação da Etapa 03]].

## Mapa de trabalho

- Visão geral e módulos: [[MOC - Lumus Finanças]].
- Escopo, inventário, recuperação e verificações da limpeza: [[Remoção do Backend]].
- Fundação atual, ambiente, Rules, testes, consumo e preservação: [[Fundação Firebase Spark]], [[Autenticação]], [[Perfil do Usuário]].
- Segurança, compatibilidade publicada, backup/restore e implantação: [[Segurança e Preparação para Produção]], [[Homologação e Recuperação da Etapa 03]].
- Código e rotas: [[Organização do Código]], [[Navegação]], [[Visibilidade de Rotas]].
- UI e temas: [[Componentes UI]], [[Componentes por Sistema]], [[Sistema de Temas]], [[Auditoria de Design]].
- Estados e preferências: [[Hooks Customizados]], [[Privacidade de Valores]], [[Comportamento Pós-Registro]].
- Execução local: [[Versão Web]], [[Processo de Release]].
- Telas de domínio: consulte o documento do mesmo módulo no vault antes de alterar sua apresentação.

## Fronteiras

`app/` delega a `screens/mobile` e `screens/web`. Componentes reutilizáveis ficam em `components/`; tokens e contratos visuais em `design-system/`. `application/` contém operações de conta/erros; `domain/` valida e interpreta perfis sem SDK; `firebase/` concentra persistência/configuração. `SessionContext` compartilha uma sessão e perfil. `BankAccountsContext` compartilha páginas de contas por contexto, sem listeners duplicados; hooks de formulário/consulta coordenam as operações de banco. Hooks mantêm interação e indisponibilidade dos módulos ainda não reconstruídos. Telas, componentes e `types/presentation/` não importam SDKs.

Os antigos diretórios `backend`, `functions`, `services` e `repositories` foram eliminados. Não recriar sua API sob uma nova fachada. Qualquer futuro serviço deve ser definido independentemente, em uma funcionalidade pequena, verificável e autorizada.

## Regras de preservação

- Manter todas as rotas, telas, variantes, assets e identidade visual.
- Preservar o frontend original nas próximas etapas: recuperar seletivamente pelo histórico quando necessário e adaptar o backend aos componentes, formulários e navegação existentes. Não introduzir controles, informações ou painéis sem necessidade funcional comprovada.
- Manter NativeWind 4.2.1, Tailwind 3.4.18 e Gluestack 3.0.12.
- Usar tokens/classes de `design-system/`; não introduzir estilos visuais inline ou novas exceções sem necessidade de plataforma.
- Preservar acessibilidade, foco, labels e responsividade. Campos e rascunhos não podem ser apagados por uma falsa confirmação.
- Valores recebidos pelos modelos visuais continuam em centavos inteiros; máscaras de entrada e conversão de exibição não constituem cálculo de saldo ou transação.
- Preservar UIDs, documentos e campos legados. Inspeção remota somente leitura, sem copiar PII para o repositório. Testes/fixtures apenas em projeto demo dos emuladores.
- Ações remotas exigem autorização específica: a publicação de Rules de 09/11 foi autorizada e concluída. Nenhuma autorização para migrar, excluir ou alterar dados financeiros/contas/infraestrutura paga está implícita.
- Diretriz permanente: usar exclusivamente recursos disponíveis no Firebase Spark gratuito, sem Blaze, faturamento, Cloud Functions ou Cloud Run. Minimizar consultas, gravações, listeners e carregamentos integrais; preservar dados e IDs. Testar no emulador antes de publicação e consultar a documentação oficial em caso de dúvida sobre custos ou cotas. Não criar dependência de recursos pagos; propor alternativa gratuita se uma funcionalidade segura não for viável no Spark.

## Verificação e documentação

Executar `npm run lint:styles` em mudanças de UI, tipos e os testes pertinentes. `npm run check` reúne estilos, tipos e testes do frontend. Exportar Web e bundles nativos quando a mudança afetar inicialização/imports. Distinguir exportação de execução instalada.

Atualizar o documento do módulo e este Active Context quando comportamento/arquitetura mudar. Usar `[[wiki-links]]` e nomes de arquivo com espaços no vault. Preservar alterações do usuário e criar recuperação antes de remoções amplas.

## Active Context

- 2026-11-14: por autorização específica, somente o índice `cashRescues` `CICAgJiHgokK` foi criado em produção e está `READY`. Os 26 índices anteriores, as Rules e o faturamento desativado foram verificados sem mudanças. A consulta descendente com a sessão oficial respondeu sem fallback; a página estava sem saques. O usuário relatou saque em conta vinculada, mas a sessão não apresentou autorização protegida verificável para outro titular ou grupo. Paginação com 45 saques permanece comprovada no emulador. Ver [[Dashboard Home]] e `docs/stage-07-indice-saques.md`.

- 2026-11-14: paginação de 45 saques e Rules exercitadas no emulador; o índice descendente ainda não existe no projeto oficial. Procedimento de criação isolada preparado em `docs/stage-07-indice-saques.md`, sem publicação ou escrita em produção. O emulador não valida existência de índices compostos.

- 2026-11-14: Home e extrato compartilham o leitor e o componente de movimentações; na conta oficial o usuário confirmou bancos, histórico e apresentação equivalente. Transferências com direção válida, saques verificáveis e referências explícitas aos últimos movimentos obrigatórios são identificados sem escrita. Uma página completa de saques exige período menor; saldos antigos seguem não conciliados. Ver [[Dashboard Home]].

- 2026-11-13: por autorização expressa do usuário, a homologação pessoal somente leitura mostra registros legados do UID autenticado mesmo quando os campos de grupo estão ausentes. Essa ausência não comprova que o registro seja pessoal; associações de grupo explícitas continuam excluídas. Não há alteração de saldo nem escrita em produção. Ver [[Fundação Firebase Spark]].

- 2026-11-13: a Home sinaliza, sem expor IDs ou consultar contas de terceiros, se uma autorização protegida verificada contém acesso compartilhado ou vínculos de grupo enquanto o perfil está no contexto pessoal. Uma autorização não verificável não concede acesso nem bloqueia a consulta pessoal. A leitura dos bancos compartilhados continua pendente; nenhuma alteração em produção foi realizada. Ver [[Fundação Firebase Spark]].

- 2026-11-13, SDK 58: dependências Expo alinhadas, referências nativas adaptadas à API TypeScript estrita e APIs removidas da barra de status substituídas pelo comportamento disponível na plataforma. O Expo Doctor e as verificações locais passaram; login sintético e Home no emulador foram exercitados em desktop e largura de celular. A sessão oficial do usuário não foi inspecionada nesta execução. A Home sinaliza origens bancárias incompletas e categorias sinalizam registros não verificados; documentos legados sem associação comprovável continuam protegidos. Nenhuma alteração de produção foi feita. Ver [[Versão Web]] e [[Fundação Firebase Spark]].

- 2026-11-13: homologação pessoal local com o projeto Firebase existente em modo de consulta. Escritas de perfil, cadastro Auth e operações financeiras são recusadas na camada de dados fora do projeto demo; login e logout continuam disponíveis. As Rules publicadas ainda não permitem as coleções financeiras novas; apenas origens legadas com associação comprovável podem aparecer. Saldos antigos não são presumidos. Sem deploy, migração ou escrita real. Ver [[Fundação Firebase Spark]].

- 2026-11-12, continuação da etapa 06: o extrato combina páginas de movimentos novos e legados autorizados, sem gravar ou recalcular saldos históricos. As Rules locais exigem contexto pessoal explícito ou participação atual no caminho protegido do grupo. Ações de bancos foram reconectadas ao acordeão original de Configurações e o painel adicional saiu do extrato. Sem prova de completude, contas antigas seguem sem saldo calculado e bloqueadas para novas operações. Não houve deploy nem migração. Ver [[Transações de Receitas]], [[Transações de Despesas]] e [[Gerenciamento de Bancos]].

- 2026-11-12, etapa 06 em andamento: lançamentos bancários `posted`/cancelados no emulador, centavos e saldo da conta atualizados em transação e verificados pelas Rules. Formulários e extrato existentes conectados, sem deploy. Dados antigos não são migrados nem aplicados automaticamente ao saldo; a leitura pontual pessoal legada existe, mas o extrato legado e a conciliação ainda não estão integrados. Datas futuras, dinheiro físico e módulos posteriores permanecem indisponíveis. Ver [[Transações de Receitas]], [[Transações de Despesas]] e [[Gerenciamento de Bancos]].

- 2026-11-11, etapa 05: simplificação das categorias no emulador, sem reservas de nomes nem preparação administrativa para novos cadastros; permissões de contexto e dados históricos permanecem protegidos. Sem deploy ou alteração de dados reais. Ver [[Gerenciamento de Tags]].

- 2026-11-10, etapa 05 em andamento: categorias integradas aos componentes originais no emulador, com preservação de IDs e arquivamento. A candidata permanece sem publicação e não está homologada para produção: há limitações de autoridade e concorrência em tags legadas de grupo. Ver [[Gerenciamento de Tags]].

- 2026-11-10: início da etapa 05. O painel adicional de contas foi removido da Home, preservando o carrossel existente. Rotas de módulos ainda não reconstruídos permanecem bloqueadas, independentemente da preferência local; categorias ainda não foram reconstruídas. Ver [[Visibilidade de Rotas]] e [[Gerenciamento de Tags]].

- 2026-11-08: remoção local integral da arquitetura anterior e desacoplamento do frontend. Recuperação em `recovery/backend-removal-20261108` (`594f2d2`) e bundle independente. Todas as telas/rotas preservadas. Sem novo backend, deploy ou alteração remota. Resultados e limites: [[Remoção do Backend]].
- 2026-11-08, etapa 02: fundação Firebase Spark local implementada. Recuperação anterior em `recovery/firebase-foundation-20261108` (`ea9e261`). Produção inspecionada somente leitura: faturamento desativado, Standard gratuito, Rules permissivas críticas ainda publicadas. Cliente restrito ao emulador; sem migração/deploy. Escopo, evidências e limites em [[Fundação Firebase Spark]].

- 2026-11-08, etapa 03: Rules restritivas, claims/autorização protegida, sessão/erros de contexto e exportação AES-GCM/restauração isolada implementados. Recuperação de código em `recovery/security-stage03-20261108` (`e86a55f`). Matriz com Web publicada, testes de ataques e reinício do navegador; nenhuma mudança em produção. Compatibilidade mobile instalada e backup real permanecem pendentes. Ver [[Segurança e Preparação para Produção]].

- 2026-11-09: publicação autorizada somente de `firestore.rules`, SHA-256 `8673e2d0d47641cf787484013a418b642442595994bdcbcbb0e9091c5f6179c8`, verificada no ruleset `16a9d21b-64c9-4815-87c0-5e66b6b8b930`. Cópia real Firestore autorizada separadamente: 987 documentos restaurados com igualdade integral; dois perfis interpretados e dois acessos cruzados negados no emulador. Zero alterações de documentos/contas/Hosting/faturamento. Suspensão dos fluxos financeiros antigos aceita; monitoramento adicional somente leitura agendado. Contas Auth, aparelhos e login produtivo continuam fora das provas concluídas.

- 2026-11-09, finalização da etapa 03: observação de 61 amostras/3.608 segundos monotônicos, métricas históricas analisadas, oito cenários Web reais homologados; 987 documentos restaurados novamente a partir do destino aprovado e três contas Auth exportadas cifradas com parâmetros disponíveis. Recuperação integrada sintética Auth+Firestore+UI passou. Chave co-localizada por decisão expressa do proprietário; sem independência física. Android real identificado, Expo Go 58 incompatível com SDK57 e instalação regressiva recusada; homologação física depende de ambiente compatível. Ver [[Homologação e Recuperação da Etapa 03]].

- 2026-11-09, Android físico: Expo Go58 substituído por57.0.9 com autorização específica. Oito cenários de homologação assistida verificados em SM_S926B: perfil/UID, sessão após reinício, offline/reconexão, logout e link privado após reinício. Login/menu/logout manuais; demais estados e persistência conferidos por ADB. Uma linha em InputField corrige encaminhamento dos rótulos, sem mudança visual. Navegação original mantida, sem publicação ou escrita financeira. Limites e recibos em [[Homologação e Recuperação da Etapa 03]].

- 2026-11-09, etapa04: Bancos e Saldo Inicial implementados no projeto demo, com par conta/abertura atômico e imutável, centavos inteiros, idempotência persistida, edição com revisão e arquivamento de saldo zero. Legados preservados, saldo histórico em conciliação. Regras locais novas; produção permanece naEtapa03. Recuperação de código: `recovery/banks-opening-stage04-20261109` (`6cdf312`). Ver [[Gerenciamento de Bancos]] e `docs/stage-04-report.md` para evidências e limites.
