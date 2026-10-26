# R6POST.1 — Prod arms on the deployed tip: 6 of 7 discharged, REQ-POST-8 honestly re-owed ($0)

## Summary

Runs every merge+deploy-bound production verification arm on the deployed tip
**`dc7fb15a0aa7caa5d47734656d06514d5b75b127`** with SHA-matched committed evidence — and
discharges six deferral rows that were waiting on exactly this window. **$0 real metered
spend** (journey reports `weeklyMeteredUsd:0` ×3; system-role guard read confirms **0 real
`usage_records` rows this ISO week** after REQ-ECON-6's `req_jrn_` exclusion). No
product-code change: the only source diff is journey registry `T8` flipping `red → green`
on live evidence. This PR **stacks on `stevevitali/r6inf-1-infra-posture`** and is
**unmerged (OPERATOR)**.

## Per-leg verdicts

| Req | Verdict | Evidence (`docs/build/reports/2026-10-22_R6POST.1/`) |
| --- | --- | --- |
| REQ-POST-1 SSR re-proof | **PASS** | `journeys-ssr/` — `--expect-renderer ssr` + `--expect-sha dc7fb15…`: N2.invite / N10 / P1.public all PASS, zero renderer violations, `consoleErrors:[]`. Signed-in suite adds the rest of the arm: N4 phone-UA uncapped pane, N8 edit POST, R10 seam conformance, X1.* isolation controls, P1.* SSR family — all PASS same SHA |
| REQ-POST-2 signed-in | **PARTIAL** | OAuth initiation PASS (real Google authorization payload, `redirect_uri=…/api/auth/callback/google`, PKCE S256 — `post2-probes.txt`). Token-expiry surface PASS: action-token malformed→400 / bad-signature→400 / **expired→410 `expired_or_consumed`** (forged-HMAC-over-expired-row, zero-write consume); magic-link bogus→302 `?error=INVALID_TOKEN`. **Two honest carries**: invite-accept → prod serves open-mode, `invites`=0, `RHEMA_INVITE_CODE` unset — stays owed on the operator mint (**D-SEC.2-1**); mailto → legal pages ship approved-draft placeholders with `LEGAL_DETAILS.CONTACT_EMAIL=null`, no `mailto:` exists — operator/legal content gate (R6CNT.2 / HUMAN-H11) |
| REQ-POST-3 deep-link | **PASS** | `GET /p/jrn-bl78-mooted/f/:fid` → 302 → `/review/:runId#finding-…`; dossier landed with the anchor in-viewport inside the findings pane, `consoleErrors:[]` (`post3-post5-probes.json` + `post3-deeplink.png`) → **D-CAP.1-1 DONE** |
| REQ-POST-5 fixtures | **PASS** | T8: bogus→404, minted backdated token→**410 `export_link_expired`** (registry flipped green). BL-78 mooted-defer → **409 `obligation_not_routable`** ×2 (mooted + discharged), zero `dispositions` writes (`post5-mooted-probes.txt`). Entitlement render: matched `review/standard/base`→`Included`+hidden `entitlementId`; mismatched `review/quick/base`→funded 619-cr estimate, no `data-included` (`post5-entitlement-*.png`). T3 export/import round-trip parity PASS in-suite |
| REQ-POST-7 usercontent | **PASS** | `usercontent-verify.json` — minted through the **real api route** (`GET /usercontent/sign`, tenant check + `signBlob`): unauth mint→401, unsigned→403, signed→200 `attachment`/`octet-stream`/no `Set-Cookie`, tampered→403, expired→400 → **D-R5OPS.1-2 DONE** |
| REQ-POST-8 SSE p95 | **RE-OWED (honest)** | **0 post-deploy `slo_samples{event_delivery_ms, tail}` rows** — the window does not exist to measure; tail samples mint only from real run traffic and none has occurred since deploy. Dated re-owal on **D-SLO.1-6**: first ≥50-sample post-deploy window reads p95 ≤2,000 ms (funded wave / organic traffic) |
| REQ-POST-9 Lighthouse/axe/funnel | **PASS (agent half)** | Lighthouse `post9/lighthouse-prod-home.json`: all categories 1.00 — **LCP 1.1 s** <2.5, **CLS 0.013** <0.05, TBT 0. axe: 26 passes, **0 violations** (color-contrast = incomplete manual rule). `prefers-reduced-motion`: zero animated elements, hero still visible. Drop-zone→signup→ingest ≤20 s: **N1 + N3 PASS** (N3's ≤20 s conversion-preview assert is in-leg) |

## Production mutations (GD-PREAUTH-ACTS.R6 — both executed)

| Mutation | Dry-run vs itemization | Pre-state | Post-state | Rollback |
| --- | --- | --- | --- | --- |
| `mint-t8-export.mjs --execute` | matched verbatim (1 `account_exports` row, flagged `test+jrn-a` tenant) | 0 rows | `t8exp_1f9832c4b64d445498f4` ready/expired −1d, stub key, hash-only token | `delete from account_exports where id='t8exp_1f9832c4b64d445498f4'` |
| `seed-bl78-fixtures.mjs --execute --entitlement` | matched (mooted dossier + 2 edges + `open→mooted`; entitlement already claimable → no-op) | captured | `jrn-bl78-mooted` substrate live; entitlement untouched | per-script (row deletes) |

Raw T8 token bound only in-process as `JOURNEY_T8_EXPORT_TOKEN` — never committed.

## DEFERRALS dispositions

**Flipped DONE (7):** D-FIX.1-1, D-FIX.1-3, D-STB.5b-4, D-MAINT.3-1, D-CAP.1-1,
D-R5OPS.1-2, D-P1.18-1 (its organic 7-day clock arm re-pointed to **R6CLK.1** per the
ticket). **Dated tails, still open (7):** D-SEC.2-1 (invite mint), D-PRB.01-1 (same
carrier), D-OPS.1-1 (N9 substrate + R10.keepalive residuals), D-SLO.1-6 (unmeasurable
window), D-P1.17-2 (funnel metrics stay HUMAN), D-P1.22-2 ((e)/(f) residuals),
D-SPA.6-1 (re-proved, stays DONE).

## Live findings recorded

- **N9 FAIL = substrate drift, not regression** — prod no longer carries the funded
  tenant the leg seeds against (its contents are proven by GD-FUNDED.1-1); re-owed to
  the funded wave.
- **T5 flake** — "discovery listed 0 items" on the suite pass; isolated
  `--steps T5` retry PASS (`journeys-t5-retry/`). Transient index lag; no code change.
- **R10.keepalive OWED** — expected-red awaiting its first live keepalive event
  (domains-bearing stage, R6POST.2 territory).
- **$12.33 usage rows** at 20:37Z are the R6F leg's `seedDeliveredRunReport` fixture
  marks (`req_jrn_*` provider ids) — REQ-ECON-6-excluded seeded fiction, not spend.
  Guard read proves 0 real rows (`zero-spend-guard.txt`).

## Verification

- `pnpm --filter @rhema/journeys build` + `pnpm --filter @rhema/db build` — green.
- `packages/journeys` vitest (incl. `registry.test.ts` — the T8 flip keeps it green).
- `bash ~/agent-skills/skills/build-memory/scripts/check-build-memory.sh .` — clean.
- `node docs/build/tools/check-append-only.mjs --base bc23409` — OK.
- CI boundary: `ci-boundary.sh --ledger docs/build/LEDGER.md --ticket R6POST.1` →
  `docs/build/logs/ci-R6POST.1.json`.
- Spec §4.6 interpretation note: no literal `/r/:token` route exists — the expiry arm
  ran on the token-link surface family (`/api/action/:token`, magic-link verify,
  export token). Flagged, not silently resolved.

**Requirement ids:** REQ-POST-1 REQ-POST-2 REQ-POST-3 REQ-POST-5 REQ-POST-7 REQ-POST-8 REQ-POST-9
**Merge policy:** OPERATOR — this PR is not merged by the run; it stacks on
`stevevitali/r6inf-1-infra-posture`.
