---
tags: [seguranca, auditoria, firebase, privacidade]
relacionado: [[Gerenciamento de Usuários]], [[Gerenciamento de Bancos]], [[Autenticação]], [[Notificações]], [[Firebase Config]], [[Processo de Release]]
status: em-validacao
tipo: arquitetura
versao: 1.1.0
---

# Remediação da Auditoria de Segurança

Registro da implementação local da auditoria de 2026-10-09. A validação local não prova que Rules, Functions, Hosting ou builds publicados tenham sido atualizados.

| Achado | Implementação local | Limite de validação |
|---|---|---|
| S-01 | Convite e aceite autenticado; concessões recíprocas no servidor exigidas pelas Rules, operações legadas e push. Preview não revela nome antes do aceite. Desvínculo revoga. | Web local validada: listas antigas sem concessões não autorizam, convite não libera dados, aceite libera e revogação volta a isolar. Android/iOS e ambiente remoto pendentes. |
| S-02 | Consentimento por membro/administrador/ação durante 24 horas; conferência antes de ler, depois de planejar e na transação. Fingerprint inclui valores, datas, metadados e membros. Retomada exige consentimento ativo; reenvio de migração concluída recupera o recibo sem novas escritas. Confirmação do Caixa exige `confirmedAt` estável e IDs separados por grupo. | Teste com 450 movimentos verifica alteração de valor após prévia, revogação entre lotes, renovação do consentimento, saldos exatos e reenvio sem duplicação. Alteração do plano após um lote exige intervenção revisada, sem ativar grupo inconsistente. |
| S-03 | Perfil não pode ser excluído pelo cliente; marcador `financialCutovers/{uid}` controlado pelo servidor mantém o corte irrevogável pelas Rules. | Conferir perfis já migrados e configuração publicada. |
| S-04 | Allowlist por coleção, datas, centavos, categorias/bancos autorizados, investimentos e recorrências. Campos desconhecidos históricos podem permanecer sem alteração. Movimentos compostos são exclusivos do backend. Histórico de sincronização vincula o valor anterior ao investimento antes da escrita, o valor posterior ao estado final e o banco ao investimento. Ajuste legado verifica o corte do solicitante e do dono do banco dentro da transação. | Schemas e fluxos sintéticos validados nos emuladores. **Compatibilidade histórica pendente:** confrontar com cópia isolada de documentos reais; formatos antigos fora dos schemas poderão exigir normalização antes da publicação. |
| S-05 | `adminUser` deixa de ser editável pelo cliente e não define papel financeiro; o papel vem do grupo. | Verificar usos administrativos fora do módulo financeiro. |
| S-06 | Logout bloqueia novas mutações locais, espera as pendentes e limpa cache financeiro, preferência de confiança e anotações antes de encerrar Auth. Preferência e persistência compartilham a barreira por UID; respostas tardias são invalidadas por geração. | Troca A→B no navegador sem dados de A. Testes com escrita pendente, erro de armazenamento e troca durante cleanup passaram. Inspeção em instalação nativa pendente. |
| S-07 | Limite por UID/operação em todas as callables. `secureOnCall` exige `request.app` validado pelo SDK quando `LUMUS_ENFORCE_APP_CHECK=true`. Inicialização Web compartilhada antes dos SDKs de negócio; nativo usa ponte CustomProvider com token/expiração reais e confere o projeto Android/iOS. | As 15 callables rejeitaram chamadas autenticadas sem atestado em teste local com enforcement ligado. Transporte separado, sem o bypass do Emulator, rejeitou token falsificado pelo SDK. Emissão real reCAPTCHA/Play Integrity/App Attest, configuração de Console e ativação remota gradual pendentes. Default do parâmetro permanece `false` até homologação. |
| S-08 | A exclusão direta somente do perfil foi removida. `requestAccountDeletion` registra solicitação autenticada `pending-retention-policy`, sem apagar parcialmente dados ou Auth. | **Política de retenção pendente**, por decisão do proprietário. Falta aprovar inventário, prazos e procedimento completo antes de executar exclusões; não apresentar a solicitação como exclusão concluída. |
| S-09 | Logout remove `pushDevices` antes de encerrar Auth e espera registro pendente; instalação recebe um único ID mesmo com registros concorrentes. Registros têm janela máxima de sete dias no remetente; corpo push é genérico. | Testes passaram para concorrência, callback tardio, troca A→B e falha/retry de revogação. Entrega push real em aparelho e encerramento implícito de sessão pendentes. |
| S-10 | Exportação nativa apaga PDF temporário no `finally` após compartilhar/imprimir, cancelar ou falhar. | Inspecionar cache e retorno do sistema de compartilhamento em Android/iOS. |
| S-11 | Dependência nativa de Analytics removida e coleta desativada em `firebase.json`, inclusive se surgir dependência transitiva. **Coleta desligada nesta versão**, conforme decisão do proprietário. | Novo build nativo e inspeção de manifesto/eventos em instalação limpa. |
| S-12 | Máximo de cinco membros, limite por ator antes das consultas e teto de 2.000 documentos por coleção. Consulta limitada a 2.001 detecta excesso e recusa o plano sem truncar silenciosamente. Oito coleções têm teto agregado de 16.008 documentos retornados por tentativa, além das leituras de autorização. | Teste com 2.001 documentos bloqueou a migração. Acima do teto é necessário procedimento offline revisado; quotas, orçamento e alertas remotos continuam pendentes. |

