# FUNDED.1 — Funded-window wave (the paid-leg sweep) — run ledger

- **Spec:** `docs/tickets/167_FUNDED.1__funded-window-wave.md` (manifest row 167, round 5 —
  **expanded at run time** from `Kind: skeleton` per `decompose-spec mode=extend`, scoped to
  the GATE-R5F disposition)
- **Normative loads:** `docs/build/readouts/GATE-R5F.md` (disposition **"PASSED — open the
  window"**, 2026-10-16T18:5xZ); `docs/post-spa-disposition-spec.md` §5 + §5.6;
  `docs/research/r5_f1_funded-census.md`; `docs/tickets/DEFERRALS.md` (the funded-row ledger);
  `docs/build/runs/R5ECON.3.md` (the regime + committed drivers);
  `docs/build/runs/FUNDED-2026-10-06-A.md` (tenant-funding + purge lessons)
- **Base:** `stevevitali/verif-2-preview-legs` tip @ `9dcfcf9` (the GATE-R5F disposition commit)
- **Branch:** `stevevitali/funded-1-funded-window-wave` (mergePolicy=OPERATOR — never merge)
- **Harness:** devin-desktop/swe-2-high/subagent · **Skills:** implement-spec + decompose-spec +
  build-memory @ `~/agent-skills`
- **Requirement ids stamped:** REQ-FND-1..8 · REQ-ECON-6 REQ-ECON-7 REQ-ECON-9 REQ-ECON-11
- **Authorization:** GATE-R5F PASSED — the ~$60 re-authorized round envelope (Q-ECON.f),
  pinned spend scope (flagged-tenant `source='proxy'`, `req_jrn_%` excluded), levered §5.3 caps,
  ~$20–40 estimated actual. Production mutations: journey tenant provisioning + paid model
  runs ONLY; the mechanical guard fails closed regardless of the disposition.
- **Deployed SHA:** `ffbb8ad01b4383ab7f11088c8427b668bc442b01` on api+web `/healthz`
  (`--expect-sha ffbb8ad` — the documented non-repo-sha divergence stands per VERIF.1).
- **Started:** 2026-10-16T19:05Z · **Closed:** 2026-10-16T??Z
- **PR:** TBD · **ci:** TBD
- **provided:** system-DSN password **yes** (Secret Manager `rhema-prod-alloydb-password`, never
  logged/committed) · session cookie **n/a** (never minted — no dispatch) · `RHEMA_OPERATOR_ID`
  **n/a** (no house-grant executed — see §Outcome)

## Deferrals read

`docs/tickets/DEFERRALS.md` read first (protocol — AGENTS.md). The funded-carrier rows the wave
was contracted to discharge are enumerated in the expanded contract's wave table (D-CAP.2-1
umbrella; D-RES.1-2/-3; D-P1.21-2; D-P0.15-3; D-P1.19-1 residuals; D-CAP.1-1; D-FIX.1-2
residual; D-P1.14-1; D-PRB.02-3 fetcher half; D-STB.5b-3/-4/-5; D-MAINT.3-1; D-FIX.1-3;
D-P1.11-1; D-DEF.1-1; D-CITE.1-2/-3/-5; D-ECON.2-2/-3). **None discharged** — see §Outcome;
every row stays OPEN under its existing carrier, and D-CAP.2-1's status cell carries the dated
exhaustion note.

## Outcome — the envelope was exhausted at bind; zero spend, zero prod writes

**Headline: the §5.5 mechanical guard refused every dispatch — pinned-scope cumulative
$80.86 ≥ the ~$60 re-authorized cap. Per the task's stop rule and the readout's own reading
("every dispatch refuses and the finding is reported, not spent past") the wave did not run.
$0 metered this window; no production mutation of any kind.**

