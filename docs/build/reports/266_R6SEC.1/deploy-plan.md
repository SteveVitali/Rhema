# 266_R6SEC.1 — expedited deploy plan (PREPARED, NOT RUN)

**Status:** staged for the operator's **explicit go-ahead** — `GD-SEC.R6` authorizes preparing
this deploy, not running it. **Nothing below has been executed against prod or any stage.**
**Date drafted:** 2026-11-15 · **Worker:** devin-desktop/swe-2-high/subagent · **Payload:** dependency-only
security patch — `better-auth@1.7.2 → 1.7.25` (exact pin) in `apps/api` + `packages/db`; zero source-line,
zero migration, zero config changes. **Why expedited:** RH-0 — GHSA-965c-763c-88jm (CVE-2026-114607 /
CVE-2026-110862, CVSS 9.1 critical): unauthenticated sign-in as any user whose email is known. Prod
`better-auth@1.7.2` matches all three advisory conditions (magic-link plugin on default `storeToken`,
Google social provider enabled, default `"database"` OAuth state strategy).

> **Never exploit-test against prod or any live stage** — the operator's verbatim constraint. No
> verification step in this document exercises the vulnerability; the fix is proven by the pinned
> version, the upstream changelog, and the auth suite.

## 0 · What the deploy must carry

The PR to prod is the merged `main` tip **after this PR merges** (`stevevitali/r6sec-1-better-auth`,
base `main` @ `ae3e4f02`). The diff vs the currently deployed `040e36a9` is:

- `265_R6PRIV.1` merge — docs/`.gitleaks.toml`/AGENTS.md only → deploy-neutral class (allowlist:
  `docs/` + `.gitleaks.toml`).
- The orchestrator handoff commit — docs only (ticket file, manifest row, `GD-SEC.R6` row).
- **This change** — `apps/api/package.json`, `packages/db/package.json`, `pnpm-lock.yaml` →
  **non-neutral**: api image rebuild required. The standard all-10 build is the safest shape
  (`packages/db` is consumed beyond api; a single-image build risks digest skew across services
  that share the lockfile).
- This run's records — `docs/` only.

