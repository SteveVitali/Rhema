# MAINT.6 — Non-prod test-session plumbing (preview signed-in legs)

- **Sequence:** 149 (round 4 insert — unblocks every remaining surface ticket's live legs) · **Phase:** round 4 · **Kind:** ticket
- **base_branch:** current checkout (the SPA chain tip)
- **Depends on:** SPA.11 (chain position; inserted after it). Live proof additionally needs the operator prerequisite below.
- **Run:** `implement-spec spec=docs/tickets/149_MAINT.6__nonprod-session-plumbing.md`
- **Gate status:** none — code + ops plumbing; `mergePolicy: OPERATOR`.
- **Live stage:** pr-<n> preview ($0 legs only) — **this ticket is what makes those legs possible**
- **Production mutations:** none — every change is non-prod-gated and prod refuses the new paths
- **Size budget:** ~450 changed lines excl. generated/fixtures
- **Operator prerequisite (HUMAN):** the operator seeds `rhema-nonprod-resend-api-key` in Secret Manager with a real Resend key (scoped send-only, same account as prod so `rhema.tools` stays a verified sender). The ticket lands all machinery regardless; the live proof defers honestly if the secret is absent.

## Goal
Close D-OPS.1-1's named out — "a future ticket wiring test-tenant sessions on non-prod" — so `pr-<n>` previews can mint real signed-in sessions for `test*@rhema.tools` identities through the actual magic-link path. This unblocks every surface ticket's legs A/B/C (REQ-VFY-8), D-SPA.6-1's deferred legs, and the rollback drills.

## Context (read these — do not re-read others)
- `docs/tickets/DEFERRALS.md` rows **D-OPS.1-1** and **D-SPA.6-1** — the deferrals this ticket closes
- `infra/pulumi/index.ts` (~line 250–270) — the `ops1-nonprod-placeholder-*` SecretVersion block this extends
- `infra/pulumi/secrets.ts` + `infra/config/stages.ts` (`requiredSecrets`) — container set is fixed; the resend container already exists per-stack
- `scripts/live/preview-stack.mjs` — the sole preview verb surface; extend it, don't bypass it
- `apps/api/src/invite.ts` — the invite gate (`invites` table: `code`, nullable `email`, `max_uses`, `used_count`, `expires_at`, `revoked_at`)
- `packages/journeys/src/session.ts` (`mint`) + `mailbox.ts` (`assertTestIdentity` — sessions only ever mint for `test[+*]@rhema.tools`)
- `apps/web/src/server.ts` invite-code channel (`rhema_ic` on the callbackURL — trace how the signup POST carries `code` so the journeys flag matches the real wire shape)
- `docs/build/LEDGER.md` 2026-10-08 PRE-AUTHORIZATION phase-log entries (preview self-serve + scoped Cloud Builds authorized)

## In scope — deliverables
1. **Real-resend path (non-prod only):** `infra/pulumi/index.ts` reads a `rhema:resendApiKey` secret config; when set on a non-prod stack it writes a real `SecretVersion` in place of the `resend-api-key` placeholder. Prod (`stage.kind === "prod"`) must ignore/refuse the config — fail-closed, unit-tested.
2. **`preview-stack.mjs resend-pull pr-<n>`** (or folded into an existing verb): `gcloud secrets versions access latest --secret=rhema-nonprod-resend-api-key --project=rhema-507501` → `pulumi config set --secret rhema:resendApiKey <value>` on the stack. The key value is never printed, logged, or committed — it moves process-to-process only. If the shared secret is absent, fail with a clear operator-prerequisite message.
3. **`preview-stack.mjs seed-invite pr-<n>`:** inserts ONE code-bound invite row (`email NULL`, `max_uses` e.g. 10000, deterministic code `prv-<n>-test`) into the preview DB via the stack's `system-database-url` secret (the non-prod-only channel the program already writes — REQ-ARCH-39). Idempotent (upsert on code). Guarded to `^pr-\d+$` like every verb.
4. **`rhema-journeys --invite-code <code>`** (or `RHEMA_INVITE_CODE` env): plumbed through `SessionDeps` → `mint` → the `/signup` submit so invite-mode stages carry the code through the same channel a human would (`rhema_ic`). Absent ⇒ today's behavior (open-mode stages unaffected). `assertTestIdentity` still pins every minted session to the test domain.
5. **Runbook note** in `scripts/live/preview-stack.mjs` header comments or the ticket run ledger: the full verb order for a session-capable preview (`init` → `config rhema:serviceImages` → `resend-pull` → `up` → `seed-invite` → journeys `--invite-code prv-<n>-test`).
6. **Live proof** (if the operator secret exists): stand `pr-<PR#>` with the ticket's images, `resend-pull` + `seed-invite`, mint a real session via the mailbox leg on the preview, run legs A/B/C on `usage`/`inbox` with `--expect-renderer`, destroy at closeout, evidence under `docs/build/reports/`. On green: flip **D-OPS.1-1 → DONE** (with the evidence path) and **D-SPA.6-1 → DONE** per its closing conditions.
7. **If the operator secret is absent:** land all machinery + tests, then append `D-MAINT.6-1` (live session-mint proof; verify recipe: the live-proof steps verbatim) instead of claiming it.

## Out of scope
- Any prod path — the config is refused on prod and `seed-invite`/`resend-pull` are pr-only verbs
- Flipping `signupMode` or `purchaseMode` on any stage — the invite gate stays; we seed around it
- Opening signup to non-test identities — every new path preserves the test-domain pin
- Paid legs — preview legs are `paid:false` only ($0)
- Dev-stage resend wiring — same config path can serve dev later; this ticket proves previews

## Acceptance criteria
- [ ] `rhema:resendApiKey` config → real SecretVersion on non-prod; prod refuses — unit-tested *(deterministic · engineered)*
- [ ] `resend-pull` + `seed-invite` verbs land behind `^pr-\d+$` guards; idempotent; no secret material in logs/output — unit-tested where mockable *(deterministic · engineered)*
- [ ] `--invite-code` threads the signup mint; absent ⇒ unchanged behavior; `assertTestIdentity` still enforced — unit-tested *(deterministic · engineered)*
- [ ] Live: a real session mints on a `pr-<n>` preview through the magic-link + mailbox leg; legs A (`x-rhema-renderer: ssr`), B (flag-on `--expect-renderer spa`), C (`paid:false`) green on a flagged surface; evidence + screenshots under `docs/build/reports/` *(staging-verified — or D-MAINT.6-1 with the operator prerequisite named)*
- [ ] D-OPS.1-1 and D-SPA.6-1 flipped DONE with evidence — or left OPEN with the exact blocker recorded *(gate AC)*
- [ ] Spend ledger: preview-resource hours + Cloud Build minutes recorded (target ≤$8) *(deterministic · engineered)*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md` row and `LEDGER.md` advanced; operating clauses met — dates from the clock, PR checks read and recorded, AC layers stated, no living-record pins, protected records only appended, gate words verbatim, harness in the run-ledger header. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-VFY-8 (the legs it unblocks); REQ-BETA-19 (invite posture preserved — seeded invites, never opened); REQ-ARCH-30 (secret material never in repo/logs/state-visible plaintext); REQ-ARCH-38 (non-prod isolation — the real key is scoped send-only, never prod's)
