# SPAF.4 — prod flip: `voices` (run ledger)

- **Status:** DONE for the in-repo legs (PR diff + unit-level verification); the four
  post-deploy/live legs are **OPEN deferrals** (`D-SPAF.4-1`…`-4`) — they materialize only when
  the operator merges the chain + `pulumi up`s prod.
- **Harness:** Devin CLI (agentic coding subagent); model: Cognition Devin; tier: n/a (build work)
- **Ticket:** `docs/tickets/114_SPAF.4__prod-flip-voices.md` (manifest row 114)
- **Branch:** `stevevitali/spaf-4-prod-flip-voices`, stacked on
  `stevevitali/spa-13-surface-voices` @ `1388a48` (`OPERATOR` merge policy, **not merged**).
- **PR:** #136 — opened at closeout; `gh pr checks --watch=false` read once at closeout
  (recorded below; inherited `integration`/privsep red, if it reports, is waived per
  GD-MAINT.4-1 — classified, not repaired).
- **Goal:** flip `voices` to the SPA on prod — `STAGES.prod.spaSurfaces += 'voices'` as the
  one-line stage-fact PR; the operator merges + `pulumi up` deploys; rollback = revert +
  redeploy.
- **Spend:** $0. No deploys, no production writes, no live legs. Preview legs not needed — this
  row's contract is the prod flip itself (the surface's two-leg/rollback evidence is
  D-SPA.13-1/-2's preview track, still OPEN behind the absent
  `rhema-nonprod-resend-api-key` operator secret — D-MAINT.6-1).

## 0 — Context load

- DEFERRALS.md read first (per AGENTS): no `OPEN` row is unblocked by this run — `D-SPA.6-1`,
  `D-OPS.1-1`, `D-MAINT.6-1`, `D-SPA.13-1/-2` all still need their named operator
  prerequisites; the `D-SPAF.1-*` / `D-SPAF.2-*` / `D-SPAF.3-*` rows stay OPEN (operator merge +
  deploy gated). None closed, four opened.
- LEDGER CURRENT STATE read: `nextTicket: SPAF.4`, `chainTip:
  stevevitali/spa-13-surface-voices`, `mergePolicy: OPERATOR`, `round: 4`,
  `dispatchTarget: subagent`, `pinnedBaseSha: fab08ed`.
- **Entry gate (REQ-SEQ-10 + the 2026-10-08T19:12Z sequencing ruling):** the ticket's operating
  clause is "a nightly green since the PREVIOUS flip is this row's entry gate — pause if
  unmet" — `D-SPAF.3-4` names it (≥1 nightly green on prod after the `settings` deploy). The
  orchestrator's ledgered ruling (PHASE LOG 2026-10-08T19:12Z) interprets that gate as binding
  **activation order at merge/deploy time, not PR authoring**: with `mergePolicy: OPERATOR` and
  the whole stack unmerged, literal row-level gating would stall ~37 rows behind operator
  merges. This run therefore executes now as an **authored-dormant minimal PR** exactly as
  SPAF.1/SPAF.2/SPAF.3 did — the stage-fact diff + unit pins land, every live leg is deferred
  with a verbatim verify recipe, and `D-SPAF.1-4`'s + `D-SPAF.2-4`'s + `D-SPAF.3-4`'s
  nightly-green bakes are restated (in `D-SPAF.4-4`) as live preconditions for the operator's
  merge/deploy cadence of THIS flip. REQ-SEQ-10 pacing is encoded in SPAREC.3's integration
  plan (merge bottom-up, deploy, bake ≥1 nightly, next batch).
- **Sequencing reality:** the ticket's hard dependency is "the `voices` surface ticket's PR
  merged + deployed (its code must be live)". PR #135 (SPA.13) is unmerged like the rest of
  the stack — but `mergePolicy: OPERATOR` stacks bottom-up, so SPA.1→…→SPA.13 land before
  this PR's deploy leg; the flip line is inert until the chain's code serves.
- Sources applied: `docs/design/29_spa-migration-sequencing.md` §per-flip procedure + §rollback
  semantics (design F8/F11); `docs/frontend-spa-spec.md` §11 REQ-SEQ-10/11/12 + REQ-VFY-8;
  `infra/config/stages.ts` + `stages.test.ts` (the stage-fact convention); `infra/pulumi/
  compute.ts` (the `SPA_SURFACES` env wiring — `args.spaSurfaces ?? cfg.spaSurfaces.join(",")`).

## 1 — What landed (the whole diff)

### `infra/config/stages.ts` — the one-line stage fact (REQ-SEQ-10)

```diff
-    // SPAF.1 — `usage` is the first prod surface flip; SPAF.2 — `inbox` joins it; SPAF.3 —
-    // `settings` joins them (REQ-SEQ-10): each prod flip is a one-line stage-fact commit,
-    // operator-merged + `pulumi up`-deployed; rollback = revert this line + redeploy. ≥ one
-    // nightly green on prod precedes the NEXT surface's prod flip. Order is flip order —
-    // never re-sort.
-    spaSurfaces: ["usage", "inbox", "settings"],
+    // SPAF.1 — `usage` is the first prod surface flip; SPAF.2 — `inbox` joins it; SPAF.3 —
+    // `settings` joins them; SPAF.4 — `voices` joins them (REQ-SEQ-10): each prod flip is a
+    // one-line stage-fact commit, operator-merged + `pulumi up`-deployed; rollback = revert
+    // this line + redeploy. ≥ one nightly green on prod precedes the NEXT surface's prod
+    // flip. Order is flip order — never re-sort.
+    spaSurfaces: ["usage", "inbox", "settings", "voices"],
```

