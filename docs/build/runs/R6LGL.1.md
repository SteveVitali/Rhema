# R6LGL.1 — Legal / trust pages (Terms, Privacy, Refunds, Acceptable Use, Contact) — run ledger

- **Spec:** `docs/tickets/180_R6LGL.1__legal-trust-pages.md` (manifest row 180, round 6 —
  Kind: ticket) — `implement-spec`; spec §4.2 `REQ-LCH-1`; LEDGER GATE DECISIONS
  `GD-LEGAL.R6` ("Agent drafts, you approve") + `GD-LEGAL-DETAILS.R6` ("Placeholders now");
  design spec §12.8 residual risk, §13.3 retention, §13.4 export, §14.4 refund math,
  §14.7 Settings › Data posture; REQ-ACCT-2 (never-cookies), REQ-ACCT-3/4 (export/delete).
- **Base:** `stevevitali/r6ucd-1-api-minted-usercontent-urls` at **local** HEAD `9a74584`
  (the R6UCD.1 orchestrator boundary commit, deliberately unpushed — never reset to
  `origin/`, which lacks it).
- **Branch:** `stevevitali/r6lgl-1-legal-trust-pages` (PR base
  `stevevitali/r6ucd-1-api-minted-usercontent-urls`; mergePolicy=OPERATOR — never merge).
- **Harness:** devin-desktop/swe-2-high/subagent · **Skills:** implement-spec + build-memory +
  self-review @ `~/agent-skills` (`e981ec5`)
- **Requirement ids stamped:** `REQ-LCH-1`
- **Live stage:** offline-only (the pages are SSR-covered by unit tests; nothing deploys)
- **Production mutations:** none
- **Gate status:** none. The text's approval is HUMAN-H11; GATE-LAUNCH requires
  `approved: true` on every page.
- **Started:** 2026-10-21T06:58Z
- **Closed:** 2026-10-21T08:14Z — `ci: pass #200@1f6c632` (code head full green; the docs
  closeout head rides the fast-path leg)

## Deferrals read

`docs/tickets/DEFERRALS.md` read first (protocol — AGENTS.md). Census of OPEN rows: none are
unblocked by this ticket — `D-R5OPS.1-2`'s live probes ride R6POST.1 (R6UCD.1 landed the code);
`D-R6CI.1-1` (CI-cost measured delta) names R6SWP.1/R6CAP.1 as owner ≥3 tickets later (this is
the 2nd ticket after 176a); the rest are HUMAN/clock/operator-ruling bound (H11 fills these very
placeholders — the approval act, not this ticket). No row flipped this run.

## Requirements (from the ticket)

1. Public SSR routes `/terms`, `/privacy`, `/refunds`, `/acceptable-use`, `/contact` —
   registered in the route census (`SPA_PUBLIC_ROUTES` + `SPA_DOCUMENT_ROUTES` per spec §4.2),
   footer links on every public page.
2. Content files with clearly marked placeholders — operating entity, governing-law
   jurisdiction, contact address — and a committed `approved: false` flag per page.
   **Owned shared decision:** the flag's shape, consumed by GATE-LAUNCH + R6CNT.2 (ADR owed).
3. A drafted text per page stating only what the code does — factual claims cited in a
   review appendix (below).
4. DOM-contract hooks; `check:no-cookies` / `check:dom-contract` / launch-surface lint green;
   no efficacy claim.

Out of scope: final legal wording authority; filling the placeholders (HUMAN-H11).

## Acceptance criteria

- [ ] Five routes render SSR with footer links; census + dom-contract green *(engineered)*
- [ ] A test fails if any page ships `approved: true` while a placeholder remains *(engineered)*
- [ ] Launch-surface lint covers the new pages *(engineered)*
- [ ] Universal phase-gate AC *(agentic)* — verification green, tests for every new behaviour,
      requirement ids stamped, deferrals/ADRs/index/ledger/operating clauses.

## Plan

