# SPACAP.1 — Capstone coverage & gap analysis (frontend SPA migration)

> **SPACAP.1 deliverable.** Independent, whole-build judgment of the composed round-4
> chain (`fab08ed…30afea7`, branch `stevevitali/spa-28-override-machinery-removal`)
> against `docs/frontend-spa-spec.md`. Companion machine record:
> `docs/build/COVERAGE_MATRIX.csv` (666 rows — the 474-row round-3 product/design
> matrix plus **192 new rows, one per SPA-spec `REQ-[A-Z]+-[0-9]+`** across the 14
> families INV/ISL/DAT/TST/FW/TL/BFF/ED/UX/NAV/BND/VFY/SAFE/SEQ), completeness-gated
> by `scripts/check-coverage-matrix.test.mjs`.

## 1. Method

**Independence is the point.** Verdicts were drafted from the spec and the composed
tree before any `docs/build/runs/*` ledger or `docs/build/readouts/*` file was
opened this run. What was read, in order:

1. `docs/frontend-spa-spec.md` — in full: §0–§12, Appendix A (the 192-id index:
   INV-1..8, ISL-1..16, DAT-1..14, TST-1..10, FW-1..12, TL-1..14, BFF-1..30,
   ED-1..17, UX-1..16, NAV-1..11, BND-1..12, VFY-1..10, SAFE-1..10, SEQ-1..12),
   Appendix E dispositions.
2. The emitting notes for per-ID normative text — `docs/research/01`–`04`,
   `docs/design/20`–`29` (Appendix A's range citations carry normative detail the
   body never restates, spec E-12).
3. `docs/tickets/00_MANIFEST.md` — chain order (round-4 banner), `docs/tickets/DEFERRALS.md` — in full.
4. The composed tree at `30afea7` — `git diff fab08ed...30afea7` plus the final
   files: `packages/contracts/src/spa.ts`, `apps/web/src/{server.ts, spa-shell.ts,
   spa-boot.ts, bff.ts, dom-contract.ts}`, `apps/web/src/spa/**`, `vite.config.ts`,
   `tsconfig.spa.json`, `client-entries.mjs`, `infra/config/stages.ts`,
   `packages/journeys/src/{runner,registry,surface-gates}.ts`, all `scripts/check-*`
   gates, and the colocated test suites.

Per-ticket `runs/*.md` ledgers were **not** read before verdicts froze.

**Verdict rubric** (round-3 vocabulary, verbatim):

- `MET` — implemented in the composed tree and evidenced by deterministic tests.
- `MET-DIFFERENTLY` — literal mechanism superseded by a spec amendment/ruling or
  retired by the spec's own sunset clause (e.g. R11's `{url}`-validation for
  REQ-SAFE-6; REQ-SEQ-4's "override machinery retires post-last-flag" for
  REQ-SEQ-1/3/4; the spec-accepted `draft:<id>` registry keying for REQ-NAV-6).
- `PARTIAL` — implemented in part, or implemented-but-unverified where the
  requirement's own evidence bar is a live leg that is still owed.
- `MISSING` — no implementation in the tree. *(None.)*
- `AT-RISK-INTEGRATION` — parts pass but the composed path is demonstrably broken.
  *(None — the one composed-path divergence found, §4.5, is posture-preserved at
  the BFF layer and is recorded as a routed seam finding instead.)*

## 2. Roll-up by verdict

| Verdict | n |
|---|---|
| MET | 174 |
| MET-DIFFERENTLY | 12 |
| PARTIAL | 6 |
| MISSING | 0 |
| AT-RISK-INTEGRATION | 0 |

Every PARTIAL row is a **verification-procedure** requirement (VFY-6/8/10,
SEQ-7/9/10) — no implementation-mechanism requirement is unmet. Every one is
backed by existing DEFERRALS rows **and** routed to SPACAP.3.

## 3. Roll-up by requirement family

