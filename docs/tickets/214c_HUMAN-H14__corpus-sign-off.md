# HUMAN-H14 — Corpus sign-off (PROVENANCE, redactions, exclusions, replay facts)

- **Sequence:** 214c of 254 · **Kind:** human · **Phase:** round 7 (R7a)
- **Depends on:** 214b_R7DEM.1b (the local real export, its gate evidence and the review packet
  with the export-manifest digest to sign)
- **Blocks:** 219_R7DATA.1 (the one real-data commit), and through it 223a_HUMAN-H15 and
  224_R7DEP.1
- **Owner:** operator   **Scheduled:** trigger = 214b_R7DEM.1b landed with its local real export
  green (sanitizer + denylist + `gitleaks dir`); target before 223a_HUMAN-H15
- **Withheld until done:** every committed real corpus byte, and everything derived from it
  (real converter goldens, DTO snapshots, real `convert-overrides.json`, the denylist
  line-allowlist); any claim that the demo shows the real corpus or that the corpus is cleared for
  publication (REQ-CORPUS-14)
- **Gate status:** this marker is the gate; never pre-answered, silence is not approval
- **Live stage:** none · **Production mutations:** none · **Size budget:** n/a (operator review)
- **Deferrals so far:** 0
- **Readout:** `docs/build/readouts/HUMAN-H14.md` (from `templates/READOUT.md`)

> **Operator work — NOT an `implement-spec` input.** Only the operator can clear their own
> writing and records for permanent public history (the repo is public; D-R6OSS.1-1). An operator
> or authorized human record supplies the decision; an agent must not sign or assume silence is
> approval. Code tickets 215–218a proceed meanwhile on the committed **synthetic** fixture (S-12);
> 219 does not start until this row is ticked.

## Checklist
Read the local review packet 214b produced (the withheld `packages/demo-corpus/corpus/` output;
regenerate it with `tools/demo-corpus/export.mjs` if the worktree is gone — the export is
deterministic and must reproduce the digest 214b recorded).
- [ ] **Allowlist with counts** per essay (R1 §1 globs + the spec §4.1 REQ-CORPUS-11 file rulings)
      — nothing included that should not ship
- [ ] **Redaction table** — every applied rewrite (pattern → replacement, file, line, reason) reads
      correctly; workflow-sense "operator" became "the writer" (S-10) and statutory/telecom
      "operator" is untouched; no essay prose changed beyond the image-path fix; the withheld
      `_rules/` rows (file-targeted rewrites, line-allowlist entries) hold ids and file:line only
- [ ] **Excluded set with reasons** — outlines, manifests, editor `notes.md`, voice charters, SPD
      `short-v1.md` and `values-table*.png`, GM fragments and `-A`/`-B` ledgers (RV-37); dangling
      references to them will render "not published"
- [ ] **Round/approval facts** (S-9) — each fact is true, sanitized, and safe to show as "replayed";
      anything absent will read "approvals not recorded"
- [ ] **Published entries** (REQ-CORPUS-12) — URL, fetch date, sha256 per essay; the agent-discourse
      credit lines are the only allowlisted identity-adjacent lines (S-11)
- [ ] **Pen-name scope** (S-11) — no identity material from excluded files survives; byline is
      "S. J. Sebastian" throughout
- [ ] **Gate evidence** — 214b's run record shows sanitizer, denylist and `gitleaks dir` green on
      this export
- [ ] **Sign** — record the approval verbatim together with the `export-manifest.json` digest it
      covers (and the input tree digest), with `date -u +%F`

## Exit criterion
The readout records the operator's verbatim approval and the exact export-manifest digest signed.
Any later change to the corpus bytes (a new digest) re-opens this row: 219 commits only bytes whose
digest matches the signed one.

## DEFERRALS rule for tickets that run before this completes
A ticket that depends on this row but runs before it is ticked opens a `D-<TICKET>-<n>` row
(kind `P`) in `DEFERRALS.md` — why deferred = "H14 pending · withholds: real corpus bytes, goldens
and snapshots", unblocked by = "H14 · owner: operator · trigger: 214b_R7DEM.1b", how to verify = the
signed digest equals the committed export-manifest digest — and reports "gate pending": never a
failure, never a fabricated pass, never a claim this row withholds (DEFERRALS rule 5). Only 219
depends on this row, and it commits nothing while the row is open.
