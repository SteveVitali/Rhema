# R6OSS.1 re-verification — post-flip delta audit + closeout (2026-11-11)

**Why this report exists.** Row 204 (`204_R6OSS.1`) executed its manifest slot today. The
substance — ADR-002 reversal, the first full-history audit, OSS hygiene, the flip runbook —
landed 2026-11-03 via PR #236 (`reports/2026-11-03_r6oss-1/`), and the operator flipped
`SteveVitali/Rhema` to **public** the same day (boundary commit `90bba399`: post-flip
verification + GitHub-side hygiene + 237 stale branches pruned + the en-masse STAYS ruling on
D-R6OSS.1-1). This run is the row's closeout re-verification: the audit surface has grown by
**481 commits across refs since 2026-11-03** (`git rev-list --all` 1,602 → 2,083; `origin/main`
2,068 commits), every one of them now public. Prefix/shape only in this file — never values.

## Committed evidence

- `gitleaks-committed-config.json` — `gitleaks git --config .gitleaks.toml`, HEAD history:
  **1,678 commits scanned, 0 findings** (report `[]`).
- `gitleaks-unfiltered-head.json` — the unfiltered audit config
  (`reports/2026-11-03_r6oss-1/gitleaks-audit.toml`, no allowlist) over HEAD: **220 hits, all
  `generic-api-key`, all benign classes** (baseline 91 grew by exactly the delta classes below).
- `gitleaks-unfiltered-delta.json` — the same unfiltered config over `--log-opts
  "29897095..HEAD"` (the delta since the 2026-11-03 audit base): **327 commits scanned, 129
  hits, all `generic-api-key`, all benign.**

## Delta verdict — zero real secrets in the 481 new commits

| Hit class                                                                                                | Count | Disposition |
| -------------------------------------------------------------------------------------------------------- | ----- | ----------- |
| Prior audit report contents re-firing (`reports/2026-11-03_r6oss-1/gitleaks-unfiltered-all-refs.json`)   | 95    | benign — self-referential evidence file; its literals were dispositioned 2026-11-03 |
| Git SHAs in committed journey/prod-leg `report.json` provenance fields (`"api": "<40-hex>"`)             | 24    | benign-id — same class as baseline ("git SHAs in evidence JSON")                    |
| Demo-corpus `SnapshotFile` envelope `"key"` fields (`"key": "vN-published"`, `"key": "figure_*"`)         | 7     | benign — the exact class the committed `.gitleaks.toml` now allowlists (R7DEM.3b/R7DATA.1) |
| Quarantine object-key test fixture (`quarantine/ws1/up1` in `apps/web/src/server.test.ts`)               | 2     | fixture — pinned test literal, valueless outside the test                           |
| Git SHA in run-record prose (`docs/build/runs/R7DEP.2.md`)                                               | 1     | benign-id                                                                           |

