# Open-source readiness — audit dispositions and the visibility-flip runbook

**Scope:** make `SteveVitali/Rhema` safe to make **public** under the operator's 2026-11-02
ruling (verbatim): "I'm okay with packages/protocols being public. We should amend the docs that
say otherwise." and "we should do secret/history scan, check for personal data, etc., and scan
all the other stuff you mention, as well as the standard OSS hygiene." Recorded by R6OSS.1
(2026-11-03; ADR-002 amendment, ADR-125).

**This document is the flip checklist — the flip itself is the operator's act.** A GitHub
visibility change publishes **every commit**, not the tip tree; it also makes Actions
history/logs public ([GitHub's visibility
guidance](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility)).
Nothing in this document rewrites history — scrubbing is a destructive act requiring per-item
operator authorization.

## Status — 2026-11-11 (204_R6OSS.1 closeout): the flip is DONE; this doc is now the post-flip record

- **2026-11-03 (operator + orchestrator boundary `90bba399`):** every `needs-ruling` row below
  was ruled **STAYS en masse** (nothing scrubs; no history rewrite); `cbc6ac3` accepted
  as-valueless; the repo went **PUBLIC**; `codex/open-source-docs` deleted; 237 merged
  build-chain branches pruned; `main` branch protection applied (`ci-pass anchor`, enforce
  admins, no force-push/delete); homepage → `rhema.tools`; issues/wiki/discussions confirmed
  empty/disabled; `CODE_OF_CONDUCT.md` not adopted (operator choice).
- **2026-11-11 (this run):** the post-flip verification clause executed in full — anonymous
  clone → `pnpm install --frozen-lockfile` (`@rhema/evals` resolves to `evals-stub`) →
  `pnpm turbo build lint typecheck` **138/138 green**; gitleaks committed-config **0 leaks**
  over HEAD history; Actions secrets names-only; workflows unchanged. The delta audit over the
  **481 commits added since 2026-11-03** found **zero real secrets and no new PII class** —
  `docs/build/reports/2026-11-11_r6oss-1-verify/`. **D-R6OSS.1-1 → DONE** (DEFERRALS).
- **Standing rules now in force:** the § Standing rule after flip below. New stale
  `stevevitali/*` chain branches re-accumulate on origin (all public, all merged or open-PR
  chain content) — periodic prune is hygiene, not a finding.

## Audit evidence (committed)

- `docs/build/reports/2026-11-03_r6oss-1/findings-disposition.md` — the per-finding disposition
  record (prefix/shape only, never values).
- `docs/build/reports/2026-11-03_r6oss-1/gitleaks-committed-config.json` — `gitleaks git
--config .gitleaks.toml`, 1,342 commits: **0 findings**.
- `docs/build/reports/2026-11-03_r6oss-1/gitleaks-unfiltered-all-refs.json` — the same scan with
  the repo allowlist **removed** (the committed config exempts `docs/`, fixtures, and vendor
  paths): **91 findings, all `generic-api-key`, all benign classes** (git SHAs in evidence
  JSON, allowlisted fixtures, object-key/config literals, one image digest).
- `docs/build/reports/2026-11-03_r6oss-1/gitleaks-audit.toml` — the unfiltered config, so the
  scan is reproducible.

Coverage: `git rev-list --all` = 1,602 commits across all pushed branches; the 4 commits not
reachable from HEAD (`279c050`, `e1fb7b7`, `0576cc0`, `e040d54` — two boundary records and a
stash pair) were scanned individually; the 370 local unreachable objects (pre-rewrite
stash/sim commits, including the F-R6DEP.2-2 pre-scrub commit `cbc6ac3`) were literal-scanned.

## Secret-scan verdict

**Zero real secrets in reachable history.** Every secret-shaped literal is a test fixture, a
placeholder, a benign identifier, a revoked invite, or Pulumi ciphertext:

