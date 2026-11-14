---
tags: [frontend, arquitetura]
relacionado: [[MOC - Lumus Finanças]], [[Remoção do Backend]]
status: ativo
tipo: arquitetura
versao: 3.0.0
---

# Versão Web

A Web continua usando React Native Web, Mantine, Expo DOM, shell responsivo e exportação SPA (`web.output: single`).

Em 13/11/2026, o cliente foi atualizado para Expo SDK 58 e React Native 0.88. A Home e o acordeão de categorias usam os avisos existentes para sinalizar dados históricos não verificados, sem tratar uma consulta incompleta como lista vazia confirmada. Login sintético e Home foram verificados no emulador em desktop e largura de celular; não se presume o resultado de uma sessão oficial. `npm run homologation:web` usa o Firebase oficial em modo somente leitura; `npm run homologation:native` inicia o Expo Go na rede local. Ver [[Fundação Firebase Spark]].

`npm run dev:local:web` inicia o Expo com modo emulador explícito; execute `emulators:start` e `emulators:seed` em terminal separado. `npm run web:export:local` gera `dist` para esse ambiente. `npm run web:serve` serve em `http://127.0.0.1:4173`, com fallback das rotas. O servidor serve apenas arquivos; Auth/Firestore são os emuladores. `web`/`web:export` sem modo explícito nem `.env.local` mostram indisponibilidade do serviço, sem fallback remoto. Ver [[Fundação Firebase Spark]].

O teste de navegador da etapa 03 cobre 50 verificações de rotas, cinco fluxos e reinício real do Chromium; capturas em `artifacts/security-stage03/`. O JS público do Hosting existente foi inspecionado sem execução para avaliar incompatibilidades. Não há configuração de deploy de Hosting nesta etapa; em 09/11 a configuração de produção publicou somente Rules, com autorização específica e hash verificado, sem atualizar o Hosting. O serviço remoto anterior não foi alterado. Ver [[Segurança e Preparação para Produção]], [[Processo de Release]] e [[Remoção do Backend]].
