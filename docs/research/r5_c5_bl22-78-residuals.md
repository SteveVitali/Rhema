# c5_bl22-78-residuals — Account/journey leg residuals

**Stream:** C · **Researched:** 2026-10-14 · **Ledger rows covered:** C5 · **Confidence overall:** high

**Deployed tip for all "live leg" references:** `ffbb8ad` — prod provenance PASS since ARMB.2 `pulumi up` update 150 (2026-10-14); `docs/build/runs/ARMB-2026-10-14.md` §10. All MAINT.3 code fixes are on that tip.

### F1 — BL-22's row text is stale: three of its five named residuals are already discharged
**Claim:** BL-22 lists "citeproc + T8 7-day expiry + quiet hours + Decisions row + stale voice + T7 purge probe" as residuals, but citeproc, quiet-hours, the Decisions row, and the T7 *queued-job* half are all live-verified green.
**Evidence:** `packages/journeys/src/registry.ts` (T4/T9/T14/T7 `expected:"green"` + 2026-10-06 fcbbc66 flip notes); `docs/build/runs/STB.5a.md` (T4/T5/T6 PASS on `b909fe9a`); `docs/build/runs/FUNDED-2026-10-06-A.md` §D.2 (T9/T14 PASS on `476a0ed`); `docs/build/runs/ARMB-2026-10-14.md` §6–§11 (re-PASS at `ffbb8ad`).
**Implication:** the manifest must NOT re-emit legs for citeproc/quiet-hours/Decisions/T7-schedule; the true residual set is T8 (clock), T7's *destruction* half (clock), T16 stale voice (substrate), and T15 `?gate=` (substrate) — plus a BL-22 wording refresh.

### F2 — citeproc (D-P1.18-1(b) → T4): DONE
`stb5a.ts:487-531` (bibliography POST → html export via pandoc `--citeproc`; `.md` returns source bytes by design). T4 PASS 2026-10-04 + re-passed in the ARMB free suite at `ffbb8ad`. Nothing owed.

### F3 — T8 / 7-day export-token expiry (D-P1.18-1(d)): owed — clock
Token-gated download must 410 past `expires_at`; bogus → 404 asserted (`stb5a.ts:846-864`). The expired half can't exist on standard test tenants — the ~26h auto-purge deletes `account_exports` before the 7-day TTL (ADR-088). T8 `expected:"red"`. **Unblock:** purge-exempt tenant + 7-day wait (funded-window B precedent) or operator hand-dated row. **Blocker: clock** (operator-write alternative).

### F4 — quiet-hours (D-P1.19-1(b) → T9+T14): DONE
T9 arms the window; T14 correlates `inbox_items` `created_at`/`visible_at` via system-role DSN, asserts zero in-window leaks. PASS 2026-10-06 funded window B on `476a0ed`.

### F5 — Decisions row (D-P1.19-1(d) → T14): DONE
`stb5a.ts:1521-1585` — escalate → decision row in blocked section inside quiet hours; `pre_export` obligation → Decisions row → re-defer/drop answers → chip flip. PASS 2026-10-06.

### F6 — stale voice (D-P1.19-1(e) → T16): owed — substrate (+ clock on digest arm)
Fact change on a persona **with a built profile** must land a group-3 Inbox stale-voice row + Monday digest mail claim once. Today T16 asserts only the profileless negative (`stb5a.ts:1621-1652`). **Unblock:** a `persona_profiles` row — fixture-script seed (`seedWritableDossier`/`seedDeliveredRunReport` precedent `stb5a.ts:1122-1254`) or a paid `profile_voice` run (~$1). **Blocker: fixture-script / paid live-leg.**

### F7 — T7 purge residual (D-P1.04-2): schedule half DONE; destruction half owed — clock
Queued-job half green since 2026-10-06; re-PASS at `ffbb8ad` (15s `send-it` poll; `rhema_project_purge_schedule` probe, migration 0058). Residual = the +30d live destruction (hard-delete tree + GCS prefix), unobservable under ~26h test-tenant purge. **Blocker: clock** (purge-exempt + 30d or operator hand-date).

### F8 — T15 `?gate=` deep link (D-P1.19-1(a) remnant): owed — substrate
An open approval's Inbox row must land the focused `?gate=` card with live decide controls (`stb5a.ts:1588-1619`). Owed — "no open approval gate on the tenant". **Unblock:** a gated paid run that parks (B19A's gate opened but resolved before T15 ran — sequencing gap) or a seeded open-gate fixture. **Blocker: live-leg (paid) / fixture-script.**

