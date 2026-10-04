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
    // CITE.1 — red until Stage B runs Leg 3 (the ≤$4 weekly-capped paid leg) and commits the
    // dossier screenshot; the runner's post-step PNG is the AC8 evidence.
    expected: "red",
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
  {
    id: "R8",
    journey: "returning",
    asserts:
      "signed-in /showcase resolves to the workspace Showcase (or the static sample); Preferences lists only launched workflows; the Inbox waiting count equals its Needs-you rows and every row names its project",
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
    // DEF.4 — red until Stage B flips `refundWindow` to `test_tenants` on the evidence deploy and
    // the journey walks it green ($≤3 total; two Quick/Base runs on the planted excerpt).
    expected: "red",
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
    expected: "red",
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
  {
    id: "P1",
    journey: "phone",
    asserts:
      "no horizontal overflow at 390/320 px (pricing matrix scrolls inside its labelled region, never the page); phone controls ≥ 44 px primaries / ≥ 24 px all; §10.1's desktop-only set never renders on phone; the sync pill is in-flow — over no text, the composer, or the status bar; /app/new styled at 1440×900; axe WCAG 2.2 AA clean on every touched surface",
    owner: "UX.2",
    // UX.2 Stage B: flipped green on prod proof — run 4ff89a27d950 against chain-tip 6723784
    // (provenance matched on web+api healthz; $0 spend; docs/build/reports/UX.2/report.json).
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
  {
    id: "X1",
    journey: "two-tenants",
    asserts: "no foreign rows on /voices, /usage, project list, dossier, Inbox (API probe + journey)",
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
  {
    id: "T2",
    journey: "both",
    asserts:
      "the Inbox badge equals its rendered Needs-you rows, every row carries an open link, and the notification matrix + quiet-hours controls render actionable (D-P1.19-1's free half)",
    owner: "STB.5a",
    expected: "green",
    paid: false,
  },
  {
    id: "T3",
    journey: "both",
    asserts:
      "the account zip exports → the in-app download AND the real emailed token link resolve to the same zip → a FRESH account's import restores the project+voice → the re-import reports deduped; the zip carries no protocol marker (D-P1.18-1c/d + REQ-ARCH-33). Red on two live defects the leg exposed: D-STB.5a-1 (the anonymous /export/download token lookup runs unscoped against FORCE-RLS account_exports → 404 for every valid token) and D-STB.5a-2 (importAccountZip → artifacts_project_id_fkey 500 — the seed showcase slug collides, the skipped row's mapped id orphans its artifacts)",
    owner: "STB.5a",
    expected: "red",
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
      "the delete enqueues a pgboss project.purge job start_after tombstone+30d, singleton-keyed on the project (D-P1.04-2's schedule half — owed: the app-login role has no pgboss schema grant, needs a system-scoped JOURNEY_DATABASE_URL or a pgboss.job SELECT grant; the live-destruction half is clock-owed)",
    owner: "STB.5a",
    expected: "red",
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
];

export function stepById(id: string): JourneyStep | undefined {
  return STEP_REGISTRY.find((s) => s.id === id);
}
