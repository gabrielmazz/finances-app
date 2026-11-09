# Lumus Finanças

Frontend Expo/React Native preservado, com fundação Firebase Spark e etapa 03 de segurança: autenticação/sessão/perfis, isolamento por Rules e recuperação criptografada testados em ambiente isolado. Os módulos financeiros permanecem indisponíveis até sua reconstrução incremental.

## Executar localmente

Requer Node >=22.13, Java >=21 e npm. Não exige login administrativo, faturamento ou credenciais de produção.

```bash
npm ci
# Terminal 1:
npm run emulators:start
# Terminal 2:
npm run emulators:seed
npm run dev:local:web
# Ou: npm run dev:local
```

Conta sintética: `legacy@lumus.test`; senha local `Lumus-local-2026!`. Outros cenários e configuração Android estão em [Fundação Firebase Spark](Arquitetura/Funda%C3%A7%C3%A3o%20Firebase%20Spark.md). O cliente local utiliza o projeto demo dos emuladores; o modo produtivo exige opções explícitas e o registro do hash, já verificado após a publicação autorizada em 09/11. Sem modo local explícito, exibe indisponibilidade; não conecta automaticamente à produção.

## Verificar

```bash
npm run check
# Pare os emuladores de desenvolvimento antes deste teste isolado:
npm run test:integration
npm run web:export:local
npm run web:serve
# Com emuladores novos/seed e exportação servida:
npx playwright install chromium
npm run test:browser
```

Exports Android/iOS validam bundles, sem substituir testes instalados em aparelhos. As 51 telas e 82 arquivos de rota da etapa 01 permanecem. Não houve migração ou alteração de documentos/contas; somente Rules foram publicadas com autorização em 09/11.

## Situação de produção

As Rules restritivas foram publicadas com autorização em **09/11/2026**, com hash verificado, Spark/Standard e faturamento desativado. A publicação suspendeu operações financeiras antigas, consultas ilimitadas e compartilhamentos não verificados, conforme impacto aceito. Nenhum documento financeiro, conta Auth, Hosting ou aplicativo foi alterado/distribuído.

Uma cópia real criptografada de **987 documentos Firestore** foi restaurada em rede isolada com hashes iguais, IDs preservados e leitura dos perfis pela aplicação. Dados/chaves ficam fora do Git; cópia percorre um intervalo; contas Auth têm agora arquivo cifrado separado, autorizado, com três contas e parâmetros disponíveis. As verificações posteriores estão em [publicação e recuperação reais](docs/security-publication-20261109.md) e [evidências](artifacts/security-publication-20261109/). Oito fluxos Web reais foram homologados por login manual autorizado. Android físico SM_S926B homologado com Expo Go57.0.9 após substituição autorizada: oito cenários de sessão/perfil/conexão/logout, com ações manuais e verificações por ADB.

[Entrega da etapa 03 e procedimento de publicação](Arquitetura/Seguran%C3%A7a%20e%20Prepara%C3%A7%C3%A3o%20para%20Produ%C3%A7%C3%A3o.md), [evidências da etapa 03](artifacts/security-stage03/), [Arquitetura](Arquitetura.md), [relatório da fundação](Arquitetura/Funda%C3%A7%C3%A3o%20Firebase%20Spark.md) e [evidências](artifacts/firebase-foundation/) registram compatibilidade, preservação, custos e limites. Recuperação anterior à etapa 02: `recovery/firebase-foundation-20261108`. A implementação antiga permanece em `recovery/backend-removal-20261108` e no bundle externo da etapa 01.

Recuperação anterior à etapa 03: `recovery/security-stage03-20261108` (`e86a55f`). Sem módulos financeiros novos. Backup Auth real e recuperação integrada sintética foram executados. A chave co-localizada foi aceita pelo proprietário; redundância externa, builds standalone/iOS físico e distribuição continuam sujeitos aos limites documentados. Ver [estado atual da finalização](Arquitetura/Homologa%C3%A7%C3%A3o%20e%20Recupera%C3%A7%C3%A3o%20da%20Etapa%2003.md).

`npm run backup:verify:local` verifica os arquivos privados no destino aprovado e restaura em ambiente isolado, sem nuvem. Homologação produtiva local: `npm run homologation:prepare`, `npm run homologation:export`, `npm run homologation:serve`; no Android, `npm run homologation:native`, com Expo Go SDK57. A conta deve ser autorizada e o login manual, sem credenciais no Git.