### F9 — BL-78: three MAINT.3 fixes deployed at `ffbb8ad`; their live legs are un-run
| leg | what it must prove live | blocker |
|---|---|---|
| D-STB.5b-4 | POST `defer` on a `mooted`/closed-obligation finding → **409 `obligation_not_routable`**, tx rolled back (fix: `triage-routes.ts` + `obligations/hook.ts`). $0 — needs a stale-chip finding; T14 now deliberately selects only `open`/`reopened` (`stb5a.ts:1527-1540`) so a dedicated leg/probe is owed. | live-leg |
| D-STB.5b-5 | B19B-class outline run survives empty-text `sdk=success` — single `EMPTY_SUCCESS_NUDGE` re-issue → reaches `approve_plan` (D-P0.15-3's real target). Paid (~$0.4–1). | live-leg (paid) |
| D-MAINT.3-1 | Entitled flagged tenant: mismatched `/p/:slug/run` shape → funded estimate (no `data-included`/hidden `entitlementId`); matching `review/standard/base` → `Included` + entitlement claim. Render $0; launch arm paid. | live-leg (render $0 / launch paid) |

### F10 — BL-78 DONE arms (don't re-emit)
N4 Included-variant figure read — PASS at `d5a74cc` and `ffbb8ad`. N9 reseat — executed 2026-10-15, PASS at `ffbb8ad`. D-OBS.1-3 residual = first *scheduled* nightly green on tip (clock/CI, BL-74-adjacent).

## Per-item table

| item | need | blocker-class | rows |
|---|---|---|---|
| citeproc (T4) | none | done | D-P1.18-1(b); BL-22 |
| T8 7-day expiry | live expired `account_exports` → 410 | clock or operator hand-date | D-P1.18-1(d); T8; ADR-088; BL-22 |
| quiet-hours | none — T9/T14 PASS | done | D-P1.19-1(b); BL-22 |
| Decisions row | none — T14 PASS | done | D-P1.19-1(d); BL-22 |
| stale voice (T16) | built `persona_profiles` + new sample → group-3 row; Monday digest once | fixture-script or paid leg; digest = clock | D-P1.19-1(e); T16; BL-22 |
| T15 `?gate=` | open approval gate → focused card + decide controls | live-leg (paid) or fixture-script | D-P1.19-1(a); T15; BL-22 |
| T7 destruction half | `project.purge` fires at +30d → hard-delete + GCS prefix | clock (exempt + 30d) or operator hand-date | D-P1.04-2; T7; BL-22 |
| defer-on-mooted → 409 | leg on stale-chip finding → 409 not 500 | live-leg ($0, needs substrate) | D-STB.5b-4; BL-78 |
| outline empty-text retry | B19B-class run reaches `approve_plan` | live-leg (paid) | D-STB.5b-5; BL-78 |
| entitlement shape | browser leg on entitled flagged tenant | live-leg (render $0 / launch paid) | D-MAINT.3-1; BL-78 |
| N9 reseat | — | done 2026-10-15 | D-OBS.1-3; BL-78 |
| nightly green on tip | first scheduled nightly green at `ffbb8ad` | clock/CI | D-OBS.1-3; BL-74-adjacent |

## Open questions

1. **jrn-a freshness:** the funded-B purge exemption covered "the evidence window" — is jrn-a still alive/exempt post-2026-10-15? If reaped, the $0 substrate legs need re-provisioning or fresh grants.
2. **Fixture seeds vs paid substrate:** do `seedWritableDossier`/`seedDeliveredRunReport` admit a *closed/mooted* obligation and an *open gate*? If not, D-STB.5b-4/T15 need a fixture-script extension or organic paid substrate.
3. **T16 path choice:** seed a `persona_profiles` row ($0) or ride a `profile_voice` run (~$1, paid)? Routing decision needed.
4. **Paid-run DB binding:** T14's DB half needs `JOURNEY_DATABASE_URL` system-role (ADR-093) — confirm the weekly workflow binds it or rows degrade to the prefix heuristic.
5. **BL-22 row wording:** still calls discharged items "residual" — needs a refresh note to prevent re-emitting.

## Spec requirements emitted

- **REQ-FIX-BL22-T8:** live expired `account_exports` token → download answers **410**; bogus still 404.
- **REQ-FIX-BL22-T7DEST:** observe `project.purge` fire at tombstone+30d → tree hard-deleted + unreferenced `artifact_versions.s3_key` GCS objects deleted.
- **REQ-FIX-BL22-T16:** persona with built profile (seed or funded build) → new sample → group-3 stale-voice row + exactly one Monday digest claim.
- **REQ-FIX-BL22-T15:** open approval gate on a test tenant → `?gate=` deep link lands `data-focused-gate` card with live decide controls.
- **REQ-FIX-BL78-5B4:** POST `defer` on a `mooted`/closed finding → **409 `obligation_not_routable`**, zero rows written, never 500.
- **REQ-FIX-BL78-5B5:** bounded B19B-class `outline` run → empty `sdk=success` triggers one `EMPTY_SUCCESS_NUDGE` re-issue → reaches `approve_plan`.
- **REQ-FIX-BL78-M31:** entitled flagged tenant — mismatched run-sheet shape → funded estimate, no `data-included`; `review/standard/base` → `Included` + entitlement claim.
