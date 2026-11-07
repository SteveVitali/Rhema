# R7COPY.1c — `errorCopy(code)` + the committed error-code inventory (ticket 245a)

**Spec:** `docs/tickets/245a_R7COPY.1c__error-copy.md` · **Stage A, $0** (GD-PREVIEW.R7 — no per-ticket preview) · **mergePolicy: OPERATOR** · base `stevevitali/r7copy-1b-markdown` @ `8844a90c`.

## What this ships

**REQ-COPY-2 / UXC-27** — every API error code maps to a human sentence plus an action; raw codes (`lock_held`, `upstream_unavailable`, …) never reach the user.

- `apps/web/src/error-copy.ts` — the shared layer:
  - `errorCopy(code)` — a `BY_CODE` table for the codes needing their own words, twelve ordered `FAMILIES` classifiers for the long tail, and the generic fallback (`COPY.errors.fallback` + `tryAgain`). An un-inventoried code still never renders verbatim.
  - `errorMessage(err)` — the surface seam: logs `{code, requestId}` to the client console (the REQ-COPY-2 observability seam — the code and the correlation id **only**; `err.detail` is deliberately never rendered — the api puts zod fragments, internal error text, and PII like `detail: user.email` in it), then returns `"sentence action"`.
  - `errorSentence(code)` — the SSR↔SPA shared text (the server's `?notice=` flash emissions).
  - `ERROR_CODES` — the **committed 257-code inventory**, the extraction output asserted by the test.
  - `COPY.errors` + `COPY.errorActions` — every sentence/action leaf lives in `copy.ts` so `lintCopy`/`lintInternalTerms` cover them automatically.
- `scripts/check-protocol-markers.mjs` — `error-copy.ts` added to `SPA_WEB_SRC_ALLOW` (it's a shared leaf the server also imports for `?notice=` text).

## Extraction mechanism (the ticket's recorded decision)

The test re-derives the inventory by scanning, comments stripped:

- `apps/api/src/**/*.ts` (minus tests): `error:` literals (codes **and** prose — both are emitted), `reason:` snake literals, `.(reason|error) ===` comparisons, `??` code defaults, `code:` literals/ternary-heads, `*Invalid(` helper-argument codes.
- `apps/web/src/*.ts` top level (minus tests): the same patterns.
- `apps/web/src/spa/bff.ts`: `new BffError(` literal codes only.
- `PRODUCER_FILES` — the seven named modules whose `{ok:false, reason|error}` unions the routes surface verbatim through `c.json({ error: res.reason })` (`packages/orchestrator/{run-creation,cancel,reactions,gate-resolution}`, `mirror/manual-revision`, `findings-core/apply`, `assistant/threads`). A new pass-through producer file must be appended there.
- Template-literal emissions (``error: `unknown provider ${x}` ``) are dynamic — out of literal-extraction scope; they resolve to the fallback at runtime.

## Raw-code sites retired (UXC-27 + same-defect finds)

`err.detail ?? err.code` / `err.code` verbatim replaced by `errorMessage(err)` in: `editor.tsx` (mutError; fork-undo logs `logBffError`), `dossier.tsx` ×2 (+stale comment), `run-report.tsx`, `voices.tsx`/`onboarding.tsx` `onRefusal`, `figures.tsx` `?notice=` + inline `data-notice`, `chat-live.tsx`. `server.ts` figure POSTs emit `errorSentence` into `?notice=` (verbatim-rendered flash arm). `run-sheet.tsx`'s `noticeByCode[err.code]` is a lookup, not a render — kept (allowlisted).

## Tests

- `error-copy.test.ts` (13): extraction ⊆ inventory (a new un-inventoried emitted code fails — the ticket's core AC); no dead rows; seeded `c.json({error:"totally_new_code"})` fails the check; every inventory code resolves to named/family copy — **unmapped rows are listed in the failure message**; fallback sentence+action; `console.warn` spy sees `{code, requestId}` and never `detail`; zero-`err.detail`/display-`err.code` grep census with the named allowlist; composed-output `lintCopy`/`lintInternalTerms`.
- `dossier.dom.test.tsx`: 409 `lock_held` → mapped sentence+action, no `lock_held` text (the DOM leg).
- Updated: `bff.test.ts` ×2 + `figures.dom.test.tsx` ×2 + `voices.dom.test.tsx` ×1 — they pinned the old verbatim behavior; now assert `errorSentence` output.

## Verify (this head)

turbo build · web typecheck (all three projects) · eslint 0 err (1 pre-existing warning in `chat-live.tsx` — unrelated useMemo disable) · web sweep **1630/1630** (96 files) · `check:dom-contract` ✓ · `check:spa-budget` ✓ · `check:spa-env` ✓ · `check:protocol-markers` ✓.

## Entry delta (REQ-KIT-5 — honest report)

`+18.5 kB` gz vs baseline `04a4e98b` — the ≤15 kB allowance is already exceeded by the parent's **GD-KIT3A-BUDGET** deficit; this ticket's increment is **≈ +1.3 kB** (the error-copy module + COPY leaves + the replaced sites). The deficit is declared, not hidden.

## Deferrals

- **Opened `D-R7COPY.1c-1`** → `250_R7DEP.2`: Stage-B screenshot at 250's R7b-preview SHA (`--expect-sha`, provenance PASS, under `docs/build/runs/R7COPY.1c/`) showing a mapped error message — sentence+action, no code — on a real refusal path (e.g., a second tab's `lock_held`).
- None closed.

## Stage B status

**Owed** — no preview was stood up (GD-PREVIEW.R7); the deployed screenshot is deferred to 250's R7b phase preview. Stage-A proof only; this PR claims no live/deployed evidence.
