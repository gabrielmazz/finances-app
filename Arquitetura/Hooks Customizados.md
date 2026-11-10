---
tags: [frontend, arquitetura]
relacionado: [[MOC - Lumus Finanças]], [[Remoção do Backend]]
status: ativo
tipo: arquitetura
versao: 3.0.0
---

# Hooks Customizados

`useScreenStyle`, `useKeyboardAwareScroll`, ícones e comportamento de navegação continuam sendo ferramentas de interface. Hooks dos módulos ainda não reconstruídos expõem indisponibilidade explícita. `useBankAccountForm` coordena validação, intenção persistida, recuperação e salvamento; `useBankAccountDetails` coordena consulta/edição/arquivamento. Ambos usam `firebase/banks.ts`, sem SDK em componentes visuais. `useHomeScreenData` lê o contexto compartilhado de bancos, com descarte de respostas de outra sessão e total protegido contra páginas incompletas. Ver [[Gerenciamento de Bancos]].

`useSession` consome `SessionContext`, com Auth/perfil compartilhado, revalidação por atualização de token e descarte de respostas antigas. Erro de contexto permanece separado do perfil privado e aparece no aviso global. `useAccountAccess`, `useUserProfile` e `useLogoutConfirmation` chamam a nova fundação, sem importar SDKs. `useAssistantAvailability` e os demais módulos financeiros permanecem indisponíveis, sem executar comandos ou fabricar conversa. Os hooks específicos do protocolo antigo continuam removidos. Ver [[Segurança e Preparação para Produção]] e [[Fundação Firebase Spark]].
