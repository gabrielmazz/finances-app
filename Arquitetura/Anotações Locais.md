---
tags: [anotacoes, local, async-storage, markdown, organizacao]
relacionado: [[Navegação]], [[Autenticação]], [[Sistema de Temas]], [[Componentes UI]]
status: ativo
tipo: feature
versao: 1.3.2
---

# Anotações Locais

Espaço pessoal para textos livres, listas e checklists. As páginas pertencem à conta autenticada neste aparelho e não criam documentos no Firestore.

## Como funciona

1. O item **Anotações** do grupo Home no `navigator.tsx` abre a rota `/annotations`. Em **Configurações das telas**, o switch **Em desenvolvimento** começa ativado e mantém a página oculta do menu e bloqueada para acesso direto. Ao desligá-lo, a tela é liberada para testes neste aparelho e um modal informa que ela ainda não está pronta.
2. A tela mostra as páginas locais ordenadas pela última edição; tocar em uma página abre o editor em tela cheia, sem uma nova rota para cada anotação ou a navegação inferior.
3. **Nova anotação** cria uma página local vazia. O título e o conteúdo são salvos explicitamente pelo botão **Salvar**, e voltar à lista também salva antes de fechar o editor.
4. Os dados ficam em `AsyncStorage` na chave versionada `@lumus/local-annotations/v1/{uid}`. Cada UID possui seu próprio conjunto de páginas, sem sincronização entre aparelhos e sem leitura/escrita no Firebase.
5. O editor visual usa um `contenteditable` isolado em Expo DOM. A barra horizontal formata o trecho selecionado ou a linha atual com H1/H2/H3, negrito, itálico, sublinhado, tópicos e checklist; a pessoa vê o título maior, o texto enfatizado e as listas prontas, sem os marcadores `#`, `**` ou `- [ ]` na área de escrita.
6. A cada edição, o componente converte a estrutura visual para Markdown antes de devolver o valor à tela. O armazenamento permanece em texto Markdown: sublinhado usa `<u>texto</u>` e checklist usa `- [ ] tarefa` ou `- [x] tarefa`.
7. A listagem usa o mesmo cabeçalho amarelo das telas principais: título branco, ilustração central e conteúdo em uma superfície arredondada sobreposta. Ao editar, o painel ocupa a tela toda e preserva o tema por `useScreenStyles()`.

## Arquivos principais

- `app/annotations.tsx` — rota protegida
- `screens/LocalAnnotationsScreen.tsx` — lista e editor no mesmo fluxo de tela
- `components/uiverse/annotation-markdown-editor.tsx` — componente Expo DOM do editor visual com toolbar e conversão de volta para Markdown
- `utils/annotationRichText.ts` — conversão segura de Markdown armazenado para a estrutura HTML visual inicial
- `utils/localAnnotations.ts` — persistência versionada e helpers de prévia
- `types/localAnnotations.ts` — tipo de página local

## Integrações

- [[Autenticação]] — o UID da sessão compõe a chave local e isola as páginas entre contas
- [[Navegação]] — destino do menu Home, registrado em `APP_ROUTE_PATHS` e protegido pela [[Visibilidade de Rotas]]
- [[Sistema de Temas]] — `useScreenStyles()` fornece a superfície adaptativa da tela
- [[Componentes UI]] — lista, botões e campos reutilizam os primitivos Gluestack; o editor visual fica isolado em `uiverse` como Expo DOM Component

## Configuração

- O editor usa a fronteira Expo DOM e o `react-native-webview` já presentes para os gráficos do app; não adiciona pacote nem plugin. A rota continua no baseline Expo SDK 54 e deve ser verificada em Expo Go e nos builds já compatíveis com o WebView atual.
- Não reintroduzir `react-native-enriched-markdown`, Tiptap ou outra dependência de editor rico: a conversão visual atual mantém o conteúdo portátil em Markdown sem ampliar a superfície nativa do app.

## Observações importantes

- As anotações são somente locais: limpar dados do aplicativo, trocar de aparelho ou remover o app pode apagá-las.
- Não incluir Firebase, sincronização, compartilhamento ou anexos neste fluxo sem documentar e aprovar a mudança de escopo.
- O conteúdo permanece como Markdown em texto simples no `AsyncStorage`; a renderização rica acontece somente enquanto a página está aberta para edição.
