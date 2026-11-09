# Etapa 03 — especificação recebida do usuário

Base de revisão: `e86a55f86754ddcda1acbf83f8accdd2932cf423` (tag `recovery/security-stage03-20261108`). Revisar alterações de trabalho, incluindo arquivos novos.

- Concluir implementação local de segurança, autenticação/perfis e preservação/recuperação. Nenhum módulo financeiro novo.
- Manter Firebase Spark, frontend, UIDs e dados reais; sem Functions/Run/Storage/SMS/PITR/serviços pagos.
- Não publicar Rules, efetuar deploy, modificar contas, executar migrações ou escritas experimentais em produção.
- Auditar Rules realmente publicadas quando autorizado; documentar coleção/operação e incompatibilidades dos clientes publicados com evidências.
- Rules propostas: negar por padrão, autenticação obrigatória, isolamento de perfil/dados financeiros, compartilhamento somente autorizado, sem autoassociação ou manipulação de permissões. Criar/atualizar/excluir separados.
- Testar emuladores: acessos próprios/terceiros/visitantes, perfis ausentes/incompletos/antigos, grupos, consultas/filtros/limites, campos sensíveis, lotes/transações/legados e negações.
- Implementar exportação controlada compatível com Spark: caminhos/tipos/IDs/subcoleções, orçamento, falhas/completude/hash, confidencialidade e prevenção de sobrescrita; sem dados reais/credenciais no Git.
- Implementar restauração somente isolada e comprovar equivalência de caminhos/tipos/relacionamentos/valores/UID e leitura pela aplicação. Se não houver autorização para exportação real, validar com sintéticos e declarar a pendência real.
- Validar login/cadastro/logout/reset/sessão persistida/reinício/perfis existentes sem recriar contas ou conceder vínculos automaticamente; testes sem credenciais reais.
- Compilar/inicializar e verificar UI preservada e erros de permissão. Documentar limites de execução nativa e versões mobile não identificadas.
- Preparar publicação exata, evidências, compatibilidade, impacto, monitoramento, interrupção, verificação e reversão segura. Solicitar autorização específica somente com pacote local pronto. Não declarar vulnerabilidade produtiva corrigida sem publicação/verificação.
- Distinguir Implementado, Validado e Publicado. Não declarar conclusão integral quando faltar backup real validado, homologação ou autorização.
