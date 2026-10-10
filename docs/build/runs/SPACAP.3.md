# SPACAP.3 — run ledger: capstone closure (the routed gaps closed or dispositioned)

- **Ticket:** `docs/tickets/142_SPACAP.3__capstone-closure.md` (manifest row 142)
- **Branch:** `stevevitali/spacap-3-capstone-closure` — forked from
  `stevevitali/spacap-2-composed-verification` @ `0eaea5d` (the chain tip).
- **PR:** stacked on `stevevitali/spacap-2-composed-verification`;
  `gh pr checks --watch=false` read once at closeout (§ 7).
- **Harness:** devin-cli subagent (per the 2026-10-08T23:05Z dispatch-tier ruling).
- **Mode:** code fix + verification + documentation, offline-only, $0 — no deploys, no prod
  mutations, mergePolicy OPERATOR.
- **Spend:** $0 (no live legs — every live leg is owed to the deployed tip).

## 1 — What this run is

The round-4 capstone closure. SPACAP.1's routed gap list
(`docs/build/reports/CAPSTONE_GAP_ANALYSIS_SPA.md` §5 — G1 HIGH process, G2 LOW code,
G3–G5 MED live-evidence) is fully dispositioned: one fix commit (G2), one closed-by-runbook
(G1, citing SPACAP.2), three signed-deviation candidates (G3–G5), and the six PARTIAL
coverage rows dispositioned with compensating controls + covering deferral rows. The landed
shape is recorded in `docs/build/CAPSTONE_CLOSURE.md` (appended round-4 section — the
round-3 document is preserved verbatim above it, per append-only).

## 2 — What landed (the G2 fix)

SPACAP.1 §4.5: the server's Page-family document arms force SSR on
`isPhoneRequest(c) || row.showcase === true`; the boot map replicated only the phone leg
(`deviceClass === "phone" && doc.pageMount === true`). `row.showcase` is row data the
request-scoped, route-keyed boot payload cannot see — on desktop the map marked all five
Page-family routes `"spa"` even for showcase projects, so an in-SPA navigation mounted the
SPA Page where a document load would have served the forced-SSR read-only document.

