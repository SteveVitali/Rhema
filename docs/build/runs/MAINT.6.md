# MAINT.6 — non-prod test-session plumbing (run ledger)

- **Status:** DONE for the deterministic legs (machinery + tests landed); the **live**
  session-mint proof is **OPEN** as `D-MAINT.6-1` — the operator prerequisite
  (`rhema-nonprod-resend-api-key` in `rhema-507501`) is absent. `D-OPS.1-1` and `D-SPA.6-1`
  stay OPEN with dated blocker updates pointing at it.
- **Harness:** Devin CLI (agentic coding subagent); model: Cognition Devin; tier: n/a (build work)
- **Ticket:** `docs/tickets/149_MAINT.6__nonprod-session-plumbing.md` (manifest row 149)
- **Branch:** `stevevitali/maint-6-nonprod-session-plumbing`, stacked on
  `stevevitali/spa-11-surface-inbox` @ `f8338e6` (`OPERATOR` merge policy, **not merged**).
- **PR:** #131 — opened at closeout; `gh pr checks` read once (see §6).
- **Spend:** **$0** — no preview stood, no deploys, no production writes. (Target was ≤$8 only
  if the live proof ran; it could not.)

## 0 — Context load

- DEFERRALS.md read first (per AGENTS): this ticket **is** `D-OPS.1-1`'s named out ("a future
  ticket wiring test-tenant sessions on non-prod") and the session prerequisite under
  `D-SPA.6-1` leg (b). Closing either still requires the live green run — the machinery alone
  is not evidence.
- LEDGER CURRENT STATE read: `nextTicket: MAINT.6`, `chainTip:
  stevevitali/spa-11-surface-inbox`, `mergePolicy: OPERATOR`, `dispatchTarget: subagent`.
- **Operator prerequisite probed early:** `gcloud secrets versions access latest
  --secret=rhema-nonprod-resend-api-key --project=rhema-507501` → exit 1
  `NOT_FOUND` (the value — had it existed — was redirected to a temp file, never printed).
  Per ticket item 7, all machinery lands and the live exercise is deferred as `D-MAINT.6-1`.

## 1 — What landed (the whole diff)

### `infra/pulumi/resend-key.ts` (new) — the pure plan

`resendVersionPlan(kind, configSet)` → `refused` (prod+set) / `operator` (prod+unset — prod's
operator-seeded version stands) / `real` (non-prod+set) / `placeholder` (non-prod+unset — the
OPS.1 placeholder stands). `NONPROD_OPERATOR_PLACEHOLDER_IDS` hoists the placeholder id list so
`resend-api-key` can be skipped when the real key replaces it.

### `infra/pulumi/index.ts` — the config path

`rhemaConfig.getSecret("resendApiKey")` — a Pulumi SECRET config (encrypted in state). Prod with
the config set → `throw new pulumi.RunError` before any resource is created (fail-closed;
REQ-ARCH-30/38). Non-prod with the config → the real `SecretVersion` `rhema-<stack>-resend-api-key-v1`
is written and the `resend-api-key` placeholder is skipped. Non-prod unset → placeholder exactly
as before.

### `infra/pulumi/compute.ts` — worker mount

`ComputeArgs.resendSecretWired` — mounts `RESEND_API_KEY_SECRET` on the worker when the real key
was seeded even though `resend-api-key` isn't in non-prod `requiredSecrets`. An unkeyed preview
keeps `mail.send` no-op'ing (the placeholder version is never mounted).

### `scripts/live/preview-stack.mjs` — the two verbs

- `resend-pull` — `gcloud secrets versions access latest
  --secret=rhema-nonprod-resend-api-key --project=<gcp:project>` → `pulumi config set --secret
  rhema:resendApiKey` **over stdin** (`pulumiSecretStdin` — the value lives in process memory
  only; never argv/logs/repo). Absent/empty ⇒ exit 1, operator-prerequisite message, no write.
  Also sets plain `rhema:emailFrom=hello@rhema.tools`.
- `seed-invite` — `gcloud run jobs execute rhema-<stack>-migrate --args
  node,/app/dist/migrate.js,--seed-invite,prv-<n>-test --wait`, then asserts the newest execution
  completed cleanly (`latestExecutionFacts` — succeededCount ≥1, failedCount 0).
- Both verbs join `DEPLOY_VERBS` — same `^pr-\d+$` + ownership-tag guard as `up`/`destroy`.
- Header runbook: `init → config rhema:serviceImages → resend-pull → up → seed-invite →
  rhema-journeys --invite-code prv-<n>-test`.

### `apps/worker/src/migrate.ts` — the in-VPC seed leg

`--seed-invite <code>` mode: `seedInvitePlan` refuses non-`pr-<n>` stages and non-`prv-<n>-*`
codes (fail-closed, exit 2); `ensureRhemaDatabase` (extracted verbatim from `runMigrate`'s
bootstrap) + `applyMigrations` make the leg self-sufficient on a fresh stack; then
`seedPreviewInviteRow` upserts `code='prv-<n>-test', email NULL, max_uses=10000, expires_at/
revoked_at NULL` preserving `used_count` (idempotent re-seed). Runs over the Job's existing
`SYSTEM_DATABASE_URL` secretKeyRef — no DSN leaves the VPC (REQ-ARCH-39).

