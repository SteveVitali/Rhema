<!--
  docs/round-7-demo-brief.md: round-7 founding brief, high-level design and plan. DRAFT v0.1.
  STATUS: working draft for operator iteration (2026-11-03). Not ratified. Authorizes nothing.
  Next artifact: docs/round-7-demo-spec.md (agent-ready design + implementation spec), then
  decompose-spec mode=extend → manifest rows 209+.
-->

# Round 7: The Rhēma Demo (a public, read-only tour of four real essays)

## TL;DR

- **Feasible: yes, at $0 inference, without touching the tenant boundary.** Rhēma's protocols are
  ports of the agent-discourse skills, so the artifacts already have a home: claim ledger → claims,
  editor's letter → findings, response ledger → dispositions, `drafts/vN.md` → versions, and
  `diffMarkdown` produces the "what changed" view. The data layer already has a clean injection seam
  (`DataSource` in `apps/web/src/data.ts`). A fixture-backed implementation can feed the **real** IDE
  surfaces (dossier, page, diff, revision, run report, timeline) with no database, no session and no
  tenant.
- **Shape:** a public `/demo` hub with four essay cards. Each card opens the real Rhēma IDE in
  **demo mode**: read-only, no live connections, with an optional guided tour over the actual
  surfaces. The tour follows the essay's real arc, outline → draft → review → response → revised
  draft → published on Substack. Logged-in and logged-out visitors see the same thing.
- **Pipeline:** sanitize and export the agent-discourse projects → convert markdown into Rhēma
  sidecars (deterministic, schema-validated) → project those into the BFF/DataSource DTOs as static
  JSON snapshots → serve them through a `demoDataSource` on a public route prefix → add a tour layer
  and entry points.
- **Honesty is a design constraint, not copy polish.** These dossiers came from the open-source
  agent-discourse skills that Rhēma ports, not from Rhēma runs. The demo says so plainly, invents no
  costs, durations or credits, and makes no efficacy claim (REQ-EVAL-19 still holds).
- **Biggest open items for you:** what is safe to publish (pen-name linkage, outlines, the
  "disclosure"/byline escalations), how the demo relates to the existing Wells Showcase, and a
  content license for the essays inside an MIT repo. See §7.

---

## 1. What the visitor experiences

```
rhema.tools ──"See it on real essays"──▶ /demo  (hub: 4 essay cards, arc stats, Substack links)
                                           │
              ┌────────────────────────────┼─────────────────────────────┐
              ▼                            ▼                             ▼
   /demo/the-politics-of-visibility   /demo/<slug>/review/<round>   /demo/<slug>/v/1/diff/2 …
   (the real IDE chrome in demo mode: timeline · files · findings rail · page · dossier)
              │
              └── optional guided tour (coach marks over real surfaces, ~8–12 steps):
                  1 Outline → 2 Drafting dossier (claim-first drafting, fidelity audit)
                  → 3 Draft v1 → 4 Editor's letter ("the one thing", ranked majors, scorecard)
                  → 5 Claim ledger (a contradicted Tier-1 claim + the fetched source)
                  → 6 Independent second read → 7 Response ledger (accept/adapt/rebut/defer/escalate)
                  → 8 What changed v1→v2, each hunk traced to the finding it answers
                  → 9 The published essay on Substack → CTA: "Bring your draft"
```

- **Free roam is always available.** The tour is a layer, not a separate page. Every surface is the
  real one with writes disabled, so "this is what the product looks like" stays literally true.
- **One hero essay, three supporting ones.** *The Politics of Visibility* has the most legible
  complete arc (outline → drafting dossier → v1 → review → response → v2 = published), so it carries
  the guided tour. *The Governable Mind* shows two review rounds (including the reviewer's own claims
  being checked). *Structure of Political Difference* has figures and an exact match to the
  published piece. *Constitution of Reason* is the thinnest (no v1, older review format); it is
  roam-only, or dropped (Q6).

## 2. Feasibility evidence (from the code read)

