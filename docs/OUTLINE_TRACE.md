# OUTLINE_TRACE — frontend-spa brief → spec coverage

**Brief:** `docs/frontend-spa-brief.md` (2026-10-07)
**Spec:** `docs/frontend-spa-spec.md` v0.1
**Purpose:** prove the spec is a superset of the brief — every obligation discharged or consciously
de-scoped. An uncovered `OL-*` is a synthesis gap, not something to leave silent.

## Obligations from "What the spec must answer"

| OL | Brief obligation | Discharged at | Notes |
|---|---|---|---|
| OL-1 | Framework/router/data-layer choice and why (TanStack vs RR7 vs Start; bundler — Vite amends ADR-007) | spec §3 + §3.6 + App B Q-2/Q-3; design/20 decision matrix; design/21 toolchain | RR7-framework and Start both rejected with recorded reasons; ADR-106 drafts the amendment |
| OL-2 | The BFF boundary: which ~175 routes become JSON endpoints; mutation model; SSE/ws story | spec §4 + §5; design/22 §1–§9 (endpoint table adopted by reference) | ~45 doc GETs → `/bff/*` twins; ~90 transports/mutations unchanged; SSE verbatim; WSS direct-external |
| OL-3 | Islands→React mapping incl. the editor/collab island | spec §6; design/23 (29-row parity checklist adopted by reference) | Hand-rolled mount; both binding libs rejected with reasons; Page flips last |
| OL-4 | Public-vs-auth'd split (SSR hybrid boundary) | spec §4; design/26 boundary table | Q-1 hybrid; REQ-BND-1 freezes the public set |
| OL-5 | Design ambition + design-system plan (tokens exist in `@rhema/tokens`) | spec §8; design/24 | Q-4 port+polish; generated-CSS-over-tokens carried verbatim; Tailwind/CSS-in-JS/CSS-Modules rejected |
| OL-6 | Verification strategy: journeys adaptation, component tests, a11y/responsive posture, bundle budget | spec §10 + §9; design/27, design/28 | RTL+happy-dom; `--expect-renderer`/`--surface`; $0-only flip gates; two coverage debts named; budgets in REQ-SAFE-7 |
| OL-7 | Migration sequencing: strangler/flag/cutover; interplay with the unmerged 45-PR stack | spec §11; design/29 | Q-5 strangler; SPA_SURFACES = signupMode pipeline; flip order + per-flip runbook; ~40-PR envelope; rebase checkpoint |
| OL-8 | Operator-decision register for everything genuinely operator-level | spec §0.3 + §12.2 + App B; ledger §Q | Q-1..Q-7 recorded; R1..R27 synthesis rulings; §12.2 queues seven ratification questions |

## Obligations from "Fixed constraints" (⚑)

| OL | Constraint | Discharged at |
|---|---|---|
| OL-9 | `mergePolicy: OPERATOR`; stacked PRs; build-memory; append-only | spec §2 I-1 + §11 (prod flips = operator-merged one-line PRs) |
| OL-10 | JOURNEY.1 browser journeys remain the acceptance mechanism (REQ-SPEC-29) | spec §2 I-2 + §10 (journeys authoritative; component tests supplement) |
| OL-11 | Canonical-vocab lint, protocol-markers, no-cookies, licenses continue to apply to browser output | spec §2 I-3 + §9 (gates *strengthened* — the vacuous-scan discovery is fixed in the foundation set) |
| OL-12 | Strict CSP retained; outbound hand-offs are navigations to allowlisted origins | spec §2 I-4 + §9 (REQ-SAFE-5/6; REQ-BFF-27; form-action's non-coverage of JS navs addressed by BFF validation) |
| OL-13 | Session cookies on `rhema.tools`; ADR-040 internal-stamp seam preserved | spec §2 I-5 + §5 (REQ-DAT-7; `/api/auth/*` proxy verbatim; stamp on every rate-limited call) |
| OL-14 | ProseMirror + Y.Doc + Hocuspocus collab survives (parity minimum; React binding welcome) | spec §2 I-6 + §6 (29-row parity checklist is the editor flip's gate) |
| OL-15 | Prohibited claims / copy discipline unchanged | spec §2 I-7 + §9 (REQ-SAFE-4: every SPA string is a COPY leaf; launch-surface audit extends to SPA sources) |
| OL-16 | Public/SEO surfaces keep fast first paint; never knowingly regressed | spec §2 I-8 + §4 (public set frozen by REQ-BND-1; shared token/font pipeline REQ-BND-12) |

## Out-of-scope declarations (consciously de-scoped, restated in spec §13)

| OL | Exclusion | Where recorded |
|---|---|---|
| OL-17 | Backend data-model changes; api route semantics; billing/auth semantics | spec §13; enforced by REQ-SEQ-9's surface-ticket shape ("no api/schema changes") |
| OL-18 | §16.4 marketing claims (G2 frozen) | spec §13 |

## Verdict

All 18 obligations discharged or explicitly de-scoped. **No uncovered OL rows.** The spec is a
superset of the brief.
