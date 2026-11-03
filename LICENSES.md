# Licensing and third-party dependencies

Rhema's repository license is [MIT](LICENSE). Third-party libraries, binaries, fonts, and separately supplied SDK files retain their own licenses. This page describes the dependency policy and the components that need attention when distributing source or container images.

## Dependency checks

Run from the repository root after installation:

```bash
pnpm check:licenses
```

The check reads the installed npm dependency graph and applies:

- [`licenses.allowlist.json`](licenses.allowlist.json): accepted license identifiers and expressions.
- [`licenses.exceptions.json`](licenses.exceptions.json): named exceptions with recorded rationales.
- [`scripts/lib/license-policy.mjs`](scripts/lib/license-policy.mjs): the evaluation rules. A named exception is considered before the package's declared license; otherwise the declared expression must satisfy the allowlist.

SSPL, BUSL, and AGPL are not on the current allowlist. Changes to exceptions require review. A passing npm check does not audit system binaries, font packaging, SDK redistribution rights, or compliance of a release image.

## Components outside the ordinary npm check

| Component                                              | Recorded license                         | Use and source of the build input                                                                                                           |
| ------------------------------------------------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Anthropic Agent SDK (`@anthropic-ai/claude-agent-sdk`) | Commercial terms                         | Operator-supplied wrapper and native executable in [`apps/run-task/vendor/`](apps/run-task/vendor/README.md); not included in a clean clone |
| Pandoc (`pandoc`)                                      | GPL-2.0-or-later                         | Runs as a separate process for conversion/export; see the [convert](apps/convert/Dockerfile) and [export](apps/export/Dockerfile) images    |
| Typst                                                  | Apache-2.0                               | PDF rendering in the export image                                                                                                           |
| util-linux applets                                     | GPL-2.0-or-later in the exception record | Static `setpriv`, `unshare`, and `mount` executables built from pinned source in the [run-task Dockerfile](apps/run-task/Dockerfile)        |
| libcap-ng                                              | LGPL-2.1-or-later                        | Static library used by the vendored `setpriv` build                                                                                         |
| dumb-init                                              | MIT                                      | Static PID-1 signal forwarding and reaping in run-task                                                                                      |
| Turborepo remote cache                                 | MIT                                      | Exact-pinned `turborepo-remote-cache` dependency in [`apps/turbo-cache`](apps/turbo-cache/package.json)                                     |

The Dockerfiles and lockfiles own the build versions. The SDK's presence in an image does not make it MIT-licensed or establish permission to redistribute it.

The harness must never be called "Claude Code" in Rhema's user-facing strings. This repository's branding rule is also enforced by the vocabulary linter.

The process boundary used for Pandoc and the util-linux applets describes the architecture; it is not a blanket exemption from license obligations. The FSF's [aggregation guidance](https://www.gnu.org/licenses/gpl-faq.en.html#MereAggregation) considers both the communication mechanism and how closely the programs interact, including when containers are involved. Before distributing images, review the exact component licenses and provide the applicable notices, license texts, and source or other required materials. Static libcap-ng linkage needs its own review; this document does not treat it as automatically settled by the executable's license.

## Fonts

The web build copies Latin WOFF2 assets from these Fontsource packages into `apps/web/public/fonts/`:

- `@fontsource-variable/inter`
- `@fontsource-variable/jetbrains-mono`
- `@fontsource-variable/literata`

They are recorded as OFL-1.1 exceptions. The [Open Font License](https://openfontlicense.org/open-font-license-official-text/) requires the copyright notice and license to accompany redistributed copies, including through qualifying readable metadata. Verify those materials in the final served assets and release image; the build's font-copy step and the npm policy check alone do not establish that requirement is satisfied.

## Public release boundary

Amended 2026-11-03 (operator ruling 2026-11-02, R6OSS.1; REQ-ARCH-37 re-amended): the editorial
protocols in `packages/protocols` publish with this repository — the former export-time swap to
`packages/protocols-stub` is retired and the stub is a dormant fallback. Private evaluation code
is resolved from an external `RHEMA_EVALS_PATH`; [`evals-stub`](evals-stub/) supplies the
fallback when it is unset.

These boundaries also apply to history, generated artifacts, fixtures, and logs. The marker gate checks specific public outputs; it is not an audit of everything a GitHub visibility change would expose. See [open-source readiness](docs/open-source-readiness.md) for the release work that remains. Evaluation text must never enter a client bundle, OpenAPI document, or event payload; protocol text is public by choice but is likewise kept out of shipped client artifacts by the marker gate.

## Content outside the MIT grant

The demo corpus under `packages/demo-corpus/corpus/**` — and corpus-derived `snapshots/**` and
`goldens/**` — is licensed content, not source code: it is the collected record of essays authored
by **S. J. Sebastian** (pen name; GD-DEMO-BYLINE.R7), licensed under
[CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/) (GD-DEMO-LICENSE.R7, ADR-127,
REQ-DOPS-3). The legal code ships as `packages/demo-corpus/LICENSE`. Scope: corpus content and its
derivatives only — the package's `src/` code, the invented synthetic fixture, and the rest of the
repository remain MIT. The carve-out is recorded as a `"type":"asset"` entry in
`licenses.exceptions.json`.
