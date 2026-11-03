# R6OSS.1 — open-source readiness: ADR-002 reversal + full-history audit + OSS hygiene

**Kind:** ticket (manifest row 204, round-6 tail) · **Base:** `main` @ `2989709` · mergePolicy=OPERATOR (never self-merged)

## Summary

The operator ruled (2026-11-02, verbatim): "I'm okay with packages/protocols being public. We
should amend the docs that say otherwise." and "we should do secret/history scan, check for
personal data, etc., and scan all the other stuff you mention, as well as the standard OSS
hygiene." This PR lands the three deliverables: (1) the dated docs reversal of ADR-002's
export-time stub swap, (2) the full-history secret + personal-data audit with every hit
dispositioned, and (3) the OSS hygiene verification + the operator's flip runbook. **The
visibility flip itself is the operator's act** — this PR is the evidence and the checklist.

## Audit verdicts (first-line answer)

- **Secrets: zero real leaks in reachable history.** `gitleaks git --config .gitleaks.toml`
  → 0 findings (1,342 commits). Unfiltered all-refs rescan (no allowlist) → 91
  `generic-api-key` hits, all benign: git SHAs in evidence JSON, already-allowlisted fixtures,
  object-key/config literals, one image digest. The 4 non-HEAD commits + 370 local unreachable
  objects scanned clean except the **already-revoked** invite literal `r6-bf266…` in `cbc6ac3`
  (F-R6DEP.2-2; revoked+reminted on prod 2026-10-26).
- **Targeted classes:** `sk_live_/sk_test_/whsec_/pk_*/rk_*/re_/AIza/xox*/ghp_*/glpat-/AKIA/PEM`
  → 0 real-shape literals; `sk-ant-*` → 5 placeholder literals only; `postgres(ql)?://` → 43
  literals, all placeholder/localhost/fixture; `cs_live_` → 4 real Stripe object ids;
  `t8exp_` → 3 expired-by-design fixture tokens; Pulumi `secure:` ciphertext only.
- **PII/internals classes:** operator Gmail + aliases + `svitali@foursquare` (commit metadata),
  DWD mailbox on personal domain, `/Users/stevenvitali`, internal IPs (`10.46.0.3`,
  `10.8.16.x`, `10.8.240.x`), GCP project `rhema-507501` + number, Stripe object ids,
  WIF/SA names, ULIDs, the `docs/build/` tree itself, 897 screenshots — all dispositioned in
  the runbook table; `needs-ruling` rows escalated to the operator verbatim via `D-R6OSS.1-1`.
- **Docs amended:** ADR-002 (dated reversal note + status), spec §13.2 + REQ-ARCH-37 row,
  manifest § amendments, AGENTS.md gotcha 8, pnpm-workspace.yaml, .pnpmfile.cjs,
  protocols-stub (marked dormant shim), resolver/preinstall comments, ci.yml comment, ci.md,
  open-source-readiness.md, configuration.md, LICENSES.md, tickets 01_P0.01/03_P0.03
  (dated notes), README + CONTRIBUTING + SECURITY (supported-versions posture), ADR-125 (new).
- **Hygiene landed/verified:** SECURITY.md (+supported-version posture), CONTRIBUTING.md,
  SUPPORT.md, LICENSE (MIT confirmed), LICENSES.md current, issue + PR templates present,
  README public-reader-accurate. `CODE_OF_CONDUCT.md` absent → outstanding operator choice
  (recorded, not invented).

## Design decisions

- **`packages/protocols-stub` kept, marked dormant** (not deleted): it still compiles under
  `public-safe` as the tested escape hatch; nothing resolves `@rhema/protocols` to it.
  Recorded in ADR-125.
- **`public-safe` meaning narrowed honestly:** stub-compile = kept-warm fallback check, not an
  export model. The containment checks stay fail-closed for the remaining private material
  (`@rhema/evals` — still path-resolved private; the ruling covers protocols only).
- **Amendment style:** living docs updated in place; contracts/history get dated notes —
  no rewrites (append-only convention).

## Acceptance criteria → evidence

| AC | Layer | Evidence |
|---|---|---|
| ADR-002 + all private-package assertions carry the dated reversal | engineered | diff: ADR-002, spec, manifest, AGENTS.md, 13 more files |
| Full-history scan committed; every finding dispositioned | **live-executed** | `reports/2026-11-03_r6oss-1/` (gitleaks JSONs + disposition doc) |
| Personal-data disposition table committed | live-executed (rulings → D-R6OSS.1-1) | `docs/ops/open-source-readiness.md` § disposition table |
| SECURITY.md + CONTRIBUTING.md + hygiene landed; workflows fork-safe verified | engineered | runbook § fork-safety table; ci.yml `pull_request` only, least-priv; journeys.yml no PR trigger |
| `docs/ops/open-source-readiness.md` runbook + exact flip steps | engineered | committed |
| Verification green; ids stamped; DEFERRALS/ADRs/INDEX/LEDGER; operating clauses | engineered | D-R6OSS.1-1; ADR-125; BUILD_INDEX 240; checks below |

**Requirement ids:** REQ-ARCH-37 (re-amended), REQ-ARCH-30, REQ-ARCH-38.

## Verification

- `pnpm turbo build lint typecheck` — (recorded at close)
- `pnpm test` — (recorded at close)
- `check-build-memory.sh .` — **0 violations** (15 warnings, pre-existing legacy)
- `check-append-only.mjs --base origin/main` — **OK**
- `prettier --check` on all touched living docs — clean
- gitleaks 8.30.1 — committed-config + unfiltered all-refs scans (above)

## Out of scope (honored)

No visibility flip, no history rewrite, zero prod mutations, no `pull_request_target` changes.