## Evidências locais — 2026-10-12

- `npm run check`: lint de estilos, typecheck e suite de testes do app. Os testes que exigem emuladores são executados separadamente; não interpretar skips como validações aprovadas.
- `npm --prefix backend run test:emulator`: Rules, perfis, relações, callables, migração em lotes, ajustes e 68 cenários do executor financeiro contra Auth/Firestore/Functions reais da Emulator Suite.
- `npm --prefix backend run test:app-check:emulator`: liga o parâmetro apenas no arquivo local de emuladores e restaura o conteúdo anterior no `finally`. Também executa o transporte SDK sem bypass. O Emulator não valida assinaturas reais de App Check.
- Web local: A e B sintéticos; isolamento de vínculos antigos, envio/aceite, logout A→B e revogação observados no navegador. Seed e revogação reproduzíveis por `backend/scripts/securityBrowserSeed.ts`, restrito aos hosts locais.
- Export Web/Android produz bundles JavaScript. Não equivale a APK/AAB instalado nem prova manifesto, limpeza de arquivos ou entrega de notificações no sistema operacional.

## Revisão final

A revisão pelos eixos Standards e Spec encontrou três regressões restantes: preferência de confiança recriada por gravação tardia; ajuste de saldo legado após o corte do proprietário; histórico de sincronização com valor anterior inventado/banco incorreto. As três foram corrigidas e receberam testes de regressão.

## Dependências

As dependências também foram auditadas. Atualizações compatíveis corrigem os alertas críticos de `proxy-addr`/`shell-quote`, o editor e o transporte gRPC. A versão corrigida de gRPC é fixada em override; o backend passa a ter lockfile e usa o mesmo SDK Firebase 12.19.0 nos testes, com Rules Unit Testing 5.0.2. Ainda existem alertas altos/moderados em outras dependências e ferramentas; sua triagem faz parte do gate de publicação. Não executar `audit fix --force`, que propõe mudanças incompatíveis com o baseline Expo/NativeWind/Tailwind. Ver o inventário em [[Validação de Segurança de Ponta a Ponta]].

## Publicação

Antes de publicar: exportar backup do Firestore e Rules atuais, comparar o diff de Rules, passar testes em Emulator Suite e validar Web/Android/iOS em homologação com contas sintéticas. Publicar Functions e Rules antes de atualizar clientes para o protocolo de convite/consentimento. Ver [[Processo de Release]]. A política de retenção e o plano de App Check requerem decisão e evidências próprias; os controles parciais não devem ser descritos como concluídos.

Relações criadas antes desse protocolo não têm concessões recíprocas e deixam de autorizar leitura compartilhada quando as novas Rules entrarem. As duas contas precisarão enviar/aceitar novamente o vínculo. Não gerar concessões automaticamente a partir das listas antigas: isso reproduziria o achado S-01.

O histórico confirmou que o preview antigo herdava produção (`eas.json` no commit `1d6d0d0`); um APK chamado preview não constituía Firebase isolado. Em 2026-10-11, a conta EAS `gabrielmazz` mostrava em `preview` somente `GOOGLE_SERVICES_JSON`; a CLI Firebase listava produção e três projetos de outros aplicativos. `.firebaserc` contém demo e produção, sem alias de homologação. A configuração atual recusa preview contra produção e aguarda provisionamento de projeto/variáveis próprios. A ferramenta Android oficial foi localizada/instalada temporariamente, mas `adb devices -l` não mostrou aparelho ou emulador conectado. Nenhum deploy remoto foi feito nesta remediação.