1. `packages/contracts/src/legal.ts` — the owned flag shape: `LEGAL_PAGES` (routeId · title ·
   navLabel · `approved:false` · `details[]`), `LEGAL_DETAILS` (operator-fill slots, all null),
   the `⟦KEY⟧` placeholder-token convention, `legalPlaceholdersFor` + `legalApprovalViolations`
   (the `approved ⇒ no placeholder remains` invariant). `spa.ts`: the five ids appended to
   `SPA_PUBLIC_ROUTES`.
   **Census decision (recorded):** the five documents join `SPA_PUBLIC_ROUTES` ONLY — the
   funnel's own family (REQ-BND-5 public-SSR-forever). `SPA_DOCUMENT_ROUTES` is the
   *authenticated* enumeration whose `surfaces:null` rows are server-owned *redirect* GETs
   registered as `_authenticated` reload stubs — a public document is neither, and an
   out-of-tree same-origin anchor already doc-navs natively (exactly how `/pricing` behaves
   from inside the SPA today). No stub files, no `RELOAD_STUB_IDS`, no routeTree regen.
2. `apps/web/src/copy.ts` — `COPY.legal`: drafted text per page (placeholders `⟦KEY⟧`), plus
   `COPY.meta.*` descriptions. `legal.tsx`: `LegalPage` (banner while unapproved, placeholder
   `<mark data-legal-placeholder>` substitution) + `publicFooter()` (brand + five legal links).
   `routes.tsx` manifest rows; `server.ts` GET handlers; `doc-meta.ts` titles/descriptions;
   `pages.tsx`/`marketing.tsx` footers → `publicFooter()`; `dom-contract.ts` `public` hooks.
3. Tests: `contracts/legal.test.ts` (flag invariants + the violation predicate fires),
   `apps/web/src/legal-pages.test.ts` (SSR via `createWebApp` — routes 200, `data-route`,
   footer on every public page, placeholder↔approved invariant, placeholders ⊆ details),
   `routes.test.ts` + `spa.test.ts` enumerations extended; `launch-surface.test.ts`
   SURFACE_FILES += `legal.tsx`.
4. ADR-118 — the owned flag-shape decision the ticket assigns.

## Test matrix

| AC | tests |
|---|---|
| five SSR routes + census + footer | `legal-pages.test.ts` GET×5 (200, `data-route`, `data-renderer="ssr"`, `data-legal-page`, footer links ×5) + public-page footer sweep + `spa.test.ts`/`routes.test.ts` census pins |
| `approved:true` + placeholder ⇒ fail | `contracts/legal.test.ts` (`legalApprovalViolations` empty on the shipped set; fires on synthetic approved+unfilled) + `legal-pages.test.ts` (rendered-approved ⇒ zero `⟦`/`data-legal-placeholder`; the invariant predicate proven live) |
| launch-surface lint covers | `launch-surface.test.ts` SURFACE_FILES += `apps/web/src/legal.tsx`; content lives in `copy.ts` ⇒ collectCopyStrings + audit-local scans already cover it |
| census | `spa.test.ts` null-surface public set extended; `routes.test.ts` public-paths set extended; `spa.dom.test.tsx` "every SPA_DOCUMENT_ROUTES entry registered" satisfied by stubs |

## Progress

- 2026-10-21T06:58Z — branch cut at `9a74584`; spec + anchors read; plan recorded.
- 2026-10-21T07:15Z — implemented: contracts legal census + tests, spa census + pins, COPY.legal
  drafts + meta, legal.tsx (LegalPage/publicFooter/⟦KEY⟧ substitution), routes/server/doc-meta
  wiring, footers unified on `publicFooter()`, dom-contract hooks, launch-surface file added,
  legal-pages.test.ts (14 tests) + routes.test.ts. Green: build/lint/typecheck 135 tasks,
  `pnpm test` 5942, all six check:* gates. ADR-118 written.

## Gap table

