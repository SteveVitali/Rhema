# PRB.09 — Email notifications with signed one-click actions

- **Spec:** `docs/tickets/25_PRB.09__email-notifications.md`
- **Base:** `stevevitali/prb-08-beta-billing` @ `d4e5eaf`
- **Branch:** `stevevitali/prb-09-email-notifications` · PR #37
- **Config:** implement-spec full preset (deterministic only — Resend behind a `MailSender` port,
  fixture-backed in tests; no live Resend request made or permitted)

## Deferrals read

`docs/tickets/DEFERRALS.md` read at start. Relevant row:

- **`D-P0.10-1` (reminder notifications — 1h + 10m before expiry) — CLOSED.** This ticket was its
  named unblocker. `gate.reminder` is now a user-visibility run event (`{kind, offsetMinutes,
  action, deadlineAt}`); `notify` jobs are scheduled at `deadline−1h`/`deadline−10m` as
  deadline-keyed singletons (a moved deadline re-arms; a stale fire re-reads + reschedules or
  no-ops); the email carries the do-nothing outcome + signed deep links; `notifications.test.ts`
  asserts both reminders fire once, the event lands, a moved deadline re-arms, and resolution/held
  cancels pending sends. Row flipped to DONE with evidence.
- No new deferral opened — every acceptance criterion is satisfied deterministically; the only
  live-only leg (a real Resend delivery on `dev`) is inherent to the no-live-calls rule, same
  posture as PRB.08's Stripe fixtures.

## Requirements

1. Mailer worker: `mail.send` jobs, Resend, templated emails — IDs/template text only (no
   finding/draft text beyond titles; §10.4 payload rule), deep links to the beta surfaces.
2. Signed one-click actions: single-use, expiring signed URLs for *Wait for me*
   (`POST /gates/:id/hold` equivalent) and *Open*; **no Approve action in any email**.
3. Cadence: gate-opened email if unresolved after 15 min; reminders at 1 h and 10 min before
   expiry; auto-proceeded decisions emailed with decision + cost (on by default); run
   finished/failed; credit 50/80/100% alerts.
4. Preferences: per-event-type, server-side; the two non-configurable rows (spend gate,
   trial/payment) enforced; one notification per event per channel; collapse per run.
5. Invariants: Approve never remote (REQ-MOBILE-10 as email); spend gates never auto-proceed and
   never lose their notification (REQ-SPEC-1); quiet hours never delay gate/spend mail (§10.4).

Out of scope: in-app Inbox, push/mobile, product-update emails, digests (P1.19/1.x).

## Plan / what landed

- **`@rhema/contracts`** — new `notifications.ts`: the §5.11 beta event-type catalogue
  (`gate.waiting`, `gate.reminder`, `gate.auto_proceeded`, `run.finished`, `run.failed`,
  `credits.threshold`, spend/trial rows), the pref matrix with `configurable` flags (spend-gate +
  trial/payment locked), the `notification_prefs.prefs` jsonb shape (`{email: {<type>: bool},
  quietHours?}`), the signed-action payload schema, and the **email template registry** — subject +
  text renderers taking ids/titles/state/decision/cost/deep-links only. `events.ts` gains the
  `gate.reminder` run event.
- **`@rhema/db`** — migration `0021_email_notifications.sql`:
  - `email_action_tokens(id, workspace_id, gate_id, run_id, user_id, action check in
    ('open','hold'), expires_at, consumed_at)` — the row behind a signed link; the CHECK itself
    excludes any approve action.
  - `notification_deliveries(id, workspace_id, user_id, channel, event_type, dedup_key, run_id,
    subject, status 'claimed'|'sent', sent_at, unique(user_id, channel, dedup_key))` — the
    one-per-event-per-channel ledger; `run_id` is the §5.11 collapse key.
  - Both tenant-keyed + FORCE RLS (`workspace_id = current_tenant()`), same pattern as
    `analytics_events` (0020). Drizzle parity in `schema/misc.ts`.
