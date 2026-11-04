# R4 — Acceptance, deploy and build-memory conventions for the round-7 demo

- **Row:** R4 (round-7 spec research). **Date:** 2026-11-03. **Mode:** read-only. No source was
  changed, nothing was committed, and no live, deploy or paid script was run. **Spend:** $0.
- **Inputs:** root `AGENTS.md`, `docs/AGENTS.md`, `packages/journeys/AGENTS.md`, `infra/AGENTS.md`,
  `apps/web/AGENTS.md`, `docs/round-7-demo-brief.md` (§7a rulings), and the files cited inline.

---

## 1. Acceptance mechanics (JOURNEY.1)

**Registry and runner.**

- `packages/journeys/src/registry.ts` holds `STEP_REGISTRY`. Each row is
  `{id, journey, asserts, owner, expected, paid, capUsd?, cogsLevers?}`, and `JourneyName` is
  `new-visitor | returning | phone | two-tenants`.
- Step bodies live in `steps.ts`. `runner.ts` drives them: a red step that fails reports `owed`, a
  red step that passes reports `ready-to-flip`, and a green step that fails fails the run.
- The runner screenshots the last opened page (`fullPage: true`) into the out dir. It also writes
  `report.json` after every leg.
- A step turns `expected: "green"` only in its owner's PR, with the screenshot
  (`packages/journeys/AGENTS.md` § Code Conventions).

**Public versus signed-in legs.**

- `ctx.anon()` gives a sessionless context. `ctx.returningUser("a")` gives the persistent `jrn-a`
  test identity, signed in through the real magic link to `test@rhema.tools` (`session.ts`,
  `mailbox.ts`).
- Public precedents:
  - `N10` (steps.ts ~2380) checks every public route for a distinct branded `<title>`, exactly one
    `<h1>`, description/OG/Twitter meta and a favicon. It also checks the copy has no "private
    beta", "1.x" or "coming soon", and that signed-out `/showcase` renders the sample dossier
    ("The Extinction of Man" + "Contradicted").
  - `P1.public` (~1723) requires no overflow at 390 and 320 px, a labelled scrollable matrix region,
    200% zoom and axe clean.
- Signed-in precedent: `R8.showcase` (~2432). Phone family: `P1.project`, `P1.dossier` and the
  rest use a phone UA; Page SSR is the server verdict `isPhoneRequest(c) || row.showcase`
  (`apps/web/AGENTS.md`).

**Target selection.**

- `node packages/journeys/dist/cli.js` takes these flags:
  - `--stage prod` resolves `https://rhema.tools` / `https://api.rhema.tools`. A preview needs
    explicit `--web/--api` run.app origins plus `--invite-code prv-<n>-test`.
  - `--steps` takes a CSV of ids or prefixes.
  - `--surface` selects `SURFACE_GATES` subsets (`surface-gates.ts`).
  - `--expect-renderer ssr|spa` asserts the renderer of each actual document.
  - `--expect-sha` sets the expected deployed SHA.
- `.github/workflows/journeys.yml` runs every `paid:false` leg nightly at 06:05Z. Since PR #233,
  scheduled runs resolve the expected SHA from the deployed `/healthz`.

**Provenance.**

- `scripts/check-deploy-provenance.mjs --expect <sha> --healthz https://rhema.tools --healthz
  https://api.rhema.tools` reads `/healthz` → `build.gitSha`. That value is baked in by Dockerfile
  `ARG GIT_SHA` → `RHEMA_BUILD_GIT_SHA`.
- The check fails closed. The in-process twin is `packages/journeys/src/provenance.ts`. The CLI
  exits non-zero on `NO-MATCH` when an expectation is given (`cli.ts:283–285`).
- The R6ENG.1 drift arm (ADR-114) accepts a trailing deployed SHA only when the diff touches nothing
  but `scripts/deploy-neutral-paths.txt` (`docs/`, `.gitleaks.toml`).
- **Consequence:** any change under `packages/demo-corpus/` or `apps/web/` is non-neutral. Every
  service that reports `/healthz` must be rebuilt at the tip. A web-only roll would leave api on the
  old SHA and fail strict provenance. R6SECR.1 hit exactly this: its api-only stage 1 needed a
  stage-2 full-set rebuild.

**`showcase-fresh-leg.ts` precedent (R6CNT.2).**

- A standalone tsx script outside the registry, run as
  `tsx packages/journeys/src/showcase-fresh-leg.ts --web …`.
- It signs up a fresh test-mailbox identity, waits for `[data-finding]` on `/showcase`, and prints
  a JSON line with every timestamp. The 60 s budget is enforced as `ok`.
