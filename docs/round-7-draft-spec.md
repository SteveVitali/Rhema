<!--
  docs/round-7-draft-spec.md: round-7 specification, v0.2 (RATIFIED 2026-11-03).

  STATUS: **RATIFIED v0.2 — operator sign-off 2026-11-03T16:4xZ ("looks good, proceed" —
  LEDGER GATE DECISIONS `GD-RATIFY.R7`); decomposed the same day by `decompose-spec mode=extend`
  (`docs/decomposition-prompt-r7.md`) into manifest rows 209–254 under `### Round 7`.**
  Ratification note (same day, pre-decomposition, no requirement change): HUMAN marker ids
  normalized to the validator grammar `HUMAN-H<n>` — H14a→H14 (corpus), H14b→H15 (demo copy),
  H15→H16 (UX review).
  Post-ratification notes, 2026-11-03 (decomposition Phase 4; operator rulings recorded in LEDGER
  `### Round 7`; no REQ id added or removed):
  - `GD-PREVIEW.R7`: no per-ticket owned previews. Every ticket proves Stage A. Its Stage-B ACs
    become "staging-verified at the phase preview" DEFERRALS rows, closed by the ONE owned preview
    per phase in 224 (R7a) and 250 (R7b). Round preview spend is capped at $20. This governs every
    "owned preview" mention below, and HUMAN-H16 moves into 250's preview window.
  - `GD-PUBDELTA.R7`: REQ-DACC-6's enumerated deltas also include the `/pricing` plan-value
    round-down and the public jargon fixes.
  - `GD-GOLDEN.R7`: each deploy classifies its payload under `docs/ops/golden-rerun-rule.md`, with
    ≤ 1 pre-authorized minimal-cohort re-run under the rule's $100 cap.
  - `GD-TOURSIGN.R7`: re-pinned tour copy is approved by the operator's merge of 248.
  - §10 is superseded by the manifest's `### Round 7` table: nine suffix rows were split at
    Phase 4, and the R7b stack forks after 213.

  v0.1 → v0.2 (same day) applies the fresh-context adversarial review
  (`docs/build/planning/2026-11-03_r7-demo/REVIEW-round-7-draft-spec.md`: 38 findings, 5
  blocking) and the operator's third ruling batch (brief §7b). Every review finding is
  dispositioned in Appendix E. Main changes:
  - The round splits into **R7a** (demo + must-fix, deploys first) and **R7b** (UX overhaul + tour
    re-pin, deploys second).
  - Metrics get an explicit write carve-out.
  - The pen-name rule is scoped to the demo surface; role vocabulary is fixed (writer vs agents).
  - Chat streaming means progress, not tokens; the generated run walkthrough is retired.
  - The keymap is rule-based; corpus-derived data uses a synthetic fixture until sign-off.
  - Ten oversized tickets are split.

  Synthesized from the brief `docs/round-7-demo-brief.md` (§7a/§7b rulings) and the research notes
  in `docs/build/planning/2026-11-03_r7-demo/` (R1–R6). It amends the canonical specs only via
  ADR-126…130 plus dated banners in the owning tickets (§3.2).
-->

# Round 7: the public demo + the UX overhaul (v0.2, ratified 2026-11-03)

## 0. How to read this

- **Two streams, two phases.**
  - **Stream D** (§4.1–4.4) is the public read-only demo of four real essays.
  - **Stream U** (§4.5–4.16) is the UX overhaul that brings the app up to the charter's bar:
    "as beautiful, intuitive, elegant, snappy as the leading coding-agent harnesses".
  - Per `GD-ORDER-SPLIT.R7` the round runs as two deploy phases:
    - **R7a** ships the demo on today's surfaces, plus the must-fix subset of Stream U the demo
      needs (§4.0).
    - **R7b** ships the rest of Stream U, then re-pins the tour on the finished surfaces.
  - Each requirement is tagged **[R7a]** or **[R7b]**.
- **One read-only seam.** The streams meet at the **read-only project mode**,
  `ReadOnlyProject{reason}` (S-3). The demo and the Showcase both render through it.
- **Normative by reference.** The research notes are the detailed contract for their requirements.
  "Per R3 §4" means that note's table is the ticket's checklist.
  - R1 `R1-corpus-census.md`
  - R2 `R2-converter-feasibility.md`
  - R3 `R3-serving-and-demo-mode.md`
  - R4 `R4-acceptance-deploy-conventions.md`
  - R5 `R5-ux-browser-audit.md` (finding ids A*–I*)
  - R6 `R6-ux-code-audit.md` (UXC-*, WP*)
  - REVIEW `REVIEW-round-7-draft-spec.md` (RV-*)
  - Non-normative prototypes are in `…/prototypes/`.

  **This spec wins over a note on any disagreement.**
- **Requirement ids.** `REQ-<FAMILY>-<n>`, append-only, `req_id_pattern = REQ-[A-Z]+-[0-9]+`.
  - Note-emitted ids are folded with their numbers kept: `REQ-DEMO-CORPUS-n` → `REQ-CORPUS-n`,
    `-CONV-n` → `REQ-CONV-n`, `-WEB-n` → `REQ-DWEB-n`, `-ACC-n` → `REQ-DACC-n`, `-OPS-n` →
    `REQ-DOPS-n`.
  - New families: TOUR, SHELL, KIT, PANE, RELOAD, HOME, WRITE, TALK, KEYS, COPY, SYNC, SPEED,
    PUB, GUARD, CLOSE. None collides with an existing family (checked 2026-11-03).
- **Severity.** P0 = broken; P1 = charter-violating and visible; P2 = polish.
- **Evidence.** **A** = Stage A (code + tests, $0). **B** = Stage B: deployed browser proof
  (visible text, actionable controls, screenshots) at the deployed chain-tip SHA (AGENTS.md
  gotcha 4, REQ-SPEC-29). `[…]` lists the findings a requirement discharges.

## 1. Goals and what "done" means

**Objectives (operator, 2026-11-03, verbatim):**

> "logged in OR logged out users can essentially click/drive through a read-only demo of the
> Rhema writing/editing tooling using artifacts from my real substack articles … see firsthand,
> visually and very intuitively and straightforwardly, what this tool is capable of"

> "the resolution of all of these issues to be appended to our plan, so that at the end of this
> whole process we can drive the orchestrate-build skill over tickets covering the new
> demo/showcase feature … AND all of these lingering UI/UX improvements"

**R7a done:**
- `rhema.tools/demo` serves the four-essay hub and the guided tour on *The Structure of Political
  Difference* (SPD), logged out and logged in, at desktop / narrow-desktop / phone widths.
- The §4.0 must-fix set is live.
- The D* journey legs are green at the deployed tip (REQ-DACC-1…6).
- Provenance is all-PASS on web + api.

**R7b done:**
- Every R5/R6 finding of severity **P0 or P1** is closed with browser evidence, or carries a
  recorded operator WONTFIX. G1 and the UXC-13 remainder already have one (`GD-UX-P1-BACKLOG.R7`).
- The **recurrence guards** run in CI (§4.16): no raw controls, no internal vocabulary in UI copy,
  no document reload on in-app navigation, and no un-scrimmed pane occlusion at the reference
  sizes.
- P2 findings inside touched surfaces are fixed in those tickets. Every other P2 is a dated
  `BACKLOG.csv` row (`GD-UX-SCOPE.R7`; §7).
- The tour is re-pinned on the final surfaces.
- Prod serves the R7b tip with the D* and U* legs green.
- The round-7 tail (§4.18) has landed, with zero round-7-scoped `OPEN` deferrals that lack an
  owner and a date.

## 2. Posture facts (re-confirm at SETUP)

- **Repository.**
  - `main` @ `a34eb51` (public repo since 2026-11-03).
  - Ledger `chainTip` = `stevevitali/r6dep-4-limiter-deploy`. Prod last recorded serving
    `4938b8e` (proxy image re-upped at update 172, `3871ffa`).
  - Round 7 forks from **`main` HEAD** (R4 §4). This planning branch is
    `stevevitali/r7-demo-spec`.
- **Ordering** (`GD-ORDER.R7`).
  - `nextTicket` = `200_R6WATCH.1`, clock-bound (no earlier than 2026-11-11). The R6 tail
    (201–208) and `GATE-ACCEPT.R6` (row 203) are unsigned.
  - Round 7 dispatches **out of order** now; R6WATCH.1 and the R6 tail resume on their own clock.
  - Two existing rows are numbered 204, so round 7 starts at **209**.
- **Free ids.** ADR-126 and HUMAN-H14 are the next free ids.
- **Deploy authority.** `GD-DEPLOY.R6` does not cover round-7 surfaces; `GD-DEPLOY.R7` governs
  both phase deploys (§3.1, REQ-DOPS-6).
- **Spend.**
  - The demo is $0 inference. Preview stacks cost about $2–8 each.
  - **At most one** paid journey run is added: the manual U6.chat run at the R7b deploy, hard cap
    **< $10** (operator, `GD-UX-PAIDLEG.R7`), target ≤ $0.50.
  - Nothing paid runs nightly.
- **Harness.** The LEDGER harness is `devin-desktop/swe-2-high/subagent`. Every ticket stays ≤ M,
  with its working set well under half of a 256k non-compacting context (round-6 rule). Split
  rather than stretch.
- **SPA budget.** A stale local build (2026-10-29) shows the entry graph at **205.9 / 250 kB gz**,
  about 44 kB of headroom (REVIEW RV-15). R7KIT.2 re-measures at the tip before adding a
  dependency.

## 3. Decision register

### 3.1 Operator rulings (verbatim selections, recorded in brief §7a/§7b; R7OPEN.1 appends them to LEDGER § GATE DECISIONS `### Round 7`)

