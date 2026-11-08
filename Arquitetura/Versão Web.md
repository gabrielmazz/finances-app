---
tags: [frontend, arquitetura]
relacionado: [[MOC - Lumus Finanças]], [[Remoção do Backend]]
status: ativo
tipo: arquitetura
versao: 3.0.0
---

# Versão Web

A Web continua usando React Native Web, Mantine, Expo DOM, shell responsivo e exportação SPA (`web.output: single`).

`npm run web` inicia o Expo sem serviços auxiliares. `npm run web:export` gera `dist`. `npm run web:serve` serve uma exportação existente em `http://127.0.0.1:4173`, com fallback das rotas. O servidor local serve apenas arquivos; não possui API ou persistência. Nenhuma variável de backend é necessária.

Não há configuração de Hosting ou deploy ativo nesta etapa. O serviço remoto anterior não foi alterado. Ver [[Processo de Release]] e [[Remoção do Backend]].