- Evidence went to `fresh-showcase-leg/runs.jsonl`: 1,737 ms landing→finding on prod. It discharged
  part of D-P1.17-2.
- It is the template for a **timed, numbers-printed** leg. It is not the template for a
  nightly-gated leg, because it sits outside `STEP_REGISTRY`, the runner screenshots and
  `--expect-sha`.

**A demo leg set (proposed).** Registry rows, `paid:false`, `expected:"red"` until Stage B. A family
prefix such as `D*` (the convention is `N*`/`R*`/`P1.*`, with suffixes for sub-assertions):

- **`D1.hub` (new-visitor, `anon()`)**
  - `/demo` meets N10's invariants: distinct title, one `<h1>`, meta and favicon.
  - Four essay cards are visible and actionable (`assertActionable` occlusion check).
  - The persistent provenance banner text is present.
  - The landing and `/showcase` entry links resolve to `/demo`.
- **`D2.tour` (new-visitor, `anon()`)**
  - The full hero tour on *Politics of Visibility*, end to end. Per step, assert:
    - the coach mark is visible;
    - its target DOM-contract selector is visible and un-occluded;
    - Next/Back are actionable;
    - the route changed through the expected mechanism (`settleClientNav` versus
      `settleDocumentNav`, `settle.ts`).
  - The final CTA links to `/signup` with its attribution.
  - Screenshot per step via the UX.2 per-width precedent (`ctx` evidence dir).
- **`D3.readonly` (both, `anon()` + `returningUser`)**
  - Zero same-origin non-GET requests.
  - No `EventSource`/WebSocket to the feed or `/collab`.
  - No 4xx/5xx. The runner already captures requests and console per step.
  - No mutation forms or contenteditable.
- **`R*.demo` (returning)**
  - Signed-in `/demo` renders the same content as logged-out (brief §1).
  - Use `returningUser("a")`, not a fresh signup (see §6 on cohort pollution).
- **`P1.demo` (phone)**
  - 390 and 320 px, no overflow, axe clean.
  - The phone reader contract holds: `data-readonly` set and §10.1's desktop-capability set never
    mounts.
- **Renderer**
  - Each demo document must carry truthful `data-renderer`/`data-route`.
  - Add the demo routes to `--expect-renderer` scope once their posture is decided (§Q3).
- **Spend**
  - All legs above are $0 metered. They never touch `spend-guard.ts`, `--headroom`,
    `funded-window.mjs` or `CapOverrunError`; those apply only to `paid:true` rows.
  - Preview stacks are not $0. Infra cost was ≈$4–6 for pr-207 (≤ $8 envelope) and ≈$2–4 for
    pr-219.

---

## 2. Preview and deploy path

**`scripts/live/preview-stack.mjs`.**

- It is the only lifecycle path. Verbs: `init/select/config/resend-pull/stripe-pull/output/preview/
  up/refresh/seed-invite/destroy/rm`.
- Only `^pr-\d+$` names are accepted. It refuses `prod` for every verb, reads included, with no
  override. Mutating verbs require the `rhema:owner=ops-preview` tag.
- **Session recipe:** `init` → `config rhema:serviceImages`/`rhema:gitSha` → `resend-pull` → `up` →
  `gcloud run jobs execute rhema-<stack>-migrate` → `seed-invite` → journeys with `--invite-code`.
- **Teardown has three acts:** `destroy` → zero-orphan sweep → `rm`.
  - The GCP-managed `serverless-ipv4-cloudrun-*` reservations lag about 2h20m. R6DEP.1 refused a
    direct `addresses delete`.
  - The orphan sweep covered 25 resource classes (`docs/build/runs/R6DEP.1.md`).

**How round 6 deployed prod.** Sources: `docs/tickets/186_R6DEP.1__tip-deploy.md`; run records
`R6DEP.1–4.md` and `R6HRD.1.md` in `docs/build/runs/`.

1. Preview `pr-<n>` with the `paid:false` suite and an `--expect-renderer` sweep.
2. Cloud Build, all 10 images at the tip (`_GIT_SHA`, `_TAG`; vendored-SDK gate fail-closed).
3. Copy the digests to `rhema-prod` AR and re-pin them in `infra/pulumi/Pulumi.prod.yaml` with dated
   comments.
4. Classify `pulumi preview --diff` against each condition and commit the classification.
5. `pulumi up --stack prod`.
6. `check-deploy-provenance` all-PASS on web + api.
7. Record the `deployments` row with `scripts/live/record-deployment.mjs`.
8. Smoke ($0):
   - public routes 6×200 with `data-renderer=ssr`;
   - `N10` + `P1.public` under `--expect-renderer ssr`;
   - `R8.inbox` + `T2.badge` signed-in;
   - worker consuming.
