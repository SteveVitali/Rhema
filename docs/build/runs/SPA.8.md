# SPA.8 — Safety-gate repair: non-vacuous markers, provenance scan, env-leak tripwire, copy containment (run ledger)

- **Status:** DONE (Stage A; deterministic-only — offline ticket, no live legs)
- **Harness:** Devin CLI (agentic coding subagent); model: Cognition Devin; tier: n/a (build work)
- **Ticket:** `docs/tickets/105_SPA.8__safety-gates.md` (manifest row 105)
- **Branch:** `stevevitali/spa-8-safety-gates`, stacked on
  `stevevitali/spa-7-dom-contract-rtl` @ `8b81fb9` (`OPERATOR` merge policy, **not merged**).
- **Goal:** repair the gates the A4 audit proved doubly-vacuous — the protocol-marker scan pointed
  at directories CI never builds and `packages/protocols` carried zero planted sentinels — and
  extend no-cookies / env-leak / SPDX / copy-containment coverage over the SPA output per
  design/28's three-layer gate (REQ-SAFE-1..5, REQ-SAFE-8/9/10, REQ-TST-3/4, REQ-FW-9, REQ-TL-14).
- **Spend:** $0. No deploys, no production writes, no live legs.

## 0 — Context load

- DEFERRALS.md read first (per AGENTS): `D-SPA.6-1` assessed — still OPEN. Leg (a) needs the
  operator's merge+deploy of the chain; leg (b) needs CI `images` digests for the head SHA plus
  `rhema:spaSurfaces` stack config. This ticket runs no deploys ($0 work clause); a dated
  blocker-update note appended.
- LEDGER CURRENT STATE read: `nextTicket: SPA.8`, `chainTip: stevevitali/spa-7-dom-contract-rtl`,
  `mergePolicy: OPERATOR`, `round: 4`, `dispatchTarget: subagent`, `pinnedBaseSha: fab08ed`.
- Design sources applied, not re-derived: `docs/design/28_spa-safety-gates.md` F1/F2/F3/F4/F7/F8/F9
  (the vacuity diagnosis + three-layer fix); `docs/research/04_test-surface-audit.md` F5/F6;
  `docs/frontend-spa-spec.md` §9 (secrets tripwire, public-safe ordering).

## 1 — What landed

### `scripts/check-protocol-markers.mjs` + `scripts/lib/protocol-markers.mjs` — the repaired gate (REQ-SAFE-1/2, REQ-TST-3)

- TARGET_DIRS repointed at the real emitted tree: `apps/web/public` (islands + the Vite SPA
  output under `public/spa`) and `packages/api-client/dist` are **REQUIRED_DIRS — fail-closed
  when absent**; `apps/web/dist`, `apps/web/build`, `apps/mobile/dist` remain opportunistic.
- **Sentinel arming check:** the gate reads `packages/protocols/src` and refuses to pass when the
  four sentinels (`RHEMA-PROTOCOL-SECRET`, `BEGIN-RHEMA-RUBRIC`, `BEGIN-RHEMA-CALIBRATION`,
  `rhema:protocol-only`) are absent — non-vacuity in the "nothing to leak" direction.
- **Sourcemap provenance (REQ-SAFE-2 layer 2):** every emitted `.map` is parsed; `sources[]`
  entries are resolved relative to the map file's directory and matched against forbidden roots —
  `packages/protocols/`, `packages/evals/`, `apps/run-task/`, plus bare `evals/` for the private
  external checkout layout. A leak path in any shipped chunk's map fails the gate.
- `scripts/check-protocol-markers.test.mjs` (20) — tempdir fixtures prove both directions:
  sentinel-in-bundle fails, sentinel-absent-in-private-source fails, required-dir missing fails,
  provenance hits fail (repo-relative + relative-resolved + bare `evals/`), clean trees pass.
  `scripts/lib/protocol-markers.test.mjs` (4) — helper legs.

### `packages/protocols/src/{protocols.ts,manifest-types.ts}` — planted sentinels

- The four sentinels are exported as string constants adjacent to the protected text (constants
  survive minification; comments do not — F2). Placement is deliberately outside the
  `protocols_version` content-addressed trio (`skills`/`conventions`/`manifests`/`parsers`/
  `serializers`/`md-twins`) so the frozen protocol hash does not move — verified: the
  protocols-version tests still pass and `check-protocol-markers` reports "sentinels armed".

### `scripts/check-no-cookies.mjs` — extended + value-aware (REQ-SAFE-3, REQ-TST-4)

- TARGETS gained `apps/web/src/spa`, `apps/web/src/client`, the emitted `apps/web/public` tree,
  and `packages/ui/src` (ingestion/connections/samples surfaces).
- Rules are brace-aware: `name={"token"}`/`name={\`sess…\`}` and credential-named JSX props
  (`password={…}`, `apiKey="…"`) are detected, alongside the pre-existing header/field grammar.
