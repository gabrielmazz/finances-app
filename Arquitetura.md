# Arquitetura.md — Lumus Finanças

Leia este guia antes de alterar o projeto. O vault `Arquitetura/` descreve a base atual; o histórico da arquitetura encerrada está no ponto de recuperação, fora do código ativo.

## Estado atual

Frontend Expo 57 / React Native 0.86 / React 19.2 / TypeScript 6. Não existe backend, autenticação, autorização, persistência financeira, sincronização, executor de chat ou integração de nuvem. Nenhuma tecnologia para a reconstrução foi escolhida.

A entrada mantém o login visual. “Explorar telas” abre o workspace sem autenticar. Não criar usuário fictício, dados de demonstração ou retornos de sucesso para funcionalidades indisponíveis. O aviso global e os estados de dados devem ser claros e não bloquear navegação.

## Mapa de trabalho

- Visão geral e módulos: [[MOC - Lumus Finanças]].
- Escopo, inventário, recuperação e verificações da limpeza: [[Remoção do Backend]].
- Código e rotas: [[Organização do Código]], [[Navegação]], [[Visibilidade de Rotas]].
- UI e temas: [[Componentes UI]], [[Componentes por Sistema]], [[Sistema de Temas]], [[Auditoria de Design]].
- Estados e preferências: [[Hooks Customizados]], [[Privacidade de Valores]], [[Comportamento Pós-Registro]].
- Execução local: [[Versão Web]], [[Processo de Release]].
- Telas de domínio: consulte o documento do mesmo módulo no vault antes de alterar sua apresentação.

## Fronteiras

`app/` delega a `screens/mobile` e `screens/web`. Componentes reutilizáveis ficam em `components/`; tokens e contratos visuais em `design-system/`. Contextos persistem somente preferências visuais locais. Hooks mantêm interação e estados explícitos de indisponibilidade. `types/presentation/` não pode importar SDKs ou serviços.

Os antigos diretórios `backend`, `functions`, `services` e `repositories` foram eliminados. Não recriar sua API sob uma nova fachada. Qualquer futuro serviço deve ser definido independentemente, em uma funcionalidade pequena, verificável e autorizada.

## Regras de preservação

- Manter todas as rotas, telas, variantes, assets e identidade visual.
- Manter NativeWind 4.2.1, Tailwind 3.4.18 e Gluestack 3.0.12.
- Usar tokens/classes de `design-system/`; não introduzir estilos visuais inline ou novas exceções sem necessidade de plataforma.
- Preservar acessibilidade, foco, labels e responsividade. Campos e rascunhos não podem ser apagados por uma falsa confirmação.
- Valores recebidos pelos modelos visuais continuam em centavos inteiros; máscaras de entrada e conversão de exibição não constituem cálculo de saldo ou transação.
- Não ler nem apagar dados antigos do dispositivo ou da nuvem nesta etapa.
- Não executar deploy, migração, exclusão ou alteração de recursos remotos.

## Verificação e documentação

Executar `npm run lint:styles` em mudanças de UI, tipos e os testes pertinentes. `npm run check` reúne estilos, tipos e testes do frontend. Exportar Web e bundles nativos quando a mudança afetar inicialização/imports. Distinguir exportação de execução instalada.

Atualizar o documento do módulo e este Active Context quando comportamento/arquitetura mudar. Usar `[[wiki-links]]` e nomes de arquivo com espaços no vault. Preservar alterações do usuário e criar recuperação antes de remoções amplas.

## Active Context

- 2026-11-08: remoção local integral da arquitetura anterior e desacoplamento do frontend. Recuperação em `recovery/backend-removal-20261108` (`594f2d2`) e bundle independente. Todas as telas/rotas preservadas. Sem novo backend, deploy ou alteração remota. Resultados e limites: [[Remoção do Backend]].