| Pattern class                                                                                                              | Result                                                                                                                            | Disposition                    |
| -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `sk_live_` / `sk_test_` (full shape)                                                                                       | 0 (only `sk_live_51UA`, `sk_test_FAKE`, `sk_test_x` placeholders)                                                                 | fixture                        |
| `sk-ant-*`                                                                                                                 | 5 literals, all placeholder/test (`…-placeholder-…`, `…-real-key-xyz`, `…-not-a-real-key-…`)                                      | fixture                        |
| `whsec_` (full shape)                                                                                                      | 0 (`whsec_PLACEH…`/`whsec_test`/`whsec_signup`/`whsec_other` fixtures)                                                            | fixture                        |
| `pk_*`, `rk_*`, `re_[A-Za-z0-9]{16,}` (Resend), `AIza…`, `xox*`, `ghp_`/`gho_`/`github_pat_`/`glpat-`, `AKIA…`, PEM blocks | 0                                                                                                                                 | clean                          |
| `postgres(ql)?://` DSNs                                                                                                    | 43 distinct literals — all placeholders/interpolations/localhost/CI                                                               | fixture/placeholder            |
| `cs_live_` checkout sessions                                                                                               | 4 literals in build records                                                                                                       | needs-ruling (real object ids) |
| `t8exp_` export tokens                                                                                                     | 3 literals — minted **already-expired** on the `is_test` tenant (410 arm); carry no access                                        | benign-id                      |
| Pulumi `secure:` blocks / `opsAlertWebhookUrl`                                                                             | ciphertext only, 9+1 blocks                                                                                                       | safe                           |
| `googleOauthClientId`, `buy.stripe.com` payment-link URLs                                                                  | plaintext, public-by-design                                                                                                       | stays                          |
| Leaked invite `r6-bf266…` (F-R6DEP.2-2)                                                                                    | survives only in **unreachable** object `cbc6ac3`; **revoked on prod 2026-10-26** (revoked+reminted, replacement never committed) | mitigated — needs-ruling note  |
| Invite codes `prv-<n>-test`                                                                                                | deterministic preview codes, destroyed stacks                                                                                     | benign                         |
| Webhook URLs (`hooks.slack.com` etc.)                                                                                      | none committed                                                                                                                    | clean                          |

## Personal-data / internals disposition table

Every class a public reader sees. `stays` = public-by-choice; `needs-scrub` = would require
history rewrite (per-item operator authorization); `needs-ruling` = the operator's call.

| Class                                                                                                                                                        | Where it lives                                                                                    | Reach              | Disposition                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Operator personal Gmail `14stevevitali@gmail.com`                                                                                                            | 47 files at HEAD (records/ledger) **+ every commit's author/committer metadata** (~1,600 commits) | history + metadata | **needs-ruling** — scrubbing author metadata means rewriting all 1,602 commits; `stays` is the defensible default (it is also the OSS project's public contact identity)                      |
| Gmail aliases `+r6lch1`, `+rhema-review`                                                                                                                     | 11 files                                                                                          | history            | **needs-ruling** (rider on the Gmail decision)                                                                                                                                                |
| `svitali@foursquare.com`                                                                                                                                     | commit author metadata only (early commits)                                                       | history            | **needs-ruling** — employer-domain address; same rewrite cost as above                                                                                                                        |
| `rhema-test-tenant-mailbox@stevenvitali.com` (DWD mailbox)                                                                                                   | `docs/build/runs/RPT.1.md` + WIF/DWD prose                                                        | history            | **needs-ruling** — personal-domain mailbox identity (no credential exists; DWD is IAM `signJwt`)                                                                                              |
| Home paths `/Users/stevenvitali`                                                                                                                             | 7 files at HEAD                                                                                   | history            | **needs-scrub or stays** — cosmetic; recommend `stays` (machine-owner home dir, standard on macOS)                                                                                            |
| Internal IPs `10.46.0.3`, `10.8.16.x`, `10.8.240.x`                                                                                                          | 45+ files at HEAD (`Pulumi.prod.yaml` `proxyBaseUrl`, network docs, ledgers)                      | history            | **needs-ruling** — VPC topology of a live deployment; revealing internal addressing is low-sensitivity but operator's call                                                                    |
| GCP project `rhema-507501` + project number `25012989319`                                                                                                    | 159+22 files at HEAD                                                                              | history            | **needs-ruling** — org-internal identifier (project ids appear in public IaC repos commonly; number pairs to the OAuth client id)                                                             |
| OAuth client id `25012989319-…apps.googleusercontent.com`                                                                                                    | `Pulumi.prod.yaml`, configs                                                                       | history            | **stays** — public-by-design (travels in authorize URLs; the client _secret_ is elsewhere and never committed)                                                                                |
| Stripe object ids (`plink_`×2, `sub_`, `evt_`×2, `we_1UH99C…`, `prod_`, `price_`, `pi_`×2, `cs_live_`×4)                                                     | build records                                                                                     | history            | **needs-ruling** — real account-object identifiers; unusable without `sk_live` (never committed) but enumerate real transactions/products                                                     |
| Workspace/user/run ULIDs (`01M…`)                                                                                                                            | thousands across `docs/build/`                                                                    | history            | **needs-ruling** — record keys; harmless alone, but the class is large enough to rule on                                                                                                      |
| WIF provider name + SA emails (`*@rhema-507501.iam.gserviceaccount.com`, `p25012989319-…@gcp-sa-cloud-sql…`)                                                 | 23 files                                                                                          | history            | **needs-ruling** — internals; identities not credentials                                                                                                                                      |
| The `docs/build/` tree itself (LEDGER, runs, readouts, reports: candid internal assessments, spend figures, defect records, gate rulings verbatim, this PII) | `docs/build/**`                                                                                   | history            | **needs-ruling** — the big class. It is the project's build record; publish-as-is vs scrub is an operator decision. Note: it contains everything above plus candid assessments of the product |
| 897 report screenshots (`docs/build/reports/**/*.png/jpg`)                                                                                                   | committed evidence                                                                                | history            | **needs-ruling** — binary grep shows no gmail/mailbox strings; image _contents_ were not OCR'd — spot-check or accept                                                                         |
| `codex/open-source-docs` remote branch                                                                                                                       | `origin/codex/open-source-docs`                                                                   | refs               | **stays/needs-ruling** — a stray non-chain branch; its tip is reachable history that will publish. Review before flip or delete the branch                                                    |
| Commit timestamps + author name "Steve(n) Vitali"                                                                                                            | all commits                                                                                       | metadata           | **stays** — normal OSS attribution                                                                                                                                                            |

