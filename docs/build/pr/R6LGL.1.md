# R6LGL.1 — Legal / trust pages: Terms, Privacy, Refunds, Acceptable Use, Contact (REQ-LCH-1, ADR-118)

Stacked on `stevevitali/r6ucd-1-api-minted-usercontent-urls` ·
`mergePolicy: OPERATOR` — **do not merge; the operator merges the chain
bottom-up.** Offline-only ticket; $0; no live stage; zero prod contact.
`implement-spec spec=docs/tickets/180_R6LGL.1__legal-trust-pages.md`
— manifest row 180, depends on 179_R6UCD.1. ADR-118.

**Requirement ids stamped:** REQ-LCH-1

**Draft posture (GD-LEGAL.R6 "Agent drafts, you approve" + GD-LEGAL-DETAILS.R6
"Placeholders now"):** the five documents' text is **drafted, not approved** —
every page ships `approved: false` in `LEGAL_PAGES`, renders a visible draft
banner, and marks every unfilled operator slot (`⟦OPERATING_ENTITY⟧`,
`⟦GOVERNING_LAW⟧`, `⟦CONTACT_EMAIL⟧`, `⟦CONTACT_ADDRESS⟧`) as a
`data-legal-placeholder`. HUMAN-H11 records the values; R6CNT.2 fills
`LEGAL_DETAILS` and flips the flags — and `legalApprovalViolations` makes an
approved page riding a placeholder a CI failure.

## What

**1. The owned shared decision — the flag's shape** (`packages/contracts/src/legal.ts`,
ADR-118): one browser-safe table — `LEGAL_PAGES` (routeId · title · navLabel ·
`approved` · `details`), `LEGAL_DETAILS` (the operator-fill slots, all `null`),
the `⟦KEY⟧` token grammar, and `legalApprovalViolations` — the
`approved ⇒ no placeholder remains` predicate GATE-LAUNCH's readout will read.
`title`/`navLabel`/`routeId` are single-sourced: `<title>` (doc-meta), `<h1>`
and the footer label all render the census row verbatim.

**2. Five public SSR routes** — `/terms`, `/privacy`, `/refunds`,
`/acceptable-use`, `/contact` join `SPA_PUBLIC_ROUTES` (the public funnel's own
census; **not** `SPA_DOCUMENT_ROUTES` — that enumeration's `surfaces:null`
rows are server-owned *redirect* GETs under `_authenticated`, and out-of-tree
anchors doc-nav natively already — same posture as `/pricing` today). The
manifest rows bind `legalElements[routeId]`; `server.ts` registers the handlers
off `LEGAL_PAGES`; signed-in readers get the document too — a session never
redirects away from a legal page.

**3. Drafted text claiming only what the code does** (`COPY.legal`) — Terms
(service, account, credits/cap, your-content, acceptable-use, governing law);
Privacy (collection, integrations, the §14.7/§12.8 training-posture sentence
verbatim — pinned equal to `COPY.settings.trainingPosture` by test — sharing,
controls, retention, cookies); Refunds (the §14.4 hold/debit/release/absorb/
refund math + the 7-day/once-per-quarter window); Acceptable Use (import
formats + 25 MB cap, never-cookies sources, enforcement); Contact (support,
privacy/legal, the DPA line). The run ledger's review appendix cites every
factual claim's source — no efficacy, comparative, or capability invention.

**4. Footer links on every public page** — `publicFooter()` (brand + the
`LEGAL_PAGES` enumeration, `data-legal-nav`) is now THE footer: every public
funnel page carries it, and so do the forced-SSR Page family + the not-found
document (a strict superset of the AC).

**5. DOM hooks + lint coverage** — `data-legal-nav` (required), `data-legal-page`,
`data-legal-draft`, `data-legal-placeholder` (conditional) manifest entries;
`launch-surface.test.ts` SURFACE_FILES += `apps/web/src/legal.tsx` (the strings
themselves live in `copy.ts`, already inside the collectCopyStrings sweeps).

## Evidence (deterministic)

- `apps/web/src/legal-pages.test.ts` (14) — per-route 200 + `data-renderer=ssr`
  + own `data-route` + `data-legal-page` + census-verbatim `<title>`/`<h1>`;
  signed-in reader still served; draft banner while `approved:false`; five
  links in the footer of every legal page AND every public funnel page;
  `approved ⇒ no placeholder` invariant + declared-details == referenced-⟦KEY⟧
  + rendered-mark count == unfilled occurrences; the §14.7 posture sentence
  pinned verbatim.
- `packages/contracts/src/legal.test.ts` (9) — the census (5 rows, all
  `approved:false`, all details `null`), `legalApprovalViolations` firing on a
  synthetic approved-with-placeholders row and clean on the shipped set, the
  ⟦KEY⟧ grammar.
- Census pins extended — `spa.test.ts` (null-surface for the five) +
  `routes.test.ts` (public-path enumeration + matchAppRoute resolution).
- `pnpm test` — 507 files / **5,942 tests green**; `turbo build lint typecheck`
  135/135; `check:dom-contract` · `check:no-cookies` · `check:licenses` ·
  `check:protocol-markers` · `check:spa-env` · `check:spa-budget` all OK.
- Live drive: `createWebApp` under tsx — every route 200 SSR with correct
  markers; `/terms/` 404s with normalized `data-route` (existing public-route
  behavior, unchanged).

## Deferrals delta

None — no row opened or closed. The approval act is HUMAN-H11 (manifest row
190a) and the fill is R6CNT.2 (row 194) — chain-tracked, not deferred ACs; the
flag machinery + placeholder marks make the pending state machine-visible
on every rendered page.

## AC layers

- Five SSR routes + footer links + census + dom-contract — **required: engineered → achieved: engineered** (`legal-pages.test.ts`, `check:dom-contract` OK).
- Approved-with-placeholder test — **required: engineered → achieved: engineered** (`legal.test.ts`, `legal-pages.test.ts`).
- Launch-surface lint covers the pages — **required: engineered → achieved: engineered** (SURFACE_FILES += `legal.tsx`; `collectCopyStrings` scans cover `COPY.legal`).
- Universal phase-gate AC — agentic; CI read + recorded in the run ledger; ADR-118; BUILD_INDEX/LEDGER advance in the closeout commit.
