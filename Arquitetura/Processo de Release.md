---
tags: [frontend, arquitetura]
relacionado: [[MOC - Lumus Finanças]], [[Remoção do Backend]]
status: ativo
tipo: arquitetura
versao: 3.0.0
---

# Processo de Release

Esta etapa valida somente a base local. Os scripts de deploy, migração, seed, emuladores e release do backend anterior foram removidos.

Verificações disponíveis: `npm ci`, `npm run check`, `npm run web:export` e exports JavaScript Android/iOS. Perfis EAS preservam a identidade do frontend e não exigem configuração de serviço ou credenciais do backend anterior.

Não publicar nem modificar recursos remotos como parte desta limpeza. A escolha de infraestrutura e os processos de publicação do próximo backend serão definidos posteriormente.
