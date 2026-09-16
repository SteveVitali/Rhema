# PRB.11 — Export (md/txt/docx) and the AI-use statement

**Spec:** `docs/tickets/27_PRB.11__export-and-ai-use.md` (REQ-VIS-10, REQ-POS-6, REQ-GENRE-5
generator core, §13.4 beta formats, REQ-OBJ-3 `pre_export` horizon, REQ-OBJ-6 export-dialog half;
§8.4, §11.7, Q-9)
· **Base:** `stevevitali/prb-10-quick-voice` · **Stacked PR — do not merge
(mergePolicy=OPERATOR).** · **PR #39**

## Summary

Getting work out, disclosed. The isolated `export` container is now real — pandoc 3.10 pinned in
its own image, md/txt/docx from canonical markdown, docx footnotes land as REAL footnotes
(`word/footnotes.xml`, never flattened text). The api holds only an `ExportRunner` seam (the
PRB.02 `Converter` pattern): it POSTs `{markdown, format}` to `EXPORT_SERVICE_URL` and streams the
bytes back — **no service image but `export` carries pandoc** (AC5, asserted by repo scan). The
export dialog lists formats, shows the never-blocking obligation line with links to the filing
dossiers, sweeps `pre_export` deferral horizons, previews the AI-use statement, and carries the
attach toggle. The statement itself is **generated from run rows on every read** — workflows,
model tiers, dates, phases, approvals, human-revision versions, the open-obligation count — plus
the author's append-only additions (`ai_use_additions` grants select+insert only; no update/delete
route exists anywhere). The live `dev` deploy leg is deferred (**D-PRB.11-1**); the
Substack-flavoured md profile defers per the ticket's own escape hatch (**D-PRB.11-2**).

## What changed

- **`@rhema/contracts`** — `domain/export.ts`: the single format registry (`EXPORT_FORMATS` =
  md/txt/docx exactly), per-format facts (`pandocTarget`/`mediaType`/`extension`/label), the
  download-filename helpers. Api validation, the web dialog, and the container read one table.
- **`apps/export`** — `export.ts` (`exportMarkdown` over an injectable `PandocExec`; md is the
  canonical bytes untouched — export is the only way out and must be byte-faithful, Q-9);
  `pandoc.ts` (`execFile` runner, `PANDOC_BIN` discovery, `pandocAvailable`); `main.ts` (file-job
  CLI + `serve` mode `POST /export`); real `Dockerfile` (multi-stage pnpm build →
  `node:22-bookworm-slim` + pinned pandoc 3.10 static binary + non-root `export` user; no DB, no
  secrets).
- **`@rhema/ai-use` (new)** — `facts.ts` (`collectStatementFacts` — run rows, step phases, gate
  decisions, `human_revision` draft `n`s, `protocol_id`), `statement.ts` (the general/Essay
  template; the Academic ICMJE template is P1.21), `additions.ts` (append-only), `compose.ts`
  (`loadStatement`, `statementMarkdown` standalone vs section, `attachmentSection`).
- **`@rhema/db`** — migration `0023_ai_use.sql` (`ai_use_additions`: tenant-keyed, FORCE RLS,
  `grant select, insert` only — append-only enforced below the API) + Drizzle parity table.
- **`apps/api`** — `export-routes.ts`: `GET /projects/:id/export/dialog` (sweeps `pre_export`
  horizons → counts + linkable items + `returnedIds` + statement preview), `POST
  /projects/:id/export` (`{format, draftId?, attachAiUse}` → the head the editor would show →
  binary download; **never blocks on obligations**; 503 `export_not_wired` unbound), `GET
  /projects/:id/ai-use` (JSON or `?format=` standalone download), `POST
  /projects/:id/ai-use/additions` (the only statement write). `EXPORT_SERVICE_URL` env + live
  binding in `server.ts`.
- **`@rhema/api-client`** — export/statement DTOs + `getExportDialog`, `exportProject` (binary),
  `getAiUseStatement`, `downloadAiUseStatement`, `appendAiUseAddition`.
- **`apps/web`** — `/p/:project/export` page (format radios, `"N blocking obligations open"` with
  dossier links + returned-from-`pre_export` marker, attach toggle, statement preview, the
  append-sentence form, standalone-statement downloads) + the project-page Export link; POST
  proxies the binary download. `COPY.export` is authorship-legibility framing only (REQ-POS-13 —
  nothing about detection).
- **`infra/pulumi`** — `export` ordered first in `CLOUD_RUN_SERVICES` so the api container gets
  `EXPORT_SERVICE_URL` = the export service's uri.

## Design decisions

- **Service + job modes in one image.** §12.1 wants one job per export; the synchronous download
  path needs a request/response. The image does both: `serve` (`POST /export`) backs the dialog's
  download, and the file CLI (`main.js <in> <format> <out>`) is the job-per-export entrypoint —
  its object-store leg binds at deploy (D-PRB.11-1).
- **Generated text is never stored.** The generated half of the statement is recomputed from run
  rows on every read — there is nothing to edit or delete (the unremovable-sentences half of
  REQ-VIS-10 falls out of the data model, not just the route set). Only the author's additions
  persist, under a select+insert-only grant.
- **The export moment IS the horizon.** Both the dialog read and the export POST run
  `sweepArrivedDeferrals(pre_export)` first, so the count line, the returned markers, and the
  statement's obligation sentence agree (REQ-OBJ-3, §11.7).
- **The head the editor shows.** The export resolves the draft through `resolveEditorHead` — a
  frozen base with a working `human_revision` child exports the child's text (the author's edits
  are never invisible to an export).

## Out of scope (as specced)

pdf/LaTeX/html/rtf/odt/epub/Google Docs, CSL, account export zip (P1.18); the provenance appendix
(REQ-POS-7 → P1.18 — the dialog copy says nothing about it); the Academic ICMJE template (P1.21);
the Substack md profile (D-PRB.11-2).

## Test plan

- **AC1** `apps/export` — md passthrough byte-identical; deterministic injected `PandocExec` proves
  the `-f markdown → -t plain|docx` wiring; real-pandoc legs (ran locally) assert the txt output
  and unzip the docx: `word/footnotes.xml` + `footnoteReference`, never `[^n]` text.
- **AC2** `packages/ai-use` — the 2-reviews + 1-revise + 1 human-revision fixture lists exactly
  those facts; additions survive regeneration. `apps/api` — no update/delete route exists (404).
- **AC3** `apps/api` — export 200s with a blocking obligation open; the dialog line reads
  `"N blocking obligations open"`; the attached statement carries the open-obligation sentence.
- **AC4** `apps/api` — a `defer{until:"pre_export"}` obligation returns to open at the dialog
  (`returnedIds`), is counted + linked, stays open on re-read.
- **AC5** `apps/export` — repo scan: no pandoc in any other Dockerfile / package.json; no pandoc
  exec in api/web/worker sources.
- **SSR** `apps/web` — dialog renders formats/count/links/toggle/preview; POST proxies bytes;
  addition POST; standalone download route.
- Gates: `turbo build lint typecheck` **111/111**; `pnpm test` **1881 pass / 2 skip / 260 files**;
  `check:licenses` OK (502 pkgs; `jszip` devDep, MIT); `check:protocol-markers` OK;
  `check-build-memory.sh` 0 violations. **No live/dev execution — the live leg is D-PRB.11-1.**
