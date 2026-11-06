// JOURNEY.1 (REQ-SPEC-29; ADR-016) — THE journey step registry (deliverable 2; this file OWNS the
// format). One row per journey step in `docs/build/planning/2026-09-30_planning-ledger.md` § "Journey
// step registry" — that table is now historical; this is the live registry. An owner turns its step
// green in its own PR with the screenshot; the runner semantics make a red step's failure a reported
// debt, never a run failure (see runner.ts).

export type JourneyName = "new-visitor" | "returning" | "phone" | "two-tenants";

export interface JourneyStep {
  /** stable id — the planning-ledger id (N1…N9, R1/R4–R7, P1, C1, X1); sub-assertions suffix `.sub`. */
  readonly id: string;
  readonly journey: JourneyName | "both";
  /** what the step asserts — visible text / an actionable control, never status alone. */
  readonly asserts: string;
  /** the ticket that owns turning this step green (its Stage B flips `expected` + attaches evidence). */
  readonly owner: string;
  /** `green` steps must pass; `red` steps are allowed to fail (reported as "owed — owner X"). */
  readonly expected: "red" | "green";
  /** a paid step needs the funded weekly leg (run creation / a chat turn) — nightly runs exclude it. */
  readonly paid: boolean;
  /**
   * R5ECON.3 (REQ-ECON-9; §5.3 verbatim) — the declared per-leg metered-USD cap, stated in
   * advance on every paid step. Launching legs carry the §5.3 table's figures (basis
   * O2-F19: levered-expected; unlevered-measured is the fallback bound where a leg opts
   * out). The no-own-spend riders (T9, T10–T16 — they ride the window's own deliveries)
   * declare the $0.50 floor. A paid step WITHOUT a cap is a registry error the dispatch
   * refuses (cli.ts + funded-window.mjs); the leg-close assert `assertLegCapUsd` throws
   * `CapOverrunError` when the metered figure exceeds the declared cap (REQ-ECON-7).
   */
  readonly capUsd?: number;
  /**
   * R5ECON.2 (REQ-ECON-11) — the per-leg COGS-lever pin every run this step launches MUST carry,
   * posted as `cogsLevers` in the launch body (JSON) or the same-named field (form posts). Set for
   * the model-judgment legs — the step's assert object IS the model's judgment, so the
   * `testCheapRoute` arm must never reach them even when `COGS_LEVERS_TEST` defaults it ON for the
   * test tenant. The step installs it via `cogsLeversFor` + the pin helper (steps.ts); an absent
   * field means the leg rides the tenant default verbatim.
   */
  readonly cogsLevers?: Readonly<Record<string, boolean>>;
}

