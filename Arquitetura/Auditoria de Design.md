---
tags: [frontend, arquitetura]
relacionado: [[MOC - Lumus Finanças]], [[Remoção do Backend]]
status: ativo
tipo: arquitetura
versao: 3.0.0
---

# Auditoria de Design

## Fase de remoção do backend — 2026-11-08

Inventário preservado: 51 arquivos de tela e 82 entradas de rota, listados em `docs/backend-removal-manifest.json`. A limpeza mantém componentes, assets, cores, tokens, estilos, navegação e variantes de plataforma.

Correções desta fase: retirar inicialização/ações de dados de componentes mistos; encerrar loading sem fonte de dados; mostrar aviso global e estados de indisponibilidade; adicionar “Explorar telas” no login; remover somente avisos exclusivos de ativação/recuperação da arquitetura encerrada.

Nenhuma nova biblioteca de UI, troca de tema, redesenho ou migração de CSS. O lint continua usando o baseline anterior, sem aumento para acomodar a remoção. Componentes nativos/DOM permanecem separados.

Estados de dados reais, sucesso financeiro, permissões remotas e notificações não podem ser homologados nesta etapa. Resultados da validação local e limitações de dispositivo constam em [[Remoção do Backend]].

## Fundação Firebase Spark — 2026-11-08

Telas, rotas, assets, primitivas e design-system preservados. Formulários existentes recebem Auth/perfil reais no emulador; visitante não entra no workspace e a ação anterior de exploração indica que é necessário entrar. Aviso financeiro aparece no workspace; resumo e compartilhamento continuam explicitamente indisponíveis. Refresh de perfil preserva rascunho e feedback, com descarte explícito. Estados de login inválido, carregamento, cadastro, reset e sucesso de perfil foram exercitados no navegador.

O lint mantém as mesmas métricas da etapa 01. Validação Web em 1440×1000 e 390×844, incluindo o redirecionamento preexistente bank-summary→Home. Sem redesenho ou novos estilos. Execução instalada Android/iOS permanece fora da validação disponível; exports não equivalem a homologação em aparelho. Ver [[Fundação Firebase Spark]] e suas evidências.

## Bancos e abertura — Etapa 04

Preservados AddRegisterBank, Home e BankMovements nas duas plataformas, rotas, hero, seletores, cores e tokens. Novos campos de instituição/tipo/data, estados de carga/erro/sucesso e ações de consulta/arquivo usam as primitivas existentes. Nenhuma dependência ou exceção visual adicionada. Gravidade P2 corrigida: resposta de carga não pode apagar entrada em edição; formulário aguarda carregamento. Gravidade P2 corrigida: listagem pós-save não reaproveita snapshot anterior ao commit. Saldo de legado/total incompleto usa indisponibilidade explícita; indicadores de ganhos/gastos não fingem atividade zero. Capturas sintéticas e resultados por viewport em `artifacts/banks-stage04/`, limites de aparelho no relatório da Etapa 04.

Na conferência física da Etapa 04, o aviso global sobrepunha a barra de status. O contêiner do aviso passa a respeitar a safe area superior, mantendo o conteúdo e os estilos; telas já excluem a borda superior de sua própria safe area. Rótulo nativo “Nome da conta” explícito. Hierarquias de navegação retidas pelo Expo Go podem conter controles repetidos; o driver de homologação usa o controle mais recente, sem alterar a navegação do aplicativo.