| Need | What exists | Gap |
|---|---|---|
| A place for every artifact | `pathToKind` already classifies every agent-discourse filename. `protocols/fixtures/` already holds hand-derived sidecars from three of these projects (public precedent). `seed/real-projects.ts` seeds them as drafts. | No markdown→sidecar converter; the parsers read JSON sidecars only. |
| Stable source formats | Editor's letters, scorecards, claim entries (`### C1 · Tier 1 · Verified` + bullets), response-ledger tables and source notes are consistent enough to parse deterministically. | Normalization for governable-mind v2 IDs, free-text verdicts and dispositions, and 52 free-form source notes (render those raw). |
| Real surfaces fed without a DB | `DataSource` is an injected interface; `stubDataSource` exists in tests; SPA DOM tests already render surfaces from stubbed fetches. | `bffRoute` and documents require a session; the SPA leaves sit under `_authenticated`. |
| Read-only editor | Page mounts statically when `collabWsUrl` is empty; showcase/phone already force `readOnly`. | Neutralize the `/doc` poll, ⌘S, the feed EventSource, the palette fetch, beacons, handoff POST and mutation forms. |
| Diffs and revision tracing | `diffMarkdown`, `traceRevisionMoves`, `VersionDiffDto`, `WhatChangedDto`. | Precompute them at build time. |
| Showcase precedent | `projects.showcase`, `showcaseReadOnlyGuard` (409), `assertShowcaseFixture` (REQ-POS-3), public `/showcase` static page. | Today it is one public-domain essay, and logged-out visitors get a static excerpt, not the IDE. |

**REQ-POS-3 is satisfiable.** Every claim ledger contains contradicted verdicts (e.g. governable-mind
v1 ≈ 6, politics-of-visibility ≈ 3, structure ≈ 1), each with an evidence URL. I still need to
re-verify which of those are Tier 1 (spec phase).

## 3. Architecture options (recommendation: A)

**A. Static snapshot + `demoDataSource` on a public prefix (recommended).**
- The demo bundle is precomputed JSON per essay (DTOs, plus markdown bytes fetched lazily).
- A second `createWebApp`-style mount (or a scoped sub-router) uses a `demoDataSource` and a
  synthetic, unprivileged **demo principal** in place of `session(c)`.
- The SPA gets a `_demo` layout that reuses the existing leaf surfaces under a `DemoMode` context:
  mutations off, live connections off, read-only affordances on.
- **Why:**
  - It never crosses the tenant boundary. AGENTS.md gotcha #2 says the deployed API role bypasses RLS
    and routes rely on explicit workspace predicates. Opening any DB path to anonymous users is the
    riskiest thing we could do pre-launch, and this avoids it entirely.
  - Zero writes and zero infra.
  - Cacheable at the edge.
  - Deterministic for journeys and screenshots.
  - Reversible.

**B. Shared public demo workspace in Postgres, read by an anonymous principal.** Reuses all real
read paths with no snapshot projector. **Rejected:** it introduces the first anonymous DB reader,
needs a new audited system-pool seam, a two-tenant probe and SEC review, and the RLS posture makes
it fragile.

**C. Extend the per-workspace Showcase seeder to four essays.** Works for signed-in users only, and
seeds roughly 900 source notes plus four long dossiers into every new workspace. **Rejected as the
primary path.** It could later replace Wells as the in-workspace Showcase (Q3).