| item | state | evidence |
|---|---|---|
| Contract expansion (decompose-spec mode=extend) | **done** — full wave enumeration + dispatch plan + ACs | commit `69f2ea7`; `167_FUNDED.1__funded-window-wave.md` |
| System-role DSN bound over IAP tunnel | **done** — `127.0.0.1:15433` via `rhema-prod-proxy-3ms6`; `current_user=postgres`, `rolsuper|rolbypassrls` true, `_migrations`=58 | `funded-query.mjs` role probe |
| Checklist `cumulative` row | **FAIL CLOSED — $80.86 / 2,430 flagged-tenant proxy rows since 2026-10-01 ≥ $60** | `reports/2026-10-16_funded-env/checklist-dryrun.txt` |
| Checklist `tenant` row | **FAIL CLOSED — `test+jrn-a@rhema.tools` absent (reaped)** | `reports/2026-10-16_funded-env/funded-tenant-probe.txt` |
| Checklist `dsn`/`headroom`/`caps`/`ordering`/`exclusions`/`optouts`/`unpaused` | **PASS ×7** (headroom $54.50 declared = Σ caps of all 21 legs) | same |
| 21 registry legs dispatched | **none — guard refuses pre-dispatch** (`cumUsd ≥ ROUND_CAP` → exit 3) | dry-run output; driver code path |
| §5.6 census legs | **none — same refusal; the $0 read-only items were not run because the window itself is what they ride** | — |
| Tenant provisioning + house-grant | **not executed** — pointless under a dead envelope; minting 10k cr on a wave that cannot dispatch is not honest provisioning | `funded-tenant.mjs` dry-run print (no `--execute`, no `admin-cli` call) |
| Spend | **$0.00** (pinned scope unchanged at close — re-measured $80.86 / 2,430 rows) | `iso-week.json` ($0.00 ISO-week), `cumulative-by-*.json` |

### The measured finding (what the operator needs to rule on)

`funded-window.mjs --stage prod --dry-run` with the system DSN + `JOURNEY_FUNDED_STABLE_TAG=a`:

- **Pinned scope since 2026-10-01: $80.86 over 2,430 rows** — by day: 10-01 $11.56 (276),
  10-02 $38.16 (1,069), 10-03 $8.36 (330), 10-06 $22.78 (755). **ISO-week: $0.00 / 0 rows**
  — nothing has spent since Oct 6.
- By flagged workspace: `01M3V0VJ74…` $27.87 (the 10-01 jrn-a — JOURNEY.1/CITE/ECON-era legs),
  `01M48PTEXD…` $17.48 (window-B jrn-a), `01M3YJGDX7…` $15.70 (10-02/03 RPT.1/DEF.4-era),
  `01M40A8M1Y…` $7.19, `01M49CFJXD…` $5.30, `01M3Z532GC…` $4.81, `01M3Y30T1P…` $2.51.
- **Reading:** the ~$60 re-authorization (Q-ECON.f) was ruled against the *old unfiltered*
  query's $145.95 history. On the pinned scope the same 10-01→10-06 history measures **$80.86**
  — also above $60. Under the default `FUNDED_WINDOW_SINCE_DEFAULT=2026-10-01` epoch the
  envelope is exhausted *before* this window's first leg; every dispatch exits 3.
- **The operator-decision paths (named, not self-authorized):** (a) re-authorize a *new*
  envelope — `FUNDED_ROUND_SINCE=<window-open-date>` re-epochs the cumulative so only new
  spend counts; (b) raise the cap (`FUNDED_WINDOW_CAP_USD`); (c) accept the wave stays owed.
  All three are operator rulings — the worker never overrides the guard.

### What did NOT happen (and why it is honest)

- **No leg ran.** A refusal is a finding, not a failure — the wave's 21 registry legs + all
  census items stay `owed`/carried. No green was fabricated.
- **No tenant provisioning / house-grant.** `funded-tenant.mjs` probe shows jrn-a absent
  (user+workspace reaped). Provisioning + a 10k-cr grant exists *only* to serve paid launches;
  executing it under a refused window would mint credits on a tenant that cannot legally run
  one leg — left unexecuted, the dry-run print preserved verbatim.
- **No `--execute`, no `admin-cli`, no seed scripts, no `FUNDED_ROUND_SINCE` override.** The
  env re-epoch knob exists but setting it is a re-authorization the operator owns.
