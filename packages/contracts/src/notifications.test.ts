import { describe, expect, it } from "vitest";
import {
  EMAIL_TEMPLATES,
  NON_CONFIGURABLE_EVENTS,
  NOTIFICATION_EVENT_TYPES,
  QUIET_HOURS_DEFERRABLE,
  effectiveEmailMatrix,
  emailEnabled,
  inQuietHours,
  isNonConfigurableEvent,
  notificationEventForGate,
  quietHoursEnd,
  renderEmail,
  type NotificationEventType,
} from "./notifications.js";
import { GATE_KINDS } from "./enums.js";

// §5.11 matrix + REQ-SPEC-20/REQ-MOBILE-10: email actions are Wait-for-me / Open — Approve is NEVER a remote
// action. These tests pin the template registry's coverage, the no-Approve invariant, and the prefs logic.

const PARAMS: Record<NotificationEventType, Record<string, unknown>> = {
  approval_waiting: {
    gateLabel: "Plan approval",
    projectTitle: "Seed project",
    doNothing: "proceeds conservatively",
    deadlineText: "2026-09-03T12:00:00.000Z",
    openUrl: "https://api.test/api/action/tok_open",
    holdUrl: "https://api.test/api/action/tok_hold",
  },
  spend_gate: {
    gateLabel: "Cost confirmation",
    projectTitle: "Seed project",
    credits: 840,
    doNothing: "is cancelled",
    deadlineText: "2026-09-09T12:00:00.000Z",
    openUrl: "https://api.test/api/action/tok_open",
    holdUrl: "https://api.test/api/action/tok_hold",
  },
  gate_reminder: {
    gateLabel: "Sample review",
    offsetLabel: "10 minutes",
    doNothing: "proceeds as proposed",
    deadlineText: "2026-09-02T13:00:00.000Z",
    openUrl: "https://api.test/api/action/tok_open",
    holdUrl: "https://api.test/api/action/tok_hold",
  },
  auto_proceeded: {
    gateLabel: "Plan approval",
    actionLabel: "proceeded conservatively",
    spentCredits: 420,
    capCredits: 840,
    openUrl: "https://app.test/p/prj/review/run1",
  },
  run_finished: { projectTitle: "Seed project", openUrl: "https://app.test/p/prj/review/run1" },
  run_failed: { openUrl: "https://app.test/p/prj/review/run1" },
  credits_threshold: { percent: 80, openUrl: "https://app.test/app" },
  trial_payment: { reason: "Your trial is ending", openUrl: "https://app.test/app" },
};

describe("email templates (REQ-SPEC-20; REQ-MOBILE-10-as-email)", () => {
  it("the registry covers every notification event type exactly", () => {
    for (const t of NOTIFICATION_EVENT_TYPES) {
      expect(Object.keys(EMAIL_TEMPLATES)).toContain(t);
      expect(PARAMS[t]).toBeDefined();
    }
    expect(Object.keys(EMAIL_TEMPLATES).sort()).toEqual([...NOTIFICATION_EVENT_TYPES].sort());
  });

  it("no template renders an approve action — the only links are Open and Wait for me", () => {
    for (const t of NOTIFICATION_EVENT_TYPES) {
      const email = renderEmail(t, PARAMS[t] as never);
      const all = `${email.subject}\n${email.text}\n${email.html}`;
      // "Approve" as an ACTION never appears (a gate LABEL like "Plan approval" is descriptive, and the
      // boundary is a word-boundary match on the bare verb).
      expect(all).not.toMatch(/\bapprove\b/i);
      // the rendered html only carries our two action anchors / deep links — never a mutation verb link.
      const hrefs = [...email.html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
      for (const h of hrefs) expect(h).toMatch(/^https:\/\/(api|app)\.test\//);
    }
  });

  it("gate templates render exactly the Wait-for-me + Open actions", () => {
    for (const t of ["approval_waiting", "spend_gate", "gate_reminder"] as const) {
      const email = renderEmail(t, PARAMS[t] as never);
      expect(email.html).toContain(">Wait for me<");
      expect(email.html).toContain(">Open<");
      expect(email.text).toContain("Wait for me:");
    }
  });

  it("reminder copy carries the do-nothing outcome and the deadline (§6.4 item 7)", () => {
    const email = renderEmail("gate_reminder", PARAMS.gate_reminder as never);
    expect(email.text).toContain("proceeds as proposed");
    expect(email.text).toContain("2026-09-02T13:00:00.000Z");
  });

  it("auto-proceeded copy carries the decision and the cost (§5.11 row)", () => {
    const email = renderEmail("auto_proceeded", PARAMS.auto_proceeded as never);
    expect(email.text).toContain("proceeded conservatively");
    expect(email.text).toContain("420 of 840");
  });

  it("params are whitelisted + bounded — a free-text field rejects an over-long or unsafe value", () => {
    expect(() =>
      renderEmail("run_finished", { projectTitle: "x".repeat(500), openUrl: "https://app.test/p" } as never),
    ).toThrow();
    expect(() =>
      renderEmail("trial_payment", { reason: "a\nnewline<script>", openUrl: "https://app.test/app" } as never),
    ).toThrow();
  });
});

describe("the §5.11 preference matrix (REQ-ACCT-1)", () => {
  it("defaults every row ON; non-configurable rows are spend_gate + trial_payment", () => {
    const m = effectiveEmailMatrix(null);
    for (const t of NOTIFICATION_EVENT_TYPES) {
      expect(m[t].enabled).toBe(true);
      expect(m[t].configurable).toBe(!NON_CONFIGURABLE_EVENTS.includes(t));
    }
  });

  it("a stored toggle disables a configurable row — and can never disable a non-configurable row", () => {
    const prefs = { email: { run_finished: false, spend_gate: false, trial_payment: false } };
    expect(emailEnabled(prefs, "run_finished")).toBe(false);
    expect(emailEnabled(prefs, "spend_gate")).toBe(true); // the override wins
    expect(emailEnabled(prefs, "trial_payment")).toBe(true);
    expect(isNonConfigurableEvent("approval_waiting")).toBe(false);
  });

  it("gate kinds map onto the two gate matrix rows", () => {
    for (const k of GATE_KINDS) {
      const t = notificationEventForGate(k);
      if (k === "confirm_cost" || k === "spend_overrun") expect(t).toBe("spend_gate");
      else expect(t).toBe("approval_waiting");
    }
  });
});

describe("quiet hours (§5.11 — only run-finished/chat defer; never a gate or spend notice)", () => {
  const prefs = { quietHours: { startMinutesUtc: 22 * 60, endMinutesUtc: 7 * 60 } };
  it("detects the wrapping window and computes its end", () => {
    expect(inQuietHours(prefs, new Date("2026-09-02T23:00:00Z"))).toBe(true);
    expect(inQuietHours(prefs, new Date("2026-09-02T06:30:00Z"))).toBe(true);
    expect(inQuietHours(prefs, new Date("2026-09-02T12:00:00Z"))).toBe(false);
    expect(quietHoursEnd(prefs, new Date("2026-09-02T23:00:00Z")).toISOString()).toBe("2026-09-03T07:00:00.000Z");
    expect(quietHoursEnd(prefs, new Date("2026-09-02T06:30:00Z")).toISOString()).toBe("2026-09-02T07:00:00.000Z");
  });
  it("only run_finished is deferrable — gates, spend, credits, trial are exempt", () => {
    expect(QUIET_HOURS_DEFERRABLE).toEqual(["run_finished"]);
  });
});