Resolution (the analysis's proposed option (a), recorded as **ADR-108**):

- `apps/web/src/spa/queries.ts` — `project.showcase?: boolean` added to the five Page-family
  twin types (`BffProjectTwin`, `BffVersionPageTwin`, `BffCompareTwin`, `BffArtifactTwin`,
  `BffRevisionTwin`).
- `apps/web/src/server.ts` — all five twins emit `...(row.showcase === true ? { showcase: true } : {})`
  in the `project` bag (the row fact verbatim; omitted otherwise).
- `apps/web/src/spa/states.tsx` — `twinForcesSsr(twin)` — the shared leaf predicate.
- The five leaves (`p.$project.index`, `v.$v`, `v.$n.diff.$m`, `a.$artifactId`,
  `revisions.$cid`) — after the twin resolves, `twinForcesSsr(q.data)` → `<SsrHandoff />`;
  the document load then lands the server's forced-SSR arm. The client's effective predicate
  now mirrors the server's two legs: boot map owns phone, twin owns showcase.
- The BFF aggregates' existing read-only/`collabWsUrl`-withheld posture is untouched
  (belt-and-braces behind the handoff).

## 3 — Regression pins (removal-detecting — every leg fails if the fix is removed)

- `apps/web/src/renderer-overrides.test.ts` — new `SPACAP.3` describe: the five verbatim
  `isPhoneRequest(c) || row.showcase === true` document arms counted (5); the boot-map phone
  leg counted (1); the five twin `showcase` emissions counted (5); the five leaf
  `twinForcesSsr(` consults asserted by filename. Drop a leg → a count fails.
- `apps/web/src/spa/editor.dom.test.tsx` — new describe (6 legs): a `project.showcase:true`
  twin drives `navigateDocument` (`assignSpy`) on all five leaves with no SPA mount
  (`data-page-mount`/`data-page-view`/`data-compare`/`data-hunk` absent); a non-showcase twin
  mounts and never hands off (the fix cannot over-trigger).
- `apps/web/src/server.test.ts` — SPA.23 block +3 legs: `project.showcase === true` on a
  showcase row for all five twins (with `readOnly`/`collabWsUrl` posture asserted verbatim);
  the key absent on a non-showcase row for all five.

## 4 — Gap dispositions (final)

| # | Disposition | Record |
|---|---|---|
| G1 HIGH | **closed-by-runbook** | `docs/build/reports/SPACAP.2_COMPOSED_VERIFICATION.md` §3 — the 15-segment merge/deploy cadence + Arm B; live execution ledgered `D-SPACAP.2-1..4` |
| G2 LOW | **fixed** | §2 + ADR-108; live re-verify leg `D-SPACAP.3-1` |
| G3 MED | **deviation-candidate** | CAPSTONE_CLOSURE R4.2 — REQ-VFY-8's written procedure sunset-deleted; amended recipe recorded (`D-SPA.28-2` DONE + runbook); live legs `D-SPA.*-1`/`D-SPAF.*-2`→`D-SPACAP.2-1` |
| G4 MED | **deviation-candidate** | CAPSTONE_CLOSURE R4.2 — R6F/T12F/T13F/T17 owed; first prod legs folded into `D-SPACAP.2-1` (ready-to-flip); preview legs behind `D-MAINT.6-1` |
| G5 MED | **deviation-candidate** | CAPSTONE_CLOSURE R4.2 — P1-family journey axe owed; component-axe covers the manifest subset; same unblock |

The verbatim ACCEPTED-deviations table (8 rows, proposed — unsigned) is in
`docs/build/CAPSTONE_CLOSURE.md` §R4.4 and mirrored in `docs/build/pr/SPACAP.3.md`.

## 5 — Verify (run this session)

- `pnpm turbo build lint typecheck` — **135/135 tasks** green.
- `pnpm test` — **487 files passed / 2 skipped; 5,562 tests passed / 6 skipped / 0 failed**
  (clean re-run). First parallel run recorded **one transient flake** —
  `run-sheet.dom.test.tsx` "posts the flat field map" leg failed with
  `fireEvent.submit` on a null element under parallel load; the file is untouched by this
  diff, passes **24/24 in isolation**, and the re-run is fully green.
- Focused suites: `renderer-overrides.test.ts` (7), `server.test.ts` (113),
  `editor.dom.test.tsx` (22) — all green including every new leg.
- `pnpm check:dom-contract` — OK. `check:spa-budget` — all ceilings held.
  `check:spa-env` — OK (111 sources, 146 artifacts). `check:protocol-markers` — OK (248).
  `check:no-cookies` — OK (253). `check:licenses` — OK (822).
- `scripts/check-coverage-matrix.test.mjs` — 6/6 green inside `pnpm test` (the matrix is
  unchanged this run — PARTIAL rows stay PARTIAL, honestly).
- `bash ~/agent-skills/skills/build-memory/scripts/check-build-memory.sh .` —
  **no violations** (7 warnings, all pre-existing classes).
- `node docs/build/tools/check-append-only.mjs --base 0eaea5d` — **OK**;
  `--selftest` — OK.
- `tsc` — `@rhema/web` typecheck clean (server + client + spa projects).

## 6 — Deferrals

Opened: **D-SPACAP.3-1** — live re-verify of the G2 fix on the deployed tip (three legs:
showcase document `data-renderer="ssr"`, the in-SPA handoff landing SSR, the non-showcase
control mounting SPA). Owed to §3.1 segment 15 like the D-SPACAP.2 rows; every deterministic
seam is pinned in-repo this run.

Closed: none. Probed-and-unchanged: `D-SPACAP.2-1..4`, the `D-SPA.*-1/-2` preview legs,
`D-SPAF.*-1..4`, `D-MAINT.6-1`, `D-OPS.1-1` — all still OPEN behind the ordered merge/deploy
+ the Resend prerequisite; `D-SPA.28-2` stays DONE.

## 7 — Validators + PR checks

- `bash ~/agent-skills/skills/build-memory/scripts/check-build-memory.sh .` —
  **no violations** (7 warnings, all pre-existing classes — manifest banner coverage,
  gate-cell wording, nextTicket-vs-GATE-G2, phase-log line budget, legacy index status
  values, readout guard sentence, `Harness:` headers on old ledgers; this ledger carries
  the header).
- `node docs/build/tools/check-append-only.mjs --base 0eaea5d` — **OK**; `--selftest` — OK.
- `gh pr checks 164 --watch=false` (2026-10-10T07:55Z) → **"no checks reported on the
  'stevevitali/spacap-3-capstone-closure' branch"** — the recurring first-read class
  SPACAP.2 recorded (the check suite reports on a later read; nothing to classify or
  waive this read — no `integration`/privsep red was reported, so `GD-MAINT.4-1` is
  noted but uninvoked). PR **#164** against `stevevitali/spacap-2-composed-verification`,
  unmerged per `mergePolicy: OPERATOR`.

## 8 — Deviations / owned decisions

1. **G2 resolved via the twin, not the boot map.** The analysis offered (a) twin-flag +
   leaf handoff or (b) record the divergence. Option (a) — chosen per the prompt's fix
   routing and because `row.showcase` is unrepresentable in a route-keyed static map
   (ADR-108 records the alternatives: slug-set in the boot payload loses on weight +
   duplication; loader-level `redirect({reloadDocument:true})` loses the `spaRuntime.assign`
   seam the harness observes).
2. **Handoff at component level, not `beforeLoad`.** The `?focus=1`/handoff POST on
   `/p/:slug` runs in `beforeLoad` and mirrors the document's own inline order — a showcase
   row's handoff POST therefore behaves exactly as the SSR document's did (no behavior gap
   introduced); the `twinForcesSsr` consult sits after the twin resolves so the extra read
   is the same fetch the leaf needed anyway.
3. **CAPSTONE_CLOSURE.md appended, not overwritten** — the round-3 document is preserved
   verbatim; the round-4 record is a new dated section (append-only precedent).
4. **Six PARTIAL rows left PARTIAL on purpose** — flipping any of them would claim live
   verification that wasn't observed; the dispositions name controls + covering rows instead.
