# R7DEP.2 — golden-rerun classification of the R7a→R7b deploy payload

- **Committed:** 2026-11-07T18:1xZ (`date -u`), **before any Part B act** (GD-GOLDEN.R7 condition:
  the classification is committed first; the estimate commits before dispatch only if affecting).
- **Payload:** `git diff 4bc8cf4a..18b79c30` — prod serves `4bc8cf4a` (R7DEP.1 Part B, verified
  live on web+api `/healthz` at pre-state); the R7b chain tip is `18b79c30` (R7PUB.1's boundary
  commit, `merge-base --is-ancestor`-verified). 142 commits, 577 files (+64,624/−18,336).
- **Rule:** `docs/ops/golden-rerun-rule.md` § "What counts as protocol-affecting" — a deploy is
  protocol-affecting when it can change what a golden Review produces. In doubt ⇒ affecting.

## Item-by-item against the rule's list

| Rule arm | Payload contact | Verdict |
|---|---|---|
| protocol seeds, manifests, rubrics, phase defaults or phase behavior (`packages/protocols`) | `git diff --name-only … -- packages/protocols` → **zero files** | NOT affecting |
| the run/dispatch path (protocol resolution, phase-default layering, URL policy freezing, delivery) | `packages/orchestrator/src/guidance.ts` adds one optional `draftId` column to the `guidance` INSERT (REQ-WRITE-2 comment anchoring — a read-back field for the margin card, not dispatch); `packages/mirror` (delivery.ts `frozenBy` metadata stamp, freeze.ts `superseded_by_import` cause, manual-revision discarded-save refusal) is draft-lifecycle/editor machinery; `apps/api` chat/dossier/editor/import/outline/project-list/project-routes/search/version routes are user-surface reads/writes — no protocol resolution, phase-default layering, URL-policy freezing, or run-delivery validation touched | NOT affecting |
| the harness/skill phase machinery | `apps/run-task`, `packages/engine`, `apps/worker` → **zero source files** (only `packages/ledger/src/chat-turn-burn.test.ts`, a test) | NOT affecting |
| the egress proxy's research/fetch policy | `apps/egress-proxy` → `handler.test.ts` ONLY (the REQ-SYNC-6 cap-crossing reproduction leg; zero src change → no policy change) | NOT affecting |
| any REQ-SEC-3-class security fix touching the boundary a run executes behind | none in the payload — the infra diffs are R7DEP.1's own already-applied changes (the `WALKTHROUGH_MODEL_KEY_SECRET` env removal + digest re-pins, live since 2026-11-05); `apps/collab` discarded-head attach refusal is session auth, `apps/convert` is import warnings | NOT affecting |

## Deploy-neutral check

The payload is non-neutral: `git diff --name-only` outside `scripts/deploy-neutral-paths.txt`
(`docs/`, `.gitleaks.toml`) covers every product surface — **every `/healthz` service is rebuilt**
at the deploy SHA (ticket deliverable 1's own reading).

## Migrations

`packages/db/migrations/0062_drafts_discard.sql` is the only migration newer than prod max `0061`
(tunnel-verified 2026-11-07): two `ALTER TABLE … ADD COLUMN` — `check-additive-migrations.mjs
--files` **PASS**. Additive-only, no rewrite/drop/role change.

## Verdict

**NOT protocol-affecting → no golden re-run → $0 spend.** The R7b payload is the Stream-U UX
overhaul (web/ui/editor/ide/api surfaces), the tour re-pin, and the landing refresh — none of it
changes what a golden Review produces. `GD-GOLDEN.R7` discharged by classification (≤1 re-run
authorized only if affecting; none needed).