9. Commit the rollback recipe (`git revert` + redeploy the previous SHA).

- Migrations, if any, go through `scripts/live/prod-migrate-seed.mjs`, with
  `scripts/check-additive-migrations.mjs` in-band.
- R6DEP.4 (2026-10-30) deployed `main` tip `4938b8e` and set the current pattern: operator merge
  first, then deploy main, so `main == prod` and the scheduled nightly stays green.

**GD-DEPLOY.R6** (LEDGER § GATE DECISIONS › Round 6, 2026-10-20).

- **Items:** "`pulumi up` stage `prod` of a round-6 chain-tip SHA (and the post-merge `main` HEAD
  redeploy) by round-6 tickets that name the deploy as a production mutation".
- **Conditions:**
  - zero stateful replace/delete;
  - additive migrations only;
  - monthly cost Δ ≤ $15;
  - provenance all-PASS after.
- **Expires:** GATE-ACCEPT.R6.
- **Not literally expired.** Row 203 is unsigned: `nextTicket` is still 200 and no GATE-ACCEPT.R6
  row exists in GATE DECISIONS.
- **But it does not cover round 7.** Its items name round-6 tickets, and round-6 spec §9 puts "new
  product features or surfaces" explicitly out of scope. The post-launch maintenance deploys
  (R6DEP.4, R6HRD.1) were already stretching it with ad-hoc operator directives. If GATE-ACCEPT.R6
  is signed partway through round 7, it ends anyway.
- **A round-7 prod deploy needs a new ruling, `GD-DEPLOY.R7`.**

**Web image and corpus data** (`apps/web/Dockerfile`, `.dockerignore`).

- The builder runs `COPY . .` → `pnpm install --frozen-lockfile` →
  `pnpm --filter @rhema/web... build` → `pnpm --filter @rhema/web --prod deploy --legacy /bundle`.
  The runtime then copies `/bundle` plus `apps/web/public`.
- `.dockerignore` excludes only `node_modules`, `dist`, `.turbo`, `*.tsbuildinfo`, `.git`,
  `.agents`, `agent-scratch`, `.github` and `*.log`.
- A committed `packages/demo-corpus/corpus/**` therefore reaches the builder.
- It reaches the runtime only if two things hold:
  1. `@rhema/web` declares `@rhema/demo-corpus: workspace:*` as a **production** dependency.
  2. `pnpm deploy` copies the data files. Today no Rhema package declares a `files` field, so pnpm
     copies the whole package directory. A `files: ["dist"]` field would silently drop
     `corpus/`.
- Data the SPA fetches at runtime must be emitted under `apps/web/public` or served by the web
  server from the package. It must not be imported into a JS chunk (§3, SPA budget).
- **This is an inference.** Prove it with an image-content assertion: a `RUN test -s …` in the
  Dockerfile, or an `images`-job probe, plus a deployed-route 200 check.
- A GCS bucket would add infra and its contents would sit outside the provenance SHA. In-image
  data is the deterministic choice.

---

## 3. CI and repo checks a new package or corpus touches

- **Licences**
  - **What the check scans.** `pnpm check:licenses` (`scripts/check-licenses.mjs`,
    `scripts/lib/license-policy.mjs`) evaluates `pnpm licenses list --json`, which is the npm
    dependency graph only.
  - **Workspace packages and content are not scanned.** The enumeration contains 0 `@rhema/*`
    entries; that is why `@rhema/protocols` "UNLICENSED" passes. Corpus text is never inspected.
  - **How to declare the carve-out.**
    - Add a documentation-only entry in `licenses.exceptions.json` with `"type": "asset"`. The
      `fonts` precedent has `license` + `rationale`.
    - Add `packages/demo-corpus/LICENSE` (CC BY-NC-ND 4.0 legal code) and a `license` field
      (`CC-BY-NC-ND-4.0` for the data, or `MIT AND …` if code ships too).
    - Add a new `LICENSES.md` section ("Content outside the MIT grant") naming the path, the
      licensor (pen name, per GD-DEMO-BYLINE.R7) and the scope.
  - **Format constraint.** `tools/checks/licenses-doc.test.mjs` asserts the existing SDK, pandoc
    and "Claude Code" lines remain. Append; never restructure.
