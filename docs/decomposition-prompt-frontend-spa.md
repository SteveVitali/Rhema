# Decomposition prompt — frontend-spa build

Frozen at ratification (2026-10-08, operator-ratified spec v1.0). This file is the hand-off
from `synthesize-spec` to `decompose-spec`. Decompose against the canonical spec — do not
re-open the research rows; `docs/research-ledger.md` is frozen (`projectStatus: DONE`).

## Invocation

```
decompose-spec \
  spec=docs/frontend-spa-spec.md \
  build_name=frontend-spa \
  tickets_dir=docs/tickets \
  tail=full \
  manifest=docs/tickets/00_MANIFEST.md \
  merge_policy=OPERATOR
```

The ticket plan appends to the existing manifest under a new round banner (round 4); rows
follow the existing `NN_<TICKET>__slug.md` contract-file convention and the build-memory v2
layout (`docs/build/`). The build stacks atop the current chain tip at ratification
(`stevevitali/res-3-leg1a-zero-coverage`, ~46 PRs incl. MAINT.5); `mergePolicy: OPERATOR`
throughout — tickets never merge their own PRs.

## Binding constraints the decomposition must carry into every ticket

The `⚑` invariants from the brief (operator-fixed, not up for redesign — spec §2):

1. **I-1 browser journeys are Stage-B acceptance** — every user-surface change lands with a
   journey leg on both renderers where flipped; SSR-first journeys keep passing throughout.
2. **I-2 canonical vocabulary** — `eslint-plugin-rhema/no-banned-strings` applies to all new
   surfaces; no synonym drift in copy or code.
3. **I-3 protocol/eval IP never in bundles** — REQ-ARCH-33; the SPA import graph lints clean
   and sentinels prove the marker gate is live (spec §9).
4. **I-4 strict CSP** — `script-src 'self' 'nonce-…'`, no `unsafe-eval`;
   `connect-src 'self'` + collab WSS origin (+ GCS upload origin only once a
   browser-upload surface flips — spec R21); `form-action` allowlists while SSR forms
   survive; external hand-offs validated server-side (MAINT.5 lesson).
5. **I-5 session cookies on `rhema.tools`; ADR-040 internal-stamp seam preserved** —
   `/api/auth/*` proxy verbatim; all SPA data flows through the same-origin `bffFetch`.
6. **mergePolicy OPERATOR; append-only history; stacked PRs.**

Cross-cutting invariants every surface ticket inherits (spec §2/§10): per-surface flag is
fail-closed and server-side (`SPA_SURFACES`, `signupMode` precedent); flag-off serves SSR
(modulo the new settle markers); two-leg SSR/SPA journey gate per flip is **$0-only**;
renderer override `?ssr=1`/`x-rhema-renderer` stays live on prod the whole window (Q-10);
`ide-chrome` is a real AND-gated rollback flag (Q-12); bundle budgets are a **hard** CI gate
(Q-13); rollback = config flip, never a revert PR mid-flight.

## Reserved strings / conventions

- REQ-id pattern: `REQ-[A-Z]+-[0-9]+`, append-only; new ids continue their family's sequence
  (REQ-ED-17 is live — Source-mode revival, post-editor-flip designed rebuild).
- Surface-flag vocabulary (14 keys + composite, final per Q-14): `usage`, `inbox`,
  `settings`, `voices`, `onboarding`, `project-home`, `billing`, `export`, `outline`,
  `figures`, `run-sheet`, `dossier`, `run-report`, `editor`; composite `ide-chrome`.
- Renderer markers: `data-renderer`, `data-route`, `data-mounted` (REQ-SEQ-8/REQ-VFY-3).
- The committed `data-*` selector manifest + `check:dom-contract` lint gate both renderers.

## Sizing guidance carried from the research

D3 (design/29) sized the build at roughly **40 PRs**: foundations (Vite toolchain + shell +
flags + BFF twins + component-test harness + safety-gate fixes), then one ticket per surface
flip in the ratified order (`usage` first → `editor` last, `export`+`ide-chrome` paired at
#8), each ending with its two-leg gate, then cleanup (SSR-test retirement, override removal,
REQ-ED-17 Source mode as a post-editor designed feature). Decompose to the fewest tickets
that each fit one fresh-context implementation run — group only where the dependency graph
forces it; the foundations must land before any surface flips, and the infra prereq
(`connect-src`+CORS) must land before `voices`.

## Pointers

- Spec (canonical): `docs/frontend-spa-spec.md` — requirement index Appendix A (192 ids,
  14 families), decision register R1–R27 + Q-1…Q-14, review dispositions Appendix E.
- Research index: spec Appendix C → `docs/research/01–04`, `docs/design/20–29`.
- Outline trace: `docs/OUTLINE_TRACE.md` (18/18 OL discharged).
- Existing canonical product spec (stays canonical; this spec is additive):
  `docs/rhema-design-spec.md`. ADR-106 (framework/bundler amendment) is drafted in
  `docs/design/20_spa-framework-binding.md` — an early foundations ticket commits it.
- Budget: $50 operator envelope (Q-6) — frugal verification legs only; per-flip gates are
  free-tier journeys.
