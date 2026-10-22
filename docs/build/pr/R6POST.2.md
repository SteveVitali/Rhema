# R6POST.2 — Posture stages: domains-bearing preview (N8 green, R10.keepalive diagnosed) + Stripe test-mode withheld ($0 legs)

## Summary

Runs the two authorized non-production postures that `*.run.app` previews structurally
cannot carry (REQ-POST-6). **Stage A — domains-bearing preview `pr-211`: VERDICT mixed —
N8 PASS, R10.keepalive owed with the sharpest diagnosis yet.** A managed-cert LB fronts
three `*.sslip.io` SANs on a pre-reserved global IP; `COLLAB_WS_URL=wss://<app>/collab`
resolves and path-routes to the collab service — `N8` ran the fork → edit → sync-pill
legs over the real wire green. `R10.keepalive` reached its full semantic arm for the
first time and surfaced **F-R6POST.2-2**: session identity survives the away/return nav
(0 document loads, same `data-page-session`) but the remounted editor's undo stack is
empty — a product-side REQ-NAVC-22/23 gap, never fabricated green. **Stage B — Stripe
test-mode: WITHHELD** — `rhema-nonprod-stripe-secret` does not exist in
`rhema-507501` Secret Manager; the `stripe-pull` machinery landed + fail-closed
verified on `pr-212` (no configured source → refusal, zero config writes). N9 is
honestly re-owed, never run. This PR **stacks on `stevevitali/r6post-1-prod-arms`** and
is **unmerged (OPERATOR)**.

## Posture machinery (the code delta)

`rhema:postureDomains` / `rhema:postureLbAddress` / `rhema:extraRequiredSecrets` /
`rhema:stripeSecret` — per-stack config, non-prod only (prod refuses every verb):

- `infra/config/stages.ts` — pure `withPostureOverrides` seam; prod stage facts
  unchanged (domains, required secrets, LB address adopt).
- `infra/pulumi/index.ts` + `compute.ts` — posture domains drive the existing prod
  machinery verbatim (managed cert SANs, host rules, `/collab*` → collab backend),
  `GlobalAddress.get` adoption so names are mintable before `up`,
  `COLLAB_WS_URL=wss://${domains.app}/collab`; non-domain previews untouched.
- `scripts/live/preview-stack.mjs` — `stripe-pull` verb (resend-pull shape): `pr-<n>`
  gate, prod refusal on all verbs, ownership tag, gcloud→stdin→`pulumi config set
  --secret` — never argv/logs. Test suite pins every refusal.
- **ADR-120** — posture stages + wildcard DNS + per-stack config decision.

## Per-stage verdicts

| Stage | Verdict | Evidence (`docs/build/reports/2026-10-22_R6POST.2/`) |
| --- | --- | --- |
| A — domains preview | **N8 PASS** | `posture/` — cert ACTIVE on 3 SANs, app 200, api `/healthz` gitSha `65d3dec` (head-bound), `COLLAB_WS_URL` live, `/collab` path-routed (collab-backend 404 on non-upgrade GET = routed); `N8.png` + `report.json`: fork → edit → sync-pill over `wss://…/collab` |
| A — keepalive | **R10.keepalive OWED** | Same report — session minted, synced edit over wire, fork-rekey held, `/app` away hop = 0 document loads, same `data-page-session` re-acquired in TTL; **⌘Z did not remove the typed marker** — `F-R6POST.2-2` (`YUndoPluginView.destroy()` clears the UndoManager on `EditorView` teardown; registry keeps identity + Y.Doc, undo half dies) |
| B — Stripe test-mode | **N9 WITHHELD** | `rhema-nonprod-stripe-secret` NOT_FOUND in `rhema-507501` SM (probed, never printed; prod secrets untouched by design). `pr-212` `stripe-pull` fail-closed verified — refusal, zero config writes. Unblocks on operator `sk_test` seed |

## Live findings recorded

- **F-R6POST.2-1 (fixed, `a99e960`)** — `R10.keepalive` timed out clicking
  `a[href="/app"]`: the hidden `.ide-phonebar` fallback matched before the visible rail
  `⌂`. Scoped to `:visible` in `packages/journeys/src/steps.ts` — the leg then ran the
  semantic arm above.
- **F-R6POST.2-2 (live finding, not fixed here)** — y-prosemirror
  `YUndoPluginView.destroy()` clears the entry's `UndoManager` when the `EditorView`
  unmounts; `page-sessions.ts` retains `EditorState` + `page-collab.ts` retains the
  Y.Doc/provider, so identity + wire survive while the undo half is dead on remount.
  Product-side REQ-NAVC-22/23 gap — reported owed, never called green.

## DNS + teardown

- **DNS created: ZERO / removed: ZERO** — `rhema.tools` resolves at Squarespace
  (registrar-held; no Cloud DNS zone in `rhema-507501` — records can only be applied by
  the operator). The stage fronted on sslip.io wildcard names over the reserved IP —
  strictly inside the authorized envelope (subset of "records under the preview
  subdomain"). No record outside it was ever touched.
- **Teardown:** `destroy pr-211` — 143 deleted (Cloud Run 7svc/2job, collab, AlloyDB,
  Redis, GKE, LB/cert/urlmap, PGA zones, SLO); subnet+net pinned by GCP-managed
  `serverless-ipv4-cloudrun-*` reservations (async GC lag — idempotent retry drained;
  direct `addresses delete` correctly refused). `rm pr-212` (registration only).
  Orphan sweep + spend in `runs/R6POST.2.md`.

## DEFERRALS dispositions

- **D-SPA.24-1** — dated tail: N8 discharged green on the domains posture; row stays
  OPEN on `R10.keepalive` (F-R6POST.2-2) + `R10`.
- **D-SPA.16-1 / D-SPA.20-1** — dated re-owe: N9 withheld, nonprod `sk_test` absent;
  machinery + fail-closed path verified.
- **D-OPS.1-1** — stays OPEN (dated in run ledger; keepalive half still owed).

## Verification

- `infra/config/stages.test.ts` + `scripts/live/preview-stack.test.mjs` — posture
  merge/refusal/secret-pipe pins green.
- `pnpm turbo build lint typecheck` / `pnpm test` / `check:*` — recorded in run ledger.
- `check-build-memory.sh` + `check-append-only.mjs --base 83f2532` — recorded.
- CI boundary: `ci-boundary.sh --ledger docs/build/LEDGER.md --ticket R6POST.2` →
  `docs/build/logs/ci-R6POST.2.json`.

**Requirement ids:** REQ-POST-6
**Merge policy:** OPERATOR — this PR is not merged by the run; it stacks on
`stevevitali/r6post-1-prod-arms`.
