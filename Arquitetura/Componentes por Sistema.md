---
tags: [componentes, arquitetura, dominios, web, expo]
relacionado: [[Componentes UI]], [[Organização do Código]], [[Versão Web]], [[Navegação]], [[Dashboard Home]], [[Despesas Fixas]], [[Investimentos]], [[Assistente Lumus]]
status: ativo
tipo: arquitetura
versao: 1.2.0
---

# Componentes por Sistema

Os componentes customizados do Lumus Finanças são organizados por sistema funcional em `components/uiverse/`, com implementações de plataforma fisicamente separadas em `components/web/` e `components/mobile/`. A separação reduz imports ambíguos, mantém a fronteira entre primitives e domínio e permite localizar rapidamente o componente usado por cada tela. Os caminhos em `components/uiverse/` continuam sendo os adaptadores lógicos que preservam a resolução automática do Expo.

## Mapa de pastas

| Sistema | Pasta | Telas que consomem | Regra de plataforma |
|---|---|---|---|
| Navegação | `components/uiverse/navigation/` | todas as telas autenticadas | `navigator` e os componentes de shell/hero usam resolução automática; o shell Web e a transição DOM não entram na árvore nativa |
| Compartilhado | `components/uiverse/shared/` | bootstrap e formulários | `date-picker`, `loader` e dismiss de teclado têm arquivos Web e nativos independentes, sem compartilhar handlers de foco ou animação |
| Feedback | `components/uiverse/feedback/` | todas as telas com feedback | o par nativo/Web do notifier mantém uma API única; não criar outro toast |
| Bancos | `components/uiverse/banks/` | Home, movimentos, registros, transferências e resgate | selector e card têm pares Web/nativo com os mesmos tipos e callbacks; cada superfície pode evoluir sem importar a outra |
| Categorias | `components/uiverse/categories/` | registros, análise e configurações | disponibilidade e seleção têm pares Web/nativo e preservam a mesma ordenação, seleção e ação de criação |
| Recorrências | `components/uiverse/recurring/` | despesas/receitas fixas | `date-calendar` tem pares Web/nativo; calendário de ciclos, horários e progresso preservam `YYYY-MM`, HH:MM e a indisponibilidade de agendamento no Web |
| Dashboard | `components/uiverse/dashboard/` | Home | gráficos Web continuam Expo DOM e recebem somente props serializáveis |
| Relatórios | `components/uiverse/reports/` | previsão de fluxo de caixa | o gráfico permanece Expo DOM; a tela continua responsável por dados e privacidade |
| Investimentos | `components/uiverse/investments/` | evolução da carteira | Mantine permanece isolado no componente DOM Web |
| Anotações | `components/uiverse/annotations/` | anotações locais | o editor continua DOM e devolve Markdown pela ponte existente |
| Assistente | `components/uiverse/assistant/` | rota do Lumus IA | cards e boundary têm pares Web/nativo; os cards Web usam gráficos Mantine e os nativos usam `react-native-gifted-charts`, sem alterar confirmação ou escrita |

## Infraestrutura Web

As implementações específicas ficam organizadas por plataforma:

- `components/web/motion/` — animações DOM de entrada/saída;
- `components/web/navigation/` — navigator, shell, transição, hero e menu Web desktop;
- `components/web/visuals/` — carrossel, gradiente, aurora e texto SVG;
- `components/web/{banks,categories,feedback,recurring,shared,assistant}/` — seletores, calendário, feedback, inputs e cards Web;
- `components/mobile/{banks,categories,feedback,navigation,recurring,shared,assistant}/` — equivalentes Android/iOS dos componentes que possuem divergência de plataforma.

Esses componentes não recebem acesso a Firebase. Quando usados por uma tela, recebem apenas props serializáveis; CSS, APIs DOM e interações nativas permanecem no próprio módulo da plataforma.

## Regras de manutenção

- Primitives Gluestack ficam em `components/ui/` e não recebem componentes de domínio.
- Uma resolução `.web.tsx` ou `.native.tsx` mantém um adaptador em `components/uiverse/<sistema>/`, enquanto a implementação real fica em `components/web/<sistema>/` ou `components/mobile/<sistema>/`. O arquivo base mantém o fallback mobile e reexporta o adaptador nativo para TypeScript/Jest.
- As telas importam o caminho lógico sem extensão (`@/components/uiverse/.../date-picker`); não importar diretamente `.web` ou `.native`, pois isso bypassa a resolução do Expo.
- As variantes preservam os tipos públicos, callbacks, máscaras de privacidade, formatos de data/horário, estados de seleção e ações de confirmação. A diferença de plataforma fica restrita à apresentação e às APIs de interação; não duplicar regra Firebase ou cálculo financeiro.
- Componentes com `'use dom'` são uma exceção deliberada: gráficos e o editor de anotações continuam no Expo DOM, recebendo apenas props serializáveis e usando WebView no mobile conforme [[Anotações Locais]] e [[Versão Web]].
- Rotas continuam em `app/` e telas ficam em `screens/mobile/` ou `screens/web/`; esta organização não cria um segundo registro de rotas nem altera a persistência.
- Imports devem apontar diretamente para o arquivo do sistema, sem barrel global, para preservar tree-shaking e reduzir dependências implícitas.
- Ao criar um componente, atualize esta tabela, [[Componentes UI]] e o módulo do vault da tela que o consome.

## Arquivos principais

- `components/uiverse/` — Componentes customizados separados por sistema
- `components/web/` — Implementações Web, separadas por sistema funcional
- `components/mobile/` — Implementações Android/iOS dos componentes com divergência de plataforma
- `Arquitetura/Componentes UI.md` — Design system e contratos dos componentes
- `Arquitetura/Organização do Código.md` — Fronteiras entre rotas, telas e componentes