Effect at deploy time: the Pulumi program renders the prod web env
`SPA_SURFACES=usage,inbox,settings,voices` (`compute.ts` — no `rhema:spaSurfaces` stack config
on prod, so the stage fact wins). The web's `deps.spa(c,"voices")` consult then serves the SPA
shell for the four flagged GETs — `/voices` + `/voices/new` + `/v/:persona` +
`/p/:project/voice/reseed` (each carrying `spaShellResponse(c, deps, "voices", session)`;
`/voices/new` is registered ahead of the `:persona` route, pinned in SPA.13's tests).
`?ssr=1` / `x-rhema-renderer: ssr` still force SSR on every stage, and `SPA_OVERRIDES` is
emitted **only** on non-prod kinds — prod keeps force-SSR-but-never-force-SPA (REQ-SEQ-4).
Flip order is preserved (`usage`, `inbox`, `settings`, then `voices` appended). No generated
config artifacts exist for this fact (the stack config path is explicitly never committed).

### `infra/config/stages.test.ts` — the stage-fact pin, updated honestly

The `spa.surfaces` block now asserts `STAGES.prod.spaSurfaces ===
["usage","inbox","settings","voices"]` (the SPAF.1 + SPAF.2 + SPAF.3 + SPAF.4 flips — prod and
dev now carry the same four-surface set), `dev` stays `["usage","inbox","settings","voices"]`,
and `preview` remains `[]` (stack-config override path unchanged). The vocabulary pin (every
listed key ∈ `SPA_SURFACES`) still holds.

**Nothing else** — no other source file touched. Diff stat: 2 files, ~16 changed lines (within
the ~20-line budget). Review scope check: the PR diff touches only `stages.ts` + its test —
exactly the ticket's AC1 envelope.

## 2 — Verification

- `pnpm vitest run infra/config/stages.test.ts infra/pulumi/compute.test.ts` → **38/38 pass**
  (stages 23, compute 15).
- `pnpm --filter @rhema/infra typecheck` → clean (`tsc -b`).
- `pnpm --filter @rhema/infra lint` → clean (eslint).
- Stage-fact test is a real pin: reverting the stage line fails
  `expect(STAGES.prod.spaSurfaces).toEqual(["usage","inbox","settings","voices"])`.
- Full-suite + public-safe checks ride CI (`typecheck/lint/unit` job); no SPA/bundle surface is
  touched by this row.

## 3 — Deferred live legs (all gated on operator merge + `pulumi up` prod)

| Row | Leg | Verify recipe |
|---|---|---|
| D-SPAF.4-1 | `data-renderer="spa"` on the four voices GETs; `?ssr=1` still SSR | `curl -s https://rhema.tools/voices` (session) `\| grep data-renderer` → `spa`; same for `/voices/new`, `/v/<persona>`, `/p/<slug>/voice/reseed`; `…?ssr=1` → `ssr` |
| D-SPAF.4-2 | `--expect-renderer spa` leg on prod | `rhema-journeys --stage prod --surface voices --expect-renderer spa --expect-sha <deployed>` → exit 0 (`SURFACE_GATES.voices` = T5, X1.voices) |
| D-SPAF.4-3 | Rollback arm | `git revert <flip>` + `pulumi up` → `data-renderer="ssr"` in one deploy (recorded, not exercised destructively) |
| D-SPAF.4-4 | REQ-SEQ-10 nightly-green bake | next nightly `journeys.yml` green on prod before SPAF.5 opens; D-SPAF.1-4's + D-SPAF.2-4's + D-SPAF.3-4's nightly greens restated as this flip's merge/deploy preconditions |

All four appended to `docs/tickets/DEFERRALS.md` under `## SPAF.4` this run.

## 4 — Requirement IDs / AC status

- **REQ-SEQ-10** — separate minimal PR touching only `STAGES.prod.spaSurfaces`: SATISFIED in
  the diff. Operator-merge + `pulumi up` + nightly-green clauses: operator-gated / ledgered
  (D-SPAF.4-4, with D-SPAF.1-4's, D-SPAF.2-4's and D-SPAF.3-4's bakes restated as this flip's
  activation preconditions).
- **REQ-SEQ-11** — deployable dark: SATISFIED by construction (one config datum; SSR
  untouched; flag-∅ serving path identical on every other stage).
- **REQ-SEQ-12** — mixed-mode coexistence: unchanged — the boot payload carries the effective
  flag set; unflipped routes document-nav via `SsrHandoff`.
- **REQ-VFY-8 (prod legs)** — DEFERRED to the deploy (D-SPAF.4-1/-2).
- AC layers: AC1 (diff touches only `stages.ts` + test) — **deterministic/engineered, DONE**;
  AC2–AC4 (post-deploy markers, `?ssr=1`, journey leg, rollback) — **live-executed, DEFERRED**
  per above; universal gate AC — docs/index/ledger advanced, checks read at closeout.

## 5 — Deviations / owned decisions

- None beyond the operator-sanctioned sequencing: the ticket's "PR merged + deployed" phrasing
  is executed as "PR opened; live legs ledgered" per `mergePolicy: OPERATOR` + the
  $0/no-prod-mutation constraint — and the "≥1 nightly green … entry gate" clause is applied
  to activation order per the 2026-10-08T19:12Z orchestrator ruling (ledgered; no ADR needed —
  no design change).
- Pre-existing `integration`/privsep CI reds, if present on this branch, are inherited per
  GD-MAINT.4-1 — classified, not repaired.

## PR checks read (closeout)

_(recorded at closeout below — single `gh pr checks --watch=false` read)_
