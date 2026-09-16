# PRB.10 — Optional inline Quick Voice

- **Spec:** `docs/tickets/26_PRB.10__quick-voice.md`
- **Base:** `stevevitali/prb-09-email-notifications` @ `f7b712f`
- **Branch:** `stevevitali/prb-10-quick-voice` · PR #38
- **Config:** implement-spec full preset (deterministic only — no live/dev execution; AC1's live
  leg deferred to D-PRB.10-1)

## Deferrals read

`docs/tickets/DEFERRALS.md` read at start. Findings:

- No `OPEN` row was unblocked by this ticket — the Quick Voice work consumes existing substrate
  (P0.03 persona bootstrap, P0.08 persona runs, PRB.02's upload pipeline, PRB.03's sheet) but
  exercises none of their outstanding live legs.
- **Opened `D-PRB.10-1`** — AC1's live/dev leg (a real `profile_voice{tier:quick}` run on `dev`
  writing `persona_profiles` + derived artifacts with the pill settling on *Untested voice*).
  Every deterministic leg is proven; live execution is prohibited by the standing constraints.

## Requirements

1. Creation sheet (beta subset): name (+ optional byline), optional description, upload/paste
   samples through PRB.02's ingestion/converter seam (REQ-INGEST-1/4/10), Quick estimate refreshed
   on sample changes (REQ-PERSONA-3), Mode selector as metadata + one-line AUP (REQ-PERSONA-27),
   `Create and build` → `profile_voice{tier:quick}`.
2. One shared pill function over snapshot facts (REQ-PERSONA-13/14); minimal detail page: seed
   editor with J9 hash recomputation on save, agent-drafted marker until first user edit
   (REQ-PERSONA-4), samples include/omit, build history.
3. Run-sheet voice line: linked voice + pill + optional "Update voice first (≈N cr)" chained
   action; stale/untested never blocks (REQ-PERSONA-17); delivered notes record the profile
   snapshot date (REQ-PERSONA-20).
4. Project link: voice picker (No voice = ad-hoc default), `projects.persona_profile_snapshot_id`
   pinning, REQ-DATA-32 API shape.
5. Derived profile artifacts reject API writes (405, `editMode: "none"`); no cookie/session-token
   input anywhere in connection UI or schema (AC-I-B).

Out of scope: full Profile/calibration/hold-outs, staleness states 5/7, Update-voice scope routing,
publication connectors, composites, house styles, the Voices workspace (P1.14/P1.15), trial voice
limits (P1.16).

## Plan / what landed

- **`@rhema/findings-core`** — new `voice-status.ts`: the J9 seed hash
  (`sha256` over NFC-normalized, trimmed `description ‖ byline ‖ registers` — mode, corpus pointer,
  and the agent-authored note excluded), the order-independent sample-set hash, and
  `deriveVoiceStatus` — the ONE status assembler over a stored `persona_profiles` snapshot + the
  persona's current facts (read-time only; no persisted stale flag). Eight states
  (`never_built / building / seed_changed / samples_changed / aged / unfalsified / badly_off /
  fresh`); the beta-reachable set is five. **Precedence note:** `building` is checked before
  `never_built` — a first build must pill *Building*, not *No voice profile*. `voice-status.test.ts`
  is the AC2 property test: identical `pill{label,tone}` + primary action + deltas across every
  beta-reachable state × all four surfaces (library, detail, project chip, run sheet).
- **`@rhema/db`** — migration `0022_quick_voice.sql`: additive `correspondence_items` columns
  `persona_profile_snapshot_id`, `persona_snapshot_at`, `voice_mode` (the delivered note's frozen
  voice facts, REQ-PERSONA-17/20). No backfill. Drizzle parity in `schema/correspondence.ts`.
- **`@rhema/orchestrator`** —
  - `runspec.ts`: a phase marked `optional: "quick"` is dropped when `inputs.tier === 'quick'` —
    Quick Voice runs census → close reading → voice → package (4 phases; substance + calibration
    omitted). The manifest `of` stays the full length so the package-delivery trigger holds.
  - `internal-api.ts` (`finalizeRun`): a completed `profile_voice | refresh_voice |
    calibrate_voice` run catalogs its `persona_profiles` row from the facts **frozen into
    `inputs.snapshot` at creation** (never re-derived from mutable persona state) + the artifact
    ids the committed steps produced; `personas.current_profile_id` points at it and
    `active_run_id` clears — all inside the finalize transaction. A Quick build's resting
    `calibration_status` is `'untested'` (§9.3 row 6).
  - `delivery.test.ts`: the delivered correspondence row carries the frozen
    `persona_profile_snapshot_id`/`persona_snapshot_at`/`voice_mode`.
- **`@rhema/mirror`** — `delivery.ts` stamps the three voice fields on the correspondence row at
  delivery from `runs.inputs.voice`.
