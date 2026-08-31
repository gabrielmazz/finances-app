# Rotas do Expo Router

`app/` é o registro de rotas do Expo Router. As rotas agora ficam separadas fisicamente em `app/web/` e `app/mobile/`; essa separação também aparece nas URLs públicas (`/web/...` e `/mobile/...`).

Os únicos arquivos mantidos na raiz são `_layout.tsx`, que monta a composição global, `index.tsx`, que encaminha a entrada para a plataforma atual, e este guia.

## Convenção por plataforma

Cada diretório usa os sufixos oficiais do Router para evitar que uma plataforma carregue a implementação da outra:

| Arquivo | Plataforma | Responsabilidade |
|---|---|---|
| `app/mobile/<rota>.tsx` | fallback Web da rota mobile | Mantém a rota disponível como fallback |
| `app/mobile/<rota>.native.tsx` | Android/iOS | Adaptador para `screens/mobile/` |
| `app/web/<rota>.tsx` | fallback nativo da rota Web | Mantém a rota disponível como fallback |
| `app/web/<rota>.web.tsx` | navegador | Adaptador para `screens/web/` |

Os arquivos com sufixo ficam lado a lado com o fallback dentro do próprio diretório. Assim, `/web/home` escolhe `app/web/home.web.tsx` no navegador e `/mobile/home` escolhe `app/mobile/home.native.tsx` no Android/iOS.

## Onde procurar a implementação

- Telas Android/iOS: `screens/mobile/`.
- Telas do navegador: `screens/web/`.
- Adaptadores de rotas Web: `app/web/`.
- Adaptadores de rotas Android/iOS: `app/mobile/`.
- Componentes exclusivos do navegador: `components/web/`.
- Componentes exclusivos de Android/iOS: `components/mobile/`.
- Componentes compartilhados e adaptadores lógicos: `components/uiverse/`.

## Regras rápidas

1. Mantenha os arquivos de rota finos: eles devem apenas exportar a tela, o redirect ou a composição de providers da rota.
2. Para uma rota Web, adicione os arquivos correspondentes em `app/web/`; use `.web.tsx` quando houver uma implementação Web específica.
3. Para uma rota nativa, adicione os arquivos correspondentes em `app/mobile/`; use `.native.tsx` quando houver uma implementação nativa específica.
4. Registre os caminhos com o prefixo correto em `utils/navigation.ts` (`APP_ROUTE_PATHS`) e nos guards de `components/app/app-root.tsx` quando a rota for protegida.
5. Não mova uma rota entre os diretórios sem atualizar os links, redirects e testes que usam `/web/...` ou `/mobile/...`.
