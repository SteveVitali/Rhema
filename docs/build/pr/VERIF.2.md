# VERIF.2 — Preview-leg wave on an owned `pr-<n>` stack (stream V-2)

**Ticket:** `docs/tickets/165_VERIF.2__preview-legs.md` · manifest row 165 · base
`stevevitali/cost-1-prod-cost-posture` @ `f20ee28` · requirement ids: REQ-OPS-5, REQ-G1-3 (V-2 half)

## Summary

Discharges the 15 surviving preview legs (`D-SPA.6/12..24-1` + `D-OPS.1-1`, REQ-G1-3's stream-V-2
arm) on an owned `pr-<n>` preview stood up with chain-tip images, plus the carried
`D-OPS.1-2` live paused-AlloyDB leg and `D-MAINT.6-1`'s real session-mint proof. Gate H8 cleared
today: `rhema-nonprod-resend-api-key` seeded in `rhema-507501` at 2026-10-16T03:24Z
(operator-delegated), so `preview-stack.mjs resend-pull` + `seed-invite` mint real
`test*@rhema.tools` mailbox sessions through the genuine magic-link path.

Post-SPA.28, the legs assert `data-renderer`/`data-ssr-cause` only — the retired
`x-rhema-renderer`/`rhema:spaSurfaces`/`--pin-renderer` vocabulary in the original D-rows is
honestly superseded by `TWO_LEG_PROCEDURE`'s expect-spa shape.

## What changed

- `docs/build/runs/VERIF.2.md` — the run ledger (leg table, spend ledger, evidence index)
- `docs/build/reports/2026-10-16_verif2/` — journey reports + screenshots per leg
- `docs/tickets/DEFERRALS.md` — closed rows gain DONE + evidence pointers (append-only edits)

No product code changes — this is a pure verification/deferral-discharge ticket.

## Verification

(filled at closeout — per-leg disposition table + gates)
