# Revisão independente — etapa 03

Base fixa: `e86a55f86754ddcda1acbf83f8accdd2932cf423`, tag `recovery/security-stage03-20261108`. Revisão do worktree e arquivos novos; sem commits intermediários. Especificação direta do usuário registrada em `docs/stage-03-spec.md`. A skill `code-review` foi aplicada com dois agentes independentes; não dependeu de issue externa.

## Standards

Dois achados P2, corrigidos:

1. Snapshots v1 não possuem `scannedDocuments`. O CLI calculava `NaN` como orçamento de verificação depois de restaurar. Agora conta documentos e ancestrais ausentes; teste executa o CLI criptografado v1 com órfão, reexporta e exige igualdade. A comparação ordena caminhos antes de calcular hash, evitando falso conflito por ordem diferente de uma cópia válida.
2. A leitura GCM aceitava tags truncadas, reduzindo a autenticação. Agora exige nonce 12/tag 16 e `authTagLength:16`; regressões rejeitam tags 4/8/12 e nonce inválido. O revisor reproduziu e confirmou o fechamento do problema.

Nenhuma outra violação concreta de preservação visual ou reintrodução de protocolos antigos foi identificada. Nenhuma heurística de smell adicional justificou alteração.

## Spec

Um achado P2, a mesma falha v1 acima, encerrado. A revisão final também confirmou que documentos e artefatos distinguem implementado, validado localmente e publicado; não ocultam backup real/Auth, binários instalados e homologação pendentes. Nenhum novo achado na revisão final.

## Revalidação

`npm run check`: 19 suítes/98 testes, tipos e estilos aprovados. Integração: 114/114, incluindo CLI v1 criptografado, interrupção da recuperação, redefinição completa de senha preservando UID e negações de acesso. Matriz: 90 cenários. Navegador: 50 rotas e cinco fluxos, sem erros inesperados ou requisições externas. Fontes exatas, hashes e detalhes em `artifacts/security-stage03/`.

Dois achados no eixo Standards e um no Spec; dois defeitos distintos, ambos corrigidos. Revisão não equivale a publicação, teste em aparelho ou backup real validado.

## Finalização e homologação — 09/11

Revisão incremental independente nos dois eixos, sobre o mesmo ponto fixo e `docs/stage03-final-spec.md`; sem acesso dos revisores a arquivos privados ou rede.

**Standards:** dois achados corrigidos. Erros ADB podiam imprimir argumentos/identificadores; agora pipes e captura sanitizada. Chromium reinicializa dumpability em exec; guarda própria em todos os processos, verificada sem ler memória e com controle positivo/negativo, passou na interface sem credenciais. Os oito cenários funcionais reais ocorreram antes dessa última correção; não se atribui a eles retroativamente a prova da guarda. Nenhum dump/crash foi observado. Revisão incremental final: nenhum novo achado concreto.

**Spec:** um achado corrigido: paginação parcial das métricas ainda permitia total numérico incompleto. Agora o total é desconhecido e a regressão simula falha na segunda página. Outra regressão impede dupla contagem entre recursos Datastore/Firestore. Revisão final confirmou evidências de observação monotônica (com diferença do relógio civil declarada), recuperação 987/987, Auth cifrado e Web real. Nenhum novo achado concreto. Homologação física não pode ser inferida da conexão ADB.

Validação corrente: 21 suítes/105 testes unitários, tipos/estilos, 115 integrações, 50 verificações de rota/cinco fluxos de navegador e exports Web/Android/iOS aprovados. Restauração do destino aprovado e teste negativo da guarda Java passaram. Estado real, inclusive limitações e aparelho, em `Arquitetura/Homologação e Recuperação da Etapa 03.md` e `artifacts/stage03-final/validation-summary.json`.

## Revisão da homologação física

Standards: achado de evidência encerrado — o recibo diferencia credenciais não inseridas pela automação, login informado pelo proprietário e transição inicial não capturada. Spec: achado encerrado — reconexão encerra/reabre o processo e exige leitura fresca do perfil, descartando a cópia em memória. Revisões incrementais finais sem novo defeito concreto. A única correção de UI mantida encaminha aria-label/accessibilityLabel; rótulos foram conferidos no aparelho e estilos/tipos/105 testes passaram.

Os oito cenários físicos foram consolidados em duas sequências: seis verificações pós-login e duas verificações automáticas após a saída manual. A limitação do toque automatizado do menu está registrada; não se afirma uma execução integralmente automática. Experimentos de host do menu foram revertidos. A guarda de preservação aceita somente a correção declarada de InputField; telas/rotas/assets/tokens e navegação não foram redesenhados.

Revisão final do observador de logout e do consolidado assistido: Standards e Spec sem novos achados concretos. Login inicial não capturado, ações manuais, falha anterior preservada e limites de recuperação permanecem explícitos. Nenhum arquivo privado, aparelho ou rede foi acessado pelos revisores.
