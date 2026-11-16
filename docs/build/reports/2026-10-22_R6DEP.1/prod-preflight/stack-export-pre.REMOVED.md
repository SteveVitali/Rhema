# stack-export-pre.json.gz — REMOVED 2026-11-15 (265_R6PRIV.1, operator ruling P-1)

**What it was:** `pulumi stack export` snapshot of the prod stack taken before the
R6DEP.1 preflight (deployment v3, 174 resources — the full production resource graph,
including service-account identities and the operator's account email ×37).

**Why removed:** public-repo artifact cleanup — full prod stack graphs and operator
PII do not belong in the committed record. Ruling P-1 (GD-PRIVACY.R6) names this file.

**Original sha256:** `8a7939c457a2e5e24c1db80ae7abf7b855819703641ffed13c3325b725782221`

**Kept privately at:** `~/agent-scratch/private-artifacts/2026-11-15_r6priv/2026-10-22_R6DEP.1__prod-preflight__stack-export-pre.json.gz`
(byte-identical copy, verified by sha256 before removal from the repo)

Standing rule (P-1 §5): never commit Pulumi stack exports; redact before committing
any prod artifact.
