# Arquitetura.md — Lumus Finanças

Leia este guia antes de alterar o projeto. O vault `Arquitetura/` descreve a base atual; o histórico da arquitetura encerrada está no ponto de recuperação, fora do código ativo.

## Estado atual

Frontend Expo 57 / React Native 0.86 / React 19.2 / TypeScript 6. Fundação Firebase Spark reconstruída com SDK oficial: Auth, perfis, contexto de acesso e Rules locais testadas. Etapa 03 acrescenta autorização verificada, isolamento, exportação criptografada e recuperação isolada. Não há execução financeira, sincronização ou executor de chat. Ver [[Fundação Firebase Spark]] e [[Segurança e Preparação para Produção]].

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

`app/` delega a `screens/mobile` e `screens/web`. Componentes reutilizáveis ficam em `components/`; tokens e contratos visuais em `design-system/`. `application/` contém operações de conta/erros; `domain/` valida e interpreta perfis sem SDK; `firebase/` concentra persistência/configuração. `SessionContext` compartilha uma sessão e perfil, sem consultas por tela. Hooks mantêm interação e indisponibilidade dos módulos ainda não reconstruídos. Telas, componentes e `types/presentation/` não importam SDKs.

Os antigos diretórios `backend`, `functions`, `services` e `repositories` foram eliminados. Não recriar sua API sob uma nova fachada. Qualquer futuro serviço deve ser definido independentemente, em uma funcionalidade pequena, verificável e autorizada.

## Regras de preservação

- Manter todas as rotas, telas, variantes, assets e identidade visual.
- Manter NativeWind 4.2.1, Tailwind 3.4.18 e Gluestack 3.0.12.
- Usar tokens/classes de `design-system/`; não introduzir estilos visuais inline ou novas exceções sem necessidade de plataforma.
- Preservar acessibilidade, foco, labels e responsividade. Campos e rascunhos não podem ser apagados por uma falsa confirmação.
- Valores recebidos pelos modelos visuais continuam em centavos inteiros; máscaras de entrada e conversão de exibição não constituem cálculo de saldo ou transação.
- Preservar UIDs, documentos e campos legados. Inspeção remota somente leitura, sem copiar PII para o repositório. Testes/fixtures apenas em projeto demo dos emuladores.
- Ações remotas exigem autorização específica: a publicação de Rules de 09/11 foi autorizada e concluída. Nenhuma autorização para migrar, excluir ou alterar dados financeiros/contas/infraestrutura paga está implícita.

## Verificação e documentação

Executar `npm run lint:styles` em mudanças de UI, tipos e os testes pertinentes. `npm run check` reúne estilos, tipos e testes do frontend. Exportar Web e bundles nativos quando a mudança afetar inicialização/imports. Distinguir exportação de execução instalada.

Atualizar o documento do módulo e este Active Context quando comportamento/arquitetura mudar. Usar `[[wiki-links]]` e nomes de arquivo com espaços no vault. Preservar alterações do usuário e criar recuperação antes de remoções amplas.

## Active Context

- 2026-11-08: remoção local integral da arquitetura anterior e desacoplamento do frontend. Recuperação em `recovery/backend-removal-20261108` (`594f2d2`) e bundle independente. Todas as telas/rotas preservadas. Sem novo backend, deploy ou alteração remota. Resultados e limites: [[Remoção do Backend]].
- 2026-11-08, etapa 02: fundação Firebase Spark local implementada. Recuperação anterior em `recovery/firebase-foundation-20261108` (`ea9e261`). Produção inspecionada somente leitura: faturamento desativado, Standard gratuito, Rules permissivas críticas ainda publicadas. Cliente restrito ao emulador; sem migração/deploy. Escopo, evidências e limites em [[Fundação Firebase Spark]].

- 2026-11-08, etapa 03: Rules restritivas, claims/autorização protegida, sessão/erros de contexto e exportação AES-GCM/restauração isolada implementados. Recuperação de código em `recovery/security-stage03-20261108` (`e86a55f`). Matriz com Web publicada, testes de ataques e reinício do navegador; nenhuma mudança em produção. Compatibilidade mobile instalada e backup real permanecem pendentes. Ver [[Segurança e Preparação para Produção]].

- 2026-11-09: publicação autorizada somente de `firestore.rules`, SHA-256 `8673e2d0d47641cf787484013a418b642442595994bdcbcbb0e9091c5f6179c8`, verificada no ruleset `16a9d21b-64c9-4815-87c0-5e66b6b8b930`. Cópia real Firestore autorizada separadamente: 987 documentos restaurados com igualdade integral; dois perfis interpretados e dois acessos cruzados negados no emulador. Zero alterações de documentos/contas/Hosting/faturamento. Suspensão dos fluxos financeiros antigos aceita; monitoramento adicional somente leitura agendado. Contas Auth, aparelhos e login produtivo continuam fora das provas concluídas.

- 2026-11-09, finalização da etapa 03: observação de 61 amostras/3.608 segundos monotônicos, métricas históricas analisadas, oito cenários Web reais homologados; 987 documentos restaurados novamente a partir do destino aprovado e três contas Auth exportadas cifradas com parâmetros disponíveis. Recuperação integrada sintética Auth+Firestore+UI passou. Chave co-localizada por decisão expressa do proprietário; sem independência física. Android real identificado, Expo Go 58 incompatível com SDK57 e instalação regressiva recusada; homologação física depende de ambiente compatível. Ver [[Homologação e Recuperação da Etapa 03]].

- 2026-11-09, Android físico: Expo Go58 substituído por57.0.9 com autorização específica. Oito cenários de homologação assistida verificados em SM_S926B: perfil/UID, sessão após reinício, offline/reconexão, logout e link privado após reinício. Login/menu/logout manuais; demais estados e persistência conferidos por ADB. Uma linha em InputField corrige encaminhamento dos rótulos, sem mudança visual. Navegação original mantida, sem publicação ou escrita financeira. Limites e recibos em [[Homologação e Recuperação da Etapa 03]].
