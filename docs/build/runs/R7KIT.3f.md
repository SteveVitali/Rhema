# R7KIT.3f — run record (the GUARD-1 migrate-tail: 29-file residual batch, run-time insert)

- **Ticket:** `docs/tickets/248a_R7KIT.3f__migrate-tail.md` — REQ-KIT-1 (RV-36 no-JS carriers), REQ-KIT-3 (per-batch enablement, completed), REQ-KIT-5 (uiCss bound), REQ-GUARD-1.
- **Branch:** `stevevitali/r7kit-3f-migrate-tail` ← `stevevitali/r7tour-2-repin` @ `be57d9d2` (the insert-row commit).
- **Scope:** Stage A only, `$0`, no preview (`GD-PREVIEW.R7`), unmerged (`mergePolicy: OPERATOR`). Harness: `devin-desktop/swe-2-high/subagent`.
- **Session record (honest):** two sessions. The first worker migrated the full census and left the tree code-complete but **unverified and uncommitted** (context exhausted mid-close). This closer session fixed the open issues, ran the unrun checks, and wrote the records. Nothing from the first session was discarded; every fix below is dated to the closer pass.

## Plan (reconstructed from the ticket + the worker's in-tree state)

1. Migrate all 29 census files: raw `<button|input|select|textarea>` → `@rhema/ui` primitives; inline spacing/type/colour/radius literals → `.ui-*` classes or the token map; genuine no-JS/SSR carriers stay native inside named exemptions (RV-36).
2. Emit the new `.ui-t-*` utility classes from a SECOND bounded stylesheet so the pinned `uiCss()` ≤ 24 kB bound (REQ-KIT-5) never grows without a ruling.
3. Enable `rhema/no-raw-controls` `error` on all 29 files; prove the 249 flip's dry-run is zero non-exempt diagnostics (AC-1 — do NOT commit the flip).
4. Keep the KIT-1 no-JS POST grammar byte-identical on every migrated surface (parity legs).
5. Verify + records + stacked PR; never merge.

## What changed

### The migration (worker session — code-verified by this pass)

- **29 census files** migrated to primitives + classes — the dossier/report content family (`packages/ui/src/{run-report,what-changed,page-strip,version-rail,ide-states,conversion,dispositions,files-pane,second-read,approval-row,shell,decisions,rubric,chips,margin}.tsx`), SPA shell surfaces (`apps/web/src/spa/{app-shell,palette,chat-live,read-only,page-header}.tsx`, `spa/surfaces/{run-report,editor}.tsx`), the demo SSR components (`demo-page`, `demo-markers`, `demo-banner`, `demo-effects`), plus `legal`, `chat-pane`, `gate-card`.
- **35 raw controls → primitives** (`Button`/`IconButton`/`TextField`/`TextArea`/`Chip`…); **3 genuine no-JS exemptions** appended to `no-raw-controls-exemptions.js` (RV-36): `dispositions.tsx` `HiddenField` (`next` post carrier) + `ReasonRadio` (the `reason_code` chip radios post through the native no-JS disposition form — a Radix carrier needs client JS), `conversion.tsx` `HiddenField`.
- **`name`/`value` carriers preserved** — primitives forward them to the real element (verified: `name="verb" value=`, `name="note"`, `name="adapted_text"`, `name="reason_code"`, `data-refund-form`/`data-duplicate-form` `method`/`action` intact).
- **`uiTailCss()`** — new `packages/ui/src/ui-tail-css.ts`: the second generated block (`.ui-t-*` utilities + `--d-sev`/`--d-w`/`--d-w2` dynamic carriers), exported from `index.ts`, emitted beside `uiCss()` in `render.tsx` + `spa-shell.ts`. **4,466 B ≤ asserted 5 kB** (`ui-css.test.ts`); `uiCss()` stays **24,567 B ≤ 24,576** — it had **9 B of headroom**, so splitting the tail was the honest call (a second bounded block, not a bound bump; flagged in the PR).
- `eslint.config.js` `NO_RAW_CONTROLS_ENABLED` += the 29 files; `no-raw-controls.test.ts` moved them into the enabled/seeded legs (the still-off arm switched to `pages.tsx` + `page-chrome.tsx`).

