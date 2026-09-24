---
tags: [dashboard, mobile, design-system, exemplo, auditoria]
relacionado: [[Dashboard Home]], [[Componentes UI]], [[Auditoria de Design]], [[Sistema de Temas]]
status: ativo
tipo: componente
versao: 1.0.0
---

# Exemplo Home Mobile

Inventário de padrões da `screens/mobile/HomeScreen.tsx` para revisão tela a tela no Android/iOS. Esta Home usa Gluestack, NativeWind, carrossel nativo, gráfico `react-native-gifted-charts`, popovers e modal; não usa `@expo/ui` nem um módulo Expo local.

## Elementos e entradas encontrados

| Elemento | Uso atual | Contrato para próximas revisões |
|---|---|---|
| Hero e área rolável | `SafeAreaView`, `ScrollView`, wallpaper e sheet | Respeitar safe area e tamanho de texto; manter o conteúdo alcançável. |
| Bancos e dinheiro | `BankCardSurface` dentro de `TouchableOpacity` e carrossel | Nome acessível que indique o banco, alvo confortável e feedback no toque. |
| Investimentos | gráfico de pizza e alvo `Pressable` sobreposto | Informar a ação do gráfico ao leitor de tela; preservar seleção de fatia e privacidade. |
| Últimas movimentações | cabeçalho e linhas expansíveis | Anunciar ação e estado expandido; permitir abrir e fechar imediatamente. |
| Ajuda contextual | `Popover` com gatilho `Pressable` | Nome específico da seção e alvo mínimo de 44 px. |
| Atualização | `RefreshControl` | Preservar feedback de carregamento e dados existentes durante recarga. |
| Saldo mensal pendente | `Modal` com dois `Button` | Ação e saída claras; foco e retorno previsíveis. |

**Inputs de formulário:** nenhum nesta tela. Os controles são gestos, botões, carrossel, gráfico e modal. O padrão de campo de texto, foco, inválido, desabilitado e helper deve vir de [[Componentes UI]] e dos contratos de formulário do design system, não de um exemplo fictício na Home.

## Estados a conferir

`overview`, `movements` e `investments` carregam e falham de forma independente. Conferir skeleton, vazio, erro, dados extensos, valores ocultos, tema claro/escuro, fonte ampliada e painel expandido. Os ícones de ajuda e controles de expansão receberam nomes e estados acessíveis específicos nesta revisão.

## Pendências observadas

- Os gatilhos de ajuda são apenas um ícone de 14 px com `hitSlop={8}`; a área total pode ficar abaixo de 44 px. Corrigir na extração de um gatilho reutilizável para evitar deslocar os títulos isoladamente.
- O cabeçalho expansível de movimentos contém um gatilho de popover dentro de um `TouchableOpacity`; conferir navegação por leitor de tela e separar os alvos numa revisão de interação.
- Cores e medidas visuais da timeline e do gráfico ainda aparecem como valores locais/`style`; migrar por camada compartilhada quando esses componentes forem padronizados, mantendo gradientes e medidas de biblioteca em adaptadores registrados.

## Arquivos principais

- `screens/mobile/HomeScreen.tsx` — composição e entradas nativas.
- `components/uiverse/banks/bank-card-surface.tsx` — superfície bancária compartilhada.
- `hooks/useHomeScreenData.ts` — dados setorizados da Home.

## Integrações

[[Dashboard Home]] e [[Privacidade de Valores]] determinam conteúdo, saldo e máscara; [[Sistema de Temas]] determina a apresentação.

## Configuração

Usar a combinação Expo 57, NativeWind 4 e Tailwind 3 já instalada. Mudanças desta revisão não exigem development client ou módulo Expo novo.

## Observações importantes

A auditoria é estática. Confirmar a leitura, o tamanho dos alvos e os gestos em aparelho Android/iOS antes de declarar a interação visual concluída.
