import { describe, it, expect } from "vitest";
import { GATE_KINDS, NEVER_AUTOPROCEED_GATES, GATE_DEFAULTS, type GateOnExpiry } from "@rhema/contracts";
import {
  buildGateCard,
  gateViewFromRow,
  gateCardActions,
  GATE_CARD_ACTIONS,
  GATE_CARD_ACTIONS_PHONE,
  doNothingOutcome,
  needsYouOrder,
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

// -------------------------------------------------------------------------------------------------------------------
// P1.09 — the full-surface property tests: every kind renders the same anatomy (AC1), the presence
// matrix holds over kind × state (AC4), and Needs-you ordering is deterministic (§5.11).

describe("P1.09 — all twelve kinds build the same anatomy (§6.4; REQ-GATE-2)", () => {
  it("every GateKind produces a card model with the §6.4 fields + the action set", () => {
    for (const kind of GATE_KINDS) {
      const m = buildGateCard(
        facts({ kind, onExpiry: GATE_DEFAULTS[kind].onExpiry as GateOnExpiry, blocking: GATE_DEFAULTS[kind].blocking }),
        NOW,
      );
      expect(m.kind).toBe(kind);
      expect(m.actions).toEqual(GATE_CARD_ACTIONS);
      expect(m.doNothing).toBe(doNothingOutcome(GATE_DEFAULTS[kind].onExpiry as GateOnExpiry));
      expect(typeof m.spentCredits).toBe("number");
      expect(typeof m.capCredits).toBe("number");
      expect(m.informational).toBe(!m.blocking);
    }
  });

  it("presence-timer property matrix (kind × onExpiry × presenceDeadlineAt): only auto-proceed shows", () => {
    for (const kind of GATE_KINDS) {
      for (const onExpiry of ["wait", "proceed_as_proposed", "proceed_conservative", "cancel", "accept_partial"] as const) {
        const m = buildGateCard(
          facts({ kind, onExpiry, presenceDeadlineAt: "2026-09-16T12:10:00Z" }),
          NOW,
        );
        // only a proceed_* expiry AND a non-spend/refusal kind may show the countdown — a spend kind
        // never auto-proceeds under ANY display, even a poisoned row (REQ-SPEC-1, defense in depth).
        const expectTimer =
          (onExpiry === "proceed_as_proposed" || onExpiry === "proceed_conservative") &&
          !NEVER_AUTOPROCEED_GATES.includes(kind);
        expect(m.presence.active, `${kind}/${onExpiry}`).toBe(expectTimer);
        expect(m.autoProceed, `${kind}/${onExpiry}`).toBe(expectTimer);
      }
    }
  });

  it("NEVER_AUTOPROCEED_GATES never auto-proceed under any display — view-model level (AC4)", () => {
    for (const kind of NEVER_AUTOPROCEED_GATES) {
      for (const onExpiry of ["proceed_as_proposed", "proceed_conservative"] as const) {
        // even a poisoned row (auto-proceed expiry on a spend kind) renders non-autoProceed — no
        // countdown, no ping script, ever.
        const m = buildGateCard(facts({ kind, onExpiry }), NOW);
        expect(m.autoProceed).toBe(false);
        expect(m.presence.active).toBe(false);
      }
    }
  });
});

describe("needsYouOrder — the §5.11 Inbox ordering (P1.09)", () => {
  const gate = (id: string, over: { blocking?: boolean; deadlineAt?: string | null; openedAt?: string }) => ({
    id,
    blocking: true,
    openedAt: "2026-09-16T10:00:00Z",
    deadlineAt: null,
    ...over,
  });

  it("blocking with deadlines first (soonest), then waiting, then informational; openedAt breaks ties", () => {
    const cards = [
      gate("info", { blocking: false, openedAt: "2026-09-16T08:00:00Z" }),
      gate("wait2", { openedAt: "2026-09-16T11:00:00Z" }),
      gate("soon", { deadlineAt: "2026-09-16T13:00:00Z", openedAt: "2026-09-16T11:30:00Z" }),
      gate("wait1", { openedAt: "2026-09-16T09:00:00Z" }),
      gate("late", { deadlineAt: "2026-09-17T13:00:00Z" }),
      gate("same", { deadlineAt: "2026-09-16T13:00:00Z", openedAt: "2026-09-16T10:00:00Z" }),
    ];
    expect(needsYouOrder(cards).map((c) => c.id)).toEqual([
      "same", // deadline 13:00, opened earlier — the deterministic tie-breaker
      "soon",
      "late",
      "wait1", // waiting, oldest first
      "wait2",
      "info", // informational last
    ]);
  });

  it("is deterministic — shuffled input yields the same order", () => {
    const cards = [
      gate("a", { deadlineAt: "2026-09-16T13:00:00Z" }),
      gate("b", { deadlineAt: "2026-09-16T12:00:00Z" }),
      gate("c", { blocking: false }),
    ];
    expect(needsYouOrder([...cards].reverse()).map((c) => c.id)).toEqual(["b", "a", "c"]);
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
