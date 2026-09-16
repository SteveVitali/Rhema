import { z } from "zod";
import type { GateKind, GateOnExpiry } from "./enums.js";

// notifications.ts — the §5.11 email matrix + §10.4 N-class semantics, applied to the email channel
// (PRB.09; REQ-IDE-47, REQ-ACCT-1, REQ-SPEC-20, REQ-MOBILE-9/10-as-email).
//
// Payload discipline (§10.4's rule, extended to email): every rendered template is assembled from a
// fixed string + a whitelist of structured params — ids, counts, bounded labels, and server-built URLs.
// An email NEVER carries finding text, draft text, prompt text, memory, or model output; project titles
// are the only content-shaped param (the §10.4 "templated strings only … hides titles" posture maps to
// email as "titles allowed, bodies never"). Signed one-click actions are *Wait for me* and *Open* —
// Approve is never a remote action (REQ-MOBILE-10's rule applied to email, REQ-SPEC-20).

// ---------- event types (the §5.11 rows the beta has) ----------

export const NOTIFICATION_EVENT_TYPES = [
  /** a gate sits unresolved ≥ 15 min → signed Wait-for-me / Open links (never Approve). */
  "approval_waiting",
  /** a money gate (confirm_cost / spend_overrun) opened — NON-CONFIGURABLE (§5.11 "on, not configurable"). */
  "spend_gate",
  /** a deadline reminder at T−1h / T−10m — the do-nothing outcome + a deep link (§6.4 item 7; REQ-GATE-8). */
  "gate_reminder",
  /** the deadline fired an auto-proceed — the decision and its cost (on by default; review 12 #9). */
  "auto_proceeded",
  /** the run completed (deliverable ready). */
  "run_finished",
  /** the run failed — "failed only" per §5.11 (cancelled / completed_partial send no email). */
  "run_failed",
  /** credit consumption crossed 50 / 80 / 100 % (§14.6). */
  "credits_threshold",
  /** trial ending / payment failed — NON-CONFIGURABLE, mostly dormant at beta (§5.11). */
  "trial_payment",
] as const;
export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];
export const notificationEventTypeSchema = z.enum(NOTIFICATION_EVENT_TYPES);

/** The two rows the §5.11 matrix marks "on, not configurable" (REQ-ACCT-1). */
export const NON_CONFIGURABLE_EVENTS: readonly NotificationEventType[] = ["spend_gate", "trial_payment"];

export function isNonConfigurableEvent(type: NotificationEventType): boolean {
  return NON_CONFIGURABLE_EVENTS.includes(type);
}

/** The gate kinds that are the "Spend gate" matrix row (money is blocked). */
export const SPEND_GATE_KINDS: readonly GateKind[] = ["confirm_cost", "spend_overrun"];

/** The notification class a gate kind maps to. */
export function notificationEventForGate(kind: GateKind): "spend_gate" | "approval_waiting" {
  return SPEND_GATE_KINDS.includes(kind) ? "spend_gate" : "approval_waiting";
}

/** Event types quiet hours may defer (§5.11: "run-finished and chat"; chat has no beta email). */
export const QUIET_HOURS_DEFERRABLE: readonly NotificationEventType[] = ["run_finished"];

// ---------- preferences (server-side, per event type — REQ-ACCT-1) ----------

export const quietHoursSchema = z.object({
  /** minutes after 00:00 UTC the quiet window starts (0–1439). */
  startMinutesUtc: z.number().int().min(0).max(1439),
  /** minutes after 00:00 UTC the quiet window ends (0–1439); may wrap past midnight. */
  endMinutesUtc: z.number().int().min(0).max(1439),
});
export type QuietHours = z.infer<typeof quietHoursSchema>;

/** The `notification_prefs.prefs` jsonb shape: per-event-type email toggles + an optional quiet window. */
export const notificationPrefsSchema = z.object({
  email: z.record(notificationEventTypeSchema, z.boolean()).optional(),
  quietHours: quietHoursSchema.nullish(),
});
export type NotificationPrefs = z.infer<typeof notificationPrefsSchema>;

