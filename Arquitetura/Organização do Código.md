---
tags: [frontend, arquitetura]
relacionado: [[MOC - Lumus Finanças]], [[Remoção do Backend]]
status: ativo
tipo: arquitetura
versao: 3.0.0
---

# Organização do Código

`app/` mantém entradas finas do Expo Router; `screens/mobile` e `screens/web` mantêm todas as composições. `components/ui` contém primitivas Gluestack; `components/uiverse` mantém os componentes de domínio e adaptadores de plataforma.

`design-system/` continua sendo a fonte de tokens, classes, adaptadores e exceções visuais. `contexts/` contém apenas preferências visuais locais. `hooks/` contém comportamento de interface e estados explícitos de indisponibilidade. `types/presentation/` contém modelos usados pela apresentação, sem SDK ou comandos de persistência. `utils/` mantém máscaras, calendário de interface, navegação e templates visuais.

Os diretórios `backend`, `functions`, `services` e `repositories` foram eliminados. Não criar uma fachada sobre a arquitetura removida. A nova integração será definida depois, por funcionalidade. Ver [[Remoção do Backend]].
