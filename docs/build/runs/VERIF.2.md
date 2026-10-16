# VERIF.2 — Preview-leg wave on an owned `pr-<n>` stack (run ledger)

- **Harness:** devin-desktop/swe-2-high/subagent
- **Skills:** agent-skills @ (see `git -C ~/agent-skills rev-parse --short HEAD` in Evidence log)
- **Started:** 2026-10-16T03:26:00Z
- **Closed:** —
- **Spec:** `docs/tickets/165_VERIF.2__preview-legs.md` (manifest row 165)
- **Base:** `stevevitali/cost-1-prod-cost-posture` @ `f20ee28` (+ orchestrator commits `e6c774b`, `1b1fee9`)
- **Branch:** `stevevitali/verif-2-preview-legs` @ `1b1fee9` (impl head at branch open)
- **Config:** full rigor (ledger/self_review/gap_analysis/tests/live_verification/evidence_report)
- **Live stage:** `pr-<n>` preview ($0 legs; resource-hours recorded — target ≤$8)
- **Production mutations:** none — every leg runs on the owned preview, destroyed at closeout

## Deferrals read (in scope this run)

The stream-V-2 set (behind the H8 Resend seed — landed 2026-10-16T03:24Z, operator-delegated):

| Row | Leg (post-SPA.28 shape) |
|---|---|
| D-OPS.1-1 | every signed-in `paid:false` step green on a preview w/ real Resend + mailbox (the full-suite leg) |
| D-OPS.1-2 | live paused-AlloyDB leg — `activationPolicy NEVER` post-create update + `ignoreChanges` no-drift proof (named carrier) |
| D-MAINT.6-1 | the live session-mint proof — real `test*@rhema.tools` magic-link session via `resend-pull`/`seed-invite` + `--invite-code` |
| D-SPA.6-1 | renderer-asserted journey legs on a deployment carrying the marker vocabulary (preview half) |
| D-SPA.12-1 | `settings` surface gate (`T2.matrix`, `T3`, `R8.prefs`) under `--expect-renderer spa` |
| D-SPA.13-1 | `voices` (`T5`, `X1.voices`) |
| D-SPA.14-1 | `onboarding` (`N1`, `N3`, `N4`, `P1.app-new`) |
| D-SPA.15-1 | `project-home` (`R1`, `R7`, `T2.badge`, `T6`, `T7`, `P1.project`, `X1.home`, `R10`) |
| D-SPA.16-1 | `billing` (`N9`) |
| D-SPA.17-1 | `export` + `ide-chrome` (`R5`, `T4`, `T8`, `P1.project`) |
| D-SPA.18-1 | `outline` (`P1.outline`) |
| D-SPA.19-1 | `figures` (`P1.figures`) |
| D-SPA.20-1 | `run-sheet` (`N4`, `R7`, `N9`, `P1.runsheet`) |
| D-SPA.21-1 | `dossier` (`N7`, `T1`, `T12F`, `T13F`, `P1.dossier`) — seeded substrate needs `JOURNEY_DATABASE_URL` |
| D-SPA.22-1 | `run-report` (`R6F`) — seeded delivered report, needs `JOURNEY_DATABASE_URL` |
| D-SPA.23-1 | `editor` mount half (`N8`, `P1.pill`, `P1.project`, `R7`, `R10`, `R10.keepalive`, `T2.badge`, `T6`, `T7`, `T17`) |
| D-SPA.24-1 | `editor` collab half — same `editor` gate, collab wire under the SPA surface |

**SPA.28 restatement (binding):** the D-rows' leg-A (`x-rhema-renderer: ssr` pin) / leg-B
(`rhema:spaSurfaces` flag-on) / rollback-drill vocabulary is RETIRED — flag machinery and the
header override are deleted (`--pin-renderer` refuses exit 2). The honest post-removal leg per
`surface-gates.ts TWO_LEG_PROCEDURE` is: ONE `pr-<n>` preview serves `--expect-renderer spa` on the
surface's gate subset (Page-family forced-SSR verdicts self-report `data-ssr-cause` and are exempt
by design — the ticket's "assert `data-renderer`/`data-ssr-cause` only"). The `D-SPA.*-2` rollback
drills are DROP-mooted in the G1 census — untouched by this run.

