# JOURNEY.1 — Browser-journey acceptance: the Playwright harness, the step registry, test tenants, provenance

- **Sequence:** 61 (round 3) · **Phase:** round 3 — launch readiness · **Kind:** ticket · **Tag:** harness
- **base_branch:** current checkout (the chain tip the previous round-3 row left; stacked PR)
- **Depends on:** HOT.1, SEC.1 (the two-tenant probe + the system-pool lint the purge sweep obeys; HOT.1's parity and the N7/R1 fixes)
- **Scope (one line):** a committed Playwright suite (`packages/journeys`) walks the product as users do. It owns the step registry (per-step owner + expected-red flag), real magic-link sessions into an operator-provisioned test mailbox, flagged test tenants (excluded from SLOs and the trial kill switch, auto-purged), a nightly $0 run and a weekly paid run (≤ 300-word fixture, ≤ $5), and the deploy-provenance ↔ chain-tip check.
- **Spec §§:** §13.5 (2026-09-30 banner), §13.2; Appendix A.9 (REQ-SPEC-29 row); ADR-016; ADR-013 (standing authorization)
- **REQ coverage:** REQ-SPEC-29 (primary), REQ-ARCH-39 (stamp in the PR)
- **Absorbs (backlog):** BL-32 (the automatable half; D-PRB.04-2, D-PRB.07-1, D-P1.08-1, D-P1.09-1, D-P1.17-2, D-P1.19-2, D-P1.20-1, X-p102-page-editor-live-verify — mapped to steps, see deliverable 9)
- **Run:** `implement-spec spec=docs/tickets/61_JOURNEY.1__browser-journey-acceptance.md`
- **Gate status:** Three items.
  - The HUMAN-H7 **test mailbox**. Provisioning it creates a third-party credential, so it is operator-only; `provided: yes/no` only.
  - The paid proof, if run before ACT.1's trial exists, needs an operator-approved **house-credit grant** to the journey tenant (a one-off prod data write → paused). Otherwise the paid leg waits for ACT.1.
  - The weekly paid run itself is pre-authorized (≤ $5 metered, ≤ 300 words; ends at round close).
- **Live stage:** Stage A: code + tests ($0). Stage B: the suite against prod — the nightly $0 legs, the test-tenant flag/exclusion/purge observed, and the provenance check, plus one paid journey if funded. **≤ $5** metered.


> **Amended 2026-09-30 (operator — round-3 spend limit: hard ≤ $200, target ≤ $100):** this ticket's Stage B metered spend cap is **≤ $5** (was ≤ $10); aim for ≈ $3. Run legs cheapest-first and stop once the acceptance evidence suffices; where a leg plan below sums past the new cap, drop the lowest-priority legs and record each dropped leg as a `D-JOURNEY.1-<n>` row (never overspend). The orchestrator pauses the chain when round-3 cumulative metered spend reaches $100 and hard-stops at $200 (LEDGER GATE DECISIONS 2026-09-30, D6 revised).


> **Amended 2026-09-30 (HUMAN-H7 mailbox provisioned — use it; the ADR still records the choice):** the test mailbox is
> `test@rhema.tools` (Google Workspace), and test identities are `test+<tag>@rhema.tools`.
> - **The mailbox client:** reads via the **Gmail API with domain-wide delegation**, **keyless**. Sign a JWT through IAM
>   Credentials `signJwt` as `rhema-journeys@rhema-507501.iam.gserviceaccount.com`
>   (`iss`=SA, **`sub` hard-pinned to `test@rhema.tools`**, `scope`=`https://www.googleapis.com/auth/gmail.readonly`,
>   `aud`=`https://oauth2.googleapis.com/token`), then exchange it with the `jwt-bearer` grant. No secret is stored
>   anywhere: the "credential in Secret Manager / CI" clause is satisfied by having none.
> - **The runner identity** needs `roles/iam.serviceAccountTokenCreator` on that service account. Today only the
>   operator holds it; grant CI's Workload Identity principal in IaC.
> - **Adopt into Pulumi:** the service account, the `gmail.googleapis.com` enablement and the binding were created by
>   hand on 2026-09-30.
> - **Test-tenant flagging** can key on `test+*@rhema.tools`.
> - **Domain-wide delegation reaches every @rhema.tools mailbox.** The client must refuse any `sub` other than
>   `test@rhema.tools`.

## Goal
Nothing in rounds 1–2 walked the product as a user, so 3,496 green tests shipped with a broken journey. The
review's Process finding 1, ADR-016 and REQ-SPEC-29 make **walking it** the acceptance of every user-surface
Stage B, nightly against prod.

This ticket builds that walker and the registry every later round-3 ticket turns green:
- it asserts visible text and actionable (visible, enabled, unobscured) controls, never status alone
- it commits screenshots
- it signs test users in through the real magic link
- it keeps test tenants out of the numbers and cleans them up
- it proves the deployed tree is the chain tip

## Load (read these — do not re-read others)
- ADR-016 (the decision + the constraints on test identities); the REQ-SPEC-29 row; the planning ledger's
  **Journey step registry** + Shared decisions (`docs/build/planning/2026-09-30_planning-ledger.md`).
- The review's **Method** section. Its precedent: headless Chrome via Playwright, **one persistent profile per
  identity**, `channel: "chrome"`, desktop 1440×900 + phone 390×844 (dark), and the page text, console errors and
  HTTP failures captured at every step. Also Process findings 1–2, PR-J6 (the occluded Send, caught by a click
  intercept) and PR-U9 (the magic-link email shape).
- `docs/tickets/85a_HUMAN-H7__round3-operator-legs.md` (the mailbox item + the DEFERRALS rule).
- Sessions:
  - `apps/api/src/auth.ts`: `magicLink` ~132, the `__Host-` cookie ~144–149, the rate-limit IP ~150–154
  - the `auth.mail` transport (`apps/worker/src/main.ts` ~409, ~643)
- Exclusions:
  - `packages/orchestrator/src/slo.ts` (`probeSlos` ~183) + `0042_slo_samples.sql`
  - `packages/ledger/src/trial.ts` (the trial ceiling / kill switch, ~5–29)
- Purge: `apps/worker/src/jobs.ts` (`handleAccountHardDelete`; the 14-day grace in `0040_settings_account.sql`)
  and `apps/worker/src/main.ts` ~682.
- Provenance:
  - `deployments` (`0002_schema.sql` ~338)
  - `scripts/record-provenance.mjs`
  - `/healthz` (`apps/api/src/index.ts` ~274, `apps/web/src/server.ts` ~230)
  - `.github/workflows/ci.yml` (the `images` job's `deploy-provenance` artifact)
- Web routes the steps visit (`apps/web/src/server.ts`): `/app` ~1441, `/app/new` ~1620, `/app/inbox` ~1894,
  `/usage` ~2434, `/voices` ~4495, `/p/:project/review/:runId` ~3519.
- SEC.1's `integration/src/two-tenant-probe.ts` and its ADR; HOT.1's parity test + `claims` config + ADR.

## In scope — deliverables
1. **`packages/journeys`** (REQ-SPEC-29): a new workspace package (`@rhema/journeys`; Playwright is Apache-2.0,
   re-confirm against `licenses.allowlist.json`) covering the three journeys of REQ-SPEC-29 (new visitor,
   returning user, phone-width reader) plus the two-tenant and claims checks.
   - Assertions are on visible text and on controls that are **visible, enabled and unobscured at click time**:
     Playwright actionability + an `elementFromPoint` occlusion check (PR-J6).
   - Every step captures console errors, failed requests and a screenshot.
   - Steps are **idempotent and namespaced by a run nonce**.
2. **The step registry** (owner of the format): `packages/journeys/src/registry.ts` holds `{id, journey,
   asserts, owner, expected: 'red'|'green', paid}` for every step in the planning ledger.
   - **Runner semantics:**

     | expected | observed | runner outcome |
     |---|---|---|
     | green | fails | **run failure** |
     | red | fails | "owed — owner X" |
     | red | passes | "ready to flip" warning |

   - An owner flips its step to `green` in its own PR, with the screenshot.
   - Initial `green` steps:
     - **N7**, **R1** (HOT.1)
     - **X1** (SEC.1; the browser half is built here on SEC.1's probe fixtures)
     - **N2** (the magic-link half; its "invite field not first" sub-assertion is SEC.2's, expected-red)
     - **R5** (export baseline)
   - All other steps start `red`, with their planning-ledger owners. A test asserts every planning-ledger step id
     exists here with the same owner (superset allowed).
   - The planning ledger gets a **dated note** naming this file as the live registry (append-only; never rewritten).
3. **Sessions** (owned decision; ADR-016's constraints). Test users sign in through the **real magic-link flow**
   into the operator-provisioned test mailbox:
   - addresses are plus-addressed identities on that mailbox
   - a mailbox client reads the link; the IMAP vs Gmail-API choice is part of the ADR, licence-allowlisted
   - the credential lives only in Secret Manager / the CI secret store
   - `storageState` is cached per run in a gitignored path, so there is one magic link per identity per run,
     under the auth rate limit and SEC.2's throttle (never exempted)
   - the email leg is asserted **every run** (link present, lands signed-in)
   - no minted tokens, no DB-lifted sessions, and no path that can yield a session for a non-test user
4. **Test tenants** (owned decision). A workspace is **flagged at creation, server-side, only** when the signup
   address matches the configured test mailbox:
   - The match is exact: the base address + a plus tag. It is deploy config, not a secret.
   - The flag is stored via an **additive** migration.
   - It is never settable by any API, and grants nothing.
   - **Exclusions:**
     - `probeSlos` / `slo_samples` ignore flagged workspaces
     - the trial kill-switch accumulator ignores them; an exported `isTestWorkspace` predicate is ACT.1's hook
   - **Auto-purge:** a worker sweep on the **system pool** (an allowlisted cross-tenant scan under SEC.1's lint)
     hard-deletes flagged workspaces older than N hours through the existing account-deletion pipeline. It skips
     the 14-day grace for flagged accounts only, and never touches an unflagged account.
5. **Schedules + CI wiring** (REQ-SPEC-29): `.github/workflows/journeys.yml`, separate from the five ordered CI
   jobs, which stay unchanged; the package's unit tests run in `typecheck/lint/unit`.
   - **Nightly:** `$0` legs only against prod. That means no run creation and no chat turn.
   - **Weekly paid:** one Standard/Base Review of a committed **≤ 300-word planted-error fixture** (original text,
     one deliberate factual error — reusable by RES.1) plus one chat turn.
     - The run's cap is set so the worst-case **metered list cost** is ≤ $5 (re-confirm the rate table's 1.4×).
     - A spend guard sums the week's metered usage for flagged tenants and refuses to start at ≥ $5.
   - **`workflow_dispatch`:** inputs `stage`, `steps`, `paid` (this is what later tickets' Stage B runs).
   - **Outputs:** a JSON report + screenshots as CI artifacts. A ticket's Stage B commits its screenshots under
     `docs/build/reports/<date>_<ID>-journeys/`.
6. **Deploy provenance ↔ chain tip** (REQ-SPEC-29, REQ-ARCH-39): `scripts/check-deploy-provenance.mjs` compares
   the deployed SHA with a given chain-tip SHA and exits non-zero on mismatch. The source of the deployed SHA is
   an owned decision: a `/healthz` build field baked at image build, the latest `deployments` row, or Cloud Run
   image digests. Every journey report records it; every later ticket's close runs it.
7. **Parity on the deployed stage:** every page a step visits has each referenced `/assets/*.js` load with 200,
   JS content-type and no console error. This asserts HOT.1's parity where it matters.
8. **The ≤ 300-word fixture + two-tenant fixtures:** tenant A creates a nonce-named voice + project, and tenant
   B's `/voices`, project list, `/usage`, Inbox and dossier never show them (X1's journey half).
9. **BL-32 mapping:** each BL-32 D-row gets a dated note naming the step that covers its automatable half and
   that step's owner.
   - Rows fully covered by this ticket's green baseline steps close with evidence.
   - The rest stay open under their step owners; the real-device residual stays HUMAN-H7.
   - No row is deleted.
10. **README** (`packages/journeys/README.md`): how to run a step set against a stage, and how an owner turns a
    step green.

## Out of scope
- Turning other owners' steps green: N1/N3 → ONB.1; N4 → EST.1; N5/C1 → ACT.1 (C1 copy: UX.1); N6 → RES.1;
  N8 → EDIT.1; N9 → BILL.3; R4/R7 → RUN.1; R6 → RPT.1; P1 → UX.2; N2's invite-field sub-assertion → SEC.2.
- The $0 headless legs of BL-21/22: STB.5a (it runs on this harness).
- Real-device checks, the test mailbox itself, and the nightly golden-run budget: HUMAN-H7 (BL-32 residual, BL-36).
- The SLO targets themselves: SLO.1. Error reporting: OBS.1.

## Acceptance criteria
- [ ] Registry semantics are unit-tested: expected-green failing fails the run, expected-red failing reports
      "owed", and expected-red passing warns. The planning-ledger step ids and owners are all present.
      *(deterministic)*
- [ ] The occlusion helper fails on a fixture page whose button sits under a fixed footer (the PR-J6 shape), and
      passes when unobscured. *(deterministic)*
- [ ] A non-matching address is never flagged. The flag cannot be set via any API route (the SEC.1 probe census
      includes it). `probeSlos` and the trial accumulator exclude flagged workspaces. The purge sweep deletes only
      flagged workspaces past N hours. Each has a PGlite test that fails with the exclusion removed.
      *(deterministic)*
- [ ] The spend guard refuses the weekly paid run once the week's flagged-tenant metered spend is ≥ $5 (fixture).
      `check-deploy-provenance` fails on a mismatched SHA. *(deterministic)*
- [ ] **Stage B**, nightly legs on prod:
  - a real magic link arrives in the test mailbox and signs in (N2's magic-link half)
  - N7, R1, R5 and X1 (both tenants) are green, with screenshots committed
  - every visited page's bundles load (parity)
  - the provenance check passes against this ticket's chain-tip SHA

  *(agentic — the JOURNEY.1 harness)*
- [ ] **Stage B**, test tenants:
  - the journey's test workspaces are flagged
  - they are absent from an SLO probe reading
  - a tenant past the purge window is hard-deleted (a short window is configured for the proof)

  *(agentic)*
- [ ] **Stage B**, paid (≤ $5 metered): one weekly-paid journey completes, **only if** funded by the operator
      grant. Otherwise it is `D-JOURNEY.1-n` ("paid leg: unfunded until ACT.1 / an operator grant").
      *(agentic)*
- [ ] If the H7 mailbox is not provisioned: Stage A lands, the public legs (landing, pricing, parity, provenance)
      run, and the session legs become `D-JOURNEY.1-n` ("H7 pending: test mailbox"). Never a minted-session
      workaround. *(agentic)*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md` row and `LEDGER.md` advanced. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-SPEC-29 (primary — the journeys, the visible/actionable assertions, the screenshots, the schedule, the
provenance record); REQ-ARCH-39 (deploy provenance compared at every run and close).

## Cross-cutting invariants
- Manifest **#12** / REQ-SPEC-29: this ticket makes it operational. From here on, every user-surface Stage B cites
  a journey run.
- Manifest **#13** / REQ-SPEC-30: the purge sweep is a system-pool, allowlisted scan. Journeys never read the DB
  to obtain a session.
- Manifest **#14** / REQ-SPEC-32: C1 and N4 stay expected-red until ACT.1/EST.1. The paid leg's cap and spend are
  measured on metered cost.
- Manifest **#10**: reports and screenshots are of test tenants only. No real user's page is ever captured.
- Secrets: the mailbox credential is never in the repo, a ledger or a report (REQ-ARCH-30; `provided: yes/no`).

## Notes
- **Owned decisions → write an ADR (the next free number).** ADR-016 requires this ADR, for the session
  mechanism. It must record:
  - the magic-link-into-test-mailbox flow and the mailbox client
  - the plus-address identity scheme
  - `storageState` caching and its expiry handling
  - why the design can never mint a session for a non-test user
  - where the credential lives
  - the per-run email-leg assertion

  The same ADR also covers:
  - the test-tenant flag: its storage, its exact-match rule, and why it grants nothing
  - the exclusions
  - the purge window N and the grace bypass
  - the provenance source
  - the registry location: code, with the planning ledger historical
- **Consumes:** SEC.1 (the probe fixtures for X1; the system-pool lint the purge obeys; its probe accounts are
  flagged only if they match the test address, otherwise they go to MAINT.2's inventory); HOT.1 (the parity
  source, the `claims` ids C1 checks, and N7/R1 as landed).
- **Consumers:** every later round-3 Stage B (turn owned steps green); STB.5a/5b (the legs run here); ACT.1 (the
  `isTestWorkspace` hook); MAINT.2 (lists any unpurged test tenant).
- **Anchors to re-confirm at build time:** all line numbers; the trial accumulator's real location; whether
  `probeSlos` reads through `slo_samples` or `runs`; the deletion pipeline's entry point; Chrome's availability
  on the CI runner.
- **DEFERRALS rule:** anything not verifiable at build time, or blocked on HUMAN-H7 (mailbox) or the operator grant,
  becomes a `D-JOURNEY.1-<n>` row per `85a_HUMAN-H7` § DEFERRALS rule ("gate pending", never a fabricated pass).