/** Every planning-ledger step + the initial green baseline this ticket owns (ADR-020 §registry). */
export const STEP_REGISTRY: readonly JourneyStep[] = [
  // ---- new-visitor journey ------------------------------------------------
  {
    id: "N1",
    journey: "new-visitor",
    asserts: "the landing drop-zone holds a dropped draft across sign-in and later page loads",
    owner: "ONB.1",
    expected: "green",
    paid: false,
  },
  {
    id: "N2",
    journey: "new-visitor",
    asserts: "signup/sign-in via a real magic link into the test mailbox",
    owner: "JOURNEY.1",
    expected: "green",
    paid: false,
  },
  {
    id: "N2.invite",
    journey: "new-visitor",
    asserts:
      "under open mode the email field leads BOTH /signup and /login and the invite field sits behind the disclosure (SEC.2's sub-assertion of N2)",
    owner: "SEC.2",
    expected: "green",
    paid: false,
  },
  {
    id: "N3",
    journey: "new-visitor",
    asserts: "the held draft becomes a project with its preview in ≤ 20 s",
    owner: "ONB.1",
    expected: "green",
    paid: false,
  },
  {
    id: "N4",
    journey: "new-visitor",
    asserts:
      "the sheet's estimate/duration agree with the protocol card, the Timeline chip and the pricing cost card for the same draft",
    owner: "EST.1",
    expected: "green",
    paid: false,
  },
  // STB.5a — T9 sits FIRST among the paid steps: arming quiet hours on jrn-a before the weekly
  // leg's runs launch is what lets T14 observe this session's run_finished rows deferred to the
  // window's end (deliverInApp writes visible_at = the quiet end at delivery time).
  {
    id: "T9",
    journey: "both",
    asserts:
      "arming quiet hours on the funded test tenant persists (STB.5a BL-22 — the pre-step every other weekly run_finished delivery defers under)",
    owner: "STB.5a",
    expected: "green",
    paid: true,
    capUsd: 0.5,
  },
  {
    id: "N5",
    journey: "new-visitor",
    asserts: "the trial Review shows *Included* and runs to delivery without a cap death",
    owner: "ACT.1",
    expected: "green",
    paid: true,
    capUsd: 9.0,
  },
  {
    id: "N6",
    journey: "new-visitor",
    asserts:
      "the delivered dossier shows ≥ 1 fetched-✓ claim, and the planted error is *Contradicted* with its source",
    owner: "RES.1",
    expected: "red",
    paid: true,
    capUsd: 6.0,
    // R5ECON.2 (REQ-ECON-11) — a model-judgment leg: the planted-error verdict IS the assert, so the
    // cheap-route arm is pinned OFF for its launch regardless of the COGS_LEVERS_TEST default.
    cogsLevers: { testCheapRoute: false },
  },
  {
    id: "N7",
    journey: "both",
    asserts: "a dossier renders, including the Showcase dossier",
    owner: "HOT.1",
    expected: "green",
    paid: false,
  },
  {
    id: "N8",
    journey: "both",
    asserts:
      "editing a locked version forks to v(N+1) without a confirm and the edit saves (sync pill) — fresh import + a reviewed/frozen head on jrn-a",
    owner: "EDIT.1",
    expected: "green",
    paid: false,
  },
  {
    id: "N9",
    journey: "new-visitor",
    asserts: "Add credits / Buy / Choose Writer reach a Stripe-hosted page (no charge)",
    owner: "BILL.3",
    expected: "green",
    paid: false,
  },
  {
    id: "N10",
    journey: "new-visitor",
    asserts:
      "every public route carries a distinct branded title + description/OG/Twitter + favicon + exactly one <h1>; no 'private beta'/'1.x'/'coming soon' copy; signed-out /showcase renders the sample dossier",
    owner: "UX.1",
    expected: "green",
    paid: false,
  },
  {
    id: "N11",
    journey: "new-visitor",
    asserts:
      "on the golden-op-ed dossier every cited source URL carries a retrieval chip — fetched ✓ or the ADR-083 \"Search result\" label — with zero chip-less citations (claims table and findings evidence alike)",
    owner: "CITE.1",
    // CITE.1 — green 2026-10-06 (funded-window A2 redeploy, prod 476a0ed): the canonical-fold
    // fix (claimUrlViews folds claim_sources.normalized_url on read; delivery persists the
    // canonical form) shipped on the deployed images; the delivered Leg-3 dossier
    // /p/jrn-7e6d14996693-cite1/review/01M48YYS50Z6CNX517RJQXRCJ2 re-walked live — 7/7 cited
    // URLs chipped, 0 chip-less, 6/6 findings-evidence URLs stamped; persisted completeness
    // 7/7/0/0 matches. Evidence: docs/build/reports/2026-10-06_n11-reverify/ +
    // runs/FUNDED-2026-10-06-A.md §C.
    expected: "green",
    paid: true,
    capUsd: 6.5,
  },
  // ---- returning-user journey ---------------------------------------------
  {
    id: "R1",
    journey: "returning",
    asserts: "the project list shows the user's projects (Quiet expandable, visibly)",
    owner: "HOT.1",
    expected: "green",
    paid: false,
  },
  {
    id: "R4",
    journey: "returning",
    asserts: "a chat turn answers; Send is clickable at 1440×900 and at phone width",
    owner: "RUN.1",
    expected: "green",
    paid: true,
    capUsd: 0.5,
    // R5ECON.2 (REQ-ECON-11) — a model-judgment leg: the answer's quality IS the assert; the
    // cheap-route arm is pinned OFF for the turn's launch regardless of the COGS_LEVERS_TEST default.
    cogsLevers: { testCheapRoute: false },
  },
  {
    id: "R5",
    journey: "returning",
    asserts: "an export downloads",
    owner: "JOURNEY.1",
    expected: "green",
    paid: false,
  },
  {
    id: "R6",
    journey: "returning",
    asserts: "the run card's meter moves during a phase; the run report's spent = Σ debits",
    owner: "RPT.1",
    expected: "green",
    paid: true,
    capUsd: 4.5,
  },
  {
    // SPA.22 (REQ-VFY-10) — R6's render half as a FREE step on the seeded delivered run report
    // (`seedDeliveredRunReport` — the dossier fixture plus the ledger/metered facts the report
    // reads). The `run-report` surface gate could not exist until this landed (its weekly paid
    // holds R6/R9 stay). VERIF.1 — flipped green 2026-10-15 on the deployed tip `ffbb8ad`:
    // ready-to-flip twice (`2026-10-14_VERIF.1-surfaces` nonce 523e86229f04 +
    // `2026-10-15_VERIF.1-t13f-rerun`), both runs provenance-matched at $0.
    id: "R6F",
    journey: "both",
    asserts:
      "the seeded delivered run report renders its full Level-3 vocabulary — estimate/metered lines, reasoned differences, phase bars with real durations, seat split, flags, drivers, the claims line, the rate-table link — plus ?advanced=1's Level-4 usage rows",
    owner: "SPA.22",
    expected: "green",
    paid: false,
  },
  {
    id: "R7",
    journey: "returning",
    asserts: "an informational gate does not block; labels match behaviour",
    owner: "RUN.1",
    expected: "green",
    paid: false,
  },
  // SPA.11 — R8 split per-surface (REQ-VFY-8): each leg gates its own flag; the composite "R8"
  // id is gone. Owner stays UX.1 (a split never re-assigns ownership).
  {
    id: "R8.showcase",
    journey: "returning",
    asserts:
      "signed-in /showcase resolves to the workspace Showcase (or the static sample) — never another tenant's",
    owner: "UX.1",
    expected: "green",
    paid: false,
  },
  {
    id: "R8.prefs",
    journey: "returning",
    asserts:
      "Preferences lists only launched workflows — no unlaunched rows or unavailable-workflow copy",
    owner: "UX.1",
    expected: "green",
    paid: false,
  },
  {
    id: "R8.inbox",
    journey: "returning",
    asserts:
      "the Inbox waiting count equals its Needs-you rows and every row names its project",
    owner: "UX.1",
    expected: "green",
    paid: false,
  },
  {
    id: "R9",
    journey: "returning",
    asserts:
      "the delivered report's refund control is visible+enabled+unobscured; the click reports \"Refunded N cr.\" and spendable moves exactly +N; a second eligible request renders \"sent for review\" and moves nothing",
    owner: "DEF.4",
    // DEF.4 — green 2026-10-06 (funded window B): live prod walk on `fcbbc66` — leg A auto-refunded
    // 504 cr (spendable +504), leg B "sent for review" (pending_review row + alerted_at by the
    // stranded sweep). Evidence: docs/build/reports/2026-10-06_funded-b/ + runs/FUNDED-2026-10-06-A.md §B.6.
    expected: "green",
    paid: true,
    capUsd: 0.5,
  },
  {
    id: "R10",
    journey: "returning",
    asserts:
      "/app → click the project link → click a[data-project-item='versions'] → /p/:slug/v/working → Back is one document: every hop commits client-side (monotone data-nav-count, zero added document loads) and the warm return re-issues no /bff/p/:slug twin GET inside NAVC.3's freshness window",
    owner: "NAVC.4",
    // NAVC.4 — flips green on the first live leg over a deployed build carrying the NAVC.1–3 machinery.
    // VERIF.2 — flipped green 2026-10-16 on pr-186 @ e7b21aecb (ready-to-flip on two legs:
    // `2026-10-16_verif2/gates/` + `2026-10-16_verif2/seeded2/` — client-side hops, monotone
    // data-nav-count, no warm twin re-GET).
    expected: "green",
    paid: false,
  },
  {
    id: "R10.keepalive",
    journey: "returning",
    asserts:
      "leaving /p/:slug/v/working for /app and returning inside the 120 s idle TTL re-acquires the SAME data-page-session, and ⌘Z removes the synced marker typed before leaving — the preserved EditorState's undo stack, not a re-seeded view",
    owner: "NAVC.4",
    // NAVC.4 — flips green on the first live leg over a deployed build carrying NAVC.3's registry.
    // R6DEP.2 (2026-10-26): ready-to-flip → green — live on posture stage pr-219 @ e04a8c8
    // (session-owned UndoManager, F-R6POST.2-2): same data-page-session re-acquired inside the
    // TTL and ⌘Z removed the pre-leave synced marker (docs/build/reports/2026-10-26_R6DEP.2/posture/).
    expected: "green",
    paid: false,
  },
  // ---- STB.5a weekly paid riders (jrn-a; ride the weekly leg's own-tenant delivered Review) ----
  // These run AFTER R9 — the weekly sequence's own runs are what deliver the Review T10–T13 read
  // and the deferred run_finished rows T14 counts (T9 armed the window before N5).
  {
    id: "T10",
    journey: "both",
    asserts:
      "the own-tenant delivered Review renders all seven dossier parts (D-PRB.04-1's live half — letter, claim ledger with retrieval chips, second read, rubric, findings, trust chip, version obligations)",
    owner: "STB.5a",
    expected: "green",
    paid: true,
    capUsd: 0.5,
  },
  {
    id: "T11",
    journey: "both",
    asserts:
      "on the own-tenant dossier: the Margin's cards carry severity×kind marks, the Desk's shared filter narrows rows, a Desk finding link resolves to the card anchor, and /p/:slug/f/:fid lands the dossier at that finding (D-P1.07-1 surfaces)",
    owner: "STB.5a",
    expected: "green",
    paid: true,
    capUsd: 0.5,
  },
  {
    id: "T12",
    journey: "both",
    asserts:
      "a defer disposition + note round-trips across a reload, Add-to-obligations lands ?obligated, and a palette New obligation files a user row the export dialog's obligation summary lists (D-P1.07-1 writes)",
    owner: "STB.5a",
    expected: "green",
    paid: true,
    capUsd: 0.5,
  },
  {
    id: "T13",
    journey: "both",
    asserts:
      "Apply on a suggestion-bearing finding lands ?applied= and retracts its own control; a bulk action's preview shows the per-item checklist before the confirm lands ?bulkdone= (D-P1.07-1 — red while no suggestion-bearing finding exists)",
    owner: "STB.5a",
    expected: "green",
    paid: true,
    capUsd: 0.5,
  },
  {
    // SPA.21 (REQ-VFY-10) — T12's write legs as a FREE step on the seeded writable dossier
    // (`seedWritableDossier` — the Showcase fixture on a normal project, `showcaseReadOnlyGuard`-
    // exempt) instead of the weekly run's own-tenant Review. VERIF.1 — flipped green 2026-10-15
    // on the deployed tip `ffbb8ad`: ready-to-flip twice (`2026-10-14_VERIF.1-surfaces` +
    // `2026-10-15_VERIF.1-t13f-rerun`), provenance-matched at $0.
    id: "T12F",
    journey: "both",
    asserts:
      "on the seeded writable dossier: a defer disposition + note round-trips a reload, Add-to-obligations captures the POST status and waits the ?obligated notice attach (REQ-FIX-T12F — a repaint lag is never read as a missing notice), and /obligations/new files a user row the export summary lists (T12's free twin — the seeded-dossier sub-steps REQ-VFY-10 owed)",
    owner: "SPA.21",
    expected: "green",
    paid: false,
  },
  {
    // SPA.21 — T13's free twin on the same seeded dossier: the fixture's anchor finding carries a
    // suggestion, so the Apply + bulk-preview arms run deterministically at $0. VERIF.1 — flipped
    // green 2026-10-15 on `ffbb8ad` (`2026-10-15_VERIF.1-t13f-rerun3` ready-to-flip): the live leg
    // surfaced two harness defects this chain fixed (seed ids must be ULIDs — a UUID draftId
    // 500s the apply's revision.move_traced parse; the ?applied=/?bulkdone= notice reads needed
    // the REQ-FIX-T12F response-capture + attach-wait pattern).
    id: "T13F",
    journey: "both",
    asserts:
      "on the seeded writable dossier: Apply on the suggestion-bearing anchor finding lands ?applied= and retracts its control (the POST is captured and the applied notice is awaited — a repaint lag is never read as a missing notice); a bulk action's per-item checklist precedes the ?bulkdone= dispatch (T13's free twin — REQ-VFY-10)",
    owner: "SPA.21",
    expected: "green",
    paid: false,
  },
  {
    id: "T14",
    journey: "both",
    asserts:
      "the badge counts only open gates+decisions; an escalated decision row lands IMMEDIATELY inside quiet hours while this session's run_finished rows stay deferred to the window's end; a swept pre_export decision answers re-defer (re-parks) then drop (moots) (D-P1.19-1)",
    owner: "STB.5a",
    expected: "green",
    paid: true,
    capUsd: 0.5,
  },
  {
    id: "T15",
    journey: "both",
    asserts:
      "the seeded open approve_triage gate (waiting_gate run — seedOpenApprovalGate, no run launched) lists the Inbox row whose ?gate= deep link lands the focused card at the head of the artifact with live decide controls (D-P1.19-1 deep-link leg; D-CAP.1-1's named carrier — REQ-FIX-T15)",
    owner: "STB.5a",
    expected: "red",
    paid: true,
    capUsd: 0.5,
  },
  {
    id: "T16",
    journey: "both",
    asserts:
      "the no-profile negative, then a seeded persona_profiles snapshot + a real pasted sample lands the group-3 stale-voice row (samples_changed via the shared deriveVoiceStatus read — D-P1.19-1; the Monday-digest claim half stays clock-owed on D-FIX.1-4)",
    owner: "STB.5a",
    expected: "red",
    paid: true,
    capUsd: 0.5,
  },
  {
    id: "T17",
    journey: "both",
    asserts:
      "on a SPA-rendered Page the Source toggle swaps to a CodeMirror view seeded with the canonical markdown; typed text commits through the same ProseMirror doc and renders back after toggling (REQ-ED-17 — the toggle only exists on data-renderer=spa; SPA.28 deleted the SSR-pin channel, so every authenticated stage answers `spa` here; D-SPA.25-1). REQ-FIX-T17: the leg waits for [data-page-view] content before interacting — the mount attribute precedes the first block paint",
    // VERIF.1 — flipped green 2026-10-15 on `ffbb8ad` (`2026-10-14_VERIF.1-surfaces` ready-to-flip).
    owner: "SPA.25",
    expected: "green",
    paid: false,
  },
  // ---- phone-width reader ---------------------------------------------------
  // SPA.6 (REQ-VFY-8; design/27 F9) — P1 is SPLIT into per-surface legs so `--surface` can gate
  // exactly the legs a flip touches; `--steps P1` still selects the whole family by prefix.
  // The asserts/owners/green evidence carry over verbatim from the pre-split P1 row — the same
  // probes, partitioned (the composite's prod proof: run 4ff89a27d950 @6723784, UX.2 Stage B).
  {
    id: "P1.public",
    journey: "phone",
    asserts:
      "the anonymous surfaces (/, /pricing, /login) never overflow at 390/320 px; the pricing matrix scrolls inside a labelled keyboard-focusable region (never the page); 200% text zoom keeps the 390-px layout; axe clean",
    owner: "UX.2",
    expected: "green",
    paid: false,
  },
  {
    id: "P1.project",
    journey: "phone",
    asserts:
      "the project page at phone width (sec-ch-ua-mobile): no overflow, ≥44px primary targets / ≥24px floor, §10.1's desktop-capability set never mounts, axe clean",
    owner: "UX.2",
    expected: "green",
    paid: false,
  },
  {
    id: "P1.pill",
    journey: "phone",
    asserts:
      "the sync pill is in-flow at phone and 1440 — over no text, the composer, or the status bar; the phone Page carries the reader contract (data-readonly, no collab wire, no version rail, nothing editable)",
    owner: "UX.2",
    expected: "green",
    paid: false,
  },
  {
    id: "P1.runsheet",
    journey: "phone",
    asserts:
      "the run sheet at phone width renders the §10.1 capability note and never the run form; axe clean",
    owner: "UX.2",
    expected: "green",
    paid: false,
  },
  {
    // SPA.18 — VERIF.1 flipped green 2026-10-15 on `ffbb8ad` (`2026-10-14_VERIF.1-surfaces`
    // ready-to-flip, provenance-matched, $0).
    id: "P1.outline",
    journey: "phone",
    asserts:
      "/p/:p/outline + /outline/promote at phone width under either renderer: an existing outline renders read-only (no ed.* fields, no delete, no Save submit, no add-claim row — §10.1 verbatim) else the not-found arm; the promote sheet renders its fact rails + consent form or its own not-found arm — never a blank; overflow + axe clean",
    owner: "UX.2",
    expected: "green",
    paid: false,
  },
  {
    // SPA.19 — VERIF.1 flipped green 2026-10-15 on `ffbb8ad` (`2026-10-14_VERIF.1-surfaces`
    // ready-to-flip, provenance-matched, $0).
    id: "P1.figures",
    journey: "phone",
    asserts:
      "/p/:p/figures, /p/:p/figures/:id, and /p/:p/visualize at phone width under either renderer: the pane renders its rows or the designed empty arm; a missing card id lands the not-found arm; the sheet renders the consent form (request/specKind/insist/estimate) — ?request= prefills verbatim — or its own not-found arm; overflow + axe clean, never a blank",
    owner: "UX.2",
    expected: "green",
    paid: false,
  },
  {
    // SPA.21 — FIX.1 (REQ-FIX-P1D): the leg rides a real mobile userAgent context (injected
    // UA-CH headers lost to Chromium's desktop hint) and asserts the document's own phone
    // classification — data-ssr-cause="phone" on the forced-SSR verdict or data-device="phone"
    // on a shell — BEFORE the §10.1 capability sweep. VERIF.1 correction: the dossier route is
    // sole-renderer SPA (SPA.27 — the REQ-ED-12 forced-SSR set is the five Page-family GETs), so
    // the phone verdict there IS `data-renderer="spa"` + `data-device="phone"`; flipped green
    // 2026-10-15 on `ffbb8ad` (`2026-10-15_VERIF.1-dfix12-rerun` ready-to-flip).
    id: "P1.dossier",
    journey: "phone",
    asserts:
      "the dossier (/p/:p/review/:runId via /showcase) at phone width: the document self-classifies phone (data-ssr-cause='phone' / data-device='phone') BEFORE the capability sweep, then the letter arm + finding cards render and the §10.1 boundary holds (no bulk controls, no [data-apply] desk affordance mounts), overflow + axe clean, never a blank",
    owner: "UX.2",
    expected: "green",
    paid: false,
  },
  {
    id: "P1.app-new",
    journey: "phone",
    asserts:
      "R7HOME.2b — the sidebar's New-project click mints a blank project and lands on its Page at 1440×900: the focused inline 'Untitled' title (no dialog, no duplicate heading), the empty Page's affordance row, axe clean",
    owner: "UX.2",
    expected: "green",
    paid: false,
  },
  // ---- claims parity ---------------------------------------------------------
  {
    id: "C1",
    journey: "both",
    asserts: "landing/pricing/trial claims equal the entitlement config and the estimator",
    owner: "ACT.1",
    expected: "green",
    paid: false,
  },
  // ---- two-tenant isolation ----------------------------------------------------
  // SPA.6 (REQ-VFY-8; design/27 F9) — X1 is SPLIT per surface for the same gating reason;
  // `--steps X1` selects the family by prefix. The planted fixture (a nonce voice + a nonce
  // scratch project on tenant A) is shared across the legs inside one run.
  {
    id: "X1.voices",
    journey: "two-tenants",
    asserts: "tenant B's /voices carries none of tenant A's markers (voice/project/ slug)",
    owner: "SEC.1",
    expected: "green",
    paid: false,
  },
  {
    id: "X1.usage",
    journey: "two-tenants",
    asserts: "tenant B's /usage carries none of tenant A's markers",
    owner: "SEC.1",
    expected: "green",
    paid: false,
  },
  {
    id: "X1.home",
    journey: "two-tenants",
    asserts: "tenant B's /app project list carries none of tenant A's markers",
    owner: "SEC.1",
    expected: "green",
    paid: false,
  },
  {
    id: "X1.inbox",
    journey: "two-tenants",
    asserts: "tenant B's /app/inbox carries none of tenant A's markers",
    owner: "SEC.1",
    expected: "green",
    paid: false,
  },
  {
    id: "X1.detail",
    journey: "two-tenants",
    asserts: "tenant B cannot open tenant A's /p/<slug> document (≥400 or no marker content)",
    owner: "SEC.1",
    expected: "green",
    paid: false,
  },
  // ---- STB.5a nightly $0 legs (BL-21/BL-22's free surface — fresh test tenants) ---------------
  {
    id: "T1",
    journey: "both",
    asserts:
      "the seeded Showcase dossier renders all seven D-PRB.04-1 parts signed-in (letter, claim ledger with retrieval chips, second read, rubric, findings, trust chip, version obligations)",
    owner: "STB.5a",
    expected: "green",
    paid: false,
  },
  // SPA.11 — T2 split per-surface (REQ-VFY-8): `inbox` gates on T2.badge, `settings` on T2.matrix;
  // the composite "T2" id is gone. Owner stays STB.5a.
  {
    id: "T2.badge",
    journey: "both",
    asserts:
      "the Inbox badge equals its rendered Needs-you rows and every row carries an open link",
    owner: "STB.5a",
    expected: "green",
    paid: false,
  },
  {
    id: "T2.matrix",
    journey: "both",
    asserts:
      "the notification matrix + quiet-hours controls render actionable (D-P1.19-1's free half)",
    owner: "STB.5a",
    expected: "green",
    paid: false,
  },
  {
    id: "T3",
    journey: "both",
    asserts:
      "the account zip exports → the in-app download AND the real emailed token link resolve to the same zip → a FRESH account's import restores the project+voice → the re-import reports deduped; the zip carries no protocol marker (D-P1.18-1c/d + REQ-ARCH-33). Flipped green 2026-10-06 on the deployed tip fcbbc66 (nonce 6c268536d58b): CAP.3's D-STB.5a-1 system-pool token lookup → the emailed link 302s to the presigned zip, and D-STB.5a-2's slug deconflict → notice=imported parity + re-import deduped",
    owner: "STB.5a",
    expected: "green",
    paid: false,
  },
  {
    id: "T4",
    journey: "both",
    asserts:
      "a project carrying a CSL-JSON bibliography exports md with the rendered citation (no raw [@key] token) and no protocol marker (D-P1.18-1b citeproc leg + REQ-ARCH-33)",
    owner: "STB.5a",
    expected: "green",
    paid: false,
  },
  {
    id: "T5",
    journey: "both",
    asserts:
      "a substack_export connection syncs the committed export zip, and the re-sync produces ZERO new sample_versions (D-P1.15-1's AC-I-A — the content-hash change key dedups)",
    owner: "STB.5a",
    expected: "green",
    paid: false,
  },
  {
    id: "T6",
    journey: "both",
    asserts:
      "a deleted project lands in the deleted-projects section with an actionable Restore and leaves the live list (D-P1.04-2's tombstone half)",
    owner: "STB.5a",
    expected: "green",
    paid: false,
  },
  {
    id: "T7",
    journey: "both",
    asserts:
      "the delete enqueues a pgboss project.purge job start_after tombstone+30d, singleton-keyed on the project — read via migration 0058's rhema_project_purge_schedule probe on the app role (D-P1.04-2's schedule half; the live-destruction half stays clock-owed). Flipped green 2026-10-06 on the deployed tip fcbbc66 (nonce 6c268536d58b): the probe returns the singleton-keyed row under JOURNEY_DATABASE_URL bound to rhema_app_login",
    owner: "STB.5a",
    expected: "green",
    paid: false,
  },
  {
    id: "T8",
    journey: "both",
    asserts:
      "the export token gate answers 404 to a bogus token, and — when JOURNEY_T8_EXPORT_TOKEN binds a backdated mint (scripts/live/mint-t8-export.mjs, operator-run) — a real 410 export_link_expired (FIX.1's un-owed arm; the mint itself stays operator-gated). Flipped green 2026-10-22 on the deployed tip dc7fb15a (R6POST.1, nonce dac7c118bf38): mint-t8-export.mjs --execute wrote t8exp_1f9832c4b64d445498f4 on the flagged jrn-a tenant (GD-PREAUTH-ACTS.R6); the leg answered 404 to the bogus token and 410 export_link_expired to the minted one — reports/2026-10-22_R6POST.1/journeys-full",
    owner: "STB.5a",
    expected: "green",
    paid: false,
  },
  // ---- STB.5b bounded paid live legs (BL-16–19; cheapest-first order) -------------------------
  // All start `red`: a leg that lands its live asserts flips green with evidence in its own PR;
  // a leg refused/blocked/unexercised reports owed. Per-leg caps are declared on the rows below
  // (REQ-ECON-9 — the registry is the cap authority; `capUsd` is the §5.3 table verbatim).
  {
    id: "B16",
    journey: "both",
    asserts:
      "a pinned `phase:'4'` review with NO `sidecar` input commits exactly the craft phase (one done step, `.rhema/phase-result.json` written, frozen inputs show sidecar absent + the phase pin) then stops `completed` (BL-16; D-P0.03-2, D-P0.03-3 residual)",
    owner: "STB.5b",
    expected: "green",
    paid: true,
    capUsd: 0.5,
  },
  {
    id: "B17",
    journey: "both",
    asserts:
      "a post-commit replay subscriber sees the run's high-water seq and the live tail saw the commit event — Postgres run_events stays the source of truth (BL-17b; D-P0.08b-2). BL-17a's audit-cap leg is reported unreachable-by-construction (ITERATION_CAPS.{audit,gapCheck} have no consumer; completed_partial is a run state, never a step state)",
    owner: "STB.5b",
    expected: "red",
    paid: true,
    capUsd: 1.0,
  },
  {
    id: "B18A",
    journey: "both",
    asserts:
      "a full_board review pinned to verification lands kind='fetch' allow rows in fetch_log joined to the run (BL-18a's provable half). The fetchViaFetcher-binding half is reported unreachable on this leg — the fetcher client is granted to holdout-calibrator only; a review's fetch rides the server-tool path (D-PRB.02-3)",
    owner: "STB.5b",
    expected: "red",
    paid: true,
    capUsd: 1.0,
  },
  {
    id: "B18B",
    journey: "both",
    asserts:
      "a memo-protocol run freezes urlPolicy{fetchUserDataForbidden, userSourceDomains}; a fetch attempt at the user-source host is denied pre-forward (deny row + user_source_fetch pause); zero fetch_log rows carry the source's content (BL-18b; D-P1.21-2)",
    owner: "STB.5b",
    expected: "red",
    paid: true,
    capUsd: 1.0,
  },
  {
    id: "B19A",
    journey: "both",
    asserts:
      "a Quick non-preview draft run opens approve_plan; a structured `edit` decision lands user-authored 02-structure-plan.{md,json} overlay versions, the next phase commits on them, and the run delivers (BL-19a; D-P0.15-3, D-P1.10-1)",
    owner: "STB.5b",
    expected: "red",
    paid: true,
    capUsd: 3.5,
  },
  {
    id: "B19B",
    journey: "both",
    asserts:
      "an outline promotion run opens approve_outline; a structured `edit` lands overlay versions on agents/author/outline/<slug>.{md,json}, the run finalizes delivered with the promoted outline artifact and the outline.approved event (BL-19b; D-P1.12-1)",
    owner: "STB.5b",
    expected: "red",
    paid: true,
    capUsd: 1.5,
  },
  {
    id: "B19C",
    journey: "both",
    asserts:
      "a full-tier profile_voice build opens approve_sample and exercises the calibration/hold-out legs — pre-registered DROP within the ≤$25/≈$12 envelope (~$15 alone); stays owed on D-P1.14-1 until a funded window carries it",
    owner: "STB.5b",
    expected: "red",
    paid: true,
    capUsd: 15.0,
    // R5ECON.2 (REQ-ECON-11) — the MANDATORY opt-out: the leg's assert object is the FULL tier's
    // model judgment, so `testCheapRoute` is pinned OFF. The pin is declared now so the driver the
    // funded window eventually runs MUST post it (`cogsLeversFor` is the read seam).
    cogsLevers: { testCheapRoute: false },
  },
  // ---- round 7 (R7OPEN.1; REQ-DACC-8) — every D*/U* leg + the two sub-assertions ----------
  // All enter `expected:"red"`, `paid:false`, each with a wired owed-stub (r7legs.ts) that fails
  // loudly — the nightly reports `owed`, never a run failure, and a leg can never "pass" before
  // its owner lands the real body (spec §4.17/§10; RV-13). One owner per row; the phase deploys
  // (224 R7a, 250 R7b) and 248 (D2.tour only, P4-23) are the sanctioned flippers under
  // GD-PREVIEW.R7 — the nightly runs `main`'s registry against prod and no owner has a preview.
  {
    id: "D1.hub",
    journey: "new-visitor",
    asserts:
      "/demo meets N10's public-page invariants (distinct title, one <h1>, meta, favicon); the four essay cards are visible and actionable; the persistent provenance banner renders; the landing + /showcase entry links resolve to /demo (REQ-TOUR-1/8, REQ-DACC-1)",
    owner: "R7DEM.5b",
    expected: "green",
    paid: false,
  },
  {
    id: "D2.tour",
    journey: "new-visitor",
    asserts:
      "the full guided tour on Structure of Political Difference end to end: each coach mark visible with its DOM-contract target un-occluded, Next/Back actionable, the route change through the expected mechanism, and the final CTA → /signup?src=demo (REQ-TOUR-2, REQ-DACC-2; 248 R7TOUR.2 is the sanctioned re-flipper, P4-23)",
    owner: "R7DEM.6a",
    expected: "green",
    paid: false,
  },
  {
    id: "D3.readonly",
    journey: "both",
    asserts:
      "demo pages make zero same-origin non-GET requests except the REQ-TOUR-9 POST, open no EventSource/WebSocket, serve no 4xx/5xx, and mount no mutation forms or contenteditable (REQ-DACC-3, REQ-DWEB-14)",
    owner: "R7DEM.5",
    expected: "green",
    paid: false,
  },
  {
    id: "P1.demo",
    journey: "phone",
    asserts:
      "demo Pages at 390 and 320 px: no overflow, axe clean, the SPA-compact render holds and REQ-UX-10's desktop-capability subtree never mounts (REQ-DACC-4 restated — NOT the phone reader contract)",
    owner: "R7DEM.4b",
    expected: "green",
    paid: false,
  },
  {
    // R7OPEN.1 picked `R11.demo` — the next free R number + `.demo` (spec §10's "R*.demo" leg).
    id: "R11.demo",
    journey: "returning",
    asserts:
      "signed-in /demo renders the same content as the logged-out walk (returningUser('a'), never a fresh signup — cohort hygiene per R4 §6) (REQ-DACC-5)",
    owner: "R7DEM.4b",
    expected: "green",
    paid: false,
  },
  {
    id: "U1.shell",
    journey: "returning",
    asserts:
      "one AppShell wraps every authenticated leaf: the persistent collapsible left sidebar carries wordmark/New project/Search/recents/Inbox(badge)/Voices/Usage/Settings/Demo/account menu, and pending/error/404 states render inside it (REQ-SHELL-1/2, REQ-DACC-7)",
    owner: "R7SHELL.1a",
    expected: "red",
    paid: false,
  },
  {
    id: "U2.noreload",
    journey: "returning",
    asserts:
      "the scripted walk list → project → dossier → compare → export → settings → inbox → chat send → gate approve → Showcase → back performs zero document loads (navigation entries stay 1, the window marker persists; S-14's named document navigations excluded) (REQ-RELOAD-6/REQ-GUARD-3, REQ-DACC-7)",
    owner: "R7RELOAD.1",
    expected: "red",
    paid: false,
  },
  {
    id: "U3.occlusion",
    journey: "returning",
    asserts:
      "at 1440×900, 1280×800, 1024×768, 820×1180 and 390×844 emulated: zero intersection between the Page text column / dossier letter column / tour targets and any un-scrimmed panel, and no main column below 45 ch at ≥768 px (REQ-PANE-4/REQ-GUARD-4, REQ-DACC-7)",
    owner: "R7PANE.1",
    expected: "red",
    paid: false,
  },
  {
    id: "U4.controls",
    journey: "returning",
    asserts:
      "the computed-style probe finds zero native-styled buttons/inputs/selects/textareas on the 12 migrated surfaces (REQ-GUARD-1, REQ-DACC-7)",
    owner: "R7KIT.3e",
    expected: "red",
    paid: false,
  },
  {
    id: "U5.write",
    journey: "returning",
    asserts:
      "new project → inline title → type in the blank Page → format bubble above the selection → comment lands anchored Guidance → focus mode in/out → source toggle (REQ-WRITE-1/2/4/5, REQ-HOME-3; REQ-DACC-7)",
    owner: "R7WRITE.1b",
    expected: "red",
    paid: false,
  },
  {
    // P4-25: U6 is NEVER a paid:true row — the one manual paid run is R7DEP.2's act (CLI one-shot
    // or the updated R4 leg). This free leg drives a stubbed turn only.
    id: "U6.chat",
    journey: "returning",
    asserts:
      "a stubbed chat turn returns the JSON 201 with its turn id, progress events stream over the run-event channel with no document reload, and the reply renders on completion (REQ-TALK-3, REQ-DACC-7)",
    owner: "R7TALK.1a",
    expected: "red",
    paid: false,
  },
  {
    id: "U7.import",
    journey: "returning",
    asserts:
      "pasting markdown with a leading # H1 keeps the H1 as the title, the typeset preview lists any normalization in Conversion notes, and the imported draft is immediately editable (REQ-HOME-4/5, REQ-DACC-7)",
    owner: "R7HOME.2a",
    expected: "red",
    paid: false,
  },
  {
    // Sub-assertion: the R7a stopgap probe — REQ-PANE-0 needs R7a browser evidence while U3's
    // owner is R7b. GREEN 2026-11-05 on pr-259 @ 18a0df79 (R7FIX.2 — the desk-head/statusbar
    // stacking fix); proof docs/build/reports/2026-11-05_R7FIX.2/ (all four widths).
    id: "U3.stopgap",
    journey: "returning",
    asserts:
      "the stopgap geometry: the 1024–1279 overlay and the <1024 sheet carry a scrim + Esc/outside-click dismiss, are closed by default and never persisted from overlay mode, the page column reflows at ≥1280 with Files open, and the Desk head is never occluded by the status bar (REQ-PANE-0)",
    owner: "R7FIX.1",
    expected: "green",
    paid: false,
  },
  {
    // Sub-assertion: the SPA renderer re-expectation for the signed-in Showcase (REQ-DACC-6) —
    // GREEN 2026-11-05 on pr-259 @ 18a0df79 (R7FIX.2 — the same-location commit fix; the dossier
    // self-link now commits a real in-document transition); the existing green R8.showcase row
    // is untouched.
    id: "R8.showcase.spa",
    journey: "returning",
    asserts:
      "the signed-in Showcase resolves to the workspace Showcase rendered data-renderer=\"spa\" (REQ-DACC-6, REQ-RELOAD-5 — the ReadOnlyProject SPA arm)",
    owner: "R7RO.1",
    expected: "green",
    paid: false,
  },
];

