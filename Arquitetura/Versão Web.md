---
tags: [frontend, arquitetura]
relacionado: [[MOC - Lumus Finanças]], [[Remoção do Backend]]
status: ativo
tipo: arquitetura
versao: 3.0.0
---

# Versão Web

A Web continua usando React Native Web, Mantine, Expo DOM, shell responsivo e exportação SPA (`web.output: single`).

`npm run dev:local:web` inicia o Expo com modo emulador explícito; execute `emulators:start` e `emulators:seed` em terminal separado. `npm run web:export:local` gera `dist` para esse ambiente. `npm run web:serve` serve em `http://127.0.0.1:4173`, com fallback das rotas. O servidor serve apenas arquivos; Auth/Firestore são os emuladores. `web`/`web:export` sem modo explícito nem `.env.local` mostram indisponibilidade do serviço, sem fallback remoto. Ver [[Fundação Firebase Spark]].

Não há configuração de Hosting ou deploy ativo nesta etapa. O serviço remoto anterior não foi alterado. Ver [[Processo de Release]] e [[Remoção do Backend]].
