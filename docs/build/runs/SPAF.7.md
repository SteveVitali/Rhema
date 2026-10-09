# SPAF.7 — prod flip: `billing` (run ledger)

- **Status:** DONE for the in-repo legs (PR diff + unit-level verification); the four
  post-deploy/live legs are **OPEN deferrals** (`D-SPAF.7-1`…`-4`) — they materialize only when
  the operator merges the chain + `pulumi up`s prod.
- **Harness:** Devin CLI (agentic coding subagent); model: Cognition Devin; tier: n/a (build work)
- **Ticket:** `docs/tickets/120_SPAF.7__prod-flip-billing.md` (manifest row 120)
- **Branch:** `stevevitali/spaf-7-prod-flip-billing`, stacked on
  `stevevitali/spa-16-surface-billing` @ `9e18358` (`OPERATOR` merge policy, **not merged**).
- **PR:** opened at closeout; `gh pr checks --watch=false` read once at closeout
  (result recorded in § PR checks read below; inherited `integration`/privsep red, if it
  reports, is waived per GD-MAINT.4-1 — classified, not repaired).
- **Goal:** flip `billing` to the SPA on prod — `STAGES.prod.spaSurfaces += 'billing'`
  as the one-line stage-fact PR; the operator merges + `pulumi up` deploys; rollback = revert +
  redeploy.
- **Spend:** $0. No deploys, no production writes, no live legs. Preview legs not needed — this
  row's contract is the prod flip itself (the surface's two-leg/rollback evidence is
  D-SPA.16-1/-2's preview track, still OPEN behind the absent
  `rhema-nonprod-resend-api-key` operator secret — D-MAINT.6-1).

## 0 — Context load

- DEFERRALS.md read first (per AGENTS): no `OPEN` row is unblocked by this run — `D-SPA.16-1`,
  `D-SPA.16-2`, `D-OPS.1-1`, `D-MAINT.6-1` all still need their named operator
  prerequisites; the `D-SPAF.1-*` … `D-SPAF.6-*` rows stay OPEN (operator merge + deploy
  gated). None closed, four opened.
- LEDGER CURRENT STATE read: `nextTicket: SPAF.7`, `chainTip:
  stevevitali/spa-16-surface-billing`, `mergePolicy: OPERATOR`, `round: 4`,
  `dispatchTarget: subagent`, `pinnedBaseSha: fab08ed`.
- **Entry gate (REQ-SEQ-10 + the 2026-10-08T19:12Z sequencing ruling):** the ticket's operating
  clause is "a nightly green since the PREVIOUS flip is this row's entry gate — pause if
  unmet" — `D-SPAF.6-4` names it (≥1 nightly green on prod after the `project-home` deploy). The
  orchestrator's ledgered ruling (PHASE LOG 2026-10-08T19:12Z) interprets that gate as binding
  **activation order at merge/deploy time, not PR authoring**: with `mergePolicy: OPERATOR` and
  the whole stack unmerged, literal row-level gating would stall ~30 rows behind operator
  merges. This run therefore executes now as an **authored-dormant minimal PR** exactly as
  SPAF.1–SPAF.6 did — the stage-fact diff + unit pins land, every live leg is deferred with a
  verbatim verify recipe, and `D-SPAF.1-4`'s + `D-SPAF.2-4`'s + `D-SPAF.3-4`'s +
  `D-SPAF.4-4`'s + `D-SPAF.5-4`'s + `D-SPAF.6-4`'s nightly-green bakes are restated (in
  `D-SPAF.7-4`) as live preconditions for the operator's merge/deploy cadence of THIS flip.
  REQ-SEQ-10 pacing is encoded in SPAREC.3's integration plan (merge bottom-up, deploy, bake
  ≥1 nightly, next batch).
- **Sequencing reality:** the ticket's hard dependency is "the `billing` surface ticket's
  PR merged + deployed (its code must be live)". PR #141 (SPA.16) is unmerged like the rest of
  the stack — but `mergePolicy: OPERATOR` stacks bottom-up, so SPA.1→…→SPA.16 land before
  this PR's deploy leg; the flip line is inert until the chain's code serves.
