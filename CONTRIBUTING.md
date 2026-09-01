# Contributing

## Prerequisites
- Node.js ≥ 20 (CI uses 22)
- pnpm 10 (`corepack enable` picks up the pinned `packageManager`)

## Getting started
```bash
pnpm install                 # builds against the PUBLIC stubs by default (REQ-ARCH-37)
pnpm turbo build lint typecheck
pnpm test
```

A public clone builds and passes CI without the private protocols/evals checkout. To develop against
the private code, point the resolver at it:
```bash
export RHEMA_PROTOCOLS_PATH=/abs/path/to/rhema-protocols
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
