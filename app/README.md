# Rotas do frontend

A raiz contém `_layout.tsx` e o redirect de entrada. `web/` e `mobile/` preservam todos os adaptadores e seus fallbacks. As rotas delegam às telas em `screens/`.

`APP_ROUTE_PATHS` em `utils/navigation.ts` continua canônico. O guard seleciona o grupo da plataforma e respeita preferências locais de visibilidade; não autentica nem autoriza operações. O login visual fornece “Explorar telas”. Não criar provider ou backend dentro das rotas.

Ver [[Navegação]] e [[Remoção do Backend]].
