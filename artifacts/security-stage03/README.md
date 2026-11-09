# Evidências da etapa 03

Registro da entrega local de 08/11. Em 09/11, após autorização, Rules e recuperação real foram concluídas: ver [publicação atual](../security-publication-20261109/). O resumo de validação deste diretório mantém o estado histórico anterior à publicação. Fontes/detalhes no [relatório da etapa 03](../../Arquitetura/Seguran%C3%A7a%20e%20Prepara%C3%A7%C3%A3o%20para%20Produ%C3%A7%C3%A3o.md).

- [Resumo de validação](validation-summary.json): 98 testes unitários, 114 integrações, 50 verificações de rotas e cinco fluxos, exports Web/Android/iOS.
- [Resultados individuais da integração](integration-results.json), [Rules e contenção](rules-test-evidence.json).
- [Matriz executada](compatibility-matrix.md) e [dados da matriz](compatibility-matrix.json): 90 cenários comparando Rules publicadas e propostas em emuladores.
- [Recuperação sintética](restoration-proof.json): 26 documentos, hashes iguais, UID preservado e referências locais interpretadas pelo aplicativo. **Não é evidência de backup real.**
- [Reinício do navegador](session-restart.json) e [rotas/fluxos](browser-validation.json). PNGs contêm somente contas/dados sintéticos.
- [Inspeção inicial](inspection.json), [rechecagem real somente leitura](production-readonly.json), [Rules efetivamente publicadas](published-rules.txt) e [JS público inspecionado](published-client-inventory.json). Sem documentos financeiros, credenciais ou UIDs reais.
- [Manifesto exato de publicação](release-manifest.json): hash do candidato, contenção, comandos preparados e status aguardando autorização. Nenhum comando de deploy foi executado.
- [Audit de dependências de produção](dependency-audit.json): nenhuma alta/crítica, cinco moderadas herdadas da stack; nenhuma dependência nova nesta etapa.
- [Revisão independente e correções](../../docs/review-security-stage03.md).

Para atualizar o resumo depois de executar os testes, guardar os logs fora do Git e executar:

```bash
npm run security:evidence -- CHECK_LOG INTEGRATION_LOG WEB_EXPORT_LOG NATIVE_EXPORT_LOG
```

O coletor valida contagens/artefatos e não persiste logs brutos do emulador, links de reset ou tokens. A vulnerabilidade registrada é a do estado anterior; o candidato foi publicado e a cópia real recuperada em 09/11. Homologação mobile, contas Auth no backup e distribuição do novo cliente continuam fora das provas concluídas.
