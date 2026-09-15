import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { GateKind } from "@rhema/contracts";
import { REASON_CODES } from "@rhema/contracts";
import { buildGateCard, type GateCardFacts } from "@rhema/findings-core";
import {
  DispositionControls,
  GateCard,
  TriageLedger,
  DecisionsList,
  type DispositionControlsLabels,
  type GateCardLabels,
  type TriageLedgerLabels,
  type DecisionsListLabels,
} from "./index.js";

// PRB.05 — the triage write surfaces' DOM (§5.7/§6.4/§10.1). Static-markup assertions: the five verbs,
// the note, the optional reason chips, the gate-card anatomy for every beta kind, the presence timer, the
// phone-width input sets (AC5/AC6; REQ-BETA-6, REQ-SPEC-18/20).

const dispositionLabels: DispositionControlsLabels = {
  verbLabel: (v) => `V:${v}`,
  noteLabel: "Note — required for Rebut and Escalate",
  notePlaceholder: "Not this round",
  reasonLegend: "Why? (optional)",
  reasonLabel: (c) => `R:${c}`,
  adaptLabel: "Proposed edit",
  appliedNote: "applies at revision time",
};

const gateLabels: GateCardLabels = {
  kindLabel: (k) => `K:${k}`,
  approveLabel: (k) => (k === "approve_triage" ? "Approve proposals" : "Approve"),
  approveAutonomousLabel: "Approve and run autonomously",
  keepPlanningLabel: "Edit guidance / keep planning",
  waitLabel: "Wait for me",
  stopLabel: "Stop",
  waitingLine: "Waiting for you — no deadline.",
  deadlineLine: (abs, rem) => `Due ${abs} · ${rem}`,
  expiredLine: "Overdue.",
  doNothingLine: (o) => `If you do nothing: ${o}.`,
  spendLine: (s, c, r) => `Spent ${s} · cap ${c} · ${r ?? "—"}`,
  presenceLine: (cd) => `Proceeding in ${cd} unless you say otherwise.`,
  pausedNote: "Paused while you read.",
  heldLine: "Waiting for you — the deadline is cleared.",
  guidanceLabel: "Add guidance for the run",
  standingLabel: "…and remember this for this project",
  informationalNote: "Informational — the run continues while you read.",
  escalationNote: "Escalations are decided only by you.",
};

const ledgerLabels: TriageLedgerLabels = {
  dispositionLabel: (k) => k ?? "Undecided",
  userActorLabel: "by you",
  severityLabel: (s) => s,
};

const decisionsLabels: DecisionsListLabels = {
  heading: "Decisions",
  emptyLabel: "Nothing waiting.",
  optionLabel: (o) => o,
};

const NOW = new Date("2026-09-16T12:00:00Z");

function gateFacts(over: Partial<GateCardFacts>): GateCardFacts {
  return {
    kind: "approve_triage",
    onExpiry: "wait",
    blocking: true,
    held: false,
    openedAt: "2026-09-16T10:00:00Z",
    deadlineAt: null,
    presenceDeadlineAt: null,
    pausedWhileReading: false,
    spentCredits: 120,
    capCredits: 840,
    ...over,
  };
}

// ---------- DispositionControls (§5.7) ----------