- **Protocol markers**
  - **What it scans.** `pnpm check:protocol-markers` covers `apps/web/public`, `apps/web/dist` and
    `packages/api-client/dist` (`.js/.json/.html/.map/...`). It looks for the four sentinels
    (`RHEMA-PROTOCOL-SECRET`, `BEGIN-RHEMA-RUBRIC`, `BEGIN-RHEMA-CALIBRATION`,
    `rhema:protocol-only`) and for sourcemap provenance leaks.
  - **Essay text will not trip it.** But an SPA import that drags `packages/db`, `apps/api`,
    `packages/benchmark` and the like into `public/spa` maps will.
  - **New `apps/web/src/*` modules imported by the SPA** must match `SPA_WEB_SRC_ALLOW`
    (`check-protocol-markers.mjs` ~line 67) or live under `apps/web/src/spa/`.
  - **`@rhema/demo-corpus` must not import server-only packages** if the SPA ever imports it.
- **gitleaks**
  - **Config.** `.gitleaks.toml` uses the default ruleset; `docs/.*` is path-allowlisted.
  - **The corpus is scanned on every head**, including full history on push and dispatch.
  - **Source-note URLs are the risk:** long opaque query params (`usg=`, `sig=`, `X-Goog-Signature`,
    `token=`, session ids) can match `generic-api-key`.
  - **Prefer sanitizer stripping over allowlisting.** Any allowlist entry must be a narrow regex
    with a dated comment (the existing entries are the precedent).
  - **Commits are permanent public history.** The repo is public since 2026-11-03, and history
    rewrites need operator action (F-R6DEP.2-2 precedent). The sanitizer and denylist must run
    before the first corpus commit.
- **Vocabulary lints**
  - **ESLint `rhema/no-banned-strings`** (`eslint.config.js:61`) bans only "Claude Code", "you will
    be billed" and "writes like you", in TS/JS string literals. JSON is not linted. `docs/**` is
    ignored.
  - **`lintCopy` (`packages/contracts/src/vocab-lint.ts`, `reserved-strings.ts`)** runs only over
    `collectCopyStrings()` (`apps/web/src/copy.test.ts`). It bans whole words such as `gate`,
    `checkpoint`, `author`, `wrong`, `browser`, `unlimited` and `Pro`.
  - **Essays and dossiers would trip `lintCopy` if placed in `copy.ts`.** Keep them out, as
    `apps/web/src/sample-dossier.ts` does ("Editorial CONTENT, not product vocabulary").
  - **Tour and chrome copy must go into `COPY`** (copy containment below), so it is linted. The tour
    says "approval", never "gate".
- **Copy containment** (`apps/web/src/spa/copy-containment.test.ts`, REQ-SAFE-10)
  - No JSX text or literal `aria-label/title/alt/label/placeholder` in `apps/web/src/spa/**/*.tsx`.
    Every `COPY.x` must resolve.
  - Corpus text must therefore arrive as data (props/DTO), never as literals in SPA source.
- **Launch-surface lint** (`packages/security-checks/src/launch-surface.test.ts`)
  - It recursively scans **every non-test file under `apps/web/src/spa`** with comparative and
    evasion regexes (`better than`, `faster than`, `superior`, `#1`, `turnitin`, `ai detect`, …).
  - **Essay text committed under `apps/web/src/spa` would fail it.** That is another reason to keep
    the corpus in `packages/demo-corpus`.
  - `lintGrowthCopy`'s `FUNNEL_SCOPE` is `landing./pricing./signup./showcase.` only. **Add
    `/^demo\./`** so demo copy gets the evasion, logo, unbuilt-asset and comparative bans.
    `PROMISE_SCOPE` also deserves demo hero/CTA keys.
- **DOM contract** (`pnpm check:dom-contract`, `apps/web/src/dom-contract.ts`)
  - Four directions: journeys ⊆ manifest, SPA-emitted ⊆ manifest, manifest ⊆ emitted, manifest ⊆
    asserted.
  - Every new demo hook needs all three: declared, emitted, and asserted by a journey or test.
    Hooks include the banner, card, tour step, tour next/back and read-only markers.
  - Tour step data that names selectors should get a unit test pinning them to manifest entries.
- **SPA budget** (`pnpm check:spa-budget`, `apps/web/spa-budget.json`)
  - Gzip ceilings (B = bytes):

    | Group | Ceiling |
    | --- | --- |
    | Entry | 256,000 B |
    | Other async chunk (each) | 153,600 B |
    | Total JS | 819,200 B |
    | Total CSS | 61,440 B |

  - Only `.js`/`.css` in the Vite manifest count. JSON fetched at runtime does not; JSON imported
    becomes JS and does. Serve snapshots as same-origin fetches, as the brief proposes.
  - `check:spa-env` also applies: no `import.meta.env` outside `spa/env.ts`.
