# 265_R6PRIV.1 — public-repo artifact cleanup (operator ruling P-1, verbatim)

**Status:** open · **Phase:** post-intervention insert · **Prereqs:** merged `main`; sequenced AFTER the CURRENT STATE repair (landed via #336) and the `262_R6FIX.12` deploy · **Size:** S · **Origin:** operator intervention 2026-11-15 (RHEMA_PRIVACY_PROMPT). Independent sweep found **no live credential** — nothing needs rotating — but artifacts that shouldn't be in a public repo. Re-verify each item before acting.

## Ruling P-1 (verbatim)

Do this with normal commits at HEAD. No history rewrite.

1. **Delete the four Pulumi stack exports** — `docs/build/reports/{2026-10-22_R6DEP.1/prod-preflight, 2026-10-22_R6INF.1, 2026-10-24_proxy-ilb-drill, 2026-10-26_R6DEP.2/prod-preflight}/stack-export-pre.json.gz`. Each holds the full prod resource graph (174 resources: firewall, network, IAM, DNS) + the operator's personal email ×37 (secrets are Pulumi-encrypted). Replace each with a short pointer note: what it was, its sha256, and that it's kept privately. **Copy the originals to a private location outside the repo first, and record where.**
2. **Delete the three unredacted gitleaks reports** — `docs/build/reports/2026-11-03_r6oss-1/gitleaks-unfiltered-all-refs.json` and `2026-11-11_r6oss-1-verify/gitleaks-unfiltered-{head,delta}.json` (~440 entries carrying the email; the "secrets" are commit hashes + fixtures). If the OSS-readiness records need the evidence, regenerate with `--redact` and commit only that.
3. **Remove the two magic-link tokens** from `docs/build/reports/2026-11-08_R7DEP.2/prod-stageb/report.json` (L37, L76) — expired + consumed; replace with `<redacted>`.
4. **Narrow `.gitleaks.toml`** — the blanket `docs/` skip is where prod artifacts land; replace with targeted allowlist entries for the known false-positive classes (commit-hash `api` fields in report.json, expired GCS signed-URL fixtures, test cookies, `PROXY_PLACEHOLDER_*`, the corrupted `Signature=AAAA…` fixture), each justified in a comment. Gitleaks stays green at HEAD.
5. **Standing rule** (AGENTS.md + LEDGER OPERATING MODE): never commit Pulumi stack exports, unredacted scanner output, session/magic-link tokens, or signed-in screenshots of real (non-test) accounts; redact before committing any prod artifact; run gitleaks on the staged diff before every records commit.

## Acceptance

gitleaks with the narrowed config green on HEAD; none of the four .gz, three unredacted reports, or two tokens remain at HEAD; CI green. Normal commits at HEAD only — **no history rewrite**.

## Records

`docs/build/runs/265_R6PRIV.1.md` + `docs/build/pr/265_R6PRIV.1.md`; BUILD_INDEX + LEDGER lines (boundary bookkeeping inside the close commit per R-5); `gh pr create --base main`; `ci-boundary.sh --pr`; `check-append-only --base origin/main` (deletions are expected — name the ruling); `check-build-memory`.
