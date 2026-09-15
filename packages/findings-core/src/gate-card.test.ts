import { describe, it, expect } from "vitest";
import {
  buildGateCard,
  gateViewFromRow,
  gateCardActions,
  GATE_CARD_ACTIONS,
  GATE_CARD_ACTIONS_PHONE,
  doNothingOutcome,
  presenceCountdown,
  type GateCardFacts,
} from "./gate-card.js";

// PRB.05 / AC4 — the §6.4 gate-card rules (REQ-SPEC-18): the presence countdown appears ONLY on an
// auto-proceed gate with a server-set presence deadline; wait-default and spend/refusal gates never show
// one, whatever the row holds. Pure, deterministic.

const NOW = new Date("2026-09-16T12:00:00Z");

function facts(over: Partial<GateCardFacts> = {}): GateCardFacts {
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

describe("gateCardActions (§6.4 item 1 / §10.1)", () => {
  it("desktop offers the five actions; phone offers approve / wait / stop", () => {
    expect(gateCardActions("full")).toEqual(GATE_CARD_ACTIONS);
    expect(gateCardActions("phone")).toEqual(GATE_CARD_ACTIONS_PHONE);
    expect(GATE_CARD_ACTIONS_PHONE).toEqual(["approve", "wait", "stop"]);
  });
});

describe("doNothingOutcome", () => {
  it("a wait gate's do-nothing is 'wait'; auto-proceed gates name their outcome", () => {
    expect(doNothingOutcome("wait")).toBe("wait");
    expect(doNothingOutcome("proceed_as_proposed")).toBe("proceed_as_proposed");
    expect(doNothingOutcome("cancel")).toBe("cancel");
    expect(doNothingOutcome("accept_partial")).toBe("accept_partial");
  });
});

describe("buildGateCard — presence timer rules (REQ-SPEC-18; AC4)", () => {
  it("shows the 10-min countdown ONLY for an auto-proceed gate with a presence deadline", () => {
    const m = buildGateCard(
      facts({
        kind: "approve_sample",
        onExpiry: "proceed_as_proposed",
        deadlineAt: "2026-09-17T12:00:00Z",
        presenceDeadlineAt: "2026-09-16T12:10:00Z",
      }),
      NOW,
    );
    expect(m.autoProceed).toBe(true);
    expect(m.presence.active).toBe(true);
    expect(m.presence.remainingMs).toBe(10 * 60 * 1000);
    expect(presenceCountdown(m.presence.remainingMs!)).toBe("10:00");
  });

  it("a wait-default gate (approve_triage) NEVER shows the timer even when the row carries one", () => {
    const m = buildGateCard(facts({ onExpiry: "wait", presenceDeadlineAt: "2026-09-16T12:10:00Z" }), NOW);
    expect(m.autoProceed).toBe(false);
    expect(m.presence.active).toBe(false);
  });

  it("spend/refusal gates never auto-proceed and never show a presence timer", () => {
    for (const kind of ["confirm_cost", "spend_overrun", "resume_partial", "refusal"] as const) {
      const m = buildGateCard(
        facts({ kind, onExpiry: "cancel", presenceDeadlineAt: "2026-09-16T12:10:00Z" }),
        NOW,
      );
      expect(m.autoProceed).toBe(false);
      expect(m.presence.active).toBe(false);
    }
  });

  it("the paused-while-reading flag rides the timer (reading pauses it, §6.4 item 2)", () => {
    const m = buildGateCard(
      facts({
        kind: "approve_sample",
        onExpiry: "proceed_as_proposed",
        presenceDeadlineAt: "2026-09-16T12:10:00Z",
        pausedWhileReading: true,
      }),
      NOW,
    );
    expect(m.presence.active).toBe(true);
    expect(m.presence.paused).toBe(true);
  });

  it("a held gate never shows a live presence countdown", () => {
    const m = buildGateCard(
      facts({
        kind: "approve_sample",
        onExpiry: "proceed_as_proposed",
        presenceDeadlineAt: "2026-09-16T12:10:00Z",
        held: true,
      }),
      NOW,
    );
    expect(m.presence.active).toBe(false);
  });

  it("phone-width keeps every fact identical — only the action set narrows (REQ-SPEC-20)", () => {
    const f = facts({ kind: "confirm_cost", onExpiry: "cancel" });
    const full = buildGateCard(f, NOW, "full");
    const phone = buildGateCard(f, NOW, "phone");
    expect(phone.actions).toEqual(["approve", "wait", "stop"]);
    const { actions: _a, ...restFull } = full;
    const { actions: _b, ...restPhone } = phone;
    expect(restPhone).toEqual(restFull);
  });

  it("the informational approve_scope card is non-blocking but keeps the same anatomy", () => {
    const m = buildGateCard(facts({ kind: "approve_scope", onExpiry: "wait", blocking: false }), NOW);
    expect(m.informational).toBe(true);
    expect(m.doNothing).toBe("wait");
  });
});

describe("gateViewFromRow — the shared GateView contract (AC4)", () => {
  const row = {
    id: "gate_1",
    runId: "run_1",
    kind: "approve_triage" as const,
    artifactVersionId: "av_1",
    openedAt: "2026-09-16T10:00:00Z",
    deadlineAt: null,
    presenceDeadlineAt: "2026-09-16T12:10:00Z",
    pausedWhileReading: false,
    blocking: true,
    onExpiry: "wait" as const,
  };

  it("emits presenceTimer ONLY when the gate is auto-proceed with a presence deadline", () => {
    // wait gate + presence deadline set → still no timer (defense in depth).
    const waitView = gateViewFromRow(row);
    expect(waitView.presenceTimer).toBeUndefined();

    const autoView = gateViewFromRow({ ...row, onExpiry: "proceed_as_proposed" });
    expect(autoView.presenceTimer).toEqual({ deadlineAt: "2026-09-16T12:10:00Z", paused: false });
  });

  it("maps the artifact under decision + blocking flag", () => {
    const v = gateViewFromRow({ ...row, blocking: false });
    expect(v.artifactVersionId).toBe("av_1");
    expect(v.blocking).toBe(false);
  });
});
