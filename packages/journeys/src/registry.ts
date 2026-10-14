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
  },
  {
    id: "N5",
    journey: "new-visitor",
    asserts: "the trial Review shows *Included* and runs to delivery without a cap death",
    owner: "ACT.1",
    expected: "green",
    paid: true,
  },
  {
    id: "N6",
    journey: "new-visitor",
    asserts:
      "the delivered dossier shows ≥ 1 fetched-✓ claim, and the planted error is *Contradicted* with its source",
    owner: "RES.1",
    expected: "red",
    paid: true,
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
  },
  {
    id: "T11",
    journey: "both",
    asserts:
      "on the own-tenant dossier: the Margin's cards carry severity×kind marks, the Desk's shared filter narrows rows, a Desk finding link resolves to the card anchor, and /p/:slug/f/:fid lands the dossier at that finding (D-P1.07-1 surfaces)",
    owner: "STB.5a",
    expected: "green",
    paid: true,
  },
  {
    id: "T12",
    journey: "both",
    asserts:
      "a defer disposition + note round-trips across a reload, Add-to-obligations lands ?obligated, and a palette New obligation files a user row the export dialog's obligation summary lists (D-P1.07-1 writes)",
    owner: "STB.5a",
    expected: "green",
    paid: true,
  },
  {
    id: "T13",
    journey: "both",
    asserts:
      "Apply on a suggestion-bearing finding lands ?applied= and retracts its own control; a bulk action's preview shows the per-item checklist before the confirm lands ?bulkdone= (D-P1.07-1 — red while no suggestion-bearing finding exists)",
    owner: "STB.5a",
    expected: "green",
    paid: true,
  },
  {
    id: "T14",
    journey: "both",
    asserts:
      "the badge counts only open gates+decisions; an escalated decision row lands IMMEDIATELY inside quiet hours while this session's run_finished rows stay deferred to the window's end; a swept pre_export decision answers re-defer (re-parks) then drop (moots) (D-P1.19-1)",
    owner: "STB.5a",
    expected: "green",
    paid: true,
  },
  {
    id: "T15",
    journey: "both",
    asserts:
      "an open approval's Inbox row lands the focused ?gate= card at the head of the artifact with live decide controls (D-P1.19-1 deep-link leg — owed while no open gate exists)",
    owner: "STB.5a",
    expected: "red",
    paid: true,
  },
  {
    id: "T16",
    journey: "both",
    asserts:
      "a fact change on a profiled persona lands a group-3 stale-voice row and the digest claims it once (D-P1.19-1 — owed: no test tenant carries persona_profiles; asserts the no-profile negative today)",
    owner: "STB.5a",
    expected: "red",
    paid: true,
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
    id: "P1.app-new",
    journey: "phone",
    asserts:
      "/app/new at 1440×900 renders the styled workspace chrome — no IDE frame, the three entry cards, axe clean",
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
      "the export token gate answers 404 to a bogus token (the 410 expired-link half is owed — the 26h test-tenant purge deletes the row before its 7-day expiry can ever fire)",
    owner: "STB.5a",
    expected: "red",
    paid: false,
  },
  // ---- STB.5b bounded paid live legs (BL-16–19; cheapest-first order) -------------------------
  // All start `red`: a leg that lands its live asserts flips green with evidence in its own PR;
  // a leg refused/blocked/unexercised reports owed. Per-leg caps: stb5b-helpers.STB5B_CAPS.
  {
    id: "B16",
    journey: "both",
    asserts:
      "a pinned `phase:'4'` review with NO `sidecar` input commits exactly the craft phase (one done step, `.rhema/phase-result.json` written, frozen inputs show sidecar absent + the phase pin) then stops `completed` (BL-16; D-P0.03-2, D-P0.03-3 residual)",
    owner: "STB.5b",
    expected: "green",
    paid: true,
  },
  {
    id: "B17",
    journey: "both",
    asserts:
      "a post-commit replay subscriber sees the run's high-water seq and the live tail saw the commit event — Postgres run_events stays the source of truth (BL-17b; D-P0.08b-2). BL-17a's audit-cap leg is reported unreachable-by-construction (ITERATION_CAPS.{audit,gapCheck} have no consumer; completed_partial is a run state, never a step state)",
    owner: "STB.5b",
    expected: "red",
    paid: true,
  },
  {
    id: "B18A",
    journey: "both",
    asserts:
      "a full_board review pinned to verification lands kind='fetch' allow rows in fetch_log joined to the run (BL-18a's provable half). The fetchViaFetcher-binding half is reported unreachable on this leg — the fetcher client is granted to holdout-calibrator only; a review's fetch rides the server-tool path (D-PRB.02-3)",
    owner: "STB.5b",
    expected: "red",
    paid: true,
  },
  {
    id: "B18B",
    journey: "both",
    asserts:
      "a memo-protocol run freezes urlPolicy{fetchUserDataForbidden, userSourceDomains}; a fetch attempt at the user-source host is denied pre-forward (deny row + user_source_fetch pause); zero fetch_log rows carry the source's content (BL-18b; D-P1.21-2)",
    owner: "STB.5b",
    expected: "red",
    paid: true,
  },
  {
    id: "B19A",
    journey: "both",
    asserts:
      "a Quick non-preview draft run opens approve_plan; a structured `edit` decision lands user-authored 02-structure-plan.{md,json} overlay versions, the next phase commits on them, and the run delivers (BL-19a; D-P0.15-3, D-P1.10-1)",
    owner: "STB.5b",
    expected: "red",
    paid: true,
  },
  {
    id: "B19B",
    journey: "both",
    asserts:
      "an outline promotion run opens approve_outline; a structured `edit` lands overlay versions on agents/author/outline/<slug>.{md,json}, the run finalizes delivered with the promoted outline artifact and the outline.approved event (BL-19b; D-P1.12-1)",
    owner: "STB.5b",
    expected: "red",
    paid: true,
  },
  {
    id: "B19C",
    journey: "both",
    asserts:
      "a full-tier profile_voice build opens approve_sample and exercises the calibration/hold-out legs — pre-registered DROP within the ≤$25/≈$12 envelope (~$15 alone); stays owed on D-P1.14-1 until a funded window carries it",
    owner: "STB.5b",
    expected: "red",
    paid: true,
  },
];

export function stepById(id: string): JourneyStep | undefined {
  return STEP_REGISTRY.find((s) => s.id === id);
}
