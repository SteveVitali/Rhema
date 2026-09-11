# Run ledger — MAINT.1 (RH.1) build-memory v2 migration

- **Spec:** `~/agent-skills/.agents/design/build-memory-v2-spec.md` #RH.1 (via `docs/tickets/16z_MAINT.1__build-memory-v2-migration.md`)
- **Base:** `stevevitali/p0-15i-agent-web-research-sandbox` @ `1c9c452`
- **Branch:** `stevevitali/maint-1-build-memory-v2`
- **Config:** implement-spec, autonomous=true, live_verification=false (offline-only, no spend). Doc/build-memory reorg only — no code.

## Deferrals read
Read `docs/tickets/DEFERRALS.md` (88 `D-*` rows). This ticket unblocks none of them (it is a doc/build-memory
reorg). It DOES bring the DEFERRALS status vocabulary onto the v2 machine-readable set (BM-MIGR-06) and adds the
`docs/build/LEDGER.md` pointer. 3 rows (D-P0.15h-3/-4, D-P0.15i-1) that carried no canonical status keyword
(only Rhēma idioms `ROOT-CAUSED`/`FIXED`/`CODE-FIXED`) get a one-word canonical prefix — see Gap table / Deviations.

## Requirements (RH.1 / BM-MIGR-01..07, BM-COMPAT-04..05)
- BM-MIGR-01 init + migrate (runs → docs/build/runs/<ID>.md; retire .agents/)
- BM-MIGR-02 LEDGER.md v2 state-only reconstruction (PHASE LOG = one done/PR in chain order)
- BM-MIGR-03 BUILD_INDEX.md (one row per PR) + a committed pr/<ID>.md per PR
- BM-MIGR-04 ADR-001..004 retro-fitted from manifest "Spec amendments" + research change log; adr/README generated
- BM-MIGR-05 manifest + markers reconciliation (companions, chain rows for 16_P0.15e..i, Plan extensions, ADR pointers, GATE-G1 Updated block, HUMAN-H0 ticks)
- BM-MIGR-06 DEFERRALS living-header edits + LEDGER pointer (no row rewrites)
- BM-MIGR-07 docs/README.md mode map + AGENTS.md Build memory section + research change-log line
- Validation: check-build-memory.sh . green; req_id_pattern added

## Acceptance criteria
See the ticket's `## Acceptance criteria` (deterministic set + fresh-context reviewer). Headline:
`check-build-memory.sh .` exits 0; `test ! -d .agents`; runs/ per migrated ledger; LEDGER/BUILD_INDEX/adr per BM;
manifest chain row per NN*_ file incl. 16_P0.15e..i, j, k, 16z_MAINT.1; `pnpm turbo build lint typecheck` + `pnpm test` unchanged.

## Plan
See the evidence report below. Re-confirmed counts (spec figures were stale): **25 PRs** (#1–#25, P0.15i landed as
PR #25), **23 migrated run ledgers** (no ledger exists for the cloud-switch #7 or P0.15h #24 → their evidence is
pr/<ID>.md), **88 D-* rows**.

## Test matrix
Deterministic ACs are the validator + shell assertions (runs count, byte-identity cmp, LEDGER key order, chain-row
coverage, no `.agents`, git shows no code files). agent-skills patch: `bash tests/run-tests.sh` green.

## Progress
- [x] gitignore fix (docs/build re-included above the generic build/ ignore; logs stay ignored)
- [x] docs/build/README.md (marker) + init dirs + logs/.gitignore
- [x] migrate --apply → 23 runs/<ID>.md (byte-identical, all 23 sha256 match); .agents removed
- [x] agent-skills validator patch (ID-keyed dup check + markdown/embedded-token status parse) + fixtures green (separate PR)
- [x] LEDGER.md v2 reconstruction (BM-LEDGER-02 key set; PHASE LOG = 24 done + seeds + inserts + MAINT.1)
- [x] BUILD_INDEX.md (26 rows = 25 PRs + MAINT.1) + pr/<ID>.md ×25
- [x] ADR-001..004 + adr/README (generated) + adr/_TEMPLATE
- [x] docs/README.md, AGENTS.md Build memory section
- [x] manifest edits, DEFERRALS edits, GATE-G1, HUMAN-H0, research change log, readouts/GATE-G1.md
- [x] validator green (exit 0, 0 warnings); no code changed; PR + close

