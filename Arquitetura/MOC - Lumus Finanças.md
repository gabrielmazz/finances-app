---
tags: [frontend, arquitetura]
relacionado: [[MOC - Lumus Finanças]], [[Remoção do Backend]]
status: ativo
tipo: arquitetura
versao: 3.0.0
---

# MOC - Lumus Finanças

O frontend preservado em [[Remoção do Backend]] recebeu a [[Fundação Firebase Spark]] da etapa 02: Auth/perfis e Rules locais, sem módulos financeiros nem produção liberada. A etapa 03 está em [[Segurança e Preparação para Produção]]: Rules publicadas com autorização em 09/11 e recuperação isolada de cópia real Firestore comprovada; sem distribuição do novo frontend ou módulos financeiros. Finalização, homologação real, observação contínua e recuperação Auth em [[Homologação e Recuperação da Etapa 03]].

## Módulos visuais
- [[Autenticação]]
- [[Dashboard Home]]
- [[Gerenciamento de Bancos]]
- [[Transações de Despesas]]
- [[Transações de Receitas]]
- [[Despesas Fixas]]
- [[Receitas Fixas]]
- [[Investimentos]]
- [[Monitoramento de Investimentos]]
- [[Transferências]]
- [[Resgate de Caixa]]
- [[Balanço Mensal]]
- [[Ajuste de Saldo]]
- [[Análise por Categoria]]
- [[Previsão de Fluxo de Caixa]]
- [[Gerenciamento de Tags]]
- [[Gerenciamento de Usuários]]
- [[Perfil do Usuário]]
- [[Anotações Locais]]
- [[Assistente Lumus]]
- [[Configurações]]
- [[Notificações]]

## Estrutura e apresentação
[[Organização do Código]], [[Navegação]], [[Componentes UI]], [[Componentes por Sistema]], [[Sistema de Temas]], [[Hooks Customizados]], [[Privacidade de Valores]], [[Visibilidade de Rotas]], [[Comportamento Pós-Registro]], [[Versão Web]], [[Processo de Release]] e [[Auditoria de Design]].

## Etapa04

[[Gerenciamento de Bancos]] e [[Dashboard Home]] recebem contas/abertura reais no emulador, sem migração ou publicação. Evidências, limites e ativação controlada em `docs/stage-04-report.md`. Outros módulos financeiros permanecem indisponíveis.