- The emitted-bundle leg is **value-aware**: the credential-field rule requires a value-position
  lookahead (`(?=["'`{[\w$])`), so react-dom's minified input-type table `password:!0` — a
  boolean type flag, not a credential field — no longer false-positives the output scan.
- `scripts/check-no-cookies.test.mjs` (23) — every rule class proven on fixtures, including the
  `password:!0` non-hit and the brace-prop hits. Live: 189 files scanned, zero hits.

### `scripts/check-spa-env.mjs` (new) — the env-leak tripwire (REQ-SAFE-8, REQ-TL-14)

- Three legs. **Source leg:** `apps/web/src/{spa,client}` — `import.meta.env` outside the single
  `env.ts` reader seam fails; any `process.env.*` read fails; secret-shaped `VITE_*`
  (`KEY|SECRET|TOKEN|PASSWORD|PRIVATE|CREDENTIAL|DSN|SIGNING|WEBHOOK`) fails; committed `.env*`
  files are swept for the same `VITE_*` pattern.
- **Build-config leg:** secret-patterned or banned `process.env.*` in `vite.config.ts` /
  `build-client.mjs` (the `define` injection vector) fails.
- **Emitted leg** over `apps/web/public` + `packages/api-client/dist`: `process.env.<name>` reads
  outside the generic platform allowlist (`NODE_ENV`/`FORCE_COLOR`/…), `import.meta.env.<name>`
  outside Vite built-ins + non-secret `VITE_*`, and banned server env names **as quoted string
  literals** (`"DATABASE_URL"`, `env['STRIPE_…']`). Deliberately NOT bare-word matching: shared
  modules legitimately document env names in comments and export identifiers
  (`export const SPA_SURFACES` travels in `sourcesContent`); `.map` files are parsed so only
  `sourcesContent` is scanned — the `names[]` identifier table is structural metadata.
- Banned set = derived (sensitive-shaped `process.env.*` names read by real server sources — the
  self-maintaining leg, armed floor ≥10; 15 derived today) ∪ ~40 curated Rhema plumbing names.
- `scripts/check-spa-env.test.mjs` (14) — fixture legs for every violation class + clean-tree pass.
- Wired: `pnpm check:spa-env` in root scripts; CI `public-safe` runs it last (after spa-budget);
  `AGENTS.md` commands list updated.

### `eslint.config.js` — the import/env boundary lint (REQ-SAFE-8/9)

- `apps/web/src/{spa,client}/**`: `no-restricted-imports` bans `@rhema/protocols`,
  `@rhema/evals` (+ subpaths); `@rhema/api-client` is legal only as `import type`
  (`allowTypeImports`) — runtime data rides the boot JSON / BFF fetches.
- `no-restricted-syntax` bans `import.meta.env` (MetaProperty member read) and `process.env`
  member reads; `src/spa/env.ts` is the sole `import.meta.env` exemption (process.env stays banned
  there too). Verified empirically — a probe file with all four violations produced lint errors.

### Copy containment (REQ-SAFE-4)

- `apps/web/src/spa/copy-containment.test.ts` (51): per-file leg over every non-test `.tsx` —
  no JSX text nodes with letters, no literal `aria-label`/`placeholder`/`title`/`alt`/`label`
  attributes (copy arrives as `{COPY.…}` expressions or server-built label maps); a fixture
  violation proves the detector is armed; every `COPY.*` reference in SPA sources resolves to a
  real `collectCopyStrings` leaf.
- `launch-surface.test.ts` sweep gained `apps/web/src/spa` recursively (tests excluded) — the
  claim-pattern audit now covers the SPA source graph (84 tests).

### `check-licenses.mjs` — non-vacuity (REQ-SAFE-9)

- `missingRequired` (in `scripts/lib/license-policy.mjs`) asserts the enumeration covers the SPA
  dependency set (`react`, `react-dom`, `@tanstack/react-router`, `@tanstack/react-query`,
  `vite`, `@vitejs/plugin-react`, `axe-core`); a whole-graph floor (≥100 packages) refuses a
  truncated enumeration — exit 2, not green. Policy tests extended (+3).

### CI ordering (REQ-SAFE-9)

- `public-safe` is: install → stub/evals build → `turbo build --filter=@rhema/web...` (real SPA
  output + api-client dist) → gitleaks → licenses → protocol-markers → no-cookies → spa-budget →
  **spa-env** (new final step). Install precedes licence enumeration; the SPA build precedes every
  emitted-artifact scan.

### Docs (append-only)

- `docs/design/28_spa-safety-gates.md` — dated `## Resolution — 2026-10-08 (SPA.8)` addendum
  mapping every finding (F1/F2/F3/F4/F7/F8/F9 resolved; F5 shell legs belong to the render-shell
  ticket; F6 landed SPA.1); history preserved verbatim.
- `docs/research/04_test-surface-audit.md` — F5 gains a dated `Resolution` line; claim retained.

## 2 — Verification

| Gate | Result |
|---|---|
| `pnpm turbo build lint typecheck` | **PASS — 135/135 tasks** |
| `pnpm test` | **PASS — 470 files, 4965 pass, 4 skip, 0 fail** |
| `pnpm check:licenses` | **PASS — 822 packages** (incl. full SPA dep set; axe-core MPL-2.0 exception) |
| `pnpm check:protocol-markers` | **PASS — sentinels armed, 169 files, 0 markers, 0 provenance leaks** |
| `pnpm check:no-cookies` | **PASS — 189 files scanned** |
| `pnpm check:spa-budget` | **PASS — entry 157.8/250 kB gzip** |
| `pnpm check:spa-env` | **PASS — 72 client src, 94 emitted, 1 env file; 50 banned names (15 derived)** |
| New/extended test files | markers 20+4 · no-cookies 23 · spa-env 14 · license-policy +3 · copy-containment 51 · launch-surface 84 |

## 3 — Findings / deviations

- **Bare-word env-name scanning was wrong (owned decision, recorded):** the first emitted-leg cut
  flagged 14 hits — all comments/identifiers in bundled `sourcesContent` (`export const
  SPA_SURFACES`, doc-comment `` `SPA_SURFACES` `` backticks) plus the `.map` `names[]` identifier
  table. The gate was re-scoped to env *reads* (`process.env.`, `import.meta.env.` outside the
  allowlists) + *quoted-literal* banned names — the env-lookup plumbing shapes — which is what a
  leak actually looks like. Documented in the script header.
- **`password:!0` false positive (owned decision):** scanning emitted bundles surfaced
  react-dom's minified input-type map; the credential-field rule gained a value-position
  lookahead rather than a bundle-specific exemption — real credential constructs still fail
  (fixture-tested).
- **`env.ts` seam declared but not created:** nothing in `src/spa` reads `import.meta.env` today;
  the ESLint exemption + scanner path exist so the seam is legal when first needed — creating an
  empty module would be dead code.
- **Size:** ~533 changed lines + ~600 new (3 checkers' tests + check-spa-env + copy-containment)
  vs the ~600 guide — the deliverables are scanners and their failure-leg tests; recorded per the
  SPA.5/6/7 test-first precedent.
- **Deferrals:** none opened, none closed; `D-SPA.6-1` got a dated blocker-update note (unchanged —
  merge+deploy + images digests + stack config remain).

## 4 — AC ledger

- `[planted sentinel in a bundle → gate fails; sentinel absent → gate fails]` → **deterministic** —
  `check-protocol-markers.test.mjs` proves both directions on tempdir fixtures; live gate armed.
- `[src/spa importing @rhema/protocols → lint error]` → **deterministic** — probe file produced
  `no-restricted-imports` errors (path + subpath patterns verified live, then removed).
- `[SPA output scanned by no-cookies + env-leak + marker gates in CI order]` → **deterministic** —
  all three scan `apps/web/public/spa` live; `ci.yml` order is install→build→gitleaks→licenses→
  markers→no-cookies→budget→env.
- `[public-safe builds real SPA output and all scans are non-vacuous]` → **deterministic** —
  REQUIRED_DIRS fail closed; sentinel arming check; license `missingRequired` + enumeration floor;
  env derived-set floor; every scanner has failure-leg tests.
- `[universal phase-gate AC]` → this ledger, BUILD_INDEX row 133, LEDGER advanced, append-only
  validators run, PR checks read once at closeout (§5).

## 5 — CI / PR

- PR **#126** (`docs/build/pr/SPA.8.md` is the body); base `stevevitali/spa-7-dom-contract-rtl`;
  head `stevevitali/spa-8-safety-gates`; unmerged (`OPERATOR`).
- `gh pr checks --watch=false` at closeout — verbatim:
  `typecheck / lint / unit  pending  0  https://github.com/SteveVitali/Rhema/actions/runs/37799283140/job/113386864019`
  (exit 8 — the run registered but had not reported at read time; read exactly once per closeout
  discipline; the result rides the PR, not a re-read here).

### Closeout addendum (validator results)

- `bash ~/agent-skills/skills/build-memory/scripts/check-build-memory.sh .` — **0 violations,
  7 warnings**, all pre-existing classes (manifest banner/order notes incl. GATE-G1/GATE-G2,
  PHASE-LOG >2 KiB entries — this entry joins the accepted pattern, legacy index status values,
  pre-guard readouts, run ledgers without Harness headers).
- `node docs/build/tools/check-append-only.mjs --base 8b81fb9` — **append-only OK**.
- `gh pr checks --watch=false` (read once at closeout) — `typecheck / lint / unit pending`
  (exit 8; the run had registered but not reported).