- **`@rhema/orchestrator`**
  - `email-actions.ts` — `mintEmailAction`/`consumeEmailAction`. Link = `<id>.<hmac>` (HMAC over the
    row id + binding fields; injected secret, deterministic clock/ids). Consume re-verifies,
    enforces expiry + gate/account/workspace binding, and flips `consumed_at` via conditional
    update — replay → `gone`, tamper → `invalid`, expired → `gone`. `hold` resolves the gate as a
    `wait` decision; `open` produces the review deep link (`gateDeepLink`/`runDeepLink`/
    `billingDeepLink` against the app base URL).
  - `notifications.ts` — `NOTIFY_QUEUE`/`MAIL_SEND_QUEUE`; `GATE_WAITING_DELAY_MS` = 15m;
    `REMINDER_OFFSETS_MS` = [1h, 10m]; `CREDIT_THRESHOLDS` = [50,80,100]; `MailSender` port;
    `scheduleGateNotifications` (waiting mail at +15m + reminders off the gate's **actual**
    `on_expiry`, not the kind default); `scheduleGateReminders` deadline-keyed singleton jobs;
    `scheduleRunTerminalNotification` (finished/failed; quiet hours delay ordinary finished mail
    only); `scheduleCreditsCheck` (each threshold once via dedup keys `credits:<acct>:<pct>`);
    `handleNotifyJob` — re-reads the gate at fire time: resolved/held/missing → no-op; moved
    deadline → reschedule or send-now if the new instant already crossed; prefs read with mandatory
    rows unskippable; mints the signed links; enqueues `mail.send` with the rendered template;
    `handleMailSendJob` — sends via the port, marks the delivery `sent` (crash between claim and
    send → the retry re-drives the same delivery row); `readNotificationPrefs` merges stored prefs
    over the default-on matrix.
  - Call sites — `internal-api.ts` (deps + gate-opened + terminal + auto-proceeded scheduling),
    `gate-expiry.ts` (reminder re-arm on activity/presence deadline moves; `gate.reminder` event;
    auto-proceeded mail with decision + cost; spend/refusal auto-proceed defense preserved),
    `run-creation.ts` (confirm_cost/spend gates — mandatory), `reactions.ts` (reopened approval +
    refusal gates), `reaper.ts` (resume_partial gates); `cancel.ts` unchanged — it resolves all
    open gates before terminal cancel, so queued notify jobs see `resolved_at` and no-op.
- **`apps/api`** — `notification-routes.ts`: `GET /notifications/prefs` (effective matrix incl.
  locked rows), `PUT /notifications/prefs` (configurable toggles; a locked-row disable → 400),
  `GET /action/:token` (consume → hold → 302 deep link; `open` → 302; tampered → 400;
  expired/replayed → 410); all routes principal-gated. Wired in `index.ts`/`server.ts`; env gains
  the action-signing secret + app base URL.
- **`apps/worker`** — `notification-jobs.ts`: `ResendMailSender implements MailSender`;
  `handleNotifyJobPayload`/`handleMailSendJobPayload` consumers registered on the `notify` +
  `mail.send` queues in `main.ts`; env gains `RESEND_API_KEY` + the shared signing secret. The
  Resend key exists only in the worker's env surface — web/collab never see it.
  `resend@6.26.0` added to `apps/worker/package.json` only.

## Test matrix

| AC / requirement | Test |
|---|---|
| AC1 lifecycle: open → +15m unresolved mail → signed Wait-for-me works once; reminders at T−1h/T−10m; resolution cancels | `orchestrator/notifications.test.ts` — full lifecycle on PGlite + InMemoryQueue with a clock cursor; consume → gate held; replay → 410-class result; both reminder offsets fire once with `gate.reminder` emitted |
| AC2 no Approve anywhere | `contracts/notifications.test.ts` — renders every registered template and asserts no approve action/affordance; the `action in ('open','hold')` CHECK + two-member union make it structural too |
| AC3 auto-proceeded mail = decision + cost, on by default | `orchestrator/notifications.test.ts` — expiry auto-proceed produces the auto_proceeded mail containing the decision and its cost |
| AC4 pref matrix + locked rows | `api/notification-routes.test.ts` — GET returns the full effective matrix; PUT toggles a configurable row; PUT disabling a locked row → 400; orchestrator tests prove a mandatory spend-gate mail can't be suppressed even with a stored off-pref |
| AC5 expiry/tamper/binding | `api/notification-routes.test.ts` (expired → 410, tampered → 400, replay → 410, unauthenticated prefs → 401) + `orchestrator/notifications.test.ts` (cross-gate/cross-account consume rejected) |
| Deadline-move re-arm | `orchestrator/notifications.test.ts` — moving `deadline_at` re-keys the reminder; a stale fire reschedules instead of sending |
| Credit 50/80/100 once each | `orchestrator/notifications.test.ts` — crossing each threshold sends once; re-drive of a claimed-but-unsent row completes without a second send |
| Quiet hours | `orchestrator/notifications.test.ts` — finished mail delayed inside the quiet window; gate/spend mail never delayed |

## Gap table

