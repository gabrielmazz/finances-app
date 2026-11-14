# Etapa 07 — índice de saques para publicação isolada

**Publicado mediante autorização específica em 14/11/2026.** Índice `CICAgJiHgokK`, estado `READY`; não executar novamente o comando de criação.

## Consulta e índice

O extrato e a Home usam `readMovementTimeline` em `firebase/movements.ts` para consultar a coleção raiz `cashRescues`, filtrada pelo `personId` autenticado e pelo intervalo de `date`, com `orderBy('date', 'desc')`, `orderBy(documentId(), 'desc')`, `limit(20)` e `startAfter(data, id)` nas páginas seguintes. O banco é filtrado no cliente dentro de cada página autorizada. Campos de grupo explícitos continuam excluídos pelo cliente. O filtro por data não recupera documentos que não tenham `date` válida.

Antes da publicação, no projeto `finances-app-e8685`, banco `(default)`, a leitura de metadados identificou em 14/11/2026 estes índices compostos `READY` de `cashRescues`, ambos com escopo `COLLECTION`:

- `bankId ASC, personId ASC, date ASC, __name__ ASC`;
- `personId ASC, date ASC, __name__ ASC`.

O índice necessário, também definido em `firestore.indexes.json`, é:

```json
{
  "collectionGroup": "cashRescues",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "personId", "order": "ASCENDING" },
    { "fieldPath": "date", "order": "DESCENDING" },
    { "fieldPath": "__name__", "order": "DESCENDING" }
  ]
}
```

O índice ascendente existente não entrega a ordenação descendente com a mesma consulta. `limitToLast` sobre a ordem ascendente também não é uma alternativa: o SDK Firestore instalado inverte os sentidos ao construir a consulta enviada ao servidor. Ler todas as páginas ascendentes antes de mostrar as mais recentes violaria o requisito de paginação sob demanda. O fallback atual usa a ordem ascendente apenas quando há menos de 20 resultados; com uma página cheia, avisa que a lista de saques está incompleta e solicita período menor.

## Registro da publicação isolada

A criação autorizada foi executada uma única vez pela operação Firestore Admin `indexes.create` no pai `projects/finances-app-e8685/databases/(default)/collectionGroups/cashRescues`. A listagem passou de 26 para 27 índices: somente `CICAgJiHgokK` foi adicionado; nenhum índice anterior foi removido ou teve a definição modificada. O faturamento permaneceu desativado e o hash das Rules publicadas permaneceu `8673e2d0d47641cf787484013a418b642442595994bdcbcbb0e9091c5f6179c8`. Nenhum documento financeiro foi modificado por esta operação.

O comando abaixo documenta a operação equivalente; **não deve ser executado novamente**. Não usar `firebase deploy --only firestore:indexes` com o arquivo completo do projeto: ele contém outros índices. O Google Cloud CLI não está instalado no ambiente atual:

```bash
gcloud firestore indexes composite create \
  --project=finances-app-e8685 \
  --database='(default)' \
  --collection-group=cashRescues \
  --query-scope=collection \
  --field-config=field-path=personId,order=ascending \
  --field-config=field-path=date,order=descending \
  --field-config=field-path=__name__,order=descending
```

A criação alterou metadados e estruturas de índice, abrangendo documentos elegíveis da coleção, sem alterar os documentos financeiros ou publicar Rules. A operação utilizou autorização administrativa somente para criar o índice; o aplicativo permanece sem essas credenciais e utiliza suas Rules existentes.

## Custo e validação

O banco foi identificado como Firestore Standard elegível à faixa gratuita, com faturamento desativado. A listagem passou de 26 para 27 índices compostos, abaixo do limite documentado de 200 para projetos sem faturamento. Antes da criação, a métrica de armazenamento de dados e índices disponível indicava aproximadamente 6 MB, dentro do limite compartilhado de 1 GiB. O tamanho adicional depende dos documentos elegíveis. Consulte [cotas](https://firebase.google.com/docs/firestore/quotas), [armazenamento](https://firebase.google.com/docs/firestore/pricing) e [cálculo de entradas](https://firebase.google.com/docs/firestore/storage-size).

Após atingir `READY`, a consulta descendente foi executada com sucesso pela sessão oficial em modo somente leitura, sem usar o fallback ascendente. A página consultada não retornou saques: a aparência e a paginação real de múltiplos saques não puderam ser verificadas com essa consulta. O usuário informou que um saque conhecido pertence a uma conta vinculada; a sessão atual não apresentou autorização protegida verificável para outro titular ou grupo. A conta vinculada e seus dados não foram consultados e nenhuma permissão foi alterada. Os testes no emulador verificam 45 saques, três páginas, empates e ausência de duplicações. A consulta não alterou saldos ou documentos.

O Firestore Emulator não verifica a existência dos índices compostos: os testes locais comprovam consulta, paginação e Rules, mas não a criação, o estado ou o uso do índice em produção. Ver [limitações do emulador](https://firebase.google.com/docs/emulator-suite/connect_firestore).
