---
tags: [frontend, arquitetura]
relacionado: [[MOC - Lumus Finanças]], [[Remoção do Backend]]
status: ativo
tipo: arquitetura
versao: 3.0.0
---

# Autenticação

Login, cadastro e recuperação mantêm seus formulários Web/mobile. Todas as solicitações de acesso estão indisponíveis. “Explorar telas” abre o workspace sem autenticar ou criar identidade. `hooks/useSession.ts` retorna usuário ausente; não existe provider de autenticação.

## Arquivos de apresentação

LoginScreen em `screens/mobile/` e, quando existente, `screens/web/`. Os adaptadores em `app/` e os componentes usados por essas telas permanecem no projeto.

Ver [[Remoção do Backend]] para recuperação, validação e limites atuais.
