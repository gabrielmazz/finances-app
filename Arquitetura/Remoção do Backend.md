---
tags: [frontend, arquitetura, remocao]
relacionado: [[MOC - Lumus Finanças]], [[Organização do Código]], [[Navegação]], [[Auditoria de Design]]
status: ativo
tipo: decisão
versao: 3.0.0
---

# Remoção do Backend

Em 08/11/2026, o backend anterior foi encerrado no código local. A base restante é o frontend Expo/React Native, sem escolher ou iniciar o próximo backend. Nenhum recurso remoto foi alterado.

## Investigação e recuperação

O Git estava limpo no commit `594f2d2e54a97907dbd291b760434b81e6e23d24`, com 1.334 arquivos rastreados. A investigação classificou implementações exclusivas, componentes mistos, dependências de inicialização, modelos de apresentação, scripts, testes, configurações e documentação antes da remoção.

Foi criada a tag `recovery/backend-removal-20261108`. Uma cópia independente está em `/programacao/finances-app-recovery-20261108`, fora do projeto:

- `repository.bundle`: histórico Git completo, verificado com `git bundle verify`.
- `local-state.tar.gz`: configurações locais e projeto Android gerado anteriores, incluindo arquivos ignorados necessários à recuperação.
- `inventory-before.json`: inventário e classificação anteriores.
- `removed-screen-operations.json`: registro das operações retiradas de componentes mistos.
- `previous-expo/`: estado gerado, logs e artefatos locais anteriores preservados, sem deixar bundles antigos no código ativo.
- `environment.toml`: configuração anterior das ações locais de desenvolvimento.

A pasta de recuperação tem acesso restrito. Não copiar suas credenciais para o repositório. Para consultar o estado anterior sem sobrescrever o trabalho atual:

```bash
git worktree add ../lumus-backend-anterior recovery/backend-removal-20261108
```

O inventário exato de arquivos removidos e telas/rotas preservadas está em [docs/backend-removal-manifest.json](../docs/backend-removal-manifest.json).

## Componentes eliminados

| Área | Remoção local |
| --- | --- |
| Backend e regras financeiras | `backend/` inteiro, funções confiáveis, persistência, razão, agregações, migração, seed, reconciliação e ferramentas administrativas |
| Cliente de dados | `functions/` inteiro, leituras/escritas legadas e Spark, saldos, contas, transações, recorrências, categorias, investimentos, grupos e recuperação |
| Serviços e repositórios | `services/` e `repositories/`, incluindo gateway de IA, prompts, parsers, autorização, executores, relatórios de domínio e implementação em memória |
| Inicialização e identidade | `FirebaseConfig*`, providers antigos de autenticação/cache/assistente, armazenamento de sessão, App Check e integração nativa |
| Infraestrutura | Configurações Firebase, Rules, índices, Remote Config, seleção de projeto, vínculo Google Services e variáveis de ambiente antigas |
| Processos auxiliares | Scripts de emuladores, deploy, release, migração, teste de Rules, recuperação e sincronização; testes e documentos exclusivos da implementação encerrada |
| Notificações | Registro de aparelho, push, canais, permissões, agendamento, reconciliação e pontes entre conta e lembretes |

As regras financeiras não foram movidas para um novo backend nem escondidas sob um repositório substituto. Utilitários restantes servem à apresentação: máscaras, datas de campos, seleção, paginação, navegação e templates visuais. Não há cálculo de posição, projeção de carteira, transação, quitação ou sincronização executável.

## Dependências removidas

`firebase`, `@react-native-firebase/ai`, `@react-native-firebase/app`, `@react-native-firebase/app-check`, `@react-native-firebase/auth`, `@react-native-firebase/remote-config`, `@tanstack/react-query`, `@tanstack/react-query-persist-client`, `superjson`, `zod`, `expo-secure-store` e `expo-notifications`. O lockfile foi atualizado e uma instalação limpa confirmou a remoção do grafo antigo. Nenhuma dependência de backend substituta foi adicionada.

## Frontend preservado

Permanecem os **51 arquivos de tela e as 82 entradas de rota** inventariados. Os testes comparam os caminhos com o inventário anterior. Permanecem também os componentes visuais, assets, formulários, tabelas, gráficos, editor, menus, estilos, identidade, fontes, ícones, animações e variantes Web/mobile.

A composição global agora monta somente fontes, tema, primitivas, alertas, preferências visuais e navegação. O login mantém seus formulários e oferece **Explorar telas**, sem criar usuário fictício ou sessão. “Sair” retorna ao login visual.