- **No DEFERRALS flips.** Nothing was discharged — every funded row stays OPEN; D-CAP.2-1's
  status cell gained the dated exhaustion note (its carrier for the re-authorized retry).

## Execution log

### 2026-10-16 — expansion + env-bind + measured refusal

- `19:0xZ` — contract expanded (`decompose-spec mode=extend`) + committed `69f2ea7`; branch
  `stevevitali/funded-1-funded-window-wave` forked at `9dcfcf9`.
- `19:1xZ` — IAP tunnel up (`127.0.0.1:15433`); system DSN bound; `pg_roles` probe PASS.
- `19:2xZ` — `--dry-run --headroom 54.5` → **7/9 rows pass**; `cumulative` FAIL ($80.86 ≥ $60),
  `tenant` FAIL (jrn-a absent). Per the contract's stop condition: **STOP — do not spend.**
- Breakdown queries committed (`cumulative-by-workspace.json`, `cumulative-by-day.json`,
  `iso-week.json`); funded-tenant probe committed read-only.
- Verification: `turbo build lint typecheck` 135/135 · `pnpm test` **5,814 pass / 4 skip /
  0 fail** (502 files) · `check:licenses` / `check:protocol-markers` / `check:no-cookies` /
  `check:spa-budget` / `check:spa-env` / `check:dom-contract` all green · focused funded-window
  suites (`scripts/live/funded-window.test.mjs`, `window-plan.test.ts`, `registry.test.ts`,
  `stb5b.test.ts`) green inside the suite run.

## Gap table (final)

| requirement / AC | achieved-layer | evidence | state |
|---|---|---|---|
| expand contract + branch + seed ledger | engineered | `69f2ea7`, this file | **met** |
| `dsn` row — system DSN + `pg_roles` bypass | live-executed | role probe JSON | **met** |
| `cumulative` row — measured vs ~$60 | live-executed | `checklist-dryrun.txt`, breakdown JSONs | **refused — envelope exhausted** |
| `headroom` — declared + covers Σ caps | live-executed | dry-run (`$54.5 declared vs $54.50 required`) | **met** |
| `tenant` — funded stable tenant seeded + purge-exempt | — | `funded-tenant-probe.txt` (absent; not provisioned — refused window) | **carried — D-CAP.2-1** |
| 21 registry legs in checklist order | — | none dispatched | **carried — D-CAP.2-1 (envelope exhausted; operator re-authorization or re-epoch)** |
| §5.6 census legs (RES.1 excerpt, BL-20, BL-78, CITE probes, ECON.2 pairs, ADR-086 read) | — | none executed | **carried — same carrier** |
| DEFERRALS flips on evidence | n-a | none discharged → zero flips (correct) | **met** |
| `cap_overrun` pause + report | n-a | none (no dispatch) | n-a |
| spend ledgered vs ~$60 | live-executed | $80.86 pinned cumulative; $0 this window | **met** |
| verification + review + gap table | engineered | §Verification | **met** |
| PR + ci read + ledger advance | engineered | `pr/FUNDED.1.md`, PR below | **met** |

## Evidence report

- **Checklist state at close:** `funded-window.mjs --dry-run --headroom 54.5` → **7/9 PASS**
  (dsn ✓ headroom ✓ caps ✓ ordering ✓ exclusions ✓ optouts ✓ unpaused ✓; **cumulative ✗
  $80.86 ≥ $60**; tenant ✗ absent). Committed: `reports/2026-10-16_funded-env/checklist-dryrun.txt`.
- **Spend:** pinned-scope cumulative **$80.86 / 2,430 rows** since 2026-10-01 (all Oct 1–6
  pre-window spend); ISO-week **$0.00**; window spend **$0.00**. Committed:
  `cumulative-by-workspace.json`, `cumulative-by-day.json`, `iso-week.json`.
- **Verification counts:** turbo 135/135 · vitest 5,814 pass / 4 skip / **0 fail** · six
  `check:*` gates green. No flakes observed.
- **DEFERRALS written:** D-CAP.2-1 status cell — dated exhaustion note appended (no flips).
- **PR:** TBD — head TBD; ci: TBD.
