---
tags: [release, expo, firebase, web, android]
relacionado: [[Firebase Config]], [[Versão Web]], [[Gerenciamento de Bancos]], [[Assistente Lumus]]
status: ativo
tipo: arquitetura
versao: 2.3.1
---

# Processo de Release

`script/release.js` é o gate único de exportação e publicação. Ele confere a versão em `app.json`, `package.json`, `package-lock.json` e nas duas telas de login; confere o alvo Firebase, o pacote Android e a política de versionCode remoto do EAS; executa `npm run check`, build do backend, testes de integração nos emuladores e exports Android/Web. As ações de publicação exigem uma árvore Git limpa. `npm run release:check:offline` executa as verificações sem emuladores quando só há acesso local, mas não libera uma publicação.

## Ambientes

- `production` usa `finances-app-e8685`, App Check Android Play Integrity e o `google-services.json` desse projeto. O AAB vem de `npm run android:build:production`; `production-apk` produz um APK interno com a mesma configuração para inspeção em aparelho.
- `preview` exige outro projeto Firebase. Os identificadores públicos vêm do ambiente EAS `preview`, acessado localmente com `eas env:exec preview '<comando>'`; precisam ter visibilidade Plain text ou Sensitive para o preflight local. O arquivo `GOOGLE_SERVICES_JSON` desse projeto fica como variável de arquivo secreta no EAS. A configuração Android confere `project_id` e `package_name` no worker. O preview nunca herda as credenciais de produção nem aceita o JSON local de produção como substituto.
- No projeto de preview, habilitar Auth, Firestore, Functions, Hosting, AI Logic, Remote Config e App Check para os apps Web/Android registrados. Autorizar os domínios do Hosting no Auth e no reCAPTCHA Enterprise. Cadastrar o token App Check Debug do APK de preview no app Android desse projeto. A configuração da chave Web do reCAPTCHA é pública e deve pertencer ao mesmo projeto.

## Sequência

1. Sincronizar a versão com `npm run version:set -- <versão>` e revisar o diff. Fazer commit após os gates locais passarem.
2. Criar backup/export do Firestore e guardar as regras atualmente implantadas. Para testar a migração do razão, restaurar uma cópia de dados no projeto isolado e resolver todos os `issues` do dry-run antes da execução; um dry-run com pendências bloqueia o cutover.
3. Conferir `npm run release:check` e as variáveis/arquivo EAS dos dois ambientes. Publicar o backend isolado com `npm run firebase:deploy:preview`, depois o Hosting de preview com `npm run web:deploy:preview` e gerar o APK com `npm run android:build:preview`.
4. Na URL de preview e no APK, validar login/cadastro, leitura e gravação de banco, saldo, transação, recorrências, regras de acesso, assistente, App Check e navegação por link direto. Confirmar que os dados aparecem apenas no projeto de preview.
5. Após revisar o backup, os resultados e o diff das regras, publicar backend com `npm run firebase:deploy:production`, Hosting com `npm run web:deploy`, gerar `npm run android:build:production-apk` para inspeção e `npm run android:build:production` para o AAB. A submissão à Play Store é uma etapa externa posterior.
6. Repetir o smoke test na URL publicada e no APK de produção; registrar versão, ID do build EAS, projeto Firebase, URL e resultado. Falha de qualquer validação interrompe a sequência.

`firebase:deploy:*` publica Functions, regras e índices de Firestore. O `firebase.json` recompila o backend antes do deploy. O template `remote_config.json` exige conferência e publicação própria conforme [[Assistente Lumus]]; ele não é sobrescrito automaticamente por esse comando. O Hosting é publicado separadamente para que a UI só entre depois do backend compatível.

Nenhuma configuração remota ou build instalado é inferido a partir de export local: EAS, Firebase Console, URL Web e aparelho precisam de validação real antes de declarar a versão publicada funcional.
