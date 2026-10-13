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
];

export function stepById(id: string): JourneyStep | undefined {
  return STEP_REGISTRY.find((s) => s.id === id);
}