- **`public-safe` job** (`.github/workflows/ci.yml:338+`)
  - Builds the stubs and the real web build.
  - Always runs gitleaks and `check:no-cookies`.
  - On the full path only, also runs licences, markers, `spa-budget` and `spa-env`.
  - `check:no-cookies` covers the **ingestion** surface only (connectors, ingest routes, OpenAPI).
    It does not scope analytics.
- **Fast path** (`docs/ci.md`, `scripts/ci/fast-path-paths.txt`)
  - Only `docs/` is eligible, minus `docs/build/tools/` and `docs/build/record_policy/`.
  - Corpus and package changes always take the full path.
  - A full run is required per gate and per deploy SHA (GD-CI-FULLRUN.R6). Branch protection on
    `main` requires `ci-pass anchor`.
- **New-package checklist** (root `AGENTS.md` § Code Conventions)
  - `packages/demo-corpus`, named `@rhema/demo-corpus`, `type: module`, with `build`/`typecheck`/
    `lint` scripts (the `packages/tokens/package.json` shape).
  - `tsconfig.json` extends `../../tsconfig.base.json` and references each workspace dependency.
  - Add the package to the root `tsconfig.json` references.
  - `turbo.json` needs nothing: build outputs `dist/**`. Committed data outside `dist` must not
    depend on build.
  - JSON imports under NodeNext with `verbatimModuleSyntax` need `with { type: "json" }` and
    `resolveJsonModule`. Prefer reading files with `fs` server-side.
  - Colocated `*.test.ts` is picked up by `vitest.config.ts` (`packages/**`).
  - Add a root `AGENTS.md` work-area row and a scoped `packages/demo-corpus/AGENTS.md`.
  - No `infra/pulumi` change, since this is not a new container.

---

## 4. Build-memory conventions for opening round 7

**Manifest** (`docs/tickets/00_MANIFEST.md`).

- Round 6 opened `### Round 6 — public launch readiness (spec: docs/round-6-draft-spec.md v0.3,
  ratified 2026-10-20)` under `## The chain`.
- Its table is `| # | file | phase | scope | gate |`, numbered from 176, with suffix-letter markers
  (`176a`, `185a_HUMAN-H10`, `190b_GATE-R6B`).
- **HUMAN and GATE rows** use scope `**human** — …` / `**gate** — …`, own files, and the phase
  "R6 marker".
- **Gate cells:** `pre-auth (GD-…)`, `operator`, `R6B`, `LAUNCH` or `—`.
- **Tail pattern:**
  - `R6CAP.1` gap analysis;
  - `R6CAP.3` closure;
  - `GATE-ACCEPT.R6`;
  - `R6REC.1–3` (backlog, spec, integration plan);
  - `R6DOC.1–2`.
- **Recording obligations:**
  - Plus a `## Plan extensions` line (append-only, checked).
  - The `## Human prerequisites` H-row block (H10–H13; **next free: H14**).
  - `## Spec amendments applied` lines.
  - Requirement-ID index rows.
  - **Run-time inserts** use suffix letters and a Plan-extensions line (BM-MANIFEST-03).
  - Never rename files; an id never re-binds.
- **Hygiene note:** rows `204_R6OSS.1` and `204_R6REC.1` share sequence 204. Round 7 must start at
  **209** and must not reuse a number.

**GATE DECISIONS** (`docs/build/LEDGER.md`).

- Round 6 added a `### Round 6` sub-block with a preamble and the table
  `| date | ticket | gate | item | answer (verbatim) | consequence | kind |`.
- Planning rulings are `post-chain (planning)` rows, quoting the selected label verbatim and giving
  the recorder's reading in `consequence`.
- `check-append-only.mjs` requires the base GATE DECISIONS section to be a strict prefix of head.
  So append `### Round 7` **after the last Round-6 row and before `## RETURN PASS`**.
- The brief's §7a rulings (GD-DEMO-*.R7) are not yet in the LEDGER and should be appended there
  verbatim.

**PHASE LOG.**

- There are three `## PHASE LOG…` headings. The checker prefix-checks only the first match.
- Round 6 used `## PHASE LOG — Round 6`.
- **Recommendation:** open `## PHASE LOG — Round 7` at the end of the file, and log the remaining
  R6 tail entries there chronologically (tagged R6). This keeps "newest last" true file-wide.

**ADRs.**

