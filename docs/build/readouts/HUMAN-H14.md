<!--
  docs/build/readouts/HUMAN-H14.md (BM-INDEX-03) — append-only readout for the round-7 marker
  214c_HUMAN-H14__corpus-sign-off.md. Corpus sign-off over the withheld local export packet
  (PROVENANCE + export digest). The operator's words are recorded verbatim; no corpus content,
  path:line, or redaction row is recorded here.
-->
# HUMAN-H14 — Corpus sign-off — readout

- **Criterion (verbatim, `214c_HUMAN-H14__corpus-sign-off.md`):** the operator reviews the
  withheld `packages/demo-corpus/corpus/` packet (PROVENANCE.md + export-manifest digest) and
  signs it. "Withheld until done: every committed real corpus byte, and everything derived from
  it (real converter goldens, DTO snapshots, real `convert-overrides.json`, the denylist
  line-allowlist); any claim that the demo shows the real corpus or that the corpus is cleared
  for publication (REQ-CORPUS-14)." Blocks 219_R7DATA.1 (the one real-data commit), and through
  it 223a_HUMAN-H15 and 224_R7DEP.1.

> An operator or authorized human record supplies the decision; an agent must not sign or
> assume silence is approval.

## Disposition — **SIGNED — 2026-11-03 (operator)**

- **Packet reviewed:** the withheld local export at `packages/demo-corpus/corpus/` — 962 kept /
  43 excluded / 151 redactions / 4 published.
- **Export-manifest digest signed:** `19861a06c4401b8f9e1798751fe7dd6ab0e03b8670e974a4aab638c542116c91`
  (978 entries; reproduced by a second clean export — deterministic).
- **Gates at sign-off:** sanitizer green, `pnpm check:demo-corpus` 0 violations, `gitleaks dir`
  0 leaks over ~5.5 MB (all under `stevevitali/r7dem-1b-local-export`, run ledger
  `docs/build/runs/R7DEM.1b.md`).
- **Operator's words (verbatim, 2026-11-03):** "sign H14 and continue"
- **Consequence:** the H14 gate is discharged — 219_R7DATA.1 may commit the real corpus under
  the same digest (any re-export producing a different digest needs a re-sign). Code tickets
  215–218a continue on the committed synthetic fixture meanwhile (S-12); the H15/H16 pauses and
  GATE-ACCEPT.R7 remain operator rows.
