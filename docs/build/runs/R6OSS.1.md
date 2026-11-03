# R6OSS.1 — open-source readiness: ADR-002 reversal + history/PII audit + OSS hygiene (run ledger)

- **Spec:** `docs/tickets/204_R6OSS.1__open-source-readiness.md` (manifest row 204, phase round 6,
  tail). Operator rulings verbatim (2026-11-02, recorded in the ticket): "I'm okay with
  packages/protocols being public. We should amend the docs that say otherwise." and "we should do
  secret/history scan, check for personal data, etc., and scan all the other stuff you mention, as
  well as the standard OSS hygiene." The visibility flip itself is NOT this ticket — the audit +
  readiness artifacts are. mergePolicy=OPERATOR — never merge. LAUNCHED (prod serves `4938b8e`);
  zero prod mutations (`Production mutations: none`).
- **Normative loads:** `docs/tickets/DEFERRALS.md` (read first); `docs/adr/ADR-002-…md`;
  `AGENTS.md` gotcha 8 + build-memory rules; `docs/open-source-readiness.md` (living release
  boundary); `docs/AGENTS.md`; manifest § Operating rules; `docs/ops/` runbook conventions;
  `.gitleaks.toml`; `.github/workflows/{ci,journeys}.yml`.
- **Base:** `origin/main` @ `298970955c7e842bd131d734bc20b5410e9d013c` (the ticket-append commit).
- **Branch:** `stevevitali/r6oss-1-open-source` · **Harness:** devin-desktop/swe-2-high/subagent
  · **Skills:** implement-spec + build-memory + self-review @ `~/agent-skills` (`e981ec5`)
