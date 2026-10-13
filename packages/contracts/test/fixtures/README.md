# Real-project dossier fixtures (P0.02)

Structured-output sidecar fixtures **derived from the three real projects** in `~/agent-discourse`
(`the-politics-of-visibility`, `structure-of-political-difference`, `constitution-of-reason`). The claim
texts, verdicts, URLs, and finding titles are taken from the real markdown dossiers (`01-claim-ledger.md`,
`editors-letter.md`, `05-second-read.md`). They were hand-authored JSON twins at P0.02, before the ported
skills emitted sidecars — the emission landed under REQ-ARCH-5 in P0.03/P0.04 (delivered runs now emit
validating sidecars; D-P0.03-1 DONE) — and these fixtures are still what the AC6/AC8 contract tests
validate the schemas against (REQ-SPEC-12, REQ-OBJ-16/17).

The golden set grows with every green nightly dossier becoming a parser fixture (§11.1); the nightly
golden runs themselves are D-P0.15-4 (OPEN — operator-budget-gated), so these three remain the seed.
