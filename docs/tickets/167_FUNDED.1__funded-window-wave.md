# FUNDED.1 — Funded-window wave (the paid-leg sweep)

- **Sequence:** 167 · **Phase:** round 5 · **Kind:** ticket
- **base_branch:** `stevevitali/verif-2-preview-legs` tip `9dcfcf9` (GATE-R5F disposition commit)
- **Depends on:** 166_GATE-R5F (PASSED) + 160_R5ECON.3's regime landed+deployed
- **Run:** `implement-spec spec=docs/tickets/167_FUNDED.1__funded-window-wave.md`
- **Gate status:** expanded 2026-10-16 on the GATE-R5F disposition **"PASSED — open the window"**
  (`docs/build/readouts/GATE-R5F.md`); the mechanical checklist was 5/9 at disposition — the four
  env-bind rows (`dsn`/`cumulative`/`headroom`/`tenant`) are satisfied inside this run, and the
  driver's per-dispatch pre-flight fails closed regardless of the disposition
- **Live stage:** operator-gated: paid prod legs under the §5.5 regime (~$60 envelope)
- **Production mutations:** journey tenant provisioning + paid model runs (the regime's own accounting)
- **Size budget:** ~700 changed lines — this contract, the run ledger, DEFERRALS status tails,
  BUILD_INDEX/LEDGER rows, `docs/build/pr/FUNDED.1.md`, committed report JSONs/screenshots under
  `docs/build/reports/2026-10-16_funded-*` (no application code change expected; a surfaced
  harness-level defect would be a small scoped fix, never a guard/expected-state patch)

> **Expanded 2026-10-16** — was a skeleton-kind row gated on 166_GATE-R5F. The operator's
> verbatim disposition (**"PASSED — open the window"**, `docs/build/readouts/GATE-R5F.md`)
> opened the window under the ratified §5/§5.6 regime: ~$60 re-authorized round envelope
> (Q-ECON.f), pinned spend scope (flagged-tenant `source='proxy'` usage excluding `req_jrn_%`
> seeder rows), levered caps (§5.3), ~$20–40 estimated actual spend. Body below is the run-time
> expansion scoped to that authorization; anything unaccountable to it pauses for the operator.

## The wave (registry legs — checklist order verbatim)

Ordering class order is mechanical (`funded-window.mjs`): **T9 → launchers → riders → B19C
last-and-conditional**. Within a class, registry-index order. Caps are the §5.3 table carried on
the registry rows (`capUsd`); `expected` is the registry's current color at fork `9dcfcf9`.

| order | leg | cap | expected | class | what it discharges |
|---|---|---|---|---|---|
| 1 | T9 | $0.50 | green | prestep | quiet-hours arm (D-P1.19-1 quiet half already DONE; re-verify) |
| 2 | N5 | $9.00 | green | launcher | trial `Included` Review e2e (D-CAP.2-1's paid new-visitor half) |
| 3 | N6 | $6.00 | **red** | launcher | planted-error dossier — **D-RES.1-2** |
| 4 | N11 | $6.50 | green | launcher | citation chips (D-CITE.1-4 already DONE; re-verify) |
| 5 | R4 | $0.50 | green | launcher | chat turn (REQ-ECON-11 candidate opt-out — model judgment) |
| 6 | R6 | $4.50 | green | launcher | meter/report (D-RPT.1-1 already DONE; re-verify) |
| 7 | B16 | $0.50 | green | launcher | sidecar-absent + mid-phase pin (D-P0.03-2 DONE; re-verify) |
| 8 | B17 | $1.00 | **red** | launcher | high-water replay (audit-cap leg unreachable-by-construction — D-STB.5b-2) |
| 9 | B18A | $1.00 | **red** | launcher | fetch_log attribution; fetcher-binding residual rides B19C (D-STB.5b-3, D-PRB.02-3) |
| 10 | B18B | $1.00 | **red** | launcher | memo deny-on-attempt — **D-P1.21-2** residual |
| 11 | B19A | $3.50 | **red** | launcher | `approve_plan` structured edit → next-phase file — **D-P0.15-3** plan half |
| 12 | B19B | $1.50 | **red** | launcher | `approve_outline` promotion edit — **D-P0.15-3** outline half + **D-STB.5b-5** live retry leg |
| 13 | R9 | $0.50 | green | rider | refund-window rider on window deliveries (D-DEF.4-1 DONE; re-verify) |
| 14–20 | T10–T16 | $0.50 ×7 | T15/T16 **red** | riders | dossier family; **T15** `?gate=` → D-CAP.1-1 / D-P1.19-1 / D-FIX.1-2 residual; **T16** stale-voice → D-P1.19-1 / D-FIX.1-2 residual |
| 21 | B19C | $15.00 | **red** | conditional | `approve_sample` + calibration/leak — **D-P1.14-1**, **D-PRB.02-3** fetcher half, T16 prereq alternate. **Mandatory `testCheapRoute:false` opt-out; runs ONLY if the envelope still admits its $15 cap at dispatch** |

Σ declared `capUsd` = **$54.50**. B19A/B19B dispatch twice under `JOURNEY_FUNDED_HOLD_GATE`
(launch-and-hold, then resume) — each dispatch re-declares their $5.00 pair cap as headroom.

## The §5.6 census items (non-registry funded legs)

| item | driver | bound | carrier row | wave disposition |
|---|---|---|---|---|
| RES.1 excerpt leg — Standard/Base ≤300-word excerpt coverage | `provision-res1.ts` (real magic-link + draft project) + `cite1-leg.mjs`/`res1-probe.mjs` | ≤$5 (ticket bound) | **D-RES.1-3** | **in the wave** — fresh project required (BL-66) |
| BL-20 `chat_turn` + `research_burst` pair | `scripts/live/bl20-legs.mjs` (built — R5ECON.3/REQ-FND-7) | ≤$5 pair (`BL20_CAP_USD`) | **D-P1.11-1** + **D-DEF.1-1** | **in the wave** |
| BL-78 arms — mooted-defer 409 probe, entitlement sheet renders, empty-success retry | `seed-bl78-fixtures.mjs --mooted --entitlement --execute` + api/browser probes; retry leg rides B19B's outline run | $0 probes + ~$1 launch arm | **D-FIX.1-3** (+ D-STB.5b-4, D-MAINT.3-1, D-STB.5b-5 live legs) | **in the wave** |
| CITE.1 funded probes — leg-1 family (planted-error) ×3 + leg-2 (golden-op-ed) ×2 | `cite1-leg.mjs` | **$9.00/probe** (Q-ECON.h reconciled cap) | **D-CITE.1-2/-3** | **in the wave as headroom admits** — dispatch probe-by-probe |
| ADR-086 definitive rate read | `funded-query.mjs` aggregate read | $0 | **D-CITE.1-5** | **in the wave** — read over whatever probe rows exist at read time; honest n |
| R5ECON.2 OFF/ON pairs L5/L1/L2/L3 | `scripts/live/lever-pair.mjs` (built — REQ-FND-7) | ≤$3/$4/$4/$5 per pair | **D-ECON.2-2/-3** | **in the wave as headroom admits**, cheapest-first per ADR-087 |
| RES.3 retry-drain paid verify | **no driver — product change first** (protocol checkpointing + `research_budget_exhausted` gate) | ~$3–5 later | **D-RES.3-1** | **carried** — stays OPEN; prerequisite product ticket owns it |
| ECON.2 ON-arm non-regression + N4/C1 | `lever-pair.mjs` `LEVERS_JSON` | ≤$12, gated on adopt verdicts | **D-ECON.2-4** | **carried unless the pairs + verdicts land inside this window** |
| Cost-card refit + restore | none — operator-paused register item | n/a | D-ECON.2-5/-6/-7 | **carried** — register items, not launched |

## Env bindings + the guard's own contract

- `JOURNEY_DATABASE_URL` — the **system-role** DSN (`postgres`, `rolsuper OR rolbypassrls` proven
  via `pg_roles`) over the IAP tunnel (`gcloud compute ssh rhema-prod-proxy-3ms6
  --tunnel-through-iap -- -L 127.0.0.1:15433:10.46.0.3:5432 -N`); password composed from
  `rhema-prod-alloydb-password` (provided: **yes** — Secret Manager; never logged/committed).
- `JOURNEY_FUNDED_STABLE_TAG=a` — the funded stable tenant `test+jrn-a@rhema.tools`:
  `funded-tenant.mjs` probes the newest workspace, `--execute` refreshes `created_at` for the
  26 h purge window; the same-window `house-grant` (REQ-FND-5) rides `admin-cli` on
  `SYSTEM_DATABASE_URL` + `RHEMA_OPERATOR_ID` — **tenant provisioning**, inside the Production
  mutations line; a grant anywhere else is an ADR-013 pause.
- `JOURNEY_FUNDED_HOLD_GATE=<dir>` — arms B19A/B19B's launch-and-hold so T15 rides a REAL open
  gate (REQ-FND-6); a second dispatch of the same steps resumes at the decision.
- `--expect-sha ffbb8ad` — provenance prefix-match on `/healthz` `build.gitSha`
  (`ffbb8ad01b4383…`; the documented non-repo-sha divergence stands — VERIF.1 §provenance).
- Stop conditions (never self-authorize): measured cumulative ≥ $60 → STOP, report exhaustion;
  `cumulative + headroom > 60` per dispatch → that leg set is honestly carried; any
  `cap_overrun` → window paused by `funded-pause.json`, operator re-authorization required;
  guard-refused/throwing legs report `owed`/carrier, never fabricated green.

## Dispatch plan (declared in advance per REQ-FND-1; every dispatch re-measures)

| dispatch | `--steps` | `--headroom` (Σ caps) | purpose |
|---|---|---|---|
| D0 env | — | — | tunnel + DSN + `pg_roles` probe + funded-tenant probe/`--execute` + house-grant + BL-78/T16 substrate seeds ($0 writes only) |
| D1 | `T9,N5` | $9.50 | N5 first (FUNDED-B lesson — its 40-min poll must not race a saturated queue) |
| D2 | `N6,N11,R4,R6,B16` | $21.50 | cheap-launcher batch delivers the riders' substrate |
| D3 | `B17,B18A,B18B,B19A,B19B` | $8.00 | gate launchers; B19A/B park open gates under `HOLD_GATE` |
| D4 | `R9,T10,T11,T12,T13,T14,T15,T16` | $4.00 | riders ride the window's deliveries + parked gates |
| D5 | `B19A,B19B` | $5.00 | resume at the decision → terminal (D-P0.15-3 evidence) |
| D6 | `B19C` | $15.00 | **conditional last** — only while `cum + 15 ≤ 60` |
| census interleave | per-driver | per-leg bound | RES.1 excerpt ≤$5 · BL-20 pair ≤$5 · BL-78 $0 probes + ~$1 arm · CITE probes $9.00 each (≤5, as headroom admits) · ECON.2 pairs $3–5 each (cheapest-first) · ADR-086 read $0 |

## Goal

Execute the operator-authorized funded wave on prod `ffbb8ad` with truthful live evidence:
the 21 registry `paid:true` legs in checklist order plus every §5.6 census item whose driver
exists, each leg's committed evidence landing under `docs/build/reports/2026-10-16_funded-*`,
each funded D-row the wave proves flipped in `DEFERRALS.md`, each refusal/shortfall carried by a
named row — and the whole envelope measured under the system-role pinned scope never exceeding
~$60.

## Requirements

- **REQ-FND-1/2/3** — cap+headroom declared in advance (the plan above); spend read under the
  system role only (app-role DSN refused); every paid leg's declared `capUsd` enforced at close
  (`CapOverrunError`), divergences recorded and routed.
- **REQ-FND-4/5** — entitlement rows count as spend (no silent exemptions); the funded stable
  tenant exists (`is_test`), is funded for the window's launches, and is purge-fresh through the
  evidence window.
- **REQ-FND-6** — prerequisite-scarce legs ride window-owned substrates (T15 the parked gates;
  T16 the seeded persona profile; R9 window deliveries) before any seed fallback.
- **REQ-FND-7** — every non-registry paid item runs only through its committed driver; absent
  drivers (RES.3 verify, cost-card items) are carried, never improvised.
- **REQ-FND-8** — red legs report `owed`; `ready-to-flip` evidence is recorded for the owning
  ticket to flip; nothing reports `fail` for an expected-red leg.
- **REQ-ECON-6** — `req_jrn_` seeder rows excluded from every spend read; fixture writes never
  pollute the meter of record.
- **D-rows discharged (enumerated above):** D-CAP.2-1 umbrella + D-RES.1-2/-3, D-P1.21-2,
  D-P0.15-3, D-P1.19-1 residuals, D-CAP.1-1, D-FIX.1-2 residual, D-P1.14-1, D-PRB.02-3 fetcher
  half, D-STB.5b-3 residual, D-P1.11-1, D-DEF.1-1, D-FIX.1-3 (+ D-STB.5b-4, D-MAINT.3-1,
  D-STB.5b-5), D-CITE.1-2/-3/-5, D-ECON.2-2/-3 — each flips only on committed live evidence.

## Acceptance criteria

- [ ] Contract expanded + committed; branch `stevevitali/funded-1-funded-window-wave` from
  `9dcfcf9`; `docs/build/runs/FUNDED.1.md` seeded.
- [ ] Checklist `dsn`/`cumulative`/`headroom`/`tenant` rows measured live: system-role DSN bound
  + `pg_roles` bypass proven; pinned-scope cumulative read; funded tenant seeded + purge-exempt;
  every dispatch carried `--headroom` covering its selected Σ caps.
- [ ] The 21 registry legs dispatched in checklist order with committed `report.json` +
  per-leg `*-evidence.json`/`*.png`; every outcome classified verbatim (pass/owed/ready-to-flip/
  skipped/cap_overrun); B19C dispatched only if the envelope admitted it, else carried.
- [ ] Every census item either executed through its driver with evidence committed, or carried
  with the named prerequisite (RES.3 verify, ECON.2-4, cost-card items).
- [ ] Pinned-scope cumulative + total window spend ledgered vs the ~$60 envelope; zero spend
  after any ≥$60 read; `funded-pause.json` preserved if written.
- [ ] DEFERRALS rows flipped only on committed evidence; new owed items appended with carriers.
- [ ] Two-pass self-review + fresh gap table + verification (`turbo build lint typecheck`,
  `pnpm test`, affected focused suites, `check:*` public-safe gates) recorded.
- [ ] `docs/build/pr/FUNDED.1.md` + GitHub PR open against the chain base; `ci-boundary
  --pr <n> --stack` head-bound read recorded; BUILD_INDEX row; LEDGER advanced
  (`lastCompleted: FUNDED.1`, `nextTicket: R5CAP.1`, `chainTip` = final head); never merged.

## Spec §§

`docs/post-spa-disposition-spec.md` §5 (all of it) + §5.6 census ·
`docs/research/r5_f1_funded-census.md` · `docs/build/readouts/GATE-R5F.md` ·
`docs/build/runs/R5ECON.3.md` (the regime + drivers) · `docs/build/runs/FUNDED-2026-10-06-A.md`
(tenant-funding + purge lessons) · `docs/tickets/DEFERRALS.md` (the funded-row ledger).

## Out of scope

- Anything outside `journey tenant provisioning + paid model runs`: house-credit grants beyond
  the funded stable tenant's seeding, DNS, stateful destroy, non-journey data writes, any
  deploy/Pulumi change — an ADR-013 pause: STOP and report.
- Product fixes to make red legs pass; patching guards, expected states, caps, or scripts to
  force green; removing `funded-pause.json` autonomously.
- RES.3's prerequisite product change; ECON.2-4's verdict-gated arm (unless pairs + verdicts
  land in-window); the operator-paused cost-card items.
- `infra/pulumi/Pulumi.pr-*.yaml`; secrets into evidence (`provided: yes/no` lines only).

## Notes

- **N5 queue lesson (FUNDED-B):** a saturated run-task queue made the 40-min delivery poll miss;
  N5 dispatches first while the window is empty.
- **Hold-gate shape:** B19A/B19B launch→park (report `owed`-held, evidence lands), riders walk the
  real `waiting_gate` rows, the same-step re-dispatch resumes at the decision — three dispatches
  across D3–D5 is the designed REQ-FND-6 ride, not a retry hack.
- **Headroom accounting:** `--headroom` compares cumulative + selected Σ caps against $60 per
  dispatch; non-registry legs spend inside the same pinned scope, so the running ledger re-measures
  before every launch of any kind — a leg that would cross $60 is carried, never split.
- **House-grant authorization:** REQ-FND-5 names the same-window grant part of the funded-tenant
  requirement the operator opened; `funded-tenant.mjs` prints the verbatim `admin-cli` command.
  Sized to the scripted default (`FUNDED_GRANT_CREDITS`, ~the envelope) on the CURRENT billing
  account only — grants on reaped workspaces are dead weight (FUNDED-A lesson: the ~26 h purge
  reaps user+workspace+billing together).
- **T16 substrate:** `seedVoiceProfile` (FIX.1 arm) writes the `persona_profiles` row on the
  funded tenant before D4 — a seeded fixtured row, excluded from spend by the `req_jrn_` marker,
  asserted `is_test`-only.
