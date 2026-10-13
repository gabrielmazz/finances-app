---
tags: [seguranca, validacao, firebase, release]
relacionado: [[Remediação da Auditoria de Segurança]], [[Processo de Release]], [[Firebase Config]], [[Investimentos]]
status: validado-localmente
tipo: arquitetura
versao: 1.0.0
---

# Validação de Segurança de Ponta a Ponta

## Escopo — 2026-10-12

Implementação e validação local da auditoria de 2026-10-09, no worktree do Lumus Finanças. Base da revisão: `4364d1196036bfbb2e06b63fa600349cdebf9cac`; as alterações permanecem locais, sem commit nem deploy remoto. Os resultados abaixo não confirmam configuração do Firebase Console, versão publicada ou comportamento de APK/AAB instalado.

## Resultados executados

| Verificação | Resultado | O que comprova |
|---|---|---|
| `npm run check` | Aprovado: lint de estilos, typecheck do app/backend, 76 suítes e 699 testes | Contratos e regressões locais. Quatro suítes/88 testes condicionais ficaram fora desse comando; não são evidências aprovadas. |
| `npm --prefix backend run test:emulator` | Aprovado | Auth, Firestore, Rules e Functions locais; perfis, relações, schemas legados, ledger, limites, consentimentos, migração e ajustes. Inclui 68 testes do executor financeiro com SDK/callables reais. |
| `npm --prefix backend run test:app-check:emulator` | Aprovado | As 15 callables rejeitam chamadas autenticadas sem atestado com enforcement ligado; teste de transporte separado rejeita atestado falsificado antes do handler de negócio. O arquivo local de configuração é restaurado no `finally`. |
| Navegador Web com duas contas sintéticas | Aprovado | Listas antigas não autorizam compartilhamento; convite não libera dados; aceite libera; logout A→B não mostra dados de A; revogação volta a isolar as contas. |
| Export Web | Aprovado | Bundle Web gerado após atualização de dependências, com alvo local demo. Não prova Hosting publicado ou emissão real reCAPTCHA. |
| Export Android | Aprovado | Bundle JavaScript/Hermes gerado após atualização de dependências; não substitui novo APK/AAB, manifesto, aparelho e App Check nativo. |
| `git diff --check` | Aprovado | Ausência de erros de whitespace no diff. |
| Auditoria de dependências | Parcial, bloqueia publicação | Zero alertas críticos nos dois lockfiles; alertas altos permanecem no app. |

Os testes locais usam Node 22.13.0 e Java 21. O backend declara Node 20; execução no runtime remoto continua pendente. App Check Emulator ignora validação real da assinatura: por isso o caso de token falsificado usa servidor HTTP local com o SDK Functions fora do bypass do Emulator. Emissão e validação de atestados legítimos pelos provedores ainda exigem homologação.

## Casos de abuso e regressão

- **Compartilhamento:** acesso unilateral, pessoa estrangeira, não autenticada e vínculo antigo sem concessões são negados. Aceite cria concessões recíprocas; desvínculo revoga. Não converter listas antigas automaticamente: usuários precisam renovar convite e aceite.
- **Migração:** 450 movimentos exercitam execução em lotes. Mudança do valor após a prévia invalida o fingerprint. Revogação bloqueia o lote seguinte sem avançar cursor; renovação permite retomada. Saldo final e Caixa são exatos; reenvio concluído retorna recibo sem duplicar eventos.
- **Custo:** 2.001 documentos em uma coleção recusam o plano; limite de cinco membros e consultas limitadas precedem o processamento. Não há truncamento silencioso.
- **Schemas financeiros:** injeção de campos de grupo/admin, referências inválidas, centavos inválidos e movimentos compostos diretos são negados. Campos históricos desconhecidos permanecem somente sem alterações. Recorrências exigem ciclo, registro e efeito compatíveis na escrita atômica.
- **Investimentos:** sincronização confere valores anterior/final e banco do investimento. Saldo anterior inventado ou outro banco são negados. Históricos antigos dos testes são inseridos administrativamente, sem simular uma nova escrita válida do cliente.
- **Cutover:** marcador do ator e do proprietário impede ajuste de banco legado após migração, inclusive por usuário relacionado.
- **Logout:** cache, preferência de confiança e anotações aguardam escritas pendentes e limpam o UID anterior. Testes cobrem escrita tardia, falha de armazenamento, retry e troca de conta durante cleanup.
- **Push:** logout aguarda registro pendente e revoga o dispositivo antes de encerrar Auth. Callback tardio não reassocia outra conta; falha de revogação mantém sessão recuperável. Entrega real permanece pendente.
- **PDF:** arquivos temporários são removidos após compartilhar/imprimir, cancelar ou falhar em testes da fronteira nativa. Inspeção do armazenamento em aparelho permanece pendente.
- **Privacidade:** Analytics desativado; solicitação de exclusão fica `pending-retention-policy`, sem apagar parcialmente perfil/dados/Auth nem alegar exclusão completa.

## Revisão por dois eixos

### Standards

Um achado corrigido: gravação assíncrona da preferência de confiança podia recriar `enabled: true` após logout. A preferência e a persistência financeira agora compartilham a barreira de mutações por UID; cleanup espera as pendências e respostas tardias são invalidadas. Teste de regressão aprovado.

### Spec

Dois achados corrigidos: ajuste de saldo por conta relacionada podia escrever banco legado cujo proprietário já havia migrado; histórico de sincronização aceitava saldo anterior inventado e banco divergente. A transação verifica o corte do proprietário, e as Rules vinculam histórico ao investimento antes/depois da escrita. Testes de regressão aprovados.