- Next free number: **ADR-126** (latest is ADR-125). Template: `docs/adr/_TEMPLATE.md`.
- Regenerate the index with `build-memory adr-index`; never hand-edit it.
- Two ADRs are warranted:
  1. **"Public demo served from static snapshots via a fixture DataSource; no DB, no tenant, no
     session."** This is the first anonymous IDE surface. It sets the renderer posture versus
     `SPA_PUBLIC_ROUTES`-stay-SSR and the "replayed run" labelling. Related: ADR-062/ADR-108
     (showcase route / forced SSR) and ADR-121 (authored-bundle honesty).
  2. **"Non-public-domain, operator-owned content admitted under CC BY-NC-ND 4.0, scoped to
     `packages/demo-corpus`."** This is a licence carve-out in an MIT repo. It records that the
     public-domain-only rule stays scoped to the Showcase (GD-SHOWCASE.R6 untouched, per
     GD-DEMO-SHOWCASE.R7). It is a scope clarification, not a supersession.

**DEFERRALS row format.**

- Each ticket gets a section `## <TICKET> — <title> (<date>)`.
- Row header: `| ID | Item (AC / deliverable) | Why deferred | Unblocked by | How to verify when
  unblocked | Proxy in place now | Status |`.
- The first canonical status token in the last cell wins (`scripts/deferral-status-parity.test.mjs`).
- A status flip prepends a dated keyword. The original cell text must survive verbatim
  (append-only check 2).

**Ordering against the R6 tail.**

- `nextTicket: 200_R6WATCH.1` is clock-bound (≥ 2026-11-11T04:0xZ).
- `check-build-memory.sh` **warns** when `nextTicket` is not the lowest unlanded row. A row leaves
  the order only via gate-cell tokens `superseded-by(…)`, `superseded-by-split`, `deferred(<D-id>)`
  or `unused`.
- Out-of-order landings have precedent: `204_R6OSS.1` was an "out-of-order tail" with `nextTicket`
  staying 200, and the R6DEP.2–4/R6HRD.1/R6PAIDARM insert and findings runs did the same.
- **Recommendation:**
  1. Append `### Round 7 — public demo (spec: docs/round-7-demo-spec.md, ratified <date>)` after row
     208, with rows **209+**.
  2. Keep `nextTicket` truthful at `200_R6WATCH.1` until it lands.
  3. Dispatch round-7 rows out of order under an explicit ordering ruling (`GD-ORDER.R7`).
  4. Fork round 7 from `main` HEAD, not the stale `chainTip` (`r6dep-4-limiter-deploy`), and update
     `chainTip`.
- Do **not** slot round-7 rows as `199a…` under the Round-6 banner: that is a different spec, and
  round-6 §9 excludes new surfaces.
- R6CAP/GATE-ACCEPT.R6 can run when the clock allows. The R6 capstone excludes round-7 scope.

---

## 5. DEFERRALS rows a demo ticket interacts with or could close

| Row | Status | Interaction |
| --- | --- | --- |
| **D-P1.17-2** | PARTIAL | Owes Lighthouse/axe on prod public surfaces, the drop-zone round-trip and funnel-rate measurement. The demo's P1/axe legs and a Lighthouse pass on `/`+`/demo` could discharge the Lighthouse/axe arm. The other arms stay. |
| **D-OBS.1-3**, **D-SPA.28-1** | cell still OPEN | The LEDGER (2026-11-02) records the scheduled-nightly literal arm closed (run `41472916874`), but neither DEFERRALS cell was flipped. A round-7 first ticket can verify and flip both with that evidence. New demo legs must enter as `expected:"red"` so they cannot re-redden the nightly. |
| **D-OPS.1-1** | OPEN | Preview signed-in legs. The demo's `R*.demo` preview leg uses the MAINT.6 invite-code session recipe and adds evidence. It does not close the row (prod full-list condition). |
| **D-R5OPS.1-1** | OPEN | First-finding ≤4 min on the organic cohort. `FIRST_FINDING_QUERY` reads `finding.viewed` after `signup.completed`. A signed-in user viewing a demo finding through the real dossier surface would emit `finding.viewed` and fake a near-zero first finding. Demo mode must suppress or relabel `CLIENT_ANALYTICS_EVENTS`. |
| **D-R6CNT.2-1** | OPEN | Showcase regeneration. Not closable by the demo (GD-DEMO-SHOWCASE.R7: separate). Shares the "authored/replayed, labelled" honesty posture (ADR-121). |
| **D-R6OSS.1-1** | OPEN | Repo is public. Corpus commits enter permanent public history, so pre-commit sanitization is mandatory. |
| **D-FIX.1-2** | OPEN | Real-mobile-UA phone legs. `P1.demo` should use the same real-UA context pattern (`data-ssr-cause="phone"`). |

No OPEN row names `check:spa-budget`, `check:dom-contract` or the web Dockerfile directly.

---

## 6. Analytics catalogue and privacy

