---
tags: [anotacoes, local, async-storage, markdown, organizacao]
relacionado: [[Navegação]], [[Autenticação]], [[Sistema de Temas]], [[Componentes UI]]
status: ativo
tipo: feature
versao: 1.4.0
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

- `app/mobile/annotations.tsx` — rota protegida
- `screens/mobile/LocalAnnotationsScreen.tsx` — lista e editor no mesmo fluxo de tela
- `components/uiverse/annotations/annotation-markdown-editor.tsx` — componente Expo DOM do editor visual com toolbar e conversão de volta para Markdown
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

## Integração conversacional e concorrência — 2026-10-02

[[Assistente Lumus]] permite listar, ler, criar e substituir conteúdo pelo chat. Títulos ambíguos recebem alternativas por nome/ordinal, sem seletor; edição apresenta o efeito e confirma a versão preparada. Conteúdo local não é enviado ao modelo, e valores ocultos são mascarados nos títulos, alternativas, resumos, mensagens e TTS. A rota/serviço respeita a preferência de visibilidade; não há exclusão, sincronização, compartilhamento ou anexos porque o fluxo atual não os oferece.

`saveLocalAnnotation` faz read-modify-write serializado por UID no utilitário de domínio, compartilhado entre editor e conversa. Cada gravação altera somente seu registro e preserva as outras anotações lidas no momento de persistir. A edição compara o fingerprint original dentro dessa fila; um editor montado antes de uma criação no chat não apaga a nota nova nem sobrescreve edição concorrente. Reenvio de conteúdo já persistido é reconhecido. `saveLocalAnnotations` conserva a reposição integral usada por fixtures/importadores, fora do caminho de edição.

O editor retém o rascunho se houver conflito e oferece “Descartar rascunho e recarregar” para abrir a versão atual por escolha explícita. UID, montagem e epoch são conferidos depois de awaits; a conta nova não recebe o resultado antigo. Não se promete rollback de uma gravação que já estava em andamento.

Lotes locais conservam identificação e resultado por item, progresso agregado, cancelamento de itens novos e retry sem repetir sucessos na memória da sessão. O teste de 256 notas usa a API pública com AsyncStorage mockado; não equivale a ditar 256 itens em uma mensagem, pois o compositor/engine recusa pedidos acima de 4.000 caracteres e o gateway limita propostas explícitas. Checkpoints não sobrevivem ao reload.

`tests/localAnnotations.test.ts` verifica duas mutações concorrentes de editor/chat, stale, reenvio e sessão; `tests/lumusAssistantApplication.test.ts` verifica 256 itens, ordinal, privacidade, progresso/cancelamento/retry. Typecheck e diff-check passaram. As telas Web/mobile compartilham `LocalAnnotationsScreen`; teclado/WebView/aparelho e recuperação visual de conflito não foram inspecionados nessa fatia.

A remontagem de efeitos restaura a marca de montagem do editor. No provider do assistente, o teste de cleanup com refs preservadas verifica que “Crie anotação Compras: arroz e feijão” continua criando uma mensagem e uma anotação consultável; um executor já encerrado não permanece como destino silencioso do envio.


### Renomeação pela conversa — 2026-10-04

“Renomeie a anotação Teclado para Compras da semana” prepara o título novo, apresenta o efeito e aceita “confirmo” para aquela versão. Conteúdo Markdown, ID e demais notas permanecem preservados; CAS e fila por UID também protegem esta alteração. A renomeação e a leitura do conteúdo foram verificadas no navegador com conta sintética. Os testes cobrem título novo, conflito, reenvio, sessão e confirmação pelo chat, sem seletor ou edição financeira em cartão.
