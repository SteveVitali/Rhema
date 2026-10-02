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
    expected: "red",
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
    expected: "red",
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
    asserts: "editing a locked version forks to v(N+1) and the edit saves (sync pill)",
    owner: "EDIT.1",
    expected: "red",
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
    expected: "red",
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
    expected: "red",
    paid: false,
  },
  // ---- phone-width reader ---------------------------------------------------
  {
    id: "P1",
    journey: "phone",
    asserts:
      "project page / run sheet / pricing without horizontal overflow; primary actions are buttons ≥ 44 px",
    owner: "UX.2",
    expected: "red",
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