### Closer-session fixes (2026-11-07)

1. **Stale-dist test failures** — the worker's 7 `run-report.dom.test.tsx` failures (refund-form settle timeouts + two axe landmark legs) were a **stale `packages/ui/dist` artifact**: the suite imports workspace `dist`, and the pre-migration dist predated the `Button` consumption in the leaf. After a fresh `pnpm turbo build --filter=@rhema/web` the file is 13/13 green — no markup or test change was needed; the axe legs green with the migrated tree.
2. **Missing tail rules** — the full `ui-t-*` census audit (119 used classes vs emitted) found two references with no rule: `ui-t-p410` (refund CTA, was `padding: 4px 10px` → `var(--s1) 10px`) and `ui-t-ml8` (refund note, was `marginLeft: 8px` → `var(--s2)`). Both rules added; re-audit clean.
3. **`read-only.dom.test.tsx` C10 leg** — asserted `style` contains `background`; the showcase Duplicate CTA is now `Button variant="primary"` (the dossier banner's own carrier, `dossier-view.tsx:798` precedent). Updated the leg to assert the emitted `ui-btn`/`ui-btn--primary` classes — the same filled-primary contract at DOM level, still fails on a bare native `<button>`. The C10 comment amended, not removed.
4. **`ui-tail-css.ts` header corrected** — the comment claimed "asserted ≤ 4 kB"; the test asserts ≤ 5 kB and the block measures 4,466 B. Comment now matches the asserted bound.
5. **Prettier** — HEAD versions of the touched files were prettier-clean; the worker's edits drifted (`import { RunReport , Button }`, wrapped literals). `prettier --write` over the touched sources restored per-file formatting.
6. **`copy-containment.test.ts` regex blind spot** — its `COPY((?:\.[\w$]+)+)` path capture reads a contiguous String-method chain as a leaf segment; prettier joining `COPY.editor.forkToastFmt\n.replace(…)` onto one line made the test flag `editor.forkToastFmt.replace`. Fixed to strip one trailing segment when the full capture isn't a leaf — a genuinely missing leaf still fails (a stripped non-leaf fails the same).

## Verification (all on the final tree, Node 26 local — CI on Node 22 is authoritative)

| Check | Result |
| --- | --- |
| `pnpm turbo build --filter=@rhema/web` | PASS — 13 tasks |
| `pnpm --filter @rhema/web --filter @rhema/ui typecheck` | PASS |
| `pnpm --filter @rhema/web --filter @rhema/ui lint` | PASS — 0 errors |
| **AC-1 dry-run** — eslint `rhema/no-raw-controls` `error` over the exact 249 scope (`packages/ui/src/**` − `primitives/**`, + `apps/web/src/**/*.tsx` − `*.test.*`; 122 files via `--rule` override) | **0 diagnostics** — the flip lands clean; the flip itself NOT committed (249's act) |
| `pnpm exec vitest run packages/ui/src` + rule test | PASS — 19 files / 199 tests (rule 21/21, `ui-css` bound legs 8/8 incl. the new `uiTailCss` arms) |
| `pnpm exec vitest run apps/web/src` (full sweep) | PASS — **100 files / 1,662 tests** |
| `pnpm check:dom-contract` | PASS — journey ⊆ manifest ⊆ emitted+asserted |
| `pnpm check:spa-entry-graph` | PASS — no Select/markdown/leaf-chunk leak |
| `pnpm check:spa-budget` | PASS (ceilings held; `entryGzipBytes` 307200) — entry delta **+33.2 kB vs baseline `04a4e98b`**; cumulative WARN declared under `GD-KIT3A-BUDGET` + `GD-SPA-ENTRY.R7`; ticket increment ≈ **−0.2 kB** vs the parent's +33.4 kB (primitive dedup net-reduced) |
| `pnpm check:spa-env` | PASS — 153 client files, 0 leaks |
| `pnpm check:protocol-markers` | PASS — 320 public-facing files, no markers |
| `pnpm check:demo-corpus` | PASS — demo SSR files touched (`demo-page`/`demo-markers`/`demo-banner`/`demo-effects`); 6 corpus dirs clean |

## AC table

| AC | Disposition | Evidence layer |
| --- | --- | --- |
| 1. Rule at `error` over the 249 target scope reports zero non-exempt diagnostics | **Done** — 0 diagnostics over the exact 122-file scope; only `primitives/**` + `*.test.*` diagnostics exist, both excluded by the scope | dry-run output above; uncommitted flip — config keeps per-file enablement |
| 2. No-JS POST grammar parity on every migrated interactive surface | **Done** — `name`/`value`/`method`/`action`/`data-*` carriers verified intact through the primitives (refund/duplicate/disposition/conversion forms); hidden carriers stay native inside the three named exemptions | dom legs in `run-report.dom.test.tsx` (refund form `action`/`data-refund-form`/post URL), `read-only.dom.test.tsx` (duplicate form `action`), `dispositions` form grammar in-tree |
| 3. Emitted-DOM contract green | **Done** — `check:dom-contract` OK; no hook renamed or dropped | check output |
| 4. `check:spa-entry-graph` + `check:spa-budget`; entry delta honest | **Done** — no chunk leak; **+33.2 kB cumulative vs `04a4e98b`** (ceiling 307200 held; ≈ −0.2 kB this ticket; `GD-KIT3A-BUDGET`/`GD-SPA-ENTRY.R7` stand) | check output |
| 5. Touched-file tests + full `apps/web/src` sweep green | **Done** — 100/100 files, 1,662/1,662; `packages/ui` 199/199; rule 21/21 | vitest runs above |
| 6. `runs/R7KIT.3f.md` complete; `D-R7KIT.3f-1` appended → 250_R7DEP.2 | **Done** — this record + the DEFERRALS row | records |

## Evidence report

- Migration size: 38 files changed, +1,805/−842 (incl. records/test edits); the census' 340 diagnostics → **0**.
- `uiCss()` 24,567 B (9 B headroom preserved); `uiTailCss()` 4,466 B ≤ 5,120 B asserted.
- Node caveat: local runs on Node 26 vs the repo's Node 22 — CI is the authoritative leg.
- Harness `devin-desktop/swe-2-high/subagent`; spend `$0` (Stage A only, `GD-PREVIEW.R7`).

## Judgement calls (operator review)

1. **Second bounded stylesheet** — `uiTailCss()` rides its own ≤5 kB bound rather than growing `uiCss()` (9 B headroom). A one-time `uiCss()` bound bump would have needed a REQ-KIT-5 ruling; the second `<style>` block changes nothing about cascade order (emitted immediately after `uiCss()` in both shell documents).
2. **Two exemptions are `HiddenField`/`ReasonRadio`, not style literals** — consistent with the ticket's "a style literal with no no-JS justification is residue, never an exemption". `ReasonRadio`'s reason is recorded verbatim: the disposition form's `reason_code` radios must post with JS disabled; a Radix radio needs client JS.
3. **C10 test updated to the class contract** — the primitive makes inline `background` the wrong probe; `ui-btn--primary` IS the filled-primary contract (same carrier the dossier banner already ships). Not weakened: a bare `<button>` still fails.
4. **`copy-containment` test fix** — a parser blind spot, not a source violation; the strip-one-segment retry cannot mask a missing leaf (the stripped path is still checked against the table).
5. **`runHintsFor` / toast titles prettier rejoin** — formatting only; no copy or call-shape change.
6. **Deferred to 249**: collapsing `NO_RAW_CONTROLS_ENABLED` into the global `error` block remains 249's single act — the per-file list stays verbatim.