| # | Requirement / AC / invariant | Status | Evidence |
|---|---|---|---|
| R1 | `mail.send` jobs → Resend via port; templates; IDs-only payloads; deep links | met | `notification-jobs.ts` `ResendMailSender`; template registry in contracts; §10.4 whitelist asserted |
| R2 | Signed single-use expiring Wait-for-me/Open links; hold = `POST /gates/:id/hold` equivalent | met | `email-actions.ts` mint/consume; `hold` resolves `wait`; single-use via `consumed_at` conditional update |
| R3 | +15m unresolved mail; T−1h/T−10m reminders; auto-proceed decision+cost; finished/failed; 50/80/100 credits | met | `notifications.ts` schedulers + handlers; orchestrator suite |
| R4 | Server-side per-event prefs; spend + trial/payment non-configurable; one-per-event-per-channel; collapse per run | met | `notification_prefs` (0002 table) + `notification_deliveries` unique dedup key + `run_id`; API + handler enforcement |
| AC1 | Lifecycle fixture: open → 15m mail → working single-use Wait link; reminder timing; resolution cancels | met | `notifications.test.ts` lifecycle describes |
| AC2 | No template contains/renders Approve | met | `contracts/notifications.test.ts`; DB CHECK `('open','hold')` |
| AC3 | Auto-proceeded mail carries decision + cost, default-on | met | `notifications.test.ts` auto-proceeded describe |
| AC4 | Pref matrix honored; locked rows can't be disabled via API | met | `notification-routes.test.ts` |
| AC5 | Links expire + gate/account-bound (tamper test) | met | API + orchestrator consume tests |
| INV | Approve never remote (REQ-MOBILE-10-as-email); spend never auto-proceeds/loses notification | met | two-member action union + CHECK; `on_expiry` defense in gate-expiry unchanged + mandatory-send path |
| INV | Secrets: Resend key worker-only; signing secret server-side; nothing in the repo | met | `apps/worker/src/env.ts` only; no secret literals; gitleaks posture unchanged |
| OOS | No inbox/push/digests/product emails | met (absent) | none added |

### Gaps found during review (all closed)

- **Reminder scheduling consulted the gate kind's *default* `onExpiry`** while the persisted
  `gates.on_expiry` can differ — reminders would have armed for a gate that doesn't auto-proceed
  (or skipped one that does). `scheduleGateReminders` now takes the actual `onExpiry`; every call
  site (`internal-api`, `gate-expiry`, `run-creation`, `reactions`, `reaper`) threads the row's
  value; `handleNotifyJob` re-reads `on_expiry`/`deadline_at`/`presence_deadline_at`/`resolved_at`/
  `held` at fire time.
- **Credit-threshold test helper re-delivered old jobs** (second assertion read the earlier 50%
  mail) — added a drain cursor so each `deliverAll` processes only newly queued jobs.
- **`mintEmailAction` import** pointed at the wrong export surface in the API test — fixed to the
  `email-actions` module.
- **Lint:** unused `SqlClient`/`GATE_KINDS`/test-variable imports removed.

## Evidence log

- `pnpm turbo build lint typecheck` → **108/108** tasks green.
- `pnpm test` (full suite) → **1810 passed / 2 skipped / 254 files**, zero failures (the skips are
  the `DATABASE_URL`-gated server-Postgres leg + one pre-existing skip).
- `pnpm check:protocol-markers` → OK. `pnpm check:licenses` → OK (502 packages).
- Targeted: `orchestrator/notifications.test.ts` 8 tests; `api/notification-routes.test.ts` 6;
  `contracts/notifications.test.ts` template/prefs schema tests — all PGlite-deterministic.
- `bash ~/agent-skills/skills/build-memory/scripts/check-build-memory.sh .` → see below (run at
  close-out).
- Live verification: NOT RUN — deterministic only; **no live Resend request was made** (all mail
  through the fixture `MailSender`).

## Evidence report

**What landed.** The beta's off-desk channel end-to-end: `notify` jobs carry the §5.11 cadence —
an approval gate unresolved at +15m emails its owner a templated mail with signed one-click
*Wait for me* / *Open* links (the token's DB CHECK admits only `('open','hold')`; Wait-for-me
resolves the gate as `wait`, exactly the `POST /gates/:id/hold` path); auto-proceed gates arm
T−1h/T−10m reminders off the gate's real `on_expiry`/`deadline_at`, re-arming when the deadline
moves and no-op'ing on resolution/hold; an auto-proceed expiry emits `gate.reminder` + mails the
decision and its cost by default; finished/failed runs mail (quiet hours delay only the ordinary
finished mail — §10.4 never delays gates/spend); credit burn alerts fire once at 50/80/100%.
Every send claims a `notification_deliveries` row keyed `(user, channel, dedup_key)` — one
notification per event per channel, collapse key = run id, crash-safe re-drive for
claimed-but-unsent rows. Preferences are server-side per event type with the spend-gate and
trial/payment rows locked at both the API boundary (400) and the handler (unskippable). Resend
lives only in `apps/worker` behind `MailSender`; the API consumes signed tokens under the token's
own workspace claim (RLS).

**Not shipped (correctly):** in-app Inbox, push/mobile transports, product-update mail, digests
(P1.19/1.x); any Approve affordance; any live Resend call.

**Deferrals:** closed **D-P0.10-1**; opened none.
