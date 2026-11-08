---
tags: [frontend, arquitetura]
relacionado: [[MOC - Lumus Finanças]], [[Remoção do Backend]]
status: ativo
tipo: arquitetura
versao: 3.0.0
---

# Navegação

As rotas físicas Web/mobile e o registro `APP_ROUTE_PATHS` em `utils/navigation.ts` foram preservados. A entrada `/` abre o login visual; “Explorar telas” permite acessar a Home sem autenticação. “Sair” retorna ao login, sem alegar encerrar uma sessão remota.

`components/app/app-root.tsx` monta fontes, tema, primitivas, alertas e o Stack. Não inicializa serviços. `utils/appRouteGuards.ts` limita o grupo à plataforma ativa e respeita a visibilidade local; esses guards são de interface e não implementam autorização.

Permanecem a barra nativa, a rail Web, histórico, retorno físico e transições. As 82 entradas de rota e 51 arquivos de tela são conferidos contra o inventário anterior. Preferências de visibilidade usam um namespace novo e começam abertas; a configuração anterior foi preservada. Ver [[Visibilidade de Rotas]].
