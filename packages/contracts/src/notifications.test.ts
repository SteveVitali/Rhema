import { describe, expect, it } from "vitest";
import {
  EMAIL_EVENT_TYPES,
  EMAIL_TEMPLATES,
  NON_CONFIGURABLE_EVENTS,
  NOTIFICATION_EVENT_TYPES,
  NOTIFICATION_MATRIX,
  QUIET_HOURS_DEFERRABLE,
  effectiveEmailMatrix,
  emailEnabled,
  inQuietHours,
  isNonConfigurableEvent,
  notificationEventForGate,
  quietHoursEnd,
  renderEmail,
  type EmailEventType,
} from "./notifications.js";
import { GATE_KINDS } from "./enums.js";

// §5.11 matrix + REQ-SPEC-20/REQ-MOBILE-10: email actions are Wait-for-me / Open — Approve is NEVER a remote
// action. These tests pin the template registry's coverage, the no-Approve invariant, and the prefs logic.

const PARAMS: Record<EmailEventType, Record<string, unknown>> = {
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
  voice_stale: {
    count: 2,
    voices: [
      { name: "Lede", pill: "badly off" },
      { name: "Op-ed", pill: "aging" },
    ],
    openUrl: "https://app.test/voices",
  },
  chat_reply: { projectTitle: "Seed project", openUrl: "https://app.test/p/prj" },
  product_update: {
    subject: "Product update",
    summary: "New export formats shipped.",
    openUrl: "https://app.test/app",
  },
};

describe("email templates (REQ-SPEC-20; REQ-MOBILE-10-as-email)", () => {
  it("the registry covers every email-capable event type exactly — in-app-only rows have no template", () => {
    for (const t of EMAIL_EVENT_TYPES) {
      expect(Object.keys(EMAIL_TEMPLATES)).toContain(t);
      expect(PARAMS[t]).toBeDefined();
    }
    expect(Object.keys(EMAIL_TEMPLATES).sort()).toEqual([...EMAIL_EVENT_TYPES].sort());
    // §5.11: run_cancelled_recovered + run_progress never mail — they are deliberately absent.
    expect(EMAIL_EVENT_TYPES).not.toContain("run_cancelled_recovered");
    expect(EMAIL_EVENT_TYPES).not.toContain("run_progress");
  });

  it("no template renders an approve action — the only links are Open and Wait for me", () => {
    for (const t of EMAIL_EVENT_TYPES) {
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
  it("defaults match the §5.11 matrix — non-configurable rows are spend_gate + trial_payment", () => {
    const m = effectiveEmailMatrix(null);
    for (const t of NOTIFICATION_EVENT_TYPES) {
      const row = NOTIFICATION_MATRIX[t];
      // email default: "none" and "opt_in" rows are OFF; "always"/"digest" rows take defaultOn;
      // non-configurable rows are ON regardless.
      const emailDefault =
        isNonConfigurableEvent(t) || (row.email !== "none" && row.email !== "opt_in" && row.defaultOn);
      expect(m[t].enabled).toBe(emailDefault);
      // in-app default: product_update has no Inbox arm; run_progress is per-project opt-in only.
      const inAppDefault =
        isNonConfigurableEvent(t) || (row.inApp !== "none" && row.inApp !== "opt_in" && row.defaultOn);
      expect(m[t].inApp).toBe(inAppDefault);
      expect(m[t].configurable).toBe(!NON_CONFIGURABLE_EVENTS.includes(t));
    }
    // the named §5.11 exceptions:
    expect(m.run_progress.inApp).toBe(false); // Advanced per-project opt-in
    expect(m.product_update.enabled).toBe(false); // email-only, off by default
    expect(m.chat_reply.enabled).toBe(false); // optional email — off unless opted in
    expect(m.chat_reply.inApp).toBe(true); // the Inbox row itself is default-on
    expect(m.run_cancelled_recovered.enabled).toBe(false); // in-app only (email is failed-only)
    expect(m.voice_stale.digest).toBe("weekly"); // the only voice-stale mail
    expect(m.run_finished.digest).toBeNull(); // hourly digest is opt-in
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
  it("only run_finished + chat_reply are deferrable — gates, spend, credits, trial are exempt", () => {
    expect(QUIET_HOURS_DEFERRABLE).toEqual(["run_finished", "chat_reply"]);
  });
});
