# Lumus Finanças

Frontend Expo/React Native preservado, com nova fundação Firebase compatível com Spark: autenticação, sessão e perfis testados em ambiente isolado. Os módulos financeiros permanecem indisponíveis até sua reconstrução incremental.

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

Conta sintética: `legacy@lumus.test`; senha local `Lumus-local-2026!`. Outros cenários e configuração Android estão em [Fundação Firebase Spark](Arquitetura/Funda%C3%A7%C3%A3o%20Firebase%20Spark.md). O cliente aceita somente o projeto demo dos emuladores. Sem modo local explícito, exibe indisponibilidade; não conecta automaticamente à produção.

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

Exports Android/iOS validam bundles, sem substituir testes instalados em aparelhos. As 51 telas e 82 arquivos de rota da etapa 01 permanecem. Nenhum deploy, migração ou alteração de dados de produção faz parte desta entrega.

## Situação de produção

A inspeção somente leitura confirmou Spark sem faturamento, mas encontrou **Rules publicadas que permitem a qualquer usuário autenticado ler/escrever todo o banco**. O protótipo restrito foi validado apenas localmente e não foi publicado. Acesso de produção permanece bloqueado neste novo cliente até revisão e transição autorizada. Não existe backup de produção validado nesta etapa.

[Arquitetura](Arquitetura.md), [relatório da fundação](Arquitetura/Funda%C3%A7%C3%A3o%20Firebase%20Spark.md) e [evidências](artifacts/firebase-foundation/) registram compatibilidade, preservação, custos e limites. Recuperação anterior à etapa 02: `recovery/firebase-foundation-20261108`. A implementação antiga permanece em `recovery/backend-removal-20261108` e no bundle externo da etapa 01.
