# Etapa 02 — Critérios fornecidos pelo usuário

Origem: instrução do usuário em 08/11/2026. Base anterior: `ea9e261f97c68fb67d30f8ce15f708b65f605b5d` / `recovery/firebase-foundation-20261108`.

- Entregar código real e executável, não somente diagnóstico/documentação.
- Firebase continua; Spark sem faturamento é obrigatório. Não usar Functions, Run, Storage, SMS, extensões/backup/PITR pagos. Consultar fontes oficiais atuais.
- Preservar usuários reais, UIDs, documentos, saldos e histórico. Investigar configuração, coleções, formatos, grupos e Rules publicados por meios autorizados. Nenhuma escrita experimental, migração, exclusão, deploy, mudança de plano ou Rules remotas nesta etapa.
- Preservar frontend, telas, componentes, rotas, layout, estilos e variantes mobile/web.
- Fundação simples, responsabilidades lógicas de apresentação/aplicação/domínio/persistência, sem reconstruir complexidade antiga ou todos os módulos.
- Implementar configuração limpa, Auth login/cadastro/logout/reset/sessão, perfis existentes/incompletos, contratos mínimos, erros centrais, integração mínima de UI e execução local.
- Auth cliente não é fronteira de segurança; autorização/invariantes devem ser protegidos por Rules. Não simular integridade financeira ainda ausente.
- Isolar todos os testes em Emulator Suite. Fixtures novas/legadas/incompletas/grupos/relacionamentos/documentos financeiros/ataques.
- Executar testes de inicialização, Auth, perfil, compatibilidade, permissões, isolamento, erros, transações implementadas e frontend.
- Limitar leituras, carregar por demanda, paginar, evitar scans/listeners e preparar diagnóstico/estimativas sem prometer cotas infinitas.
- Investigar exportação/recuperação externa gratuita. Não afirmar backup real validado sem integridade e restauração verificadas.
- Relatar resultados, evidências, riscos, pendências e limitações sem declarar produção pronta. Próximos módulos: bancos/saldo inicial, categorias, receitas/despesas, movimentos, extratos e dashboard após contexto/identidade.