- **The billing consult shape:** `billing` flips three document GETs —
  `/app/settings/billing` and the legacy alias `/settings/billing` share `billingPageHandler`
  (`apps/web/src/server.ts` ~3621–3649): session gate first (unauthed → 302 `/login`), then
  `spaShellResponse(c, deps, "billing", session)` at ~3626, then the SSR render.
  `/billing/return` (~3796–3820) gates identically, then consults at ~3800 — BEFORE the
  `?session_id`/`?cancelled` read, so a flagged checkout-return serves the shell and the SPA's
  `/bff/billing/return` twin performs the return read (`open ∧ ¬cancelled ∧ <30 s` ⇒
  `pollAfterSeconds: 5`, §14.6's webhook-lag window server-owned). The seven billing POSTs are
  never documents — untouched by the flip; their Stripe hand-offs stay server-validated `{url}`
  envelopes on either renderer. Verified against the source this run.
- Sources applied: `docs/design/29_spa-migration-sequencing.md` §per-flip procedure + §rollback
  semantics (design F8/F11); `docs/frontend-spa-spec.md` §11 REQ-SEQ-10/11/12 + REQ-VFY-8;
  `infra/config/stages.ts` + `stages.test.ts` (the stage-fact convention); `infra/pulumi/
  compute.ts` (the `SPA_SURFACES` env wiring — `args.spaSurfaces ?? cfg.spaSurfaces.join(",")`);
  `apps/web/src/server.ts` (the three billing consults); `packages/journeys/src/
  surface-gates.ts` (`SURFACE_GATES.billing` = `N9`).

## 1 — What landed (the whole diff)

### `infra/config/stages.ts` — the one-line stage fact (REQ-SEQ-10)

```diff
-    // SPAF.1 — `usage` is the first prod surface flip; SPAF.2 — `inbox` joins it; SPAF.3 —
-    // `settings` joins them; SPAF.4 — `voices` joins them; SPAF.5 — `onboarding` joins them;
-    // SPAF.6 — `project-home` joins them (REQ-SEQ-10): each prod flip is a one-line
-    // stage-fact commit, operator-merged + `pulumi up`-deployed; rollback = revert this
-    // line + redeploy. ≥ one nightly green on prod precedes the NEXT surface's prod flip.
-    // Order is flip order — never re-sort.
-    // `ide-chrome` stays dark on prod until SPAF.8 — the /p/:p/import* legs AND-gate on it,
-    // so they keep serving SSR even with `onboarding` flagged. `/app`'s session gate +
-    // first-five-minutes precedence (the carried `?entry` file / unopened-Showcase
-    // redirects) still run ahead of the `project-home` consult — they answer 302s, never
-    // the shell.
-    spaSurfaces: ["usage", "inbox", "settings", "voices", "onboarding", "project-home"],
+    // SPAF.1 — `usage` is the first prod surface flip; SPAF.2 — `inbox` joins it; SPAF.3 —
+    // `settings` joins them; SPAF.4 — `voices` joins them; SPAF.5 — `onboarding` joins them;
+    // SPAF.6 — `project-home` joins them; SPAF.7 — `billing` joins them (REQ-SEQ-10): each
+    // prod flip is a one-line stage-fact commit, operator-merged + `pulumi up`-deployed;
+    // rollback = revert this line + redeploy. ≥ one nightly green on prod precedes the NEXT
+    // surface's prod flip. Order is flip order — never re-sort.
+    // `ide-chrome` stays dark on prod until SPAF.8 — the /p/:p/import* legs AND-gate on it,
+    // so they keep serving SSR even with `onboarding` flagged. `/app`'s session gate +
+    // first-five-minutes precedence (the carried `?entry` file / unopened-Showcase
+    // redirects) still run ahead of the `project-home` consult — they answer 302s, never
+    // the shell. The billing session gates likewise precede the `billing` consult
+    // (unauthed → 302 /login on all three GETs); the seven billing POSTs are unaffected —
+    // they were never documents, and their Stripe hand-offs stay server-validated {url}
+    // envelopes on either renderer.
+    spaSurfaces: ["usage", "inbox", "settings", "voices", "onboarding", "project-home", "billing"],
```

Effect at deploy time: the Pulumi program renders the prod web env
`SPA_SURFACES=usage,inbox,settings,voices,onboarding,project-home,billing` (`compute.ts` — no
`rhema:spaSurfaces` stack config on prod, so the stage fact wins). The web's
`deps.spa(c,"billing")` consult then serves the SPA shell for `GET /app/settings/billing`,
`GET /settings/billing` (the beta alias — same handler), and `GET /billing/return` — but only
for a request that survives the session gate (an unauthed hit still 302s to `/login`).
`?ssr=1` / `x-rhema-renderer: ssr` still force SSR on every stage, and `SPA_OVERRIDES` is
emitted **only** on non-prod kinds — prod keeps force-SSR-but-never-force-SPA (REQ-SEQ-4).
Flip order is preserved (`usage` … `project-home`, then `billing` appended). No generated
config artifacts exist for this fact (the stack config path is explicitly never committed).

### `infra/config/stages.test.ts` — the stage-fact pin, updated honestly

The `spa.surfaces` block now asserts `STAGES.prod.spaSurfaces ===
["usage","inbox","settings","voices","onboarding","project-home","billing"]` (the
SPAF.1…SPAF.7 flips), `dev` stays
`["usage","inbox","settings","voices","onboarding","ide-chrome","project-home","billing"]` —
prod stays behind dev on `ide-chrome` until SPAF.8 — and `preview` remains `[]` (stack-config
override path unchanged). The vocabulary pin (every listed key ∈ `SPA_SURFACES`) still holds.

**Nothing else** — no other source file touched. Diff stat: 2 files, ~24 changed lines
(comment lines dominate — the fact itself is one line, inside the ~20-line budget's intent).
Review scope check: the PR diff touches only `stages.ts` + its test — exactly the ticket's AC1
envelope.

## 2 — Verification

- `pnpm vitest run infra/config/stages.test.ts infra/pulumi/compute.test.ts` → **38/38 pass**
  (stages 23, compute 15).
- `pnpm --filter @rhema/infra typecheck` → clean (`tsc -b`).
- `pnpm --filter @rhema/infra lint` → clean (eslint).
- Stage-fact test is a real pin: reverting the stage line fails
  `expect(STAGES.prod.spaSurfaces).toEqual(["usage","inbox","settings","voices","onboarding","project-home","billing"])`.
- Consult-position check: `apps/web/src/server.ts` billing handlers read this run —
  `billingPageHandler` session-gates at ~3623 then consults at ~3626 (shared by both mounts);
  `/billing/return` session-gates at ~3798 then consults at ~3800, before the `session_id`
  read; SPA.16's `billing.dom.test.tsx` (26 tests) pins both mounts + the return states.
- Full-suite + public-safe checks ride CI (`typecheck/lint/unit` job); no SPA/bundle surface is
  touched by this row.

## 3 — Deferred live legs (all gated on operator merge + `pulumi up` prod)

| Row | Leg | Verify recipe |
|---|---|---|
| D-SPAF.7-1 | `data-renderer="spa"` on `/app/settings/billing` + `/settings/billing` + `/billing/return`; `?ssr=1` still SSR on each; **session gates still precede** — unauthed hits on all three → 302 `/login` (renderer-free) | `curl -s https://rhema.tools/app/settings/billing` (session) `\| grep data-renderer` → `spa`; same for `/settings/billing` + `/billing/return?session_id=…`; `…?ssr=1` → `ssr` on each; `curl -sI` (no cookie) on each → `302 /login` |
| D-SPAF.7-2 | `--expect-renderer spa` leg on prod | `rhema-journeys --stage prod --surface billing --expect-renderer spa --expect-sha <deployed>` → exit 0 (`SURFACE_GATES.billing` = `N9` — Stripe hand-offs assert allowlisted-host navigation only, never a completed purchase) |
| D-SPAF.7-3 | Rollback arm | `git revert <flip>` + `pulumi up` → `data-renderer="ssr"` on all three in one deploy (recorded, not exercised destructively) |
| D-SPAF.7-4 | REQ-SEQ-10 nightly-green bake | next nightly `journeys.yml` green on prod before SPAF.8 opens; D-SPAF.1-4's through D-SPAF.6-4's nightly greens restated as this flip's merge/deploy preconditions |

All four appended to `docs/tickets/DEFERRALS.md` under `## SPAF.7` this run.

## 4 — Requirement IDs / AC status

- **REQ-SEQ-10** — separate minimal PR touching only `STAGES.prod.spaSurfaces`: SATISFIED in
  the diff. Operator-merge + `pulumi up` + nightly-green clauses: operator-gated / ledgered
  (D-SPAF.7-4, with D-SPAF.1-4's through D-SPAF.6-4's bakes restated as this flip's activation
  preconditions).
- **REQ-SEQ-11** — deployable dark: SATISFIED by construction (one config datum; SSR
  untouched; flag-∅ serving path identical on every other stage).
- **REQ-SEQ-12** — mixed-mode coexistence: unchanged — the boot payload carries the effective
  flag set; unflipped routes document-nav via `SsrHandoff`; the billing session gates keep
  answering 302 ahead of any renderer.
- **REQ-VFY-8 (prod legs)** — DEFERRED to the deploy (D-SPAF.7-1/-2).
- AC layers: AC1 (diff touches only `stages.ts` + test) — **deterministic/engineered, DONE**;
  AC2–AC4 (post-deploy markers, `?ssr=1`, journey leg, rollback) — **live-executed, DEFERRED**
  per above; universal gate AC — docs/index/ledger advanced, checks read at closeout.

## 5 — Deviations / owned decisions

- None beyond the operator-sanctioned sequencing: the ticket's "PR merged + deployed" phrasing
  is executed as "PR opened; live legs ledgered" per `mergePolicy: OPERATOR` + the
  $0/no-prod-mutation constraint — and the "≥1 nightly green … entry gate" clause is applied
  to activation order per the 2026-10-08T19:12Z orchestrator ruling (ledgered; no ADR needed —
  no design change).
- The billing flip is a three-document flip on one flag (`/app/settings/billing` + the
  `/settings/billing` alias + `/billing/return`); all consults sit after their session gates
  in source, and the seven POSTs + Stripe hand-offs are document-free — unchanged on either
  renderer. No unauthed case can boot the SPA shell.
- Pre-existing `integration`/privsep CI reds, if present on this branch, are inherited per
  GD-MAINT.4-1 — classified, not repaired.

## PR checks read (closeout)

_(Recorded after the closeout-docs push — single `gh pr checks <n> --watch=false` read; any
`integration`/privsep red that reports is inherited, waived per GD-MAINT.4-1 — classified, not
repaired.)_
