# OPS.1 — Preview stages: `dev` full stack + one `pr-<n>` preview up/destroy

- **Sequence:** 80 (round 3) · **Phase:** round 3 — launch readiness · **Kind:** ticket · **Tag:** ops
- **base_branch:** current checkout (the chain tip the previous round-3 row left; stacked PR)
- **Depends on:** SEC.3, SEC.1, JOURNEY.1
- **Scope (one line):** make the non-prod stages real: bring `dev` from its 23-resource skeleton to the full stack with prod-parity pins, add a guarded preview lifecycle (`pr-<n>` up → migrate + non-user seed → smoke / $0 journey legs → destroy) that hard-refuses `stack=prod`, and exercise one preview end to end under REQ-ARCH-38.
- **Spec §§:** 13.2 (stages: `dev` / `pr-<n>` / `prod`; previews small/paused, isolated buckets, Base tier only, `max_usd` $3/run, never production secrets or user-text fixtures; CI/CD), 13.3 (secrets), 13.1 as amended by ADR-010 (engines per stage), 13.5 (journey smoke)
- **REQ coverage:** REQ-ARCH-38, REQ-ARCH-39, REQ-ARCH-30, REQ-SPEC-30 (fresh-stack roles) (stamp in the PR)
- **Absorbs (backlog):** BL-25 (D-P0.15b-1 residual — `pr-<n>` full-stack up/destroy never exercised; X-dev-stack-stale)
- **Run:** `implement-spec spec=docs/tickets/80_OPS.1__preview-stages.md`
- **Gate status:** infra cost deltas > $15/month. On today's stage facts a standing full `dev` (warm 2-vCPU AlloyDB, a regional GKE cluster, the proxy MIG) far exceeds that, so dev's standing shape is operator-paused. The ticket brings dev up for its verification window within the cap, then returns it to its idle shape. Also paused: creating any third-party credential for previews (a dedicated Anthropic/Resend/Stripe key) and DNS changes (previews get none). `stack=prod` is refused by the guard, never paused-and-asked.
- **Live stage:** Stage A: code + tests ($0). Stage B: `dev` full-stack up; one `pr-<n>` preview up → migrate/seed → smoke + $0 journey legs → destroy; ≤$20 infra (resource-hours × list price), $0 inference

## Goal
Every Stage B in rounds 1–2 ran on prod, because `dev` holds only a 23-resource skeleton with stale pins (STB.1 §1)
and no `pr-<n>` preview has ever run as a full stack. The network layer came up once, on `pr-test` in P0.15b. So
§13.2's stage model is unexercised, and REQ-ARCH-38 (previews never carry production secrets or user-text fixtures)
has only unit-level proof in `stages.test.ts`. This ticket makes the stage model real:
- `dev` runs the same program as prod, with prod-parity image pins
- a guard script lets an unattended worker create and destroy **only its own** `pr-<n>` stacks, and refuses `prod`
  outright
- one preview goes up, is migrated and seeded without user text, is smoked, and is destroyed cleanly, with live proof
  that it never reached a production secret

