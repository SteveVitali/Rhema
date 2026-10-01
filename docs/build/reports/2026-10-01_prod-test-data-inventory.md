# Prod test-data inventory — 2026-10-01 (MAINT.2, for HUMAN-H7 / BL-38)

Committed inventory of test data known to exist on prod (`rhema-507501`), assembled **entirely from
committed records** — no live query or write was performed for this report (MAINT.2 spends $0). The
operator decides each row's fate; the deletes are HUMAN-H7's "Prod test-data cleanup" item
(`docs/tickets/85a_HUMAN-H7__round3-operator-legs.md`). Nothing here is a credential, session token,
or secret; emails appear only where committed docs already name them.

Workspace ids cited: the operator's lived-in workspace `01M2V3PM11XSF05VJ9G01PM5ZB` (slug
`my-first-project`'s workspace — `runs/STB.2.md` §3).

## Inventory

| # | Item | Where | Evidence (committed) | Recommended action | Delete-risk |
|---|---|---|---|---|---|
| 1 | Test draft `01M3D7E119PP2HA9GP6XT2DG87` (v7, `human_upload`, from `stb2-import.md`) | prod · operator workspace · project `my-first-project` · `drafts`/`artifact_versions` | `runs/STB.2.md` §3 (creation round-trip) + §6 ("harmless new version; delete it manually if unwanted") | **Delete** via product UI (or `Recently deleted` flow) — it is upload-test residue | Low — additive v7 draft on a real project; deleting drops the STB.2 round-trip artifact (already recorded) |
| 2 | Stray `deployments` provenance row `prod:82179e1` (short-sha stamp, protocols `0.4.0+test`, 2026-09-26 09:04Z) | prod · `deployments` table | `runs/DEF.1.md` §7.1 — "first-attempt artifact — superseded by the full-sha row `prod:82179e1356b1d5…` 39 s later" | **Delete** — superseded stamp; keep the full-sha row | Low — provenance is informational; the full-sha twin preserves the deploy record |
| 3 | Review account `14stevevitali+rhema-review@gmail.com` + its seeded Showcase copy | prod · `users`/`accounts`/`workspaces` | `reports/2026-09-30_prod-design-review.md` § Identities (a) + "Prod state touched"; H7 marker 2026-09-30 note — account deletion already scheduled, hard-deletes 2026-10-14 | **Keep the scheduled deletion** — verify after 2026-10-14 that the hard-delete completed | None beyond the scheduled-delete contract (14-day grace, then cascade) |
| 4 | Test projects "The Library After Dark" + "The Library After Dark (review test)" incl. the accidental Page note + the completed review run (632 cr debited) | prod · the review account's workspace (row 3) | same report — "two test projects … one accidental Page note … one completed review" | **Delete with the account** (row 3's scheduled deletion covers them) — verify post-2026-10-14 | Low — cascade-delete with the account; the review's findings are superseded by this report + BACKLOG |
| 5 | Review-test project + its run in the operator's workspace | prod · operator workspace · project + `runs` | H7 marker 2026-09-30 note — "deleted through the product (in 'Recently deleted' until its 30-day purge)" | **Already operator-deleted** — verify the 30-day purge completes (2026-10-30ish) | None — already deleted |
| 6 | `stb-3-memo-fixture` project + memo run `01M3DKQR0TY6ADGV2D1RTJBVG5` (+ the `stb3-internal.example.invalid` user-source fixture data) | prod · operator workspace | `runs/STB.3.md` (run id + `urlPolicy` fixture domains, ~line 82); `DEFERRALS.md` D-P1.21-2 | **Keep** — it is the seeded fixture the owed memo deny-on-attempt leg (BL-18 / STB.5b) will reuse; delete only after D-P1.21-2 closes | Medium if deleted early — BL-18's live leg references it |
| 7 | Personas "PRB16 Probe Voice" (persona `01M2S7G0SH9V4X7YW0W0TH9XH4`) and "STB3 Probe Voice" | prod · `personas` — **operator workspace** (evidence: PR-S1 showed them to a foreign account via the cross-tenant leak, and the PRB.16/STB.3 legs ran under the operator session; confirm with a read-only `personas` lookup at cleanup time) | `runs/PRB.16.md` Leg 11 (201 + `voice.created`); `reports/2026-09-30_prod-design-review.md` PR-S1 (names + visibility) | **Delete** (or `deleted_at`-soft-delete) — probe personas with synthetic sources | Low — personas are per-workspace; deletion does not touch delivered reviews |
| 8 | SEC.1 probe accounts `test+sec1a@rhema.tools`, `test+sec1b@rhema.tools` (tag `sec1a`/`sec1b`) | prod · `users`/`accounts`/`workspaces` — **likely `is_test=false`** (created through the real funnel 2026-10-01, before migration 0046's flagging deploy; JOURNEY.1 confirmed pre-migration test-mailbox rows stayed unflagged — `runs/JOURNEY.1.md` "pre-migration test-mailbox rows correctly unflagged") | `runs/SEC.1.md` (probe accounts through the real funnel, two-tenant probe) | **Delete manually** (they are unflagged → the JOURNEY.1 purge sweep will not catch them) — or set `is_test=true` and let the purge path handle it | Low — probe accounts hold probe fixtures only; confirm unflagged status by read-only query first |
| 9 | JOURNEY.1 test tenants `test+j<n>…@rhema.tools`, `test+jrn-a/b@rhema.tools` incl. tenant A's nonce voice + nonce project (X1 leg) | prod · `workspaces.is_test=true` flagged | `runs/JOURNEY.1.md` § evidence log — "is_test=true on every journey-provisioned workspace"; X1 leg; purge sweep verified live | **Keep** — they are the live fixture for the nightly/weekly journeys; the purge sweep retires them automatically past `TEST_TENANT_PURGE_HOURS` (26 h) | None if left — self-cleaning by design; deleting early breaks the scheduled journeys |
| 10 | Purge residue: workspace shells + billing rows retained for already-purged flagged workspaces (`account.hard-delete` contract keeps them) | prod · `workspaces`/`credit_*` tables | `runs/JOURNEY.1.md` § evidence log — "workspace shell + billing rows retained per contract" | **Keep** — retained-by-contract for billing audit; not test residue in the BL-38 sense | N/A — intentional retention |
| 11 | House-credit grant residue on flagged tenant `jrn-a` (2,000 cr; ledger `01M3V5PZK782VM4J8WWXK12T55`, audit `01M3V5PZW13JXWGMT93D1VX4CV`) | prod · `credit_ledger`/`admin_actions` for the flagged `jrn-a` workspace | `runs/JOURNEY.1.md` § evidence log + GATE DECISIONS 2026-10-01 row | **Keep** — credits fund the weekly paid journey leg; excluded from trial/spend accounting by `is_test` | None — flagged-tenant rows are already excluded from real metrics |
| 12 | Quarantine/converted objects `stb2-import.md` under `…/01M2V3PM11XSF05VJ9G01PM5ZB/01M3D79XPWAGF88PMPF1K0YFJJ` | prod GCS · `quarantine/` + `converted/` prefixes | `runs/STB.2.md` §6 — "swept by lifecycle" | **No action** — lifecycle-managed; verify a sweep ran if still present | None |

## Notes for the operator

- Rows 3–5 are already in motion (scheduled account deletion / product delete); this report adds the
  evidence pointers, not new actions.
- Rows 8–9: the only ambiguity the committed record leaves is *which* test-mailbox accounts carry
  `is_test=true`. JOURNEY.1's evidence shows flagging applies at provisioning **after** migration 0046
  deployed; SEC.1's probe accounts predate that deploy and are expected unflagged (the purge ignores
  them). A read-only `select email,is_test …` on the test mailboxes settles it at cleanup time — MAINT.2
  runs no queries.
- Row 7's workspace attribution is inferred (cross-tenant visibility + session of record); confirm with
  the same read-only pass.
- `provided:` markers: the test mailbox `test@rhema.tools` is `provided: yes` (H7 § checklist). No other
  item here is a provided fixture.
