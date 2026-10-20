# ADR-114: Deploy-provenance accepts a deployed SHA that is an ancestor of HEAD when the intervening diff is deploy-neutral

- **Status:** Accepted
- **Date:** 2026-10-20
- **Ticket:** R6ENG.1 (REQ-ENG-8)
- **Requirement ids:** REQ-ARCH-39, REQ-SPEC-29 (the JOURNEY.1 provenance assert)
- **Spec:** `scripts/deploy-neutral-paths.txt` (the owned allowlist);
  `scripts/check-deploy-provenance.mjs` + `packages/journeys/src/provenance.ts` (the twin
  implementations); `.github/workflows/journeys.yml` (`fetch-depth: 0`)

## Context

The deploy-provenance gate answers "is the deployed source the chain tip?" Before REQ-ENG-8
the only honest answer was a byte-exact SHA prefix match. Under a docs-only merge — a README,
a run ledger, an ADR — the deployed artifact is bit-identical to the artifact the previous
SHA produced, yet the nightly asserts `deployed == HEAD` and reports NO-MATCH. The nightly's
provenance line was therefore dishonest in both directions it could matter: a green read
required a deploy of documentation, and a red read trained operators to dismiss the signal.

## Decision

A strict mismatch earns exactly **one second opinion**, and it is fail-closed:

1. `git rev-parse --verify <sha>^{commit}` must resolve both SHAs — absent, `unknown`, and
   unresolvable values fail as before.
2. `git merge-base --is-ancestor <deployed> <expected>` must hold — the deployed SHA is real
   history of HEAD, not a divergent or unrelated ref.
3. Every path in `git diff --name-only <deployed>..<expected>` must match the committed
   allowlist `scripts/deploy-neutral-paths.txt`. A single non-neutral path keeps the strict
   FAIL verbatim.

**The allowlist, owned by this ADR** (grammar: `#` comments/blank lines ignored; a trailing
`/` subtree-matches; anything else is an exact path):

| rule | why it is deploy-neutral |
| --- | --- |
| `docs/` | Documentation and committed build memory (`docs/build/**`, `docs/adr/**`, `docs/tickets/**`, `docs/research/**`). No path under `docs/` is compiled, bundled, or shipped into any deployed artifact. |
| `.gitleaks.toml` | CI-only tool configuration — consumed by the secret-scan job, never shipped. |

**Deliberately NOT neutral:**

- `.github/workflows/**` — a workflow edit changes *what verification runs*. Accepting it
  under the drift arm would let a change to the very checks that vouch for provenance pass
  as "the deploy is current". Rare false-negative beats a self-attesting gap.
- `pnpm-lock.yaml`, `package.json`, `tsconfig*.json`, any `src/`/`app`/`packages/`/`infra/`
  path — these change what the build produces.

Both consumers implement the same grammar over the same file: the standalone gate
(`scripts/check-deploy-provenance.mjs` via `scripts/deploy-neutral.mjs`) and the in-process
twin (`packages/journeys/src/provenance.ts`, read from the repo root relative to the module —
three hops reaches the root from both `src/` and `dist/`). The journeys runner records the
labels that passed under drift in `report.provenance.drift` so the report keeps saying which
arm carried the verdict; the standalone script prints `deploy-neutral drift` on each drifted
label.

The scheduled workflow checks out `fetch-depth: 0` — ancestry is unresolvable under the
default depth-1 clone, and an unresolvable ancestry fails closed (never silently passes).

## Consequences

- A docs-only merge no longer forces the nightly to lie about provenance; `expected` is
  meaningful — the chain tip the repo is *supposed* to be at — rather than an artifact that
  must equal the documentation commit byte-for-byte.
- Anything that failed before REQ-ENG-8 still fails: the drift arm only ever **upgrades a
  strict mismatch to pass** when both gates hold, and it cannot mask a redeploy of real code.
- R6SWP.1 and R6WATCH.1 consume `scripts/deploy-neutral-paths.txt` as the single source of
  truth; widening the allowlist is a new ADR, not a drive-by edit.
- Known lexical edge, accepted: subtree matching is a path-prefix test, so
  `docs/../src/x.ts` *appears* neutral to the matcher — but `git diff --name-only` never emits
  `..`-containing paths, so the hole is unreachable through the only caller.

## Alternatives considered

- **Require redeploy on every merge** (status quo): rejected — forces either a dishonest
  nightly or an unnecessary production redeploy for documentation.
- **Allowlist `.github/workflows/**` too**: rejected above — CI-behavior edits are not
  deploy-neutral under this ruling; revisit if workflow-only merges become frequent.
- **A glob engine instead of prefix rules**: rejected — two rules need two match arms; a
  minimatch dependency in the standalone script is worse than the accepted lexical edge.

## Revisit trigger

Reopen when (a) a workflow-only merge becomes frequent enough that the deliberate
`.github/workflows/**` exclusion costs more false negatives than the self-attestation risk
it guards, (b) a new file class emerges that is provably absent from every deployed artifact
(candidate rule additions go through a new ADR — `scripts/deploy-neutral-paths.txt` is never
edited drive-by), or (c) the deployed artifact's build inputs change such that a path under
`docs/` starts shipping (the allowlist's premise inverts and the whole arm must be
re-examined, not patched).
