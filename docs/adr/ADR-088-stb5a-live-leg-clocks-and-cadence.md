# ADR-088: STB.5a live-leg clock rule, cadence map, and the honest-owed boundary for clock legs

- **Status:** Proposed
- **Date:** 2026-10-04
- **Ticket:** STB.5a
- **Requirement ids:** REQ-SPEC-29, REQ-ARCH-33, REQ-BILL-7, REQ-ACCT-4, REQ-MOBILE-11
- **Spec:** §5.7, §5.11, §4.2, §14.4; ADR-016, ADR-020, ADR-087

## Context

STB.5a turns the deferred BL-21/BL-22 obligations (dossier surfaces, export, notifications,
ingest, purge) into permanent `packages/journeys` steps walked live in browsers on test tenants —
a $0-inference evidence ticket: **no leg may launch a run**. Two environmental facts bound what a
leg can honestly assert (measured 2026-10-04 against prod):

1. **The test-tenant auto-purge outruns every clock leg.** JOURNEY.1's `is_test` workspaces are
   reaped ~26 h after creation (migration 0046). The account-export link lives 7 days; the project
   tombstone lives 30 days; a stale-voice digest waits for the Monday window. Every workspace-
   scoped row a clock leg needs (the `account_exports` row, the tombstoned project) is destroyed
   before the interesting instant ever arrives.
2. **The own-tenant delivered Review exists only inside the weekly paid leg.** A free nightly run
   has no delivered Review on any tenant (the seeded Showcase is read-only — its mutation surface
   correctly answers `showcase_read_only`, §15.4). The paid weekly leg's own steps (N5/N6/N11/R9)
   are what create the deliveries the BL-21 reads consume — and the ticket's own legs must observe
   rather than produce.

ADR-016 already retired lifted-session HTTP batteries; ADR-087 set the precedent that every leg
whose block can't clear inside the ticket is **expected-deferred with the protocol committed**, a
red registry flag, and a `D-*` row — never a green claim on unexercised code.

## Decision — the clock rule (the ticket's option ii, minus the exemption it can't grant)

