# PRB.11 — Export (md/txt/docx) and the AI-use statement (slice S1)

- **Spec:** `docs/tickets/27_PRB.11__export-and-ai-use.md`
- **Base:** `stevevitali/prb-10-quick-voice` @ `66c6bbf`
- **Branch:** `stevevitali/prb-11-export-and-ai-use` · PR TBD
- **Config:** implement-spec full preset (deterministic only — no live/dev execution; the live
  export-path leg is deferred per the standing constraints)

## Deferrals read

`docs/tickets/DEFERRALS.md` read at start. Findings:

- No `OPEN` row is unblocked by this ticket. PRB.11 consumes existing substrate (P0.01's export
  scaffold + service registry, P0.12's obligation reads incl. `sweepArrivedDeferrals` +
  `exportDialogObligations`, the PRB.02 `Converter` seam pattern) but exercises none of their
  outstanding live legs.
- **Opened `D-PRB.11-1`** — the live export leg on `dev` (api → export Cloud Run Job/service,
  download end-to-end).
- **Opened `D-PRB.11-2`** — Substack-flavoured md profile (ticket: "include if trivial, else defer
  with a note"; the spec never defines the profile's deltas, so it defers with a note).

## Requirements

1. `apps/export`: pandoc container (Typst/PDF + LaTeX → P1.18), job per export; md/txt/docx from
   canonical markdown; real docx footnotes.
2. Export dialog: format choice; open-obligation line with links (never blocking); AI-use attach
   toggle; `pre_export` deferred obligations surface at their horizon (REQ-OBJ-3).
3. AI-use statement generator: template + run facts (workflows, model tiers, dates, phases,
   approvals, human-revision versions — REQ-VIS-10); Essay/general template (REQ-POS-6/REQ-GENRE-5);
   append-only user additions; generated sentences unremovable via API; obligation-count sentence
   when open at export; standalone + docx/md attachment export.
4. Provenance appendix deferred (REQ-POS-7 → P1.18; no dialog copy about it).
5. Out of scope honored: no pdf/LaTeX/html/rtf/odt/epub/Google Docs/CSL/account zip; no Academic
   ICMJE template (P1.21).

## Acceptance criteria

- AC1 — md/txt/docx of the seeded project round-trip faithfully; docx footnotes are real footnotes
  (golden fixtures). *(deterministic)*
- AC2 — statement generated from run rows only; fixture (2 reviews + 1 revise + human-revision
  version) lists exactly those facts; user append survives regeneration; removal of generated
  sentences impossible via API (REQ-VIS-10). *(deterministic)*
- AC3 — export with open blocking obligations proceeds, shows count line, statement gains the
  obligation sentence (§11.7). *(deterministic)*
- AC4 — a `pre_export` deferred obligation surfaces in the dialog when its horizon arrives
  (REQ-OBJ-3). *(deterministic)*
- AC5 — export runs only in the isolated container (no pandoc in api/web images). *(deterministic)*

## Plan

- **`apps/export`** — real pandoc package: `export.ts` (`exportMarkdown` over an injectable
  `PandocExec`; md = canonical passthrough + Substack profile note, txt/docx via pandoc), `pandoc.ts`
  (execFile runner, `PANDOC_BIN`/`PATH` discovery), `main.ts` (job CLI + tiny `POST /export` service
  mode — one conversion per invocation), real `Dockerfile` (node runtime + pinned pandoc 3.x binary).
- **`packages/ai-use` (`@rhema/ai-use`, new)** — `facts.ts` (`collectStatementFacts`: workflows,
  model tiers, date range, phase names, approvals from `decisions`, human-revision `vN`s),
  `statement.ts` (general/Essay template → generated sentences + obligation sentence),
  `additions.ts` (append-only store read/write), `compose.ts` (`loadStatement` = generated +
  additions + standalone markdown).
- **`packages/db`** — migration `0023_ai_use.sql` (`ai_use_additions`: append-only user sentences;
  RLS + grants like `analytics_events`) + Drizzle table `schema/ai-use.ts`.
- **`apps/api`** — `export-routes.ts`: `GET /projects/:id/export/dialog` (sweep `pre_export`
  horizons → counts + items + returned ids + statement preview), `POST /projects/:id/export`
  (`{format, draftId?, attachAiUse}` → binary download via the `ExportRunner` DI seam — the
  `Converter` pattern; never blocks on obligations), `GET /projects/:id/ai-use` (+ `?format=`
  download), `POST /projects/:id/ai-use/additions` (append-only; no update/delete anywhere).
  `env.ts`/`server.ts`: `EXPORT_SERVICE_URL` → `createServiceExportRunner` live binding.
- **`packages/api-client`** — ExportDialogDto / AiUseStatementDto / `exportProject` (binary),
  `getExportDialog`, `getAiUseStatement`, `appendAiUseAddition`.
- **`apps/web`** — `ExportPage` (format radios, obligation line + links, attach toggle + statement
  preview + append field, standalone-statement link), `GET/POST /p/:project/export`,
  `POST /p/:project/export/ai-use-addition`, `GET /p/:project/export/ai-use.:fmt` download;
  project-page "Export" link; COPY.export strings (authorship-legibility only — REQ-POS-13).

## Test matrix

- `apps/export/src/export.test.ts` — format registry (md/txt/docx only; pdf etc. rejected), md
  passthrough byte-identical, txt via real pandoc (skip-if-absent), docx via real pandoc → unzip
  (jszip) → `word/footnotes.xml` carries the footnote (golden fixture). AC5 scan: no pandoc in
  api/web/worker Dockerfiles + package.jsons + no pandoc exec in api/web sources.
- `packages/ai-use/src/statement.test.ts` — facts collection over seeded rows (2 reviews + 1 revise
  + 1 human_revision → exact facts); template sentences; obligation sentence only when open;
  additions survive regeneration.
- `apps/api/src/export-routes.test.ts` — PGlite end-to-end: dialog payload (counts + pre_export
  returned + preview); POST export proceeds with open blocking obligations (real in-process runner
  for md; statement attached); statement GET/append/regenerate; DELETE/PATCH → 404.
- `apps/web` export test — SSR dialog (formats, count line, toggle, pre_export item); POST proxies
  the download.
- `packages/db` — migration parity test covers `ai_use_additions` automatically.

## Progress

- [x] Branch `stevevitali/prb-11-export-and-ai-use` from `66c6bbf`; context loaded; plan recorded.
- [x] `packages/contracts` — `domain/export.ts`: `EXPORT_FORMATS` (md/txt/docx only),
  `EXPORT_FORMAT_INFO` (pandoc target / media type / extension / label), `isExportFormat`,
  `exportFileName`, `aiUseFileName`.
- [x] `apps/export` — real package: `export.ts` (`exportMarkdown` over injectable `PandocExec`; md
  canonical passthrough, txt→`plain`, docx→`docx`; format rejected before pandoc; empty draft
  rejected), `pandoc.ts` (`execFile` runner, temp-file IO, `PANDOC_BIN`/`pandoc` discovery,
  `pandocAvailable`), `main.ts` (file-job CLI `node dist/main.js <in.md> <format> <out>` +
  `serve` mode: `GET /healthz`, `POST /export`, 32 MB cap), real `Dockerfile` (multi-stage pnpm
  build → `node:22-bookworm-slim` runtime + pinned pandoc 3.10 static binary, non-root `export`
  user).
- [x] `packages/ai-use` (new `@rhema/ai-use`) — `facts.ts` (`collectStatementFacts`: runs →
  workflow/tier/rigor/dates, `steps` → phase names, `decisions`×`gates` → approvals, `drafts`
  `origin='human_revision'` → version `n`s, `projects.protocol_id`/`venue`), `statement.ts`
  (general/Essay template — `generatedSentences` order: intro → runs+span → tiers → phases →
  approvals → human revisions → obligation count), `additions.ts` (`listAdditions`,
  `appendAddition`, `AdditionError`), `compose.ts` (`loadStatement`, `statementMarkdown`,
  `attachmentSection`).
- [x] `packages/db` — migration `0023_ai_use.sql` (`ai_use_additions`: tenant-keyed, FORCE RLS,
  tenant policy, `grant select, insert` only — append-only below the API) + Drizzle table
  `schema/ai-use.ts` + barrel export.
- [x] `apps/api` — `export-routes.ts`: `ExportRunner` seam + `createServiceExportRunner`
  (POST `{markdown,format}` → `EXPORT_SERVICE_URL`); `GET /projects/:id/export/dialog` (sweeps
  `pre_export` horizons → `exportDialogObligations` counts + linkable items + `returnedIds` +
  statement preview); `POST /projects/:id/export` (`{format,draftId?,attachAiUse}` → head
  resolution via `resolveEditorHead` + `versionText` → binary download; 503 `export_not_wired`
  when unbound; never blocks on obligations); `GET /projects/:id/ai-use` (JSON or `?format=`
  standalone download); `POST /projects/:id/ai-use/additions` (the ONLY statement write — no
  update/delete route exists). `env.ts` `EXPORT_SERVICE_URL`; `server.ts` live binding; mounted
  in `index.ts`.
- [x] `packages/api-client` — `ExportFormatDto`/`ExportObligationDto`/`AiUseStatementDto`/
  `ExportDialogDto`/`ExportRequestDto`/`ExportDownloadDto`/`AiUseAdditionDto` +
  `getExportDialog`, `exportProject` (binary), `getAiUseStatement`, `downloadAiUseStatement`,
  `appendAiUseAddition`.
- [x] `apps/web` — `ExportPage` (format radios, obligation line + per-item links to the filing
  review dossier, `pre_export`-returned marker, attach toggle + statement preview + append-only
  addition form, standalone-statement links); `GET/POST /p/:project/export`,
  `POST /p/:project/export/addition`, `GET /p/:project/export/ai-use/:fmt`; project-page Export
  link; `COPY.export` (authorship-legibility only — REQ-POS-13).
- [x] `infra/pulumi` — `export` first in `CLOUD_RUN_SERVICES`; the api container gets
  `EXPORT_SERVICE_URL` = the export service uri.
- [x] Root `tsconfig.json` references `packages/ai-use`; `apps/api` package/tsconfig updated.
- [x] Tests green (see Evidence log).

## Gap table

| Requirement / AC | Status | Evidence |
|---|---|---|
| `apps/export` pandoc container (Typst/PDF+LaTeX → P1.18); job per export | met | `apps/export/{export,pandoc,main}.ts` + `Dockerfile` (pinned pandoc 3.10, non-root); job CLI mode (`main.ts` file args) + `serve` mode (`POST /export`) — the api's synchronous download path uses serve; the job-per-export leg binds GCS at deploy (D-PRB.11-1) |
| md/txt/docx from canonical markdown; docx footnotes real | met | `export.ts` (md passthrough byte-identical; txt→`plain`; docx→`docx`); `export.test.ts` docx golden unzips `word/footnotes.xml` + asserts `footnoteReference` (real pandoc leg ran — 11/11) |
| Export dialog: format choice; obligation line + links, never blocking | met | api `GET /export/dialog`; web `ExportPage` — `exportDialogObligations` counts are informational only |
| `pre_export` deferred obligations surface at the horizon (REQ-OBJ-3) | met | `sweepArrivedDeferrals` on the dialog read + the export POST; `returnedIds` marked in the UI |
| AI-use generator: template + run facts (REQ-VIS-10) | met | `packages/ai-use` — facts from run/step/decision/draft rows only; general template |
| Append-only user additions; generated sentences unremovable via API | met | `ai_use_additions` grants select+insert only; the only write route is `POST …/additions`; DELETE/PATCH → 404 (tested) |
| Obligation-count sentence when open at export | met | `generatedSentences` tail sentence; attached export carries it (`export-routes.test.ts` AC3) |
| Statement standalone + docx/md attachment export | met | `GET /projects/:id/ai-use?format=md|txt|docx` + `attachAiUse` on the export POST (all formats) |
| Provenance appendix deferred; dialog copy silent on it | met | no provenance-appendix surface; `COPY.export` says nothing about it (REQ-POS-7 → P1.18) |
| Out of scope: pdf/LaTeX/html/rtf/odt/epub/GDocs/CSL/zip; ICMJE (P1.21) | met | `EXPORT_FORMATS` is exactly md/txt/docx; `templateForProtocol` returns `general` for every protocol |
| AC1–AC5 | met | see Evidence report |
| Substack-flavoured md profile | deferred | D-PRB.11-2 (ticket: "include if trivial, else defer with a note" — the spec defines no profile deltas) |
| Live export deploy leg | deferred | D-PRB.11-1 (api → export service on `dev`; image build + download e2e) |

## Evidence log

- `pnpm turbo build lint typecheck` — **111/111 tasks** (incl. new `@rhema/ai-use`, `@rhema/export`
  build+lint+typecheck; `eslint` clean — canonical-vocabulary lint passed on all new copy).
- `pnpm test` — **260 files, 1881 pass / 2 skip** (the new suites: `apps/export` export.test.ts 11
  incl. the real-pandoc docx footnote golden, `packages/ai-use` statement.test.ts 7, `apps/api`
  export-routes.test.ts 8, `apps/web` export.test.ts 5).
- `pnpm check:licenses` — OK (502 pkgs; `jszip` devDep, MIT).
- `pnpm check:protocol-markers` — OK (39 public-facing files scanned).
- `bash ~/agent-skills/skills/build-memory/scripts/check-build-memory.sh .` — 0 violations.
- `pandoc --version` on the dev machine → real-binary legs ran (not skipped): txt plain round-trip +
  docx `word/footnotes.xml`/`footnoteReference` golden.

## Evidence report

- **AC1 (md/txt/docx round-trip; docx real footnotes; golden)** — `apps/export/src/export.test.ts`:
  registry is exactly md/txt/docx (pdf/latex/html/rtf/odt/epub/gdoc/zip rejected pre-pandoc); md
  returns the canonical bytes untouched; deterministic `PandocExec` injection proves `-f markdown →
  -t plain|docx` wiring; the real-pandoc legs assert the txt plain output and unzip the docx —
  `word/footnotes.xml` carries both footnote bodies and `document.xml` references them via
  `footnoteReference` (never flattened `[^n]`).
- **AC2 (statement from run rows only; exact facts; append survives; no API removal)** —
  `packages/ai-use/src/statement.test.ts` over PGlite: the 2-reviews + 1-revise + 1
  human-revision fixture lists exactly those facts (workflows, tiers, date span, phases, approvals,
  `v2` human revision); `api/export-routes.test.ts` proves additions persist across regeneration and
  that no update/delete route exists (DELETE `/ai-use` and PATCH `/additions` → 404). Generated
  sentences are recomputed per read — there is no stored generated text to mutate.
- **AC3 (export proceeds with open blocking obligations; count line; obligation sentence)** —
  `export-routes.test.ts`: `POST /export` answers 200 with a blocking obligation open; the dialog
  reports `"N blocking obligations open"`; with `attachAiUse` the runner receives the manuscript +
  `## AI-use statement` section containing `"1 review obligation remained open, 1 of them blocking"`.
- **AC4 (`pre_export` deferral surfaces at the horizon)** — `export-routes.test.ts`: a
  `defer{until:"pre_export"}` obligation returns to `open` on the dialog read (`returnedIds`), is
  counted + linked, and stays open on re-read (one-way arrival).
- **AC5 (pandoc only in the export image)** — `export.test.ts` scans every other service
  Dockerfile (no pandoc), every api/web/worker `package.json` (no pandoc dep), and api/web/worker
  sources (no pandoc exec); the api reaches conversion only through the `ExportRunner` HTTP seam.
- **Cross-cutting** — export never blocks (Q-9/§11.7: the POST has no obligation precondition);
  dialog copy is authorship-legibility only (REQ-POS-13; the canonical-vocabulary lint is clean);
  the canonical way out is byte-faithful md (Q-9).
