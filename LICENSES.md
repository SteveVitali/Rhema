# Licenses & third-party dependency policy

Rhema is MIT-licensed (see `LICENSE`) and closed-source but **open-source-ready** (Q-19). This
document is the human-readable companion to the machine-enforced licence policy (REQ-ARCH-40):

- **Allowlist** — `licenses.allowlist.json`: permissive SPDX licences accepted with no per-package
  rationale (MIT, Apache-2.0, BSD-2/3-Clause, ISC, and a few equivalents).
- **Exceptions** — `licenses.exceptions.json`: dependencies whose licence is **not** on the allowlist
  but is knowingly accepted, each with a rationale. An allowlist without an exception list dies by
  undocumented exceptions (review 13 F48).
- **Enforcement** — the `public-safe` CI job runs `pnpm check:licenses`, which fails the build on any
  dependency that is neither allowlisted nor excepted. **SSPL, BUSL (BSL) and AGPL never pass.**

## Exceptions and their rationale

### `@anthropic-ai/claude-agent-sdk` — commercial terms
The Agent SDK is a **proprietary** dependency that the whole run model depends on — the largest
control concession in the design (Q-3; §12.1, REQ-ARCH-4). Its commercial terms are accepted
knowingly and mitigated by the `Engine` abstraction (REQ-ARCH-7), which keeps a second engine a test
away.

**Brand rule:** the harness is hosted under **our own brand**. It is **never** surfaced to users or
marketed as "Claude Code". User-facing strings that say "Claude Code" are lint-banned
(`eslint-plugin-rhema/no-banned-strings`).

### `pandoc` — GPL-2.0-or-later, separate process
Pandoc is used only inside the isolated `export` / `convert` containers, invoked as a **separate
process** over files. GPL copyleft is **not** triggered by separate-process invocation, so it does
not affect the licensing of our TypeScript. Pandoc is a system binary shipped in the container image,
not an npm dependency, so the automated npm scan cannot see it — hence this explicit entry.

### `typst` — Apache-2.0, system binary
PDF rendering in the `export` container; a separate-process system binary. Permissive, but recorded
because the npm scan cannot see non-npm binaries.

### `util-linux` — GPL-2.0-or-later, vendored static applets (SEC.3)
The distroless run-task image vendors three statically-linked util-linux applets — `setpriv`,
`unshare`, `mount` — built from the SHA-256-pinned upstream tarball (kernel.org, util-linux 2.40.4)
because the runtime has no package manager. They are invoked as **separate processes** by absolute
argv, never linked into our TypeScript — the pandoc precedent: separate-process invocation does not
trigger GPL copyleft.

### `libcap-ng` — LGPL-2.1-or-later, statically linked into setpriv (SEC.3)
`setpriv` links libcap-ng; the toolchain ships only a shared object, so it is built static from the
SHA-256-pinned upstream source (libcap-ng 0.8.5). Static linkage into a GPL-2.0 binary produces a
GPL-2.0 whole in any case; the binary remains a separate process.

### `dumb-init` — MIT, static PID-1 init (SEC.3)
The PID-1 reaper + signal forwarder in the distroless run-task image — the equivalent-approved tini
substitute (ADR-074), built static from the SHA-256-pinned upstream source (dumb-init 1.2.5).

### `turborepo-remote-cache` — MIT, deployed container (OPS.2)
The self-hosted Turborepo remote-cache server (Ducktors) running as the `rhema-prod-turbo-cache`
Cloud Run service — wrapped exact-pinned `2.14.2` by `apps/turbo-cache` so the root lockfile carries
the integrity hash (ADR-081). MIT on the allowlist; recorded here as the deployed-container entry
the OPS.2 ticket requires.

### Fonts — OFL-1.1 / vendor-specific
Bundled font files (SIL Open Font License and vendor licences) shipped as assets in the
export/marketing containers. Redistribution terms are honored per font and enumerated here as fonts
are added.

## Notes
- Protocol IP (skills, rubrics, calibration language, prompts) lives in the **private**
  `packages/protocols` — a committed workspace member since the 2026-09-01 REQ-ARCH-37 amendment —
  and in `evals/`, which is still path-resolved (`RHEMA_EVALS_PATH`, `.pnpmfile.cjs`). Neither may
  reach a client bundle, the OpenAPI document, or an event payload (REQ-ARCH-33). A public export
  drops `packages/protocols` and builds against `packages/protocols-stub` + `evals-stub`.
- `beautiful-mermaid@1.1.3` is MIT — the earlier "licence unverified" caveat (§16.3 #22) is resolved;
  its EPL-2.0 transitive dep is excepted in `licenses.exceptions.json` (worker-only diagram layout,
  never a client bundle).
