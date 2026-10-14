# FIX.1 — journey fixture + harness repairs (run ledger)

- **Spec:** `docs/tickets/152_FIX.1__journey-fixture-repairs.md` (manifest row 152, round 5)
- **Normative loads:** `docs/post-spa-disposition-spec.md` §6 (all REQ-FIX-* ids);
  `docs/research/r5_c_fixture-substrate.md` + `r5_c4` addendum;
  `docs/research/r5_c5_bl22-78-residuals.md`
- **Base:** `stevevitali/hygiene-1-memory-hygiene` @ `9239234` (round-5 chain tip)
- **Branch:** `stevevitali/fix-1-journey-fixture-repairs` (mergePolicy=OPERATOR — never merge)
- **Harness:** devin-cli subagent (Cognition agentic coding CLI)
- **Skills:** implement-spec + build-memory @ `~/agent-skills`
- **Requirement ids stamped:** REQ-FIX-P1D REQ-FIX-T17 REQ-FIX-T12F REQ-FIX-T13F
  REQ-FIX-T15 REQ-FIX-T16 REQ-FIX-T8 REQ-FIX-BL78-5B4 REQ-FIX-BL78-5B5
  REQ-FIX-BL78-M31 REQ-FIX-BL22-T7DEST
- **Started:** 2026-10-14 · **Closed:** _pending_
- **Config:** harness/ledger; **Live stage: none**; **Production mutations: none**
  (the T8 mint + BL-78 seed executions stay operator-gated per the ticket's gate line);
  metered spend **$0**; zero prod writes, zero deploys, zero merges

## Deferrals read

`docs/tickets/DEFERRALS.md` read first (protocol). FIX.1 does not *close* owed rows by
execution — it un-owes their fixture halves and records the residual debt honestly:

- **D-P1.18-1** (T8 expiry) — dated note appended: the hand-date arm now exists
  (`scripts/live/mint-t8-export.mjs` + the `JOURNEY_T8_EXPORT_TOKEN` leg arm); execution
  owed to the operator → D-FIX.1-1.
- **D-P1.19-1** (T15 `?gate=` + T16 stale voice) — dated note appended: both substrates
  engineered (`seedOpenApprovalGate`, `seedVoiceProfile`); live re-run → D-FIX.1-2;
  Monday-digest claim half stays clock-owed → D-FIX.1-4.
- **D-P1.04-2** (T7) — dated REQ-FIX-BL22-T7DEST refresh: schedule half re-verified DONE
  (T7 PASS at `ffbb8ad`); the destruction half carries its verbatim fire date (a real
  `project.purge` fire at tombstone+30d, or the operator hand-date arm).
- **D-STB.5b-4** + **D-MAINT.3-1** — dated notes: `seed-bl78-fixtures.mjs` scripts the
  mooted-finding and entitled-tenant substrates; probes → D-FIX.1-3.
- **Four new rows** opened: D-FIX.1-1..4 (T8 mint execution; the six repaired legs' live
  re-run; BL-78 probes; T16's Monday-digest claim).

Pre-existing finding (recorded, not continued — HYGIENE.1's BM-CLOCK-01 precedent): five
DEFERRALS status stamps (lines ~697, D-P1.22-2, D-OBS.1-2/-3) read `2026-10-15` ahead of
the `date -u` clock (`2026-10-14T23:48Z`); all new stamps this run are `2026-10-14`.

## Requirements (from the ticket contract / spec §6)

1. REQ-FIX-P1D — real mobile `userAgent` on the phone context (Chromium emits
   `sec-ch-ua-mobile: ?1` natively — `extraHTTPHeaders` loses to Chromium's own UA-CH);
   the document's own phone classification asserted before the §10.1 capability sweep;
   sweep extended to `[data-apply]`.
2. REQ-FIX-T17 — leg awaits document content inside `[data-page-view]` before the source
   toggle (leg-side arm per ratified Q-T17).
3. REQ-FIX-T12F — obligations POST response-status capture + wait-for-attach on the
   `?obligated=` notice, so repaint lag never masquerades as a missing notice; the
   failure classification distinguishes no-response / HTTP failure / redirect-without-
   paint / repaint lag.
4. REQ-FIX-T13F — the seeded showcase dossier carries a `{replacement}` suggestion shape
   + a `findings.anchor` that resolves on the V2 working head; `assertShowcaseFixture`
   pins both.
5. REQ-FIX-T15 (incl. D-CAP.1-1's carrier) — seeded open `approve_triage` gate
   (`waiting_gate` run + unresolved/unheld/blocking row) → group-1a Inbox row → `?gate=`
   deep link lands `[data-focused-gate]` with live decide controls. No run is launched.
6. REQ-FIX-T16 (Q-ECON.g) — seeded `persona_profiles` snapshot (not B19C-dependent): the
   leg asserts the no-profile negative, seeds the profile, pastes a real sample, and
   asserts the group-3 stale-voice row.
7. REQ-FIX-T8 — `scripts/live/mint-t8-export.mjs`: system-role DSN, `is_test`-guarded,
   dry-run default, one backdated `ready` `account_exports` row; the leg carries a
   `JOURNEY_T8_EXPORT_TOKEN` 410 arm; a dedicated DEFERRALS row carries recipe + fire
   date. Execution on the operator's go only.
8. REQ-FIX-BL78-5B4 — mooted-409 substrate: `jrn-bl78-mooted` dossier +
   `obligation_findings` edges + an `open→mooted` transition, scriptable + idempotent.
9. REQ-FIX-BL78-M31 — entitled-tenant substrate: `trial_state='trial_active'` + an
   `unused` `trial_entitlements` row matching `PRICING.trial.entitlement` verbatim.
10. REQ-FIX-BL78-5B5 — the ~$1 paid B19B-class empty-success outline leg rides the funded
    wave (documented; not scriptable substrate).
11. REQ-FIX-BL22-T7DEST — the T7 destruction row carries its clock-owed fire date
    verbatim (done via the D-P1.04-2 refresh + BL-22 wording).

## Acceptance criteria

- [ ] P1.dossier repaired: real mobile UA + self-classification assert before the
      capability sweep incl. `[data-apply]` — green on prod rides the deployed tip
      *(live-executed → D-FIX.1-2)*
- [ ] T17/T12F/T13F/T15 legs re-run green or honestly re-owed with the new
      classification *(live-executed or fixture-verified → fixtures verified this run;
      live → D-FIX.1-2)*
- [ ] `mint-t8-export.mjs` lands dry-run-default + its DEFERRALS row exists
      *(deterministic · engineered)*
- [ ] verification green; `BUILD_INDEX.md` row and `LEDGER.md` advanced; operating
      clauses met *(agentic — universal phase-gate AC)*

## Plan

1. `steps.ts`: mint `IPHONE_USER_AGENT`; P1.dossier on a real mobile context
   (390×844, `isMobile`, `hasTouch`, preserved `storageState`); classify via
   `data-ssr-cause="phone"` (forced-SSR verdict) OR `data-device="phone"` (SPA shell)
   BEFORE the §10.1 sweep; sweep extended to `[data-apply]`.
2. `steps.ts` T17: wait for `[data-page-view]` content (canonical fixture text) before
   interacting with `[data-source-toggle]`.
3. `stb5a.ts` T12F: `page.waitForResponse` on the obligations POST + notice-attach wait;
   classify no-response / HTTP-failure / redirect-no-paint / repaint lag.
4. `contracts/showcase.ts` + `db/seed/showcase.ts`: finding-1 gains
   `suggestion.replacement` + a schema-valid anchor resolving `exact` on V2;
   `assertShowcaseFixture` pins suggestions when findings are supplied; test proves
   `resolveAnchor` → `exact` + the splice.
5. `db/seed/showcase.ts`: `seedOpenApprovalGate` (waiting_gate + unresolved/unheld/
   blocking `approve_triage`, `on_expiry='wait'`, idempotent); `seededGateDossier` +
   T15 leg in `stb5a.ts` (Inbox row → `?gate=` → `[data-focused-gate]` + controls).
6. `stb5a.ts`: `seedVoiceProfile` (`persona_profiles` snapshot, `sample_set {}`,
   untested) + T16 leg (negative → seed → real paste via `[data-samples-form]` →
   group-3 row); T8 `JOURNEY_T8_EXPORT_TOKEN` arm.
7. `scripts/live/mint-t8-export.mjs` + `scripts/live/seed-bl78-fixtures.mjs` (mooted +
   entitlement arms; dry-run default; `is_test`-guarded; idempotent).
8. DEFERRALS FIX.1 section (D-FIX.1-1..4) + dated notes on D-P1.18-1 / D-P1.19-1 /
   D-P1.04-2 / D-STB.5b-4 / D-MAINT.3-1; BACKLOG BL-22/BL-78 wording refresh;
   registry.ts assert-text refresh.
9. Verification → build memory → commit + push + stacked PR (never merge).

## Progress

- 2026-10-14 — P1.dossier rewired to a real iPhone-UA context; the leg asserts the
  document's own phone classification first: `data-ssr-cause="phone"` on the forced-SSR
  Page-family verdict or `data-device="phone"` on a shell document — the SSR path emits
  no `data-device`, so treating its absence as a failure would misreport the product.
  The §10.1 sweep now counts `[data-apply]` alongside `[data-bulk-controls]`.
- 2026-10-14 — T17 waits for canonical fixture text (`The committee met on Tuesday`)
  inside `[data-page-view]` before reading renderer state or clicking the source toggle.
- 2026-10-14 — T12F captures the findings→obligations POST via `page.waitForResponse`,
  waits for `[data-finding-notice="obligated"]` to attach, and on a miss reports the
  captured status/body — distinguishing no captured response, an HTTP failure, a
  redirect-without-paint, and repaint lag.
- 2026-10-14 — T13F substrate: `SHOWCASE_FIXTURE_FINDINGS[0]` carries
  `suggestion.replacement` ("the recorded figure is about 560,000 households — the 3.1
  million figure was a secondary-source error") + anchor `{blockId:"b7", startOffset:124,
  endOffset:171, confidence:1}`; the finding insert writes `anchor`;
  `assertShowcaseFixture` validates ≥1 nonempty replacement + schema-valid anchor when
  findings are supplied; the fixture test resolves the anchor `exact` against the real
  V2 markdown blocks and proves the splice lands.
- 2026-10-14 — T15 substrate: `seedOpenApprovalGate` parks the seeded dossier's review
  run at `waiting_gate` behind an unresolved/unheld/blocking `approve_triage` gate
  (`on_expiry='wait'`) — exactly the group-1a Inbox predicates; no run is launched
  (invariant #11 held). The leg navigates Inbox → the gate row → its `?gate=` link →
  `[data-focused-gate]` matching the URL id + live decide controls.
- 2026-10-14 — T16 substrate: `seedVoiceProfile` writes a `persona_profiles` row
  (tier `quick`, `calibration_status untested`, `sample_set {}`, `sha256Hex("{}")` from
  `@rhema/contracts` — isomorphic, no `node:crypto` in shared code). The leg asserts the
  profileless negative, seeds the profile, submits a real sample through
  `[data-samples-form]`, and expects the group-3 `voices` row — `deriveVoiceStatus`
  reaches `samples_changed` by construction (snapshot `{}` vs one included item).
- 2026-10-14 — T8 arm: the leg binds `JOURNEY_T8_EXPORT_TOKEN`; when bound it asserts a
  real 410 `export_link_expired`, when unbound it reports owed verbatim.
- 2026-10-14 — `scripts/live/mint-t8-export.mjs` (system-role DSN required, exit 1
  without; `is_test` tenant guard; dry-run default; `--execute` opt-in; inserts ONE
  backdated `ready` row `created_at −9d` / `expires_at −1d` with a stub `s3_key`; prints
  the minted token + the row id for the documented rollback `delete from
  account_exports where id='…'`).
- 2026-10-14 — `scripts/live/seed-bl78-fixtures.mjs` (~265 lines; dry-run default;
  `--execute`; `is_test`-guarded; idempotent): `--mooted` seeds `jrn-bl78-mooted` +
  `obligation_findings` edges + an `open→mooted` transition (reuses an already-mooted
  row on rerun — never re-attempts the invalid transition); `--entitlement` arms
  `trial_state='trial_active'` + an `unused` `trial_entitlements` row matching
  `PRICING.trial.entitlement` verbatim (`review` + `standard` + `base`).
- 2026-10-14 — self-review fix in `seed-bl78-fixtures.mjs`: the mooted arm's direct
  `UPDATE revision_obligations SET state='mooted'` would have raised REQ-OBJ-1's
  `check_violation` (0003_invariants trigger — state may change only via an
  `obligation_transitions` row); the arm now inserts the transition row only and lets
  the after-insert trigger flip `state`/`state_since`/`closed_at`. The same pass fixed
  mint-t8's dry-run text (`ready_at −9d` → the honest `−8d` the insert uses).
- 2026-10-14 — ledgers: DEFERRALS FIX.1 section (D-FIX.1-1..4) + dated notes on
  D-P1.18-1 / D-P1.19-1 / D-P1.04-2 (REQ-FIX-BL22-T7DEST fire date verbatim) /
  D-STB.5b-4 / D-MAINT.3-1; BACKLOG BL-22 + BL-78 titles refreshed to the post-FIX.1
  residual truth; registry.ts assert text refreshed for P1.dossier / T12F / T15 / T16 /
  T17 / T8.

## Gap table

| requirement / AC | status | evidence |
|---|---|---|
| REQ-FIX-P1D real mobile UA + classification assert + `[data-apply]` sweep | DONE (engineered); live re-run owed | `steps.ts` `IPHONE_USER_AGENT` + mobile context + `data-ssr-cause`/`data-device` classify-first + apply sweep; typecheck green; live → D-FIX.1-2 |
| REQ-FIX-T17 content wait before source toggle | DONE (engineered); live re-run owed | `steps.ts` T17 waits `[data-page-view]` text = canonical fixture content |
| REQ-FIX-T12F POST capture + attach wait + failure classification | DONE (engineered); live re-run owed | `stb5a.ts` `waitForResponse` + `[data-finding-notice="obligated"]` attach + status/body report on miss |
| REQ-FIX-T13F suggestion + resolvable anchor + assertShowcaseFixture pin | DONE (fixture-verified) | seed finding-1 replacement+anchor; test resolves `exact` on V2 + splice lands; `showcase.test.ts` 7/7 |
| REQ-FIX-T15 seeded open gate → `?gate=` focused card | DONE (fixture-verified); live re-run owed | `seedOpenApprovalGate` test pins waiting_gate + unresolved/unheld/blocking/on_expiry=wait; leg walks Inbox → deep link → `[data-focused-gate]` |
| REQ-FIX-T16 seeded persona_profiles → stale-voice row (not B19C) | DONE (engineered); live re-run + Monday-digest claim owed | `seedVoiceProfile` + leg; `samples_changed` by construction; digest claim → D-FIX.1-4 |
| REQ-FIX-T8 mint recipe, dry-run default, DEFERRALS row | DONE (deterministic); execution operator-gated | `mint-t8-export.mjs` — missing DSN exits 1, guards verified; D-FIX.1-1 carries recipe + fire date (immediate on execution) |
| REQ-FIX-BL78-5B4 mooted-409 substrate | DONE (scripted); live probe owed | `seed-bl78-fixtures.mjs --mooted` (idempotent); probe → D-FIX.1-3 |
| REQ-FIX-BL78-M31 entitled-tenant substrate | DONE (scripted); live probes owed | `--entitlement` arm; probes → D-FIX.1-3 |
| REQ-FIX-BL78-5B5 B19B empty-success paid leg | recorded honestly | ~$1 paid leg rides the next funded wave — BACKLOG BL-78 + D-FIX.1-3 |
| REQ-FIX-BL22-T7DEST destruction fire date ledgered | DONE | D-P1.04-2 dated note: verbatim fire date (tombstone+30d real fire or operator hand-date arm); BL-22 title refreshed |
| verification green + build memory advanced | DONE | § Evidence report |
| zero prod writes / deploys / merges | held | scripts exit 1 without system DSN; executions operator-gated |

## Evidence log

- `pnpm --filter @rhema/db test` → `showcase.test.ts` **7/7 pass** (incl. the new
  open-gate pin + the anchor `exact`-resolution/splice test).
- `npx vitest run packages/contracts` → **293/293 pass** (29 files).
- `pnpm --filter @rhema/journeys typecheck` → clean; `lint` clean (@rhema/journeys,
  @rhema/db, @rhema/contracts).
- `node --check` both scripts → SYNTAX OK; both exit 1 missing `SYSTEM_DATABASE_URL`
  (the guard fires before any work).
- `pnpm turbo build lint typecheck` → **135/135**.
- `pnpm test` → **5,577 pass / 4 skip / 0 fail** (489 files, 1,077 s — +2 tests vs
  HYGIENE.1's 5,575: the new `seedOpenApprovalGate` pin + the anchor `exact`-resolution
  test).
- `check:licenses` (822 pkgs) · `check:protocol-markers` (248 files) ·
  `check:no-cookies` (253 files) · `check:spa-env` (111 client files) ·
  `check:spa-budget` (all ceilings held) · `check:dom-contract` (journey selectors ⊆
  manifest ⊆ emitted+asserted — covers the new `[data-apply]`/`[data-focused-gate]`/
  `[data-samples-form]` citations) — all OK.
- `pnpm install --frozen-lockfile` → OK (the `@rhema/findings-core` devDep + lockfile
  dedup are consistent).

## Evidence report

_(Phase 6 — filled at closeout.)_