| Family | n | MET | MET-DIFF | PARTIAL |
|---|---|---|---|---|
| REQ-INV | 8 | 6 | 2 (5, 8) | — |
| REQ-ISL | 16 | 15 | 1 (11) | — |
| REQ-DAT | 14 | 14 | — | — |
| REQ-TST | 10 | 10 | — | — |
| REQ-FW | 12 | 9 | 3 (3, 4, 7) | — |
| REQ-TL | 14 | 14 | — | — |
| REQ-BFF | 30 | 30 | — | — |
| REQ-ED | 17 | 17 | — | — |
| REQ-UX | 16 | 16 | — | — |
| REQ-NAV | 11 | 10 | 1 (6) | — |
| REQ-BND | 12 | 11 | 1 (11) | — |
| REQ-VFY | 10 | 7 | — | 3 (6, 8, 10) |
| REQ-SAFE | 10 | 9 | 1 (6) | — |
| REQ-SEQ | 12 | 6 | 3 (1, 3, 4) | 3 (7, 9, 10) |

The pattern mirrors round 3 inverted: **every mechanism requirement is MET; the
only debt left is live verification** — and unlike round 3, the red evidence is
concentrated in exactly one blocking prerequisite (`rhema-nonprod-resend-api-key`,
D-MAINT.6-1) plus the operator's merge/deploy cadence, not in missing code.

## 4. Seam hunt

The hunt covered the six contracted seams plus the generic classes from round 3
(dual-owned surfaces, code/test/deployed divergence, composed paths never run).

### 4.1 Boot-payload staleness across flag flips — resolved by removal

The staleness channel a flag model necessarily has (shell served at T0, flag flips
at T1, embedded verdict map lies) **no longer exists**: post-SPA.28 the verdict
map is *static capability truth* — `spa-shell.ts:177-182` marks a route `"ssr"`
only for `surfaces:null` server-owned rows, `SPA_PUBLIC_ROUTES`, and
`deviceClass === "phone" && doc.pageMount`. Nothing in the map can change between
a document's serve time and a later client nav except `deviceClass`, which cannot
change mid-session. Residual staleness is bounded to `principal`/`theme` — and
`/session` is the refetchable oracle (REQ-BFF-18/19), so a stale seed
self-corrects on refetch; a hard 401 still document-navigates to `/login`.
**Verified — no gap.**

### 4.2 Mixed SPA→SSR and SSR→SPA navigations — verified

SPA→SSR: `SsrHandoff`/`navigateDocument` (`spa/states.tsx`) fires for every
`"ssr"` verdict, `/logout` stays a native form POST, external hand-offs are
`{url}` + `location.assign`. SSR→SPA: public/SSR documents link plain hrefs; a
document load hits the fixed handler order and gets the shell. The router never
renders across the seam in either direction. `spa.dom.test.tsx` pins both legs.
**Verified — no gap.**

### 4.3 localStorage/IDB schema coexistence — verified

Both sides of the boundary read identical keys: `rhema:theme:v1`,
`rhema:paper:v1:<slug>`, `rhema:panes:v1:<user>:<project>`, `rhema:font:v1`,
`rhema:reader-step:v1`, `rhema:authorship:v1:<projectId>`; IDB stores
`rhema-page/draft:<id>` (collab persistence) and `rhema-hold`/`landing-dropzone`
are shared verbatim — the same framework-free `client/collab.ts` module served
the island and now serves the SPA mount, so codecs cannot drift. A user carrying
SSR-era storage into the SPA hits identical keys. **Verified — no gap.**

### 4.4 The `ide-chrome` AND gate at flip boundaries — reduced to structural truth

The window-era seam (a framed surface flipped without `ide-chrome` ⇒ bare outlet)
is gone with the flags. The surviving gate —
`routeId ∈ SPA_IDE_FRAMED_ROUTES AND boot.surfaces[routeId] === "spa"`
(`spa/ide/chrome.tsx`) — can only exclude chrome where the server *never serves a
shell at all* (the phone `pageMount` forced-SSR case), so it cannot misframe a
mounted surface. Consistent on both sides. **Verified — no gap.**

