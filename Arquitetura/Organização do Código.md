---
tags: [frontend, arquitetura]
relacionado: [[MOC - Lumus Finanças]], [[Remoção do Backend]]
status: ativo
tipo: arquitetura
versao: 3.0.0
---

# Organização do Código

`app/` mantém entradas finas do Expo Router; `screens/mobile` e `screens/web` mantêm todas as composições. `components/ui` contém primitivas Gluestack; `components/uiverse` mantém os componentes de domínio e adaptadores de plataforma.

`design-system/` continua sendo a fonte de tokens, classes, adaptadores e exceções visuais. `contexts/` contém preferências, uma sessão Auth compartilhada e páginas de contas compartilhadas. `hooks/` contém comportamento de interface e estados explícitos de indisponibilidade. `types/presentation/` contém modelos usados pela apresentação, sem SDK ou comandos de persistência. `utils/` mantém máscaras, calendário de interface, navegação e templates visuais.

Os diretórios `backend`, `functions`, `services` e `repositories` foram eliminados. A fundação independente usa `application/` (conta/erros/intenção idempotente de bancos), `domain/` (perfil, autorização, bancos e dinheiro sem SDK) e `firebase/` (configuração/persistência/diagnóstico). Não há fachada sobre os protocolos antigos. `security/containment.rules` é a reversão restrita. `firebase.production.json` publica somente Rules, sem executar deploy; `production-readiness.json` registra o hash produtivo verificado, exigido pelo modo de produção explícito. Ferramentas de recuperação e inspeção ficam em `script/`; o wrapper operacional Linux usa cgroup/rede isolada/guard C apenas para cópia real, sem dependência no aplicativo. provas sintéticas e metadados sem PII em `artifacts/security-stage03/`. Ver [[Segurança e Preparação para Produção]], [[Fundação Firebase Spark]] e [[Remoção do Backend]].

Etapa04: `firebase/banks.ts` concentra consultas/transações; `hooks/useBankAccountForm.ts` e `useBankAccountDetails.ts` coordenam a UI existente. `components/uiverse/banks/bank-*.tsx` usam tokens/primitivas, sem persistência direta. Testes e artefatos sintéticos em `tests/{browser,integration}/banks.*` e `artifacts/banks-stage04/`. Ver [[Gerenciamento de Bancos]].