Clock legs on this tenant class are executed under **the honest production clock**, never a
hand-dated production row (the ticket's option iii requires an operator tick that was not granted
in scope) and never a fabricated `dev` stage (dev carries no public DNS — a leg that can't reach
its target isn't a leg). Where a clock instant is unreachable within the 26 h tenant lifetime —
the export's day-7 410, the tombstone's day-30 destruction — the leg asserts **the arm's
verifiable half today** and registers the fire-date half red/owed with the residual recorded in
`DEFERRALS.md`. Specifically:

- **7-day export expiry (T8):** the live leg proves the token gate exists (bogus token → 404; the
  same-day ready link → the real zip, T3). The 410-on-expiry half is owed — it needs either a
  purge exemption on the exporting test tenant (an operator act) or a hand-dated `account_exports`
  row (option iii). A leg left on this clock must name its fire date in the deferral row.
- **30-day purge (T6/T7):** T6 proves the tombstone + restore-window surface live; T7 proves the
  `project.purge` pg-boss job is enqueued at tombstone + 30 d singleton-keyed on the project (the
  schedule of record, via the read-only `JOURNEY_DATABASE_URL` pool). The destruction itself is
  owed — the 26 h reap wins every race — and the DEFERRALS note says so, explicitly.
- **Monday digest / stale voice (T16):** the positive half needs a `persona_profiles` row on a
  test tenant, which only a paid voice build produces — a run this ticket may not launch. The leg
  asserts the honest negative today (a sample added to a profile-less persona produces **no**
  stale row) and stays red for the positive half.
- **Quiet hours (T9/T14):** not a clock leg — the window is *armed now for the next 3 h UTC*, so
  deferral is observable inside the same weekly run. T9 arms it through the real settings form
  before the leg's runs launch; T14 asserts the session's `run_finished` rows carry
  `visible_at` = the window's end while a same-window escalate decision lands immediately
  (approvals/decisions are never deferrable — spec §5.11). The arm is idempotent and scoped to
  the flagged test tenant; it is left armed (harmless — the tenant reaps at +26 h).

## Decision — the cadence map

Every step rides the cadence its prerequisite forces; the spend guard's existing split applies.

| cadence | steps | why |
|---|---|---|
| **nightly, $0, fresh tenants** | T1–T6 | seeded-Showcase dossier reads (T1), Inbox/settings surfaces (T2), the account-zip round trip + REQ-ARCH-33 scan (T3), the citeproc md export (T4), the committed-zip ingest re-sync (T5), the tombstone surface (T6) |
| **nightly, $0, red** | T7–T8 | DB-bound schedule reads (T7) and the expiry gate's negative (T8) — green-able only when `JOURNEY_DATABASE_URL` / a purge exemption exists; red on scheduled CI |
| **weekly, paid, jrn-a** | T9–T16 | own-tenant delivered-Review reads (T10–T11), dossier writes (T12–T13), notification/decision legs (T14), the `?gate=` deep link (T15), stale voice (T16) |

Registry placement is load-bearing: **T9 sits before N5** (arming precedes the leg's deliveries);
**T10–T16 sit after R9** (they read what the leg delivered). The paid flag keeps all eight off the
nightly path and inside the weekly $5 guard — none of them launches a run, so they add ~$0 to the
leg (the $3 paid-run anticipation guard is unaffected).

## Decision — the reads that have no UI surface

Three legs need facts only Postgres carries (`pgboss.job` rows, `inbox_items.visible_at`,
`account_exports.expires_at`). They read through a **read-only `JOURNEY_DATABASE_URL` pool bound
by the operator for the evidence run** — the same seam the `--paid` spend guard already uses.
Scheduled CI cannot reach the private DB; there the affected steps fail closed into the runner's
owed/ready-to-flip reporting rather than asserting unverifiable state. Two legs need *writes* the
SSR surface does not carry (the CSL-JSON bibliography POST; a defer with `deferHorizon:
pre_export`). Those ride the **api's session-cookie surface** — the credential the real magic-link
flow minted this run, forwarded exactly as the web service forwards it (the 1.x app's own path;
REQ-MOBILE-11) — never a DB-lifted token, which ADR-016 forbids.

## Consequences

- The BL-21/BL-22 evidence becomes **self-maintaining**: nightly legs catch export/ingest/Inbox
  regressions on every deploy; the weekly paid leg re-proves the dossier surface each week on a
  fresh delivery — no staleness accrues.
- Three legs are permanently honest-red until an operator grants a purge exemption or a hand-date:
  their fire dates and exact residuals live in `DEFERRALS.md`, and the registry's ready-to-flip
  signal lights them up the moment the block clears.
- A future ticket that *does* grant a test-tenant purge exemption (or stands up public dev DNS)
  flips T7's destruction half and T8's 410 half by re-running, not by rewriting — the steps are
  already written to the live contract.

## Alternatives considered

- **Hand-dated production rows (option iii):** rejected — requires an operator write into prod
  data; the ticket granted no such tick, and a hand-date executed by the agent alone would be the
  agent manufacturing the evidence it then reports.
- **Public dev stage (option i):** rejected for this run — dev has no public DNS; standing one up
  is infra scope beyond a $0 evidence ticket.
- **Fixture/http-only legs (the deferred PRB.04 battery):** rejected — ADR-016 retired them; every
  leg here walks the real browser or explicitly says why the residual is owed.
- **Launch a tiny paid run to make the owed legs pass:** rejected — the ticket's own invariant (#11)
  forbids it; the weekly leg's existing runs already produce everything the legs need.

## Revisit trigger

Reopen when (a) an operator grants a test-tenant purge exemption or approves a hand-dated prod row
— T7's destruction half and T8's 410 half execute immediately; (b) public dev DNS exists — the
clock legs can replay on dev end-to-end; or (c) the test-tenant purge interval changes — the
26 h-vs-30 d arithmetic this ADR rests on must be re-measured.
