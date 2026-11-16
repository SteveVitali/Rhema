# stack-export-pre.json.gz — REMOVED 2026-11-15 (265_R6PRIV.1, operator ruling P-1)

**What it was:** `pulumi stack export` snapshot of the prod stack taken before the
R6INF.1 proxy MIG leg (deployment v3, 174 resources — the full production resource
graph, including service-account identities and the operator's account email ×37).

**Why removed:** public-repo artifact cleanup — full prod stack graphs and operator
PII do not belong in the committed record. Ruling P-1 (GD-PRIVACY.R6) names this file.

**Original sha256:** `8ed171c0a4da95764c522cf977478ab894eaaf3e37a037285de675c415333085`

**Kept privately at:** `~/agent-scratch/private-artifacts/2026-11-15_r6priv/2026-10-22_R6INF.1__stack-export-pre.json.gz`
(byte-identical copy, verified by sha256 before removal from the repo)

Standing rule (P-1 §5): never commit Pulumi stack exports; redact before committing
any prod artifact.