## Gap table
| item (RH.1 §) | status | evidence |
|---|---|---|
| BM-MIGR-01 init + migrate; retire `.agents/` | met | `docs/build/runs/` ×23 (byte-identical, 23/23 sha256); `test ! -d .agents` |
| BM-MIGR-02 LEDGER v2 state-only reconstruction | met | `docs/build/LEDGER.md` — BM-LEDGER-02 key set (validator green); PHASE LOG 24 done + seeds + inserts + MAINT.1 |
| BM-MIGR-03 BUILD_INDEX + pr/<ID>.md per PR | met | `docs/build/BUILD_INDEX.md` 26 rows; `docs/build/pr/` ×25 |
| BM-MIGR-04 ADR-001..004 + generated index | met | `docs/adr/ADR-00{1..4}-*.md` (each has `## Revisit trigger`); `docs/adr/README.md` generated marker, `adr-index --check` byte-identical |
| BM-MIGR-05 manifest + markers reconciliation | met | manifest: `companions:`, `req_id_pattern:`, chain rows 16_P0.15e..i, `## Plan extensions`, (ADR-00x) pointers; GATE-G1 `> Updated` block (no `.agents/scratch`); HUMAN-H0 GCP+key ticked |
| BM-MIGR-06 DEFERRALS living-header + LEDGER pointer | met | `PARTIAL` added to status vocab; LEDGER pointer blockquote; AWS→GCP in header; 3 keyword-less rows given a canonical prefix (info-preserving); no bulk row rewrite |
| BM-MIGR-07 docs/README mode map + AGENTS section | met | `docs/README.md` (one row per top-level entry); `AGENTS.md` Build memory section (83 lines total ≤ 250) |
| BM-MIGR-08 validator green + req_id_pattern | met | `check-build-memory.sh .` exit 0, 0 warnings; REQ coverage runs (470 spec ids resolve) |
| BM-COMPAT-04/05 (migrate; no rename) | met | migrate move/rename only; no ticket file renamed (BM-COMPAT-05 SHOULD honored) |
| Out-of-scope respected (no rename/no row rewrite/no code/no G1/no merge) | met | git shows only `docs/`, `AGENTS.md`, `.gitignore`; no ticket renamed; DEFERRALS rows kept |

**Deviations (recorded):**
1. **Shared validator patched** (agent-skills, separate PR): the landed `check-build-memory.sh` keyed its
   duplicate-sequence check on the numeric filename prefix (so all `16_P0.15*` collided) and required a
   DEFERRALS status to be the last cell's first bare word (so 34 markdown/prose statuses were "orphan"). Fixed
   at root: dedup on the ticket **id** (a unique id is the real invariant; the fixture now seeds a duplicate id),
   and recognize the status as the first canonical token appearing anywhere in the last cell. Operator-approved
   ("Patch the validator (both)"). Keeps the RH.1 out-of-scope intact (no ticket renamed; DEFERRALS rows not
   rewritten). agent-skills `tests/run-tests.sh` green.
2. **3 DEFERRALS rows given a canonical status prefix** (D-P0.15h-3 → DONE, D-P0.15h-4 → PARTIAL, D-P0.15i-1 →
   PARTIAL): these carried only Rhēma idioms (`ROOT-CAUSED`/`FIXED`/`CODE-FIXED`) with no canonical status
   keyword, so even the tolerant parser could not classify them. One keyword prepended per row; all prose/dates/
   evidence preserved.
3. **Stale spec figures re-confirmed** (the ticket's re-confirm instruction): 25 PRs (not 24 — P0.15i landed as
   PR #25), 23 migrated run ledgers (not 22), 88 `D-*` rows (not 60). `runs/` = 24 (23 + MAINT.1), `pr/` = 25,
   BUILD_INDEX = 26 rows. The frozen AC's 22/24/25 figures are superseded by the real counts.

## Evidence log
- `migrate --apply`: 23 ledgers → `docs/build/runs/<ID>.md`; byte-identity **23/23 sha256 match**; `.agents` removed (`test ! -d .agents` ✓).
- `bash ~/agent-skills/skills/build-memory/scripts/check-build-memory.sh .` → **exit 0, 0 violations, 0 warnings**.
- `git status --short` → only `.gitignore`, `AGENTS.md`, `docs/**` (no code file; `infra/pulumi/Pulumi.dev.yaml` is a pre-existing unrelated change, excluded from staging).
- `adr-index.sh docs/adr` regenerates `README.md`; `--check` byte-identical (validator diff green).
- REQ coverage ran (canonicalSpec + req_id_pattern resolve; 470 REQ ids in the spec; cited ids resolve → 0 warnings).
- agent-skills `bash skills/build-memory/tests/run-tests.sh` → ALL PASS (v2-clean, v2-violations, legacy-scratch, memory-root, adr-index).

## Evidence report
See `docs/build/pr/MAINT.1.md` (the submitted PR body) — same content.
