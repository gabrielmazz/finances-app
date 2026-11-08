---
tags: [frontend, arquitetura]
relacionado: [[MOC - Lumus Finanças]], [[Remoção do Backend]]
status: ativo
tipo: arquitetura
versao: 3.0.0
---

# Hooks Customizados

`useScreenStyle`, `useKeyboardAwareScroll`, ícones e comportamento de navegação continuam sendo ferramentas de interface. Hooks de consulta agora expõem dados ausentes, carregamento encerrado e erro de indisponibilidade. Não executam requisições nem restauram cache financeiro.

`useSession` fornece usuário ausente; `useAssistantAvailability` fornece estado indisponível sem executar comandos ou fabricar conversa. Hooks de formulário mantêm somente campos e feedback visual. Os hooks específicos do protocolo antigo foram removidos. Não reintroduzir SDKs dentro de hooks de apresentação.
