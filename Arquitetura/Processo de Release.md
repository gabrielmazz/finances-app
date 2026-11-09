---
tags: [frontend, arquitetura]
relacionado: [[MOC - Lumus Finanças]], [[Remoção do Backend]]
status: ativo
tipo: arquitetura
versao: 3.0.0
---

# Processo de Release

A publicação restrita de Rules foi autorizada e executada em 09/11/2026, com hash verificado no projeto existente. Nenhum Hosting/app foi distribuído. Registro em `docs/security-publication-20261109.md` e `artifacts/security-publication-20261109/`. Procedimento completo, matriz, hashes, monitoramento, interrupção e reversão em [[Segurança e Preparação para Produção]]. `firebase.production.json` aponta somente para `firestore.rules`; `firebase.containment.json` aponta para contenção de emergência, sem reabrir permissões.

Verificações: `npm ci`, `npm run check`, `npm run test:integration`, export Web, navegador e bundles Android/iOS. Não distribuir builds locais/demo como produção. Perfis EAS preservam identidade; distribuição exige autorização e homologação separadas.

Com token curto autorizado, `npm run production:audit` inspeciona metadados/contagens e prepara manifesto; `npm run production:verify` compara a fonte realmente publicada ao candidato testado e só então libera configuração local do cliente existente. Nenhum desses comandos publica Rules ou modifica contas/dados remotos. O gate foi aberto localmente após verificar o hash publicado; uso produtivo ainda exige modo/opções explícitos.

A publicação suspendeu operações financeiras, cadastros Spark antigos, consultas ilimitadas e vínculos não verificados, conforme impacto explicitamente aceito. A Web publicada foi analisada e esses impactos estão comprovados; binários mobile instalados ainda são desconhecidos. A autorização cobre essa suspensão, não certifica compatibilidade universal ou distribuição do novo cliente. Nunca usar as antigas Rules abertas como reversão. Nenhuma migração ou escrita real pertence a esta etapa.

## Finalização da homologação

Acompanhamento contínuo das Rules e Web real autorizada foram executados; exportação Auth real e restauração do destino também foram validadas dentro dos limites do emulador. [[Homologação e Recuperação da Etapa 03]] registra os resultados atuais. `homologation:prepare/export/serve/native` prepara somente execução local no projeto aprovado; nenhuma distribuição implícita. SDK57 exige Expo Go compatível: uma instalação 58 não certifica execução 57. A cópia/chave co-localizada foi aceita pelo proprietário, sem redundância física. `backup:verify:local` faz apenas inspeção/recuperação isoladas, sem nuvem.

Homologação física assistida executada em Samsung SM_S926B/Expo Go57.0.9, com oito cenários, sem distribuição do aplicativo. O proprietário autorizou explicitamente substituir o Expo Go58 e seus dados locais; o estado do pacote Lumus permaneceu igual. Scripts e evidências em [[Homologação e Recuperação da Etapa 03]]. A automação de toque do menu foi limitada; a saída manual foi seguida de verificação automática de sessão encerrada após reinício/link privado.