Services actually carrying `better-auth`: **api only** (`apps/api/src/auth.ts`; `packages/db`
declares the dep for the auth schema types but ships it to no running surface beyond api's adapter).
The all-10 build is still the staged shape — it keeps every service's digest honest to one SHA.

## 1 · Pre-state capture (run at deploy time — 15 min before `pulumi up`)

```bash
# (a) deployed SHAs — record BOTH origins verbatim
curl -s https://rhema.tools/healthz        # expect {"build":{"gitSha":"040e36a9…"}} at time of writing
curl -s https://api.rhema.tools/healthz    # expect same SHA

# (b) the pinned digest set that rollback restores
git show <deployed-sha>:infra/pulumi/Pulumi.prod.yaml > reports/266_R6SEC.1/prestate-Pulumi.prod.yaml
#     (commit the diff of the rhema:serviceImages / runTaskImageDigest / proxyImage lines, never a
#      full stack export — P-1: never commit Pulumi stack exports)

# (c) migration ceiling (system-DSN over the IAP tunnel, BEGIN READ ONLY)
#     select max(name) from _migrations;   -- expect 0063-class; the diff carries ZERO migrations

# (d) pending-verification census for the post-deploy note (read-only)
#     select count(*) from verification where expires_at > now();
#     — these rows (pending magic links + OAuth states) are INVALIDATED by the 1.7.7+ storage change;
#       the count at deploy time bounds the "please re-request" note's blast radius (links expire
#       15 min after issue anyway — MAGIC_LINK_EXPIRES_SECONDS = 900).
```

Pre-state already on record (read 2026-11-15T~23:5xZ, this run — read-only, $0):
`web/healthz` + `api/healthz` = **`040e36a9fd676fe2f9e17e44d87219cf97658c1d`** (the post-262 deploy).

## 2 · The eight conditions — mapped to this deploy

| # | Condition | How it lands for RH-0 |
|---|-----------|------------------------|
| 1 | Owned `pr-<n>` preview walk first, teardown verified | **Run it — do not carry.** A preview with the session-capable recipe (`preview-stack.mjs init → config → resend-pull → up` → migrate Job → `seed-invite` → journeys `--invite-code prv-<n>-test`) is the only place the REAL magic-link + Google OAuth paths can be exercised on 1.7.25 pre-prod — N1/N3-class legs plus `N10`/`R8` smoke, then `destroy` → orphan check → `rm`. This is the high-value leg: the vulnerability lives in the auth surface a preview actually serves. |
| 2 | All-service image build at the tip | Cloud Build trigger all-10 @ merged-`main` tip → `rhema-prod` AR (run-task vendored-SDK asserts must pass). |
| 3 | `pulumi preview --diff` classified | Expected: service image updates + possibly the stateless `rhema-prod-proxy-tmpl` template replace; **zero stateful replace/delete, zero destructive**; migrations none (zero `packages/db/migrations` delta — additive-lint trivially holds); cost Δ ≈ $0 ≤ $15. A mismatch → **PAUSE**, never proceed. |
| 4 | `pulumi up --stack prod` | One-shot; all nodes upgrade together (the 1.7.7 state-format break is why a partial roll is wrong — a mixed 1.7.2/1.7.25 window would read each other's verification rows differently). Cloud Run's revision roll is effectively atomic for this purpose; the ~15-min pending-link window is the only straggler surface. |
| 5 | `check-deploy-provenance` all-PASS | `node scripts/check-deploy-provenance.mjs --expect <merged-sha> --healthz https://rhema.tools --healthz https://api.rhema.tools`. |
| 6 | `deployments` row | `scripts/live/record-deployment.mjs` over the IAP tunnel — `prod:<merged-sha>`, all-10 digests, `protocols_version` unchanged (no protocol content touched). |
| 7 | Rollback recipe committed + corpus-in-web-image in-build assert | Recipe in §3 below; the web image's corpus assert runs in-build as always (payload doesn't touch it, the act is standing). |
| 8 | CDN invalidate `/bff/p/demo~*` | `node scripts/live/cdn-invalidate-demo.mjs --dry-run` (commit output) then the act — standing post-web-deploy step. |

**GD-OPS-RULES.R6 (b) gate:** journeys `N1`/`N3` and the public-page legs must pass before any prod
deploy — run them on the preview (step 1) and re-run `N1`/`N3` + public-page legs on prod after
provenance. A leg that fails but passed in any of its last 7 scheduled runs needs a cited earlier
failing run to classify pre-existing — otherwise it blocks.

## 3 · Rollback recipe

Rollback **re-exposes RH-0** — it returns prod to a vulnerable better-auth. It is an
availability-only escape hatch (e.g. the upgrade breaks sign-in wholesale); prefer a forward fix
under the same ruling.

1. Re-point `infra/pulumi/Pulumi.prod.yaml` `rhema:serviceImages` / `rhema:runTaskImageDigest` /
   `rhema:proxyImage` to the pre-state digest set captured in §1(b) (the `040e36a9` build's digests
   remain in the `rhema-prod` AR repo — no rebuild).
2. `pulumi up --stack prod` — same shape (service rolls).
3. `check-deploy-provenance --expect 040e36a9fd676fe2f9e17e44d87219cf97658c1d --healthz …` all-PASS.
4. New `deployments` row for the rollback event.
5. **Compatibility note (honest):** sessions survive a rollback (session tokens are unchanged
   format). Magic links / OAuth states *issued* under 1.7.25 use the new namespaced/prefixed
   verification identifiers — a 1.7.2 node cannot redeem them, so links minted in the 1.7.25 window
   would fail after rollback (users re-request; bounded by the 15-min expiry). No schema revert:
   zero migrations in this change, `_migrations` untouched.

## 4 · Post-deploy checklist (records-only arms — execute at deploy time)

1. **Pending-link invalidation note** — any magic link or OAuth state issued pre-deploy is dead by
   design (1.7.7 storage change): users re-request, links expire in ≤15 min anyway. Post the
   operator-facing note; no user surface copy ships (no banner mechanism exists for unauthenticated
   callers — the failure mode is a fresh send).
2. **Read-only compromise audit arm** — ask, where evidence exists, whether any session was minted
   since launch (2026-10-28) via an OAuth-state-shaped magic-link redemption. Arms, weakest first:
   - **DB:** `user` rows with `email_verified=true` created through the magic-link path that have no
     corresponding `sign-in/magic-link` send in api logs (the advisory's falsely-verified-account
     class — pre-account-hijack). Also `session` rows whose `created_at` has no proximate
     magic-link send or OAuth callback for that user.
   - **Logs (Cloud Logging, api revisions, ~30-day retention):** `POST /api/auth/magic-link/verify`
     2xx responses whose `token` was never emitted by a `POST /api/auth/sign-in/magic-link` for the
     same email in the window; `sign-in/social` requests carrying attacker-chosen
     `additionalData.email` (our `hooks.before` logs nothing extra — the payload itself is the
     evidence, retention-dependent).
   - **Honest limit:** consumed `verification` rows are deleted at redemption, so pre-upgrade state
     cannot be re-identified after the fact; the audit is best-effort on logs + account-state
     anomalies, never a completeness claim. Report findings; a hit escalates to the operator
     immediately (session revocation via `session` row delete + account review).
   - `signup.completed`/`user` analytics for sign-ups that never requested a link (open mode made
     self-serve sign-up legitimate — this is corroboration, not proof).
3. **`pnpm audit --prod` / OSV gate + security-PR arm** — recorded as follow-up **BL-114**: wire the
   `pnpm audit --prod` + `osv.dev` query into CI (or the nightly) so a GHSA lands as a failing leg
   rather than an external audit finding; the arm also covers the ~99 pre-existing
   dev/transitive advisories the audit already reports (vitest/happy-dom/undici/zod/hono classes —
   none on `better-auth` post-bump).

## 5 · Explicit non-actions (this run)

- **No deploy was run.** No `pulumi up`, no image build, no `record-deployment`, no preview stack.
- **No exploit test** against prod or any stage — ever (operator verbatim).
- `pnpm install` + lockfile regen + the offline suite are the only executed acts; prod contact was
  two `GET /healthz` reads (pre-state capture, read-only, $0) **plus an unintended but sanctioned
  CDN invalidation** — `scripts/live/cdn-invalidate-demo.mjs --help` is unrecognized and ran the
  default act (`/bff/p/demo~*` on `rhema-prod-urlmap-6f2b86e`, the standing S-13 path; cache-only,
  self-healing, no state mutation). Recorded here for completeness; it is the identical call the
  deploy's condition-8 makes anyway.
