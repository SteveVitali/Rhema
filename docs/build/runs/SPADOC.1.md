# SPADOC.1 — repo docs refresh, SPA era (run ledger)

- **Spec:** `docs/tickets/147_SPADOC.1__repo-docs-refresh.md` (manifest row 147, round-4 tail)
- **Base:** `stevevitali/sparec-3-integration-plan` @ `f4e5eb5` (chain tip, confirmed clean +
  synced at fork — `f4e5eb53c6f758681205742567290850405df545`)
- **Branch:** `stevevitali/spadoc-1-repo-docs-refresh` (mergePolicy=OPERATOR — never merge)
- **Harness:** devin-cli subagent (Cognition agentic coding CLI)
- **Skills:** refresh-repo-docs @ `~/agent-skills` (scope `.`, audit=incremental, apply=true)
- **Requirement ids stamped:** none — process/capstone row (the ticket names none; the SPA REQ
  ids are audited by SPACAP.1's matrix)
- **Started:** 2026-10-10 · **Closed:** 2026-10-10
- **Config:** docs-only; **Live stage: none**; metered spend **$0**; zero prod writes, zero
  deploys, zero merges

## What this run did

Ran `refresh-repo-docs` end-to-end against the composed build at `f4e5eb5` (rounds 0–4, PRs
#1–#167). The round-4 SPA migration is **authored-dormant** (spec §14.17: engineered +
deterministic-test green at the tip; prod still serves pre-chain ancestors `6ebb1cb`/`0acd16d`),
so every edit distinguishes *landed code* from *live posture* — docs describe the code as built
and name the operator-run activation (`INTEGRATION_PLAN.md` §R4) where live posture matters.
Every changed claim was verified against current code before it was written:
`packages/contracts/src/spa.ts` (`SPA_PUBLIC_ROUTES`, `SPA_DOCUMENT_ROUTES`, the SPA.28
stage-fact migration note), `apps/web/client-entries.mjs` (`CLIENT_ENTRIES = ["ide","page",
"landing"]`), `apps/web/src/server.ts` (five verbatim `isPhoneRequest(c) || row.showcase ===
true` document arms; `spaShellDocument` unconditional on the SPA-space GETs; `/bff/*` twins),
`apps/web/package.json` (vite/@tanstack pins), `packages/journeys/src/cli.ts`
(`--expect-renderer`/`--surface`/`--invite-code` live; `--pin-renderer` refuses exit 2),
`scripts/check-spa-env.mjs` (retired env names stay banned), `scripts/check-dom-contract.mjs`
(the four-direction gate), ADR-106/107/108.

### Phase 0 — detector

`check-repo-docs-freshness.sh .`: **447 docs scanned, 16 broken refs, 0 stale suspects** —
the identical 16-hit set DOC.1 classified (append-only ADR inline-code examples, frozen
spec/design/research figure URIs intentionally inert per ADR-046, historical ticket-contract
code examples, a test fixture's input data, `packages/protocols` + verbatim `upstream-pin`
template placeholders guarded by the upstream-diff gate). All report-only/false-positive;
none fixed, none introduced (post-edit re-run: same 16, same docs).

### Phase 1 — audit (living docs only)

The detector's stale-suspect list was empty, so the worklist came from the SPA-era claim hunt
across the living corpus: `README.md`, `docs/README.md`, `apps/web/README.md`,
`packages/journeys/README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `LICENSES.md`,
`integration/README.md`, `infra/PROD-BRINGUP.md`, `infra/pulumi/README.md`, `docs/ops/*`,
`docs/security/*`. Frozen/frozen-with-amendments/historical surfaces (`docs/rhema-design-spec.md`,
`frontend-spa-brief.md`, `research-ledger.md`, `decomposition-prompt.md`, `OUTLINE_TRACE.md`,
tickets/build/research/design/adr trees) were audited for the record but not edited — the spec's
§14 amendments + SPAREC.2's dated supersession banners already carry their deltas.

### Phase 2 — fixes (each verified against code)

- **`README.md` (critical):** the Layout line called `web` "React Router SSR shell" — the
  pre-SPA description. Corrected to the landed hybrid: "Hono SSR host + Vite/TanStack SPA +
  same-origin BFF — ADR-106; React Router stays server-side only" (ADR-106 verbatim: React
  Router is the server-side manifest/match library, never shipped to browsers).
- **`README.md` (critical):** Status re-dated to 2026-10-10 and gains a **Frontend (round 4)**
  bullet — the authored-dormant posture (prod = pre-chain ancestors; §R4 activation), the
  permanent hybrid (public funnel SSR forever per `SPA_PUBLIC_ROUTES`; forced-SSR Page family
  phone+showcase per the five server arms, ADR-108; every other authenticated document GET →
  the TanStack SPA shell unconditionally, ADR-106; `/bff/*` session-cookie twins; permanent
  islands `page.js`/`ide.js`/`landing.js`, ADR-107) and the deleted flag machinery (`?ssr=1`/
  `?renderer=spa`/`x-rhema-renderer` inert; rollback = `git revert` + redeploy, SPA.28).
- **`apps/web/README.md` (critical):** the intro still said "The SPA output is inert until the
  shell document and skeleton land (SPA.3/SPA.4): nothing serves it and no flag exists yet" —
  the mid-migration posture. Rewritten to post-cleanup truth: unconditional shell serve, flag
  machinery deleted, `isPhoneRequest || row.showcase` the only renderer verdict left, and the
  authored-dormant live-posture note.
- **`apps/web/README.md` (critical):** the build-layout row's "islands — permanent for
  `landing.js`, retired per-surface as flags flip" was flag-era. Now: the permanent SSR island
  set `ide.js`/`page.js`/`landing.js` (ADR-107), `outline` retired SPA.26, `editor` SPA.24, and
  the `client-entries.mjs` removal rule.
- **`apps/web/README.md` (gap):** the gates section predated SPA.7/SPA.8 — added `check:spa-env`
  (env-leak tripwire; retired `SPA_SURFACES`/`SPA_OVERRIDES` env names stay banned —
  `check-spa-env.mjs:86-88`) and `check:dom-contract` (journeys ⊆ manifest ⊆ emitted ⊆ asserted).
- **`docs/README.md` (gap + stale):** the "Where the build is" paragraph was dated 2026-10-04
  with round-3 posture only — re-dated 2026-10-10 and now records the authored-dormant round-4
  state with pointers to `INTEGRATION_PLAN.md` §R4 + `OPERATIONAL_READINESS.md`. Mode table
  gained the five untabled round-4 top-level docs: `frontend-spa-brief.md` (frozen),
  `research-ledger.md` (frozen — its own template says "living until ratified, then frozen"),
  `OUTLINE_TRACE.md` (frozen), `decomposition-prompt.md` (frozen at ratification),
  `frontend-spa-spec.md` (frozen-with-amendments — v1.1, §14 wins over the v1.0 body).
- **`packages/journeys/README.md` (gap):** the run section never documented the round-4 CLI
  surface — added `--surface`, `--expect-renderer <ssr|spa>` (live, `cli.ts`), the retired
  `--pin-renderer`/`JOURNEY_PIN_RENDERER` refusal (exit 2), and MAINT.6's `--invite-code`.
- **`docs/security/pen-test-scope.md` + `pen-test-vendor-package.md` (moderate, living):** the
  engagement target description called web "SSR surfaces" / "the SSR app" — true of deployed
  prod today, misleading for a procurement that lands post-activation. Both now carry the
  authored-dormant note: after the §R4 activation the auth'd app serves the SPA shell +
  same-origin `/bff/*` twins while the public funnel + phone/showcase Page family stay SSR —
  scope the engagement to whichever renderer prod serves at test time.

### Verified-accurate docs (audited, no edit needed)

- `infra/PROD-BRINGUP.md` — §13 already carries the post-migration ops truth verbatim
  (SPAREC.1): no renderer flag anywhere, inert escape hatches, `git revert` rollback, the
  `rhema:spaSurfaces` "DELETED post-SPA.28" historical note correctly scoped to pre-cleanup
  checkouts.
- `docs/security/usercontent-csp-audit.md` — "the SSR app" is inside a **dated audit record**
  of what prod served at audit time; per the mode table, dated findings stay attributed to
  their date. Left standing.
- `CONTRIBUTING.md`, `SECURITY.md`, `LICENSES.md`, `integration/README.md`,
  `infra/pulumi/README.md`, `docs/ops/*` — no frontend-architecture claims needing correction
  (LICENSES' "never a client bundle" is REQ-ARCH-33's still-true invariant).
- `docs/frontend-spa-spec.md` §14 — the authoritative as-built record; every claim above
  traces to it.

## Reported, not fixed (frozen/report-only surfaces)

- The 16 detector hits — same classification table as DOC.1; the detector cannot reach zero
  on this corpus without falsifying frozen/pinned records.
- `docs/rhema-design-spec.md` §12's mermaid node `web · React Router SSR · ECS` — stale, but
  the file is frozen-with-amendments and already carries SPAREC.2's dated supersession banner
  at that exact row (the banner names ADR-106/107/108 and notes the labels read through).
- `docs/research-ledger.md` / `decomposition-prompt.md` / `OUTLINE_TRACE.md` /
  `frontend-spa-brief.md` — describe the migration *as designed* (flags, `SPA_SURFACES`,
  two-leg gates): accurate records of the plan at ratification; spec §14 records the as-built
  delta. Frozen; report-only.
- `apps/web/client-entries.mjs`'s header comment still says "`?ssr=1` escape and every flag-off
  render" mount `page.js`/`ide.js` — a *code comment*, outside the doc corpus (DOC.1 precedent:
  code metadata is a future hygiene pass). Noted, not edited.
- `apps/web/package.json` `description` still reads "React Router SSR beta shell" — code
  metadata, same class as DOC.1's package.json note.
- `AGENTS.md` — in scope for SPADOC.2 (the agent-docs refresh), not this run. Its command table
  already lists `check:spa-budget`/`check:spa-env`; no drift observed in passing.
- No `CHANGELOG.md` exists; none fabricated.

## Verification

- `check-repo-docs-freshness.sh .` — 447 docs, 16 broken refs (all report-only), **0 new**, 0
  stale suspects.
- `pnpm turbo build lint typecheck` — **135/135** (docs-only; near-full cache).
- `pnpm test` — **487 files, 5,562 pass / 6 skip / 0 fail**.
- All six `check:*` green — licenses 822 · protocol-markers 248 files · no-cookies 253 ·
  spa-budget (all ceilings held) · spa-env (111 client sources / 146 artifacts; retired env names
  still banned) · dom-contract (journeys ⊆ manifest ⊆ emitted+asserted).
- `check-backlog.sh` — **465 expected sources, complete + non-duplicating + verdict-consistent**.
- `check-build-memory.sh .` — 0 violations; 7 pre-existing-class warnings (unchanged set).
- `node docs/build/tools/check-append-only.mjs --base f4e5eb5` — **OK**.
- Canonical vocabulary held in new copy (test tenants / Standard Review / the REQ/ADR ids
  verbatim); no banned strings introduced.
- `gh pr checks --watch=false` read once at closeout — `typecheck / lint / unit` pending (CI registered, in flight); the recurring first-read class.

## Deferrals

- No DEFERRALS row unblocked or closed by this ticket; none opened — the residual detector hits
  are report-only classifications, not owed work. SPADOC.2 (row 148) owns the agent-docs sweep.
