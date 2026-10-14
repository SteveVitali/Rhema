# FIX.1 — Journey fixture + harness repairs (owed-leg substrate)

Manifest row 152 · stacks on `stevevitali/hygiene-1-memory-hygiene` (PR chain tip
`9239234`) · merge policy **OPERATOR** — do not merge from the build environment ·
harness/ledger only, **$0**, no live stage, nothing deployed, zero prod writes (the T8
mint + BL-78 seed executions stay operator-gated per the ticket's gate line).

## What lands

Every fixture-blocked journey leg stops owing its substrate.

- **P1.dossier (REQ-FIX-P1D)** — the phone leg rides a real mobile browser context
  (`IPHONE_USER_AGENT`, 390×844, `isMobile`, `hasTouch`, preserved `storageState`) so
  Chromium emits `sec-ch-ua-mobile: ?1` natively — the `extraHTTPHeaders` path loses to
  Chromium's own UA-CH on the wire. The leg now asserts the document's own phone
  classification BEFORE the §10.1 capability sweep — `data-ssr-cause="phone"` on the
  forced-SSR Page-family verdict or `data-device="phone"` on a shell document (the SSR
  path emits no `data-device`; its absence is not a product failure) — and the sweep
  extends to `[data-apply]` per the ratified Q-1.
- **T17 (REQ-FIX-T17)** — awaits canonical fixture text inside `[data-page-view]`
  before reading renderer state or touching the source toggle (leg-side arm per
  ratified Q-T17).
- **T12F (REQ-FIX-T12F)** — captures the findings→obligations POST via
  `page.waitForResponse` and waits for the `?obligated=` notice to attach; a miss now
  reports the captured status/body — distinguishing no response, HTTP failure,
  redirect-without-paint, and repaint lag.
- **T13F (REQ-FIX-T13F)** — the seeded showcase dossier's first finding carries a
  `suggestion.replacement` + a schema-valid `findings.anchor` that `resolveAnchor`s
  `exact` against the V2 working head; the finding insert writes `anchor`;
  `assertShowcaseFixture` pins replacement+anchor whenever findings are supplied; the
  fixture test proves the splice lands.
- **T15 (REQ-FIX-T15, D-CAP.1-1's carrier)** — `seedOpenApprovalGate` parks the seeded
  dossier's review run at `waiting_gate` behind an unresolved/unheld/blocking
  `approve_triage` row (`on_expiry='wait'`) — exactly the group-1a Inbox predicates; no
  run is launched. The leg walks Inbox → the gate row → its `?gate=` link →
  `[data-focused-gate]` + live decide controls.
- **T16 (REQ-FIX-T16, Q-ECON.g)** — `seedVoiceProfile` writes a `persona_profiles`
  snapshot (empty `sample_set`, untested) — no B19C build needed. The leg asserts the
  profileless negative, seeds the profile, pastes a real sample through
  `[data-samples-form]`, and expects the group-3 stale-voice row (`deriveVoiceStatus`
  reaches `samples_changed` by construction).
- **T8 (REQ-FIX-T8)** — `scripts/live/mint-t8-export.mjs`: system-role DSN required
  (exit 1 without), `is_test` tenant guard, dry-run default, `--execute` opt-in; mints
  ONE backdated `ready` `account_exports` row (`created_at −9d`, `expires_at −1d`,
  stub `s3_key`) and prints the token + rollback delete. The leg's
  `JOURNEY_T8_EXPORT_TOKEN` arm asserts the real 410 `export_link_expired`; unbound it
  reports owed verbatim. Execution on the operator's go only.
- **BL-78 (REQ-FIX-BL78-5B4/M31)** — `scripts/live/seed-bl78-fixtures.mjs` (dry-run
  default, `is_test`-guarded, idempotent): `--mooted` seeds `jrn-bl78-mooted` +
  `obligation_findings` edges + an `open→mooted` transition (reuses an already-mooted
  row on rerun); `--entitlement` arms `trial_state='trial_active'` + an `unused`
  `trial_entitlements` row matching `PRICING.trial.entitlement` verbatim.
- **BL-22 (REQ-FIX-BL22-T7DEST)** — the T7 destruction row now carries its clock-owed
  fire date verbatim (a real `project.purge` fire at tombstone+30d, or the operator
  hand-date arm); BL-22/BL-78 BACKLOG wording refreshed to post-FIX.1 truth.
- **Ledgers** — DEFERRALS gains a FIX.1 section (D-FIX.1-1..4: the mint execution, the
  six legs' live re-run, the BL-78 probes, T16's Monday-digest claim) plus dated notes
  on D-P1.18-1 / D-P1.19-1 / D-P1.04-2 / D-STB.5b-4 / D-MAINT.3-1; registry.ts assert
  text refreshed for every repaired leg.

## Verify

- `showcase.test.ts` **7/7** (incl. the open-gate pin + anchor `exact`-resolution
  splice) · `packages/contracts` **293/293**.
- `pnpm turbo build lint typecheck` → **135/135** · `pnpm test` → **5,577 pass / 4
  skip / 0 fail** (489 files).
- `check:licenses` · `check:protocol-markers` · `check:no-cookies` · `check:spa-env` ·
  `check:spa-budget` · `check:dom-contract` — all green (the manifest covers the new
  `[data-apply]`/`[data-focused-gate]`/`[data-samples-form]` citations).
- `node --check` both scripts; both exit 1 without `SYSTEM_DATABASE_URL` (guards fire
  before any work).
- `check-build-memory.sh .` → **0 violations** (9 warnings, all pre-existing class) ·
  `check-append-only.mjs --base 9239234` → OK.

## Deferrals

Opened: **D-FIX.1-1** (T8 mint execution — operator-gated prod-fixture write; fire date
immediate on execution) · **D-FIX.1-2** (the six repaired legs' live re-run on the
deployed tip) · **D-FIX.1-3** (BL-78 live probes on the seeded substrates + the paid
B19B outline leg on the funded wave) · **D-FIX.1-4** (T16's Monday-digest claim half —
clock-owed). Dated notes appended to D-P1.18-1 / D-P1.19-1 / D-P1.04-2 / D-STB.5b-4 /
D-MAINT.3-1; zero rows deleted, zero closed-without-evidence.

## Requirement ids

REQ-FIX-P1D · REQ-FIX-T17 · REQ-FIX-T12F · REQ-FIX-T13F · REQ-FIX-T15 · REQ-FIX-T16 ·
REQ-FIX-T8 · REQ-FIX-BL78-5B4 · REQ-FIX-BL78-5B5 · REQ-FIX-BL78-M31 ·
REQ-FIX-BL22-T7DEST

## Evidence

`runs/FIX.1.md` · `mergePolicy: OPERATOR` — stacked on
`stevevitali/hygiene-1-memory-hygiene`, never merged by this run.
