---
tags: [frontend, arquitetura]
relacionado: [[MOC - Lumus Finanças]], [[Remoção do Backend]]
status: ativo
tipo: arquitetura
versao: 3.0.0
---

# Hooks Customizados

`useScreenStyle`, `useKeyboardAwareScroll`, ícones e comportamento de navegação continuam sendo ferramentas de interface. Hooks de consulta agora expõem dados ausentes, carregamento encerrado e erro de indisponibilidade. Não executam requisições nem restauram cache financeiro.

`useSession` consome `SessionContext`, com Auth/perfil compartilhado e descarte de respostas antigas. `useAccountAccess`, `useUserProfile` e `useLogoutConfirmation` chamam a nova fundação, sem importar SDKs. `useAssistantAvailability` e os módulos financeiros permanecem indisponíveis, sem executar comandos ou fabricar conversa. Os hooks específicos do protocolo antigo continuam removidos. Ver [[Fundação Firebase Spark]].