- **`apps/api`** —
  - `voice-routes.ts`: `POST /voices` (create + optional samples + optional immediate build),
    `GET /voices`, `GET /voices/:personaId` (status + samples + build history + profile artifacts),
    `POST /voices/:id/samples` (paste text or `quarantineKey` → PRB.02 convert seam → connection +
    `discovered_items` + `sample_versions` v1, inserted parent-first), `PATCH
    /voices/:id/samples/:itemId` include/omit (RLS-checked persona lookup before the update —
    `connections`/`discovered_items` aren't in the general RLS set), `POST /voices/:id/seed`
    (PERSONA.md version + live J9 recompute; first user edit clears the agent-drafted marker),
    `GET /voices/:id/estimate` (Quick `40 + 0.012·words`), `POST /voices/:id/build`
    (`profile_voice{tier}` run; ≥1 sample; one active voice build per persona → 409), `PUT
    /artifacts/:vid` → **405 + `editMode`** for derived kinds (§9.5 row 36), `GET/PATCH
    /projects/:id/voice` (link / pin snapshot / unlink — REQ-DATA-32).
  - `voice-status.ts`: the api-side assembler — loads the persona + current profile + sample set +
    active build run, calls `deriveVoiceStatus`, returns the shared pill.
  - `run-routes.ts`: run creation freezes `inputs.voice = {mode, personaId, profileSnapshotId,
    snapshotAt}` — the project's pinned snapshot wins; unpinned resolves + persists the latest
    profile; a linked persona lands on `runs.persona_id`; a stale/untested/never-built voice never
    blocks (REQ-PERSONA-17); ad-hoc is an explicit mode, not an absent field.
  - `project-list.ts`: `ProjectRow.voice` carries the linked persona + shared pill for the
    project chip.
- **`@rhema/api-client`** — voice DTOs + methods (`listVoices`, `getVoice`, `createVoice`,
  `addVoiceSample`, `patchVoiceSample`, `saveVoiceSeed`, `getVoiceEstimate`, `buildVoice`,
  `getProjectVoice`, `patchProjectVoice`, `putArtifact`); `ProjectRow` gains `voice`.
- **`@rhema/run-sheet` + `@rhema/ui`** — `profiles.ts` gains the `profile_voice` sheet profile
  (tier = estimator variant, Base default); `view.ts`/`run-sheet.tsx` render the §9.6 voice line —
  linked voice name + shared pill + the priced "Update voice first (≈N cr)" chained action, or the
  ad-hoc default labeled in the note; never a gate.
- **`apps/web`** — `/voices` library, `/voices/new` creation sheet (Mode metadata + one-line AUP;
  file input for .md/.txt/.html uploads → quarantine key, or paste), `/v/:persona` detail (seed
  editor + agent-drafted mark + include/omit + run history + read-only profile artifacts), the
  project voice picker on `/p/:slug`, the run-sheet voice line; `data.ts`/`server.ts` delegate to
  the api-client (older test fakes without `getProjectVoice` fall back to `null`).

## Test matrix

| AC / requirement | Test |
|---|---|
| AC1 (live/dev leg) | **DEFERRED — D-PRB.10-1**; every leg asserted from PGlite rows: sample ingest → `profile_voice` run creation with frozen snapshot facts → Quick phase set (runspec) → `persona_profiles` write (finalize) → `unfalsified` pill |
| AC2 pill property: beta states × surfaces identical | `findings-core/voice-status.test.ts` — one fixture snapshot; identical `pill{label,tone}`/action/deltas per state across library/detail/project-chip/run-sheet projections |
| AC3 seed edit → hash recompute → live pill flip + agent-drafted mark | `api/voice-routes.test.ts` (POST seed → `seed_changed` until rebuild; marker clears on first user edit) + `web/voice-surfaces.test.ts` (detail renders the mark) |
| AC4 stale/never-built never blocks + note records snapshot date | `api/voice-routes.test.ts` (run creation with stale/never-built voice succeeds; `inputs.voice` frozen) + `orchestrator/delivery.test.ts` (correspondence stamp) |
| AC5 derived artifacts 405 | `api/voice-routes.test.ts` — `PUT /artifacts/:vid` on a `voice_print` → 405 `{editMode:"none"}` |
| AC-I-B no cookie/session-token | `api/voice-routes.test.ts` — schema grep over `connections`/`personas` + the sample UI assert nothing cookie-shaped exists |
| Building precedence | `findings-core/voice-status.test.ts` — active build run pills `Building` even with no prior snapshot |
| Duplicate build → 409 | `api/voice-routes.test.ts` — second `POST /build` while one is active → 409 |
| Project pin + ad-hoc | `api/voice-routes.test.ts` — `PATCH /projects/:id/voice` link/pin/unlink; ad-hoc mode explicit |
| Cross-tenant sample toggle | `api/voice-routes.test.ts` — include/omit on another tenant's item rejected |

## Gap table

| # | Requirement / AC / invariant | Status | Evidence |
|---|---|---|---|
| R1 | Creation sheet: name/byline/description + upload/paste + Mode + AUP + Create-and-build | met | `apps/web` `/voices/new`; `POST /voices` + `POST …/build`; file input → quarantine seam |
| R2 | PRB.02 pipeline seam (connection → discovered_item → sample) | met | `POST /voices/:id/samples`; parent-first insert; convert path reused |
| R3 | Quick estimate on sample changes (REQ-PERSONA-3) | met | `GET /voices/:id/estimate` recomputes from the included sample set |
| R4 | One pill function, beta states (REQ-PERSONA-13/14) | met | `deriveVoiceStatus`; property test across states × surfaces |
| R5 | Seed editor + J9 hash + agent-drafted mark (REQ-PERSONA-4) | met | `POST …/seed` recomputes; first user edit clears the mark |
| R6 | Include/omit + build history + minimal facts | met | `PATCH …/samples/:itemId`; `GET /voices/:id` history rows |
| R7 | Run-sheet voice line + "Update voice first" + never-blocks (REQ-PERSONA-17/20) | met | `run-sheet.tsx` voice line; run-creation freeze ignores staleness |
| R8 | Project pin (REQ-DATA-32) + ad-hoc default | met | `GET/PATCH /projects/:id/voice`; `inputs.voice.mode` |
| R9 | Delivery stamps snapshot id/date + voice_mode | met | migration 0022 + `mirror/delivery.ts` + `delivery.test.ts` |
| AC1 | Quick Voice e2e on dev | **deferred** | D-PRB.10-1 (live/dev prohibited; all legs asserted deterministically) |
| AC2–AC5, AC-I-B | see test matrix | met | above |
| INV | No "writes like you" copy; Mode gates nothing; no method-IP in surfaces | met | copy vocab-lint green; Mode is metadata-only |
| OOS | No full Profile/calibration/hold-outs/workspace/composites/house styles | met (absent) | none added |

### Gaps found during review (all closed)

- **`building` shadowed by `never_built`** — the spec's table lists never-built first; a first
  build then pilled *No voice profile*. `deriveVoiceStatus` now checks the active build run before
  the no-snapshot state.
- **Cross-tenant sample toggle** — `connections`/`discovered_items` aren't in the general RLS set;
  the include/omit route now does an RLS-checked persona lookup before updating the item.
- **`persona_profiles` snapshot fixture** — a seed test's stored snapshot didn't mirror the
  persona's current seed hash; fixture corrected (status went `seed_changed` as designed).
- **File upload gap** — creation/detail initially offered paste only while the API already
  accepted `quarantineKey`; file inputs added with multipart handling.
- **Older web test fakes** lacked `getProjectVoice` — the server safely falls back to `null`.
- **Lint:** `let title` → `const`.

## Evidence log

- `pnpm turbo build lint typecheck` → **108/108** tasks green.
- `pnpm test` (full suite) → **1849 passed / 2 skipped / 256 files (+1 skip file)**, zero failures.
- `pnpm check:protocol-markers` → OK (39 public-facing files scanned).
- `pnpm check:licenses` → OK (502 packages; no new third-party deps).
- Focused: `findings-core/voice-status.test.ts` + `api/voice-routes.test.ts` +
  `web/voice-surfaces.test.ts` → 13 files / 122 tests green; `orchestrator/delivery.test.ts` 5
  green; `runspec.test.ts` quick-vs-full green.
- `bash ~/agent-skills/skills/build-memory/scripts/check-build-memory.sh .` → run at close-out
  (below).
- Live verification: NOT RUN — deterministic only; **no live/dev execution** (D-PRB.10-1).

## Evidence report

**What landed.** The beta's minimal voice path end-to-end: a voice is a `personas` row with a
PERSONA.md seed (J9-hashed on every save), samples ride the PRB.02 connection → discovered_item →
sample_versions model (paste or upload → quarantine → convert), `Create and build` opens a
`profile_voice{tier:"quick"}` run that drops substance + calibration at the runspec (4 phases),
`finalizeRun` catalogs the `persona_profiles` snapshot from the frozen `inputs.snapshot` facts and
points `current_profile_id` at it, and the ONE `deriveVoiceStatus` pills the same
`{label,tone}` on the library, detail page, project chip, and run sheet. Projects pin a snapshot
(`persona_profile_snapshot_id`, REQ-DATA-32); run creation freezes `inputs.voice` — pinned wins,
unpinned resolves-and-persists the latest profile, stale/untested/never-built never blocks, and
ad-hoc is an explicit mode. Delivered notes stamp `persona_profile_snapshot_id` /
`persona_snapshot_at` / `voice_mode` (migration 0022). Derived profile artifacts reject writes at
the API (405 + `editMode`); no cookie/session-token input exists in the connection UI or schema.

**Not shipped (correctly):** full Profile + calibration + hold-outs, staleness states 5/7
(`aged`/`badly_off`/`fresh` exist in the state machine but are unreachable at beta), Update-voice
scope routing, publication connectors, composites, house styles, the Voices workspace surface,
trial voice limits — P1.14/P1.15/P1.16.

**Deferrals:** opened **D-PRB.10-1** (AC1's live/dev leg); closed none (no OPEN row unblocked).