/**
 * The effective email toggle for an event type: stored pref wins, absent ⇒ ON (the §5.11 defaults), and a
 * non-configurable row is always ON no matter what was stored (defense in depth — the API also rejects).
 */
export function emailEnabled(prefs: NotificationPrefs | null | undefined, type: NotificationEventType): boolean {
  if (isNonConfigurableEvent(type)) return true;
  return prefs?.email?.[type] ?? true;
}

/** The complete effective matrix for the settings surface: every type's effective toggle + its lock. */
export function effectiveEmailMatrix(
  prefs: NotificationPrefs | null | undefined,
): Record<NotificationEventType, { enabled: boolean; configurable: boolean }> {
  const out = {} as Record<NotificationEventType, { enabled: boolean; configurable: boolean }>;
  for (const t of NOTIFICATION_EVENT_TYPES) {
    out[t] = { enabled: emailEnabled(prefs, t), configurable: !isNonConfigurableEvent(t) };
  }
  return out;
}

/** True when `now` (UTC) falls inside the prefs' quiet window (window may wrap midnight). */
export function inQuietHours(prefs: NotificationPrefs | null | undefined, now: Date): boolean {
  const q = prefs?.quietHours;
  if (!q) return false;
  const m = now.getUTCHours() * 60 + now.getUTCMinutes();
  if (q.startMinutesUtc === q.endMinutesUtc) return false; // a zero-length window is off
  if (q.startMinutesUtc < q.endMinutesUtc) return m >= q.startMinutesUtc && m < q.endMinutesUtc;
  return m >= q.startMinutesUtc || m < q.endMinutesUtc; // wraps midnight
}

/**
 * The instant the current quiet window ends. Caller guarantees `inQuietHours(prefs, now)` — for a wrapping
 * window in its post-midnight arm, "today at end" is already the correct instant; pre-midnight arms and
 * non-wrapping windows end later the same day.
 */
export function quietHoursEnd(prefs: NotificationPrefs, now: Date): Date {
  const q = prefs.quietHours!;
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, q.endMinutesUtc),
  );
  // inside a non-wrapping window (start < end) or a wrapping window's pre-midnight arm, end is later today;
  // a wrapping window's post-midnight arm ends today already.
  if (end.getTime() <= now.getTime()) return new Date(end.getTime() + 24 * 60 * 60 * 1000);
  return end;
}

// ---------- gate labels + the do-nothing outcome (template vocabulary) ----------

/**
 * Human labels for the twelve gate kinds in notification copy. These are DESCRIPTIVE labels, not the §6.4
 * action verbs — email never renders "Approve" (REQ-SPEC-20/REQ-MOBILE-10); the card's own name ("Approve
 * plan") stays in-app where the action exists.
 */
export const GATE_KIND_LABELS: Record<GateKind, string> = {
  confirm_cost: "Cost confirmation",
  approve_plan: "Plan approval",
  approve_scope: "Scope check",
  approve_triage: "Triage review",
  approve_outline: "Outline review",
  approve_sample: "Sample review",
  approve_cutlist: "Cut-list review",
  choose_thesis: "Thesis choice",
  continue_rounds: "Round check",
  spend_overrun: "Spend limit",
  resume_partial: "Partial-results decision",
  refusal: "Paused run",
};

/** The do-nothing outcome for each on_expiry (§6.4 item 7: "notifications carry the do-nothing outcome"). */
export const DO_NOTHING_OUTCOME: Record<GateOnExpiry, string> = {
  proceed_conservative: "proceeds conservatively",
  proceed_as_proposed: "proceeds as proposed",
  cancel: "is cancelled",
  accept_partial: "finishes with its partial results",
  wait: "keeps waiting for you",
};

// ---------- email templates (the notes.ts discipline: fixed strings + whitelisted params) ----------