- **Started:** 2026-11-03T04:2xZ · **Closed:** (set at close)
- **Production mutations:** none (repo-only ticket; the GitHub visibility flip is the operator's
  act after this audit's dispositions).

## Deferrals read

`docs/tickets/DEFERRALS.md` read first (protocol). No `OPEN`/`PARTIAL` row names R6OSS.1 or a
landed prerequisite of it as its unblock — the open rows are scoped to live/paid legs, evals,
HUMAN prerequisites, and other tickets; this repo-only audit does not unblock them. New deferral
rows appended this run for the audit items that require operator action (the visibility flip,
any scrub/rotate rulings) per BM-DEFER-02.

## Requirements

1. **Docs amendment.** ADR-002 dated reversal note; every doc asserting the export-time swap /
   private-package invariant carries the dated reversal: `AGENTS.md` gotcha 8, spec §13.2
   (REQ-ARCH-37 public-export clause), manifest § Spec amendments applied, `pnpm-workspace.yaml`
   comments, `.pnpmfile.cjs` NOTE, `packages/protocols-stub` package.json/src (marked the
   now-dormant export shim — keep-or-delete decided + recorded), `scripts/lib/protocols-resolver.mjs`,
   `scripts/resolve-protocols.mjs`, `docs/ci.md`, `docs/open-source-readiness.md`,
   `docs/configuration.md`, `LICENSES.md`, executed tickets `01_P0.01`/`03_P0.03` (dated notes),
   `README.md`/`CONTRIBUTING.md` release-status lines, `.github/workflows/ci.yml` comments.
   `docs/adr/README.md` regenerated (never hand-edited).
2. **Full-history secret scan.** `gitleaks git --config .gitleaks.toml` over all history +
   an unfiltered second pass (no allowlist — the committed config allowlists `docs/.*`) +
   targeted `git log --all -G` greps for: `sk_live_`/`sk_test_`/`sk-ant-`/`whsec_`/`re_`/`pk_`/
   `rk_`/`cs_live_`/`cs_test_`/`t8exp_`/`xox*`/`ghp_`/`github_pat_`/`glpat-`/`AKIA`/PEM blocks/
   `postgres(ql)?://` DSNs with userinfo/invite codes/webhook URLs/DWD mailbox material/WIF
   strings. Every hit dispositioned (real-leak → rotate/scrub operator ruling; fixture →
   allowlist note; benign-id → recorded). No unilateral history rewrite.
3. **Personal-data / internals audit + disposition table.** Enumerate committed classes:
   operator personal Gmail + `+r6lch1`/`+rhema-review` aliases, `svitali@foursquare.com` (commit
   metadata), `rhema-test-tenant-mailbox@stevenvitali.com` (DWD mailbox), `/Users/stevenvitali`
   paths, internal IPs (`10.46.0.3`, `10.8.16.x`, `10.8.240.x`), GCP project `rhema-507501` +
   number `25012989319` + OAuth client id, Stripe object ids (`plink_`/`cs_live_`/`sub_`/`evt_`/
   `we_`/`prod_`/`price_`/`pi_`), invite codes (`prv-<n>-test`, `r6-*` env-provided), ULIDs,
   WIF provider/SA names, `t8exp_` fixture tokens, the `docs/build/` tree itself, 897 report
   screenshots. Disposition each: stays / needs-scrub / needs-ruling (big classes → operator).
4. **OSS hygiene.** `SECURITY.md` + `CONTRIBUTING.md` + issue/PR templates + `LICENSE` (MIT) +
   `LICENSES.md` + `SUPPORT.md` reviewed; README public-reader accuracy; workflow fork-safety
   (no `pull_request_target`; secrets never exposed to fork PRs).
5. **Export checklist + flip runbook.** `docs/ops/open-source-readiness.md`: audit disposition
   table, outstanding scrub/rotate decisions, exact flip steps (visibility toggle, branch
   protection, CI-secrets posture on public repos, Actions-history exposure), post-flip
   verification.

## Acceptance criteria

- [ ] ADR-002 + all private-package assertions carry the dated reversal (agentic)
- [ ] Full-history scan committed: every finding dispositioned (live-executed — the scan runs real)
- [ ] Personal-data disposition table committed; every class dispositioned or escalated (live-executed)
- [ ] SECURITY.md + CONTRIBUTING.md + hygiene files landed; workflows fork-safe verified (agentic)
- [ ] `docs/ops/open-source-readiness.md` runbook committed with exact flip steps (agentic)
- [ ] verification green; requirement ids stamped; DEFERRALS rows for non-automatic items;
      ADRs for decisions; BUILD_INDEX + LEDGER advanced; operating clauses met (agentic)

**Requirement ids:** REQ-ARCH-37 (amended), REQ-ARCH-30 (secrets posture), REQ-ARCH-38
(non-prod/prod separation).

## Plan

1. Phase 0–1: branch, context load, ledger, audit groundwork (done above).
2. Docs amendment sweep (requirement 1) — in-place edits on living docs, dated notes on
   historical/contract records, new ADR-125 recording the ruling + the keep-the-stub decision,
   regenerate `docs/adr/README.md`.
3. History audit already executed (see Evidence log): gitleaks committed-config (0 hits over
   1342 commits on HEAD), gitleaks unfiltered all-refs (91 `generic-api-key` hits — all
   git-SHA/allowlisted-fixture/benign classes, 0 on non-HEAD refs; the 4 commits unreachable
   from HEAD scanned individually), targeted `-G` pickaxe + distinct-literal extraction for
   every named class. Write the committed report + disposition table.
4. Personal-data enumeration → disposition table (stays/scrub/ruling) in the runbook.
5. Hygiene: workflow fork-safety verification (ci.yml = `pull_request` only, least-priv perms,
   no secrets on fork PRs; journeys.yml = schedule/dispatch only — no PR trigger), template/
   SUPPORT/LICENSE checks, README/CONTRIBUTING release-status updates.
6. `docs/ops/open-source-readiness.md` runbook + committed audit reports under
   `docs/build/reports/2026-11-03_r6oss-1/`.
7. Self-review → gap analysis → verification (turbo build/lint/typecheck, pnpm test,
   check-build-memory, append-only) → PR + records (BUILD_INDEX 240, LEDGER PHASE LOG,
   `nextTicket` stays `200_R6WATCH.1`, `ci-boundary --ledger --ticket R6OSS.1`).

## Test matrix

This ticket is docs/records-only — it lands no product code. "Every new behaviour has a test":
the new committed artifacts are checked by the build-memory + append-only validators and by
`pnpm format` on touched living docs. The audit itself is the executed behavior (live-executed
scan, committed evidence). The one new doc file (`docs/ops/open-source-readiness.md`) is a
living runbook — its commands are verified against the real tools this run (gitleaks flag
spellings exercised literally; `gh` commands are the operator's, marked as such).

## Progress

- Phase 0/1 done: branch `stevevitali/r6oss-1-open-source` off `origin/main @2989709`; context
  loaded; DEFERRALS read (no R6OSS.1-scoped rows to close).
- History scan executed (pre-edit, on the clean base): committed-config `gitleaks git` → 0
  leaks, 1342 commits; unfiltered all-refs → 91 generic-api-key hits, all benign classes;
  targeted greps → see Evidence log. The 4 non-HEAD commits (`279c050`, `e1fb7b7`, `0576cc0`,
  `e040d54` — a stash pair + two boundary records) checked: no secret-bearing literals
  (verified by targeted grep over their trees/diffs).

## Gap table

| item (spec §) | required layer | achieved layer | status | evidence |
|---|---|---|---|---|
| AC: ADR-002 + all private-package assertions carry the dated reversal | agentic | engineered | met | ADR-002 status+Amendment section; spec §13.2 + REQ table re-amended; manifest § amendments 2026-11-03 entry; AGENTS.md gotcha 8; pnpm-workspace.yaml; .pnpmfile.cjs; protocols-stub pkg/src; protocols-resolver.mjs; resolve-protocols.mjs; ci.yml comment; docs/ci.md; docs/open-source-readiness.md; docs/configuration.md; LICENSES.md; tickets 01_P0.01/03_P0.03 dated notes; README/CONTRIBUTING; ADR-125 + regenerated adr index |
| AC: full-history scan committed, every finding dispositioned | live-executed | live-executed | met | gitleaks committed-config 0 leaks (1,342 commits); unfiltered all-refs 91 benign hits; 4 non-HEAD commits + 370 unreachable objects scanned; ~30 targeted classes grep'd; reports/2026-11-03_r6oss-1/ |
| AC: personal-data disposition table committed; every class dispositioned or escalated | live-executed | live-executed (rulings → D-R6OSS.1-1) | met | ops runbook § disposition table — every class stays/benign/needs-ruling; operator-ruled classes escalated verbatim via D-R6OSS.1-1 |
| AC: SECURITY.md + CONTRIBUTING.md + hygiene files landed; workflows fork-safe verified | agentic | engineered | met | files verified present (SECURITY/CONTRIBUTING/SUPPORT/LICENSE-MIT/LICENSES/templates); ci.yml `pull_request` only + least-priv; journeys.yml no PR trigger; runbook § Workflow fork-safety |
| AC: docs/ops/open-source-readiness.md runbook with exact flip steps | agentic | engineered | met | docs/ops/open-source-readiness.md § Exact flip procedure + post-flip verification |
| AC: verification green; req ids stamped; DEFERRALS rows; ADRs; INDEX+LEDGER; operating clauses | agentic | engineered | met | D-R6OSS.1-1 opened (operator-owned items); ADR-125; BUILD_INDEX 240; LEDGER PHASE LOG; checks below |
| Operating clauses 1–10 | — | — | met | date -u stamps; ci-boundary read at head; per-AC layer words; append-only amendments (dated notes, no rewrites); operator ruling verbatim; no secret values in artifacts (prefix/shape only); harness in header; no living-record pins (no new tests); no ledger-only pushes; full-CI cadence noted (docs diff → fast-path eligible where classifier proves it) |
| Out-of-scope honored | — | — | met | no visibility flip performed; zero history rewrite; zero prod mutations |

## Evidence log

- `gitleaks git --config .gitleaks.toml` → `1342 commits scanned`, `no leaks found`, report `[]`.
- `gitleaks git --config gitleaks-audit.toml` (no allowlist) → `leaks found: 91`, all
  `generic-api-key`; all-refs run identical count (0 unique hits on non-HEAD refs).
- Non-HEAD commits `279c050`/`e1fb7b7`/`0576cc0`/`e040d54` (stash pair + boundary records):
  targeted literal grep → placeholder fixtures only (`sk_live_51UA`, `sk_test_FAKE`,
  `whsec_PLACEH…`); `BEGIN PRIVATE KEY` is a doc mention of the scan class.
- 370 local unreachable commits literal-scanned: same fixtures only; `cbc6ac3` carries the
  revoked invite literal `r6-bf266…` (F-R6DEP.2-2 — already revoked+reminted on prod).
- Targeted `-G` pickaxe + `git grep -o` distinct-literal extraction across all 1,602 commits:
  `sk_live_/sk_test_/whsec_/pk_*/rk_*/re_/AIza/xox*/ghp_/gho_/github_pat_/glpat-/AKIA/PEM` → 0
  real-shape; `sk-ant-*` → 5 placeholder literals; `postgres(ql)?://` → 43 literals all
  placeholder/localhost/fixture; `cs_live_` → 4 real Stripe object ids; `t8exp_` → 3
  expired-by-design fixture tokens; Pulumi `secure:` ciphertext 9+1 blocks.
- PII/internals enumeration (history-commit counts / HEAD file counts): gmail 42/47, `+r6lch1`
  4/11, `/Users/stevenvitali` 9/7, `10.46.0.3` 43/45, `10.8.16.` 43/41, `10.8.240` 6/4,
  `rhema-507501` 237/159, `25012989319` 34/22, `gserviceaccount` 20/23, `prv-<n>-test` 16/14,
  `buy.stripe.com` 26/33; commit-author emails: `14stevevitali@gmail.com`, `svitali@foursquare.com`.
- Workflow fork-safety: ci.yml `on: push(main)/pull_request/workflow_dispatch`, perms
  `contents:read actions:read pull-requests:read`, `pull_request_target` absent repo-wide;
  journeys.yml `on: schedule/workflow_dispatch` only.
- Verification: see below.

## Evidence report

(to be filled at close — PR body derives from it)
