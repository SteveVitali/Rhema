# HUMAN-H13 — Merge the launch-flip PR (post-launch nightlies read the flipped SHA)

- **Kind:** human · **Phase:** round 6
- **Blocks:** 200_R6WATCH.1's nightly-green reads (soft — every other R6WATCH.1 read proceeds)
- **Owner:** operator   **Scheduled:** promptly after 198_R6LCH.1 lands boundary-green
- **Withheld until done:** the post-launch "nightly green on the deployed SHA" claim
- **Deferrals so far:** 0
- **Readout:** `docs/build/readouts/HUMAN-H13.md`

> **Operator work — NOT an `implement-spec` input.** `mergePolicy: OPERATOR`.

## Checklist
- [ ] Merge the PRs above HUMAN-H12's sweep bottom-up through 198_R6LCH.1's PR; CI green at each
- [ ] The agent redeploys `main` HEAD if it differs from prod by more than deploy-neutral paths
      (`GD-DEPLOY.R6`) — note it here

## Exit criterion
`main` HEAD includes the flips; the nightly reads the flipped SHA.
