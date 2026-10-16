# SPACAP.2 — run ledger: capstone composed verification (the prod legs + the ordering runbook)

- **Ticket:** `docs/tickets/141_SPACAP.2__capstone-composed-verification.md` (manifest row 141)
- **Branch:** `stevevitali/spacap-2-composed-verification` — forked from
  `stevevitali/spacap-1-capstone-gap-analysis` @ `0263581` (the chain tip).
- **PR:** #163 against `stevevitali/spacap-1-capstone-gap-analysis` (impl tip `6e7dc48`);
  `gh pr checks --watch=false` read once at closeout (§ 7).
- **Harness:** devin-cli subagent (per the 2026-10-08T23:05Z dispatch-tier ruling).
- **Mode:** verification + documentation, $0 — prod READS only, no deploys, no prod
  mutations, mergePolicy OPERATOR.
- **Spend:** `paid:false` legs only; no metered spend ($0).

## 1 — What prod actually is (provenance, honestly read)

`/healthz` `build.gitSha` is the deploy-provenance field (`--expect-sha` compares it;
`scripts/check-deploy-provenance.mjs` is the standalone gate):

- web `https://rhema.tools/healthz` → `6ebb1cb76e14be8bfa6c6dc0731932c9011e6224`
- api `https://api.rhema.tools/healthz` → `0acd16d0f6d5af473f28815b7358140d70e39146`

Both are ancestors of the tip (`git merge-base --is-ancestor` both ways): web is 150 commits
behind `0263581`, api 153. **Prod carries zero round-4 chain code** — all 44 PRs (#119–#163,
this one included) are unmerged/undeployed.

