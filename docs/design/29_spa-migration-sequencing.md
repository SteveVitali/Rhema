# 29_spa-migration-sequencing — Migration sequencing: the flag mechanism, flip order, and two-mode coexistence

**Stream:** D
**Researched:** 2026-10-07
**Author:** design-row worker D3 (subagent)
**Ledger rows covered:** D3
**Confidence overall:** high

All evidence is repo-local. Operator-fixed constraints honored throughout: Q-5 strangler behind
per-surface flags with SSR fallback and config-flip rollback; Q-7 stacking on the unmerged 45-PR
chain tip; Q-6's $50 envelope (per-flip gates are $0 legs per REQ-VFY-10); B4's "Page flips last";
JOURNEY.1/REQ-SPEC-29 journeys as acceptance authority with the REQ-VFY-8 two-leg procedure.

## Findings

### F1 — The `signupMode` precedent is end-to-end and load-bearing: env → fail-closed parser → `WebDeps` → stage fact → `compute.ts` env → per-stack Pulumi config override

**Claim:** The flag mechanism slots into an existing, prod-proven pipeline with five seams already
in place: (a) `packages/contracts/src/signup.ts:9-15` — `SIGNUP_MODES` const + `parseSignupMode`,
unset/unparseable ⇒ `invite` (fail-closed, unit-tested at `signup.test.ts:8-15`); (b) `WebDeps`
(`apps/web/src/server.ts:121-163`) carries `signupMode?: SignupMode` with the "unset ⇒ invite —
the flag fails closed" comment at `:140-143`; (c) `main.ts:108` wires
`signupMode: parseSignupMode(process.env.SIGNUP_MODE)`; (d) `infra/config/stages.ts:215-220`
carries `signupMode` as a `StageConfig` field (`dev`/`preview` = `"invite"`, `prod` = `"open"`,
stages.ts:310,324,342) consumed by `compute.ts:919` as `{ name: "SIGNUP_MODE", value:
cfg.signupMode }` on the `web` service (and `:734` on `api`); (e) per-stack overrides exist as the
`rhema:<key>` Pulumi config pattern (`rhemaConfig.getObject<Record<string,string>>("serviceImages")`,
`infra/pulumi/index.ts:86`), settable on `pr-<n>` stacks through the guard-scoped
`scripts/live/preview-stack.mjs` `config` verb (`:148-157`) — the ONLY permitted config path on
owned previews. `B1`'s F10 already prescribed this exact shape: `spaSurfaces?: ReadonlySet<string>`,
env `SPA_SURFACES` CSV, fail-closed to ∅ (`docs/design/20_spa-framework-binding.md:185-201,326-336`).

**Status:** VERIFIED
**Evidence:** file:line citations above; B1 F10
(`docs/design/20_spa-framework-binding.md:185-201`); C3's handler-shape pseudocode already names
`deps.spa(surfaceName(c))` (`docs/design/26_spa-public-auth-boundary.md:316-325`).
**Retrieved:** 2026-10-07T22:15:00Z
**Implication for the spec:** `SPA_SURFACES` is a mode-string env (never a secret — matching
`SIGNUP_MODE`/`PURCHASE_MODE`/`DEBIT_MODE` convention), parsed by a `parseSpaSurfaces` sibling to
`parseSignupMode` (CSV → `ReadonlySet<SpaSurface>`; unknown tokens dropped, unset ⇒ ∅, never
throws); a new `StageConfig.spaSurfaces` fact feeds `compute.ts`'s web-env block; a
`rhema:spaSurfaces` stack config overrides the stage fact so previews/dev can flip without
commits. A flip is therefore *two* auditable shapes: a stage-fact commit (dev/prod, like the
`purchaseMode`/`debitMode` "flip in a commit" posture at stages.ts:222-247) or a per-stack config
set (previews).
**Outline delta:** EXTENDS B1 F10/Q-5 into the concrete deploy mechanics; names the two flip
channels.

### F2 — The surface-key vocabulary needs 14 keys + one composite chrome gate; `/p/:slug` belongs to `editor`, not `project-home`

**Claim:** The gate-table vocabulary (D1 F9: onboarding / project-home / dossier / editor /
run-sheet / run-report / inbox / settings / voices / export / billing / usage / ide-chrome)
leaves five census route families homeless (outline, figures, visualize, obligations, import)
and collides on one: `/p/:slug` mounts the working-head Page editor (`pages.tsx:747-751`, per
`docs/design/25_spa-navigation-ia.md:60-62` and `docs/design/23_spa-editor-collab-binding.md`), so
it cannot flip before the Page port exists — it belongs to the `editor` flag, and `project-home`
reduces to `/app` alone. D1's open Q2 explicitly permits finer-than-gate-table flags; `outline`
and `figures` get their own keys, `obligations/new` folds into `dossier`, `/p/:p/import*` into
`onboarding`. `ide-chrome` has no route of its own — it is the `p.$project` layout (panes,
palette, keymap, feed) that ~11 project routes share
(`docs/design/25_spa-navigation-ia.md:22-24`); as a flag it works cleanly as an AND-gate: an
IDE-framed route serves SPA iff its surface key AND `ide-chrome` are both present — a composite
that doubles as a chrome-wide rollback lever.
**Status:** VERIFIED (route facts); the key assignment is design judgment grounded in them
**Evidence:** `apps/web/src/pages.tsx:747-751` (Page mount on `/p/:slug` — cited via
`25_spa-navigation-ia.md:62`); the ~11-route IDE-shell list (`25_spa-navigation-ia.md:22-24`,
`server.ts` `ideContext` call-sites); D1 gate table + OQ2
(`docs/design/27_spa-acceptance-mechanics.md:124-145`); route tree
(`25_spa-navigation-ia.md:105-154`); B4 "Page flips last" (`REQ-ED-13`,
`23_spa-editor-collab-binding.md:274`).
**Retrieved:** 2026-10-07T22:15:00Z
**Implication for the spec:** The normative route→key map is §Design-table-1 below; every auth'd
document GET maps to exactly one key; redirect-only GETs (`/app/usage/r/:runId`, `/p/:p/f/:fid`,
`/p/:p/edit/:d`, `/settings`, `/app/settings` bare) carry NO key — they are server-owned at every
flag state (REQ-BND-3). D1's "project home / IDE" gate legs (R1, R7, T6, T7, T2.badge, P1.project,
X1.home — `27_spa-acceptance-mechanics.md:127`) exercise `/p/:slug` and therefore migrate into
`editor`'s gate set.
**Outline delta:** CORRECTS the naive project-home mapping (the Page mount forces `/p/:slug` into
the last flag); EXTENDS the vocabulary to 14 keys.

