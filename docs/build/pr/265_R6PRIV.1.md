# 265_R6PRIV.1 — public-repo artifact cleanup (operator ruling P-1)

**Base:** `main` · **Branch:** `stevevitali/r6priv-1-cleanup` · **mergePolicy:** OPERATOR (this run never merges, never deploys) · **Normal commits at HEAD — no history rewrite** (ruling literal, GD-PRIVACY.R6)

## What & why

The repo is public; an independent sweep found no live credential but artifacts that
don't belong in a public tree. Ruling P-1 names five items — all executed.

## Items

1. **Four Pulumi stack exports deleted** (`stack-export-pre.json.gz` under
   `2026-10-22_R6DEP.1/prod-preflight`, `2026-10-22_R6INF.1`,
   `2026-10-24_proxy-ilb-drill`, `2026-10-26_R6DEP.2/prod-preflight`) — each carried
   the full prod resource graph (174–178 resources) + the operator email ×37.
   Originals copied byte-identical to `~/agent-scratch/private-artifacts/2026-11-15_r6priv/`
   (outside the repo, sha256-verified); each replaced by `stack-export-pre.REMOVED.md`
   (what it was, sha256, private path).
2. **Three unredacted gitleaks reports redacted in place** — `Email` class verified on
   every finding (91/220/129); `Secret`/`Match` literals + `Email` → `REDACTED`, exact
   original finding sets preserved (the recorded rescan ranges are unrecoverable
   post-prune/post-merge — judgement call recorded in both disposition docs).
3. **Two magic-link tokens masked** — `2026-11-08_R7DEP.2/prod-stageb/report.json`
   L37 + L76 → `token=<redacted>`; JSON re-validated.
4. **`.gitleaks.toml` narrowed** — the blanket `docs/` skip replaced by targeted
   entries, each justified by a verified full-history finding class (scanner-report
   self-hits path entry; `^[0-9a-f]{40}$`/`{64}$` provenance SHAs; env-name, quarantine
   object-key, doc-path literals). `gitleaks git` over full history: **0 leaks,
   1,753 commits**. Non-firing ruling-named classes (GCS signed URLs, cookies,
   `PROXY_PLACEHOLDER_*`, `Signature=AAAA…`) documented in the run record.
5. **Standing rule committed** — `AGENTS.md` § Launched posture + LEDGER OPERATING
   MODE (P-1 bullet) + `GD-PRIVACY.R6` gate row (verbatim).

## Verify

- `gitleaks git --config .gitleaks.toml` → **0 leaks** (1,753 commits, report `[]`)
- `git ls-files` — none of the four `.gz` / three unredacted reports / two token values at HEAD
- `node docs/build/tools/check-append-only.mjs --base origin/main` — see run record (deletions are ruling-named, expected)
- `ci-boundary.sh --pr` — boundary recorded at the PR head
- spend $0 · no secrets/user-data committed — the removed artifacts live only in the private path

## Records

`docs/build/runs/265_R6PRIV.1.md` (per-item verification, sha256s, private path,
allowlist table, judgement calls) · `docs/build/pr/265_R6PRIV.1.md` · BUILD_INDEX ·
LEDGER (CURRENT STATE + GD-PRIVACY.R6 + P-1 operating-mode bullet) · manifest row 265
(aligned to the #339 insert verbatim).
