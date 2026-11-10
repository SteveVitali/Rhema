# ADR-127: Corpus content licence — CC BY-NC-ND 4.0 scoped to `packages/demo-corpus/corpus/**`

- **Status:** Accepted
- **Date:** 2026-11-03
- **Ticket:** R7OPEN.1 (shell); filled and accepted by **214 R7DEM.1**. The landing-recording
  asset declaration is **249a R7PUB.1**'s.
- **Requirement ids:** REQ-DOPS-3, REQ-CORPUS-1/11/12/14
- **Spec:** `docs/round-7-draft-spec.md` §3.2 (ADR-127 bullets), §4.1; `GD-DEMO-LICENSE.R7`

## Context

The repository is MIT. Committing the four operator-owned essays implies MIT unless they are
carved out. The operator ruled **"CC BY-NC-ND 4.0"** (GD-DEMO-LICENSE.R7). The carve-out is
scoped: the repo stays MIT; GD-SHOWCASE.R6's public-domain-only rule stays scoped to the
Showcase (GD-DEMO-SHOWCASE.R7 — a scope clarification, not a supersession). The repo is public
since 2026-11-03 (D-R6OSS.1-1) and its history is permanent, so the licence boundary must exist
before the first real corpus byte can be committed (REQ-CORPUS-14 — itself gated on HUMAN-H14).

## Decision

- **Scope.** `packages/demo-corpus/corpus/**` and corpus-derived `snapshots/**`/`goldens/**` are
  licensed content under **CC BY-NC-ND 4.0**, licensor **"S. J. Sebastian"** (pen name, per
  GD-DEMO-BYLINE.R7). Package `src/` code, `tools/demo-corpus/`, and the invented synthetic
  fixture stay MIT with the rest of the repo.
- **Declaration in four places** (REQ-DOPS-3): `packages/demo-corpus/LICENSE` carries the CC
  BY-NC-ND 4.0 legal code plus a scope preamble; the package `license` field is
  `"MIT AND CC-BY-NC-ND-4.0"`; `licenses.exceptions.json` gets a `"type":"asset"` entry (the
  `fonts` precedent); `LICENSES.md` gains an appended section ("Content outside the MIT grant")
  naming the path, the licensor and the scope. `licenses-doc.test.mjs` and
  `pnpm check:licenses` stay green.
- **Inheritance.** Exported, converted and snapshot artifacts derive from `corpus/**` and inherit
  the carve-out wherever they live — the withheld `snapshots/`/`goldens/` trees and, when 219
  lands them, the committed corpus itself. The synthetic fixture is invented for this repo and is
  MIT (it is not corpus content).

## Consequences

- Public-repo permanence: the carve-out, the withhold `.gitignore` and the denylist gate are all
  in place before any real export exists; the H14 sign-off includes a licence review of
  PROVENANCE.md.
- CC BY-NC-ND forbids derivatives *of the corpus* — our own converter outputs are licensed uses
  by the licensor (the operator), which the licence permits the licensor to distribute; snapshot
  JSON is corpus-derived and rides inside the same scope.
- The MIT grant on code is unaffected; the `asset` exception documents a content licence, not a
  dependency one.

## Alternatives considered

- **All-rights-reserved.** Blocks the public-demo use entirely; rejected.
- **MIT for the corpus.** Loses the no-derivatives/no-commercial guard the operator asked for.
- **Per-file licence headers.** Noisier and easier to miss on binary PNGs; a directory-scoped
  LICENSE plus the LICENSES.md note covers every artifact under the named paths uniformly.

## Revisit trigger

The corpus licence changes, a non-operator-owned essay is added, the Showcase's
public-domain scope is revisited, or the recording asset needs a different grant.

---

**Dated note — 2026-11-07 (249a R7PUB.1).** The landing hero recording
(`apps/web/public/media/hero-tour.mp4` + `hero-tour-poster.jpg`, the declared
`HERO_RECORDING` paths in `packages/contracts/src/hero-recording.ts`) is a licensed
derivative: it is a screen recording of the logged-out demo tour and so shows corpus
content. It inherits this carve-out — CC BY-NC-ND 4.0, licensor "S. J. Sebastian" (pen
name, S-11). The declaration landed ahead of the asset (`licenses.exceptions.json`
`"demo-hero-recording"`, LICENSES.md dated paragraph); 250_R7DEP.2 captures the clip with
the committed recipe, commits the files, and completes the entry's bytes + sha256.