Resumo: Standards, um achado corrigido; Spec, dois achados corrigidos. Esta revisão não fecha as validações remotas pendentes.

## Inventário de dependências

Contagem do `npm audit` em 2026-10-12, após atualizações compatíveis:

| Lockfile | Críticos | Altos | Moderados | Total de pacotes sinalizados |
|---|---:|---:|---:|---:|
| App | 0 | 51 | 19 | 70 |
| Backend | 0 | 0 | 9 | 9 |

Esses totais incluem dependentes transitivos do mesmo advisory; não representam 70 ou 9 vulnerabilidades distintas nem demonstram exploração pelo app.

Corrigidos: `proxy-addr` 2.0.8, `shell-quote` 1.12.0, Tiptap 3.31.4, `brace-expansion` e outras atualizações compatíveis. Overrides fixam gRPC 1.13.6 no app, gRPC 1.14.5 e `qs` 6.16.0 no backend. O backend agora tem lockfile próprio, Firebase de testes 12.19.0 e Rules Unit Testing 5.0.2; árvore instalada sem override inválido. `patch-package` foi reaplicado com sucesso.

| Origem direta restante | Severidade | Situação / próximo passo |
|---|---|---|
| `braces` | Alta | Recebido pelas ferramentas de glob/Tailwind. Advisory sem versão corrigida disponível; tratar profundidade de padrões não confiáveis ou atualização upstream antes de liberar gate. Não aplicar migração automática Tailwind 4. |
| `node-forge` | Alta | Dependência Expo CLI/certificados de assinatura; advisory sem versão corrigida disponível. Revisar a fronteira de certificados/assinatura e solução upstream. Não aceitar downgrade Expo 44 sugerido pelo audit. |
| `decode-uri-component` | Moderada | Herdado pelo Router. Avaliar atualização compatível/upstream; upgrade Expo Router 58 é migração separada. |
| `postcss-selector-parser` | Moderada | Herdado pelas ferramentas CSS; avaliar patch compatível ao baseline e limites para CSS externo. |
| `sprintf-js` | Moderada | Herdado pelo Jest/Babel. Avaliar correção upstream; Jest 30 exige migração dos testes. |
| `uuid` | Moderada | Ferramentas/SDK Google e backend Admin. Advisory envolve variantes com buffer fornecido; alcance nos usos reais deve ser revisado. Admin 14 exige upgrade também do Functions/pares. Não forçar major transitivo globalmente. |

Fontes: [gRPC](https://github.com/advisories/GHSA-m9gg-hp2v-232j), [qs](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g), [braces](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), [node-forge](https://github.com/advisories/GHSA-86w9-cpqp-85rv), [uuid](https://github.com/advisories/GHSA-w5hq-g745-h8pq).

`script/release.js` executa audit dos dois projetos com `--audit-level=high`; falha de auditoria ou de App Check interrompe antes de deploy/build. Não há exceção automática nem `audit fix --force`. Quatro testes verificam que falhas de cada audit e App Check bloqueiam o deploy e que o caminho aprovado executa os gates antes de publicar. O gate integral continua bloqueado pelos alertas altos restantes, mesmo com suites funcionais aprovadas.

## Ambiente recuperado

O preview anterior herdava produção no commit `1d6d0d0`. `.firebaserc` contém demo e produção `finances-app-e8685`, sem homologação. A conta EAS acessível é `gabrielmazz`; o ambiente preview consultado não mostrou os identificadores públicos de um projeto Lumus separado. A CLI Firebase listou produção e três projetos de outros aplicativos. Portanto, não usar o APK antigo de preview para testes que escrevam dados de homologação.

`adb` oficial instalado temporariamente no Windows não encontrou aparelho/emulador em `devices -l`. O caminho Android SDK anteriormente configurado não continha a ferramenta. Não foi feito deploy, build EAS, backup remoto ou teste instalado nesta remediação.

## Trabalho necessário antes da publicação

1. Resolver os alertas altos restantes com solução compatível ou avaliação explícita e revisada; o gate não os ignora.
2. Provisionar/identificar Firebase de homologação realmente separado, preencher EAS preview e arquivo Android do mesmo projeto; conferir Auth, Hosting, AI Logic, Remote Config, App Check, quotas e alertas.
3. Exportar backup de produção e regras atuais; restaurar cópia isolada e confrontar documentos históricos com os schemas. Normalizar somente formatos legítimos identificados e repetir os testes.
4. Publicar Functions/Rules em homologação, testar cliente Web/APK com atestados válidos e inválidos e ligar gradualmente `LUMUS_ENFORCE_APP_CHECK=true`. O default local/remoto permanece falso até essa validação.
5. Em Android/iOS instalado: troca A→B, suspensão/reload, sessão desativada, push real, inspeção de cache/backup/PDF e Analytics em instalação limpa. Registrar ID do build e resultados.
6. Aprovar política de retenção e inventário por UID antes de implementar e executar exclusão completa. A decisão atual é manter solicitação pendente.
7. Registrar evidências, revisar diff e fazer commit; então repetir o gate integral e seguir [[Processo de Release]].

## Reprodução local

Executar no Linux do workspace, com Node/Java instalados:

```sh
npm run check
npm --prefix backend run test:emulator
npm --prefix backend run test:app-check:emulator
npm audit
npm --prefix backend audit
```

Para navegador, iniciar Auth/Firestore/Functions do projeto `demo-lumus-financas`, usar `backend/scripts/securityBrowserSeed.ts` com hosts locais e servir o cliente com alvo `emulator`. O script recusa projetos/hosts remotos e permite revogar o vínculo sintético com `--revoke`. Dados sintéticos não substituem validação do legado real.