| item (spec §) | required | achieved | status | evidence |
|---|---|---|---|---|
| D1 — five public SSR routes in the census + footer links on every public page | engineered | engineered | met | `contracts/spa.ts` SPA_PUBLIC_ROUTES += 5; `routes.tsx` manifest rows; `server.ts` LEGAL_PAGES loop; `legal.tsx publicFooter()` on every SSR footer (`pages.tsx`/`marketing.tsx` delegate); `legal-pages.test.ts` (routes 200, `data-route`, footer sweep ×6 public pages); `spa.test.ts`/`routes.test.ts` pins |
| D2 — content files, marked placeholders (entity/jurisdiction/contact), committed `approved:false`, owned flag shape | engineered | engineered | met | `contracts/legal.ts` (`LEGAL_PAGES`/`LEGAL_DETAILS`/`legalApprovalViolations`); `COPY.legal` `⟦KEY⟧` text; ADR-118; `legal.test.ts` ships-all-false + all-null pins |
| D3 — drafted text, factual claims only, review-appendix citations | engineered | engineered | met | `COPY.legal` — the appendix below cites each claim |
| D4 — DOM-contract hooks; no-cookies/dom-contract/launch-surface green; no efficacy claim | engineered | engineered | met | `dom-contract.ts` public rows (data-legal-nav/-page/-draft/-placeholder); `check:dom-contract` OK; `check:no-cookies` OK; `launch-surface.test.ts` SURFACE_FILES += legal.tsx; `copy.test.ts` + CLAIM_PATTERNS clean |
| AC — five routes render SSR w/ footer; census + dom-contract green | engineered | engineered | met | `legal-pages.test.ts` ×14 green; `pnpm check:dom-contract` OK |
| AC — test fails if approved:true while a placeholder remains | engineered | engineered | met | `legal.test.ts` (violations fire on synthetic approved+unfilled; shipped set clean) + `legal-pages.test.ts` (rendered-mark count == unfilled ⟦KEY⟧ occurrences; invariant pinned) |
| AC — launch-surface lint covers the new pages | engineered | engineered | met | `launch-surface.test.ts` SURFACE_FILES += `apps/web/src/legal.tsx` (copy strings covered via `collectCopyStrings` scans) |
| AC — universal phase-gate | agentic | engineered | met | verification green; `ci: pass #200@1f6c632` read + recorded (Evidence report); PR body `docs/build/pr/R6LGL.1.md` carries the REQ-LCH-1 stamp; BUILD_INDEX row 206 + LEDGER advance + PHASE LOG in the closeout commit; no new DEFERRALS row (approval/fill = chain tickets 190a/194, not a deferred AC) |

### Review appendix — claim → source citations (deliverable 3)

| Claim in `COPY.legal` | Source of truth |
|---|---|
| terms: "reads a finished draft … dossier you can act on" | `COPY.invite.lede` (§15.1 shipped copy) |
| terms: suggestions wait for approval — pen stays with you | `COPY.landing.faq` answer (§15.1); approval-consent model §5.4 |
| terms: Google or magic link, no password | `COPY.meta.signup`/`signIn`; §14.7 Account |
| terms: credits you add yourself, no card to start | `COPY.invite.accessNoteOpen`; `COPY.landing.faq` (REQ-BETA-19) |
| terms: Stripe processes payments; no card numbers stored | §14.6 Stripe-hosted checkout (`STRIPE_HOSTED_ORIGINS`); §13.3 Stripe secrets |
| terms: every run shows estimate + cap before it starts | §14.4 (REQ-BILL-3 cap guarantee; run sheet §5.6) |
| terms: export + delete from Settings › Data | §14.7 Data section; `COPY.accountExport`; REQ-ACCT-3/4 |
| privacy: account details collected | §14.7 Account (name, byline, email, avatar, sign-in methods) |
| privacy: usage/billing records kept | §13.3 retention (usage records + credit ledger 7y); §14.5 |
| privacy: Substack public archive/zip, never cookies, no paywalled credential fetch | REQ-ACCT-2 (§14.7); REQ-INGEST-5; `COPY.settings.integrationProviders`; `check:no-cookies` gate |
| privacy: Medium public stories/zip; Drive drive.file picked files, export only | REQ-ACCT-2; `COPY.settings.integrationProviders.medium/gdrive` |
| privacy: disconnect removes credential immediately; samples kept | `COPY.settings.integrationsNote` (§14.7) |
| privacy: no-training + provider list + residual-risk sentence | §14.7 verbatim = `COPY.settings.trainingPosture` (§12.8); pinned equal by `legal-pages.test.ts` |
| privacy: no sale; Stripe; Anthropic API terms | §13.3 secrets; §14.6; `trainingPosture` |
| privacy: staff access per-request 72h, logged | `COPY.settings.supportAccess*` (§14.7; REQ-VIS-11) |
| privacy: export-everything zip, emailed link, 7-day expiry | §14.7; `COPY.accountExport.lede`; §13.4 REQ-ACCT-3 |
| privacy: analytics-opt-out + support-access toggles default off | §14.7 (both default off); `COPY.settings` |
| privacy: 14-day grace → hard delete; anonymized ledger + Stripe retained per tax law | §13.3 (REQ-ACCT-4); `COPY.settings.deletionLede` |
| privacy: project tombstone 30-day purge | §13.3 backups/deletion |
| privacy: transcripts 30d / events 30d / audit 90d / usage+ledger 7y; backup window | §13.3 Retention (REQ-ARCH-29; Cloud SQL amendment) |
| privacy: session cookie only; ingestion never accepts a cookie/credential | §13.3 `__Host-` cookie posture (PRB.15); REQ-INGEST-5; `check:no-cookies` |
| refunds: hold(cap)→debit(actual)→release; over-cap absorbed; fail/refuse/cancel→refund+partials kept; user stop→completed phases | §14.4 accounting table (REQ-BILL-3) |
| refunds: completed-run 7-day window, one per quarter without review | §14.4 fairness rules (ledger L10) |
| refunds: refunds restore credits | §14.4 `refund(debited)` is a credit-ledger movement |
| acceptable-use: import formats .md/.txt/.html/.docx/.pdf ≤25 MB | `COPY.import.lede`; `apps/api` presigned-PUT `maxBytes` 25 MB (import.test.ts) |
| acceptable-use: magic link personal; sessions revocable | §14.7 Account; `COPY.settings.sessions*` |
| acceptable-use: samples from public archive/zip only; Drive picked-files export-only; never posts | REQ-ACCT-2/REQ-INGEST-5; `COPY.settings.integrationProviders` |
| acceptable-use: suspension on violation | standard enforcement — states only the operator's remedy, no invented capability |
| contact: email/postal placeholders; support-access grant posture; DPA line | ⟦CONTACT_EMAIL⟧/⟦CONTACT_ADDRESS⟧ slots; `COPY.settings.supportAccess*`; `COPY.settings.dpaLine` verbatim |