| ID | Ruling | Binding consequence |
|---|---|---|
| GD-DEMO-BYLINE.R7 + -SCOPE.R7 | "Pen name only" · "Demo surface only" | Demo UI, bylines and corpus show "S. J. Sebastian" only. The agent-discourse credit lines in fetched Published text are allowlisted by file:line, never altered. Planning docs carry no identity-linkage prose (S-11). |
| GD-DEMO-REDACT.R7 | Exclude outlines, operator-edit notes, editor `notes.md` | Writer-facing escalations (GM disclosure, CoR E1/E3) ship. |
| GD-DEMO-SHOWCASE.R7 | "Separate; link from /showcase" | Wells stays the in-workspace Showcase; GD-SHOWCASE.R6 is untouched. |
| GD-DEMO-LICENSE.R7 | "CC BY-NC-ND 4.0" | Corpus carve-out (REQ-DOPS-3; ADR-127). |
| GD-DEMO-PUBLISHED.R7 | "Add live text as 'Published'" | REQ-CORPUS-12. |
| GD-DEMO-RUNS.R7 | "Replayed runs, labelled" | REQ-DWEB-15. Phases are inferred from delivered files (S-9). |
| GD-DEMO-DEPTH.R7 | "4 essays, 1 guided tour" | REQ-TOUR-1/3. |
| GD-DEMO-HERO.R7 | "Structure of Political Difference" | The contradicted-claim beat cross-links to *The Governable Mind* (S-6). |
| GD-DEMO-EDITS.R7 | "Show, labelled" | As "Writer-directed edit (not reviewed)" (S-10). |
| GD-DEMO-CONV.R7 | "Accept all defaults" | REQ-CONV-16. |
| GD-DEMO-ROLES.R7 | "Writer + named agents" | S-10. |
| GD-DEMO-METRICS.R7 + -CARVE.R7 | "New anonymous table" · "Explicit carve-out" | REQ-TOUR-9; the one sanctioned demo non-GET (ADR-126). |
| GD-DEMO-PROCESS.R7 | "Round-6 style" | Voice/persona surface out of scope. |
| GD-DEPLOY.R7 | "Pre-authorize + run now" | GD-DEPLOY.R6's four conditions, plus preview-first and an image-content assertion. Covers both phase deploys (R7a, R7b) and the CDN invalidation act (REQ-DWEB-10). Expires at GATE-ACCEPT.R7; merges remain the operator's. |
| GD-ORDER.R7 + -SPLIT.R7 | "Pre-authorize + run now" · "Split R7a demo / R7b UX" | §0, §10. |
| GD-UX-SCOPE.R7 | "All P0+P1 + systemic" | §1. |
| GD-UX-SHELL.R7 | "Persistent left sidebar" | REQ-SHELL-*; ADR-128. |
| GD-UX-HOME-LIST.R7 | "Flat recent list + attention" | REQ-HOME-1; ADR-128. |
| GD-UX-PROJECT-HOME.R7 | "The writing canvas" | REQ-HOME-2/3; ADR-128. |
| GD-UX-KIT.R7 | "Radix primitives + Lucide" | REQ-KIT-*; ADR-129. |
| GD-UX-CHAT.R7 + GD-UX-STREAM.R7 | "Right-side panel, streaming" · "Progress now, tokens later" | REQ-TALK-*. Token deltas go to BACKLOG with their own future ADR. |
| GD-UX-KEYS.R7 | "Browser-safe remap + cheat sheet" | REQ-KEYS-*. |
| GD-UX-WALKTHROUGH.R7 | "Retire it" | REQ-COPY-4; ADR-130 amends REQ-IDE-19. |
| GD-UX-PAIDLEG.R7 | "if we do a manual paid run, we must keep it under $10" | REQ-DACC-7 U6. |
| GD-UX-P1-BACKLOG.R7 | "Backlog both" | R5 G1 (word-level diff marks) and the UXC-13 remainder (full marketing redesign) are WONTFIX-this-round, as dated BACKLOG rows. |

### 3.2 Spec amendments (each lands as an ADR plus a dated banner in the owning section, written by the owning ticket; R7OPEN.1 drafts the ADR shells)

- **ADR-126: Public demo architecture.**
  - Static snapshots, served by `demoDataSource`.
  - Reserved `demo~<essay>` slug namespace behind public `/demo/<essay>` URLs.
  - No session and no tenant. No DB or API **reads** on any demo path.
  - **One sanctioned write:** the anonymous metrics carve-out (REQ-TOUR-9). It is the only demo
    non-GET, through its own insert-only role.
  - The demo is a separate concept from the Showcase.
  - Amends **REQ-ED-12/ADR-108** so demo Pages render SPA read-only on every device class.
- **ADR-127: Corpus content licence scope.** CC BY-NC-ND 4.0 for `packages/demo-corpus/corpus/**`.
  The repo stays MIT. GD-SHOWCASE.R6's public-domain rule stays scoped to the Showcase.
- **ADR-128: Information architecture v2** (lands with R7b tickets). It amends, by section:
  - **REQ-IDE-2.** Rail → a persistent, collapsible left sidebar, still "identical in workspace
    and IDE scope", still carrying the Inbox badge.
  - **REQ-IDE-8 and DS §5.1** (seven regions, pane widths 56/240/660/280/320, Desk drawer). New
    regions: sidebar | Page | right panel (tabs Chat · Findings · Claims · Timeline · Live feed).
    The bottom Desk retires.
  - **REQ-IDE-4 / REQ-IDE-6.** Flat recent list. "Waiting on you" / "Running" appear only when
    non-empty. Attention grouping becomes an opt-in Group-by. "Quiet" is retired as a label.
  - **REQ-IDE-5.** New project = an immediately created blank Page with an inline title (no
    dialog). The three entry points become the empty-Page affordance row. Protocol defaults to
    Essay; venue and voice move to Project settings.
  - **REQ-IDE-41** (no blocking modal except Cancel-run) is **kept**. New UI introduces no modal:
    the title is inline, Project settings is a page, the tour is non-modal, the run sheet keeps
    its existing exception status as is.
  - **REQ-IDE-48.** A project opens to its head draft's Page. The walkthrough-card landing for an
    unread finished run is kept.
  - **REQ-GROWTH-12** (first five minutes; "no modal tours"). The demo tour is non-modal (no focus
    trap, free roam) and never auto-starts in a signed-in first session.
  - **REQ-UX-8 / REQ-IDE-49.** The `?` cheat sheet is **kept** as the sheet's trigger; REQ-KEYS
    remaps chords only.
  - **REQ-NAVM-7.** The named preload follow-up is discharged by REQ-SPEED-3.
  - **REQ-ED-12/ADR-108.** Showcase Pages render SPA read-only (UXC-6). The phone-UA SSR reader
    remains for real projects.
- **ADR-129: Component stack.**
  - Radix per-package primitives (`@radix-ui/react-*`; no meta-package), `lucide-react`, and
    `cmdk` for Combobox and palette.
  - `react-resizable-panels`, *or* an in-house SplitPane: the R7PANE.1 ticket chooses under the
    budget rule. All candidates are MIT/ISC; `check:licenses` verifies.
  - Styling comes from a generated `uiCss()` in `@rhema/ui`.
  - The no-raw-controls rule (REQ-GUARD-1) and the per-ticket entry-delta allowance (REQ-KIT-5)
    apply.
- **ADR-130: Retire the generated run walkthrough** (`GD-UX-WALKTHROUGH.R7`).
  - Amends REQ-IDE-19 and DS §5.5 D20 / §5.6. The `run.walkthrough` model call
    (`packages/orchestrator/src/walkthrough.ts`, `apps/worker/src/walkthrough-generator.ts`) is
    removed.
  - The run card is composed deterministically from the delivered record (REQ-COPY-4).
  - Read `packages/orchestrator/AGENTS.md` first. COGS falls by one model call per run, and no
    money mode changes.

### 3.3 Synthesis rulings (S-n)

- **S-1: Demo URL.**
  - Public URLs are `/demo` (SSR hub) and `/demo/<essay>/…`, mapped internally to
    `/p/demo~<essay>/…` via TanStack Router `rewrite`.
  - R7DEM.4 opens with a ≤ half-day spike. If it fails, the address bar may show
    `/p/demo~<essay>/…` after the first navigation, with `/demo/<essay>` as the entry alias.
  - No `/p/${slug}` href rewrites.
- **S-2: Server reuse.** A nested `createWebApp` with `demoDataSource` serves demo JSON twins
  **only**. Every HTML document comes from the outer app (single CSP nonce; REQ-DWEB-8).
- **S-3: ReadOnlyProject.**
  - One client mechanism carried in boot and the twin:
    `ReadOnlyProject{reason:"demo"|"showcase"|"run_lock"}`.
  - It hides or disables every write control *before* any request is made, with one notice per
    reason (REQ-DWEB-14).
  - `run_lock` is DS §5.4's "a reader-run has frozen the head". **Frozen versions are not
    read-only**: typing in them forks (REQ-WRITE-7).
  - The demo reason additionally disables live connections and analytics (REQ-DWEB-7).
  - The server guards remain as defence in depth.
- **S-4: Imported drafts are editable.**
  - DS §5.4 line 524: "editing an **unreviewed** draft is in place". The born-frozen import
    (`apps/api/src/import.ts` sets `frozen` + `promoted_version_id`) is a conformance bug.
  - Freeze triggers are all four of DS line 1333: a run reads it, a dossier references it, it is
    promoted, or it is exported.
  - Import against REQ-DATA-14 `one_working_head_per_project`:
    - into a project whose working head is **empty** (no blocks) → it overwrites that head;
    - otherwise → it freezes the current head as vN (origin unchanged) and creates the import as
      the new working head v(N+1), with a toast saying so.
- **S-5: Phone.**
  - Demo Pages are SPA read-only on every device (ADR-126).
  - Real projects keep the phone-UA forced-SSR reader. REQ-MOBILE-3's entry points (timeline,
    findings, chat) are added to that island by R7RO.2.
  - Narrow-desktop windows (desktop UA, < 768 px CSS) get the SPA drawer/sheet layout
    (REQ-SHELL-6).
- **S-6: The contradicted-claim beat.**
  - SPD has zero Contradicted verdicts. The letter's verdict says "the fact-check came back
    cleaner than any draft of this ambition I have seen (zero contradicted claims…)". That *is*
    the beat.
  - Its proof is C23a: Tier 2 escalated to Tier 1 · *Misleading in context*, with its source chip.
  - A side card, "What a contradicted claim looks like →", deep-links to *The Governable Mind*'s
    round-2 ledger at III16.
  - REQ-POS-3 stays a Showcase rule. REQ-CORPUS-10 runs against GM v2 as a corpus self-check.
- **S-7: Figures (RV-8).**
  - SPD's matplotlib PNGs are imported images, not Rhēma figures. They render as images in the
    Page at their draft positions, served by an allowlisted, immutable asset route
    `GET /bff/demo/asset/:essay/:file` (REQ-DWEB-17), plus a read-only **Figures list** of
    imported images.
  - The figures list uses a DTO variant `{specKind:"image", provenance:"imported", versions:[v1,
    v2 when regenerated]}`. No vega/mermaid spec, run provenance or generated SVG is invented.
- **S-8: SPD revision tracing.** The v1→v2 What-changed shows the natively linked hunks; e.g.
  move M2 discharges F1 with the new §III "Why Five, and Not Fifty" (REVIEW RV-29 verified).
  Unlinked hunks say Unlinked (REQ-CONV-15).
- **S-9: Replayed-run derivation (RV-9).**
  - A replayed run's phase list is **inferred from the delivered files**: a phase is shown iff its
    artifact exists (piece brief → intake; claim ledger → verification; discourse report →
    discourse; argument notes → argument; craft notes → craft; second read → second read;
    letter → letter). Each phase is labelled "inferred from the delivered files".
  - An approval/gate appears only where a sanitized fact exists in `PROVENANCE.md`; otherwise the
    card says "approvals not recorded".
  - Time, credits and model show "not recorded".
- **S-10: Role vocabulary (RV-4; GD-DEMO-ROLES.R7).**
  - The human is **"the writer"**.
  - The agent-discourse roles are **"the editor (agent)"**, **"the revising agent"** (the
    respond-to-review author role) and **"the drafting agent"** (draft-from-outline).
  - v3/v4 are **"Writer-directed edit (not reviewed)"**.
  - R1's redaction rule maps workflow-sense "operator" → **"the writer"**, never "the author".
  - Demo COPY never uses "author" for an agent, and stays inside `lintCopy`'s reserved-string
    rules.
