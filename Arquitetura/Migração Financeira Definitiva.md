---
relacionado: [[Gerenciamento de Bancos]], [[Gerenciamento de Tags]], [[Dashboard Home]], [[Segurança e Preparação para Produção]], [[Processo de Release]]
---

# Migração Financeira Definitiva

## Modelo canônico

O namespace `financialContexts/{personal:uid|group:gid}` reúne as subcoleções `bankAccounts`, `accountOpenings`, `categories`, `movements` e `mandatoryTemplates`. Os UIDs, perfis em `users`, grupos em `financialGroups` e autorizações administrativas em `_authorizations` continuam nas origens atuais. As Rules da candidata autorizam acesso pelo contexto no caminho. Grupos exigem participação ativa, grant e claim de mesma geração. A escrita de grupo exige o papel de administrador. O grant legado `readOwners` mantém seu escopo no cliente legado. O inventário oficial de 18/11 não encontrou grupos nem grants protegidos que exigissem migrar esse acesso.

| Origem | Tratamento |
|---|---|
| `banks`, `financialGroups/*/accounts` | Conta canônica. A referência já comprovada é preservada. A conta sem abertura pode ser lida, fica sem saldo e exige preparação pelo titular. |
| `tags`, `financialGroups/*/tags` | Categoria canônica. Categoria sem tipo mantém `usageType: null` e fica fora dos seletores de novos lançamentos até edição. |
| `gains`, `expenses`, `cashRescues`, `financialGroups/*/movements` | Histórico com valor em centavos, status, instante e relação com conta ou ausência explícita de conta. O saque tem operação própria. |
| `bankTransfers` e as duas pontas | Uma correspondência com duas pontas vinculadas. Cada uma conserva data e valor. O par fica fora do total de receitas e despesas. |
| `mandatoryExpenses`, `mandatoryGains` | Modelo canônico e, quando o movimento e o ciclo estão comprovados, correspondência com `movements/{templateId}-AAAA-MM`. |
| `monthlyBalances`, investimentos e documentos administrativos | Preservados na origem e no backup. O saldo mensal legado é evidência histórica. A preparação exige confirmação separada de um saldo e instante reais. |

Os IDs válidos permanecem quando o contrato de operações permite. IDs legados fora desse formato usam hash determinístico do caminho, com detecção de colisão. A segunda ponta de uma transferência e a confirmação de ciclo usam os IDs exigidos pelo modelo canônico. O manifesto cifrado conserva caminhos originais, destinos, revisões, classificações, relações, impacto histórico e documentos completos. As projeções históricas carregam `historicalSourcePath`. Movimentos já migrados são imutáveis para o cliente e a sua cópia não ajusta saldos.

## Autoridade e revisão

A correspondência entre `personId` e um UID Auth é uma evidência, complementada por vínculo protegido, caminho de grupo autorizado ou relações verificadas com entidades já associadas. Uso anterior, perfil, vínculos pessoais históricos e campos de grupo declarados no documento não concedem acesso por conta própria. A ferramenta bloqueia criação quando detecta associação contraditória, vínculo revogado, relação ausente ou destino incompatível. Lançamentos pendentes ou de ajuste cuja interpretação não está comprovada permanecem em revisão.

O arquivo de decisões individuais é JSON privado, fora do repositório e com permissão 0600. Cada entrada contém `path`, `sourceHash`, `scope: { kind, id }`, `ownerUid` e `evidence`. O hash vincula a decisão à revisão exata do documento. O operador guarda esse arquivo em área privada e o entrega ao comando com `--reviews`. Conflitos com UID conhecido, grupos declarados, vínculos protegidos ou dependências verificadas continuam bloqueados. O [relatório de 20/11](../docs/mvp160-conciliacao.md) detalha as causas e os grupos de revisão.

Quando dois contextos pessoais comprovados devem permanecer separados, uma decisão por banco e categoria pode preservar o rótulo histórico no contexto da movimentação. `--category-reviews` recebe JSON privado com `categoryPath`, `categoryHash` e `evidence`, além de `bankPath` e `bankHash` quando a conta comprova o contexto. A movimentação precisa ter UID declarado compatível com a conta verificada e referências sem contradições. Para o dinheiro explicitamente sem banco, a decisão usa `cashOwnerUid` e a lista fechada de `cashMovements` com `path` e `sourceHash` de cada lançamento cuja titularidade foi confirmada. O plano projeta ou reaproveita a categoria arquivada com origem preservada, sem mudar as categorias ativas nem tocar saldos. Transferências e ciclos obrigatórios mantêm suas próprias verificações. O corte exige a revisão do escopo e do manifesto que inclui essas decisões.

Um modelo obrigatório com último pagamento em dinheiro confirmado pode ter uma categoria futura escolhida pelo titular. A decisão de categoria recebe `templatePath` e `templateHash` e aponta para uma categoria ativa e compatível do mesmo contexto pessoal. O modelo e o pagamento são reconciliados juntos. O vínculo de ciclo, a data, o valor, o banco nulo e a categoria histórica do pagamento são preservados. Novas ocorrências usam a categoria ativa escolhida.

Quando o banco realmente utilizado está confirmado e a autoria pertence a outro contexto pessoal, a decisão por banco recebe uma lista fechada de `bankMovements` com `path` e `sourceHash`. A ferramenta valida o banco já associado, a categoria histórica e o UID do autor. A cópia fica no contexto da conta confirmada e preserva a autoria original. As permissões, os saldos atuais e a propriedade dos documentos de origem são mantidos.