**No class was found that must block the flip on secret grounds.** The needs-ruling rows are
privacy/posture calls, not credentials. A `stays` disposition on everything is defensible;
any `scrub` disposition is a history rewrite the operator must authorize per item (out of
scope here by ticket).

## Standard OSS hygiene — verified

| Item                   | State                                                                                                    |
| ---------------------- | -------------------------------------------------------------------------------------------------------- |
| `LICENSE`              | MIT, `Copyright (c) 2026 Rhema` — confirmed intended (Q-19 "written as if public")                       |
| `LICENSES.md`          | Current: dep policy + checked-in exceptions + the font/SDK terms; boundary section amended 2026-11-03    |
| `SECURITY.md`          | Present: private report contact `security@rhema.tools`, scope, boundary descriptions                     |
| `CONTRIBUTING.md`      | Present: setup, boundaries, PR norms, fork flow                                                          |
| `SUPPORT.md`           | Present: help routing, hosted-service contact                                                            |
| Issue templates        | `.github/ISSUE_TEMPLATE/{bug_report,feature_request}.md`                                                 |
| PR template            | `.github/PULL_REQUEST_TEMPLATE.md`                                                                       |
| `CODE_OF_CONDUCT.md`   | **Absent — operator choice outstanding** (the release-readiness page lists it as pre-launch work item 5) |
| README public accuracy | Updated 2026-11-03 (release-status section now states protocols ship public)                             |

## Workflow fork-safety — verified

