# SPAREC.1 — backlog + operational readiness: every owed row homed; the post-migration runbook (reconcile pass)

Manifest row 144 · stacks on `stevevitali/spacap-3-capstone-closure` @ `d5e5a3a` ·
merge policy **OPERATOR** — do not merge from the build environment · **$0** spend,
offline-only, no deploys, no production mutations.

Implements `docs/tickets/144_SPAREC.1__backlog-and-readiness.md`
(`reconcile-build mode=backlog`). The round-4 tail reconcile: all 203 checker-parsed owed
DEFERRALS rows, all owed matrix rows, and every live ADR trigger land in exactly one
`BACKLOG.csv` sources cell — **465 expected sources, complete + non-duplicating +
verdict-consistent**.

**Requirement IDs:** REQ-SEQ-7/-9/-10, REQ-VFY-6/-8/-10 (the accepted-deviation tracking rows),
REQ-SPEC-31, REQ-ED-17 (the re-verdicted rows), REQ-SPEC-29 (the matrix gate). **ADR-109**
records the owned decision.

## What landed

### BACKLOG.csv — 5 rows appended, 106 round-4 sources homed

| Row | Type | Sources | The debt |
|---|---|---|---|
| BL-80 | operational-prereq | 29 | `rhema-nonprod-resend-api-key` seed → preview-stack session mint; every `D-SPA.*-1/-2` preview leg/drill + D-MAINT.6-1 + D-SPA.6-1 |
| BL-81 | operational-prereq | 59 | The 15-segment bottom-up activation cadence — all `D-SPAF.*-1..-4` per-surface prod legs + cleanup-wave entry gates |
| BL-82 | operational-prereq | 6 | Post-tip composed verification — D-SPACAP.2-1..4, D-SPACAP.3-1, D-MAINT.4-1 (SHA-matched only) |
| BL-83 | process (**accepted**) | 6 | GATE-ACCEPT.SPA's six signed-deviation matrix rows — tracked, not gate-blocking |
| BL-84 | process | 6 | ADR-104..109 revisit watches |

Two validator-forced dedups on prior rows (minimal, documented): BL-79 drops `ADR-021/024`
(homed on BL-56/BL-30); BL-78 drops `D-OBS.1-3` (single home BL-74).

### ADR-109 — verdict-consistency repair

The in-repo matrix gate enforced a five-bare-value verdict set that predated
`MET-ENGINEERED(D-…)` — the cause of MAINT.3's dishonest `MET` revert on REQ-SPEC-31. The gate
now validates the BM-VERDICT-01 grammar; `REQ-SPEC-31` → `MET-ENGINEERED(D-RES.1-2)` and
`REQ-ED-17` → `MET-ENGINEERED(D-SPA.25-1)` carry their honest verdicts. Sums: engineering closed
513/666 · requirement satisfied 511/666.

### DEFERRALS (append-only)

`D-OBS.1-3` status-hygiene note (embedded-pipe truncation fixed — canonical `OPEN` restored) +
the `## SPAREC.1` reconciliation map naming every home, owner class, and unblock.

### Readiness + ops runbook

`OPERATIONAL_READINESS.md` + `BACKLOG.md` rewritten for the post-round-4 world;
`infra/PROD-BRINGUP.md` gains **§13 Post-migration SPA operations** — pre-chain provenance
(web `6ebb1cb`/api `0acd16d`), forced-SSR is code (ADR-108), rollback = `git revert` + redeploy
(no flag exists), the 15-segment cadence, and the owed Resend secret.

## Verify

`turbo build lint typecheck` 135/135 · `pnpm test` 487 files / **5,562 pass / 6 skip / 0 fail** ·
all six `check:*` green (licenses 822 · protocol-markers · no-cookies 253 · spa-budget · spa-env) ·
coverage-matrix 6/6 · `check-backlog.sh` clean at 465 sources · build-memory 0 violations ·
append-only OK vs `d5e5a3a` · `gh pr checks --watch=false` read once at closeout.