## Operação

A ferramenta TypeScript fica em `script/financial-migration.ts`, fora do bundle. `inventory` e `dry-run` em projeto real exigem backup atual cifrado. A chave fica em diretório privado separado. A captura usa um `readTime` comum com paginação integral e compara cada coleção com uma agregação independente. A recuperação grava apenas em emulador isolado e confere caminhos, campos, tipos e hashes. A restauração recebe novos metadados internos de criação e atualização do Firestore. Os originais permanecem no arquivo e são usados para detectar alterações. [Listagem do Firestore](https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents/listDocuments)

Execute o comando em processo protegido seguindo [[Homologação e Recuperação da Etapa 03]]. Use caminhos absolutos e forneça o token administrativo curto por canal privado, sem logs. O modo omitido é `dry-run`.

```bash
npm run migration:financial -- dry-run --project "$LUMUS_PROJECT" --run "$LUMUS_RUN" \
  --backup "$LUMUS_ARCHIVE" --identities "$LUMUS_AUTH_ARCHIVE" --key "$LUMUS_KEY" \
  --manifest "$LUMUS_MANIFEST" --review-report "$LUMUS_REVIEW_REPORT"

npm run migration:financial -- review --project "$LUMUS_PROJECT" --run "$LUMUS_RUN" \
  --key "$LUMUS_KEY" --review-report "$LUMUS_REVIEW_REPORT"
```

`--review-report` conserva uma revisão agrupada cifrada, com o impacto condicional de cada associação. O comando `review` recria a visualização local em tmpfs. `--preserve-exceptions` recebe uma lista privada com `path`, `sourceHash` e `evidence` para cada origem comprovadamente preservada como exceção. A disposição mantém todos os campos na origem e exclui a projeção. O manifesto aprovado vincula cada disposição à captura, inclusive os itens de transferências e ciclos que precisam permanecer juntos. Uma projeção não conciliada ou um documento canônico inválido impede a aplicação. A contagem por coleção distingue origem transformada, preservação na origem, exceção, destino existente e pendência.

`apply` exige a confirmação `PROJECT:RUN:apply`, aprovação específica com hash do manifesto e titulares/contextos permitidos, recibo de restauração da captura com até 24 horas e janela administrativa sem escritores. No projeto oficial, `apply` e `resume` verificam Spark e exigem o hash exato das Rules de transição do manifesto. Em homologação, o ensaio de migração remota exige `security/containment.rules`. A cada lote, precondições conferem as revisões das origens. Os lotes criam destinos somente quando ausentes e mantêm pares e ciclos juntos. O diário privado registra o lote em andamento e as revisões retornadas. `resume` usa o mesmo manifesto, recibo e diário após a aplicação inicial e exige a confirmação da retomada.

`verify` compara origens, identidades e todos os campos dos destinos em uma captura com instante fornecido pelo servidor. `verify --release-view canary|canonical --client-readiness CAMINHO --approval APROVACAO` exige migração verificada, Spark, Rules com o hash correspondente do manifesto e os dois índices canônicos em `READY`. Emite o recibo do cliente em arquivo privado. `rollback` exige o recibo restaurado, a confirmação `PROJECT:RUN:rollback` e prova de que a escrita canônica continua fechada. Restaure primeiro as Rules exatas da Etapa 03 se o canário estiver publicado. O rollback reverte apenas os destinos criados, com precondição de revisão, em ordem inversa. Escritas inesperadas exigem recuperação supervisionada.

## Corte e ativação oficial

1. Aprovar o manifesto que identifica separadamente as criações, as exceções preservadas, as duas fontes de Rules e os dois índices. Confirmar Spark, a cópia restaurada atual e a pausa dos escritores administrativos. As Rules da Etapa 03 mantêm as gravações financeiras de clientes fechadas.
2. Criar somente os índices autorizados, individualmente, e conferir `READY`. Gerar as fontes por `node script/financial-release-rules.cjs` e publicar o canário aprovado. A fonte conserva as permissões de leitura legadas já publicadas e abre a leitura canônica por contexto. A escrita financeira de clientes continua fechada.
3. Aplicar e verificar o manifesto com as Rules de transição ativas. Emitir o recibo `--release-view canary` e usá-lo para compilar o cliente somente leitura.
4. Conferir os dois logins, bancos, categorias, histórico autorizado e paginação no canário. Conferir também as consultas ainda usadas pelos clientes em circulação. As listas de obrigatórios no canário permanecem verificáveis pelo SDK. A Web mostra o painel de próximos compromissos. Após validar as leituras e a substituição das versões antigas, publicar a candidata canônica final e emitir o recibo `--release-view canonical` antes de iniciar operações financeiras.
5. Incorporar o recibo verificado a `firebase/production-readiness.json`. Preparar Web e APK com o mesmo identificador e assinatura da instalação existente. O titular confirma, em cada conta antiga, saldo bancário e instante de referência a partir de `referenceNotBefore`, com conferência de operações pendentes. A abertura é gravada no mesmo ID com esse saldo. Para lançar no mesmo dia, o titular informa o horário em São Paulo com precisão de minuto, estritamente posterior à referência.
6. Conferir saldo, Home, extrato e operações autorizadas dos dois logins na Web e no Android. Retirar os leitores legados do código ativo depois da comprovação. Manter a origem e as ferramentas administrativas de recuperação. O roteiro e os hashes ficam no [manifesto de corte](../docs/mvp160-corte.md).
