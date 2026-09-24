---
tags: [dashboard, web, design-system, exemplo]
relacionado: [[Dashboard Home]], [[Componentes UI]], [[Auditoria de Design]], [[Versão Web]]
status: ativo
tipo: componente
versao: 1.0.0
---

# Exemplo Home Web

Referência para revisar a Home e comparar futuras telas Web. A área útil de cada seção acompanha a largura de `scrollContent`; espaçamento vertical pertence ao próprio bloco e não cria recuo horizontal diferente entre seções.

## Contratos encontrados

| Elemento | Referência | Padrão a repetir |
|---|---|---|
| Área de conteúdo | `WEB_DASHBOARD_CLASS_NAMES.scrollContent` | Mesma largura e alinhamento para bancos, gráficos, compromissos e timeline. |
| Título de seção | `sectionHeading` e `sectionHeadingText` | `text-lg font-bold uppercase tracking-widest`; ícone de ajuda junto ao título. |
| Gastos por dia | `expenseChartSection` | Largura total, sem recuo horizontal ou moldura externa; gráfico ocupa a área disponível. |
| Atividade no ano | `activityHeatmapSection` | Mesmo alinhamento; texto auxiliar e heatmap permanecem dentro da seção. |
| Próximos compromissos | `mandatorySection` | Mesmo alinhamento; as duas colunas e seus cards internos se adaptam ao layout compacto. |
| Valores | `formatCurrency` e `useValueVisibility` | Centavos até a exibição; máscara aplicada também aos gráficos. |
| Ajuda | `InfoTip` | Nome acessível específico da seção, foco e acionamento por teclado. |

## Entradas e estados

Esta tela não possui input de texto. As entradas são clique/toque nos cartões bancários, fatias de investimento, ícones de ajuda, expansão dos movimentos, atualização manual e ações do modal de saldo pendente. Revisar cada entrada em foco, hover/pressionado e teclado; revisar cada seção em carregamento, vazio, erro e conteúdo longo. Não criar um padrão de campo de formulário a partir desta tela: campos ficam em [[Componentes UI]] e nos contratos `design-system/web-forms.ts`.

## Arquivos principais

- `screens/web/HomeScreen.web.tsx` — composição da Home.
- `design-system/web-dashboard.ts` — classes e dimensões dos gráficos Expo DOM.
- `components/uiverse/dashboard/` — gráficos e heatmap.

## Integrações

[[Dashboard Home]] define dados e regras financeiras; [[Sistema de Temas]] define cores semânticas e adaptação claro/escuro.

## Configuração

Usar NativeWind 4 e Tailwind 3 já instalados. As medidas exigidas por Expo DOM ficam em `WEB_DASHBOARD_DOM_STYLES`.

## Observações importantes

O alinhamento horizontal foi padronizado sem recolocar a moldura externa removida em 2026-09-19. Validar visualmente em viewport estreita e larga quando houver navegador autenticado.
