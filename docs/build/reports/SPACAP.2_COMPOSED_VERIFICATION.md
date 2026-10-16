# SPACAP.2 — composed verification: prod evidence + the ordered merge/deploy runbook

> **SPACAP.2 deliverable.** The composed-verification row (`docs/tickets/141_SPACAP.2__…md`,
> manifest row 141): full journey suite `--expect-renderer spa` on prod, the two-tenant BFF
> probe, the public-surface SSR regression pass, and the zero-CSP browser walk. All four
> acceptance legs are `live-executed` — this document records (1) what was honestly executed
> this run, (2) the proof the rest cannot run yet, and (3) the verbatim recipes + the G1
> (CAPSTONE_GAP_ANALYSIS_SPA.md §4.6, HIGH) merge/deploy ordering the operator follows
> post-merge. Companion deferral rows: `D-SPACAP.2-1..4` in `docs/tickets/DEFERRALS.md`.
>
> $0 — every leg below is a prod READ; no prod mutations, no deploys, mergePolicy OPERATOR.

## 0 — Prod provenance, honestly read (2026-10-10)

Deployed provenance is whatever `/healthz` reports (`build.gitSha`, baked via Dockerfile
`ARG GIT_SHA` → `RHEMA_BUILD_GIT_SHA`; the same field `--expect-sha` compares):

| service | URL | deployed gitSha | vs chain tip `0263581` |
|---|---|---|---|
| web | `https://rhema.tools/healthz` | `6ebb1cb76e14be8bfa6c6dc0731932c9011e6224` | **150 commits behind** — `fix(web): admit accounts.google.com in CSP form-action` |
| api | `https://api.rhema.tools/healthz` | `0acd16d0f6d5af473f28815b7358140d70e39146` | **153 commits behind** — `RES.3: record PR #118 CI …` |