export function stepById(id: string): JourneyStep | undefined {
  return STEP_REGISTRY.find((s) => s.id === id);
}

/**
 * R5ECON.2 (REQ-ECON-11) — the registry's declared lever pin for a step (e.g.
 * `{testCheapRoute:false}` on the N6/R4/B19C model-judgment legs). Every launch the step performs
 * MUST carry this pin — posted as `cogsLevers` (JSON launch bodies) or the same-named form field —
 * and the api honors it only on `is_test` workspaces, exactly the opt-out channel REQ-ECON-10's
 * test-scoped default defines over. `undefined` ⇒ the leg has no pin; the tenant default applies.
 */
export function cogsLeversFor(stepId: string): Readonly<Record<string, boolean>> | undefined {
  return stepById(stepId)?.cogsLevers;
}

/**
 * R5ECON.3 (REQ-ECON-9) — the step's declared per-leg metered-USD cap (the §5.3 table verbatim —
 * levered-expected basis, unlevered-measured fallback, $0.50 floor on the no-own-spend riders).
 * `undefined` ⇒ the step declares no cap — a registry error on any paid step (the funded-window
 * dispatch and the `--paid` CLI both refuse to run an uncapped paid leg).
 */
export function legCapUsdFor(stepId: string): number | undefined {
  return stepById(stepId)?.capUsd;
}