## Load (read these — do not re-read others)
- Spec §13.2 (stage line + CI/CD paragraph), §13.3 (secrets paragraph); `docs/adr/ADR-010-cloudsql-prod-database.md` (dev/previews stay on AlloyDB; the cost floor); `docs/adr/ADR-013…` (the standing authorization's OPS.1 clause).
- `docs/tickets/DEFERRALS.md` row D-P0.15b-1; `docs/build/runs/STB.1.md` §1 (the 23-resource `dev` skeleton; the prod-only precedent).
- `infra/config/stages.ts` (`STAGES` ~235–271: dev ~236 AlloyDB warm 2 vCPU, preview ~247 paused / $3 / invite; `stageKindFor` ~277, where an unknown stack defaults to preview; `PREVIEW_REQUIRED_SECRETS` ~97) + `stages.test.ts` (~65–90, ~161).
- `infra/pulumi/index.ts` (stack = stage; the hand-set `rhema:*DatabaseUrl` secret configs ~30–60), `secrets.ts` (containers only; versions seeded out-of-band), `data.ts` (~62–92 AlloyDB, `activationPolicy` NEVER when paused), `compute.ts` (`MAX_USD_PER_RUN` ~458; secret refs), `Pulumi.dev.yaml`, `Pulumi.pr-test.yaml`, `README.md` (the stage runbook ~38–90); `infra/k8s/apply.sh`.
- `scripts/live/migrate-seed.mjs` → `integration/src/live-migrate-seed.ts` ~51 (calls `seedRealProjects`, which is real-project user text) vs `scripts/live/prod-migrate-seed.mjs` (refuses it); `scripts/live/record-deployment.mjs`.
- SEC.1's ADR (the user-serving / system role split a fresh stack must provision) and JOURNEY.1's ADR (the journeys, and which legs are $0 / sessionless).

## In scope — deliverables
1. **The stack guard (standing authorization; REQ-ARCH-38).** A committed wrapper (e.g.
   `scripts/live/preview-stack.mjs`) is the only path the worker uses for `pulumi stack init/up/destroy/rm`:
   - **`prod` is refused for every verb.** There is no override flag.
   - **Only `^pr-\d+$` may be created or destroyed**, and never `dev`.
   - **Ownership tags.** Created stacks carry an ownership tag (e.g. `rhema:owner=ops-preview`). Destroying a
     `pr-<n>` stack without that tag is refused.
   - **The guard's own tests** cover every refusal.
2. **Fresh-stack provisioning without hand steps (REQ-ARCH-30; REQ-SPEC-30).**
   - **Database roles.** A new stack gets its database roles and URLs from IaC-generated secrets for **new** roles
     (pre-authorized). This covers SEC.1's user-serving (non-BYPASSRLS) and system roles, `rhema_collab`'s LOGIN,
     and the composed `DATABASE_URL`s — no two-pass hand-set configs.
   - **Secret Manager versions.** Previews get only IaC-generated values (run-token signing key, auth and
     email-action HMACs) and a **non-prod** Anthropic key (the dev value, never `rhema-prod-*`).
   - **What previews do without.** No Stripe, Resend, Google or admin keys, so those features are gated off.
   - **`stages.ts` enforcement.** Enforce the preview's Base-only tier rule, and wire it through `stages.ts` if
     absent (re-confirm).
3. **A preview-safe seed (REQ-ARCH-38).**
   - The migrate/seed runner refuses `seedRealProjects` whenever the stage kind is `preview`. It runs migrations,
     `seedProtocols` and the code seeds only.
   - It runs inside the VPC, because the DB is private-IP.
   - Prod's runner is unchanged.
4. **`dev` at prod parity (X-dev-stack-stale).**
   - `Pulumi.dev.yaml` pins the chain-tip digests (services, run-task, proxy).
   - Dev runs the same program path as prod: monitoring, collab NEG, `infra/k8s/apply.sh STACK=dev`, and the
     profile loader SEC.3 added.
   - Record the dev deploy with `record-deployment.mjs`.
   - The standing monthly cost is projected per resource. If the delta is > $15/mo, dev returns to its idle shape
     after verification, and the owned decision proposes a cheaper standing shape for the operator.
5. **One preview end to end (D-P0.15b-1).**
   - `pr-<n>` up with the chain-tip digests.
   - The preview's database runs for the window, then returns to paused or is destroyed.
   - Migrate and seed, then smoke: api `/healthz`, web 200, the worker boot line, `MAX_USD_PER_RUN=3`.
   - JOURNEY.1's $0 legs that the preview can support.
   - Destroy with `pulumi destroy`, then `pulumi stack rm`. Zero orphaned resources, found by label or name.
6. **Runbook and seams.** `infra/pulumi/README.md`'s stage section is rewritten around the guard. The per-PR CI
   trigger is **documented, not wired**: it needs a CI→GCP identity, which is an operator act. D-P0.15b-1 is flipped
   with evidence.

## Out of scope
- Prod IaC drift, the prod collab secret/role codification, the measured bill and the Turbo cache → **OPS.2** (it
  adopts prod's manual state into item 2's mechanism).
- The role-split design itself → **SEC.1**. The journey harness → **JOURNEY.1**.
- CI-triggered per-PR previews (needs a CI cloud identity) → a `D-OPS.1-n` row for the operator.
- Nightly evals / the golden run on `dev` → **HUMAN-H7** (BL-36).
- Any paid run on a preview; any DNS for previews.

## Acceptance criteria
- [ ] **The guard:**
  - [ ] It refuses `prod` for `init`, `up`, `destroy`, `rm` and `refresh`, and refuses destroying `dev`, a
        non-`pr-\d+` stack, or an untagged `pr-<n>` stack. Each refusal has a test that fails if the check is
        removed. *(deterministic)*
  - [ ] No script in `scripts/live/` or `infra/` calls `pulumi destroy`/`rm` outside the guard (tree scan).
        *(deterministic)*
- [ ] Every Secret Manager reference the preview program wires resolves to a `rhema-pr-<n>-*` id. None resolves to
      `rhema-prod-*`. A preview stack reads no Stripe/Resend/Google/admin secret. *(deterministic — a Pulumi mock
      test over the program)*
- [ ] The migrate/seed runner refuses `seedRealProjects` for a `pr-*` stack name. On a `dev` target it still seeds
      them. Prod's runner is unchanged. *(deterministic)*
- [ ] A fresh stack's roles come out as SEC.1 specifies: the user-serving role is NOBYPASSRLS, `rhema_collab` has
      LOGIN and is NOBYPASSRLS, and the system role is confined to the system pool. There is no hand step, and no
      generated secret lands in the repo or ledger. *(deterministic + live on the preview)*
- [ ] **Stage B — `dev`:**
  - [ ] `pulumi preview` shows zero replace/delete on dev's existing stateful resources. *(agentic)*
  - [ ] `up` converges, with the service set equal to prod's and pins equal to the chain tip. *(agentic)*
  - [ ] `/healthz` returns 200 and the provenance row reads `dev:<chain-tip SHA>`. *(agentic)*
  - [ ] The projected standing $/month is recorded. If it is > $15/mo, dev is back in its idle shape and a
        `D-OPS.1-n` row carries the operator ask. *(agentic)*
- [ ] **Stage B — the preview**, with each result recorded in `runs/OPS.1.md`:
  - [ ] `pr-<n>` is created through the guard, deployed, migrated and seeded. *(agentic)*
  - [ ] The live enumeration of its services' secret refs finds zero `rhema-prod-*`. *(agentic)*
  - [ ] Its database has none of `seedRealProjects`' project slugs. *(agentic)*
  - [ ] `MAX_USD_PER_RUN=3` and invite-mode signup are live. *(agentic)*
  - [ ] The $0 journey legs are green, with screenshots. *(agentic)*
  - [ ] The `destroy` + `stack rm` are clean, with zero orphans. *(agentic)*
- [ ] The infra cost of the whole window is ≤ $20, computed from resource-hours × list price and confirmed from
      billing once available (a D-row if billing lags). *(agentic)*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md` row and `LEDGER.md` advanced. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-ARCH-38 (primary: previews never get production secrets or user-text fixtures), REQ-ARCH-39 (dev and preview
deploys recorded with digests + protocols version), REQ-ARCH-30 (no secret in repo or ledger; generated secrets
stay in Secret Manager or encrypted state), REQ-SPEC-30 (fresh stacks provision the non-bypass user role).

## Cross-cutting invariants
- Manifest **2** (the guard is `.mjs`/TS, not Python), **3** (no protocol text in preview logs or fixtures), **7**
  (the preview `max_usd` $3 guard is live), **10** (smoke logs carry no page text).
- Round 3: **REQ-SPEC-29** (the preview is accepted by walking the journeys that do not need credentials),
  **REQ-SPEC-30** (a fresh stack is born with the role split, never `postgres`-for-everything), **REQ-SPEC-32** ($0
  inference; infra measured against the cap).

## Notes
- **Owned decisions (write ADRs):**
  - (a) **Dev's standing shape:** engine and size, regional versus zonal, idle posture. Include a cost projection.
    Any move of dev/preview off AlloyDB amends ADR-010's "dev and previews stay on AlloyDB" by a **new** ADR.
    §13.2 already allows "AlloyDB or Cloud SQL" for previews.
  - (b) **The in-VPC migrate/seed execution path** (a k8s Job or a Cloud Run job).
  - (c) **IaC-generated role secrets versus `secrets.ts`'s "no secret value in Pulumi state" posture.** The
    standing authorization sanctions generated secrets for new roles; the ADR states where they live.
  - (d) **Which journey legs a preview can run** without creating a third-party credential (a real magic link needs
    a mail sender). The rest become a D-row.
- **Shared decisions consumed:**
  - **SEC.1:** the roles and pools, and their provisioning mechanism. OPS.2 then adopts prod's hand-applied
    `rhema_collab` state into the same mechanism. **Coordinate:** build the mechanism here for fresh stacks, and
    never touch prod roles.
  - **JOURNEY.1:** the harness and its test-tenant flag.
  - **SEC.3:** the profile loader is part of `apply.sh`.
- **Why SEC.3 first:** the stacks this ticket brings up carry SEC.3's image and profile. Previews must never reintroduce `Unconfined`.
- **Anchors to re-confirm at build time:**
  - `stageKindFor` maps unknown names to `preview`, so the guard must match `^pr-\d+$` itself.
  - The preview's AlloyDB is created `activationPolicy: NEVER`, so the window needs it `ALWAYS`.
  - GKE's free-tier waiver covers one cluster per billing account, and prod uses it.
  - The dev stack's current 23 resources: list them before `up`.
- **DEFERRALS rule:** anything not verifiable at build time becomes a `D-OPS.1-<n>` row. That includes dev's
  standing shape awaiting the operator, the CI per-PR trigger, and journey legs that need a mail sender.