| Workflow                         | Triggers                                                        | Secrets exposure to fork PRs                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/ci.yml`       | `push` (main), `pull_request`, `workflow_dispatch`              | **None reachable.** `pull_request` (not `pull_request_target`) ⇒ fork PRs get a read-only `GITHUB_TOKEN` and **no secrets** (GitHub behavior). Job permissions are `contents: read`/`actions: read`/`pull-requests: read` — least privilege. The only `secrets.*` reference is `TURBO_TOKEN` (remote-cache; empty on forks — graceful miss). No step echoes secrets |
| `.github/workflows/journeys.yml` | `schedule`, `workflow_dispatch` only — **no PR trigger at all** | Fork PRs can never run it. `secrets.JOURNEY_*` + `id-token: write` (WIF) are reachable only via schedule/dispatch, which require write access on the upstream repo. The WIF principalSet is repo-attribute-bound (`github-pool` → `SteveVitali/Rhema`), so a fork's Actions cannot mint the identity                                                                |

Two public-repo notes for the operator: (a) GitHub gates Actions from **new** fork contributors
by default ("require approval for first-time contributors") — confirm the setting after flip;
(b) `workflow_dispatch` requires write access, so fork clones can't fire journeys — the WIF
binding additionally refuses non-upstream repos.

## Exact flip procedure (operator)

1. **Disposition the table above.** Rule each `needs-ruling` row `stays` / `scrub` /
   `needs-scrub`. Scrub = history rewrite: authorize per item; re-run this audit after.
2. **Decide the unreachable-object question.** `cbc6ac3` (the revoked invite literal) is the
   known pushed-then-rewritten commit. Options: accept (valueless — the code is revoked), or ask
   GitHub support to GC unreachable objects pre-flip.
3. **Review stray refs.** `origin/codex/open-source-docs` and any branch you don't want
   published — deleting a remote branch removes it from the public surface (reachable objects
   remain addressable by SHA while unreferenced objects persist; combine with step 2 if it
   matters).
4. **Review GitHub-side content that isn't git history:** issues, PR bodies/comments, Actions
   logs (all become public with the repo), releases, wiki, the repo's About/social card, and
   repo `vars`/`secrets` names (values stay secret; names are visible to admins only — public
   visibility does not expose them).
5. **Rotate-on-caution:** the audit found zero live secrets; if the operator still wants a
   belt-and-suspenders pass, the cheap rotations are the `JOURNEY_*` bound secrets and any
   secret ever typed into a shell that touched this repo's remotes — none were found committed.
6. **Re-check branch protection** post-flip: `main` protection (required checks, no force-push)
   survives a visibility change in place on GitHub, but verify rather than assume.
7. **Flip:** repo Settings → General → Danger Zone → Change visibility → Public.
8. **Post-flip verification (same day):**
   - anonymous clone: `git clone https://github.com/SteveVitali/Rhema.git /tmp/rhema-public &&
cd /tmp/rhema-public && pnpm install --frozen-lockfile && pnpm turbo build lint typecheck`
     — proves the public tree builds without any private checkout (`evals-stub` resolves).
   - `gitleaks git --config .gitleaks.toml` on the fresh public clone — expect 0.
   - Confirm Actions logs/secrets posture: `gh api repos/SteveVitali/Rhema/actions/secrets`
     (names only; values never exposed) and spot-check a public run's log for redactions.
   - Confirm the workflows above still show `pull_request`/`schedule` triggers unchanged and no
     `pull_request_target` was introduced.
   - Record the flip in `docs/build/LEDGER.md` PHASE LOG + a `DEFERRALS.md` row closure
     (D-R6OSS.1-*), by the normal append-only rules.
9. **Standing rule after flip:** secrets/PII never commit to this repo; the CI `public-safe`
   gitleaks leg stays on every head; invite/credential mints keep the env-only rule (the
   F-R6DEP.2-2 recorded rule — minted codes live in the operator's hands, never in seeds or
   ledgers).

## Outstanding decisions (this ticket does not make them)

- The per-class `needs-ruling` rows above (operator).
- `CODE_OF_CONDUCT.md` adoption + enforcement contact (release-readiness work item 5).
- Whether `docs/build/` ships as-is — the candid build record — or gets a curated export
  (a different shape than the visibility flip; out of this runbook's scope).
- GitHub-side (non-git) content review: issues/PRs/logs/wiki (step 4).

**Dispositioned — 2026-11-03/11:** all four items are closed on the record. The operator ruled
**STAYS** on every `needs-ruling` row (nothing scrubs — 2026-11-03 en-masse ruling, recorded in
D-R6OSS.1-1); `CODE_OF_CONDUCT.md` was declined by operator choice at flip; `docs/build/` ships
as-is (covered by the same en-masse ruling); the GitHub-side review ran at flip (zero issues,
wiki/discussions disabled, PR bodies carry only the ruled identifier classes). The section is
retained verbatim as the record of what was owed; the standing post-flip rules above are what
remains in force.
