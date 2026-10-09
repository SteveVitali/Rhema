# N5 delivery note — 2026-10-02

`report.json` records `outcome: "owed"` because the harness's 40-minute dossier poll expired while
the trial run was parked at a non-blocking `approve_scope` gate (`01M3Z59GTWA1QVRE6B9C5TH90G`) —
a named-approval wait the journey step didn't exercise. The gate was approved through the real user
path (`POST /p/jrn-0220c2d0eb47-paid/gates/<gid>`, `action=approve`, resolved 21:16:58Z) and the run
resumed to `completed` at 21:54:47Z — dossier HTTP 200 (`N5-dossier.png`), **no cap death**.

Every N5 assertion upstream of the poll passed in-process: *Included* line carrying the configured
**2,800**-word cap, hidden `entitlementId`, `rhema_fp` minted, launch accepted. Post-delivery DB
evidence (`delivery-evidence.json`): `trial_unlock_checks` `allow`/`ok`, entitlement
`01M3Z532GKY5WE3JXPBGP1F17G` (`word_cap=2800`) `consumed`, `hold_bucket=trial_pocket`, zero credit
debits. Run `01M3Z55G8VAQEVRKF2RXEJA1G0`.

The N5 step now checks the per-run `autoRun` control (same pattern as N6) so unattended runs don't
park at `approve_scope`; registry flipped to `expected: "green"` on this evidence.