Both SHAs are ancestors of the chain tip (`git merge-base --is-ancestor` verified). **Prod
carries zero round-4 SPA-chain code** — the entire 43-PR stack (#119–#162) is merged nowhere
and deployed nowhere.

Marker vocabulary (arrived with SPA.3, in-chain only): `data-renderer`, `data-mounted`,
`data-route`, `id="spa-root"` are **absent** on `/`, `/login`, `/showcase`, `/pricing`
(curl-verified this run; matches D-SPA.6-1's 2026-10-08 record).

`GET https://rhema.tools/bff/app` → **404** — the SPA BFF read twins do not exist on prod.

## 1 — What ran this run (the executable legs)

Two legs could run honestly against current prod; both ran.

### 1.1 Public-SSR regression — BASELINE half (executed, green)

`node scripts/live/public-ssr-baseline.mjs --web https://rhema.tools` (new, committed) captured
the forever-SSR set — `/`, `/pricing`, `/signup`, `/login`, `/showcase`, `/favicon.svg` —
into `docs/build/reports/2026-10-10_SPACAP.2-public-ssr-baseline/`: `baseline.json` + raw HTML
snapshots. **0 warnings**: every route 200, branded `<title>`, exactly one `<h1>`, full
description/OG/Twitter/icon meta, zero banned copy (`private beta`/`1.x`/`coming soon`),
`/showcase` renders the sample dossier text (`The Politics of Visibility` + `tested`), all
renderer markers absent (correct pre-chain), favicon 200.

This is the BEFORE half of AC3's "unchanged" claim — the post-deploy leg re-runs the same
script and diffs (recipe in §3.3 / D-SPACAP.2-3). It does **not** discharge the AC: the
regression claim is about the deployed chain tip, which does not exist on prod yet.

### 1.2 Harness refusal-path leg (executed — proof the suite cannot lie)

```
node packages/journeys/dist/cli.js --stage prod --steps N10 \
  --expect-sha 02635813ba887b9bb0020e3fbb6b63c80af603db \
  --out docs/build/reports/2026-10-10_SPACAP.2-refusal
```

Result (**exit 1**, recorded): provenance **NO-MATCH** (`expected 0263581…`, observed web
`6ebb1cb…` / api `0acd16d…` — the report carries the full observed map); `N10` **FAIL** —
`settle wait lapsed on https://rhema.tools/: wanted data-mounted — observed
{"route":null,"renderer":null,"mounted":false}`; spend `$0 ≤ $5`. The chain-tip harness
hard-refuses on a markerless deploy at the first document — the fail-closed behavior
D-SPA.6-1 documented is empirically confirmed on prod.

This is evidence, not a defect: N10 is `expected:"green"` only against a deployment carrying
the marker vocabulary; on pre-chain prod the settle contract correctly cannot settle.

## 2 — The G1 ordering constraint (why the recipes are ordered this way)

Per CAPSTONE_GAP_ANALYSIS_SPA.md §4.6 + the 2026-10-08T19:12Z sequencing ruling (the gate binds
activation order, not PR authoring) + REQ-SEQ-10 (≥1 nightly green between flips):

- **Merging ≠ deploying.** PRs merge bottom-up through the stacked chain; nothing activates
  until a deploy. The flip PRs (SPAF.1–14) are one-line stage-fact changes — dormant until
  their SHA deploys.
- **Deploys must activate the flips bottom-up** — each SPAF boundary in chain order, with the
  surface's marker curls + `--surface <key> --expect-renderer spa` leg green, then **≥1
  nightly journey run green on prod** before the next flip's deploy (D-SPAF.*-4).
- **The cleanup wave is point-of-no-return.** SPA.25–SPA.28 (#158–#161) must not merge+deploy
  until the `editor` flip (SPAF.14) has baked ≥1 nightly green — post-SPA.27 the deleted SSR
  documents cannot be flag-restored and post-SPA.28 no request-path renderer consult exists.
  Rollback after that point is `git revert` + redeploy only (D-SPAF.14-3's amended arm).
- **A tip-only deploy is the hazard G1 names**: prod would jump all-SSR → all-SPA in one
  deploy with config-flip rollback already deleted, and every `D-SPAF.*-1/-2` recipe —
  "prove the flip before you delete the fallback" — becomes unfulfillable as ordered.

## 3 — The runbook (verbatim)

### 3.0 Operator prerequisites

- `pulumi login` valid (the prod deploy credential).
- Image build+pin per established procedure: Cloud Build at the deploy SHA →
  `rhema:serviceImages`/`rhema:gitSha`/`rhema:protocolsVersion` pins → `pulumi up` →
  `scripts/live/record-deployment.mjs` → `check-deploy-provenance` PASS.
- Journey legs on prod mint real sessions through `test@rhema.tools` (Gmail DWD —
  `JOURNEY_GCP_ACCESS_TOKEN` or `gcloud auth application-default login`; no
  `rhema-nonprod-resend-api-key` needed — that secret gates `pr-<n>` previews only,
  D-MAINT.6-1). No `--paid` anywhere below ($0 legs only, REQ-VFY-10; the paid suite rides
  the weekly guard's own schedule).

### 3.1 Merge + deploy cadence (Arm A — REQ-SEQ-10 verbatim)

Merge segments bottom-up; **deploy once per segment** at the boundary SHA; between deploys,
the nightly `.github/workflows/journeys.yml` run must go green ≥1 time (D-SPAF.*-4).

| # | merge PRs (bottom-up) | deploy activates | per-deploy verify (all must pass before the next segment) |
|---|---|---|---|
| 1 | #119–#129 (SPA.1–10 + **SPAF.1**) | `usage` | session curls: `/usage`, `/p/<slug>/usage` → `data-renderer="spa"`; `?ssr=1` → `data-renderer="ssr"` (pre-cleanup arm) · `rhema-journeys --stage prod --surface usage --expect-renderer spa --expect-sha <sha>` (D-SPAF.1-2) · nightly green (D-SPAF.1-4) |
| 2 | #130–#132 (SPA.11, MAINT.6, **SPAF.2**) | `inbox` | `/app/inbox` markers + `?ssr=1` arm · `--surface inbox --expect-renderer spa` (D-SPAF.2-2; gate = T2.badge, R8.inbox, X1.inbox) · nightly green |
| 3 | #133–#134 (SPA.12, **SPAF.3**) | `settings` | `/settings` + six `/app/settings/*` markers · `--surface settings --expect-renderer spa` (D-SPAF.3-2; T2.matrix, T3, R8.prefs) · nightly green |
| 4 | #135–#136 (SPA.13, **SPAF.4**) | `voices` | `/voices` `/voices/new` `/v/:persona` markers · `--surface voices --expect-renderer spa` (D-SPAF.4-2; T5, X1.voices) · nightly green |
| 5 | #137–#138 (SPA.14, **SPAF.5**) | `onboarding` | `/app/new` markers · `--surface onboarding --expect-renderer spa` (D-SPAF.5-2; N1, N3, N4, P1.app-new) · nightly green |
| 6 | #139–#140 (SPA.15, **SPAF.6**) | `project-home` | `/app` markers · `--surface project-home --expect-renderer spa` (D-SPAF.6-2; R1, R7, T2.badge, T6, T7, P1.project, X1.home) · nightly green |
| 7 | #141–#142 (SPA.16, **SPAF.7**) | `billing` | `/app/billing*` markers · `--surface billing --expect-renderer spa` (D-SPAF.7-2; N9 free legs) · nightly green |
| 8 | #143–#144 (SPA.17, **SPAF.8**) | `export` + `ide-chrome` (joint flip) | `/p/:p/export` markers; framed surfaces gain `<IdeChrome>` · `--surface export,ide-chrome --expect-renderer spa` (D-SPAF.8-2; R5, T4, T8-owed, P1.project) · nightly green |
| 9 | #145–#146 (SPA.18, **SPAF.9**) | `outline` | `/p/:p/outline` + `/outline/promote` markers · `--surface outline --expect-renderer spa` (D-SPAF.9-2; P1.outline — red-step owed-reporting) · nightly green |
| 10 | #147–#148 (SPA.19, **SPAF.10**) | `figures` | `/p/:p/figures`, `/:figureId`, `/visualize` markers · `--surface figures --expect-renderer spa` (D-SPAF.10-2; P1.figures) · nightly green |
| 11 | #149–#150 (SPA.20, **SPAF.11**) | `run-sheet` | `/p/:p/run` markers · `--surface run-sheet --expect-renderer spa` (D-SPAF.11-2; N4, R7, N9, P1.runsheet) · nightly green |
| 12 | #151–#152 (SPA.21, **SPAF.12**) | `dossier` | `/p/:p/review/:runId` markers · `--surface dossier --expect-renderer spa` (D-SPAF.12-2; N7, T1, T12F/T13F/P1.dossier owed-reporting) · nightly green |
| 13 | #153–#154 (SPA.22, **SPAF.13**) | `run-report` | `/p/:p/r/:runId` markers · `--surface run-report --expect-renderer spa` (D-SPAF.13-2; R6F owed-reporting) · nightly green |
| 14 | #155–#157 (SPA.23, SPA.24, **SPAF.14**) | `editor` — last flip | all five Page GETs (`/p/:p`, `/v/:v`, `/v/:n/diff/:m`, `/a/:artifactId`, `/revisions/:cid`) markers + the REQ-ED-12 forced-SSR posture (phone-UA + `showcase:true` still `data-renderer="ssr"`, `collabWsUrl` withheld) + transport probes (`/doc` POST + collab WS through the SSR `page.js` mount arm) · `--surface editor --expect-renderer spa` (D-SPAF.14-2; N8, P1.pill, P1.project, R7, T2.badge, T6, T7 — all expected:green, a miss FAILS; T17 owed-reporting) · **nightly green — gates the cleanup wave** (D-SPAF.14-4) |
| 15 | **after the editor bake only:** #158–#163 (SPA.25, SPA.26, SPA.27, SPA.28, SPACAP.1, SPACAP.2) | cleanup wave + source mode | pre-deploy: confirm the step-14 nightly green and every `D-SPAF.*-4` honored in order (D-SPA.26-1/-27-1/-28-1 entry gates) · post-deploy: `/assets/outline.js` → 404; phone-UA `/p/:slug/v/working` → `data-renderer="ssr"` + `page.js`/`ide.js` still served; `?ssr=1`/`x-rhema-renderer` inert (converge on the shell); `--pin-renderer` → exit 2 |

Rollback during the window (segments 1–14): revert the flip's stage-fact line + redeploy —
SSR is restored in one deploy (D-SPAF.*-3 arms). After segment 15: `git revert` of cleanup
commits + redeploy only.

**Arm B (recorded fallback — G1's accepted-amendment path).** If the operator elects a single
tip deploy: prod jumps all-SSR → all-SPA in one step; the `D-SPAF.*-1` `?ssr=1` curls and any
`x-rhema-renderer` pin are inert request text (read them as inert-signal checks per
D-SPA.28-2); the per-surface `--expect-renderer spa` legs still all run post-deploy (§3.2's
composed form); rollback is `git revert` of cleanup commits + redeploy. The verification
*order* the flip rows encode is compressed, not skipped — record the election in the deploy
ledger.

### 3.2 AC1 — full journey suite green on prod; `--expect-renderer spa` per surface

After segment 15's deploy, with `<tip>` = the deployed tip SHA:

```bash
# provenance first — refuse to verify a stale deploy:
node scripts/check-deploy-provenance.mjs --expect <tip> \
  --healthz https://rhema.tools --healthz https://api.rhema.tools   # all PASS

# (a) the per-surface renderer assert — one run, all 15 surface keys; the gate subset runs
#     with the renderer assert scoped to the SPA document routes:
pnpm --filter @rhema/journeys exec rhema-journeys --stage prod \
  --expect-sha <tip> --expect-renderer spa \
  --surface usage,inbox,settings,voices,onboarding,project-home,billing,export,ide-chrome,outline,figures,run-sheet,dossier,run-report,editor \
  --out docs/build/reports/<date>_SPACAP.2-surfaces
# exit 0 · zero renderer violations · every gated document reports data-renderer="spa" while
# traversal docs (public funnel, forced-SSR Page arms) keep their own ssr verdict.

# (b) the full free suite on the tip (nightly-shaped; --paid excluded by REQ-VFY-10):
pnpm --filter @rhema/journeys exec rhema-journeys --stage prod \
  --expect-sha <tip> --out docs/build/reports/<date>_SPACAP.2-suite
# exit 0 · every paid:false step pass|owed|ready-to-flip · provenance match · spend $0.
```

Folded-in legs this discharges (per G1): the `D-SPAF.*-2` per-surface prod legs ARE the §3.1
per-segment legs; the gated `expected:"red"` steps (T17 source-mode — SPA.28's re-spec'd leg;
R6F; T12F/T13F; P1.outline/P1.figures/P1.dossier) get their first prod leg inside (a) — a pass
reports `ready-to-flip` and the owner flips them green in `registry.ts` with the report path.
(Their preview legs — `D-SPA.*-1`, `D-SPA.25-1` — stay separately owed behind D-MAINT.6-1;
the prod leg does not discharge a preview leg.)

### 3.3 AC2 — two-tenant isolation probe across SPA BFF reads

On the deployed tip (sessions mint on prod as today):

```bash
# (a) the X1 family through the SPA data path — B's rendered surfaces are served from the
#     /bff/* aggregates; tenant A plants a nonce voice + nonce-titled scratch project ($0 —
#     intent=save only, never intent=build):
pnpm --filter @rhema/journeys exec rhema-journeys --stage prod \
  --expect-sha <tip> --steps X1 --out docs/build/reports/<date>_SPACAP.2-two-tenant
# X1.voices|usage|home|inbox|detail all green: B's docs carry none of A's markers; B opening
# A's /p/<slug> gets ≥400 or a document with no marker content.

# (b) the raw BFF layer (the AC's load-bearing invariant, read directly): with tenant A and
#     tenant B session cookies (minted by the same magic-link path):
curl -s https://rhema.tools/bff/app        -H "Cookie: <A session>"   # 200 — record A's
                                                                     # marker strings
for p in /bff/app /bff/app/inbox /bff/voices /bff/usage /bff/settings/billing; do
  curl -s "https://rhema.tools$p" -H "Cookie: <B session>" | \
    grep -c "<A-marker>"      # must be 0 on every route
done
curl -s -o /dev/null -w '%{http_code}' "https://rhema.tools/bff/p/<a-slug>" \
  -H "Cookie: <B session>"   # ≥400 — the slug→id memo + workspace-scoped listProjects
                             # make a foreign slug a not_found, never a read
curl -s -o /dev/null -w '%{http_code}' https://rhema.tools/bff/app   # no cookie → 401
                                                                     # {error:unauthenticated}
```

### 3.4 AC3 — public surfaces unchanged — SSR regression pass

```bash
# (a) re-run this run's baseline capture against the deployed tip into a SECOND dir:
node scripts/live/public-ssr-baseline.mjs --web https://rhema.tools \
  --out docs/build/reports/<date>_public-ssr-baseline-after
# diff the two baseline.json files: every semantic field must match — status, contentType,
# title, h1Count/h1Text, all meta booleans, bannedCopyHits (empty), showcaseDossier (all true).
# Allowed to differ: markers.dataRenderer (null → "ssr" — the chain stamps SSR docs),
# markers.dataRoute/dataMounted (now present), normalizedSha256 (asset-name churn only —
# eyeball the *.html diffs to confirm nothing else moved), bytes.

# (b) the marker-level leg (D-SPA.6-1's leg-(a) shape, folded in per G1):
pnpm --filter @rhema/journeys exec rhema-journeys --stage prod \
  --expect-sha <tip> --steps N10 --expect-renderer ssr \
  --out docs/build/reports/<date>_SPACAP.2-ssr-regression
# exit 0 — every public document asserts data-renderer="ssr" AND N10's content contract
# (titles/meta/single-h1/no-banned-copy/showcase dossier) is green on the chain code.
```

### 3.5 AC4 — zero-CSP-error browser walk on a real flagged surface

```bash
# (a) every --surface leg in §3.1/§3.2 already IS the walk: the runner captures console errors,
#     pageerrors, failed requests and every asset response per step; assertBundleParity
#     (bundle-parity leg, REQ-TL-13) hard-fails a step on ANY console error — a CSP violation
#     cannot pass silently. On the tip, confirm the §3.2 reports: every result's
#     consoleErrors:[] and failedRequests:[].

# (b) the header contract, read directly (spec §9 — strict CSP retained):
curl -sI https://rhema.tools/app -H "Cookie: <session>"   # a flagged surface document
# content-security-policy: … script-src 'self' 'nonce-<…>' … — no 'unsafe-eval', no
# 'unsafe-inline' in script-src; nonce present per-response.
```

## 4 — Disposition map (the four ACs)

| AC | This run | Owed | DEFERRALS row |
|---|---|---|---|
| AC1 full suite + per-surface `--expect-renderer spa` | impossible — markers absent, provenance NO-MATCH proven (§1.2) | §3.1 cadence + §3.2 | D-SPACAP.2-1 (OPEN) |
| AC2 two-tenant BFF probe | impossible — `/bff/*` 404 on prod | §3.3 | D-SPACAP.2-2 (OPEN) |
| AC3 public SSR regression | **baseline half executed** (§1.1, 0 warnings) | post-deploy diff + `--expect-renderer ssr` leg (§3.4) | D-SPACAP.2-3 (PARTIAL) |
| AC4 zero-CSP walk on a flagged surface | impossible — no flagged surface exists on prod | §3.5 | D-SPACAP.2-4 (OPEN) |
| universal phase-gate AC | met — verification green, records written, PR checks read | — | — |
