# R6OSS.1 — full-history secret scan: findings disposition

**Executed:** 2026-11-03 · **Scope:** all git history (`git rev-list --all` = 1,602 commits,
240 remote branches) + 4 commits unreachable from any ref + 370 local unreachable objects
(pre-rewrite stash/sim commits — included because GitHub can serve pushed unreachable objects
by SHA after a force-push). **Tool:** gitleaks 8.30.1 + `git log --all -G`/`git grep` pickaxe.
**Rule for artifacts:** findings cite prefix/shape, never secret values (manifest § Operating
rules 6).

## Scans executed

| Scan | Coverage | Result |
|---|---|---|
| `gitleaks git --config .gitleaks.toml` | 1,342 commits (HEAD; repo default policy) | **0 leaks** |
| `gitleaks git --config gitleaks-audit.toml` (committed next to this file — default rules, **no allowlist**: the committed config exempts `docs/`, `*.example`, `pnpm-lock.yaml`, `auth.test.ts`, `vendor/`, plus 8 fixture regexes) | all refs | **91 findings, all `generic-api-key`** — dispositioned below |
| gitleaks on each of the 4 non-HEAD commits (`279c050`, `e1fb7b7`, `0576cc0`, `e040d54`) | unreachable-from-HEAD residue (stash pair + two boundary records) | placeholder literals only |
| targeted `-G` pickaxe + distinct-literal extraction | all 1,602 commits for ~30 classes | dispositioned below |
| targeted literal scan of the 370 local unreachable commits | pushed-then-rewritten residue | see §4 |

## Findings by class (every hit dispositioned)

### 1. gitleaks `generic-api-key` hits — 91, all benign

| Class | Count | Disposition |
|---|---|---|
| 40-hex git commit SHAs inside `docs/build/reports/*/report.json` evidence | ~66 | **benign-id** — revision literals, not credentials |
| `test-secret-0123456789abcdef…` Better-Auth fixture | 5 | **fixture** — allowlisted in `.gitleaks.toml`; literal is valueless |
| `quarantine/ws*/up*` object-key literals | 8 | **fixture/benign-id** — GCS key *paths*, not credentials; already allowlisted |
| `journey2026stb5a` CSL cite-key | 1 | **fixture** — already allowlisted |
| `api.pr-212.34.8.177.69.sslip.io` test hostname | 1 | **fixture** — already allowlisted; stack destroyed |
| `fX3QvxfH…` Better-Auth user-id literal | 1 | **fixture** — already allowlisted (user id, not a credential) |
| `ed3f7bbc…` 64-hex container sha256 in provenance file | 1 | **benign-id** — image digest |
| `MAX_USD_PER_RUN=10`, `obligations/new`, `quarantine/01M2V3PM…/` literals | 3 | **benign-id** — config/route/object-key literals |

### 2. Targeted class greps — real-shape literals found

| Pattern | Distinct literals | Disposition |
|---|---|---|
| `sk_live_[A-Za-z0-9]{10,}` / `sk_test_[A-Za-z0-9]{10,}` | **0** — only `sk_live_51UA`, `sk_test_FAKE`, `sk_test_x` placeholders | **fixture** |
| `sk-ant-*` | 5, all placeholder (`sk-ant-placeholder`, `sk-ant-admin-test`, `sk-ant-api03-real-key-xyz`, `sk-ant-api03-…placeholder-not-a-real-key-…`, `sk-ant-admin_placeholder_`). `sk-ant-admin-`/`sk-ant-svc-`/`sk-ant-usr-` class names in LEDGER prose are prefix mentions, not values | **fixture** |
| `whsec_[A-Za-z0-9]{10,}` | **0** — `whsec_PLACEH…`/`whsec_test`/`whsec_signup`/`whsec_other` only | **fixture** |
| `pk_live_*` / `pk_test_*` / `rk_*` | **0** real-shape; `pk_test_` is prose-only | clean |
| `re_[A-Za-z0-9]{16,}` (Resend) | **0** | clean |
| `AIza[0-9A-Za-z_-]{30,}` (GCP API key) | **0** | clean |
| `xox*`/`ghp_`/`gho_`/`github_pat_`/`glpat-`/`AKIA…`/`BEGIN * PRIVATE KEY` | **0** (the `BEGIN PRIVATE KEY` string occurs only as a doc mention naming the scan class) | clean |
| `postgres(ql)?://` with userinfo | 43 distinct literals — every one a placeholder (`<pw>`, `…`, `${var}`), localhost/CI fixture (`postgres:postgres@localhost…`, `postgres:postgres@127.0.0.1:55432`), or test fixture (`pw@10.0.0.9`, `pw123@10.0.0.5`) | **fixture/placeholder** — no real credential ever committed |
| `cs_live_[A-Za-z0-9]{10,}` | 4 literals (3 full, 1 truncated prefix) | **real Stripe object ids** — see §3 needs-ruling |
| `cs_test_[A-Za-z0-9]{10,}` | **0** full literals at HEAD/history (class mentions only) | clean |
| `t8exp_[a-f0-9]{10,}` | 3 literals | **benign-id** — journey-minted export tokens on the `is_test` tenant, minted already-expired for the 410 arm (they carry no access); recorded |
| Pulumi `secure:` blocks | 9 in `Pulumi.prod.yaml` (+ dev/pr yamls clean of plaintext) | **safe** — Pulumi ciphertext, not plaintext secrets |
| `rhema:opsAlertWebhookUrl` | present only as `secure:` ciphertext | **safe** |
| `googleOauthClientId` `25012989319-…apps.googleusercontent.com` | 1, plaintext | **stays** — OAuth client ids are public-by-design (they travel in authorize URLs) |
| `buy.stripe.com/14AaEQbU030E61k5D7a7C00` live Payment Link URL | 1 (+ `test_` twin on pr-230 yaml) | **stays** — a published customer-facing URL, not a credential |