- **S-11: Pen-name scope (RV-2; GD-DEMO-BYLINE-SCOPE.R7).**
  - The rule governs the rendered demo surface and corpus bytes: byline "S. J. Sebastian";
    identity material from excluded workspace files never ships.
  - The live posts' "Edited with SteveVitali/agent-discourse" credit lines stay verbatim in
    `published.md`, allowlisted line-by-line in the denylist gate.
  - The hub's provenance paragraph names "agent-discourse (open source)" and links its repository
    (the operator's own public repo).
  - Planning docs carry no identity-linkage prose (the brief's Q1 is reworded, 2026-11-03).
- **S-12: Data before sign-off (RV-5).**
  - All converter, projector, serving and tour tests run on a **committed synthetic mini-corpus**
    (`packages/demo-corpus/fixtures/synthetic/`: invented essay, non-real names, ≈ 1.5k words,
    covering every artifact shape and parse variant R2 found).
  - The **real** corpus, goldens and snapshots land together in one **data commit** (R7DATA.1)
    after HUMAN-H14.
  - Demo/tour copy is signed separately at HUMAN-H15 before the R7a deploy.
- **S-13: Twin caching (RV-11).**
  - Demo twin URLs carry the build SHA (`?b=<sha>` from boot), so CDN caching is long-lived and
    safe across deploys.
  - The demo shell is `no-cache`.
  - R7DEP.* also invalidates `/bff/p/demo~*` paths as a recorded act under GD-DEPLOY.R7.
- **S-14: Entering and leaving the demo is a document navigation (RV-10).** Every link *into*
  `/demo*` (sidebar "Demo", landing, `/showcase`, footer) is `data-spa-native` (a document
  navigation), mirroring the exits (REQ-DWEB-11). The demo boot therefore always carries `demo`,
  and the workspace QueryClient is never shared with it.

## 4. Requirements and acceptance criteria

### 4.0 The R7a must-fix set (Stream-U items the demo depends on, deployed with R7a)

These are the U requirements tagged **[R7a]** below. The demo renders the real surfaces, so the
defects it would put in front of public visitors are fixed first:
- REQ-KIT-1 (base control layer);
- REQ-COPY-7 (focus rings);
- REQ-DWEB-14 / REQ-RELOAD-5 (ReadOnlyProject + Showcase in the SPA);
- REQ-PANE-0 (overlay/occlusion stopgap + Desk head visible);
- REQ-WRITE-4 (Focus mode exit);
- REQ-COPY-4 + REQ-SYNC-1/2 (truthful run card, one run state, one count).

### 4.1 REQ-CORPUS: the sanitized corpus [R7a] (R1)

- `REQ-CORPUS-1…10`: adopted from R1 §Requirements emitted, with these amendments:
  - **CORPUS-2.** The gate whitelists the published credit lines by file:line (S-11).
  - **CORPUS-3.** Redaction maps workflow "operator" → "the writer" (S-10).
  - **CORPUS-10.** Restated as S-6.

  Allowlist-only ingest; hard-fail denylist (bare `Steven`/`Desktop`/`claude`/`operator` are not
  gated); a committed redaction table; EXIF-stripped re-encoded images; corpus as data, not TS
  literals; lazy per-artifact payloads. A.
- `REQ-CORPUS-11` (new): **exporter.**
  - Deterministic `tools/demo-corpus/export.mjs` reads `~/agent-discourse/agent-scratch/projects/
    <slug>` and writes `packages/demo-corpus/corpus/<slug>/` plus `PROVENANCE.md`.
  - `PROVENANCE.md` holds: the source commit/date; the allowlist with counts; the redaction table;
    the excluded set with reasons; the sanitized approval/round facts S-9 may cite.
  - File rulings (R1 Q3, RV-37):

    | File(s) | Ruling |
    |---|---|
    | SPD `drafts/short-v1.md` | excluded (a different piece) |
    | SPD `values-table*.png` | excluded (unreferenced screenshots) |
    | GM fragments (`draft-part*`, `ledger-slice*`, `index-slice*`) | excluded; the Files tree notes "working fragments not shown" |
    | GM `v2-review/01-claim-ledger-{A,B}.md` | excluded (the merged ledger is canonical; R2) |
    | SPD `drafts/taxonomy_reference_sheet.md` | **included** as an artifact (cited by v4 §VII) |
    | `agents/author/voice-charter.md` ×4 | **excluded** (persona internals; GD-DEMO-PROCESS.R7) |

  - A.
- `REQ-CORPUS-12` (new): **Published versions** (GD-DEMO-PUBLISHED.R7).
  - Operator-run `tools/demo-corpus/fetch-published.mjs` makes a one-time fetch of each live
    Substack post, converted to markdown. It never runs at build time or at runtime.
  - Stored as `published.md` with URL, fetch date and sha256.
  - Rendered as the final version: "Published · sjsebastian.substack.com · fetched YYYY-MM-DD",
    origin `imported`.
  - Differences from the last draft surface in the diff and are never patched. SPD's v1/v2 title
    ("Politics Has Five Questions") vs the v3 retitle is shown on the hub card (RV-30).
  - A.
- `REQ-CORPUS-13` (new): SPD v3/v4 and CoR v4 are versions labelled **"Writer-directed edit (not
  reviewed)"** (S-10), between the last responded version and Published. A.
- `REQ-CORPUS-14` (new): **sign-off gating** (S-12).
  - No real corpus byte, and nothing derived from it (goldens, snapshots), is committed before:
    the sanitizer, the denylist gate and a local `gitleaks --no-git` scan all pass; **and**
    HUMAN-H14 signs `PROVENANCE.md`.
  - The public repo's history is permanent.
  - A + H14.
- `REQ-CORPUS-15` (new): the **synthetic mini-corpus** fixture (S-12) exercises every R2 parse
  variant: section-style ids, free-text verdicts, mixed dispositions, a moves table with and
  without discharges, a free-form source note, a figure image. It is the only corpus that tests
  may assume. A.

### 4.2 REQ-CONV: markdown → sidecars [R7a] (R2)

- `REQ-CONV-1…15`: adopted from R2 §Requirements emitted. **CONV-12** is amended: goldens exist
  for the synthetic fixture in every PR. Real-corpus goldens land in R7DATA.1.
  - Pure, deterministic functions in `packages/demo-corpus/src/convert/`.
  - Every sidecar passes `parseSidecar`; any failure aborts.
  - Explicit verdict table; committed `convert-overrides.json` with citations (unused overrides
    fail the build).
  - Declared severity/kind/origin rules; the anchor confidence ladder.
  - **Raw rendering, never paraphrase.** Import-rule labels on converter-assigned fields.
  - Build-time what-changed.
  - A.
- `REQ-CONV-16` (new; GD-DEMO-CONV.R7):
  - "The one thing" is `major` + `letterSection: one_thing`; no `blocking` anywhere in demo data.
  - Letter strengths are `note` rows with `letterSection: strength`.
  - The 165/300 response rows that answer dossier notes appear only in the raw ledger table.
  - A.
- `REQ-CONV-17` (new): `parseDraftLedgerSections` reads only 1 of 17–18 real rows (Roman
  numerals). The demo renders draft ledgers raw; the parser fix is a new DEFERRALS row. A.

### 4.3 REQ-DWEB: serving and demo mode [R7a] (R3)

- `REQ-DWEB-1…13`: adopted from R3 §Requirements emitted, with these amendments:
  - **DWEB-3.** "Exactly the 24 methods" → "exactly the methods enumerated by the regenerated
    R7DEM.5 table". Everything else throws `DemoUnsupported`.
  - **DWEB-4.** Header-handling literals in `apps/web/src/server.ts` carry the existing
    `never-cookies exempt` annotation, or the guard lives outside `check:no-cookies` TARGETS
    (RV-35).
  - **DWEB-7.** R7DEM.5 **regenerates** the side-effect table against the final compositions,
    using a recording proxy that walks every `DEMO_ROUTE_ID` and fails on any request outside the
    allowlist (GETs to demo twins/assets plus the REQ-TOUR-9 POST) (RV-10). It is re-run by
    R7TOUR.2 after R7b.
  - **DWEB-10.** Caching follows S-13.

  The rest (A; B for 6, 9, 10, 11):
  - the `demo~<essay>` registry; the guard (405 `demo_read_only` / terminal 404);
  - cookie-invariant responses with no `Set-Cookie`;
  - `readOnly:true` twins with no collab and no `activeRun`;
  - boot `demo:{…}` with no `principal`;
  - single-nonce documents; `/demo` as a public SSR route; document-navigation exits;
  - the `demo` DOM-contract bucket; a lazy tour chunk.
- `REQ-DWEB-14` (new): **ReadOnlyProject** (S-3) [R7a].
  - Write controls are hidden or disabled *before* any request, each with a reason tooltip.
  - One notice per reason in the page header area:
    - **demo:** "A read-only demo of a real essay's editorial record. Start your own project to
      use these tools.";
    - **showcase:** the existing copy plus a styled **Duplicate** primary button;
    - **run_lock:** DS §5.4's banner.
  - A + B. [C2, C10, UXC-6]
- `REQ-DWEB-15` (new): **replayed runs** (GD-DEMO-RUNS.R7, S-9).
  - The card is badged "Replayed from the agent-discourse record".
  - Phases are inferred from delivered files and labelled so.
  - Gates appear only from PROVENANCE facts; otherwise "approvals not recorded".
  - Time, credits and model show "not recorded".
  - "What it delivered" is composed per REQ-COPY-4.
  - A.
- `REQ-DWEB-16` (new): **document-navigation entry** (S-14). A DOM test plus journey: entering
  from a signed-in SPA page yields a fresh document with `boot.demo`. A + B.
- `REQ-DWEB-17` (new): **asset route.** `GET /bff/demo/asset/:essay/:file` serves only
  `PROVENANCE`-allowlisted image files from the image, with an immutable cache and
  `content-type` from an allowlist. Images in demo Pages resolve to it (`img-src 'self'`). A.

### 4.4 REQ-TOUR: hub, tour, entry points, metrics

- `REQ-TOUR-1` [R7a]: **hub `/demo`** (public SSR).
  - Four essay cards in the order SPD (hero, "Take the guided tour"), GM, POV, CoR.
  - Each card shows: title/subtitle (with retitle note where one exists); publish date; body word
    count from the snapshot; the arc as a row of steps; counts by one rule ("6 major · 12 minor
    · 6 strengths · 27 claims checked", generated from the snapshot, RV-30); "Read on Substack
    ↗"; and "Open in Rhēma".
  - A provenance paragraph names agent-discourse (open source; Rhēma's protocols port it) and the
    roles (S-10).
  - Byline: "S. J. Sebastian".
  - A + B.
- `REQ-TOUR-2` [R7a, re-pinned R7b]: **guided tour on SPD.**
  - Mechanics:
    - data-driven steps `{id, route, target (DOM-contract hook), placement, copyKey,
      advance:"next"|"click-target"}`;
    - Next / Back / Exit, a step counter, ←/→/Esc, reduced-motion support;
    - **non-modal**: no focus trap, free roam on exit, never auto-starts (ADR-128 REQ-GROWTH-12);
    - it never occludes its target (REQ-PANE-0/4).
  - Copy: ≤ 2 sentences per step, `COPY` leaves `demo.tour.*`. Every quoted fragment is verbatim
    from the snapshot with its file:line in the ticket; every count is snapshot-derived (RV-29).
  - Script:
    1. **The essay.** The Published card.
    2. **v1 as submitted.** The Page at v1 ("Politics Has Five Questions"). The panels are
       introduced once.
    3. **The editor's verdict.** The letter's Verdict, quoting "the fact-check came back cleaner
       than any draft of this ambition I have seen (zero contradicted claims; your own
       statistical exercise *reproduces from the raw data*)".
    4. **The one thing.** "Claim the ground the piece actually occupies…".
    5. **Two independent readers, one finding.** Major issue 1 beside Second-read Objection 1;
       origin `both`.
    6. **Claims checked against sources.** The claim ledger's own summary line (quoted, not
       paraphrased), then C23a with its source chip. Side card: "What a contradicted claim looks
       like → *The Governable Mind*, III16" (S-6).
    7. **The data, reproduced.** Figure 2 in the Page at v1 vs v2 (regenerated from declared
       composites) (S-7).
    8. **The revising agent answers every finding; the writer approves.** Response-ledger
       raw-table rows F1 *adapt*, F31 *escalate→resolved*, F42 *defer (flagged: length)*, F23
       *constraint honored*, using verbatim cells; then the response letter.
    9. **What changed, and why.** v1→v2 What-changed; the new §III "Why Five, and Not Fifty"
       traced to F1 via move M2 (S-8).
    10. **The writer's own hand.** v2→v3/v4 "Writer-directed edit (not reviewed)", then
        →Published.
    11. **Your turn.** CTA "Bring your draft" → `/signup?src=demo` (logged out) or "New project"
        (logged in).
  - A + B. **R7b re-pins** steps and targets on the final surfaces (R7TOUR.2).
- `REQ-TOUR-3` [R7a]: "What to look at" cards for GM / POV / CoR (3–5 bullets each from R1 §5,
  with deep links; role vocabulary per S-10). A.
- `REQ-TOUR-4` [R7a]: entry points, all document navigations (S-14):
  - landing hero secondary CTA "See it on four real essays →";
  - a `/showcase` link to `/demo`;
  - a footer link;
  - and in R7b, the sidebar "Demo" item.

  A + B.
- `REQ-TOUR-5` [R7a]: honesty copy.
  - A persistent notice (REQ-DWEB-14) and import-rule labels (REQ-CONV-14).
  - No efficacy or "Rhēma found X" phrasing (REQ-EVAL-19); the launch-surface lint applies.
  - `lintGrowthCopy` `FUNNEL_SCOPE` gains `/^demo\./`.
  - A.
- `REQ-TOUR-6` [R7a]: links to excluded artifacts render as non-links labelled "not published". A.
- `REQ-TOUR-7` [R7a]: the GM disclosure escalation and CoR E1/E3 render as Decisions in the ledger
  view. A.
- `REQ-TOUR-8` [R7a]: every step and card bullet has a stable deep link `/demo/<essay>/…#hook`. A.
- `REQ-TOUR-9` [R7a]: **anonymous metrics carve-out** (GD-DEMO-METRICS-CARVE.R7; ADR-126).
  - **Table:** additive, append-only `demo_events(id, at, event, essay, step, src)`, with `event`
    a strict enum `{demo.hub_viewed, demo.tour_started, demo.tour_completed_or_cta}`.
    - No IP, IP hash, user id, cookie or user agent.
    - It is a non-tenant table pinned in the RLS catalogue as `system` and not readable by the
      user-serving role.
  - **Channel:** web `POST /a/demo` (`sendBeacon`, `text/plain` JSON) → api
    `POST /analytics/demo` → insert through a dedicated **insert-only** role (`GRANT INSERT`
    only; precedent migration 0045).
  - **Abuse bound:**
    - an in-memory token bucket per instance (e.g. 60/min/edge connection), never persisted;
    - payload ≤ 256 B, validated against the enum;
    - 204 always; failures are dropped silently.
  - It is the single non-GET REQ-DACC-3 permits.
  - **Signed-in visitors.** Every reused-surface `CLIENT_ANALYTICS_EVENTS` emission is suppressed
    in demo mode (REQ-DOPS-5), so `finding.viewed` cohorts stay clean.
  - **Registration:** `ANALYTICS_EVENTS` + `emission-audit.ts`. The never-cookies contract is
    proven by a response-header test. `check:no-cookies` scans ingestion only and is not cited as
    proof (RV-1).
  - A.

### 4.5 REQ-SHELL: one app shell [R7b] (GD-UX-SHELL.R7; ADR-128) [A5, B3, D1, D6, D7, H1, UXC-3/9/10/11/12/29/35]

- `REQ-SHELL-1`: **one layout route.**
  - A single `AppShell` layout route wraps every `/_authenticated` leaf, including the IDE.
  - The persistent left sidebar is collapsible: expanded ≈ 248 px, collapsed to a 56 px icon
    rail. The state is remembered per user, and the toggle chord follows REQ-KEYS.
  - Pending, error and 404 states render **inside** the shell.
  - `/billing` redirects to `/app/settings/billing` [D6].
  - A + B.
- `REQ-SHELL-2`: **sidebar contents, top to bottom:**
  - wordmark (→ `/app`, SPA link) [UXC-3];
  - **New project**;
  - **Search** (global palette, REQ-SHELL-7);
  - **Recent projects** (≤ 8, with status dots; "All projects");
  - Inbox (badge per REQ-IDE-2), Voices, Usage, Settings, Demo (document link, S-14);
  - account menu: initials, credits balance, Billing, Pricing, Theme, Sign out.

  Lucide icons. Tooltips when collapsed. Shortcuts shown. A + B.
- `REQ-SHELL-3`: the 14 per-leaf `<Shell nav=…>` headers are removed (R6 §3). Page titles are
  content rows, with a `Project › Surface` breadcrumb in project scope. A + B.
- `REQ-SHELL-4`: **project scope.**
  - The sidebar's current-project entry expands into Page, Outline, Figures, Versions, Reviews,
    Export, Project settings.
  - The IDE icon rails and the second Files rail are removed; Files becomes the expanded project
    tree.
  - A + B.
- `REQ-SHELL-5`: outline, figures, run report, usage, settings, voices and project settings render
  inside the shell [UXC-11, G5]. A + B.
- `REQ-SHELL-6`: **narrow desktop** (desktop UA, < 768 px). The sidebar is an off-canvas drawer
  (48 px top bar with a menu button), and the right panel is a full-height sheet [F4, UXC-21].
  Phone-UA real projects follow S-5 (R7RO.2). A + B.
- `REQ-SHELL-7`: **global palette.**
  - ⌘K is available on every signed-in page.
  - It searches projects, drafts, letters, Voices and commands across the workspace through a new
    **tenant-scoped** `GET /search` API route: `withTenant`, two-tenant probe extended (gotcha 2),
    reusing the per-project index.
  - Inside a project it opens project-scoped by default, with a "Search all projects" row.
  - A + B.

### 4.6 REQ-KIT: component primitives (GD-UX-KIT.R7; ADR-129) [A2, B7, D3, D4, D8, E1, G6, I1, I3, UXC-14…18, UXC-31/32]

- `REQ-KIT-1` [R7a]: **base layer.**
  - `color-scheme: dark|light` per theme.
  - Token-based base rules for `button`, `input`, `select`, `textarea`, checkbox, radio and file:
    hover, active, disabled, `:focus-visible`, invalid.
  - The "white system button on dark" class disappears at once.
  - These styled native controls stay the no-JS / SSR fallback permanently (RV-36).
  - New `--fs-*`, `--radius-*`, `--paper-diff-add/del` and `--state-ok` tokens (UXC-31/32) with
    contrast tests.
  - A + B.
- `REQ-KIT-2` [R7b]: **primitives in `@rhema/ui`.**
  - **Radix:** Dialog (for Sheet), Popover, DropdownMenu, ContextMenu, Select, Tabs, Tooltip,
    Checkbox, RadioGroup, Switch.
  - **cmdk:** Combobox and palette.
  - **In-house:** Button / IconButton (required `aria-label`), TextField, TextArea (auto-grow),
    RadioCards, Badge, Chip (static vs interactive variants: a static chip never looks clickable
    [C6]), Skeleton, EmptyState, Kbd, Toast queue, Sheet (on Radix Dialog, non-modal variant),
    Accordion.
  - SplitPane is ADR-129's choice.
  - Styling comes from a generated `uiCss()`, with no inline literals for spacing, type, colour
    or radius.
  - A.
- `REQ-KIT-3` [R7b]: **migration batches**, each one ticket ≤ M that enables REQ-GUARD-1 for its
  files, with DOM-contract hooks preserved:

  | Batch | Surfaces |
  |---|---|
  | a | settings, billing, usage, voices |
  | b | run sheet, export, import, new project |
  | c1 | project list, inbox |
  | c2 | outline, figures (RV-23) |
  | d | IDE (right panel, gate cards, page header strip, findings, dossier, compare); covers the worst raw-control files in `packages/ui/src` (chat-panel, run-sheet, page-editor, gate-card, approval-settings, findings-desk) |

  A + B.
- `REQ-KIT-4` [R7b]: **copy fidelity.**
  - Sessions show "Chrome on macOS · this device" via a UA parser [D3].
  - Enum keys render as labels [D4].
  - Plan-value lines are generated from `pricing.json` and **round down** ("less than 1 essay
    review a month on Base" for ≈ 0.7), formatter-tested [D8, RV-28].
  - A.
- `REQ-KIT-5` [R7b]: **budget discipline** (RV-15).
  - R7KIT.2 measures a fresh tip budget first.
  - Primitives import per package. Dialog/Select/Menu/Popover load in leaf chunks, never through
    the shell's entry graph unless the shell itself uses them; the shell uses Tooltip and
    DropdownMenu only.
  - Each Stream-U ticket declares an **entry-delta allowance ≤ 15 kB gz** and reports actuals.
  - Inlined `uiCss()` bytes per shell document are bounded (≤ 24 kB raw) and asserted.
  - No `spa-budget.json` ceiling is raised without an operator ruling.
  - A.

### 4.7 REQ-PANE: pane layout [B1, B2, B16, F1–F4, UXC-19/20/21/26]

- `REQ-PANE-0` [R7a]: **stopgap on today's geometry.**
  - Viewport-aware defaults: Timeline closed by default below 1280 and in single-pane mode; it
    opens on demand.
  - The 1024–1279 overlay and the < 1024 sheet get a scrim plus Esc / outside-click dismiss, and
    their open state is never persisted from overlay mode.
  - At ≥ 1280 with Files open, the page column reflows instead of sliding under the Timeline
    [B1].
  - The Desk head is never occluded by the status bar [B2].
  - `paneLayout()` is wired as the runtime geometry source.
  - A + B.
- `REQ-PANE-1` [R7b]: **SplitPane engine.**
  - The IDE layout is sidebar | page | right panel and **reflows**: no un-scrimmed overlay at any
    width (RV-26).
  - The page measure stays within REQ-IDE-9 (45–80 ch, target 68) **at ≥ 768 px**: panels
    collapse in a fixed priority order before the page drops below 45 ch.
  - Keyboard resize via `role=separator` + arrow keys [UXC-26].
  - Drag-resize persistence and double-click reset go to BACKLOG (RV-31).
  - A + B.
- `REQ-PANE-2` [R7b]: **breakpoints.**

  | Width | Sidebar | Right panel |
  |---|---|---|
  | ≥ 1440 | expanded | docked; open by default when findings exist |
  | 1280–1439 | auto-collapses to the rail when the right panel opens | docked |
  | 1024–1279 | rail | overlay **with scrim**, closed by default, Esc / outside-click, never persisted from overlay mode |
  | 768–1023 | drawer | full-height sheet on demand |
  | < 768 (narrow desktop) | REQ-SHELL-6 | REQ-SHELL-6 |

  A + B.
- `REQ-PANE-3` [R7b]: **the Desk retires** (ADR-128). R7PANE.1 moves the existing Desk tab bodies
  **unchanged** into the right panel (RV-25), so Chat, Findings and Claims are never unreachable
  between merges; R7TALK.* restyle them. A + B.
- `REQ-PANE-4` [R7b]: **occlusion guard** (REQ-GUARD-4).
  - Playwright layout checks run at 1440×900, 1280×800, 1024×768 and 820×1180 (plus 390×844
    emulated, for the demo).
  - They assert zero intersection between the Page text column / dossier letter column / every
    tour target and any open **un-scrimmed** panel, overlay or menu; and that no main column is
    < 45 ch at ≥ 768 px.
  - Runs in CI and in Stage B.
  - A + B.
- `REQ-PANE-5` [R7b]: **dossier layout** [C7, F1, F3].
  - The letter is the main column at Page measure, with a sticky in-column outline only at ≥ 1440.
  - The run card collapses to a one-line run header.
  - Findings move to the right panel's Findings tab; the colour-dot minimap is labelled or
    removed.
  - The claim ledger is a section of the letter column.
  - A + B.

### 4.8 REQ-RELOAD: zero document reloads in-app [C1, B14, UXC-1…8, UXC-28]

- `REQ-RELOAD-1` [R7b]: chat send is a JSON mutation (REQ-TALK-3). Empty sends are blocked
  client-side, and there are no raw JSON error pages [UXC-1, UXC-28]. A + B.
- `REQ-RELOAD-2` [R7b]: one chrome-level delegated submit plus a shared write allowlist for every
  form in panes, including Timeline gate approvals [UXC-2]. A + B.
- `REQ-RELOAD-3` [R7b]:
  - Write redirects and palette targets go to `/p/:project/v/:n`, never `/edit/:id`.
  - Stale `reloadDocument:true` is removed.
  - The wordmark goes to `/app` [UXC-3/4/5].
  - A + B.
- `REQ-RELOAD-4` [R7b]: `mutationOutcome` for every form route (a flash redirect for no-JS, a
  stable code for JSON) [UXC-28]. A.
- `REQ-RELOAD-5` [R7a]: the Showcase renders in the SPA via ReadOnlyProject (S-3; ADR-128
  REQ-ED-12 item) [C1, UXC-6]. A + B.
- `REQ-RELOAD-7` [R7b]: the `client/ide.ts` island shrinks to the phone-UA reader subset
  (UXC-7). Android tablets get the tablet layout (`Mobi`/client hints, UXC-8). REQ-MOBILE-3's
  entry points are added to the reader (S-5). A + B.
- `REQ-RELOAD-6` [R7b]: **no-reload guard** (REQ-GUARD-3).
  - Journeys assert `performance.getEntriesByType('navigation').length === 1` plus a persisted
    window marker across scripted walks: list → project → dossier → compare → export → settings
    → inbox → chat send → gate approve → Showcase → back.
  - Document navigations sanctioned by S-14 are excluded by name.
  - A + B.

### 4.9 REQ-HOME: list, landing, new project, import [R7b] (GD-UX-HOME-LIST.R7, GD-UX-PROJECT-HOME.R7) [A1, A3, A7–A11, I1–I5, G5, UXC-17/25]

- `REQ-HOME-1`: **projects list.**
  - A flat, always-expanded list by last edit. A row shows title, protocol, voice (only if set),
    version + state, last edited, and a status dot with a legend tooltip.
  - "Waiting on you" / "Running" appear only when non-empty. "QUIET", "Unfiled" and "Sheet" chips
    are retired.
  - One toolbar: search, a filter menu (protocol, voice, archived, recently deleted), a sort menu,
    and an optional remembered Group-by.
  - Filters apply instantly; only non-default params go in the URL [A8].
  - One hover action (Open) plus ⋯. Paid ⋯ items show estimates and open the run sheet.
  - Lifecycle actions are optimistic, with an Undo toast [A11].
  - A + B.
- `REQ-HOME-2`: **a project opens to its head draft's Page.**
  - Next step → a dismissible card in the Timeline tab.
  - Approvals policy, deadlines, standing notes and voice → a **Project settings page**, not a
    modal (REQ-IDE-41 kept).
  - Decisions → Inbox + Timeline.
  - The walkthrough-card landing for an unread finished run is kept.
  - A + B.
- `REQ-HOME-3`: **new project.**
  - "New project" immediately creates the project with a blank editable working draft and focuses
    an inline title ("Untitled"). There is no dialog and no duplicate title [I2].
  - Protocol defaults to Essay; venue and voice live in Project settings.
  - The empty Page shows a quiet affordance row: Import a file · Paste text · Start from an
    outline · Ask in chat.
  - A + B.
- `REQ-HOME-4`: **editable imports** (S-4), with the API/DB change (working head + seeded live
  doc), the four freeze triggers, and the REQ-DATA-14 overwrite rule. It is its own ticket
  (R7HOME.2a) (RV-20). A + B.
- `REQ-HOME-5`: **import fidelity.**
  - A leading `# H1` becomes the title, never dropped; any normalization is listed in Conversion
    notes [I3].
  - The preview is typeset, not monospace.
  - A clean conversion offers one "Create draft".
  - A styled dropzone replaces the native file input.
  - A + B.
- `REQ-HOME-6`: the outline route and the Files tree share one source for "outline exists" [G5].
  A + B.

### 4.10 REQ-WRITE: the writing surface [B4, B5, B11, B12, B15, B18, I6–I8, UXC-22/23/24]

- `REQ-WRITE-1` [R7b]: **format bubble.**
  - A floating bubble **above** the selection, never covering selected lines: Bold, Italic, Link
    (contextual ⌘K, REQ-KEYS-1), H2, H3, Quote, Bulleted, Numbered.
  - A second group holds agent actions, each with a cost hint.
  - No "not available yet" items [I6]. Esc dismisses.
  - A + B.
- `REQ-WRITE-2` [R7b]: "Comment" is the first bubble item. It creates anchored Guidance rendered in
  the margin (DS:524), replacing the bottom-of-page note form [UXC-23, I5]. A + B.
- `REQ-WRITE-3`: the slash menu goes to **BACKLOG** (RV-31; no P0/P1 discharged).
- `REQ-WRITE-4` [R7a]: **Focus mode is never a trap.**
  - A hover/keyboard-revealed exit pill ("Exit focus · Esc"); Esc always exits.
  - It is session-scoped, never restored on reload [B12].
  - A + B.
- `REQ-WRITE-5` [R7b]: Source mode soft-wraps with prose typography [I8]. One "Rich text / Source"
  toggle in the page header; the "Edit source" link is removed [I7]. A + B.
- `REQ-WRITE-6` [R7b]: **page header strip** above the paper.
  - It holds: breadcrumb; version chip (frozen/working badge); sync state; the ReadOnlyProject
    notice; actions (Run ▾ with estimates, Export, ⋯) [B4, B5, B11, UXC-24].
  - Banners use an informational style, never input-like.
  - No card-in-card border at the page measure.
  - A + B.
- `REQ-WRITE-7` [R7b]: **frozen versions are explicit.**
  - The caret may sit in a frozen version without forking. The first keystroke forks v(N+1)
    (REQ-IDE-32: no confirm) and shows an inline, non-modal toast: "You're editing a reviewed
    version, so this starts v(N+1) · Undo".
  - **Undo** calls a new `POST /projects/:id/drafts/:n/discard-fork`. It discards the just-created
    working head **if it has no edits beyond the forking keystroke(s) and no run has read it**.
    The version number is then shown as "v(N+1) · discarded" in history (REQ-SYNC-4) [B18, RV-27].
  - A + B.
- `REQ-WRITE-8` [R7b]: the paper theme is applied from boot before first paint; no dark→light flip
  [B15]. A + B.

### 4.11 REQ-TALK: chat in the right panel [R7b] (GD-UX-CHAT.R7, GD-UX-STREAM.R7) [B6, B16, B17, UXC-1]

- `REQ-TALK-1`: right-panel tabs Chat · Findings · Claims · Timeline · Live feed. It remembers the
  last tab per project. Timeline is the default when a run is active or unread, otherwise Chat.
  A + B.
- `REQ-TALK-2`: **chat thread.**
  - User/assistant bubbles with rendered markdown, citations as source chips, and pins.
  - Per-turn cost footnote showing the **debited (cap-clamped) credits**. Any metered burn above
    the cap is labelled truthfully, never hidden (RV-21; gotcha 5).
  - Failed turns show inline retry; the status-only rows are replaced.
  - Composer: an auto-grow TextArea (⏎ send, ⇧⏎ newline), a model-tier Select, and a live
    "0 / 40 credits" meter.
  - Memory and pins sit in a header disclosure.
  - A + B.
- `REQ-TALK-3`: **progress streaming.**
  - Send is a JSON `fetch` mutation (201 + turn id) with an optimistic user bubble and abort.
  - Live phase/progress comes from the existing run-event SSE, and the reply renders on
    completion. No document reload.
  - **Token-level deltas are BACKLOG**, with their own future ADR (engine → run-task → event
    visibility → SSE) (RV-3).
  - A + B.
- `REQ-TALK-4`: Findings/Claims tabs show the latest delivered review, labelled "From Review of
  vN". "No findings yet" appears only when none was ever delivered [B17]. A + B.

### 4.12 REQ-KEYS: a browser-safe keymap [R7b] (GD-UX-KEYS.R7) [B12, B13]

- `REQ-KEYS-1`: **rules, then a committed table** (RV-14).
  - **Rule 1.** Never bind a chord a supported browser does not deliver to the page
    (non-capturable), on Chrome/Safari/Firefox × macOS/Windows/Linux.
  - **Rule 2.** Avoid capturable but conventional chords: ⌘/Ctrl + L, D, F, G, P, S (except
    REQ-IDE save semantics, already ⌘S restore-point; keep), T, W, N, R, comma, period, number
    keys, ⌘⇧ + T, R, D, C, M, V, E, J, plus Safari ⌘. and 1Password's ⌘\.
  - **Rule 3.** Prefer, outside text input:
    - single keys and two-key sequences in the Linear/GitHub style (`[` toggle sidebar, `]`
      toggle right panel, `g` then `p/i/v/s` go to Projects/Inbox/Voices/Settings, `f` focus
      mode, `?` cheat sheet (REQ-UX-8 kept));
    - and ⌘⌥ chords inside text input where needed.
  - **Rule 4.** Keep ⌘K (palette; contextual link with an editor selection) and ⌘⏎ (run sheet
    from the Page).
  - **Rule 5.** In Source mode the editor's own bindings (e.g. CodeMirror ⌘/) win while it has
    focus.
  - The ticket rewrites **every** binding in `packages/ide/src/keymap.ts` (≈ 20), including ⌘1/⌘2
    /⌘J/⌘G/⌘,/⌘I and ⌘⇧*. The result is a committed `reserved-chords.json`, pinned by a test that
    fails on any rule violation.
  - A.
- `REQ-KEYS-2`: every shortcut appears in menus, tooltips and the `?` sheet, generated from the
  keymap. A + B.

> **Dated banner (2026-11-06, 239_R7WRITE.2 — ADR-128's REQ-UX-8 / REQ-IDE-49 item, spec §3.2):**
> the `?` cheat sheet is **kept** as the sheet's trigger, per ADR-128 — the remap changes chords
> only. The full old → new table, per-row sources for the non-capturable set, and RV-14's layout
> note live in `packages/ide/src/reserved-chords.json`; the `transitional` grandfather map is
> empty (the remap is complete) and the key is retained for schema stability.

### 4.13 REQ-COPY: vocabulary, errors, rendered text [B6, C3, C8, C9, C12, D2, D5, E1, G2, G6, H3, UXC-27/28/30]

- `REQ-COPY-1` [R7b]: a label table for every internal key reaching UI (workflow, phase, artifact
  kind, enum), with consistent case (REQ-GUARD-2). A.
- `REQ-COPY-2` [R7b]: `errorCopy(code)` maps every API error code to a sentence plus an action,
  with a fallback and `requestId` logged [UXC-27]. A.
- `REQ-COPY-3` [R7b]: one sanitized markdown renderer for finding bodies, inbox notices, response
  letters and what-changed passages. No monospace prose outside Source mode. Long URLs
  wrap/truncate [C8, D2, G2]. A + B.
- `REQ-COPY-4` [R7a]: **record-composed run card** (ADR-130).
  - "What it delivered" = the letter's verdict line (quoted), finding/claim counts (REQ-SYNC-2)
    and links.
  - The `run.walkthrough` model call is removed (orchestrator/worker; read
    `packages/orchestrator/AGENTS.md`).
  - Existing stored walkthrough text is no longer rendered [C3].
  - A + B.
- `REQ-COPY-5` [R7b]: one number formatter (no float noise [E1]); credits and $ together on paid
  surfaces; data-generated sentences fix "4,000 of 2,000" and "credits credits" [D5]. A.
- `REQ-COPY-6` [R7b]: a jargon pass with a banned internal-term list:
  - "QUIET";
  - "obligations" → "open items";
  - body-copy "gate";
  - "the coherence read";
  - "public funnel";
  - "sidecar";
  - "partial (0/1 phases)";
  - "Waiting on your call";
  - "Have an invitation?";
  - "the shared session contract…".

  Each gets a plain-language replacement (REQ-GUARD-2). A.
- `REQ-COPY-7` [R7a]: programmatic route focus moves to the heading with **no** visible ring
  (`tabindex=-1`, `outline:none` on programmatic focus). Rings appear only for keyboard focus
  [A4, D7, C10]. A + B.
- `REQ-COPY-8` [R7b]: claim ordinals show the source id or 1-based numbering, never `[0]`; a
  verdict is shown once [C9]. A.

### 4.14 REQ-SYNC: one truth per fact [C4, C5, C11, E2, G3, G4, B6, B17, I9]

- `REQ-SYNC-1` [R7a]: every run-state display reads one `RunSummaryView` from one query key [C4].
  A.
- `REQ-SYNC-2` [R7a]: finding/claim counts come from the delivered record in one place, by one
  rule (e.g. "5 findings + 1 strength") [C5]. A.
- `REQ-SYNC-3` [R7b]: the Timeline tab shows the real timeline on every project sub-route [E2,
  G3]. A + B.
- `REQ-SYNC-4` [R7b]: a missing version shows a versions picker. Gaps render as "vN · discarded"
  (or whatever the record holds) [G4]. A.
- `REQ-SYNC-5` [R7b]: durations and costs come only from the shared estimator. Per-protocol values
  on New project/Settings [C11, I1]. A.
- `REQ-SYNC-6` [R7b]: **chat-turn burn vs cap investigation** (RV-21; R5 B6 "16 / 5 cr", "43/40
  cr").
  - Determine whether metered burn exceeded `capCredits` and what was debited (ledger clamp).
  - Close as a finding (a REQ-SPEC-32 conformance proof) or open a dated DEFERRALS row with an
    owner. No money-mode change (gotcha 5).
  - A.

### 4.15 REQ-SPEED [R7b] [B14, D5, UXC-33…36]

- `REQ-SPEED-1`: fold the handoff POST into the twin GET, or defer it past first paint [UXC-33]. A.
- `REQ-SPEED-2`: the shell and skeleton paint immediately on every hard load [B14, D5]. A + B.
- `REQ-SPEED-3`: hover/focus prefetch for a declared `PREFETCH_SAFE` GET-twin set with no read side
  effects, plus per-twin `staleTime` and scoped invalidation keys. Discharges REQ-NAVM-7's
  follow-up [UXC-34/35]. A.
- `REQ-SPEED-4`: preload Literata (normal) and Inter in the shell and SSR heads [UXC-36]. A.
- `REQ-SPEED-5`: Stage-B timings are recorded, not gated: project open p75 ≤ 400 ms warm (SPA) and
  ≤ 1.2 s hard; a pending indicator within 100 ms. Regressions become findings. B.

### 4.16 REQ-PUB + REQ-GUARD

- `REQ-PUB-1` [R7b]: `/pricing` is viewable signed-in and linked from the account menu [H1].
  Signed-in `/showcase` keeps its redirect to the (now SPA) in-app Showcase. A + B.
- `REQ-PUB-2` [R7b]: **landing refresh, scope-capped.**
  - A dedicated marketing layout + nav.
  - A serif display headline (§15.1).
  - A hero loop **recorded from the R7b preview's tour** (REQ-GROWTH-3 limits).
  - The demo CTA (REQ-TOUR-4); REQ-COPY-6 fixes [H2, H3]; FAQ on Accordion.
  - The full redesign is BACKLOG (GD-UX-P1-BACKLOG.R7).
  - A + B.
- `REQ-GUARD-1` [R7b]: **no raw controls.**
  - An ESLint rule bans raw `<button|input|select|textarea>` and inline spacing/type/colour/radius
    literals in **`packages/ui/src/**` (except `primitives/**`) and `apps/web/src/**/*.tsx`**
    (RV-16).
  - It has a named no-JS/SSR exemption list (styled by KIT-1).
  - It is enabled per migrated batch, and globally by R7GUARD.1.
  - A.
- `REQ-GUARD-2` [R7b]: a copy lint (no `COPY` leaf with a banned term) plus a DOM test (no
  `snake_case` workflow/phase/kind key in rendered text outside `data-*`). A.
- `REQ-GUARD-3` [R7b]: REQ-RELOAD-6. A + B.
- `REQ-GUARD-4` [R7b]: REQ-PANE-4. A + B.

### 4.17 REQ-DACC + REQ-DOPS

- `REQ-DACC-1…6`: adopted from R4, with these restatements (RV-6):
  - **DACC-4** is restated: `P1.demo` asserts SPA-compact demo Pages at 390/320 px (axe clean; no
    desktop-capability subtree per REQ-UX-10), **not** the phone reader contract.
  - **DACC-6** is restated: "existing public routes unchanged **except** the enumerated deltas" (the
    landing CTA and R7b refresh, the `/showcase` link, signed-in `/pricing`, the SPA Showcase
    renderer). `public-ssr-baseline` is re-captured after each owning ticket. `R8.showcase` is
    re-expected for the SPA renderer.
  - **DACC-3** is restated: zero same-origin non-GET **except** the REQ-TOUR-9 POST.
  - The rest stands: legs D1.hub, D2.tour, D3.readonly, R*.demo, P1.demo; `paid:false`;
    `--expect-sha`; provenance all-PASS; the tour leg walks every step; DOM contract; N10.
  - B.
- `REQ-DACC-7` [R7b]: **UX legs.**
  - U1.shell, U2.noreload, U3.occlusion (5 sizes), U4.controls (a computed-style probe: zero
    native-styled controls on 12 surfaces), U5.write (new project → type → bubble → comment →
    focus in/out → source), U6.chat, U7.import (paste with H1 → title kept → editable).
  - **U6.chat:** the CI/nightly leg is free, against a stubbed turn (asserts the JSON 201,
    progress events, no reload). **One** manual paid run at R7DEP.2: Base tier, `capUsd` with a
    hard ceiling **< $10** (`GD-UX-PAIDLEG.R7`), target ≤ $0.50, declared `--headroom`, never
    nightly.
  - B.
- `REQ-DACC-8` (RV-13): **every D* and U* leg is registered `expected:"red"` in R7OPEN.1**, with an
  owner → leg map (§10). Each owner flips its legs green in its own PR with screenshots. A.
- `REQ-DOPS-1…7`: adopted from R4. REQ-DOPS-2 (corpus in the web image plus an image-content
  assertion) is owned by R7DEM.4 (RV-23). REQ-DOPS-6 governs both R7DEP.1 and R7DEP.2. REQ-DOPS-7
  adds ADR-128/129/130 and `docs/decomposition-prompt-r7.md`. A/B per R4.
- `REQ-DOPS-8`: Radix / Lucide / cmdk (and react-resizable-panels if chosen) pass
  `check:licenses`, are pinned exactly, and are listed in ADR-129. A.

### 4.18 REQ-CLOSE: the tail

- `REQ-CLOSE-1`: R7CAP.1. Round-7 REQ coverage plus the **finding accounting** (§7): every R5/R6
  P0/P1 is closed with evidence or carries a ruling.
- `REQ-CLOSE-2`: GATE-ACCEPT.R7. The operator signs; GD-DEPLOY.R7 expires.
- `REQ-CLOSE-3`: R7REC.1, the combined backlog + spec fold-back (ADR-126…130 banners verified).
- `REQ-CLOSE-4` (RV-38): R7DOC.1. refresh-repo-docs plus agent-docs (`apps/web/AGENTS.md` gains the
  shell, primitives, ReadOnlyProject, demo and keymap sections).
- `REQ-CLOSE-5` (RV-38): R7OPEN.1 verifies and flips **D-OBS.1-3** and **D-SPA.28-1** (evidence:
  run 41472916874). It records the interaction of **D-P1.17-2** (Lighthouse/axe arm) and
  **D-FIX.1-2** (real-UA phone) with DACC-4 / R7RO.2. It opens the round-7 DEFERRALS sections
  (gotcha 1).

## 5. Ordering constraints

1. **Phases.** R7a rows complete and deploy (R7DEP.1) before R7b's user-surface tickets merge to
   `main`. R7b *development* may start in parallel on its stack.
2. **Corpus sign-off.**
   - The corpus (R7DEM.1) and the synthetic fixture come first.
   - R7DEM.2–5 develop and merge against the **synthetic** fixture.
   - HUMAN-H14 → R7DATA.1 (the real data commit).
   - HUMAN-H15 (demo/tour copy) → R7DEP.1.
3. **R7a must-fix first.** KIT-1 precedes every other user-surface ticket in both phases. RO mode
   (R7RO.1) precedes R7DEM.4.
4. **R7b foundations.** KIT.2 → SHELL.1a → PANE.1 → (SHELL.2, TALK.*, KIT.3d, PANE-5). KEYS-1's
   rules land in SHELL.1a for the sidebar/panel chords (RV-33); the rest of the remap lands in
   R7WRITE.2.
5. **R7b tour re-pin last.** R7TOUR.2 depends on every R7b ticket that touches a tour target
   (SHELL.1a/1b/2, PANE.1, HOME.2b, WRITE.1a, KIT.3d, COPY.1, SYNC.1) (RV-12). It re-runs the
   DWEB-7 recording proxy.
6. **Recording.** REQ-PUB-2's recording is captured from R7DEP.2's owned preview, after R7TOUR.2.
   R7PUB.1 runs inside the R7DEP.2 preview window, or holds its own owned preview (RV-32).
7. **Deploys.** Each R7DEP.* follows a full preview walk of its phase's legs.

## 6. Gates and HUMAN rows (a gate is a pause, not a block)

- **HUMAN-H14: corpus sign-off.** The operator reads `PROVENANCE.md` (allowlist, redactions,
  exclusions, S-9 facts) and approves. R7DATA.1 waits on it; code tickets proceed on the synthetic
  fixture.
- **HUMAN-H15: demo copy sign-off.** Hub, cards, tour script and notices on the R7a preview.
  R7DEP.1 waits on it.
- **HUMAN-H16: UX review session** (optional, recommended). A walk of the R7b preview after the
  foundations land, before R7TOUR.2. Findings become `F-R7UX-*` rows folded into the remaining
  tickets.
- **GATE-ACCEPT.R7:** REQ-CLOSE-2.
- **Pre-authorized acts:**
  - GD-DEPLOY.R7: R7DEP.1/R7DEP.2, plus the CDN invalidation (S-13).
  - The one-time Substack fetch (`fetch-published.mjs`), a read of the operator's own public
    posts.
  - Owned preview stacks via `scripts/live/preview-stack.mjs`.
  - The one U6 paid run (< $10).

  Anything else carries an unticked `Gate status` item, and the orchestrator pauses.

## 7. Finding accounting

R7CAP.1 maintains `docs/build/planning/2026-11-03_r7-demo/finding-map.csv` (finding → REQ →
ticket → evidence). R7OPEN.1 seeds it. Residue seeded here:
- **WONTFIX this round (`GD-UX-P1-BACKLOG.R7`):**
  - R5 G1, word-level change marks; pairs with the 1.x `prosemirror-changeset` work.
  - The UXC-13 remainder, the full marketing redesign.
- **BACKLOG P2s** (fixed in passing if touched; otherwise dated rows):
  - A6, A8 (fixed by HOME-1), B8 (KIT-2 Chip/Menu), B9, B10, H4, H5;
  - WRITE-3 (slash menu);
  - PANE-1 drag persistence/reset;
  - token-level chat streaming (GD-UX-STREAM.R7);
  - `parseDraftLedgerSections` (REQ-CONV-17).
- **Economics evidence → BL-13** (no money change this round): R5 E1 ("≈ $85.35" for 624 words),
  I9 ("≈ $32" for 43 words), and D8 plan value. REQ-SYNC-6 may add cap-enforcement evidence.

## 8. Cross-cutting invariants (every ticket re-checks)

1. **Tenancy.**
   - The demo path makes no API/DB **read**. The REQ-TOUR-9 insert-only write is the sole
     sanctioned exception.
   - Every new tenant read (e.g. SHELL-7 `GET /search`) uses `withTenant`, with the two-tenant
     probe extended (gotcha 2).
2. **Money.** No money-mode change. Every number comes from the estimator/entitlement config or
   the delivered record, and is rounded down when it is a value claim (gotcha 5).
3. **Copy.**
   - No efficacy claims (REQ-EVAL-19).
   - The harness is never named with a third-party product name in UI.
   - The reserved-strings rules apply: "author" = the human only; demo roles per S-10.
   - Essay content is data.
4. **Browser proof.** DOM-contract updates land in the same change. Stage-B screenshots are taken
   at the deployed SHA, and a skipped leg is reported as skipped (gotcha 4).
5. **Budgets and checks.** `check:spa-budget` (REQ-KIT-5 allowances), `spa-env`,
   `protocol-markers`, `no-cookies`, `dom-contract` and `licenses` stay green. No ceiling is
   raised without a ruling.
6. **Records.** Append-only. Amendments go via ADR-126…130 plus dated banners.
7. **Sizing.** ≤ M per ticket; split rather than stretch.

## 9. Out of scope (explicit)

- Live inference or per-visitor generation in the demo; voice/persona surfaces; the
  `sjs-substack` profile.
- Token-level chat streaming (BACKLOG). The full marketing redesign and word-level diff marks
  (BACKLOG by ruling).
- Pricing, plan or credit-model changes (BL-13). A native mobile app.
- Suggestion marks, working copies and span-level provenance rendering (1.x per REQ-SPEC-19).
- Replacing Wells as the in-workspace Showcase.

## 10. Proposed decomposition (`decompose-spec mode=extend` finalizes ids and sizing)

`#` = row; `→` = depends on. Every row is ≤ M; R7b rows marked † were split per RV-24.
**Owner → leg map** (REQ-DACC-8):
- D1.hub, D3.readonly → R7DEM.5
- D2.tour → R7DEM.6a / R7TOUR.2
- R*.demo, P1.demo → R7DEM.4/5
- U1 → R7SHELL.1a
- U2 → R7RELOAD.1
- U3 → R7PANE.1 (stopgap probe in R7FIX.1)
- U4 → R7KIT.3d
- U5 → R7WRITE.1b
- U6 → R7TALK.1a
- U7 → R7HOME.2a

### R7a: the demo + must-fix

| # | Row | Scope | → |
|---|---|---|---|
| 209 | `R7OPEN.1` | GATE DECISIONS `### Round 7`; ADR-126…130 shells; manifest section; DEFERRALS sections + REQ-CLOSE-5 flips; register all D*/U* legs red (DACC-8); finding-map seed; BACKLOG seeds (§7); `decomposition-prompt-r7.md` | — |
| 210 | `R7KIT.1` | REQ-KIT-1 base layer + tokens + REQ-COPY-7 focus rings | 209 |
| 211 | `R7RO.1` | REQ-DWEB-14 ReadOnlyProject (demo/showcase/run_lock) + REQ-RELOAD-5 Showcase in SPA | 210 |
| 212 | `R7FIX.1` | REQ-PANE-0 stopgap + REQ-WRITE-4 focus exit | 210 |
| 213 | `R7COPY.0` | REQ-COPY-4 + ADR-130 (retire walkthrough) + REQ-SYNC-1/2 | 209 |
| 214 | `R7DEM.1` | REQ-CORPUS-1…13/15: exporter, sanitizer, denylist, PROVENANCE, fetch-published, synthetic fixture, licence carve-out (REQ-DOPS-3/4). **Real corpus stays local.** | 209 |
| 214a | `HUMAN-H14` | corpus sign-off | 214 |
| 215 | `R7DEM.2a` | converter: claim ledger + anchors (REQ-CONV-1…6, 11) on the synthetic fixture | 214 |
| 216 | `R7DEM.2b` | converter: letter/findings/rubric/second read (CONV-7…9, 13, 14, 16) | 215 |
| 217 | `R7DEM.2c` | converter: response ledgers/structure plan/overrides/what-changed (CONV-10, 12, 15, 17) | 216 |
| 218 | `R7DEM.3` | projector → DTO snapshots + contract test + REQ-DWEB-15 replay (S-9) + figure image DTO (S-7) | 217 |
| 219 | `R7DATA.1` | real corpus + goldens + snapshots: **one data commit** (REQ-CORPUS-14) | 214a, 218 |
| 220 | `R7DEM.4` | REQ-DWEB-1…6, 8…11, 16, 17: demoDataSource, guard, nested JSON app, `/demo` SSR hub shell, URL spike (S-1), asset route, SHA-keyed twins (S-13), REQ-DOPS-2 image assertion | 211, 218 |
| 221 | `R7DEM.5` | REQ-DWEB-7 (regenerated side-effect table + recording proxy), DWEB-12/13; REQ-TOUR-1/3/6/7/8 hub + cards | 220, 212, 213 |
| 222 | `R7DEM.6a` | REQ-TOUR-2 tour (current surfaces) + TOUR-4 (landing/showcase/footer) + TOUR-5 | 221 |
| 223 | `R7DEM.6b` | REQ-TOUR-9 metrics carve-out (migration, insert-only role, api route, web relay) + REQ-DOPS-5 suppression | 221 |
| 223a | `HUMAN-H15` | demo copy sign-off on preview | 222, 219 |
| 224 | `R7DEP.1` | R7a preview walk (D* legs) → prod deploy under GD-DEPLOY.R7 → CDN invalidation → Stage B → provenance | 219, 222, 223, 223a |

### R7b: the UX overhaul + tour re-pin

| # | Row | Scope | → |
|---|---|---|---|
| 225 | `R7KIT.2` | REQ-KIT-2 primitives + REQ-KIT-5 fresh budget + REQ-DOPS-8 + GUARD-1 rule (off) | 210 |
| 226 | `R7SHELL.1a`† | REQ-SHELL-1/2/6: AppShell + sidebar + in-shell states + `/billing` alias + KEYS rules for sidebar/panel chords | 225 |
| 227 | `R7SHELL.1b`† | REQ-SHELL-3/5: remove 14 leaf headers; frame outline/figures/run report/settings/voices/usage | 226 |
| 228 | `R7SHELL.1c`† | REQ-SHELL-7: global palette + tenant-scoped `GET /search` + two-tenant probe | 226 |
| 229 | `R7PANE.1` | REQ-PANE-1/2/3: SplitPane engine, breakpoints, right panel with the Desk bodies moved unchanged | 226 |
| 230 | `R7SHELL.2` | REQ-SHELL-4: project scope in sidebar, Files tree | 229 |
| 231 | `R7RELOAD.1` | REQ-RELOAD-2/3/4 + GUARD-3 harness | 226 |
| 232 | `R7TALK.1a`† | REQ-TALK-1/2/3 + REQ-RELOAD-1: panel thread, composer, JSON mutation, progress | 229, 231 |
| 233 | `R7TALK.1b`† | REQ-TALK-4 + REQ-SYNC-6 investigation | 232 |
| 234 | `R7HOME.1` | REQ-HOME-1 + REQ-KIT-3 batch c1 (list, inbox) | 226 |
| 235 | `R7HOME.2a`† | REQ-HOME-4/5: editable imports (API/DB, freeze triggers, REQ-DATA-14 rule) + import fidelity | 226 |
| 236 | `R7HOME.2b`† | REQ-HOME-2/3/6: opens to Page, blank new project, Project settings page, outline coherence | 230, 235 |
| 237 | `R7WRITE.1a`† | REQ-WRITE-1/6: format bubble + page header strip | 230 |
| 238 | `R7WRITE.1b`† | REQ-WRITE-2/7: comment → Guidance + fork toast + discard-fork API | 237 |
| 239 | `R7WRITE.2` | REQ-WRITE-5/8 + REQ-KEYS-1 full table + KEYS-2 | 238 |
| 240 | `R7KIT.3a` | settings/billing/usage/voices + REQ-KIT-4 | 227 |
| 241 | `R7KIT.3b` | run sheet/export/import/new project + REQ-COPY-5 | 236 |
| 242 | `R7KIT.3c2` | outline + figures | 227 |
| 243 | `R7KIT.3d` | IDE surfaces + REQ-PANE-5 dossier layout + REQ-COPY-8 | 232, 237 |
| 244 | `R7COPY.1a`† | REQ-COPY-1/6 labels + jargon + REQ-GUARD-2 | 243 |
| 245 | `R7COPY.1b`† | REQ-COPY-2/3 errorCopy + markdown renderer | 243 |
| 246 | `R7SYNC.1` | REQ-SYNC-3/4/5 + REQ-SPEED-1…4 | 244 |
| 247 | `R7RO.2` | REQ-RELOAD-7: island shrink + REQ-MOBILE-3 entry points + Android tablets | 229 |
| 247a | `HUMAN-H16` | UX review session (optional) | 243, 236 |
| 248 | `R7TOUR.2` | REQ-TOUR-2 re-pin + sidebar Demo entry + DWEB-7 re-run | 227, 230, 236, 237, 243, 244, 246 |
| 249 | `R7GUARD.1` | REQ-GUARD-1 global + REQ-GUARD-4/PANE-4 occlusion in CI | 248 |
| 250 | `R7DEP.2` | R7b preview walk (D* + U*) → REQ-PUB-1/2 (`R7PUB.1` inside the preview window) → prod deploy → CDN invalidation → Stage B → U6 manual paid run (< $10) → provenance | 249 |
| 251 | `R7CAP.1` | REQ-CLOSE-1 | 250 |
| 252 | `GATE-ACCEPT.R7` | REQ-CLOSE-2 | 251 |
| 253 | `R7REC.1` | REQ-CLOSE-3 | 252 |
| 254 | `R7DOC.1` | REQ-CLOSE-4 | 253 |

*(If decomposition finds `R7PUB.1` too large to sit inside R7DEP.2's window, it becomes its own
row between 249 and 250, with its own owned preview.)*

## Appendix A: Requirement index

| Family | § | Ids | Phase | Evidence |
|---|---|---|---|---|
| CORPUS | 4.1 | 1–15 | R7a | A (14: + H14) |
| CONV | 4.2 | 1–17 | R7a | A |
| DWEB | 4.3 | 1–17 | R7a | A; B for 6, 9, 10, 11, 14, 16 |
| TOUR | 4.4 | 1–9 | R7a (2 re-pinned R7b) | A + B for 1, 2, 4; A otherwise |
| SHELL | 4.5 | 1–7 | R7b | A + B |
| KIT | 4.6 | 1–5 | 1 R7a; 2–5 R7b | A + B for 1, 3; A for 2, 4, 5 |
| PANE | 4.7 | 0–5 | 0 R7a; 1–5 R7b | A + B |
| RELOAD | 4.8 | 1–7 | 5 R7a; rest R7b | A + B (4 A) |
| HOME | 4.9 | 1–6 | R7b | A + B |
| WRITE | 4.10 | 1–8 (3 → BACKLOG) | 4 R7a; rest R7b | A + B |
| TALK | 4.11 | 1–4 | R7b | A + B |
| KEYS | 4.12 | 1–2 | R7b | A; 2 A + B |
| COPY | 4.13 | 1–8 | 4, 7 R7a; rest R7b | A; B for 3, 4, 7 |
| SYNC | 4.14 | 1–6 | 1, 2 R7a; rest R7b | A; B for 3 |
| SPEED | 4.15 | 1–5 | R7b | A; B for 2, 5 |
| PUB | 4.16 | 1–2 | R7b | A + B |
| GUARD | 4.16 | 1–4 | R7b | A; B for 3, 4 |
| DACC | 4.17 | 1–8 | both | B (8 A) |
| DOPS | 4.17 | 1–8 | both | A/B per R4 |
| CLOSE | 4.18 | 1–5 | tail | records |

## Appendix B: Decision register

§3.1 (operator) and §3.3 (S-1…S-14). **No blocking questions remain for ratification.** Optional
items the operator may weigh:
- (i) HUMAN-H16, optional vs mandatory;
- (ii) the REQ-SPEED-5 targets;
- (iii) whether `R7PUB.1` gets its own preview row.

## Appendix C: Research index

| Id | Note |
|---|---|
| R1 | `docs/build/planning/2026-11-03_r7-demo/R1-corpus-census.md`  |
| R2 | `…/R2-converter-feasibility.md` (+ `prototypes/r2/`; 22 sidecars / 675 rows, all `parseSidecar`-valid in the prototype run) |
| R3 | `…/R3-serving-and-demo-mode.md` |
| R4 | `…/R4-acceptance-deploy-conventions.md` |
| R5 | `…/R5-ux-browser-audit.md` (prod, Claude in Chrome, operator account; one scratch project created and archived) |
| R6 | `…/R6-ux-code-audit.md` |
| REVIEW | `…/REVIEW-round-7-draft-spec.md` (fresh-context adversarial review of v0.1) |

## Appendix D: Glossary

| Term | Meaning |
|---|---|
| Demo | `/demo`, the public read-only experience over the four-essay corpus. |
| Showcase | The in-workspace Wells worked example (unchanged concept). |
| ReadOnlyProject | The shared client read-only mode, with reasons `demo` / `showcase` / `run_lock`. |
| Replayed run | A run card reconstructed from the record: phases inferred from files; no time or money. |
| The writer / the editor (agent) / the revising agent / the drafting agent | Demo role vocabulary (S-10). |
| Right panel | ADR-128's replacement for the Desk and the Timeline pane. |
| Sidebar | ADR-128's expanded Rail. |
| R7a / R7b | The round's two deploy phases (GD-ORDER-SPLIT.R7). |

## Appendix E: Review dispositions (v0.1 → v0.2)

| RV | Sev | Disposition | Where |
|---|---|---|---|
| 1 | blocking | **adapt.** Explicit insert-only carve-out; channel, role, abuse bound, header-test proof | ADR-126, REQ-TOUR-9, DACC-3, §8.1 |
| 2 | blocking | **escalated → ruled** (GD-DEMO-BYLINE-SCOPE.R7); credit lines allowlisted; brief Q1 reworded | S-11, CORPUS-2 |
| 3 | blocking | **escalated → ruled** (GD-UX-STREAM.R7); progress now, token deltas → BACKLOG; TALK split | REQ-TALK-3, rows 232/233 |
| 4 | blocking | **escalated → ruled** (GD-DEMO-ROLES.R7); role vocabulary; operator→"the writer" | S-10, TOUR-2 beats 8/10, CORPUS-3/13 |
| 5 | blocking | **adapt.** Synthetic fixture; one post-H14 data commit; H15 copy checkpoint | S-12, CORPUS-14/15, rows 214–224 |
| 6 | major | **adapt.** DACC-4/-6/-3 restated | §4.17 |
| 7 | major | **escalated → ruled** (GD-UX-PAIDLEG.R7: < $10) | §2, DACC-7 |
| 8 | major | **adapt.** Figures as imported images + asset route + image DTO variant | S-7, DWEB-17 |
| 9 | major | **adapt.** Phases inferred from files; gates only from PROVENANCE facts | S-9, DWEB-15 |
| 10 | major | **adapt.** Regenerated side-effect table with recording proxy; document-nav entry | DWEB-7/16, S-14 |
| 11 | major | **adapt.** SHA-keyed twin URLs + CDN invalidation act | S-13 |
| 12 | major | **accept.** Tour re-pin depends on every target-touching ticket | §5.5, row 248 |
| 13 | major | **accept.** All legs registered red in R7OPEN.1 with owner map | DACC-8, §10 |
| 14 | major | **adapt.** Rule-based keymap + committed reserved-chord table; `?` sheet kept | REQ-KEYS-1 |
| 15 | major | **adapt.** Fresh budget, per-package imports, ≤ 15 kB entry delta, uiCss bound | REQ-KIT-5, §2 |
| 16 | major | **accept.** Guard scope widened to `packages/ui/src` + `apps/web/src/**/*.tsx` | REQ-GUARD-1 |
| 17 | major | **escalated → ruled** (GD-UX-WALKTHROUGH.R7); ADR-130 | REQ-COPY-4, row 213 |
| 18 | major | **accept.** Amendments enumerated; IDE-41 kept by design (no new modals) | ADR-128, HOME-2/3 |
| 19 | major | **accept.** `frozen` → `run_lock` | S-3, DWEB-14 |
| 20 | major | **adapt.** Overwrite/freeze rule, four freeze triggers, own API ticket | S-4, HOME-4, row 235 |
| 21 | major | **adapt.** Debited credits shown; burn-above-cap labelled; investigation REQ | TALK-2, SYNC-6 |
| 22 | major | **adapt.** Narrow-desktop vs phone-UA split; island owner R7RO.2 | S-5, SHELL-6, RELOAD-5b |
| 23 | major | **accept + ruled.** KIT-3c2 row; DOPS-2 → R7DEM.4; `/billing` alias; G1/UXC-13 → BACKLOG | KIT-3, SHELL-1, §7 |
| 24 | major | **adapt.** Ten rows split (†) | §10 |
| 25 | major | **accept.** Desk bodies move unchanged | PANE-3 |
| 26 | minor | **accept.** ch floor ≥ 768; no un-scrimmed overlay | PANE-1/4 |
| 27 | minor | **adapt.** Discard-fork API and semantics | WRITE-7 |
| 28 | minor | **adapt.** Value claims round down | KIT-4, §8.2 |
| 29 | minor | **adapt.** Quote the ledger summary; snapshot-derived counts; raw-table targets | TOUR-2 |
| 30 | minor | **adapt.** One counting rule; retitle note | TOUR-1, CORPUS-12 |
| 31 | minor | **defer.** WRITE-3, PANE drag polish → BACKLOG | §7 |
| 32 | minor | **adapt.** Recording from the R7DEP.2 preview window | §5.6, row 250 |
| 33 | minor | **accept.** §5 aligned with §10; KEYS rules in SHELL.1a | §5.4 |
| 34 | minor | **adapt.** Prototypes copied to `prototypes/` (non-normative, path-portable) | Appendix C |
| 35 | minor | **accept.** no-cookies annotation | DWEB-4 |
| 36 | minor | **adapt.** Source per primitive named; native styled fallback | KIT-1/2, ADR-129 |
| 37 | minor | **accept.** File rulings | CORPUS-11 |
| 38 | minor | **accept.** DEFERRALS flips/interactions; decomposition prompt; R7DOC REQ id | REQ-CLOSE-4/5, row 209 |
