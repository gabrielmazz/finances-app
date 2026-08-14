---
target: screens/HomeScreen.web.tsx
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
timestamp: 2026-08-13T23-56-34Z
slug: screens-homescreen-web-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Loading and error text exist, but refresh has no visible in-progress state and partial data is easy to miss. |
| 2 | Match System / Real World | 4 | Financial language, movement tones, and account/investment grouping map well to the user's mental model. |
| 3 | User Control and Freedom | 3 | Hide-values and refresh are available; recovery is constrained to pull-to-refresh and navigation links. |
| 4 | Consistency and Standards | 3 | Cards and actions are coherent, but the web-specific navigation and hard-coded summary palette diverge from shared theme tokens. |
| 5 | Error Prevention | 2 | Missing monthly balances are surfaced, but the dashboard still presents a potentially partial total as “Saldo disponível.” |
| 6 | Recognition Rather Than Recall | 4 | Labels are explicit and actions are named; icon-only controls have accessible labels. |
| 7 | Flexibility and Efficiency | 3 | Quick actions and responsive columns help frequent users, but there are no desktop keyboard/focus affordances visible in this file. |
| 8 | Aesthetic and Minimalist Design | 3 | Strong spacing and restrained surfaces, but several sections compete equally for attention. |
| 9 | Error Recovery | 2 | The error message tells users to pull, but does not provide a local retry action or identify which data failed. |
| 10 | Help and Documentation | 1 | No contextual explanation for “projeção atual,” partial balances, or how hidden values work. |
| **Total** | | **28/40** | **Solid foundation; needs clearer prioritization and stronger state communication.** |

## Design Specificity Verdict

The page feels authored for Lumus in its privacy-first value hiding, household-account framing, Brazilian Portuguese copy, and yellow-on-navy accent language. It is not fully category-interchangeable. The main missed opportunity is turning “shared household financial truth” into a more visible product signature: the page currently reads as a polished generic finance dashboard rather than a dashboard that explains confidence, completeness, and household context.

Deterministic scan: `detect.mjs --json screens/HomeScreen.web.tsx` returned `[]` (0 findings). No browser inspection or overlay was available in this session, so there is no reliable screenshot-based visual finding.

## Overall Impression

A capable, well-structured dashboard with a credible visual system and good content grouping. The single biggest opportunity is to make the first viewport answer three questions in order: “What is my trustworthy available balance?”, “What changed this month?”, and “What should I do next?” At present, the layout gives those jobs similar visual weight and makes data completeness less obvious than it should be for a finance product.

## What's Working

- The summary card establishes a strong anchor with high-contrast balance, entry/exit metrics, and a privacy control that is especially appropriate for shared or public viewing.
- Quick actions are well chosen for the core recurring behaviors: expense, gain, and transfer. The labels are clearer than relying on icons alone.
- The responsive structure is sensible: the accounts/activity split appears only at wide widths, while compact layouts stack content and avoid forcing tiny columns.

## Priority Issues

### [P1] The dashboard has no unmistakable primary job

Why it matters: The summary, quick actions, accounts, recent movements, and investments all look like peer-level modules. A user scanning quickly may not know whether the page is optimized for monitoring, recording, or investigating.

Fix: Establish a deliberate sequence: (1) trustworthy balance with completeness status, (2) month delta/trend, (3) one prominent “Registrar” action group, then (4) supporting detail. Reduce the visual weight of quick actions and secondary cards, and use one explicit period label such as “Agosto de 2026” rather than the sentence “Seu movimento em…”.

Suggested command: `$impeccable layout`

### [P1] The summary card breaks the theme contract

Why it matters: The card hard-codes `#101828`, `#facc15`, and fixed text colors while the rest of the page uses `webDashboardPalette`. In light mode this can be intentional, but it makes the most important component the least adaptable and increases maintenance/accessibility risk when the theme evolves.

Fix: Add semantic summary-card tokens to `webDashboardPalette` (`summarySurface`, `summaryBorder`, `summaryPrimaryText`, `summaryMutedText`, `summaryAccent`) and use them consistently. Keep the navy/yellow identity, but make it a deliberate theme role instead of local literals.

Suggested command: `$impeccable colorize`

### [P1] A partial balance can look authoritative

Why it matters: `totalBalanceInCents` sums only available balances but the label still says “SALDO DISPONÍVEL.” The warning appears below the metrics and may be overlooked; in a money dashboard, an incomplete total can lead directly to a bad decision.

Fix: When `missingBalanceCount > 0`, change the primary label to “SALDO PARCIAL,” add the count beside it, and visually attach the warning to the number. Show the known/unknown distinction in plain language, e.g. “3 contas incluídas · 1 sem saldo mensal.”

Suggested command: `$impeccable clarify`

### [P2] Refresh and failure states are too passive

Why it matters: The refresh icon has no visible disabled/spinning state in this file, and the combined error says only that “some information” failed. Users cannot tell whether the dashboard is stale, which module is affected, or whether retrying worked.

Fix: Animate or disable the refresh control while `isRefreshing`; provide a text tooltip/label on desktop; show module-level retry affordances or a single “Tentar novamente” button next to the error. Add “Atualizado agora/às HH:mm” when data loads successfully.

Suggested command: `$impeccable harden`

### [P2] Investment copy is not self-explanatory

Why it matters: “Projeção atual” and “Rendimento estimado” sound similar, and there is no period, rate, or explanation. Users may mistake simulated values for actual balances.

Fix: Rename with explicit status: “Valor atual,” “Valor projetado,” and “Ganho projetado,” then add a compact helper such as “estimativa baseada na carteira cadastrada.” Keep the distinction visually obvious and never imply certainty.

Suggested command: `$impeccable clarify`

## Persona Red Flags

**Jordan (First-Timer):** The page gives them several valid next actions but no guided starting point. “Movimentos,” “Analisar,” and “Ver carteira” are understandable only after learning the product. The partial-balance notice is a long inline sentence and risks being skipped.

**Alex (Power User):** Quick actions are useful, but there is no visible “last updated” timestamp, no keyboard/focus treatment in this file, and refresh feedback is weak. They cannot quickly assess whether the numbers changed after recording a transaction.

**Household Reviewer:** The privacy toggle is a strong fit, but the page does not explain whether hidden values apply only locally or to shared household viewers. The “available balance” ambiguity is especially risky for someone making a spending decision from a shared account picture.

## Minor Observations

- The `monthLabel` is generated once per mount; a long-lived tab crossing midnight/month-end can retain a stale month label.
- `Data indisponível` is a useful fallback, but movement rows could distinguish missing date from missing category more clearly.
- Account cards have no visible action affordance; if they are intentionally read-only, that should be consistent with the “Movimentos” path.
- The refresh and eye buttons meet the 42px visual size used here, but desktop keyboard focus styles are not apparent in this screen source.
- The summary uses “Entradas” and “Saídas” without explicitly saying they are for the current month; the subtitle is doing too much contextual work.

## Questions to Consider

- What if the first viewport were designed around trust in the number—complete, partial, or stale—before optimizing for density?
- Is the dashboard’s primary action monitoring finances or recording a transaction? Which one should win visually?
- Could “household truth” become a visible signature through completeness, shared visibility, and last-updated context rather than only through color and the hide-values icon?
