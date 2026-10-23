# R6CNT.2 — RLS-exposure notice send log (counts only — no recipient content)

**Authority:** `GD-EXPOSURE-NOTICE.R6` — R6FOR.2 verdict **YES** (252 confirmed cross-tenant reads
+ 4 weak write candidates; every identified party operator/staff-controlled, zero external users
in-window); operator verbatim approval **"Approve as drafted"** (received 2026-10-21T19:35Z).
Send = the named mutation of ticket row 194. Tool: `scripts/live/send-exposure-notice.mjs`
(`--dry-run` scope check first, then `--send`), text = the approved `notice-draft.md` VERBATIM
(normalized byte-equal check — `packages/ledger/src/exposure-notice.test.ts` pins the claims).

## Scope check (dry-run, 2026-10-23T04:5xZ)

`exposureNoticeRecipients` over the system-role DSN (IAP tunnel → Cloud SQL): **4 recipients** —
the holders of the real (non-`is_test`) workspaces with a session overlapping the exposure window
(2026-09-17 → 2026-10-01T02:09Z). Every address is staff-controlled (internal `rhema.tools`
mailboxes incl. the SEC.1 probe tenants + the operator's consumer account) — identical scope to
the approval basis in `exposure-forensics.md` (materiality note). **No external user was mailed.**

## Send (2026-10-23T04:5xZ)

`--send` with `EMAIL_FROM="Rhema <security@rhema.tools>"`, Resend key from
`rhema-prod-resend-api-key` (env-only; never printed, never committed).

| leg | count |
|---|---|
| emails sent | **4** (one per recipient; `notification_deliveries` `security_notice` rows `sent`, dedup key `rls-exposure-notice:v1`) |
| inbox rows written | **4** (`inbox_items` `security_notice`, collapse key `rls-exposure-notice:v1` — a re-send would update in place, never duplicate) |
| post-state verification | `notification_deliveries` 4× `sent`; `inbox_items` 4× rows (counts re-read over the same DSN) |

No PII beyond the recipient addresses on the delivery rows themselves; nothing else written.