Paid steps never dispatch ($0 legs — REQ-VFY-10; `--paid` never passed). The seeded-substrate
steps (`T12F`, `T13F`, `R6F`, `T7` probe) bind `JOURNEY_DATABASE_URL` to the preview's
IaC-generated system DSN through an IAP SSH tunnel on the preview's own proxy VM
(VERIF.1's prod pattern, preview-scoped; firewall rule created + deleted inside the window).

## Requirements

1. Stand `pr-<n>` with chain-tip (`1b1fee9`) images: `preview-stack.mjs` verbs in order
   (`init → config → resend-pull → up` → migrate Job → `seed-invite`).
2. `resend-pull` + `seed-invite` → mint a real mailbox session; journeys CLI `--invite-code`.
3. Execute the 15 preview legs — assert `data-renderer`/`data-ssr-cause` only; committed evidence
   under `docs/build/reports/2026-10-16_verif2/`.
4. Carry D-OPS.1-2 (live paused-AlloyDB leg inside this exercise).
5. Flip genuinely-closed D-rows to DONE with evidence pointers; honestly re-owe failures with
   classification (never fabricate green).
6. DESTROY the stack at closeout; record the destroy + resource cost (≤$8 target).
7. Boundaries: zero prod writes; $0 paid legs; preview resources only; no secrets anywhere;
   `date -u` for every stamp; never merge (mergePolicy OPERATOR).

## Acceptance criteria

- [ ] All 15 preview legs executed on the owned preview with committed evidence *(staging-verified)*
- [ ] Zero prod writes; spend ledger recorded *(deterministic)*
- [ ] verification green; BUILD_INDEX row + LEDGER advanced *(agentic — universal AC)*

## Plan

1. Ledger + PR skeleton → push → `gh pr create` (base `stevevitali/cost-1-prod-cost-posture`)
   → the PR number names the stack (`pr-<n>`).
2. `preview-stack.mjs init pr-<n>`; config `gcp:project`/`gcp:region`/`rhema:placeholderImage`
   (hello — placeholder pass)/`rhema:gitSha`/`rhema:protocolsVersion`; `resend-pull`.
3. Targeted `up` for the `rhema-pr-<n>-images` AR repo → `gcloud builds submit
   infra/cloudbuild/image-set.yaml` `_AR=<the preview repo>` `_TAG=verif-2` `_GIT_SHA=1b1fee9`
   → `config rhema:serviceImages`/`runTaskImageDigest`/`proxyImage` digests → `up`.
   (Images live in the preview's OWN AR — zero `rhema-prod` writes; matches the SPA.11
   authorization wording.)
4. `gcloud run jobs execute rhema-pr-<n>-migrate --wait` → `seed-invite` → healthz/smoke.
5. Journeys: `pnpm --filter @rhema/journeys build` + `playwright install chrome`;
   `--web https://<web>.run.app --api https://<api>.run.app --invite-code prv-<n>-test`.
   Run A — the mint proof + full $0 suite (D-OPS.1-1; every paid:false step). Run B…N —
   `--surface <keys> --expect-renderer spa` gated legs. `JOURNEY_DATABASE_URL` via
   `gcloud compute ssh <proxy-vm> --tunnel-through-iap -L 15433:<alloydb-ip>:5432`
   + a preview-scoped `iap-ssh` firewall rule (created + deleted inside the window).
6. D-OPS.1-2: `gcloud alloydb instances update rhema-pr-<n>-primary --activation-policy=NEVER`
   → `describe` shows NEVER → `preview-stack.mjs refresh` reports no drift (`ignoreChanges`).
7. `destroy` → `rm` → full `rhema-pr-<n>-*` orphan enumeration → spend ledger.
8. DEFERRALS flips + verify suite + closeout.

## Test matrix

No code change — verification legs are the deliverable. Gates re-run at close:
`pnpm turbo build lint typecheck`, `pnpm test`, all `check:*`, `check-build-memory.sh`,
`check-append-only.mjs --base f20ee28`.

## Progress

- 2026-10-16T03:2xZ — ledger seeded; prerequisites verified: `pulumi v3.261.0` logged in
  (`14stevevitali-gmail-com`), `gcloud` → `rhema-507501`, ADC live, `serviceAccountTokenCreator`
  on `rhema-journeys` SA held by the caller (mailbox leg viable), `rhema-nonprod-resend-api-key`
  seeded at 03:24Z (operator-delegated, H8). Only `rhema-prod` AR repo exists → images build into
  the preview's own `rhema-pr-<n>` repo after a targeted repo `up` (no `rhema-prod` writes).

## Gap table

(filled at Phase 4)

## Evidence log

(filled as legs run)

## Evidence report

(filled at close)

ci: pending
