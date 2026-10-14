# c_fixture-substrate — Owed-leg substrate requirements
**Stream:** C · **Researched:** 2026-10-15 · **Ledger rows covered:** C1–C4 · **Confidence:** high

Headline: none of the four legs is owed on *missing fixture substrate* in the simple sense. T17 is a harness/product timing gap, P1.dossier is a spec-vs-deployed divergence needing a triage leg, T8 needs an operator-gated mint script, and T13F is a **confirmed fixture gap** (seed never writes `findings.anchor` + wrong `suggestion` shape); T12F is most likely a repaint race or a POST failure to classify.

### F1 — T17 (source-view canonical markdown): blocker is code/harness timing, not a fixture
The leg builds its own substrate (`createDraftProject` → `FREE_FIXTURE` → `/v/working`) and asserts `[data-source-host] .cm-content` ⊇ canonical markdown. Live failure at `ffbb8ad`: "the source view did not seed the canonical markdown". Root cause: `page-mount.tsx:206-218` — with `collabUrl` present the EditorState binds an initially-empty Y.Doc fragment; `docToMarkdown` of the empty doc = `""`; `onTransaction` re-seeds a beat later when remote sync lands — the step reads the buffer the instant `.cm-content` turns visible, pre-hydration. **Artifact:** code — leg-side wait for doc content before toggling, or product-side defer seed/toggle until hydrated. Owning rows: D-SPA.25-1, BL-80, BL-83.

### F2 — P1.dossier (phone bulk-affordance): ruling already exists — live behavior diverges
`rhema-design-spec.md:1675-1676` (§10.1): phone dossier = dispositions+notes yes; **bulk ✗, Apply ✗** — withhold = never mount. Implementation intends it (`dossier-view.tsx` compact arm only emits `data-bulk-controls` when `!compact`; `compact` from boot `deviceClass`). Live miss at `ffbb8ad` (two reports): bulk controls mounted on the 390×844 phone leg → implies `compact===false` at render or deployed-image lag. **Triage leg first** — record `data-device`/`data-renderer`: `phone`+`spa`+bulk-present ⇒ genuine leaf defect; `ssr` ⇒ image lag; `desktop` ⇒ harness header gap. Open sub-decision: extend the assert to `[data-apply]` (§10.1 withholds it too, leg doesn't check). Owning: D-SPA.21-1, BL-80/22-adjacent.

### F3 — T8 (expired-token 410): clock-owed; unblock = operator-approved backdated mint script
`GET /export/download?token=` — `account_export-routes.ts:179-199`: `expires_at <= now → 410` checked before `presignGet` (s3_key needn't be real). `account_exports` schema `0038_account_export.sql`; FORCE RLS → system DSN write. ADR-088 rejects agent self-minting — needs the operator tick. Precedent script: `reseat-n9-fixture.mjs` shape (is_test guard, --dry-run, idempotent). Options: (a) insert backdated row on jrn-a, (b) UPDATE `expires_at` on a real T3-produced row, (c) purge exemption + clock. Note: **no dedicated DEFERRALS row records the fire date** T8's error cites — bookkeeping gap. Owning: D-P1.18-1(d), BL-22, BL-71.

### F4 — T12F/T13F: substrate exists (seedWritableDossier, gated on JOURNEY_DATABASE_URL); T13F is a confirmed fixture gap, T12F pending classification
- **T13F — confirmed:** `applyGate` refuses `anchor == null` ("unanchored" → no `[data-apply]`), but `seedDossierProject`'s findings insert (`showcase.ts:549-566`) writes **no anchor**; and fixture `suggestion:{action:"replace",text}` vs contract `{replacement}` (`contracts/src/domain/findings.ts:63`, `finding-routes.ts:229-234` splices `.replacement`). Anchor must resolve on the **V2 working head**, not reviewed v1. Fix: extend `SHOWCASE_FIXTURE_FINDINGS[0]` with `{replacement}` + V2-resolvable anchor; consider asserting it in `assertShowcaseFixture`.
- **T12F — pending:** `?obligated=` notice — either a `.count()`-before-repaint race (`stb5a.ts:1193-1194` checks immediately after `waitForURL`) or the obligations POST threw (`bffFail` navigates nowhere). One logged re-run classifies it.

## Open questions
1. T17 ownership: leg-side wait vs product-side deferred seed (self-heals via onTransaction — ordering fix may suffice).
2. P1.dossier: capture `data-device`/`data-renderer` on failure; extend assert to `[data-apply]`?
3. T8 mint authority: insert backdated row vs update a real row vs purge exemption (a/b need no schema work; c is infra/policy).
4. T8 bookkeeping: dedicated DEFERRALS row for the mint recipe + fire date.
5. T12F: race vs POST failure — one logged re-run classifies.
6. Fixture drift guard: pin the suggestion-bearing anchor in `assertShowcaseFixture`?

## Spec requirements emitted
- **REQ-FIX-T17:** Source toggle must not assert a seed before Y.Doc hydration — leg awaits doc content in `[data-page-view]` first, or mount defers seed/toggle until populated.
- **REQ-FIX-P1D:** `deviceClass=phone` → zero `[data-bulk-controls]` in DOM; triage records `data-device`/`data-renderer` on failure; decide `[data-apply]` assert.
- **REQ-FIX-T8:** operator-approved script (reseat-pattern guards) writes a hand-dated `account_exports` row → T8 asserts 410; record dedicated DEFERRALS row.
- **REQ-FIX-T13F:** `seedDossierProject` writes `findings.anchor` (V2-resolvable) + contract `{replacement}` suggestion; pin the invariant in `assertShowcaseFixture`.
- **REQ-FIX-T12F:** wait-for-attach (or response-status capture) so repaint lag can't masquerade as a missing notice; if POST fails live, file the product defect.

*Parent actions: run the P1.dossier triage leg and one logged T12F re-run before spec-time (both need live browser).*
