# PRB.10 — Optional inline Quick Voice

**Spec:** `docs/tickets/26_PRB.10__quick-voice.md` (REQ-PERSONA-2 subset / 3 / 4 / 13 / 14 beta
states / 17 / 20 / 27, REQ-INGEST-1 / 4 / 10, REQ-DATA-32, REQ-VIS-8 beta half; §9.2–§9.6)
· **Base:** `stevevitali/prb-09-email-notifications` · **Stacked PR — do not merge
(mergePolicy=OPERATOR).** · **PR #38**

## Summary

The beta's "optional inline Quick Voice" (§17 beta row): the minimal voice experience so a Revise
run can bind a measured register — without any of the full Voices surface (P1.14/P1.15). A voice
is a `personas` row with a PERSONA.md seed (J9-hashed), samples ride the PRB.02 connection →
discovered_item → sample_versions model, `Create and build` opens a `profile_voice{tier:"quick"}`
run, and **one shared `deriveVoiceStatus`** renders the same pill on every surface. Projects pin a
profile snapshot; run creation freezes the voice facts into `inputs.voice`; delivered notes record
the snapshot id/date + voice mode. **AC1's live/dev leg is deferred (D-PRB.10-1)** — every leg is
asserted from PGlite rows; live execution is prohibited by the standing constraints.

## What changed

- **`@rhema/findings-core`** — `voice-status.ts`: the J9 seed hash (`sha256` over NFC-normalized,
  trimmed `description ‖ byline ‖ registers`), the order-independent sample-set hash, and the ONE
  status assembler over a stored `persona_profiles` snapshot + current facts — 8-state precedence,
  read-time only (no persisted stale flag). `building` is checked before `never_built` so a first
  build pills *Building*. `voice-status.test.ts` is the AC2 property test (identical pill across
  beta-reachable states × all four surfaces).
- **`@rhema/db`** — migration `0022_quick_voice.sql`: additive `correspondence_items` columns
  `persona_profile_snapshot_id` / `persona_snapshot_at` / `voice_mode` + Drizzle parity.
- **`@rhema/orchestrator`** — `runspec.ts` drops `optional:"quick"` phases when
  `inputs.tier === 'quick'` (Quick Voice = census → close reading → voice → package; `of` stays the
  manifest length so the delivery trigger holds); `finalizeRun` writes the `persona_profiles` row
  from the facts frozen into `inputs.snapshot` + the committed steps' artifact ids, points
  `current_profile_id`, clears `active_run_id` — inside the finalize transaction.
- **`@rhema/mirror`** — `delivery.ts` stamps the three voice fields on the delivered
  correspondence row from `runs.inputs.voice`.
- **`apps/api`** — `voice-routes.ts` (`POST/GET /voices`, `GET /voices/:id` detail,
  `POST …/samples` paste-or-quarantineKey through the PRB.02 convert seam, `PATCH …/samples/:itemId`
  include/omit with an RLS-checked persona lookup, `POST …/seed` J9 recompute + agent-drafted mark,
  `GET …/estimate` Quick `40 + 0.012·words`, `POST …/build` ≥1 sample + one-active-build → 409,
  `PUT /artifacts/:vid` → **405 + `editMode`** for derived kinds, `GET/PATCH /projects/:id/voice`);
  `voice-status.ts` api-side assembler; `run-routes.ts` freezes `inputs.voice` at creation (pin
  wins → unpinned resolves + persists → ad-hoc explicit; staleness never blocks) + propagates
  `runs.persona_id`; `project-list.ts` `ProjectRow.voice` chips.
- **`@rhema/api-client`** — voice DTOs + methods; `ProjectRow.voice`.
- **`@rhema/run-sheet` + `@rhema/ui`** — `profile_voice` sheet profile (tier = estimator variant,
  Base default) + the §9.6 voice line (linked name + shared pill + priced "Update voice first
  (≈N cr)" chained action, or the ad-hoc default; never a gate).
- **`apps/web`** — `/voices` library, `/voices/new` creation sheet (Mode metadata + one-line AUP;
  .md/.txt/.html upload or paste), `/v/:persona` detail (seed editor + agent-drafted mark +
  include/omit + run history + read-only profile artifacts), the project voice picker on
  `/p/:slug`, the run-sheet voice line.

## Design decisions

- **Read-time staleness.** The pill diffs the stored snapshot's `seed_sha256` /
  `sample_set_hash` against the persona's current facts at read time — no persisted stale flag, no
  staleness jobs at beta (§9.3 rows 5/7 stay P1.14).
- **Building beats never-built.** A first build must pill *Building*, not *No voice profile* — the
  active-run check precedes the no-snapshot check (the spec's table order would shadow it).
- **Freeze at creation, stamp at delivery.** `inputs.voice` is frozen when the run is created
  (project pin wins; unpinned resolves + persists the latest profile); the delivered note records
  the frozen snapshot id + date + mode (REQ-PERSONA-17/20).
- **Tenancy.** `connections`/`discovered_items` aren't in the general RLS set, so the
  include/omit route performs an RLS-checked persona lookup before mutating.

## Out of scope (as specced)

Full Profile + calibration + hold-outs, staleness states 5/7, Update-voice scope routing,
publication connectors, composites, house styles, the Voices workspace surface (P1.14/P1.15),
trial voice limits (P1.16).

## Test plan

- **AC1** live/dev e2e — **DEFERRED (D-PRB.10-1)**; legs asserted: sample ingest →
  `profile_voice{tier:quick}` run creation with frozen snapshot facts → Quick phase set
  (`runspec.test.ts`) → `persona_profiles` write (finalize) → `unfalsified` pill.
- **AC2** `findings-core/voice-status.test.ts` — pill identical across beta states × surfaces.
- **AC3** `api/voice-routes.test.ts` + `web/voice-surfaces.test.ts` — seed save recomputes J9,
  flips the pill live, agent-drafted mark until first user edit.
- **AC4** `api/voice-routes.test.ts` + `orchestrator/delivery.test.ts` — stale/never-built never
  blocks; the delivered note records the snapshot date + mode.
- **AC5** `api/voice-routes.test.ts` — derived `voice_print` artifact write → 405
  `{editMode:"none"}`.
- **AC-I-B** schema + UI grep — nothing cookie/session-token-shaped exists.
- Gates: `turbo build lint typecheck` **108/108**; `pnpm test` **1849 pass / 2 skip / 256 files**;
  `check:protocol-markers` OK; `check:licenses` OK (502 pkgs, zero new deps). **No live/dev
  execution — AC1's live leg is D-PRB.10-1.**