- **Catalogue.** `packages/contracts/src/analytics.ts` `ANALYTICS_EVENTS` defines acquisition events
  `landing.viewed`, `landing.dropzone_used`, `signup.completed`, `email.verified`,
  `showcase.opened`, `showcase.finding_anchor_viewed` and `entry.chosen`.
- **Envelope.** It requires `user_id` + `workspace_id`.
- **Channels:**
  - `POST /analytics/events` takes `CLIENT_ANALYTICS_EVENTS` only.
  - `POST /analytics/acquisition` is session-bound and uses the `ACQUISITION_EVENT_NAMES` set in
    `apps/api/src/analytics-routes.ts`.
  - The **pre-auth** channel `POST /analytics/landing` writes `acquisition_events` (migration 0037)
    for exactly two names, enforced by a DB `CHECK (event in ('landing.viewed',
    'landing.dropzone_used'))`. The web relay types are equally narrow (`server.ts` `landingBeacon`,
    `data.ts` `recordLandingEvent`).
- **Registering `demo.*`:**
  1. Add the events to `ANALYTICS_EVENTS`.
  2. Classify each one in `packages/ledger/src/emission-audit.ts`; its test asserts every catalogue
     name is classified and every `emitted` file contains the literal.
  3. Signed-in: add them to `ACQUISITION_EVENT_NAMES` (no migration; `analytics_events.event` has no
     check).
  4. Logged-out: widening the `CHECK` needs `DROP CONSTRAINT`, which `check-additive-migrations.mjs`
     rejects ("any DROP") and which therefore fails the pre-authorized deploy lane. Use an additive
     new append-only table, `GRANT INSERT … TO rhema_app` (the 0045 precedent), or defer.
- **Privacy constraints:**
  - The Privacy page copy (`apps/web/src/copy.ts` ~2461) promises "the session cookie your sign-in
    needs and no tracking cookies". Demo and tour state must use no cookies (URL or localStorage
    only).
  - Pre-auth rows carry no PII, only a truncated sha256 IP hash.
  - Signed-in events honour `analytics_opt_out` (REQ-PROD-15).
- **Cohort hygiene** (round-6 §8): journey traffic hitting `/demo` must be distinguishable, for
  example a `src=jrn` prop. Today N10's nightly `/` hits already land in `acquisition_events`
  untagged; that is an existing gap, not round-7 scope unless adopted.

---

## 7. Marketing-claims constraints

- **REQ-EVAL-19.** Any comparative or superiority statement on any surface (Showcase named) must
  cite a pre-registered criterion-meeting wave. `COMPARATIVE_WAVE_MET = false`
  (`packages/contracts/src/growth-lint.ts`), pinned false by the launch-surface test.
- **REQ-POS-4.** The headline stays "An editorial board for everything you write."
- **REQ-POS-5/11.** No generation promise in hero/proof/CTA zones: `generate`, `ghostwrite`,
  `writes your`, `drafts for you`, ….
- **REQ-POS-12.** No placeholder logos ("trusted by", "as seen in"). No unbuilt-asset claims
  (mobile app, browser extension, SSO, BYOK…) without a forward-looking marker. Note that N10 bans
  "coming soon" outright.
- **REQ-POS-13.** No AI-detection or evasion language.
- **The demo may say:**
  - what the record shows, attributed: "the review flagged…", "the claim ledger marks this
    Contradicted, with the source fetched";
  - that the record was produced with agent-discourse, the open-source skills Rhēma's protocols
    port;
  - that runs are replayed (GD-DEMO-RUNS.R7);
  - that time and money were "not recorded".
- **The demo may not say:**
  - efficacy framing ("Rhēma found / catches / improves");
  - comparisons;
  - invented costs, durations or credits. Every price claim must come from the shared
    estimator/pricing config (root gotcha 5), and none applies to replayed runs.
  - any copy implying these were Rhēma runs.

---

## Requirements emitted

- **REQ-DEMO-ACC-1.** Stage-B acceptance consists of registry legs (`D1.hub`, `D2.tour`,
  `D3.readonly`, `R*.demo`, `P1.demo`). Each is `paid:false`, enters `expected:"red"`, and flips
  green only in its owner's PR with committed screenshots. Each run is verified with `--expect-sha`
  equal to the deployed chain-tip SHA, and `check-deploy-provenance` all-PASS on web + api.
- **REQ-DEMO-ACC-2.** The logged-out tour leg walks every hero-tour step end to end. Per step it
  asserts visible coach-mark text, an un-occluded DOM-contract target, actionable Next/Back, and the
  declared navigation mechanism. It ends on the signup CTA.
- **REQ-DEMO-ACC-3.** Demo documents issue zero same-origin non-GET requests and open no
  EventSource/WebSocket. Signed-in and logged-out renders show the same corpus content.