### F3 — Foundations are a hard prerequisite of the first flag: eight workstreams must land before ANY surface flips

**Claim:** Nothing can flip until all of these exist: (1) Vite toolchain + asset serving +
public-safe job delta (REQ-FW-12, REQ-SAFE-1/2/7/8/9/10 — build-then-scan, REQUIRED_DIRS,
provenance scan, bundle budget, spa-env, Dockerfile COPY alignment); (2) the shell document +
flag plumbing (REQ-BND-5, REQ-FW-3/REQ-FW-10 — `renderSpaDocument` through the nonce middleware,
`data-spa-boot` carrying `{principal, theme pref, device, spaSurfaces}`); (3) flag deployment
wiring (F1: contracts parser, `WebDeps.spaSurfaces` + `deps.spa(c, surface)`, stage fact,
`compute.ts` env, `rhema:spaSurfaces` config); (4) the renderer/device markers (REQ-VFY-7
`data-renderer` on EVERY document — SSR included — and REQ-VFY-5 `data-device` on the shell);
(5) the router skeleton + `GET /session` BFF + `bffFetch` + `SsrHandoff` (REQ-NAV-1, REQ-BND-6,
REQ-FW-5/6, `25_spa-navigation-ia.md:244`); (6) the settle contract emitted by BOTH renderers
(F5 below); (7) the journey harness: `--expect-renderer`, `--surface`, `SURFACE_GATES`,
`assertRenderer`, settle-aware helpers, P1/X1 sub-step splits (REQ-VFY-7, D1 F3/F7); (8) the
dom-contract manifest + `check:dom-contract` + the RTL component-test stack (REQ-VFY-1/2).
**Status:** VERIFIED (each item is an emitted requirement from a prior note; the conjunction is
this row's claim)
**Evidence:** REQ-FW-3/5/6/10/12 (`20_spa-framework-binding.md:483-520`); REQ-BND-4/5/6/8
(`26_spa-public-auth-boundary.md:363-380`); REQ-VFY-1/2/3/5/7
(`27_spa-acceptance-mechanics.md:154-161`); REQ-SAFE-1/2/7/8/9/10
(`28_spa-safety-gates.md:121-130`); `SsrHandoff` strangler hand-off
(`25_spa-navigation-ia.md:244`).
**Retrieved:** 2026-10-07T22:15:00Z
**Implication for the spec:** A "no flag may be set on any stage until the foundation set lands"
gate belongs in the spec — the flag mechanism's fail-closed ∅ default makes the enforcement
trivially safe (an early flag is a no-op without the shell to serve), but the journey-side
prerequisites (`--expect-renderer`, gate table, settle markers) are the load-bearing half: the
two-leg procedure cannot run without them.
**Outline delta:** EXTENDS REQ-VFY-8 — "the flagged stage" presumes a verification surface that is
itself a deliverable.

### F4 — The flip order: leaf surfaces → composite surfaces → the IDE cluster → editor last; usage first

**Claim:** The dependency-ordered sequence is: **usage → inbox → settings → voices → onboarding →
project-home → billing → export(+ide-chrome) → outline → figures → run-sheet → dossier →
run-report → editor (last, fixed)**. Justification per position is in §Design-table-2; the load-
bearing rationale: (a) the first flip is the pipeline's rehearsal — it must be the smallest,
lowest-mutation surface (`/usage` = one read page + a binary CSV sibling that stays
document-nav; gate = the X1.usage leg alone, per D1 F9); (b) chrome is deliberately exercised on
the smallest IDE-framed surface (`/export` — R5/T4 + T8-red; content is thin so failures isolate
to the layout); (c) `onboarding` is the first cross-boundary surface (the IDB hold handshake,
REQ-BND-10) and the first pending-poll re-spec (REQ-VFY-4), so it follows four leaf proofs;
(d) `billing` waits for the `{url}`+`location.assign` hand-off pattern (REQ-BND-9/REQ-SAFE-6)
which nothing earlier exercises; (e) `run-report` sits late because it has ZERO free journey
coverage today — its flip is gated on a new free report-render step that must exist first
(REQ-VFY-10, D1 F9); (f) `editor` last is operator-fixed (REQ-ED-13) and absorbs `/p/:slug`
(F2).
**Status:** VERIFIED (as a justified proposal; the ordering itself is the design deliverable)
**Evidence:** per-surface gate subsets + free-coverage gap analysis
(`27_spa-acceptance-mechanics.md:114-140`); per-surface extraction difficulty
(`docs/research/03_data-layer-audit.md:135-169` — settings "near-trivial", run-sheet "the largest
extraction", `/p/:slug` "the heaviest composite"); SSR-mechanics legs per step
(`27_spa-acceptance-mechanics.md:40-76`); Page-last (REQ-ED-13).
**Retrieved:** 2026-10-07T22:15:00Z
**Implication for the spec:** the ordering table is normative input to decomposition; each
position names its justification (risk × dependency × gate coverage) so later reorderings are
conscious decisions, not drift.
**Outline delta:** EXTENDS Q-5/REQ-ED-13 into the full surface sequence.

### F5 — The two-leg procedure needs a per-request renderer override, or it degenerates to two deploys per flip

**Claim:** REQ-VFY-8's legs A (flag OFF, `--expect-renderer ssr`) and B (flag ON,
`--expect-renderer spa`) run against "the flagged stage" — but the flag is env-level: one
deployment serves one truth per route. Without a request-level escape hatch, the procedure costs
two Cloud Run revision rolls per flip (deploy flag-∅ → leg A → `pulumi up` flag-on → leg B). The
clean mechanism: a per-request renderer override — header `x-rhema-renderer: ssr|spa` honored by
`deps.spa(c, surface)` — which journeys drive via `context.setExtraHTTPHeaders` (the P1 `MOBILE`
precedent, `packages/journeys/src/steps.ts:1611`). One flagged deployment then serves BOTH legs:
leg A under `x-rhema-renderer: ssr`, leg B un-pinned (env truth = flag ON). The same mechanism
doubles as (a) the incident/debug escape hatch (`?ssr=1` query form for humans — B1 OQ3's open
question, `20_spa-framework-binding.md:457-458`), (b) pre-flip dogfooding of SPA surfaces
(`x-rhema-renderer: spa` on non-prod), and (c) post-flip leg-A re-verification on prod without a
rollback deploy. Safety asymmetry: **force-SSR anywhere, force-SPA only off-prod** — the SSR
document is always the supported fallback while it exists, so honoring it can never expose an
unproven surface; forcing SPA on prod would bypass the committed flag set. Gate the spa-override
on an explicit non-prod env (`SPA_OVERRIDES=1`, set only when `cfg.kind !== "prod"` — the
`IDENTITY_HEADERS` precedent at `compute.ts:803`) or on `RHEMA_STAGE !== "prod"` (already set on
every service, `compute.ts:523`).
**Status:** VERIFIED (mechanics grounded in the flag's env-level nature + the existing
`setExtraHTTPHeaders` and non-prod-env precedents)
**Evidence:** `main.ts:102-114` (env → deps wiring); `steps.ts:1611` (header-pinning precedent);
`compute.ts:523` (`RHEMA_STAGE`), `:803` (non-prod-only env precedent); `server.ts:5669` +
`26_spa-public-auth-boundary.md:87-104` (every document is server-produced — the branch point is
universal); B1 OQ3.
**Retrieved:** 2026-10-07T22:15:00Z
**Implication for the spec:** the override is REQUIRED infrastructure, not an option — REQ-VFY-8's
procedure is otherwise un-runnable without double deploys. The runner gains
`--expect-renderer <m>` (asserts `data-renderer` on gated-surface documents) and, for leg A, pins
the header on the browser context; `?ssr=1` is the human-facing form (all stages, one-shot,
document-level). Overrides never bypass the session gate, the server-owned redirect logic, or the
forced-SSR capability checks (phone/showcase — REQ-ED-12).
**Outline delta:** RESOLVES B1 OQ3 + D1's implicit "flag OFF vs flag ON on one stage" ambiguity;
EXTENDS REQ-VFY-7/8 with the mechanism.

### F6 — Re-spec'd journey probes must be renderer-agnostic: the settle markers have to exist on SSR documents too

**Claim:** Leg A runs the SAME steps leg B runs. A probe re-specified per REQ-VFY-4 to wait on
`[data-route="<id>"][data-mounted]` fails on SSR unless SSR emits the marker — so `data-route`
(and `data-renderer`, REQ-VFY-7) must be stamped on every SSR document (cheap: `renderDocument`
knows the path — `render.tsx:115-179`, `htmlAttrs` assembly at `:138`) and `data-mounted` emitted
statically (an SSR document is complete at serve; the SPA flips the same attr after first data
paint). Likewise every re-spec must use manifest hooks (`[data-x]`) rather than tag-qualified
SSR-mechanics selectors (`form[action=…]`) — the manifest documents today's emitted DOM, so
hook-based probes pass on both renderers by construction. This is what makes leg A meaningful: it
is not "did SSR change" (it provably didn't — the branch is additive) but "does the surface still
*behave* under the fallback."
**Status:** VERIFIED (mechanics; the requirement is a consequence of REQ-VFY-8's same-subset rule)
**Evidence:** `render.tsx:115-179` + `:138` (document assembly + html attrs — the stamp site);
REQ-VFY-3 settle contract (`27_spa-acceptance-mechanics.md:156`); REQ-VFY-2 manifest
(`27_spa-acceptance-mechanics.md:155`); `27_spa-acceptance-mechanics.md:98` (leg A = "proves the
fallback unchanged" — under re-spec'd probes it needs the markers).
**Retrieved:** 2026-10-07T22:15:00Z
**Implication for the spec:** extend REQ-VFY-3's settle contract to "both renderers":
`data-route`/`data-renderer`/`data-mounted` on every document `apps/web` serves; re-spec'd steps
assert hooks + markers only, never `domcontentloaded`/`form[action]`/`var R=`.
**Outline delta:** EXTENDS REQ-VFY-3/4 — without the SSR-side markers the two legs assert
different contracts and leg A is vacuous.

### F7 — What a "surface ticket" contains end-to-end; the prod flip is a separate tiny PR, not part of the ticket

**Claim:** A surface ticket is eight deliverables: (1) the surface's BFF read endpoints
(REQ-DAT-1, aggregate-or-fan-out per REQ-DAT-4); (2) JSON mutation equivalents for its form
POSTs (REQ-DAT-3 — structured `{notice, redirect, url}`-style responses replacing 302+flash);
(3) the ported React components under the route tree emitting the verbatim `data-*` vocabulary
(REQ-VFY-2 manifest entries; REQ-ED-6-style emitted-DOM parity; COPY-leaf strings per
REQ-SAFE-4; the route's `data-route`/`data-mounted` settle emission); (4) component tests per
the REQ-VFY-9 class map (render-assert → RTL; status/forward → BFF API tests kept;
form-POST → mutation tests; logic → port) + component-axe on interactive components
(REQ-VFY-6); (5) the unit-test disposition for its A4-F2 files — the SSR test file is RETAINED
green (it is the fallback's safety net; REQ-VFY-8/REQ-TST-1 gate deletion to post-last-flag);
(6) the journey work: SSR-mechanics legs re-specified renderer-agnostically (F6) +
`SURFACE_GATES` entry + any new free steps the surface owes (run-report, dossier —
REQ-VFY-10); (7) the preview gate run: legs A+B+C on the ticket's `pr-<n>` stack (flag set via
`rhema:spaSurfaces` config) + a rollback drill (flag removed → leg A re-run); (8) optionally the
`dev` stage-fact line (dev dogfoods on merge+deploy — the progressive posture in F9). It does
NOT contain: the prod flag flip, SSR deletions, api/schema changes (the brief's out-of-scope:
"Backend data-model changes; api route semantics" — `docs/frontend-spa-brief.md:37-38`).
The **prod flag flip is a separate minimal PR** touching only `STAGES.prod.spaSurfaces` — the
`purchaseMode`/`debitMode`/`refundWindowMode` convention ("the operator flips the stage fact in
a commit (auditable)", `stages.ts:222-247` comments) — merged by the operator and deployed via
`pulumi up`; mergePolicy OPERATOR means the flip is an operator act anyway, and a one-line diff
keeps rollback a one-line revert.
**Status:** VERIFIED (deliverable list composed from emitted requirements; the separate-PR
recommendation grounded in the stage-fact convention + merge policy)
**Evidence:** `infra/config/stages.ts:222-247` ("flip the stage fact in a commit (auditable),
never a flag that could fail open"); `docs/build/INTEGRATION_PLAN.md:3-7` + `docs/build/LEDGER.md:39`
(`mergePolicy: OPERATOR` — "a run never merges its own PR"); REQ-TST-1/REQ-VFY-8/9/10
(`04_test-surface-audit.md:125`, `27_spa-acceptance-mechanics.md:161-163`); brief out-of-scope
(`frontend-spa-brief.md:37-38`).
**Retrieved:** 2026-10-07T22:15:00Z
**Implication for the spec:** the per-ticket checklist is enumerable — attach it to the
decomposition prompt; the flip PR's diff budget (one line + run-ledger evidence reference) is a
spec-level rule.
**Outline delta:** EXTENDS REQ-VFY-8 into the ticket shape; answers "where the flip lives" with
the stage-fact precedent.

### F8 — Rollback is a flag revert + redeploy; it covers document serving only, and four named hazards are out of its scope

**Claim:** Removing a key from `SPA_SURFACES` and rolling the web service restores SSR serving on
the next document request — including for a live SPA tab (client navs to the now-unflipped
surface become document loads that converge to SSR; BFF endpoints are additive and stay
harmless). Rollback does NOT cover: (a) **deleted SSR code** — the SSR handlers/elements/tests
are the fallback and are never deleted inside a surface or flip PR (REQ-VFY-8: "SSR tests
deletable only after the last flag falls"; REQ-TST-1's replacement rule); (b) **api/schema
drift** — preempted by the additive-only rule (F10) and the brief's out-of-scope line: the same
api serves both renderers, so nothing SSR needs may change shape; (c) **client-state schema
divergence** — localStorage/IDB keys are origin-shared across modes (`rhema:ide:v1:*`,
`rhema:authorship:v1:<p>`, `rhema-hold`, `rhema-page/draft:<id>`), so REQ-NAV-6's verbatim-schema
rule is a rollback requirement, not just a UX nicety — a mode switch that corrupts pane state is
a real defect; (d) **`data-*` contract drift** — a hook renamed for journeys must be emitted by
both renderers (the manifest is keyed by surface, and REQ-TST-2's codemod+registry-same-PR rule
applies to the SSR twin too) or leg A on a rollback goes red. The **unmerge discipline**: every
SPA PR must be deployable dark at flag-∅ (shared-file edits are additive — new branches, never
changed SSR behavior), and no ticket may land a change the SSR fallback cannot serve.
**Status:** VERIFIED
**Evidence:** `server.ts:3184-3186` + `26_spa-public-auth-boundary.md:316-325` (branch order —
flag-off path is byte-identical today's SSR); REQ-TST-1 (`04_test-surface-audit.md:125`), REQ-VFY-8
(`27_spa-acceptance-mechanics.md:161`); REQ-NAV-6 (`25_spa-navigation-ia.md:269`); the
localStorage/IDB key inventory (`25_spa-navigation-ia.md:76-78`, `02_island-contract-map.md` F5/F8);
INTEGRATION_PLAN §10 (revert discipline — `git revert -m 1`, never force-push).
**Retrieved:** 2026-10-07T22:15:00Z
**Implication for the spec:** the rollback contract is "config flip ⇒ SSR serves" *plus* the four
named exclusions as standing invariants; a live-session rollback degrades gracefully (next
document boundary → SSR) rather than breaking — worth naming as the expected UX.
**Outline delta:** EXTENDS Q-5's "rollback is a config flip" into its honest envelope.

### F9 — Progressive rollout is per-stage asymmetric: previews carry arbitrary flags via stack config, dev accumulates, prod crawls one surface at a time — and the nightly never flips anything

**Claim:** The stage machinery supports three postures already: (a) `pr-<n>` previews —
`rhema:spaSurfaces` stack config via `preview-stack.mjs config` (the ONLY config path the guard
permits, `preview-stack.mjs:42-44,148-157`), letting each surface ticket's preview carry its own
flag set; (b) `dev` — shared integration; the stage fact `STAGES.dev.spaSurfaces` accumulates as
surfaces pass, so dev dogfoods continuously (rollback = the same commit-revert channel);
(c) `prod` — one surface per flip PR with a bake. The **nightly journey run targets prod only**
(`journeys.yml:36` `JOURNEY_WEB_URL: https://rhema.tools`, `--stage prod` at `:72`; the CLI's
`--stage` resolver knows only prod's origins, `cli.ts:31-36`) — it neither flips flags nor runs on
dev; a merged flip is re-verified by the next scheduled nightly automatically. `workflow_dispatch`
(`journeys.yml:16-29`) + the local CLI (`--web`/`--api` overrides, `cli.ts:38-39`) cover
preview/dev runs on demand. Recommended prod posture: flag lands → next nightly is the
continuous re-verification (it runs `--expect-renderer`-agnostic free legs — the renderer marker
makes the suite mode-correct by construction: flipped surfaces assert `spa`, unflipped assert
`ssr`) → ≥ one nightly green before the next surface's flip PR merges.
**Status:** VERIFIED
**Evidence:** `.github/workflows/journeys.yml:12-29,35-39,62-76` (cron + env + `--paid` gating);
`packages/journeys/src/cli.ts:31-36` (prod-only stage resolution — other stages need explicit
origins); `preview-stack.mjs:148-157`; `stages.ts:301-349` (per-kind stage facts).
**Retrieved:** 2026-10-07T22:15:00Z
**Implication for the spec:** preview→dev→prod is the rollout ladder; "nightly never flips" is
the invariant that keeps the acceptance authority clean — flags move only by committed stage
facts or owned preview configs.
**Outline delta:** EXTENDS the "preview/dev dogfooding" row into the concrete per-stage posture.

### F10 — Chain interplay: stack on the tip, stay additive, rebase once at the foundations↔surfaces boundary, never fix the inherited reds in-branch

**Claim:** Per Q-7 the SPA branch forks from the current chain tip (`docs/build/LEDGER.md:36`
`chainTip: stevevitali/res-3-leg1a-zero-coverage`; the unmerged stack is #70→#113 per
`docs/build/INTEGRATION_PLAN.md:13-16,35-80`). The operator merges bottom-up with merge commits;
branch deletion auto-retargets the immediate child's base to `main` (§5, lines 135-143) — but a
multi-PR SPA stack's deeper levels need a real rebase when the chain lands. The right checkpoint
is **after the foundation tickets, before the first surface ticket**: foundations carry nearly
all the shared-file surface area (`server.ts` handler branches, `main.ts` env wiring,
`stages.ts`, `compute.ts`, `packages/journeys`), while surface tickets are ~pure addition (new
`src/spa` trees, appended BFF registrations, appended test files) that replays cleanly. The
branch inherits two standing reds (`INTEGRATION_PLAN.md` §3b `public-safe` never-cookies on the
`rhema_fp` constructs; §3c `integration` privsep kernel legs) — fixing them belongs to a
fix-forward ticket at the tip per §7 Option A, never inside SPA work. Prod deploys are already
run pre-merge from branch SHAs (INTEGRATION_PLAN §9 — prod serves `b909fe9a` inside PR #100), so
SPA preview deploys + journey `--expect-sha` provenance work identically off-chain.
**Status:** VERIFIED
**Evidence:** `docs/build/INTEGRATION_PLAN.md:13-16` (stack state), `:120-143` (bottom-up + merge
commits + auto-retarget), `:191-207` (the two standing reds + fix-forward options), `:231-281`
(pre-merge deploys + provenance-by-ancestry); `docs/build/LEDGER.md:36,39`.
**Retrieved:** 2026-10-07T22:15:00Z
**Implication for the spec:** one declared rebase checkpoint (foundations done → first surface
ticket) absorbs the "chain may or may not be merged" uncertainty; the additive-only rule (F8) is
also the rebase-safety rule — shared files get insertions, not edits.
**Outline delta:** EXTENDS Q-7 into a concrete stacking/rebase policy.

### F11 — Mixed-mode coexistence: the boundary is always a document load, and four hazards have concrete dispositions

**Claim:** The URL space is identical in both modes (REQ-FW-3/4 — same URL, two documents), so:
(a) **flipped→unflipped and unflipped→flipped navigations are document loads** — the SPA's
`SsrHandoff` `location.assign`s on unflipped targets (`25_spa-navigation-ia.md:244`); the client
knows which targets those are because `data-spa-boot` carries the effective flag set (B1's boot
blob includes "surface flag set", `20_spa-framework-binding.md:266-268`); (b) **stale boot sets
converge gracefully** — the tree registers every route day one (REQ-NAV-1), so a boot set older
than the deployed flags either sends a document request the server resolves to current truth, or
client-renders a route that exists anyway; (c) **client state loss at the boundary is bounded**
— Query cache, the PageSessionRegistry, and live SSE/WS die on unload, but the four-layer
autosave + pagehide flush make unmount safe by design (`25_spa-navigation-ia.md:56-62`,
REQ-ED-5) and all durable state lives in mode-agnostic localStorage/IDB (F8c); (d) **deep links
work in both modes** — `validateSearch` reproduces the flash-param grammar verbatim (REQ-NAV-3),
and the server-owned redirect GETs resolve before any flag check (REQ-BND-3/11); (e) **two tabs
can legitimately sit in different modes** — sharing the same cookie session and the same
localStorage schema; the collab WS re-establishes per document with y-indexeddb bridging (the
existing multi-tab posture, `23_spa-editor-collab-binding.md:112-117`).
**Status:** VERIFIED
**Evidence:** citations inline; `20_spa-framework-binding.md:276-278` ("a flagged-off user's SSR
page links into a flagged-on surface (or vice versa) cross as normal GETs"); REQ-NAV-9/REQ-BND-9
boundary rules.
**Retrieved:** 2026-10-07T22:15:00Z
**Implication for the spec:** mixed-mode sessions need no special machinery beyond the boot flag
set + SsrHandoff; the hazards are all resolved by requirements already emitted (REQ-NAV-6/9,
REQ-ED-5, REQ-BND-11) — this finding collects them as the coexistence contract.
**Outline delta:** CONFIRMS the strangler semantics; EXTENDS with the stale-boot convergence rule.

### F12 — Honest ticket-count estimate: ~35–40 implementation tickets plus ~14 tiny flip PRs

**Claim:** Decomposition sketch: **foundations ≈ 8** (spec/ADR-106; Vite toolchain + public-safe
job delta; flag plumbing + shell doc + markers + deploy wiring; SPA skeleton — router/session/
bff/boot/head-manager/settle; dom-contract manifest + RTL stack; journey harness —
`--expect-renderer`/`--surface`/settle helpers/P1+X1 splits; `ide-chrome` layout — panes/palette/
keymap/feed; BFF mutation-response conventions + `{url}` hand-off validators); **14 surface
tickets** (one per §Design-table-1 key); **~14 prod flip PRs** (one stage-fact line each; dev
flips ride inside the surface tickets per F7); **2 new free journey steps** (inside the
run-report and dossier tickets per REQ-VFY-10); **~4 cleanup tickets** post-last-flag (SSR
handler/element deletion wave gated on REQ-TST-1; island-bundle retirement — `page.js`/`ide.js`/
`outline.js`/`editor.js` + `CLIENT_ENTRIES` shrink + asset-parity retarget; override machinery
removal — `?ssr=1`/`x-rhema-renderer`/flag parser; the `editorElement`/`routes.tsx` manifest
cleanup already owed per census F8).
**Status:** PARTIALLY VERIFIED — grounded decomposition; real counts land in decompose-spec
**Evidence:** §Design-table-2 enumeration; REQ-VFY-10's two gaps
(`27_spa-acceptance-mechanics.md:116-120`); dead-code dispositions
(`23_spa-editor-collab-binding.md:243-245`); census F8 stale-manifest note
(`01_route-census.md:76-80`).
**Retrieved:** 2026-10-07T22:15:00Z
**Implication for the spec:** ~8 + 14 + 2 + ~4 ≈ 28 substantive tickets + ~14 one-line flip PRs —
call it **~40 PRs total**, of which roughly a third are trivial config diffs. This is the
decompose-spec hand-off envelope.
**Outline delta:** NEW — the sizing input D3 owes O4.

## Design: the flag mechanism (concrete)

```
env SPA_SURFACES="dossier,run-sheet"            # CSV, mode string — never a secret
  → parseSpaSurfaces(raw)                        # @rhema/contracts sibling to signup.ts:
                                               #   unknown tokens dropped + one warn line;
                                               #   unset ⇒ ∅ — fail closed, never throws
  → WebDeps.spaSurfaces?: ReadonlySet<SpaSurface>
  → deps.spa(c, surface): boolean                # the per-request consult:
       session gate first (existing, unchanged)
       server-owned redirects/precedence (existing, unchanged — REQ-BND-11)
       forced-SSR capability checks (isPhoneRequest||showcase on Page family — REQ-ED-12)
       ?ssr=1 param or x-rhema-renderer:ssr header ⇒ false            (all stages)
       x-rhema-renderer:spa header          ⇒ true                    (SPA_OVERRIDES stages only)
       return set.has(surface) && (!ideFramed(surface) || set.has("ide-chrome"))
```

**Deploy wiring:** `StageConfig.spaSurfaces: readonly SpaSurface[]` (default `[]` on all three
kinds; unit-tested like `signupMode`) → `compute.ts` web-env `{ name: "SPA_SURFACES", value:
cfg.spaSurfaces.join(",") }` beside `SIGNUP_MODE` (compute.ts:919); `rhema:spaSurfaces` Pulumi
stack config overrides the stage fact when set (the `rhema:serviceImages` pattern,
index.ts:86). `SPA_OVERRIDES=1` env on web iff `cfg.kind !== "prod"` (the `IDENTITY_HEADERS`
precedent, compute.ts:803). `main.ts` adds `spaSurfaces: parseSpaSurfaces(process.env.SPA_SURFACES)`
+ the override-allowed flag — same shape as `main.ts:108`.

**Dev override story:** local dev = set `SPA_SURFACES` in the env, or hit any document with
`?renderer=spa`/`x-rhema-renderer: spa` (allowed because non-prod); `?ssr=1` forces SSR for that
document anywhere. Boot payload reports the effective set so `SsrHandoff` decisions match what
the next document load will serve.

## Design: route → surface key map (normative)

| Flag key | Document GETs | IDE-framed? | Notes |
|---|---|---|---|
| `onboarding` | `/app/new`, `/app/new/preview`, `/p/:p/import`, `/p/:p/import/preview` | last two only | import legs effectively wait for `ide-chrome` |
| `project-home` | `/app` | no | server precedence runs ahead of flag (REQ-BND-7) |
| `inbox` | `/app/inbox` | no | |
| `settings` | `/app/settings` + 5 sections, `/p/:p/settings` | no | `data` section = data-rights |
| `billing` | `/app/settings/billing`, `/settings/billing` (alias), `/billing/return` | no | Stripe `{url}` hand-offs |
| `voices` | `/voices`, `/voices/new`, `/v/:persona`, `/p/:p/voice/reseed` | no | multipart/presign flows (REQ-DAT-9) |
| `usage` | `/usage`, `/p/:p/usage` | no | CSV sibling stays binary nav |
| `export` | `/p/:p/export` | **yes** | first chrome-carrying flip |
| `outline` | `/p/:p/outline`, `/p/:p/outline/promote` | no | `ed.*` → structured JSON (A3 OQ4) |
| `figures` | `/p/:p/figures`, `/p/:p/figures/:id`, `/p/:p/visualize` | no | |
| `dossier` | `/p/:p/review/:runId`, `/p/:p/obligations/new` | yes (review) | heaviest search schema |
| `run-sheet` | `/p/:p/run` | yes | `var R=` → typed estimate DTO; `rhema_fp` mint preserved on the document GET |
| `run-report` | `/p/:p/r/:runId` | yes | zero free coverage today — new step first |
| `editor` | `/p/:p`, `/p/:p/v/:v`, `/p/:p/v/:n/diff/:m`, `/p/:p/a/:artifactId`, `/p/:p/revisions/:cid` | yes | LAST; `/p/:slug` here because it mounts the Page (F2) |
| *(no key)* | `/app/usage/r/:runId`, `/p/:p/f/:fid`, `/p/:p/edit/:d`, `/settings`, `/app/settings` bare | — | server-owned 302s at every flag state (REQ-BND-3) |

## Design: flip order (normative input to decomposition)

| # | Flip | Why here |
|---|---|---|
| 1 | `usage` | Smallest surface; one free leg (X1.usage); pipeline rehearsal incl. rollback drill |
| 2 | `inbox` | Small composite + 2 mutations; T2/R8.inbox/X1.inbox |
| 3 | `settings` | Mutation grammar + notice vocabulary + destructive ops (deletion/export request); T3/R8.prefs/T2.matrix |
| 4 | `voices` | Largest leaf — 15+ writes, multipart uploads exercising REQ-DAT-9; T5/X1.voices |
| 5 | `onboarding` | First cross-boundary surface (IDB hold REQ-BND-10) + first pending-poll re-spec (REQ-VFY-4); N1/N3/N4-half/P1.app-new |
| 6 | `project-home` | Post-login landing; heaviest non-IDE composite; server precedence ahead of flag is exercised live; R1/X1.home |
| 7 | `billing` | First `{url}`+`location.assign` hand-off consumer (REQ-BND-9/REQ-SAFE-6); `/billing/return` poll-as-data; N9 free legs |
| 8 | `export` + `ide-chrome` | First IDE-framed flip — smallest chrome-carrying content so failures isolate to the layout; R5/T4 (+T8 stays owed) |
| 9 | `outline` | Dual-mode autosave island → Query mutation; `ed.*` grammar → structured edit bodies |
| 10 | `figures` | Visualize + propose→editor deep links; mid-complexity |
| 11 | `run-sheet` | Largest extraction (`RunSheetView` render-bound); `var R=` → typed estimate DTO; `rhema_fp` mint; paywall single-mount; N4/R7.scope/N9.runsheet/P1.runsheet |
| 12 | `dossier` | Heaviest `validateSearch`; gate-card presence + triage/bulk; owns the T12F/T13F seeded-mutation free sub-steps (REQ-VFY-10) as a precondition; N7/T1/P1.dossier |
| 13 | `run-report` | Owes the new free report-render step (must prove green first); weekly-paid R6/R9 hold rule |
| 14 | `editor` | **LAST (fixed)** — PageSurface + session registry + collab bootstrap + one-⌘S owner + REQ-ED-12 branch; gate = N8 + P1.pill + retargeted `/p/:slug` legs (R7, T6, T7, P1.project, T2.badge) |

## Design: per-flip procedure (the runbook)

Per surface ticket's `pr-<n>` preview (build deployed at the branch SHA):
1. `preview-stack.mjs config pr-<n> rhema:spaSurfaces "<prior set>,<surface>"` → `up` (flag ON,
   preview only).
2. **Leg A:** `rhema-journeys --web <preview> --api <preview-api> --surface <id>
   --expect-renderer ssr --expect-sha <sha>` with `x-rhema-renderer: ssr` pinned on the context —
   proves the fallback verbatim.
3. **Leg B:** same command minus the header, `--expect-renderer spa` — the flagged render.
4. **Leg C:** full free-tier suite (`paid:false` only — REQ-VFY-10) on the flagged build.
5. **Rollback drill:** remove the key (`config` + `up`), re-run leg A — the revert path is
   exercised before prod ever sees it.
6. Evidence (report dirs, screenshots) into the run ledger + PR body; merge on unit+CI green.

Then: dev flag rides in the surface ticket (`STAGES.dev.spaSurfaces += key` — dev dogfoods on the
next dev deploy); the **prod flip is a separate one-line PR** merged by the operator + `pulumi
up`; the next nightly re-verifies; ≥ one nightly green before the following surface's prod flip.

## Design: rollback semantics and the unmerge discipline

- **Covers:** document serving (next document request → SSR), live tabs (graceful at the next
  boundary), BFF endpoints (additive, stay), and any surface at any flag state — because SSR
  code is never deleted mid-migration.
- **Does not cover / standing invariants:** SSR deletions (post-last-flag only, REQ-TST-1-gated);
  api/schema semantics (prohibited — additive-only + brief out-of-scope); localStorage/IDB
  schemas (verbatim in both modes, REQ-NAV-6); `data-*` vocabulary (both renderers emit the
  manifest; renames = codemod + registry update in one PR, REQ-TST-2 — including the SSR twin).
- **Unmerge discipline:** every SPA PR is deployable dark at flag-∅; shared files get insertions
  only; prod flag changes never ride inside feature PRs; a revert of any single PR leaves every
  deployed surface servable SSR.

## Design: two-mode coexistence contract

- `?ssr=1` (one-shot) and `x-rhema-renderer: ssr` honored on all stages during the window;
  `x-rhema-renderer: spa` / `?renderer=spa` honored only where `SPA_OVERRIDES=1` (non-prod).
  Overrides never bypass the session gate, server-owned redirects, or the forced-SSR capability
  checks (REQ-ED-12).
- The shell's `data-spa-boot` carries the effective flag set; `SsrHandoff` consults it; stale
  sets converge (F11b).
- Journeys run both modes on one deployment via header pinning; `--expect-renderer` asserts the
  marker only on documents under the gated surface's path set.
- Deep links, flash params, `/logout` (form POST), Stripe/OAuth hand-offs, and binary downloads
  are boundary-invariant (REQ-NAV-9/REQ-BND-3/9).

## Open questions

1. **`/p/:p/import*` under `onboarding` or its own key?** Its IDE-framed half only serves SPA
   after `ide-chrome` — the composite rule makes the split legal inside one flag, but a separate
   `import` key may read cleaner to the operator.
2. **Per-section settings flags?** D1 OQ2 allows finer; `settings` covers 6 sections + project
   settings — is one flip acceptable given the T3/R8.prefs/T2.matrix gate set, or split
   `settings`/`settings-project`?
3. **Prod `?ssr=1` retention past a surface's bake:** keep honoring it through the whole window
   (recommended — zero cost while SSR exists) or remove per-surface?
4. **Boot-set staleness tolerance:** the boot flag set is per-document; is a `router.invalidate`/
   version probe wanted to detect mid-session flips, or is the documented convergence enough?
5. **Dev flip inside the surface ticket vs a separate dev-flip PR:** recommended in-ticket (dev
   is the dogfood stage); uniformity-for-its-own-sake argues separate. Operator preference?
6. **`ide-chrome` as flag vs pure ordering:** the AND-gate gives a one-line chrome-wide rollback;
   the alternative is "chrome simply must land before export flips" with no separate key —
   recommended keep the key (cheap insurance), confirm.
7. **Rebase checkpoint enforcement:** if the chain lands while surface tickets are in flight (not
   just foundations), does the operator prefer per-surface rebases or one mid-sequence rebase?

## Spec requirements emitted

1. **REQ-SEQ-1** — `SPA_SURFACES` (CSV, mode string, never a secret) SHALL parse through a
   `parseSpaSurfaces` contract helper (unknown tokens dropped + warn; unset ⇒ ∅) into
   `WebDeps.spaSurfaces: ReadonlySet<SpaSurface>`; `deps.spa(c, surface)` SHALL be consulted
   inside the fixed handler order: session gate → server-owned redirect logic → forced-SSR
   capability checks (REQ-ED-12) → renderer override → flag membership — per REQ-BND-11.
2. **REQ-SEQ-2** — The surface-key vocabulary SHALL be the §route-map set (14 keys +
   `ide-chrome`); every auth'd document GET maps to exactly one key; `/p/:slug` is `editor`;
   redirect-only GETs carry no key; an IDE-framed route serves SPA iff its surface key AND
   `ide-chrome` are both present.
3. **REQ-SEQ-3** — Deployment SHALL carry the flag as a `StageConfig.spaSurfaces` fact (default
   `[]`) → `SPA_SURFACES` env on the web service, overridable per-stack by `rhema:spaSurfaces`
   Pulumi config; `SPA_OVERRIDES=1` SHALL be set on the web env only on non-prod kinds.
4. **REQ-SEQ-4** — Request-level renderer override SHALL exist: `?ssr=1`/`x-rhema-renderer: ssr`
   honored on all stages during the migration window; `x-rhema-renderer: spa`/`?renderer=spa`
   honored only where `SPA_OVERRIDES=1`; overrides never bypass the session gate, server
   redirects, or forced-SSR capability checks; the override machinery retires in the
   post-last-flag cleanup.
5. **REQ-SEQ-5** — No surface flag SHALL be set on any stage until the foundation set lands:
   Vite toolchain + public-safe job delta; shell document + flag plumbing + deploy wiring;
   `data-renderer`/`data-device`/`data-route`/`data-mounted` markers on BOTH renderers; router
   skeleton + `GET /session` + `bffFetch` + `SsrHandoff` + head manager; journey
   `--expect-renderer`/`--surface`/`SURFACE_GATES`; dom-contract manifest + `check:dom-contract`
   + the REQ-VFY-1 component-test stack.
6. **REQ-SEQ-6** — The flip order SHALL be the §flip-order table; `editor` flips last
   (REQ-ED-13); `ide-chrome` lands with the `export` flip as the first IDE-framed surface.
7. **REQ-SEQ-7** — Each surface's two-leg gate SHALL run on ONE flagged deployment: leg A with
   `x-rhema-renderer: ssr` pinned + `--expect-renderer ssr`; leg B un-pinned with
   `--expect-renderer spa`; leg C the full `paid:false` suite; followed by a rollback drill
   (flag removed → leg A re-run). Per-flip legs contain no `paid:true` steps (REQ-VFY-10).
8. **REQ-SEQ-8** — Re-spec'd journey probes SHALL be renderer-agnostic: SSR documents emit
   `data-renderer`/`data-route`/`data-mounted` statically so identical steps pass under both
   legs; probes assert manifest hooks + markers, never `domcontentloaded`/`form[action]`/script
   scraping.
9. **REQ-SEQ-9** — A surface ticket SHALL deliver: the surface's BFF reads (REQ-DAT-1/4) + JSON
   mutation equivalents (REQ-DAT-3); ported components emitting the manifest vocabulary;
   component tests + component-axe per REQ-VFY-6/9; the SSR test file retained green;
   journey re-specs + `SURFACE_GATES` entry (+ owed free steps); the preview two-leg + rollback
   drill evidence; the dev stage-fact line. It SHALL NOT contain: the prod flag flip, SSR
   deletions, or api/schema changes.
10. **REQ-SEQ-10** — The prod flag flip SHALL be a separate minimal PR touching only
    `STAGES.prod.spaSurfaces` (the `purchaseMode`/`debitMode` auditable-commit convention),
    operator-merged and `pulumi up`-deployed; rollback = revert that line + redeploy; ≥ one
    nightly green on prod SHALL precede the next surface's prod flip.
11. **REQ-SEQ-11** — Every SPA PR SHALL be deployable dark at flag-∅: shared-file changes are
    additive (never alter SSR behavior at flag-off); the branch inherits the §3b/§3c standing
    reds without attempting in-branch fixes (fix-forward is its own tip ticket); one declared
    rebase checkpoint sits at the foundations↔surfaces boundary for a mid-build chain merge.
12. **REQ-SEQ-12** — Mixed-mode coexistence SHALL hold: `data-spa-boot` carries the effective
    flag set; unflipped-target navigation is a document load via `SsrHandoff`; localStorage/IDB
    schemas are identical in both modes (REQ-NAV-6); client-state loss at a document boundary is
    bounded by the existing autosave/pagehide layers (REQ-ED-5).
