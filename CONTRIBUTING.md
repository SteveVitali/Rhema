# Contributing

## Prerequisites
- Node.js ≥ 20 (CI uses 22)
- pnpm 10 (`corepack enable` picks up the pinned `packageManager`)

## Getting started
```bash
pnpm install
pnpm turbo build lint typecheck
pnpm test
```

`@rhema/protocols` is a committed workspace member (`packages/protocols`) — this repo is private, so a
plain `pnpm install` builds the real graph (REQ-ARCH-37, amended 2026-09-01). Only `@rhema/evals` is
still path-resolved: point `RHEMA_EVALS_PATH` at the private evals checkout to develop against it,
otherwise the in-repo `evals-stub` satisfies the graph (`.pnpmfile.cjs`):
```bash
export RHEMA_EVALS_PATH=/abs/path/to/rhema-evals
pnpm install
```

## Monorepo invariants (Bazel-compatible; enforced)
1. **Explicit per-package dependencies** — a package may import only what its `package.json`
   declares. No relying on hoisting.
2. **Project references** — every package is a composite TS project; the graph builds with `tsc -b`.
3. **No cross-package relative imports** — reach other packages only through the `@rhema/*` graph
   (`eslint-plugin-rhema/no-cross-package-relative-import`).
4. **Canonical vocabulary** — plans / model tiers / rigor / seats / approvals are a disjoint,
   verbatim vocabulary (`eslint-plugin-rhema/no-banned-strings`; spec Appendix D.2).

## Commit hygiene
- No user text and no secrets in history (secrets are gitleaks-scanned in CI).
- Every dependency must be allowlisted or listed in `licenses.exceptions.json` with a rationale.

See `AGENTS.md` for the full conventions this monorepo establishes.
