# SPAREC.3 — integration plan: the merge + activation plan for the round-4 SPA stack (never merges)

Manifest row 146 · stacks on `stevevitali/sparec-2-spec-reconciliation` @ `d263808` ·
merge policy **OPERATOR** — do not merge from the build environment · **$0** spend,
offline-only, no deploys, no production mutations, nothing merged.

Implements `docs/tickets/146_SPAREC.3__integration-plan.md`
(`reconcile-build mode=integration`). Appends the round-4 section to
`docs/build/INTEGRATION_PLAN.md` (§R4.0–R4.13, +385 lines; the round-3 section is
untouched — append-only per contract). The plan is operator-executable verbatim:
numbered steps, exact commands, expected outputs, stop conditions.

**Requirement IDs:** none — process/capstone row (the SPA REQ ids are audited by
SPACAP.1's matrix, not stamped here).

## What the plan says

- **Composition with round 3 (the honest Q-7 answer, §R4.1–R4.2):** the round-3 chain
  is merged **through PR #97 only** (`main` head `c13d865`). The round-3 tail
  **#98–#118 is unmerged and sits below the round-4 stack** — merge order is stack
  order, not round order: #98 → tip, bottom-up. Deployed provenance (web `6ebb1cb`,
  api `0acd16d`) lives inside unmerged #118; the pending pinned deploys
  (`5baa666`/#104, `bbe1e95`/#105) are already-live ancestors — superseded, not
  replayed. `MAINT.5` is folded inside #118 (no dedicated PR).
- **Merge order (§R4.3–R4.4):** strictly ascending PR number, merge commits only,
  retarget-via-branch-deletion (the #48–#97 flow). #98's declared base is a merged
  branch — retarget to `main` is step 0.
- **CI expectation (§R4.5):** #98 all-five-green at read; the old standing reds are
  resolved in code on `main` (`b1800e1`). `integration`/privsep intermittently red on
  later heads (#157, #161 observed) — the GD-MAINT.4-1 waived class; a non-privsep
  red is a stop.
- **One predicted conflict (§R4.6):** `ux-1` was rebased onto slo-1's final head
  `b1800e1`; the stack above was not (merge-base `c3d776c`). Merge-tree of tip vs
  `main` = exactly 1 union-resolvable hunk in
  `scripts/check-additive-migrations.test.mjs` (keep `main`'s `0054` line + the
  chain's `0055`–`0058` additions).
- **The 15-segment activation cadence (§R4.7–R4.9):** the SPACAP.2 runbook verbatim,
  refined to live PR numbers — segment 0 merges the round-3 tail; segments 1–14 merge
  through each SPAF boundary → deploy at the boundary SHA → marker curls + `?ssr=1`
  arm + `--surface <key> --expect-renderer spa` leg → ≥1 nightly journeys green
  (`D-SPAF.*-4`, cron `5 6 * * *`) → next. Segment 15 (cleanup wave #158 → tip)
  merges+deploys only after the `editor` flip's bake.
- **Deploy procedure (§R4.8):** verbatim — `image-set.yaml` Cloud Build at the
  boundary SHA (api+web minimum for provenance parity) → digest pins → `pulumi
  preview`/`up` → `check-deploy-provenance` all-PASS → `record-deployment.mjs` over
  the IAP tunnel.
- **Arm B fallback (§R4.11)** recorded with its compressed-verification consequence;
  **the Resend secret (§R4.12)** is a parallel preview track, never a serial blocker
  (prod legs mint sessions through the live mailbox).
- **Rollback + stop conditions (§R4.13):** stage-fact revert + redeploy inside the
  window; `git revert` + redeploy only after segment 15; eight named stop conditions.

## Verify

`pnpm turbo build lint typecheck` 135/135 · `pnpm test` green · all six `check:*`
gates green · `check-backlog.sh` 465 expected sources · `check-build-memory.sh`
0 violations (pre-existing warning class only) · `check-append-only.mjs --base
d263808` OK. Full results in `docs/build/runs/SPAREC.3.md`.

## Deferrals

None opened or closed — this row *is* the plan the deferred legs cite; every
`D-SPAF.*`, `D-SPA.*`, `D-SPACAP.*`, `D-MAINT.6-1`, `D-OPS.1-1` row stays OPEN
tracking to the same unblocks (ordered merge/deploy, the Resend secret, the tip).