const label = z.string().max(60).regex(/^[\w .:'/–—-]*$/, "email label must be a short controlled token");
const title = z.string().max(140);
const url = z.string().max(2000).url();
const credits = z.number().int().nonnegative();

export interface RenderedEmail {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

/** Minimal HTML shell: escaped text paragraphs + the action links. Params are HTML-escaped — never raw. */
function shell(lines: string[], links: { label: string; url: string }[]): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const body = lines.map((l) => `<p>${esc(l)}</p>`).join("\n");
  const btns = links
    .map((l) => `<p><a href="${esc(l.url)}" style="display:inline-block;padding:8px 16px;border:1px solid #444;border-radius:6px;text-decoration:none;color:inherit">${esc(l.label)}</a></p>`)
    .join("\n");
  return `<!doctype html><html><body style="font-family:Georgia,serif;max-width:560px;margin:0 auto;padding:24px">${body}${btns}</body></html>`;
}

/** One template entry: a zod param whitelist + a pure render (the notes.ts shape). */
function define<P>(params: z.ZodType<P>, render: (p: P) => RenderedEmail) {
  return { params, render };
}

/**
 * The email template registry — one per NOTIFICATION_EVENT_TYPES row. Every template renders *Wait for me*
 * and/or *Open* actions where a gate is in play; none renders an Approve action (a contract test asserts
 * the rendered output contains no Approve). `subject`/`text` are ASCII-safe template lines.
 */
export const EMAIL_TEMPLATES = {
  approval_waiting: define(
    z.object({
      gateLabel: label,
      projectTitle: title.optional(),
      doNothing: label,
      deadlineText: z.string().max(80).optional(),
      openUrl: url,
      holdUrl: url,
    }),
    (p) => {
      const where = p.projectTitle ? ` on “${p.projectTitle}”` : "";
      const lines = [
        `Rhema is waiting on your call${where}: ${p.gateLabel}.`,
        p.deadlineText ? `If you do nothing, it ${p.doNothing} ${p.deadlineText}.` : `If you do nothing, it ${p.doNothing}.`,
        `Open the project to decide, or pick “Wait for me” to pause the countdown.`,
      ];
      return {
        subject: `Waiting on you: ${p.gateLabel}${where}`,
        text: `${lines.join("\n")}\n\nOpen: ${p.openUrl}\nWait for me: ${p.holdUrl}`,
        html: shell(lines, [
          { label: "Open", url: p.openUrl },
          { label: "Wait for me", url: p.holdUrl },
        ]),
      };
    },
  ),

  spend_gate: define(
    z.object({
      gateLabel: label,
      projectTitle: title.optional(),
      credits: credits.optional(),
      doNothing: label,
      deadlineText: z.string().max(80).optional(),
      openUrl: url,
      holdUrl: url,
    }),
    (p) => {
      const where = p.projectTitle ? ` on “${p.projectTitle}”` : "";
      const cost = p.credits != null ? ` (${p.credits} credits)` : "";
      const lines = [
        `A spend decision is waiting${where}: ${p.gateLabel}${cost}.`,
        p.deadlineText ? `If you do nothing, it ${p.doNothing} ${p.deadlineText}.` : `Nothing proceeds until you decide.`,
        `This notice is always on — it is how Rhema keeps you in charge of spend.`,
      ];
      return {
        subject: `Spend needs your call: ${p.gateLabel}${where}`,
        text: `${lines.join("\n")}\n\nOpen: ${p.openUrl}\nWait for me: ${p.holdUrl}`,
        html: shell(lines, [
          { label: "Open", url: p.openUrl },
          { label: "Wait for me", url: p.holdUrl },
        ]),
      };
    },
  ),

  gate_reminder: define(
    z.object({
      gateLabel: label,
      projectTitle: title.optional(),
      offsetLabel: label, // "1 hour" / "10 minutes"
      doNothing: label,
      deadlineText: z.string().max(80),
      openUrl: url,
      holdUrl: url,
    }),
    (p) => {
      const where = p.projectTitle ? ` on “${p.projectTitle}”` : "";
      const lines = [
        `${p.gateLabel}${where} — in ${p.offsetLabel} it ${p.doNothing} (${p.deadlineText}).`,
        `Open the project to decide, or pick “Wait for me” to pause the countdown.`,
      ];
      return {
        subject: `${p.offsetLabel} left: ${p.gateLabel}${where}`,
        text: `${lines.join("\n")}\n\nOpen: ${p.openUrl}\nWait for me: ${p.holdUrl}`,
        html: shell(lines, [
          { label: "Open", url: p.openUrl },
          { label: "Wait for me", url: p.holdUrl },
        ]),
      };
    },
  ),

  auto_proceeded: define(
    z.object({
      gateLabel: label,
      projectTitle: title.optional(),
      actionLabel: label, // the recorded decision ("proceeded conservatively", …)
      spentCredits: credits,
      capCredits: credits,
      openUrl: url,
    }),
    (p) => {
      const where = p.projectTitle ? ` on “${p.projectTitle}”` : "";
      const lines = [
        `${p.gateLabel}${where} timed out — the run ${p.actionLabel}.`,
        `Cost so far: ${p.spentCredits} of ${p.capCredits} credits.`,
        `Open the project to see what happened.`,
      ];
      return {
        subject: `${p.gateLabel} proceeded${where} · ${p.spentCredits} credits`,
        text: `${lines.join("\n")}\n\nOpen: ${p.openUrl}`,
        html: shell(lines, [{ label: "Open", url: p.openUrl }]),
      };
    },
  ),

  run_finished: define(
    z.object({ projectTitle: title.optional(), openUrl: url }),
    (p) => {
      const where = p.projectTitle ? ` on “${p.projectTitle}”` : "";
      const lines = [`Your run finished${where} — the deliverable is ready.`, `Open the project to read it.`];
      return {
        subject: `Run finished${where}`,
        text: `${lines.join("\n")}\n\nOpen: ${p.openUrl}`,
        html: shell(lines, [{ label: "Open", url: p.openUrl }]),
      };
    },
  ),

  run_failed: define(
    z.object({ projectTitle: title.optional(), openUrl: url }),
    (p) => {
      const where = p.projectTitle ? ` on “${p.projectTitle}”` : "";
      const lines = [`Your run failed${where}.`, `Open the project to see what happened and what was kept.`];
      return {
        subject: `Run failed${where}`,
        text: `${lines.join("\n")}\n\nOpen: ${p.openUrl}`,
        html: shell(lines, [{ label: "Open", url: p.openUrl }]),
      };
    },
  ),

  credits_threshold: define(
    z.object({ percent: z.number().int().min(1).max(100), openUrl: url }),
    (p) => {
      const lines = [
        `You have used ${p.percent}% of your Rhema credits.`,
        p.percent >= 100 ? `Runs will pause until you top up.` : `Open billing to see the balance or top up.`,
      ];
      return {
        subject: `Credits: ${p.percent}% used`,
        text: `${lines.join("\n")}\n\nOpen: ${p.openUrl}`,
        html: shell(lines, [{ label: "Open", url: p.openUrl }]),
      };
    },
  ),

  trial_payment: define(
    z.object({ reason: label, openUrl: url }),
    (p) => {
      const lines = [`${p.reason}.`, `Open billing to keep your work moving.`];
      return {
        subject: p.reason,
        text: `${lines.join("\n")}\n\nOpen: ${p.openUrl}`,
        html: shell(lines, [{ label: "Open", url: p.openUrl }]),
      };
    },
  ),
} as const;

// self-check: the registry covers every event type exactly.
for (const t of NOTIFICATION_EVENT_TYPES) {
  if (!(t in EMAIL_TEMPLATES)) throw new Error(`EMAIL_TEMPLATES missing ${t}`);
}

/** Render an email for an event type from its whitelisted params (validated + bounded like notes.ts). */
export function renderEmail<K extends NotificationEventType>(
  type: K,
  params: z.infer<(typeof EMAIL_TEMPLATES)[K]["params"]>,
): RenderedEmail {
  const t = EMAIL_TEMPLATES[type];
  const parsed = t.params.parse(params);
  return (t.render as (p: never) => RenderedEmail)(parsed as never);
}
