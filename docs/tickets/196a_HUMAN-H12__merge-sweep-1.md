# HUMAN-H12 — Merge sweep 1 (pre-launch): `main` == the launch candidate

- **Kind:** human · **Phase:** round 6
- **Blocks:** 197_R6SWP.1 (the post-merge redeploy + the first scheduled nightly on `main` HEAD)
- **Owner:** operator   **Scheduled:** when 196_R6GLD.1 lands boundary-green
- **Withheld until done:** the nightly-green claim (D-OBS.1-3, D-SPA.28-1) and GATE-LAUNCH (6)
- **Deferrals so far:** 0
- **Readout:** `docs/build/readouts/HUMAN-H12.md`

> **Operator work — NOT an `implement-spec` input.** `mergePolicy: OPERATOR` — the chain never
> merges. Use merge commits per `docs/build/INTEGRATION_PLAN.md` (deployed SHAs stay ancestors).

## Checklist
- [ ] Retarget the bottom open PR (at the 2026-10-20 read: #180, whose base is the merged
      `navc-4` branch) to `main`
- [ ] Merge bottom-up through 196_R6GLD.1's PR (the R6ENG.1 PR carries the round-6 planning
      commits); CI green at each merge
- [ ] Record `main` HEAD after the sweep

## Exit criterion
`main` HEAD contains every round-6 pre-launch commit. It may differ from the tip only by
deploy-neutral paths (e.g. `main`'s extra `.gitleaks.toml` allowlist lines — a round-3 merge
artifact).
