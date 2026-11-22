---
tags: [frontend, arquitetura]
relacionado: [[MOC - Lumus Finanças]], [[Remoção do Backend]]
status: ativo
tipo: arquitetura
versao: 3.0.0
---

# Processo de Release

## MVP pessoal 1.0

`npm run homologation:web` inicia a Web na porta 8088; `npm run homologation:export` e `npm run homologation:serve` oferecem uma versão estática local na porta 4174. Ambos usam a configuração privada já preparada e o projeto oficial somente para leitura financeira. O aplicativo recusa as escritas fora do projeto demo; o bloqueio do cliente não substitui Rules. O procedimento anterior a qualquer ativação está em `docs/mvp-ativacao-controlada.md`.

A configuração do splash aponta para `assets/lumusIcon.png`, ícone existente do aplicativo; a referência anterior a `assets/splash-icon.png` impedia gerar o projeto nativo por apontar para arquivo inexistente. A validação Android exige APK instalado e aparelho, além da exportação JavaScript.

Em 14/11/2026 foi gerado localmente `artifacts/mvp-1.0/Lumus-Financas-Teste-arm64.apk`, destinado apenas a teste pessoal, com o identificador separado `com.gabrielmazz.lumusfinances.homologacao` e assinatura por chave privada local específica de teste. A chave e sua configuração permanecem fora do repositório; preservá-las é necessário para atualizar essa instalação. O APK usa Android 7+ em ARM64 e contém a configuração oficial de leitura. Assinatura e alinhamento foram verificados; isso não constitui teste em aparelho nem autorização de operações reais.

Posteriormente, o titular confirmou em aparelho físico a instalação do MVP 1.0, login oficial, Home, bancos, categorias, extrato, paginação, sessão, logout e novo login. Essa homologação relatada não cobre o código do MVP 1.1 nem autoriza gravações financeiras.

A publicação restrita de Rules foi autorizada e executada em 09/11/2026, com hash verificado no projeto existente. Nenhum Hosting/app foi distribuído. Registro em `docs/security-publication-20261109.md` e `artifacts/security-publication-20261109/`. Procedimento completo, matriz, hashes, monitoramento, interrupção e reversão em [[Segurança e Preparação para Produção]]. `firebase.production.json` aponta para a fonte publicada da Etapa 03. `firebase.containment.json` aponta para contenção de emergência.

Verificações: `npm ci`, `npm run check`, `npm run test:integration`, export Web, navegador e bundles Android/iOS. Não distribuir builds locais/demo como produção. Perfis EAS preservam identidade; distribuição exige autorização e homologação separadas.

Com token curto autorizado, `npm run production:audit` inspeciona metadados/contagens e prepara manifesto; `npm run production:verify` compara a fonte realmente publicada ao candidato testado e só então libera configuração local do cliente existente. Nenhum desses comandos publica Rules ou modifica contas/dados remotos. O gate foi aberto localmente após verificar o hash publicado; uso produtivo ainda exige modo/opções explícitos.

A publicação suspendeu operações financeiras, cadastros Spark antigos, consultas ilimitadas e vínculos não verificados, conforme impacto explicitamente aceito. A Web publicada foi analisada e esses impactos estão comprovados; binários mobile instalados ainda são desconhecidos. A autorização cobre essa suspensão, não certifica compatibilidade universal ou distribuição do novo cliente. Nunca usar as antigas Rules abertas como reversão. Nenhuma migração ou escrita real pertence a esta etapa.

## Finalização da homologação

Acompanhamento contínuo das Rules e Web real autorizada foram executados; exportação Auth real e restauração do destino também foram validadas dentro dos limites do emulador. [[Homologação e Recuperação da Etapa 03]] registra os resultados atuais. `homologation:prepare/export/serve/native` prepara somente execução local no projeto aprovado; nenhuma distribuição implícita. SDK57 exige Expo Go compatível: uma instalação 58 não certifica execução 57. A cópia/chave co-localizada foi aceita pelo proprietário, sem redundância física. `backup:verify:local` faz apenas inspeção/recuperação isoladas, sem nuvem.

Homologação física assistida executada em Samsung SM_S926B/Expo Go57.0.9, com oito cenários, sem distribuição do aplicativo. O proprietário autorizou explicitamente substituir o Expo Go58 e seus dados locais; o estado do pacote Lumus permaneceu igual. Scripts e evidências em [[Homologação e Recuperação da Etapa 03]]. A automação de toque do menu foi limitada; a saída manual foi seguida de verificação automática de sessão encerrada após reinício/link privado.

## MVP 1.4 — APK de teste

