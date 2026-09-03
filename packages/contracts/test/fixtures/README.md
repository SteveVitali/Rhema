# Real-project dossier fixtures (P0.02)

Structured-output sidecar fixtures **derived from the three real projects** in `~/agent-discourse`
(`the-politics-of-visibility`, `structure-of-political-difference`, `constitution-of-reason`). The claim
texts, verdicts, URLs, and finding titles are taken from the real markdown dossiers (`01-claim-ledger.md`,
`editors-letter.md`, `05-second-read.md`). They are hand-authored JSON twins because the upstream skills do
not yet emit sidecars (that change lands under REQ-ARCH-5 in P0.03/P0.04); this ticket owns only the schemas,
and these fixtures are what the AC6/AC8 contract tests validate the schemas against (REQ-SPEC-12, REQ-OBJ-16/17).

The golden set grows automatically once the skills emit sidecars (§11.1: every green nightly dossier becomes a
parser fixture); until then these three are the seed.