### `packages/journeys` — `--invite-code` → `rhema_ic`

`cli.ts` `--invite-code` / `RHEMA_INVITE_CODE` → `RunnerDeps.inviteCode` → `SessionDeps.inviteCode`
→ `JourneySessions` mint fills the signup form's real `input[name="code"]` before the
`method=magic_link` submit. The web already stamps that field `rhema_ic` on the emailed link's
callbackURL — the harness rides the identical wire shape a human produces. On open-mode forms the
field sits inside the collapsed `<details>` disclosure; the mint opens it when hidden. Absent ⇒
unchanged. `assertTestIdentity` still pins `test[+*]@rhema.tools` only.

### `scripts/check-protocol-markers.mjs` — standing-guard amendment (inherited base red)

`SPA_WEB_SRC_ALLOW` += `gate-card\.` — SPA.11's `apps/web/src/gate-card.tsx` is a shared SSR↔SPA
leaf (the `copy.ts`/`doc-meta.ts` pattern — the check's own error message names this mechanism)
that the base never allowlisted, so the provenance scan failed on `f8338e6` as built. This is the
SPA.2 "web-env non-secret allowlist amended" precedent: the standing guard caught the new name —
worked as designed — and the correct response is the one-token allowlist amendment, recorded
here as an owned repair on this stacked PR.

## 2 — Verification

| Gate | Result |
|---|---|
| `pnpm turbo build lint typecheck` | **135/135** |
| `pnpm test` | full suite green (journeys 18 files / worker migrate 17 / preview-stack 53 / resend-key matrix / session 11) |
| `check:dom-contract` | OK — journey selectors ⊆ manifest ⊆ emitted+asserted (incl. `code`) |
| `check:spa-budget` | OK |
| `check:licenses` | OK — 822 packages |
| `check:protocol-markers` | OK (after the `gate-card` allowlist amendment above) |
| `check:no-cookies` | OK — 208 files |
| `check:spa-env` | OK |
| Build-memory structure | see §6 closeout |
| Append-only (`--base f8338e6`) | see §6 closeout |

Focused-new-behavior coverage (each fails if the behavior is removed):
`resend-key.test.ts` 4 — prod refuse / prod unset operator / non-prod real / non-prod
placeholder; `preview-stack.test.mjs` — verb dispatch, `^pr-\d+$` + ownership refusal on both
verbs, absent-secret ⇒ no pulumi write + prerequisite message, empty-body treated absent, stdin
pipe asserted, execution-success assertion + unparseable-list fail-closed;
`migrate.test.ts` — `seedInvitePlan` matrix + `seedPreviewInviteRow` on real PGlite (email-NULL
row, 10000 cap, re-seed preserves `used_count`, non-preview refusal); `session.test.ts` — code
fill, disclosure-open-when-hidden, absent ⇒ no `code` fill.

## 3 — Live proof — DEFERRED (`D-MAINT.6-1`)

The operator secret was probed absent, so no `pr-<n>` was stood up this run. The verbatim recipe
is committed in `DEFERRALS.md` `D-MAINT.6-1` (init → service-images config → `resend-pull` →
`up` → `seed-invite` → `rhema-journeys --invite-code prv-<n>-test` mailbox mint → legs A/B/C on
`usage`/`inbox` with `--expect-renderer` → `docs/build/reports/` evidence → destroy + rm). On
green: `D-OPS.1-1` → DONE (evidence path) and `D-SPA.6-1` → DONE per its closing conditions.

## 4 — Deferrals delta

- **Opened:** `D-MAINT.6-1` (live session-mint proof; operator prerequisite named).
- **Updated, still OPEN:** `D-OPS.1-1` (its named out is now landed machinery; the residual is
  the live green under `D-MAINT.6-1`), `D-SPA.6-1` (leg (b)'s session prerequisite landed;
  residual = the shared secret + CI `images` digests + `rhema:spaSurfaces` config).
- **Closed:** none.

## 5 — Deviations / owned decisions

1. **`seed-invite` executes the in-VPC migrate Job** rather than pulling `system-database-url`
   to the workstation — the ticket's channel ("the stack's `system-database-url` secret") is
   honored at the stronger posture: the DSN never materializes outside the VPC at all. The Job
   already mounts it via secretKeyRef (OPS.1).
2. **Protocol-markers allowlist amendment** — repairs a latent red on the unmerged SPA.11 base
   (recorded in §1; the alternative — shipping a red gate — was worse). It is the designed
   mechanism for new shared leaves.
3. **`rhema:emailFrom` set by `resend-pull`** — plain non-secret config the worker mailer needs;
   same value prod carries.
4. **No live spend** — spend ledger is $0; the ≤$8 preview budget was not consumed.

## 6 — Closeout

- Commits: `f4b482b` (implementation) + the closeout-docs commit on this branch.
- `gh pr checks --watch=false` read once: see PR body / LEDGER PHASE LOG entry.
- `mergePolicy: OPERATOR` — nothing merged by this run; the operator owns merge sequencing.