### 3. Real Stripe object ids at HEAD (not secrets — identifiers of real account objects)

`plink_1UH99P…`, `plink_1UVxKU…` (TEST-mode, deactivated 2026-11-03 R6HRD.1), `sub_1UVF6l…`,
`evt_1UVF7T…`, `evt_1UVKN7…`, `we_1UH99C…` (live webhook endpoint id), `prod_VX1NQq…`,
`price_1UVxKU…`, `pi_3UIWBo…`, `pi_3UIaAy…`, `cs_live_…`×4 → all in `docs/build/` records.
**Disposition: needs-ruling** (class in the personal-data table — Stripe object ids are
unusable without `sk_live`, which never touched the repo, but they enumerate real
transactions/products).

### 4. Unreachable-object residue (visibility-flip-specific)

- **`cbc6ac3`** — the F-R6DEP.2-2 leaked-invite commit (pushed, then branch rewritten). Its tree
  carries literal invite code `r6-bf266…` — **the value was already revoked + reminted on prod**
  (LEDGER line ~777: `revoked_at` stamped, replacement handed to operator in-band only).
  Disposition: **mitigated — needs-ruling note** (the literal is valueless since revocation;
  decision whether to ask GitHub to GC unreachable objects before the flip is the operator's).
- The 369 other local unreachable commits are `sim`/`x`/WIP stash objects (mostly never pushed).
  Targeted literal scan: see run ledger §Evidence log for the full-pattern sweep result.
- **Note:** `git clone`/`git rev-list --all` does not fetch unreachable objects; the exposure is
  GitHub serving a *pushed* object by SHA. `cbc6ac3` is the known pushed case.

### 5. Invite codes, webhook URLs, DWD material, WIF

- Invite codes: `prv-<n>-test` deterministic preview codes in docs/records (14 files) —
  **benign** (non-secret by design, destroyed stacks). Operator-minted `r6-*` codes were
  env-only; the one committed literal (§4) is revoked.
- Webhook URLs: none committed (no `hooks.slack.com`/Discord/etc.); the ops-alert webhook is
  `secure:` ciphertext only.
- DWD mailbox material: `rhema-test-tenant-mailbox@stevenvitali.com` (1 file) — an identity, not
  a credential (DWD uses IAM `signJwt`; no key exists). → **needs-ruling** (personal-domain
  identity, personal-data table).
- WIF: `JOURNEY_WIF_PROVIDER` lives in repo `vars` (not committed); provider/SA names
  (`*@rhema-507501.iam.gserviceaccount.com`, `p25012989319-…@gcp-sa-cloud-sql.iam.gserviceaccount.com`)
  in 23 files → **needs-ruling** (internals class).

## Verdict

**Zero real secrets found in reachable git history.** Every secret-shaped literal is a fixture,
placeholder, benign identifier, revoked invite, or ciphertext. The residual exposure classes are
identifiers + personal data (§3, §4, §5), dispositioned in the runbook table —
`docs/ops/open-source-readiness.md`.