describe("DispositionControls — the five verbs + note + optional reason chips (AC5)", () => {
  it("renders all five verbs, a note field, and every reason chip", () => {
    const html = renderToStaticMarkup(
      <DispositionControls formAction="/p/x/review/r/findings/f1/disposition" labels={dispositionLabels} />,
    );
    for (const verb of ["accept", "adapt", "rebut", "defer", "escalate"]) {
      expect(html).toContain(`data-verb="${verb}"`);
      expect(html).toContain(`value="${verb}"`);
    }
    expect(html).toContain('name="note"');
    expect(html).toContain('placeholder="Not this round"');
    for (const code of REASON_CODES) {
      expect(html).toContain(`data-reason-chip="${code}"`);
      expect(html).toContain(`value="${code}"`);
    }
    // reason chips are radios — optional, nothing pre-checked.
    expect(html).not.toContain('checked=""');
  });

  it("marks the current disposition's verb selected and pre-fills its note + chip (reversible)", () => {
    const html = renderToStaticMarkup(
      <DispositionControls
        formAction="/x"
        labels={dispositionLabels}
        current={{ kind: "rebut", rationale: "disagree", reasonCode: "wrong" }}
      />,
    );
    expect(html).toContain('data-verb="rebut" data-selected="true"');
    expect(html).toContain('value="disagree"');
    expect(html).toContain('checked=""'); // the "wrong" chip is pre-checked
    expect(html).toContain('data-reason-chip="wrong"');
  });

  it("opens the editable suggestion for adapt (pre-filled), absent without a suggestion", () => {
    const withSug = renderToStaticMarkup(
      <DispositionControls formAction="/x" labels={dispositionLabels} suggestion="the fixed wording" />,
    );
    expect(withSug).toContain('name="adapted_text"');
    expect(withSug).toContain("the fixed wording");
    const without = renderToStaticMarkup(
      <DispositionControls formAction="/x" labels={dispositionLabels} />,
    );
    expect(without).not.toContain('name="adapted_text"');
  });

  it("compact (phone-width): the same five verbs + a note, stacked — never a bulk action", () => {
    const html = renderToStaticMarkup(
      <DispositionControls formAction="/x" labels={dispositionLabels} compact />,
    );
    expect(html).toContain('data-compact="true"');
    for (const verb of ["accept", "adapt", "rebut", "defer", "escalate"]) {
      expect(html).toContain(`data-verb="${verb}"`);
    }
    expect(html).toContain('name="note"');
    expect(html).not.toContain("bulk");
  });

  it("surfaces a validation error under the control (the 422 round-trip)", () => {
    const html = renderToStaticMarkup(
      <DispositionControls formAction="/x" labels={dispositionLabels} error="a rationale is required for rebut" />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("a rationale is required for rebut");
  });
});

// ---------- GateCard (§6.4) ----------

const BETA_GATE_KINDS: GateKind[] = [
  "approve_triage",
  "approve_scope",
  "approve_sample",
  "confirm_cost",
  "spend_overrun",
  "resume_partial",
  "refusal",
];

describe("GateCard — one component for every beta gate kind", () => {
  for (const kind of BETA_GATE_KINDS) {
    it(`${kind} renders the §6.4 anatomy (card, deadline/waiting, do-nothing, spend, five actions)`, () => {
      const blocking = kind !== "approve_scope";
      const m = buildGateCard(
        gateFacts({ kind, blocking, onExpiry: kind === "approve_sample" ? "proceed_as_proposed" : kind === "resume_partial" ? "accept_partial" : kind === "confirm_cost" || kind === "refusal" ? "cancel" : "wait" }),
        NOW,
      );
      const html = renderToStaticMarkup(<GateCard model={m} formAction={`/p/x/gates/${kind}`} labels={gateLabels} />);
      expect(html).toContain(`data-gate-card="${kind}"`);
      expect(html).toContain(`K:${kind}`);
      expect(html).toContain('data-deadline-line="true"');
      expect(html).toContain('data-do-nothing="true"');
      expect(html).toContain('data-spend-line="true"');
      for (const a of ["approve", "approve_autonomous", "keep_planning", "wait", "stop"]) {
        expect(html).toContain(`data-action="${a}"`);
      }
      // a card, never a modal.
      expect(html).toContain("<section");
      expect(html).not.toContain('role="dialog"');
    });
  }

  it("the wait-default approve_triage card says 'waiting for you' and never shows a presence timer", () => {
    const m = buildGateCard(gateFacts({ kind: "approve_triage" }), NOW);
    const html = renderToStaticMarkup(<GateCard model={m} formAction="/x" activityUrl="/x/activity" labels={gateLabels} />);
    expect(html).toContain("Waiting for you — no deadline.");
    expect(html).not.toContain("data-presence-timer");
    expect(html).toContain("If you do nothing: wait.");
    // a wait-default card never emits the ping script, even when handed an activity URL.
    expect(html).not.toContain("sendBeacon");
    expect(html).not.toContain("/x/activity");
  });

  it("an auto-proceed card emits the presence-ping script only when given an activityUrl (REQ-SPEC-18)", () => {
    const m = buildGateCard(
      gateFacts({ kind: "approve_sample", onExpiry: "proceed_as_proposed", deadlineAt: "2026-09-17T12:00:00Z" }),
      NOW,
    );
    const withUrl = renderToStaticMarkup(<GateCard model={m} formAction="/x" activityUrl="/p/x/gates/g_1/activity" labels={gateLabels} />);
    expect(withUrl).toContain("<script");
    expect(withUrl).toContain("/p/x/gates/g_1/activity");
    expect(withUrl).toContain("sendBeacon");
    expect(withUrl).toContain("visibilitychange");
    const without = renderToStaticMarkup(<GateCard model={m} formAction="/x" labels={gateLabels} />);
    expect(without).not.toContain("<script");
  });

  it("an auto-proceed gate with a presence deadline renders the countdown (REQ-SPEC-18)", () => {
    const m = buildGateCard(
      gateFacts({
        kind: "approve_sample",
        onExpiry: "proceed_as_proposed",
        deadlineAt: "2026-09-17T12:00:00Z",
        presenceDeadlineAt: "2026-09-16T12:09:41Z",
      }),
      NOW,
    );
    const html = renderToStaticMarkup(<GateCard model={m} formAction="/x" labels={gateLabels} />);
    expect(html).toContain('data-presence-timer="true"');
    expect(html).toContain("Proceeding in 9:41");
  });

  it("paused-while-reading shows the pause note", () => {
    const m = buildGateCard(
      gateFacts({
        kind: "approve_sample",
        onExpiry: "proceed_as_proposed",
        presenceDeadlineAt: "2026-09-16T12:09:41Z",
        pausedWhileReading: true,
      }),
      NOW,
    );
    const html = renderToStaticMarkup(<GateCard model={m} formAction="/x" labels={gateLabels} />);
    expect(html).toContain('data-paused="true"');
    expect(html).toContain("Paused while you read.");
  });

  it("the informational approve_scope card is flagged non-blocking", () => {
    const m = buildGateCard(gateFacts({ kind: "approve_scope", blocking: false }), NOW);
    const html = renderToStaticMarkup(<GateCard model={m} formAction="/x" labels={gateLabels} />);
    expect(html).toContain('data-blocking="false"');
    expect(html).toContain("Informational — the run continues while you read.");
  });

  it("phone-width offers Approve / Wait for me / Stop only — same component (AC6)", () => {
    const m = buildGateCard(gateFacts({ kind: "confirm_cost", onExpiry: "cancel" }), NOW, "phone");
    const html = renderToStaticMarkup(<GateCard model={m} formAction="/x" labels={gateLabels} compact />);
    for (const a of ["approve", "wait", "stop"]) expect(html).toContain(`data-action="${a}"`);
    expect(html).not.toContain('data-action="approve_autonomous"');
    expect(html).not.toContain('data-action="keep_planning"');
    // the guidance + standing inputs stay off the phone input set.
    expect(html).not.toContain('name="guidance"');
    expect(html).not.toContain('name="standing"');
  });

  it("renders the standing-guidance checkbox + guidance field on the full card", () => {
    const m = buildGateCard(gateFacts({ kind: "approve_plan" as GateKind }), NOW);
    const html = renderToStaticMarkup(<GateCard model={m} formAction="/x" labels={gateLabels} />);
    expect(html).toContain('name="standing"');
    expect(html).toContain('name="guidance"');
  });

  it("approve_triage mounts the ledger rows + 'Approve proposals' primary + escalation flag", () => {
    const m = buildGateCard(gateFacts({ kind: "approve_triage" }), NOW);
    const rows = [
      { findingId: "f_e", ordinal: 2, title: "escalated row", severity: "major", disposition: { kind: "escalate", rationale: "call", actor: "user" } },
      { findingId: "f_a", ordinal: 1, title: "accepted row", severity: "minor", disposition: { kind: "accept" } },
    ];
    const html = renderToStaticMarkup(
      <GateCard model={m} formAction="/x" labels={gateLabels} hasEscalations>
        <TriageLedger rows={rows} labels={ledgerLabels} />
      </GateCard>,
    );
    expect(html).toContain("Approve proposals");
    expect(html).toContain('data-triage-ledger="true"');
    expect(html).toContain('data-triage-row="f_e"');
    expect(html).toContain('data-actor="user"');
    expect(html).toContain("by you");
    expect(html).toContain("Escalations are decided only by you.");
  });
});

// ---------- DecisionsList (§5.7; REQ-OBJ-7/8) ----------

describe("DecisionsList — the beta Inbox stand-in", () => {
  it("lists open rows with inline answer buttons", () => {
    const html = renderToStaticMarkup(
      <DecisionsList
        items={[
          { id: "dcr_1", projectId: "p", obligationId: "obl_1", text: "Escalated finding: the stat", options: ["decide", "dismiss"], createdAt: null },
          { id: "dcr_2", projectId: "p", obligationId: null, text: "Deferred finding is back: y", options: ["decide", "dismiss"], createdAt: null },
        ]}
        formActionFor={(id) => `/p/x/decisions/${id}`}
        labels={decisionsLabels}
      />,
    );
    expect(html).toContain('data-decision="dcr_1"');
    expect(html).toContain("Escalated finding: the stat");
    expect(html).toContain('value="decide"');
    expect(html).toContain('value="dismiss"');
    expect(html).toContain('action="/p/x/decisions/dcr_2"');
  });

  it("renders the empty state", () => {
    const html = renderToStaticMarkup(
      <DecisionsList items={[]} formActionFor={(id) => `/x/${id}`} labels={decisionsLabels} />,
    );
    expect(html).toContain("Nothing waiting.");
  });
});