### 4.5 Forced SSR vs SPA.28 — one real divergence found (LOW, routed)

`server.ts:3894` — `forcedSsr = isPhoneRequest(c) || row.showcase === true` — has
**two** legs. `spa-shell.ts:179` replicates only the first:

```ts
const forcedSsr = deviceClass === "phone" && doc.pageMount === true;
```

The `row.showcase` leg is row data the request-scoped boot payload cannot see.
Consequence: on desktop the boot map marks all five Page-family routes `"spa"`
*even for showcase projects*. A client-side navigation to `/p/<showcase-slug>`
(and its `/v`, `/diff`, `/a`, `/revisions` leaves) renders the SPA Page where a
document load would have served the forced-SSR read-only document.

Mitigating facts keep this LOW, not AT-RISK: the BFF aggregates apply the
identical `phone || row.showcase` guard (`server.ts:5224-5225`, `5265-5266`,
`5484-5488`) — `readOnly: true` ships and `collabWsUrl` is withheld, so the SPA
mount lands in the same read-only, collab-less posture the SSR document enforces.
The divergence is renderer label + render path (SSR doc embeds `docJson` inline;
SPA fetches the aggregate), not capability. Reachability is real but narrow: the
`/bff/app` twin ships `listProjects` rows unfiltered (`server.ts:~511`) and an
opened/archived Showcase is "just a row" in the project list (`server.ts:2590`),
so an in-SPA link to a showcase Page-family route exists.

→ **SPACAP.3 (LOW).** Owning surface: `spa-shell.ts`/`spa-boot.ts` boot map vs
`server.ts` forced-SSR arms. Proposed resolution: either (a) have the Page-family
BFF aggregates flag `showcase` and let the leaf `beforeLoad` hand off to a
document load (preserves forced-SSR as a server verdict), or (b) accept the
divergence and record it — posture already enforced at the BFF layer.

### 4.6 Deferred-leg blast radius at merge time — the headline risk (HIGH)

The whole-build exposure is not a code defect; it is **deployment-ordering**:

- **Prod serves a pre-chain ancestor.** Every SPA PR is committed but undeployed;
  all 14 prod flips exist only as stage facts that were themselves retired by
  SPA.28 (`stages.test.ts` now pins `spaSurfaces` *absent*).
- **Every live-verification leg is OPEN behind one prerequisite.** The 14
  `D-SPA.*-1` preview two-legs, the `*-2` rollback drills, `D-SPA.25-1` (T17),
  `D-SPA.6-1`, and all `D-SPAF.*-1/-2` prod legs wait on
  `rhema-nonprod-resend-api-key` in `rhema-507501` (D-MAINT.6-1) plus operator
  merges and nightly cycles (`D-SPAF.*-4`).