O APK local `artifacts/mvp-1.4/Lumus-Financas-MVP-1.4-arm64.apk` foi compilado para ARM64, identificado como 1.4.0 (versionCode 2), alinhado e assinado com o mesmo certificado da versão de teste anterior. Usa o projeto oficial em modo somente leitura; não foi instalado nem homologado fisicamente nesta execução. As Rules candidatas e as listagens legadas ainda têm falhas e não foram publicadas; não representa liberação de uso financeiro real.

## MVP 1.5 — APK para o emulador

O APK 1.5.0 (versionCode 3) e a exportação Web local estão em `artifacts/mvp-1.5/`. O Android usa pacote separado, ARM64 e redirecionamento USB para o Firebase Emulator. A assinatura e o alinhamento foram verificados. O teste em aparelho e a publicação de novas Rules seguem pendentes. Consulte `docs/mvp15-ativacao.md` para resultados, comando Web e roteiro de instalação.

A revisão 1.5.1 (versionCode 4) usa o mesmo pacote e certificado de desenvolvimento. O APK ARM64 e a exportação Web em `artifacts/mvp-1.5.1/` incluem modelos e confirmações manuais por ciclo e a consulta explícita de registros legados por ID no emulador. A publicação segue condicionada à regressão de compatibilidade legada. O [relatório da ativação](../docs/mvp15-ativacao.md) registra os testes e a versão das Rules ativas.

## MVP 1.5.2 com o Firebase oficial

`npm run homologation:prepare` verifica o Firebase oficial e prepara a configuração local. `npm run homologation:export` exporta a Web oficial e `npm run homologation:serve` a serve em `http://127.0.0.1:4174/web`. O servidor escuta somente na máquina local. Para desenvolvimento, use `npm run emulators:start`, `npm run emulators:seed` e `npm run dev:local:web`.

Em uma cópia de compilação, `npm run homologation:prebuild:android` gera o projeto nativo e `npm run homologation:build:android` compila o binário ARM64. O comando Gradle exige o pacote `com.gabrielmazz.lumusfinances.homologacao` e carrega o modo `production` e a chave pública do SDK antes de compilar com Metro. A assinatura usada para entregar o APK deve ser a chave local já usada no APK oficial anterior. Compare o certificado, o pacote e a versão após assinar. O build de desenvolvimento usa o pacote `com.gabrielmazz.lumusfinances.emulador`. A configuração dos dois modos é incorporada ao código pelo Expo SDK 58. [Variáveis de ambiente no Expo](https://docs.expo.dev/guides/environment-variables/)

O APK oficial 1.5.2 permite login por e-mail e senha e consultas autorizadas. A homologação instalada depende de abrir a Home, conferir bancos, categorias e extrato, reiniciar o aplicativo e confirmar sessão, logout e novo login no aparelho. As ações financeiras permanecem disponíveis para teste no emulador. O [relatório da ativação](../docs/mvp15-ativacao.md) registra a validação das Rules e o estado do índice.

## MVP 1.6.0-rc.1

`npm run staging:prepare` confere SDK, Rules publicadas e Spark em `lumus-financas-hml`. `npm run staging:web` usa esse projeto isolado e `npm run staging:export` seguido de `npm run staging:serve` usa a Web exportada na porta 4175. `npm run staging:prebuild:android` e `npm run staging:build:android` geram o APK ARM64 de pacote `com.gabrielmazz.lumusfinances.hml`. As identidades e dados usados nesses fluxos são sintéticos. O modo oficial mantém a assinatura e o identificador do canal existente e continua em consulta até o corte. Consulte [[Migração Financeira Definitiva]] para a sequência e para os pré-requisitos de ativação.

O registro de release em `firebase/production-readiness.json` só habilita o cliente canônico após verificação das Rules publicadas e do manifesto aplicado. A distribuição oficial depende das provas da janela e da validação de referências por conta. O [manifesto de revisão de 20/11](../docs/mvp160-conciliacao.md#manifesto-para-autorização) registra as condições pendentes.

## MVP 1.6.0

A exportação Web oficial e o APK ARM64 conservam o modo de consulta até a autorização e a verificação do corte. A versão estável usa o pacote `com.gabrielmazz.lumusfinances.homologacao`, o certificado do APK 1.5.2 e o versionCode 8. O canário aprovado abre leituras canônicas mantendo as antigas. O recibo verificado distingue o canário e o cliente com escrita financeira. As duas fontes e os índices previstos estão no [manifesto de corte](../docs/mvp160-corte.md). Ver [[Migração Financeira Definitiva]].