- **REQ-DEMO-ACC-4.** `/demo` documents satisfy N10's invariants. `P1.demo` passes at 390 and
  320 px with axe clean and the phone reader contract.
- **REQ-DEMO-ACC-5.** Every demo hook is in `dom-contract.ts`, emitted, and asserted
  (`check:dom-contract` green). Tour selectors are pinned to manifest entries by a unit test.
- **REQ-DEMO-ACC-6.** The existing public routes are unchanged. The `scripts/live/public-ssr-
  baseline.mjs` before/after semantic fields agree, and `N10`/`P1.public`/`R8.showcase` stay green.
- **REQ-DEMO-OPS-1.** Corpus content lives in `packages/demo-corpus`, never under
  `apps/web/src/spa`, `copy.ts` or `docs/`. Demo chrome and tour copy live in `COPY` under a
  `demo.*` key family. `lintGrowthCopy`'s `FUNNEL_SCOPE` includes `/^demo\./`.
- **REQ-DEMO-OPS-2.** The corpus ships inside the web image. An image-content assertion and a
  deployed-route 200 prove it. Snapshot JSON is fetched at runtime and never bundled into SPA JS
  (`check:spa-budget` green with no ceiling raised).
- **REQ-DEMO-OPS-3.** The CC BY-NC-ND 4.0 carve-out is declared in `packages/demo-corpus/LICENSE`,
  the package `license` field, a `"type":"asset"` entry in `licenses.exceptions.json`, and a new
  `LICENSES.md` section. `licenses-doc.test.mjs` stays green.
- **REQ-DEMO-OPS-4.** The sanitizer and denylist, plus a local gitleaks no-git scan, run before the
  first corpus commit. No `.gitleaks.toml` allowlist entry is added without a narrow, dated regex.
- **REQ-DEMO-OPS-5.** Demo mode suppresses (or re-labels out of every cohort query) all
  `CLIENT_ANALYTICS_EVENTS` emitted by the reused surfaces. Any `demo.*` events are registered in
  `ANALYTICS_EVENTS` and `emission-audit.ts`, set no cookies, and carry no PII.
- **REQ-DEMO-OPS-6.** The prod deploy runs only under a recorded `GD-DEPLOY.R7`:
  - an owned-preview walk first, with teardown verified in the same ticket;
  - an all-service image build at the tip;
  - a classified `pulumi preview` (zero stateful replace/delete; additive migrations only; cost
    Δ ≤ $15);
  - provenance all-PASS;
  - a `deployments` row;
  - a committed rollback recipe.
- **REQ-DEMO-OPS-7.** Round 7 opens with:
  - `### Round 7` rows 209+;
  - a Plan-extensions line;
  - an H14 HUMAN row (corpus sign-off);
  - `GD-*.R7` rows appended in a `### Round 7` GATE DECISIONS sub-block;
  - ADR-126 (architecture) and ADR-127 (content licence scope);
  - per-ticket DEFERRALS sections.
  `check-append-only.mjs` must pass against the actual PR base.

## Open questions for operator

1. **Deploy authority (`GD-DEPLOY.R7`).** GD-DEPLOY.R6 does not cover round-7 surfaces.
   *Recommend:* re-issue its four conditions for round-7 tickets that name the deploy, add the
   preview-first and image-content assertions, and expire it at GATE-ACCEPT.R7.
2. **Ordering (`GD-ORDER.R7`).** *Recommend:* round 7 dispatches out of order while R6WATCH.1 is
   clock-bound. `nextTicket` stays 200 until it lands, and the R6 tail resumes on its own clock.
3. **Renderer posture for `/demo`.** `SPA_PUBLIC_ROUTES` stay SSR today, while the IDE leaves are
   SPA. *Recommend:* the hub stays SSR (a public route, N10-compatible). `/demo/:slug/*` serves the
   SPA under a demo layout with truthful `data-renderer=spa`, and phone uses the SSR reader. Record
   the decision in ADR-126 and extend `--expect-renderer` scope.
4. **Logged-out demo analytics.** The `CHECK` widen is non-additive. *Recommend:* one additive
   append-only table with three events (hub viewed, tour started, tour completed/CTA). If you want
   round 7 strictly migration-free, defer them and attribute only via `?src=demo` on the signup
   CTA.
5. **Round-7 tail weight.** *Recommend:* `R7CAP.1` + `GATE-ACCEPT.R7` + `R7REC.1` (backlog plus spec
   fold-back combined) + `R7DOC.1`. Drop a separate integration-plan row: `main` is protected and
   merges are per-PR by you.
