---
tags: [frontend, arquitetura]
relacionado: [[MOC - Lumus Finanças]], [[Remoção do Backend]]
status: ativo
tipo: arquitetura
versao: 3.0.0
---

# Componentes UI

Primitivas Gluestack e componentes visuais Web/mobile foram preservados, incluindo formulários, gráficos Expo DOM, tabelas, diálogos, calendário, editor e navegação.

A combinação permanece NativeWind 4.2.1, Tailwind 3.4.18 e Gluestack 3.0.12. Não houve migração visual, introdução de Expo UI ou substituição dos controles existentes.

Classes e tokens pertencem a `design-system/`; exceções de APIs externas ficam em `style-exceptions.json`. Manter foco, labels, alvos de toque, estados de erro e responsividade. Avisos exclusivos de recuperação/ativação do backend removido foram eliminados. Componentes de formulário dependentes de dados mostram indisponibilidade. Ver [[Auditoria de Design]].
