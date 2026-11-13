# Contributing to Rhēma

Contributions can improve the writing experience, the reliability of agent runs, or the clarity of
the project itself. A useful contribution explains the problem, makes a focused change, and gives
reviewers a way to verify the result.

The repository is public under the MIT license (the 2026-11-03 visibility flip). Read the
[release boundary](docs/open-source-readiness.md) for what publishes (the tree, including
`packages/protocols`) and what stays outside it (private evaluations, resolved through
`RHEMA_EVALS_PATH` with a committed stub fallback). Local development on this source tree does
not require a private evaluation checkout or the maintainer's agent-skills installation.

## Choose a change

- For a bug, include a minimal reproduction, expected and actual behavior, the commit tested, and
  relevant logs with credentials and private writing removed.
- For a feature or architectural change, describe the user problem and proposed behavior in an
  [issue](https://github.com/SteveVitali/Rhema/issues) before building a large change.
- For documentation, identify the instruction or explanation that failed and how you verified the
  replacement. Small corrections can go straight into a pull request.
- For a vulnerability, use the private route in [SECURITY.md](SECURITY.md).

Keep discussion about the work specific and respectful. Describe tradeoffs and evidence, and make
space for maintainers or other contributors to suggest a different approach.

## Set up a checkout

Use Node.js **22.12+ on the 22.x line** and **pnpm 10.32.1**. Clone your fork, or this repository if
you have access, and run from its root:

```bash
git clone https://github.com/SteveVitali/Rhema.git
cd Rhema
pnpm install --frozen-lockfile
pnpm turbo build lint typecheck
```

The example clones the upstream repository. If you do not have push access, fork it on GitHub
first and replace the clone URL with your fork's URL. The same build commands apply.

The [development guide](docs/development.md) covers focused build/test loops and local web inspection.
The [configuration reference](docs/configuration.md) explains which services require additional
infrastructure. There is no single command that starts the complete hosted stack locally.

## Work within the package boundaries

- Add every imported dependency to the consuming package's `package.json`. Do not rely on hoisting.
- Cross package boundaries through `@rhema/*` exports. Within a package, relative TypeScript imports
  use `.js` extensions under NodeNext.
- Keep TypeScript project references aligned with workspace dependencies. A new package also needs
  a root `tsconfig.json` reference and build, lint, and typecheck scripts.
- Use TypeScript for application and infrastructure changes; do not introduce Python.
- Keep shared contracts and product vocabulary in `packages/contracts`. Plans, model tiers, rigor,
  seats, and approvals are distinct concepts. Use their existing names.
- Follow [AGENTS.md](AGENTS.md) and relevant scoped instructions for tenant isolation, money,
  research integrity, browser behavior, and protected records. These describe constraints on the
  implementation, regardless of whether a person or an agent writes it.

For a new dependency, review [LICENSES.md](LICENSES.md) and the machine policy before adding it.
Regenerate the lockfile with pnpm; do not edit it by hand.

## Validate the change

Build workspace dependencies before running tests, because package exports resolve to compiled
`dist` files. For example:

```bash
pnpm turbo build lint typecheck --filter=@rhema/editor...
pnpm exec vitest run packages/editor
```

The [testing guide](docs/testing.md) describes the full suite, real-browser prerequisites, optional
database/Docker legs, and public-bundle checks. Database tests that receive `DATABASE_URL` write to
that database; use a disposable instance. Deployed browser journeys are a separate acceptance step
with their own accounts, authorization, and spending controls.

User-surface changes need visible-text and actionable-control browser evidence, screenshots, and
deployment provenance under the repository's journey contract. A local component test does not
replace that acceptance evidence. If you cannot run an operator-owned check, state exactly what is
unverified so the maintainer can arrange it.

Format only the files you changed. Documentation is excluded by the repository's `.prettierignore`,
so check a Markdown change explicitly, for example:

```bash
pnpm exec prettier --ignore-path /dev/null --check README.md CONTRIBUTING.md
```

## Open a pull request

Explain the problem and resulting behavior, link relevant issues, and record the checks you ran with
their results. Include screenshots for visible changes and identify anything that still needs a
maintainer's environment. Avoid unrelated formatting changes and generated build output.

Review your diff for credentials, personal data, private manuscripts, and protocol/evaluation content.
Use synthetic fixtures or material whose inclusion is authorized. Do not paste private production
logs into an issue or pull request.

CI covers build/lint/typecheck, tests, contracts, integration, images, and public-artifact checks.
See [CI policy](docs/ci.md) for the actual job graph and documentation fast-path rules. A Markdown-only
change is not automatically eligible for the fast path.

Maintainers merge pull requests. Work in the managed ticket chain additionally follows the
[manifest](docs/tickets/00_MANIFEST.md), [deferrals ledger](docs/tickets/DEFERRALS.md), and append-only
build-memory rules; its pull requests stack and are merged by the operator in dependency order.

## Keep documentation trustworthy

Maintained guides describe current source and verified procedures. Specifications, ADRs, executed
tickets, and build evidence record decisions and history; correct them through the documented
amendment process. The [documentation modes](docs/README.md#document-modes) identify which is which.
Do not turn a dated observation into a claim about the current deployment.
