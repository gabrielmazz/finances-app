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

Na homologação Android SDK57 foi observado que o core Gluestack aplica `aria-label="Input Field"` mesmo quando o consumidor fornece `accessibilityLabel`. `InputField` agora encaminha `aria-label` explícito, com fallback para `accessibilityLabel`; preserva rótulos específicos e prioridade explícita, sem alterar classes, estilos ou layout. A exceção de edição da primitiva é motivada por esse defeito reproduzido no aparelho. Tipos/estilos/testes e rótulos dos campos reais foram verificados; ver [[Homologação e Recuperação da Etapa 03]].