Targeted literal sweeps over the delta (`git log -p 29897095..origin/main`, full-shape regexes):
`sk_live_`/`sk_test_`/`whsec_`/`pk_*`/`rk_*`/`re_[A-Za-z0-9]{16,}`/`cs_test_`/`xox*`/`ghp_`/
`gho_`/`github_pat_`/`glpat-`/`AKIA`/`AIza`/PEM blocks → **0 real-shape hits**. `sk-ant-*` →
prose *prefix* references only (`sk-ant-admin_P…`, `sk-ant-admin01`, `sk-ant-api03-` — the
placeholder-shape discussion in DEFERRALS, never a full key). `postgres(ql)?://` → 3 placeholder
literals (`postgres://x` class). Webhook URLs → none. Invite codes → `prv-<n>-test`
deterministic preview codes only (destroyed stacks). `t8exp_` → the expired-by-design fixture
tokens (already dispositioned). `cs_live_`/Stripe object ids keep accumulating in build records
(23 files at HEAD — same real-object-id class, covered by the operator's en-masse **STAYS**).

## Non-HEAD refs + unreachable objects

- 15 commits on refs not reachable from `origin/main`: the four live chain branches
  (`r6cap-1-gap-analysis`, `r6cap-3-closure`, `r6tail-inserts`, `r6watch-ontime`) + the three
  pre-audit boundary/stash commits (`0576cc0`, `279c050`, `e040d54`, `e1fb7b7`). Per-branch
  `gitleaks git --log-opts "origin/main..origin/<branch>"` scans: **9 commits, 0 leaks**; the
  boundary/stash commits were dispositioned 2026-11-03 (fixtures only).
- `git fsck --unreachable` = **505 commits** (was 370). Literal sweep of every unreachable
  commit diff for the named secret classes: `cs_live_` ids (same dispositioned class),
  `sk_live_51UA` (pinned fixture), `t8exp_` expired fixtures — nothing new. `cbc6ac3` still
  carries the revoked `r6-bf266…` invite literal (F-R6DEP.2-2; revoked+reminted on prod
  2026-10-26; **accepted-as-valueless** by operator ruling 2026-11-03).

## Personal-data / internals delta — no new class

Every literal found in the delta lands inside a class the operator ruled **STAYS** on
2026-11-03: operator gmail (22 files at HEAD) + `+r6lch1`/`+rhema-review` aliases, DWD mailbox
(5 files), `/Users/stevenvitali` (12), internal IPs (`10.46.0.3`×58 files, `10.8.16.x`×46,
`10.8.240`×8 — plus new member literals `10.8.16.8`, `10.0.0.9`, `10.0.0.5` of the same class),
GCP project `rhema-507501` (173) + number (25) + OAuth client id, Stripe object ids, WIF/SA
names (26), ULIDs, the `docs/build/` tree. One *new spelling*, not a new class:
`stevevitali@users.noreply.github.com` (GitHub privacy noreply on web-merge commits — benign).
`svitali@foursquare.com` appears only as quoted audit references. **No new ruling needed.**

## Post-flip state re-verified 2026-11-11

- `gh repo view` → `visibility: PUBLIC`; anonymous `https://github.com/SteveVitali/Rhema` → 200.
- **Anonymous clone build leg (the D-R6OSS.1-1 closeout condition, now fully executed):**
  `git clone https://github.com/SteveVitali/Rhema.git` (depth 50) → `pnpm install
  --frozen-lockfile` green — preinstall resolves **`@rhema/evals` → `evals-stub`** with no
  private checkout → `pnpm turbo build lint typecheck` **138/138 green** (~28 s, Node 24).
  Fresh-clone `gitleaks git --config .gitleaks.toml` → 0 leaks (204 commits in the shallow
  history; the full-history scan above covers all 2,068).
- Actions secrets (`gh api repos/SteveVitali/Rhema/actions/secrets`): names only —
  `JOURNEY_CI_SSH_KEY`, `JOURNEY_DATABASE_URL`, `JOURNEY_T8_EXPORT_TOKEN`, `TURBO_TOKEN`.
- Branch protection on `main` (re-checked): required check `ci-pass anchor`, `enforce_admins`,
  no force-push, no deletions.
- Workflows unchanged: `ci.yml` = `push(main)`/`pull_request`/`workflow_dispatch` with
  least-privilege permissions; `journeys.yml` = `schedule`/`workflow_dispatch`; **no
  `pull_request_target` repo-wide**.
- Hygiene files: `SECURITY.md`, `CONTRIBUTING.md`, `SUPPORT.md`, `LICENSE` (MIT), `LICENSES.md`,
  issue + PR templates all present; `CODE_OF_CONDUCT.md` absent **by operator choice**
  (boundary record 2026-11-03).
- Repo metadata: `has_wiki`/`has_discussions` off, `homepage` → `rhema.tools`, zero real issues
  (`open_issues_count: 2` = the two open PRs). Stray `codex/open-source-docs` branch confirmed
  deleted at flip; current remote refs are all `stevevitali/*` chain branches (merged or the
  two open-PR heads) — merged-chain stale branches re-accumulate post-flip; periodic prune is
  a standing-hygiene note, not a finding.
