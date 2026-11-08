---
tags: [frontend, arquitetura]
relacionado: [[MOC - Lumus Finanças]], [[Remoção do Backend]]
status: ativo
tipo: arquitetura
versao: 3.0.0
---

# Componentes por Sistema

`components/uiverse` conserva caminhos lógicos; `components/mobile` e `components/web` mantêm as implementações específicas. Os sistemas visuais são navigation, shared, feedback, banks, categories, recurring, dashboard, reports, investments, annotations e assistant.

Gráficos/editor com `'use dom'` mantêm a fronteira Expo DOM e propriedades serializáveis. Componentes nativos não são convertidos para DOM. `recurring-contracts.tsx` conserva o formulário visual sem executor, consulta ou recuperação financeira. [[Componentes UI]] e [[Remoção do Backend]] descrevem os limites atuais.
