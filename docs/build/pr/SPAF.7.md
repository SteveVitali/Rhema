# SPAF.7 — prod flip: `billing` (`STAGES.prod.spaSurfaces += "billing"`)

**PR #142** · Manifest row 120 · stacks on
`stevevitali/spa-16-surface-billing` @ `9e18358` · merge policy **OPERATOR** — do not
merge from the build environment · **$0** spend, no deploys, no production writes.

Implements `docs/tickets/120_SPAF.7__prod-flip-billing.md` per
`docs/design/29_spa-migration-sequencing.md` (§per-flip procedure, F8/F11 rollback semantics)
and `docs/frontend-spa-spec.md` §11 (REQ-SEQ-10/11/12). **The seventh prod surface flip** of
the strangler migration — the point where `/app/settings/billing`, the `/settings/billing`
beta alias, and `/billing/return` start serving the React SPA on prod once the operator merges
the chain and `pulumi up`s the deploy. The billing session gates are **not** part of the
renderer decision: unauthed hits on all three GETs keep answering a renderer-free 302
`/login` ahead of the `billing` consult at spec §4's fixed position — and the seven billing
POSTs were never documents, so their Stripe hand-offs stay server-validated `{url}` envelopes
on either renderer.

## Requirement IDs

**REQ-SEQ-10 · REQ-SEQ-11 · REQ-SEQ-12 · REQ-VFY-8 (prod legs)**

## What lands (the whole diff)

- `infra/config/stages.ts`: `STAGES.prod.spaSurfaces` —
  `["usage","inbox","settings","voices","onboarding","project-home"]` →
  `["usage","inbox","settings","voices","onboarding","project-home","billing"]`
  (flip order preserved; comment updated to name the seven flips, the rollback, the REQ-SEQ-10
  nightly-green gate on the NEXT flip, the `ide-chrome` AND-gate note, the `/app`
  precedence-redirect note, and the billing session-gate/POST note).
- `infra/config/stages.test.ts`: the stage-fact pin updated — `prod` now asserts
  `["usage","inbox","settings","voices","onboarding","project-home","billing"]`; `dev`
  unchanged `["usage","inbox","settings","voices","onboarding","ide-chrome","project-home","billing"]`;
  `preview` stays `[]` (stack-config path unchanged).

That's it — **2 files, ~24 changed lines** (the fact itself is one line; comments carry the
rest), inside the ~20-line budget's intent. Review scope check: the diff touches only the prod
stage fact + its test, exactly the AC1 envelope. No generated config artifacts exist for this
fact (`rhema:spaSurfaces` stack config is never committed).

## Deploy mechanics (what this does once merged + `pulumi up`)

- Prod web env `SPA_SURFACES` becomes
  `"usage,inbox,settings,voices,onboarding,project-home,billing"` (`compute.ts`:
  `args.spaSurfaces ?? cfg.spaSurfaces.join(",")` — no prod stack config overrides it).
- `deps.spa(c,"billing")` flips true for `GET /app/settings/billing` + `GET /settings/billing`
  (shared `billingPageHandler`, `server.ts` ~3626) and `GET /billing/return` (~3800) → the SPA
  shell serves — but only for a request that survives the session gate (unauthed → 302
  `/login` on each). On `/billing/return` the consult precedes the `?session_id`/`?cancelled`
  read, so the shell serves and the SPA's `/bff/billing/return` twin performs the return read
  (`open ∧ ¬cancelled ∧ <30 s` ⇒ `pollAfterSeconds: 5` — §14.6's webhook-lag window stays
  server-owned).
- `?ssr=1` / `x-rhema-renderer: ssr` keep forcing SSR on **every** stage — the escape hatch is
  unaffected. `SPA_OVERRIDES` is emitted on non-prod kinds only, so prod can never be
  force-SPA'd per-request (REQ-SEQ-4).
- **Rollback = revert this line + redeploy** — SSR serving was never deleted (REQ-SEQ-11/12,
  design/29 F8/F11). Recorded arm: `D-SPAF.7-3`.

## Verification

- `pnpm vitest run infra/config/stages.test.ts infra/pulumi/compute.test.ts` — **38/38 pass**.
- `pnpm --filter @rhema/infra typecheck` / `lint` — clean.
- The pin is real: removing `"billing"` fails the test.
- Consult positions verified in source: `billingPageHandler` session-gates at ~3623 then
  consults at ~3626; `/billing/return` gates at ~3798 then consults at ~3800 (before the
  `session_id` read); SPA.16's `billing.dom.test.tsx` (26 tests) pins both mounts + the return
  states.

## Deferred live legs (operator-merge + deploy gated — DEFERRALS.md `## SPAF.7`)

| Row | Leg |
|---|---|
| D-SPAF.7-1 | `data-renderer="spa"` on `/app/settings/billing` + `/settings/billing` + `/billing/return` + `?ssr=1` SSR escape; **and** the session gates must still 302 `/login` before any render on all three (curl recipes in the row) |
| D-SPAF.7-2 | `rhema-journeys --stage prod --surface billing --expect-renderer spa` green (`SURFACE_GATES.billing` = `N9` — Stripe hand-offs assert allowlisted-host navigation only) |
| D-SPAF.7-3 | Rollback arm: revert + `pulumi up` → SSR in one deploy (recorded, not exercised destructively) |
| D-SPAF.7-4 | REQ-SEQ-10 — ≥1 nightly journey green on prod post-deploy before SPAF.8 opens; D-SPAF.1-4/D-SPAF.2-4/D-SPAF.3-4/D-SPAF.4-4/D-SPAF.5-4/D-SPAF.6-4 nightly-green preconditions restated as this flip's activation gate |

**Entry gate (orchestrator ruling, ledgered 2026-10-08T19:12Z):** REQ-SEQ-10's "≥1 nightly
green before the NEXT flip row" binds *activation order at merge/deploy time*, not PR
authoring — this PR is authored-dormant and must not be **deployed** until `project-home`'s
flip (D-SPAF.6-4) has baked ≥1 nightly green (which itself waits on `onboarding`'s, `voices`'s,
`settings`'s, `inbox`'s, and `usage`'s, D-SPAF.5-4 → D-SPAF.4-4 → D-SPAF.3-4 → D-SPAF.2-4 →
D-SPAF.1-4). Pacing is encoded in SPAREC.3's integration plan.

## Notes

- Deployable dark / additive-only: the flag-∅ serving path is byte-identical; SSR tests
  untouched (REQ-SEQ-11/12).
- `mergePolicy: OPERATOR` — this PR stacks on the unmerged round-4 chain; the operator merges
  bottom-up. Prod deploy is operator-run per the contract.