- **The ordering hazard:** the cleanup wave (SPA.26/27/28) sits *above* the flips
  in this stacked chain, while its entry gates (`D-SPA.26-1/-27-1/-28-1`: all
  flips merged + ≥1 nightly green since the last flip) can only be satisfied by
  deploying *below* it. If the operator merges bottom-up and deploys each PR at
  its own provenance, the cadence works and every gate binds. If the operator
  deploys only the tip, prod jumps all-SSR → all-SPA in one deploy and **Q-5's
  config-flip rollback dies with it** — SPA.27 deleted the SSR documents and
  SPA.28 deleted `SPA_SURFACES`/`?ssr=1`/`x-rhema-renderer`, so post-cleanup
  rollback is `git revert` of cleanup commits + redeploy (recorded in
  `D-SPAF.14-3`'s SPA.28 amendment). The `D-SPAF.*` leg recipes that still name
  `?ssr=1`/pin-renderer are unfulfillable as written after cleanup deploys —
  partially amended already (`D-SPA.28-2`), but the *verification order* they
  encode ("prove the flip before you delete the fallback") cannot run in-chain.

→ **SPACAP.3 (HIGH — process, not code).** Owning surface: merge/deploy
runbook + DEFERRALS. Proposed resolution: an operator-facing merge/deploy
sequence that deploys and verifies each flip (or accepts the amended single-leg
`--expect-renderer spa` + revert-of-cleanup recipe) *before* the cleanup commits
reach prod; fold the surviving verification legs into SPACAP.2's composed run.

### 4.7 What was not found

- No dual-owned surfaces: surface ownership is disjoint by ticket (SPA.10–25),
  and shared seams (boot map, head manager, BFF envelope, dom-contract) have one
  owner each with a checker.
- No MISSING implementation: all 192 requirements have code in the tree.
- No AT-RISK-INTEGRATION: no composed path is demonstrably broken; §4.5 is the
  closest and is posture-preserved.

## 5. Routed gap list → SPACAP.3

| # | Severity | Finding | Evidence | Owning surface | Proposed resolution |
|---|---|---|---|---|---|
| G1 | HIGH | Merge/deploy ordering: cleanup wave can reach prod before any flip is verified live; config-flip rollback dies at SPA.27's merge | §4.6; D-SPAF.14-3/-4 amendments; `stages.test.ts` `spaSurfaces`-absence pin | DEFERRALS + operator runbook | Ordered merge/deploy sequence; fold surviving legs into SPACAP.2; keep revert-of-cleanup as the documented rollback |
| G2 | LOW | Boot map misses the `row.showcase` forced-SSR leg | §4.5; `spa-shell.ts:179` vs `server.ts:3894`, BFF guard `server.ts:5224-5225` | `spa-shell.ts`/`spa-boot.ts` + Page-family aggregates | Aggregate-flagged `showcase` + leaf `beforeLoad` handoff, or record accepted divergence |
| G3 | MED | REQ-VFY-8's flip procedure is unexecutable post-SPA.28 (leg A's pin/flag machinery deleted) and was never run live | DEFERRALS `D-SPA.*-1` all OPEN; `renderer-overrides.test.ts` | Journey runbook + DEFERRALS recipes | Amended single-leg recipe (landed in part via D-SPA.28-2); run preview legs when Resend prerequisite clears |
| G4 | MED | Owed free journey steps still `expected:"red"`: R6F, T12F, T13F, T17 | `registry.ts`; REQ-VFY-10/ED-17 | `packages/journeys` + preview stack | Run on the first signed-in preview after D-MAINT.6-1 unblocks |
| G5 | MED | Journey-level axe (P1 family) — authoritative a11y gate — has no green live leg | REQ-VFY-6 row; `D-MAINT.6-1` | `packages/journeys` | Same unblock as G4; component-axe already covers the manifest subset |

## 6. Verification record

- `scripts/check-coverage-matrix.test.mjs` — **6/6 green** (extended this run:
  authoritative inventory is now the design-spec ∪ SPA-spec union, with
  `REQ-FAM-a..b` range expansion for the Appendix-A index-only ids).
- Full gate results (`pnpm turbo build lint typecheck`, `pnpm test`, all
  `check:*`, build-memory validators) are recorded in `docs/build/runs/SPACAP.1.md`.

## 7. Caveats

- Verdicts judge the composed tree, not deployed behavior: prod runs a pre-chain
  ancestor, so no MET row claims live proof; live-leg debt is carried by
  DEFERRALS and §4.6.
- `expected:"red"` journey steps were taken at face value (registry state, not
  re-execution); SPACAP.2 owns re-execution.
- MET-DIFFERENTLY rows for retired migration machinery (SEQ-1/3/4, FW-3,
  BND-11, INV-5/8, ISL-11, NAV-6, SAFE-6, FW-4/7) assert the *amended* end
  state the spec's own sunset clauses and rulings prescribe — evidenced by the
  tripwire tests that now pin the machinery's absence.
