# PRB.09 — Email notifications with signed one-click actions

**Spec:** `docs/tickets/25_PRB.09__email-notifications.md` (REQ-IDE-47 email half, REQ-ACCT-1,
REQ-SPEC-20 email half, REQ-GATE-8, REQ-MOBILE-10 as applied to email; §5.11/§10.4; closes
**D-P0.10-1**) · **Base:** `stevevitali/prb-08-beta-billing` · **Stacked PR — do not merge
(mergePolicy=OPERATOR).**

## Summary

The beta's off-desk channel. Resend is the mail transport — used **only by `apps/worker`** behind a
`MailSender` port (fixture-backed in tests; no live Resend call anywhere in the suite), so the API key
never leaves the worker process. `notify` jobs carry the cadence: an approval gate unresolved after
15 minutes emails the owner with **signed one-click *Wait for me* / *Open* links — never Approve**;
auto-proceed gates get reminders at T−1h and T−10m that re-arm when the deadline moves and no-op when
the gate resolves or is held; auto-proceeded resolutions email the decision and its cost (on by
default); finished/failed runs email; credit burn alerts at 50/80/100% fire once each. Quiet hours
delay the ordinary finished mail but never gate/spend mail (§10.4 N-class). Every send is a
`(user, channel, dedup_key)` claim row in `notification_deliveries` — one notification per event per
channel, collapse key = run id, crash-safe re-drive for claimed-but-unsent rows. Per-event-type
preferences are server-side (`notification_prefs`, existing 0002 table) with the two
non-configurable rows — spend gate and trial/payment — enforced in the handler *and* rejected at the
API boundary.

## What changed

- **`@rhema/contracts`** — `notifications.ts`: the §5.11 event-type catalogue, the pref matrix
  (configurable vs. locked rows), the `notification_prefs.prefs` jsonb shape, signed-action payload
  schema, and the **email template registry** (IDs + titles + whitelisted facts only — no
  finding/draft text, per §10.4's payload rule); `events.ts` gains the `gate.reminder` run event
  (`{kind, offsetMinutes, action, deadlineAt}`).
- **`@rhema/db`** — migration `0021_email_notifications.sql`: `email_action_tokens` (the row behind a
  signed link — gate + user + action + expiry binding, `consumed_at` single-use marker, `action in
  ('open','hold')` CHECK) and `notification_deliveries` (`unique (user_id, channel, dedup_key)`,
  `run_id` collapse key, `claimed|sent` status); both tenant-keyed + FORCE RLS like
  `analytics_events`. Drizzle parity in `schema/misc.ts`.
- **`@rhema/orchestrator`** — `email-actions.ts` (`mintEmailAction`/`consumeEmailAction`: the link is
  `<id>.<hmac>`; consume re-verifies the signature, checks expiry + binding, and flips `consumed_at`
  in a conditional update — replay/tamper/expiry each fail closed; `hold` resolves the gate as
  `wait`, `open` just redirects); `notifications.ts` (`scheduleGateNotifications` +15m wait mail +
  reminders off the gate's **actual** `on_expiry`; `scheduleGateReminders` deadline-keyed singletons;
  `handleNotifyJob` re-reads the gate — resolved/held/moved-deadline ⇒ reschedule or no-op; prefs
  honored with mandatory rows unskippable; quiet hours via the user's window; credit thresholds;
  `handleMailSendJob` marks the delivery `sent`); `internal-api.ts`/`gate-expiry.ts`/`run-creation.ts`/
  `reactions.ts`/`reaper.ts` call sites wired (open, auto-proceed, reopen, resume-partial, cancel —
  `cancelRun` resolves open gates first so queued notify jobs no-op).
- **`apps/api`** — `notification-routes.ts`: `GET/PUT /notifications/prefs` (effective matrix; a
  locked-row write is 400), `GET /action/:token` (consume → hold → 302 to the review deep link;
  tampered 400, expired/replayed 410, unauthenticated prefs 401).
- **`apps/worker`** — `notification-jobs.ts` (`notify` + `mail.send` consumers; `ResendMailSender`
  implements `MailSender`), `env.ts` (`RESEND_API_KEY`, `RHEMA_APP_BASE_URL`, notification signing
  secret), `main.ts` queue registration; `resend@6.26.0` added to worker deps only.

## Design decisions

- **Approve is never a link.** The DB CHECK is `('open','hold')`, the action union is two members,
  and a template test greps the rendered registry for any approve affordance. Wait-for-me resolves
  the gate as a `wait` decision — the server-side `POST /gates/:id/hold` equivalent.
- **Claim-row idempotency.** `notification_deliveries` is the ledger of record: `sent` dedupes,
  `claimed`-without-`sent_at` is a crashed attempt the retry completes, queue singleton keys thin
  duplicate active jobs, and handlers re-read state at fire time so a resolved gate's stale job
  sends nothing.
- **Reminders follow the real deadline.** Jobs are keyed on `(gate, deadlineAt, offset)`; a moved
  deadline schedules a new keyed job and a stale fire reschedules itself — the 15-minute/1h/10m
  cadence survives `presence_deadline_at` bumps and hold-release deadline moves.
- **Payload minimization (§10.4).** Templates render ids, gate kind, run state, the do-nothing
  outcome, decision + cost, and deep links — never finding bodies, draft text, or protocol content.

## Out of scope (as specced)

In-app Inbox, push/mobile (`NotificationTransport`), product-update emails, digests — P1.19/1.x.

## Test plan

- **AC1** `orchestrator/notifications.test.ts` — open → +15m unresolved mail with a working signed
  Wait-for-me link; consume holds the gate; the replay 410s; reminders at T−1h/T−10m; a moved
  deadline re-arms; resolution cancels pending sends.
- **AC2** `contracts/notifications.test.ts` — no template contains or renders an Approve action.
- **AC3** `orchestrator/notifications.test.ts` — auto-proceed expiry mail carries the decision and
  its cost, on by default.
- **AC4** `api/notification-routes.test.ts` — full effective matrix; toggling a configurable row
  works; disabling a locked row 400s; handler-side mandatory rows can't be suppressed.
- **AC5** `api/notification-routes.test.ts` + `orchestrator` tests — expiry → 410, tamper → 400,
  replay → 410, cross-gate/cross-account binding rejected.
- Gates: `turbo build lint typecheck` **108/108**; `pnpm test` **1810 pass / 2 skip / 254 files**;
  `check:protocol-markers` OK; `check:licenses` OK (502 pkgs). **No live Resend request was made —
  all mail is fixture-backed.**