**Out of scope:** recorded videos as the demo (they don't let people click), and any live inference.

## 4. The pipeline (four layers, each a testable seam)

1. **Corpus export + sanitizer** (offline, operator machine, deterministic).
   - A script reads `~/agent-discourse/agent-scratch/projects/<slug>` through a **file allowlist**,
     strips private paths, `utm_source=chatgpt.com` and `r.jina.ai` proxies, and redacts the items you
     rule on (§7).
   - It writes `packages/demo-corpus/corpus/<slug>/…` with a `PROVENANCE.md` (source commit/date,
     what was redacted and why).
   - The output is committed. It is your already-published work plus its editorial record.
   - A CI check fails if any denylisted pattern reappears.
2. **Converter: markdown → Rhēma sidecars.**
   - Claim ledger → `claimLedgerSidecar`.
   - Letter majors + minors + second-read objections → `findingsSidecar`. Severity follows a declared
     rule (ranked majors → `major`, the one thing → `blocking`?, minors → `minor`); kind and
     `letterSection` come from headings.
   - Scorecard → `rubricSidecar`; response ledger → `responseLedgerSidecar`; draft ledger/structure
     plan where present.
   - Anchors come from quote-matching against the draft (confidence < 1, `unanchored` when no match).
   - Everything is validated by the existing `parseSidecar`. Golden tests run per project.
   - **Anything unparseable renders as raw markdown, never paraphrased.**
3. **Projector: sidecars + drafts → DTO snapshots.**
   - Produces `DossierDto`, `EditorDocDto` per version, `VersionDiffDto` (via `diffMarkdown`),
     `WhatChangedDto` (via `traceRevisionMoves`), `TimelineDto`, `FilesDto` (source notes as
     `source_note` artifacts), and a `RunReportDto` variant labelled *replayed/imported* with no cost
     fields.
   - Output is one manifest JSON per essay plus lazily fetched chunks (drafts, source notes), so
     nothing lands in the JS bundle (`check:spa-budget`).
   - A contract test validates every snapshot against the live DTO types, so a DTO change breaks CI,
     not the demo in prod.
4. **Serving + demo mode + tour.**
   - Public routes `/demo`, `/demo/:slug/...` plus demo BFF twins.
   - `SPA_PUBLIC_ROUTES`/`doc-meta`/DOM-contract entries.
   - `DemoMode` context gates every side effect listed in §2.
   - The tour overlay is data-driven (step → route + DOM-contract selector + copy in `COPY`).
   - Entry points: landing CTA, `/showcase`, the signed-in app ("Explore the demo"), and acquisition
     analytics events.

## 5. Guardrails the spec must carry

- **Truthfulness (gotcha #5, REQ-EVAL-19):**
  - A persistent banner states the provenance: produced with agent-discourse, the open-source skills
    Rhēma's protocols port, and shown in Rhēma.
  - No credits, costs, durations or model claims unless they are in the source record.
  - No "Rhēma found X" efficacy framing.
- **Private material (gotcha #3/#8):** nothing from personas, notes, `tmp/`, or the private evals
  enters the bundle. `check:protocol-markers` and a new corpus denylist check guard this.
- **No new secrets, no new infra, no DB migration** (if option A holds).
- **Acceptance:** JOURNEY.1-style browser proof at the deployed chain-tip SHA. Logged-out and
  logged-in walks through the hub plus the full hero tour, with screenshots. Phone width too.

## 6. Plan: how we get from here to prod

| Step | Output | Skill / convention | Gate |
|---|---|---|---|
| 0. This brief (now) | `docs/round-7-demo-brief.md` iterated with you | — | your OK on direction + §7 answers |
| 1. Spec | `docs/round-7-demo-spec.md`: REQ-DEMO-* requirements, mapping tables (artifact→sidecar→DTO→surface), tour script, sanitization allowlist, acceptance criteria | round-6 style: short research rows I run (corpus census, mapping feasibility per artifact, surface-by-surface DataSource coverage, side-effect inventory, tour UX), then a **fresh-context adversarial review** (synthesize-spec `review` mode) | your ratification (`GD-RATIFY.R7`) |
| 2. Tickets | manifest rows 209+, ticket files, DEFERRALS rows | `decompose-spec mode=extend` | — |
| 3. Build | stacked PR chain | `orchestrate-build` → `implement-spec` per ticket | HUMAN row: you sign off the sanitized corpus before anything public ships |
| 4. Dev-test | preview stack walk, journeys + screenshots | `scripts/live/preview-stack.mjs` (infra/AGENTS.md) | — |
| 5. Prod | deploy + Stage-B browser proof at tip SHA | existing R6DEP deploy path + `check-deploy-provenance` | your merge (mergePolicy OPERATOR) |

**Rough ticket sketch (decompose-spec will finalize):**
- `R7DEM.1` corpus export + sanitizer + denylist check
- `R7DEM.2` md→sidecar converter + goldens
- `R7DEM.3` snapshot projector + DTO contract test
- `R7DEM.4` `demoDataSource` + public routes/BFF + demo principal
- `R7DEM.5` SPA demo mode (side-effect gating, read-only affordances)
- `R7DEM.6` demo hub + tour overlay
- `R7DEM.7` entry points + copy + analytics
- `HUMAN-H14` corpus/content sign-off
- `R7DEP.1` preview + prod deploy + browser acceptance
- tail: capstone/reconcile/docs, per the round-6 pattern

**Sequencing note:** `nextTicket` is `200_R6WATCH.1`, which is clock-bound (no earlier than
2026-11-11). Round 7 can run before it without disturbing it.

## 7a. Operator rulings (2026-11-03T15:2xZ, interactive, verbatim option labels)

Brief direction approved: "Looks good to me … proceed". Rulings on §7:

| ID | Question | Ruling (verbatim selection) | Consequence |
|---|---|---|---|
| GD-DEMO-BYLINE.R7 | Q1 | **"Pen name only"** | "S. J. Sebastian" only; strip real-name / academia / persona linkage from the corpus; Substack link-outs stay. |
| GD-DEMO-REDACT.R7 | Q2 | **"Deep-research outlines, Operator-edit notes, Editor's private notes.md"** (author escalations NOT selected → kept) | Outlines, manifest round logs and editor `notes.md` are excluded; the disclosure and E1/E3 escalations ship as the "escalate" examples. The tour starts at the drafting dossier, not the outline. |
| GD-DEMO-SHOWCASE.R7 | Q3 | **"Separate; link from /showcase"** | Wells stays the in-workspace Showcase and the `/showcase` excerpt; `/demo` is new; links are added from `/showcase` and the landing page. GD-SHOWCASE.R6 is untouched. |
| GD-DEMO-LICENSE.R7 | Q7 | **"CC BY-NC-ND 4.0"** | Corpus carve-out license + `LICENSES.md` note. |
| GD-DEMO-PUBLISHED.R7 | Q4 | **"Add live text as 'Published'"** | One-time fetched Substack text becomes a final `Published` version (origin `imported`); refresh is a manual script. |
| GD-DEMO-RUNS.R7 | Q5 | **"Replayed runs, labelled"** | Run cards with real phases and gates, badged as replayed; time and money shown as "not recorded". |
| GD-DEMO-DEPTH.R7 | Q6 | **"4 essays, 1 guided tour"** | Tour on Politics of Visibility; the other three are free-roam with a "what to look at" card. |
| GD-DEMO-PROCESS.R7 | Q8/Q9 | **"Round-6 style"** (voice/persona surface out of scope) | Inline research rows, then spec, then a fresh-context adversarial review, then ratification. |

Standing instruction: raise any further decision interactively with a recommendation; otherwise proceed.

## 7b. Scope widening and second ruling batch (2026-11-03, interactive)

**Scope widened by the operator (2026-11-03, verbatim):**

> "In addition to everything that's already in flight, I'd like us to ALSO do a very careful,
> thorough, nuanced, and in depth review, analysis, and critique of the current rhema.tools user
> experience … And then I want the resolution of all of these issues to be appended to our plan."

Round 7 is therefore **the demo + a UX overhaul**. The evidence is the research notes in
`docs/build/planning/2026-11-03_r7-demo/`:
- **R1:** corpus census.
- **R2:** converter feasibility.
- **R3:** serving and demo mode.
- **R4:** acceptance, deploy and conventions.
- **R5:** prod browser audit.
- **R6:** code-side UX audit.

The spec is `docs/round-7-draft-spec.md`.

| ID | Question | Ruling (verbatim selection) |
|---|---|---|
| GD-DEMO-HERO.R7 | Which essay carries the guided tour | **"Structure of Political Difference"** (the contradicted-claim beat cross-links to *The Governable Mind*) |
| GD-DEMO-EDITS.R7 | Unreviewed author edits | **"Show, labelled"** |
| GD-DEMO-CONV.R7 | Converter defaults | **"Accept all defaults"** (one thing → `major`; strengths as `note` rows; no synthesized findings) |
| GD-DEPLOY.R7 + GD-ORDER.R7 | Deploy authority and ordering | **"Pre-authorize + run now"** |
| GD-UX-SHELL.R7 | App shell | **"Persistent left sidebar"** |
| GD-UX-HOME-LIST.R7 | Project list | **"Flat recent list + attention"** (amends REQ-IDE-4/-6) |
| GD-UX-PROJECT-HOME.R7 | Project landing | **"The writing canvas"** |
| GD-UX-KIT.R7 | UI primitives | **"Radix primitives + Lucide"** |
| GD-UX-CHAT.R7 | Chat | **"Right-side panel, streaming"** |
| GD-UX-KEYS.R7 | Keymap | **"Browser-safe remap + cheat sheet"** |
| GD-DEMO-METRICS.R7 | Logged-out metrics | **"New anonymous table"** |
| GD-UX-SCOPE.R7 | UX scope | **"All P0+P1 + systemic"** |

### Third ruling batch: adversarial-review questions (2026-11-03)

Source: `REVIEW-round-7-draft-spec.md` (38 findings, 5 blocking).

| ID | Question | Ruling (verbatim selection) |
|---|---|---|
| GD-ORDER-SPLIT.R7 | Demo-first or UX-first | **"Split R7a demo / R7b UX"** |
| GD-DEMO-BYLINE-SCOPE.R7 | Pen-name scope | **"Demo surface only"** |
| GD-UX-STREAM.R7 | Chat streaming | **"Progress now, tokens later"** |
| GD-DEMO-ROLES.R7 | Role vocabulary | **"Writer + named agents"** |
| GD-UX-WALKTHROUGH.R7 | Generated run summary | **"Retire it"** (amends REQ-IDE-19) |
| GD-DEMO-METRICS-CARVE.R7 | Metrics write path | **"Explicit carve-out"** |
| GD-UX-PAIDLEG.R7 | Paid chat leg | Operator, verbatim: **"if we do a manual paid run, we must keep it under $10"**. Recorded as: a stubbed leg in CI, plus at most one manual paid run with a hard cap under $10 (target ≤ $0.50). |
| GD-UX-P1-BACKLOG.R7 | G1 word-level diff; UXC-13 marketing remainder | **"Backlog both"** |

## 7. Questions for you (these shape the spec)

1. **Byline.** Some excluded workspace files (personas, notes) carry identity material beyond the
   pen name. Should the demo show only the "S. J. Sebastian" byline? *(Ruled in §7a/§7b: pen name
   only, scoped to the demo surface; GD-DEMO-BYLINE-SCOPE.R7.)*
2. **What's publishable.** Candidates to *exclude or redact*:
   - (a) the unpublished deep-research outlines (≈80 `utm_source=chatgpt.com` citations, explicitly
     unverified)
   - (b) the governable-mind "disclosure" escalation and constitution-of-reason E1/E3 (byline / "an
     agent cannot supply lived experience")
   - (c) operator-directed edit notes in manifests
   - (d) the editor's private `notes.md`

   My default: exclude (a), (c), (d); keep (b) only if you're comfortable, since it's actually a
   compelling "escalate" example.
3. **Relationship to the existing Showcase.** `GD-SHOWCASE.R6` ruled public-domain-only for the
   *Showcase*, because of licensing. You own these essays, so that rationale doesn't apply, but it
   needs a recorded ruling. Options:
   - (i) the demo is a separate thing, and Wells stays the in-workspace Showcase *(my
     recommendation for this round)*
   - (ii) the demo replaces the public `/showcase` page
   - (iii) also reseed the in-workspace Showcase from your essays
4. **Which text is "published"?** Politics = v2 and Structure = v4 match Substack. Constitution's
   live title adds ": Multi-Agent AI as Institutional Design" (likely v4 plus a title edit).
   Governable Mind's live text matches v3 or a later edit. Should I add the live published text as a
   final "published" version (fetched from Substack) so the arc ends on exactly what readers saw?
5. **Run framing.** Should the timeline show *replayed runs* (phases, gates, dossier delivered, no
   cost), or present the record as an *imported archive* with no run cards? My recommendation:
   replayed runs. That's the product's real shape, honestly labelled.
6. **Depth.** Hero tour on *Politics of Visibility* plus roam-only for the others? Include
   *Constitution of Reason* (thin record), or ship three?
7. **Content license.** The repo is MIT. Committing the essays implies MIT unless we carve them out.
   I suggest `packages/demo-corpus/LICENSE` as all rights reserved, or CC BY-NC-ND, plus a
   `LICENSES.md` note. Which do you prefer?
8. **Voice/persona surface.** Should the demo show the `sjs-substack` voice profile? My
   recommendation: no for this round (profile internals, withdrawn-essay notes).
9. **Spec process weight.** Round-6 style (I run the research rows, one adversarial review, you
   ratify), or a full `synthesize-spec` research ledger? My recommendation: round-6 style. The design
   space is narrow and the code facts are already mapped.