## Evidence log

- `pnpm vitest run apps/web/src/legal-pages.test.ts packages/contracts/src/legal.test.ts` —
  23 green (14 + 9).
- `pnpm vitest run … copy.test.ts marketing.test.ts server.test.ts launch-surface.test.ts` —
  243 green; vocabulary + claim scans cover `COPY.legal` end-to-end.
- `pnpm turbo build lint typecheck` — 135/135 tasks.
- `pnpm test` — **507 files / 5,942 tests green** (464s), 0 failures.
- `pnpm check:dom-contract` — OK (manifest ⊆ emitted ⊆ asserted; `public` bucket carries the
  four legal hooks); `pnpm check:no-cookies` — OK (257 files); `check:licenses` OK (822);
  `check:protocol-markers` OK; `check:spa-env` OK; `check:spa-budget` OK.
- Live drive (`tsx` → real `createWebApp`, null + signed-in sessions): `/terms /privacy
  /refunds /acceptable-use /contact` each 200 with `data-renderer="ssr"`, own `data-route`,
  census-verbatim `<title>` (`Contact &amp; Support` — `&` escaped), per-key meta description,
  `data-legal-draft` banner, `data-legal-nav` in the footer, and exactly the unfilled `⟦KEY⟧`
  occurrences as `data-legal-placeholder` marks (5/3/4/3/4). `/terms/` → 404 with normalized
  `data-route="/terms"` — the existing public-route behavior (SSR 404), unchanged.

## Evidence report

See `docs/build/pr/R6LGL.1.md` — the same AC→evidence table.

- ci: `pass #200@1f6c632` — code head `1f6c632` full green (run 39561928282: ci-pass
  anchor, integration, images (build + scan, pin digests), contracts, public-safe
  (gitleaks / markers / licence policy), typecheck / lint / unit, fast-path — all seven
  legs). Record: `/tmp/r6lgl1-ci.json` (ci-boundary/1).
- Boundary read (verbatim):
  `ci: pass #200@1f6c632 (ci-pass anchor 39561928282; integration 39561928282; images
  (build + scan, pin digests) 39561928282; contracts 39561928282; public-safe (gitleaks /
  markers / licence policy) 39561928282; typecheck / lint / unit 39561928282; fast-path
  39561928282)`
