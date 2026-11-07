# R7COPY.1c — `errorCopy(code)` + the committed error-code inventory (ticket 245a)

- **Spec:** `docs/tickets/245a_R7COPY.1c__error-copy.md`
- **Base:** `stevevitali/r7copy-1b-markdown` @ `8844a90c` (chainTip; ci pass #285@103a4a0, run 42336237857 — trailing commit docs-only)
- **Branch:** `stevevitali/r7copy-1c-errorcopy` · PR base `stevevitali/r7copy-1b-markdown`
- **Config:** implement-spec full · Stage A only ($0; GD-PREVIEW.R7 — no owned preview)
- **Harness:** devin-desktop/swe-2-high/subagent
- **Started:** 2026-11-07T05:04Z · **Closed:** (open)

## Deferrals read
`docs/tickets/DEFERRALS.md` read first (2026-11-07). No OPEN row is unblocked by this ticket —
the R7b OPEN rows all belong to 250_R7DEP.2's preview walk. This run opens `D-R7COPY.1c-1`
(owner 250).

## Requirements (from ticket + spec §4.13/§4.8/§4.6)
- REQ-COPY-2 [UXC-27]: `errorCopy(code)` maps every API error code to a sentence plus an action,
  with a generic fallback; `requestId` logged (client console seam; code + requestId only —
  never PII/detail text, invariant 10).
- The committed error-code inventory: extracted from `apps/api/src` (+ named `{ok:false,
  reason|error}` producer modules the routes surface verbatim) and `apps/web/src` emitters
  (`server.ts`, `bff.ts`, `spa/bff.ts`); a test fails when an emitted code has no inventory row;
  every inventory code has an `errorCopy` entry or the test reports it.
- Replace the seven `err.detail ?? err.code` sites (UXC-27: editor, dossier ×2, run-report,
  voices, onboarding, figures ×2) + equivalents found at build time (`chat-live.tsx` err.code,
  `figures.tsx` `?notice=<code>`). `requestId` logged on every mapped error.
- REQ-KIT-5: entry-delta allowance ≤ 15 kB gz vs `04a4e98b` (running total +17.2 kB —
  GD-KIT3A-BUDGET deficit; increment kept minimal, reported honestly).
- Consumes: 231's `mutationOutcome` codes (`chat_*_required`…), 238's discard-fork codes
  (`not_a_fork`, `fork_has_edits`, `fork_read_by_run`), 244's `lintCopy`/`lintInternalTerms`.

## Anchor drift notes (re-confirmed at build time)
- The seven sites moved: `editor.tsx:85` (was :204), `dossier.tsx:92,330` (was :233,487),
  `run-report.tsx:68` (was :191), `voices.tsx:255` (was :254), `onboarding.tsx:283` (was :229),
  `figures.tsx:221,623-635` (was :195,453).
- Plus same-defect sites the audit's list missed: `chat-live.tsx:151` (`err.code ??` verbatim);
  `server.ts` figure POSTs emit `?notice=${e.code}` — api codes into the verbatim-rendered flash
  param (same arm UXC-27 flags at figures.tsx:221).
- `err.detail` is NOT safe display copy: api emits `detail: user.email` (PII), `detail: e.reason`
  (a code), `detail: res.error.message` (internal), zod messages — so `detail` display is retired
  entirely; `errorCopy(code)` is authoritative (decision, recorded below).
- `lock_held` (UXC-27's example) is not an emitted code today — `locked`/`run_lock`/
  `fork_read_by_run`/`run_in_progress` are the real members; the DOM leg feeds `lock_held`
  anyway (un-inventoried code → family resolution, no code text).

## Extraction mechanism (the ticket's decision, recorded)
Scanner over committed sources (runs inside the vitest leg; `import.meta.url`-relative paths):
- `apps/api/src/**/*.ts` (minus `*.test.ts`): `error: "…"` literals (codes AND prose — both are
  emitted), `reason: "<snake>"` literals, `.(reason|error) === "<snake>"` comparisons, and
  `(code|error) ?? "<lit>"` defaults.
- `apps/web/src/*.ts` top level minus tests: the same patterns.
- `apps/web/src/spa/bff.ts`: string literals inside `new BffError(…)` calls.
- Named producer modules whose `{ok:false, reason|error}` unions are surfaced verbatim through
  `c.json({ error: res.reason })`: `packages/orchestrator/src/{run-creation,cancel,reactions,
  gate-resolution}.ts`, `packages/mirror/src/manual-revision.ts`,
  `packages/findings-core/src/apply.ts`, `packages/assistant/src/threads.ts`.
- Comments stripped before matching. Template-literal emissions (`` error: `unknown provider ${x}` ``)
  are dynamic and out of scope for literal extraction — they resolve to the generic fallback at
  runtime (recorded limitation).
- The committed inventory is `ERROR_CODES` in `apps/web/src/spa/error-copy.ts` (sorted; header
  documents the mechanism + the producer list a future pass-through source must extend).

## Plan
1. `apps/web/src/copy.ts` — `COPY.errors` sentence leaves + `COPY.errorActions` action templates
   (they ride `collectCopyStrings` → `lintCopy`/`lintInternalTerms`/jargon lint automatically).
2. `apps/web/src/spa/error-copy.ts` — `ERROR_CODES` inventory, `errorCopy(code)` (BY_CODE table +
   ordered FAMILIES + generic fallback), `logBffError` (`{code, requestId}` console seam),
   `errorMessage(err)` = log + `sentence + " " + action`.
3. Replace sites: editor.tsx, dossier.tsx ×2 + stale comment, run-report.tsx, onboarding.tsx,
   voices.tsx, figures.tsx ×2, chat-live.tsx, server.ts `?notice=<code>` ×3 (figures POSTs emit
   the mapped sentence — the notice renders verbatim on both arms).
4. Tests: `error-copy.test.ts` (extraction ⊆ inventory; inventory ⊆ mapped; seeded un-inventoried
   route fails; fallback; requestId spy; lint over the composed table); grep leg (zero
   `err.detail ?? err.code` + named allowlist for lookup-only `err.code`); dom leg (409 →
   sentence + action, no code text) in `dossier.dom.test.tsx`; update the two dossier tests that
   pinned detail-verbatim display.
5. Verify + records + PR + boundary.

## Test matrix
- Seeded api route emitting `totally_new_code` → extraction finds a code not in `ERROR_CODES` →
  leg fails when the seed helper is pointed at the patched source (the seed runs against a
  synthesized source string, never the tree).
- Every `ERROR_CODES` member resolves to a non-fallback `errorCopy` entry — the failure message
  lists the unmapped rows ("reported by the test").
- `errorCopy("definitely_not_a_code")` → the generic fallback entry; `errorMessage` composes
  `sentence action`, never includes the code string.
- `console.warn` spy sees `{code, requestId}` on `errorMessage`/`logBffError`; a `detail`/`message`
  payload never enters the log line.
- Grep: zero `err.detail` / display-position `err.code` in `apps/web/src/spa/**` outside the
  named allowlist (bff.ts, error-copy.ts, the `noticeByCode[` lookup).
- DOM: a refused dossier write answering 409 `{error:"lock_held"}` renders the mapped sentence +
  action and contains no `lock_held` text.

## Progress
- 2026-11-07T05:04Z — branch forked from `8844a90c`; contract + Load set read; anchors re-confirmed
  (drift noted above); extraction prototype enumerated ~260 literals.

## AC gap table (this head, Stage A)

| AC | Status | Evidence |
|---|---|---|
| `errorCopy(code)` maps every API code → sentence+action | GREEN | `errorCopy`/`hasErrorCopy` in `apps/web/src/error-copy.ts`; inventory-coverage leg reports unmapped rows |
| Generic fallback for un-mapped codes | GREEN | `FALLBACK` entry + "never the code" legs in `error-copy.test.ts` |
| `requestId` logged per mapped error; code+id only (no PII) | GREEN | `logBffError` console seam; spy leg asserts `req_abc` present, `s3cr3t@x.com` detail never logged |
| Committed inventory extracted from api/web emitters | GREEN | `ERROR_CODES` (257) re-derived by `extractEmittedCodes()` in the test; extraction ⊆ inventory + no-dead-rows legs |
| New un-inventoried emitted code fails a test | GREEN | seeded `c.json({error:"totally_new_code"})` leg asserts the extraction check catches it |
| Every inventory code has an errorCopy entry or is reported | GREEN | `unmapped` leg lists codes resolving to fallback |
| Zero `err.detail ?? err.code` / raw-code display in spa/** | GREEN | the grep census leg (named allowlist: bff.ts, error-copy.ts, run-sheet `noticeByCode[` lookup, editor fork-undo code branch) |
| 409 `lock_held` → sentence+action, no code | GREEN | `dossier.dom.test.tsx` 409 leg |
| New sentences pass copy lint / no-banned-strings | GREEN | `COPY.errors`/`COPY.errorActions` ride `collectCopyStrings`; explicit lint legs over the bank + every composed inventory output |
| `?notice=<code>` flash sites emit copy | GREEN | `server.ts` ×3 → `errorSentence`; `bff.test.ts` asserts the encoded mapped text |
| Stage-B deployed screenshot | **OWED → D-R7COPY.1c-1** (250_R7DEP.2) | GD-PREVIEW.R7 — no per-ticket preview |

## Evidence log
- `pnpm turbo build --filter=@rhema/web` — 13/13.
- `pnpm --filter @rhema/web typecheck` — clean (tsc -b + client + spa projects).
- `pnpm --filter @rhema/web lint` — 0 errors, 1 pre-existing warning (`chat-live.tsx:193` unused disable on an untouched useMemo dep list).
- `pnpm exec vitest run apps/web/src` — **1630/1630** (96 files).
- `pnpm check:dom-contract` — OK. `check:spa-env` — OK. `check:protocol-markers` — OK (after the `SPA_WEB_SRC_ALLOW` extension).
- `pnpm check:spa-budget` — ceilings held; entry **+18.5 kB** vs `04a4e98b` (≤15 kB allowance exceeded by the parent's GD-KIT3A-BUDGET deficit; **this ticket's increment ≈ +1.3 kB** — honestly declared).
- Append-only + build-memory checks — see the closure note below.
- CI — `ci boundary` line appended to LEDGER after the exact-head read.

## Errors encountered during implementation
- `server.ts` importing `spa/error-copy.ts` pulled the client graph into the server tsconfig → module moved to `apps/web/src/error-copy.ts` (the shared-leaf position `copy.ts`/`billing-copy.ts` already occupy); protocol-markers allowlist extended with a recorded rationale.
- `went wrong` is a banned string (`lintCopy`) → `fallback`/`ourFault` reworded.
- Five pre-existing tests pinned the verbatim behavior (bff ×2, figures.dom ×2, voices.dom ×1) → updated to `errorSentence` assertions.
- `err.detail` carries PII/internal text in api routes → `detail` display retired entirely (decision recorded in the file header).

## Closure
- 2026-11-07T05:16Z — **Closed:** Stage A complete. Records: `pr/R7COPY.1c.md`, `DEFERRALS` `D-R7COPY.1c-1`, `BUILD_INDEX` row 287, `LEDGER` advance. - PR #286 on `stevevitali/r7copy-1b-markdown` @ `2c6f3d05`, unmerged (OPERATOR).
- ci boundary: **pass #286@`2c6f3d05`** (run 42342044243 — all seven legs + ci-pass anchor; the boundary script's final read hit a GitHub TLS timeout — verdict read back from `gh pr checks 286` at the exact head; `logs/ci-R7COPY.1c.json` records the timeout).
- `check-append-only.mjs --base stevevitali/r7copy-1b-markdown` — OK.
- `check-build-memory.sh` — ✓ no violations (21 warnings, all pre-existing posture — manifest rows/ADR index/ledger budgets/index columns/harness headers + the nextTicket naming note).
- Harness: devin-desktop/swe-2-high/subagent · $0 Stage A.
