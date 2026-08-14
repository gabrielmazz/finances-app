# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

The primary user is the person responsible for managing household finances. They need a clear, practical way to understand and organize shared money.

## Product Purpose

Lumus Finanças helps people manage personal and family finances in one place: income, expenses, investments, bank movements, recurring items, and financial planning. Success means giving the household a reliable, understandable picture of its finances and making day-to-day decisions easier.

## Positioning

Lumus combines detailed financial control, forecasts, and privacy with shared family visibility. It keeps the experience simple and functional while allowing people who manage the same household finances to work from the same source of truth.

## Operating Context

Users review monthly and annual balances, record and categorize transactions, manage banks and investments, maintain recurring income and expenses, forecast cash flow, and collaborate with people connected to the same household finances. The product ships as a native mobile app for Android and iOS, with a web version that preserves the mobile application's functional experience.

## Capabilities and Constraints

- Dashboard with monthly indicators and financial charts.
- Detailed transactions, bank movements, tags, filters, recurring income and expenses, transfers, cash rescue, and annual/monthly summaries.
- Investment tracking, including CDI-based daily yield calculation, manual synchronization, and redemption clauses.
- Household user relationships for shared financial visibility.
- Firebase Authentication and Firestore support the product data model.
- Monetary values are stored and calculated as integer cents; display conversion happens only at the presentation layer.
- Native platforms and the web version must maintain functional parity with the established mobile experience.

## Brand Commitments

The product is named Lumus Finanças. Its experience should feel simple, functional, clear, organized, accessible, and respectful of financial privacy.

## Evidence on Hand

- Existing runnable Expo/React Native implementation and source code.
- Product overview and feature documentation in `README.md`.
- Architecture and domain documentation in `Arquitetura.md` and the `Arquitetura/` vault.
- Existing brand and interface assets in `assets/`, including logos, application icons, screenshots, and illustrations.
- No independent customer testimonials, market benchmarks, pricing claims, or press evidence have been confirmed; future work must not fabricate them.

## Product Principles

1. Make household finances understandable at a glance and useful in detail.
2. Keep shared financial visibility collaborative without sacrificing privacy.
3. Preserve financial correctness and traceability in every calculation and movement.
4. Prefer simple, functional workflows over complexity for its own sake.
5. Keep the experience coherent across mobile platforms and the web.

## Accessibility & Inclusion

Support light and dark appearance modes, readable text, and accessible interaction across Android, iOS, and web. Platform-native expectations, including safe areas, scalable text, system navigation, and touch-target sizes, remain requirements on native platforms.
