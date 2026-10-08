# MAINT.6 — non-prod test-session plumbing (preview signed-in legs)

**Manifest row 149 (insert)** · stacks on `stevevitali/spa-11-surface-inbox` @ `f8338e6` · merge
policy **OPERATOR** — do not merge from the build environment · **$0** spend this run — no
preview was stood up (the operator prerequisite is absent; see below).

Implements `docs/tickets/149_MAINT.6__nonprod-session-plumbing.md` — closes the named out on
`D-OPS.1-1` ("a future ticket wiring test-tenant sessions on non-prod") by landing the machinery
that lets `pr-<n>` previews mint **real signed-in sessions** for `test*@rhema.tools` identities
through the actual magic-link path.

## Requirement IDs

**REQ-VFY-8 (the legs it unblocks) · REQ-BETA-19 (invite posture preserved — seeded invites,
never opened) · REQ-ARCH-30 (secret material never in repo/logs/argv) · REQ-ARCH-38 (non-prod
isolation — a scoped send-only key, never prod's)**

## What lands

- **`rhema:resendApiKey` secret config → real SecretVersion on non-prod, refused on prod.**
  `infra/pulumi/resend-key.ts` — the pure `resendVersionPlan(kind, configSet)` matrix
  (`refused`/`operator`/`real`/`placeholder`); `index.ts` throws a `pulumi.RunError` on prod when
  the config is set (fail-closed, before any resource is created), and on non-prod writes the
  config value as the real `resend-api-key` `SecretVersion` **in place of** the OPS.1 placeholder.
  `compute.ts` mounts `RESEND_API_KEY_SECRET` on the worker only when the real key was seeded —
  an unkeyed preview keeps `mail.send` no-op'ing exactly as before.
- **`preview-stack.mjs resend-pull pr-<n>`** — reads the shared operator secret
  `rhema-nonprod-resend-api-key` (`gcloud secrets versions access latest
  --project=rhema-507501`) and pipes it **process-to-process** into
  `pulumi config set --secret rhema:resendApiKey` (stdin — never argv, never a log line, never
  the repo). Absent/empty secret ⇒ exit 1 with a clear operator-prerequisite message and **no
  pulumi write**. Also sets plain `rhema:emailFrom=hello@rhema.tools`.
- **`preview-stack.mjs seed-invite pr-<n>`** — executes the stack's in-VPC migrate Job with
  `--args node,/app/dist/migrate.js,--seed-invite,prv-<n>-test` and asserts the execution
  actually succeeded. The Job (`migrate.ts --seed-invite`) upserts ONE code-bound invite row —
  `code = prv-<n>-test`, `email NULL`, `max_uses 10000`, `used_count` preserved across re-seeds —
  over its existing `system-database-url` secretKeyRef, so no DSN ever materializes on the
  workstation (REQ-ARCH-39).
- **`rhema-journeys --invite-code <code>` / `RHEMA_INVITE_CODE`** — threaded CLI →
  `RunnerDeps.inviteCode` → `SessionDeps.inviteCode` → `JourneySessions` mint, which fills the
  signup form's real `input[name="code"]` (the web stamps it `rhema_ic` on the emailed link's
  callbackURL — the same wire shape a human produces) before clicking the magic-link submit.
  Open-mode forms keep the field inside the collapsed `<details>` disclosure, which the mint
  opens first when needed. Absent ⇒ today's behavior verbatim; `assertTestIdentity` still pins
  every minted session to `test[+*]@rhema.tools`.
- **Standing-guard fix (inherited red on the SPA.11 base):** `check-protocol-markers`'s
  `SPA_WEB_SRC_ALLOW` gains `gate-card\.` — SPA.11's `apps/web/src/gate-card.tsx` is a shared
  SSR↔SPA leaf (the `copy.ts`/`doc-meta.ts`/`dom-contract.ts`/`spa-boot.ts` pattern) that was
  never allowlisted, so the provenance scan failed on the base. One-token amendment; the guard
  worked as designed.

## Guards (all pre-existing, extended — not bypassed)

- Both new verbs sit behind the same `^pr-\d+$` + `${OWNER_TAG_KEY}=${OWNER_TAG_VALUE}`
  ownership guard as `up`/`destroy`; prod is refused for every verb at `classifyVerb`.
- `--seed-invite` is additionally fail-closed inside the Job: `seedInvitePlan` refuses any
  non-`pr-<n>` stage name and any code not matching `^prv-\d+-[a-z0-9-]+$`.
- `signupMode`/`purchaseMode` untouched; invites are seeded **around** the gate, never opened;
  non-test identities still cannot mint (mailbox + `assertTestIdentity`).

## Verification

- `pnpm turbo build lint typecheck` — **135/135**
- `pnpm test` — full suite green (incl. `resend-key.test.ts` matrix, `preview-stack.test.mjs` 53 —
  dispatch/guards/absent-secret/no-secret-in-argv, `migrate.test.ts` 17 — PGlite upsert +
  re-seed preserves `used_count` + non-preview refusal, `session.test.ts` 11 — code fill /
  disclosure-open / absent ⇒ unchanged)
- `check:dom-contract`, `check:spa-budget`, `check:licenses`, `check:protocol-markers`,
  `check:no-cookies`, `check:spa-env` — all clean
- `resend-pull`'s absent-secret path exercised for real: `gcloud … versions access` → `NOT_FOUND`;
  the verb exits 1 with the prerequisite message and writes nothing.

## Live proof — deferred to `D-MAINT.6-1` (operator prerequisite absent)

The shared secret `rhema-nonprod-resend-api-key` does not exist in `rhema-507501` (probed this
run — `NOT_FOUND`; the value was never printed). Per ticket item 7, all machinery + tests land
and the live exercise is ledgered as `D-MAINT.6-1` with the verbatim recipe in
`docs/tickets/DEFERRALS.md`: init → `config rhema:serviceImages` → `resend-pull` → `up` →
`seed-invite` → `rhema-journeys --invite-code prv-<n>-test` (real mailbox session mint) → legs
A/B/C on `usage`/`inbox` with `--expect-renderer` → evidence under `docs/build/reports/` →
destroy. On green it flips **D-OPS.1-1** and **D-SPA.6-1** — both left OPEN with dated blocker
updates pointing at the deferral.

## Spend

**$0** — no preview was stood up, no deploys, no production writes. All preview legs remain
`paid:false` when they run.
