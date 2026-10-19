# R5.E — Memory hygiene: validator semantics, spec reconciliation, Later-scope census

**Stream:** E · **Researched:** 2026-10-14 · **Ledger rows:** E1, E2, E3 · Validators inspected, not run (caveat per note).

## Key findings

- **F1/F2 — the checkers disagree by construction.** `check-build-memory.sh:540-545` is priority-ordered (`OPEN` wins anywhere in the cell — contradicting its own "first appearing" comment); `check-backlog.sh:82-93` is positional (first canonical token). `DONE-code` tokenizes to `DONE-CODE` and never matches. A cell `**DONE … "still owed → OPEN" …` reads DONE under one, OPEN under the other. ~50 of 320 rows carry final-truth-DONE but parser-OPEN/PARTIAL cells; append-only means mid-cell prose can never be removed → **only an upstream parser fix fully resolves them** (REQ-MEM-3: make the validator positional).
- **F3 — D-P0.08b-3 is the canonical never-flip row** (`DEFERRALS.md:110`): `DONE-code … "confirmed open" … DONE (STB.3)` reads OPEN under both parsers forever.
- **F4 — status-cell census classes:** DONE-before-OPEN ~28 rows, OPEN-before-DONE ~23, PARTIAL∧DONE ~27, OPEN∧PARTIAL ~37 (mostly honestly-open), 2 compound edge cases. Rhēma-local normalization = canonical leading `**STATUS (date) —` prefixes; upstream = parser alignment. REQ-MEM-1 requires a scripted census before normalization.
- **F5 — BUILD_INDEX warning class:** PHASE LOG `ARMB.2` has no BUILD_INDEX row → guarded-level warning; fix is a local index row + ID/filename convention alignment (REQ-MEM-5).
- **F6** — MAINT.2's six missing backlog homes are all resolved (ADR-018/019/020, D-P0.08b-3, D-P1.22-1, D-SEC.1-2 now homed).
- **F7** — GATE-ACCEPT exemption already landed upstream (0.5.3); PHASE LOG rotation convention proposed (~87.6% of limit) — upstream + local (REQ-MEM-4).
- **F8** — G2/G3/H3 amendments are ALREADY folded into `rhema-design-spec.md` (§17 banners 2959-2995 + Appendix A.13); the REC.2 remainder is ADR lineage + the nav fold-back only.
- **F9** — ADR-007/012 vs 106/107/108 lineage is coherent via amendment sections; spec supersession banners already point at `frontend-spa-spec.md` v1.1.
- **F10 — nav deviation confirmed a spec gap:** `frontend-spa-spec.md` contains ZERO nav-mechanism text (no `intercept`/`click`/`<Link`/`delegat`) — §7's "intra-tree → router.navigate" rule never specified how a click reaches it. Fold-back targets: §7 (name mechanism + skip-list), §14 (dated defect block), settle contract (nav mechanism observable). This is REQ-MEM-6/7/8.
- **F11** — "Dispositioned ≠ done" semantics confirmed in both GATE-ACCEPT readouts; the nav defect's post-deploy re-verification follows the same accepted-deviation pattern.
- **F12 — Later-scope census clean:** all 33 MISSING matrix rows carry milestone `1.x` + explicit spec-schedule citations; REQ-OBJ-9/-14 are deliberate capture-now halves. Nothing is lost work (REQ-MEM-10); one cosmetic §-anchor drift (REQ-IDE-20/-21 cite §5.3 but live at §3.2 row 75 → REQ-MEM-9).

## Spec requirements emitted

REQ-MEM-1 canonical leading status + scripted pre-census · REQ-MEM-2 mid-cell canonical-word discipline going forward · REQ-MEM-3 upstream positional parser alignment · REQ-MEM-4 PHASE LOG rotation convention · REQ-MEM-5 BUILD_INDEX ARMB.2 row + ID convention · REQ-MEM-6/7/8 nav fold-back into frontend-spa-spec (§7 mechanism, §14 defect block, settle markers) · REQ-MEM-9 matrix §-anchor fix · REQ-MEM-10 BL-73 recorded spec-verified.
