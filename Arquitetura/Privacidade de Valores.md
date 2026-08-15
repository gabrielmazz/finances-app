---
tags: [privacidade, visibilidade, contexto, ui]
relacionado: [[Dashboard Home]], [[Assistente Lumus]], [[Previsão de Fluxo de Caixa]], [[Monitoramento de Investimentos]], [[Sistema de Temas]], [[Configurações]]
status: ativo
tipo: feature
versao: 1.3.0
---

# Privacidade de Valores

Toggle de privacidade que oculta todos os valores financeiros na interface, útil para consultar o app em público sem expor informações sensíveis.

## Como funciona

1. `ValueVisibilityContext.tsx` mantém o estado `shouldHideValues` (boolean)
2. Persiste a preferência no `AsyncStorage`
3. Qualquer tela que exiba valores financeiros consome `useValueVisibility()`
4. Quando `shouldHideValues = true`, valores são substituídos por `••••` ou similar
5. Na tela de `Configurações`, o toggle exibe helper text, status da preferência e um popover inline explicando que a ocultação é apenas visual
6. Exportações visuais geradas pelo app, como o PDF de resumo em `BankMovementsScreen.tsx`, devem usar o mesmo formatador visível ao usuário e manter os valores mascarados quando a preferência estiver ativa
7. No [[Assistente Lumus]], mensagens, cartões, métricas e gráficos respeitam a preferência; o TTS recebe o texto já mascarado e o gráfico é substituído por um estado oculto

## Arquivos principais

- `contexts/ValueVisibilityContext.tsx` — Provider, estado e toggle
- `screens/HomeScreen.tsx` — Principal consumidor (oculta saldos e valores)
- `screens/BankMovementsScreen.tsx` — Oculta valores na tela e no PDF de resumo do período
- `screens/ConfigurationsScreen.tsx` — Toggle de visibilidade nas configurações
- `components/uiverse/lumus-assistant/assistant-cards.tsx` — Máscara de mensagens, cartões, relatórios e gráficos
- `contexts/LumusAssistantContext.tsx` — Máscara o texto antes da leitura por voz

## Integrações

- [[Dashboard Home]] — Saldos de bancos e totais são ocultados
- [[Previsão de Fluxo de Caixa]] — Cards, detalhamento mensal e eixo/tooltip do gráfico respeitam a máscara visual
- [[Monitoramento de Investimentos]] — Indicadores, alocação, timeline e eixo/tooltip do gráfico de evolução respeitam a máscara visual
- [[Gerenciamento de Bancos]] — Resumos e exportação PDF respeitam a preferência visual
- [[Configurações]] — Toggle acessível pelo usuário
- [[Sistema de Temas]] — Contexto paralelo com padrão similar de implementação
- [[Assistente Lumus]] — Aplica a máscara à conversa e impede que o TTS fale valores ocultos

## Configuração

- Persistência via `AsyncStorage` com chave dedicada

## Observações importantes

- Estado persiste entre sessões — usuário que ocultou valores verá a tela oculta ao reabrir o app
- Ocultação é puramente visual — os dados são carregados normalmente no estado
- Não é uma feature de segurança real (dados estão na memória) — apenas visual para uso em público
- O consentimento do assistente é uma proteção separada: ocultar valores não substitui a explicação de quais dados mínimos podem ser enviados ao Gemini