Marker probes (curl, this run): `data-renderer`/`data-mounted`/`data-route`/`id="spa-root"`
absent on `/`, `/login`, `/showcase`, `/pricing` — the SPA.3 marker vocabulary never deployed
(matches D-SPA.6-1's 2026-10-08 record). `GET /bff/app` → **404** — no BFF twins on prod.

## 2 — What landed

- **`scripts/live/public-ssr-baseline.mjs`** (new, committed) — the public-surface SSR
  baseline probe: per route, status/content-type/title/h1/meta presence/banned-copy scan/
  renderer markers/showcase-dossier text + a nonce/CSRF-stripped normalized sha256 + raw HTML
  snapshot. Re-runnable verbatim post-deploy for the regression diff (the recipe names it).
- **`docs/build/reports/2026-10-10_SPACAP.2-public-ssr-baseline/`** — the captured baseline
  (`baseline.json` + 5 HTML snapshots), **0 warnings** — every public route green on the
  N10-contract fields. This is the BEFORE half of AC3.
- **`docs/build/reports/2026-10-10_SPACAP.2-refusal/`** — the tip-harness run against current
  prod (`--steps N10 --expect-sha 0263581…`): **exit 1**, provenance NO-MATCH (observed map in
  `report.json`), N10 FAIL `settle wait lapsed … wanted data-mounted — observed
  {"route":null,"renderer":null,"mounted":false}`. The fail-closed refusal D-SPA.6-1
  predicted, proven live. $0, sessionless, read-only.
- **`docs/build/reports/SPACAP.2_COMPOSED_VERIFICATION.md`** — the ordered merge/deploy
  runbook (G1's resolution): §3.1 the 15-segment merge/bake/deploy cadence (14 flip segments
  + the post-bake cleanup wave), §3.2–3.5 the verbatim per-AC recipes, §4 the disposition map.
- **DEFERRALS `## SPACAP.2`** — four rows (D-SPACAP.2-1..4), one per live AC, each carrying
  the verbatim recipe + the G1 ordering constraint; D-MAINT.6-1/D-OPS.1-1 referenced
  (preview-leg blockers), not duplicated.

## 3 — AC accounting

| AC | disposition |
|---|---|
| Full suite green on prod; `--expect-renderer spa` per surface | **DEFERRED → D-SPACAP.2-1** (markers absent; refusal run proves the suite cannot green on this deploy; recipe §3.2 + cadence §3.1) |
| Two-tenant isolation probe across SPA BFF reads | **DEFERRED → D-SPACAP.2-2** (`/bff/*` 404 on prod; recipe §3.3 — X1 family + raw cookie curls) |
| Public surfaces unchanged — SSR regression | **PARTIAL → D-SPACAP.2-3** (baseline captured this run, 0 warnings; the post-deploy diff + `--expect-renderer ssr` N10 leg owed — D-SPA.6-1's leg-(a) shape folded in per G1) |
| Zero-CSP browser walk on a real flagged surface | **DEFERRED → D-SPACAP.2-4** (no flagged surface exists on prod; recipe §3.5 — every `--surface` gate leg is the walk + the CSP header probe) |
| Universal phase-gate AC | met — green gate §4; DEFERRALS rows appended same-run; append-only preserved; PR checks read once (§7); no REQ ids (process/capstone row); AC layers stated |

## 4 — Verify (run this session)

- `pnpm --filter @rhema/journeys build` — clean (tsc -b).
- Live legs (§1): baseline probe 6/6 routes green, 0 warnings; refusal run exit 1 with the
  expected NO-MATCH + settle-lapse; `/bff/app` 404; marker curls absent on 4/4 surfaces.
- `pnpm turbo build lint typecheck` — **135/135 tasks** green (full turbo).
- `pnpm test` — **5,549 pass / 6 skip / 0 fail** (487 files passed, 2 skipped).
- `pnpm check:licenses` — OK (822). `check:protocol-markers` — OK (248 files).
  `check:no-cookies` — OK (253). `check:spa-budget` — all ceilings held.
  `check:spa-env` — OK (111 sources, 146 artifacts). `check:dom-contract` — OK
  (journey selectors ⊆ manifest ⊆ emitted+asserted).
- `pnpm vitest run scripts/check-coverage-matrix.test.mjs` — 6/6 green;
  `node scripts/check-upstream-diff.mjs` — OK (22 ported files).
  *(Docs + one dependency-free `.mjs` script — no production code paths touched.)*

## 5 — Deferrals

Opened: **D-SPACAP.2-1/-2/-4 OPEN, D-SPACAP.2-3 PARTIAL** — the four live ACs, blocked on
prod carrying the chain (the §3.1 ordered merge/deploy sequence). Closed: none — every row
this run probed (`D-SPA.6-1`, `D-SPAF.*`, `D-MAINT.6-1`, `D-OPS.1-1`) stays OPEN unchanged;
their live debts are folded into the runbook's recipes where the four ACs are the right home
(per SPACAP.1 G1/G3), without rewriting any landed row.

## 6 — Deviations / owned decisions

1. **Executed the executable half instead of a pure-deferral row.** The instruction allowed
   an honestly-runnable leg: the public-SSR baseline ran (it's the BEFORE half the regression
   diff needs regardless), and the harness refusal run was executed as *evidence* — it proves
   the suite's fail-closed posture on a stale deploy rather than fabricating a leg. N10's
   FAIL is recorded as the predicted refusal, not a prod defect (the step is green only
   against marker-carrying deploys).
2. **Runbook placement under `docs/build/reports/`** — same allowlist reasoning as
   SPACAP.1's capstone doc (the build-memory root allowlist admits no second top-level
   document; `reports/` is the committed-evidence subtree).
3. **Ordering encoded, not invented.** §3.1 restates the 2026-10-08T19:12Z ruling +
   REQ-SEQ-10 + `D-SPAF.*-4` gates as a mechanical merge/deploy table; Arm B (tip deploy)
   is recorded as the fallback G1 named, with its compressed-verification consequence stated.
4. **New script is a probe, not a gate** — `public-ssr-baseline.mjs` exits 0 and WARNs rather
   than failing, since it captures baselines on deploys whose state it must describe
   truthfully; the diff rule (what may/may not move) lives in the recipe, not the script.

## 7 — Validators + PR checks

- `bash ~/agent-skills/skills/build-memory/scripts/check-build-memory.sh .` —
  **no violations** (7 warnings, all pre-existing classes — same set as SPACAP.1's run:
  manifest banner coverage, gate-cell wording, nextTicket-vs-GATE-G2, phase-log line
  budget, legacy index status values, readout guard sentence, `Harness:` headers on old
  ledgers — this ledger carries the header).
- `node docs/build/tools/check-append-only.mjs --base 0263581` — **OK** (run post-commit
  on the impl commit `6e7dc48`).
- `gh pr checks 163 --watch=false` (2026-10-10T07:35Z) → **"no checks reported on the
  'stevevitali/spacap-2-composed-verification' branch"** — the chain's recurring
  first-read class (same as #140–#162); the inherited `integration`/privsep red, if it
  reports later, is waived per GD-MAINT.4-1 (classified, not repaired).
