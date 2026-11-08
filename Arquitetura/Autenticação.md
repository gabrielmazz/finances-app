---
tags: [frontend, arquitetura]
relacionado: [[MOC - Lumus Finanças]], [[Remoção do Backend]]
status: ativo
tipo: arquitetura
versao: 3.0.0
---

# Autenticação

Login, cadastro, recuperação e logout mantêm os formulários Web/mobile e usam Auth oficial no Emulator Suite. `SessionContext` observa uma sessão, compartilha perfil e descarta respostas de contas anteriores. Persistência Web local/nativa AsyncStorage pelo SDK. Workspace protegido; acesso anônimo não abre telas de dados.

Cadastro é do próprio usuário desconectado, com perfil mínimo transacional. Falha após criar Auth preserva conta/UID; conclusão do perfil ocorre explicitamente em Meu perfil. Contas legadas entram pelo UID existente, sem recadastro/migração. Mensagem de reset não revela existência da conta. Nenhuma senha/token é registrada no diagnóstico.

O novo cliente só aceita o projeto demo local. A inspeção encontrou Rules de produção permissivas, ainda não alteradas; a liberação de produção depende de revisão/transição autorizada. Testes de contas/UIDs legados são sintéticos, sem login experimental remoto. Detalhes: [[Fundação Firebase Spark]].

## Arquivos de apresentação

LoginScreen em `screens/mobile/` e, quando existente, `screens/web/`. Os adaptadores em `app/` e os componentes usados por essas telas permanecem no projeto.

Ver [[Remoção do Backend]] para recuperação, validação e limites atuais.