Hooks de leitura fornecem ausência de dados, carregamento encerrado e mensagem explícita. Modelos em `types/presentation/` contêm somente formas usadas pela interface. Ações indisponíveis informam a limitação; não retornam confirmação financeira. Tema, máscara de valores, visibilidade de telas e preferências de retorno continuam locais. O tema escuro também foi alternado pela interface, persistido e restaurado após navegação no navegador. A visibilidade usa um namespace novo, preservando as preferências anteriores.

O chat permanece visível com envio desativado e sem consentimento fictício. O editor de anotações abre um rascunho apenas em memória; tentar salvar mantém título/texto e explica a indisponibilidade. Extratos impedem exportar PDF sem dados, inclusive ao receber parâmetros por deep link. Os antigos avisos exclusivos de ativação/recuperação foram retirados.

## Validação

| Verificação | Resultado |
| --- | --- |
| Estado anterior | Git limpo; tag e bundle independente criados antes da remoção; bundle íntegro |
| Instalação | `npm ci` passou; os três patches visuais/compatibilidade foram aplicados |
| Gate do frontend | `npm run check`: estilos, TypeScript strict e 16 suítes / 87 testes aprovados |
| Integridade arquitetural | Teste impede imports dos SDKs/serviços removidos e confere ausência dos diretórios e configurações antigos |
| Rotas e telas | Inventário anterior preservado; registro central e adaptadores Web/mobile conferidos |
| Exportação | Bundles Web, Android e iOS aprovados |
| Inicialização local | Metro iniciado offline na porta 8087, resposta HTTP 200; servidor estático local na porta 4173 |
| Navegador | Chromium: 25 destinos em 1440 px e os mesmos 25 em 390 px; sem erros de JavaScript/console, requisições externas ou overflow horizontal |
| Interações | Explorar telas; PDF bloqueado sem dados; chat visível com envio desativado; edição, tentativa de salvar e reabertura de rascunho sem escrita em localStorage |
| Revisão independente | Standards e Spec revisados separadamente; achados concretos corrigidos e revalidados |

Evidência navegável: [browser-validation.json](../artifacts/frontend-removal/browser-validation.json) e capturas em `artifacts/frontend-removal/`. A revisão por eixo está em [docs/review-backend-removal.md](../docs/review-backend-removal.md). A verificação usa dados locais de interface, sem consultar o backend anterior ou inserir registros fictícios.

A revisão corrigiu erro de indisponibilidade apagado no mount de anotações, estado ocupado permanente no cadastro de investimento, bloqueio visual do chat/editor, exportação indevida de resumo vazio e dois estilos de sparklines que não pertenciam ao backend. O contrato visual do assistente continua suficiente para suas telas, sem implementar gateways ou executores.

## Funcionalidades temporariamente indisponíveis

Login real, criação/recuperação de conta, perfis/vínculos, consultas e persistência financeira, bancos e categorias, saldos, despesas/receitas, transferências/saques, recorrências/parcelas, investimentos, indicadores/previsões, relatórios com dados, comandos/voz do assistente, notificações e gravação de anotações. Rascunhos e controles visuais não equivalem a operações concluídas.

## Recursos externos preservados

As configurações anteriores identificavam o projeto Firebase `finances-app-e8685`, Authentication, Firestore, Hosting, AI Logic, App Check e Remote Config, além do projeto EAS do frontend. São identificações históricas locais, não uma auditoria do estado remoto atual. Não houve consulta operacional, deploy, exclusão de projeto/conta/documento, revogação de credenciais externas ou alteração de dados na nuvem. O aplicativo anteriormente publicado permanece fora do escopo desta mudança local.

Dados antigos existentes no armazenamento do dispositivo também não foram lidos, migrados ou apagados. Os arquivos locais de configuração foram arquivados; isso não revogou credenciais externas.

## Limitações e estado final

Os exports nativos validam o grafo JavaScript e os assets, mas **não substituem build Gradle/Xcode nem execução instalada**. Não havia Android SDK/ADB ou ambiente iOS instalado para validar hardware, teclado nativo, WebView, compartilhamento ou instalação. Também não há validação de fluxos com dados reais porque suas implementações foram removidas por decisão de escopo.

O projeto está organizado como uma base visual independente e inicializável. A reconstrução deverá definir requisitos e contratos por funcionalidade antes de escolher tecnologias. Não há backend novo ou parcial nesta entrega, nem pendência de deploy encoberta como validação local.
