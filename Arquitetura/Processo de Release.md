---
tags: [frontend, arquitetura]
relacionado: [[MOC - Lumus Finanças]], [[Remoção do Backend]]
status: ativo
tipo: arquitetura
versao: 3.0.0
---

# Processo de Release

Esta etapa valida somente a fundação local Firebase Spark. Os scripts da implementação anterior continuam removidos; os novos emuladores/testes usam apenas projeto demo.

Verificações disponíveis: `npm ci`, `npm run check`, `npm run test:integration`, `npm run web:export:local`, teste de navegador e exports JavaScript Android/iOS em modo emulador. Perfis EAS preservam a identidade, mas builds desta etapa não estão autorizados para distribuição produtiva. Ver [[Fundação Firebase Spark]].

Não publicar nem modificar recursos remotos. O novo cliente bloqueia produção: as Rules publicadas permitem acesso amplo entre autenticados e exigem revisão/transição aprovada. O protótipo local nega fluxos financeiros antigos; não publicar sem avaliar clientes em circulação e integridade dos campos de autoridade.
