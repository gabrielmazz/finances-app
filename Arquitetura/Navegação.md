---
tags: [frontend, arquitetura]
relacionado: [[MOC - Lumus Finanças]], [[Remoção do Backend]]
status: ativo
tipo: arquitetura
versao: 3.0.0
---

# Navegação

As rotas físicas Web/mobile e o registro `APP_ROUTE_PATHS` em `utils/navigation.ts` foram preservados. A entrada `/` recupera a sessão e abre Home ou login. Workspace requer usuário do Auth; links diretos sem sessão voltam ao login. “Continuar no workspace” aparece para uma sessão existente; visitantes precisam entrar. “Sair” aguarda o logout real antes de navegar; falha fica explícita. Autorização de documentos é responsabilidade das Rules, não dos guards. Ver [[Fundação Firebase Spark]].

`components/app/app-root.tsx` monta fontes, tema, primitivas, alertas e o Stack. Não inicializa serviços. `utils/appRouteGuards.ts` limita o grupo à plataforma ativa e respeita a visibilidade local; esses guards são de interface e não implementam autorização.

Permanecem a barra nativa, a rail Web, histórico, retorno físico e transições. As 82 entradas de rota e 51 arquivos de tela são conferidos contra o inventário anterior. Preferências de visibilidade usam um namespace novo e começam abertas; a configuração anterior foi preservada. Ver [[Visibilidade de Rotas]].
