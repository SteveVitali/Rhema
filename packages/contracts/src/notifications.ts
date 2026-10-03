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
  // ---------- P1.19 — the in-app half of the §5.11 matrix ----------
  /** a run was cancelled by the system / recovered — §5.11: in-app row only (email is failed-only). */
  "run_cancelled_recovered",
  /** a voice profile went stale (seed/samples changed, aged, badly-off) — in-app + weekly email digest. */
  "voice_stale",
  /** an assistant reply landed while the project was backgrounded — in-app (+ optional email). */
  "chat_reply",
  /** a finding streamed / a phase finished — §5.11 "off, Advanced opt-in", per-PROJECT in-app only. */
  "run_progress",
  /** product updates — §5.11: email only, OFF by default. */
  "product_update",
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

/** Event types quiet hours may defer (§5.11: "run-finished and chat" — approvals + spend gates never). */
export const QUIET_HOURS_DEFERRABLE: readonly NotificationEventType[] = ["run_finished", "chat_reply"];

// ---------- preferences (server-side, per event type — REQ-ACCT-1) ----------

export const quietHoursSchema = z.object({
  /** minutes after 00:00 UTC the quiet window starts (0–1439). */
  startMinutesUtc: z.number().int().min(0).max(1439),
  /** minutes after 00:00 UTC the quiet window ends (0–1439); may wrap past midnight. */
  endMinutesUtc: z.number().int().min(0).max(1439),
});
export type QuietHours = z.infer<typeof quietHoursSchema>;

/**
 * The `notification_prefs.prefs` jsonb shape (P1.19 — one blob per user, shared by web and the 1.x app):
 * per-channel toggles, digest opts, the per-PROJECT `run_progress` opt-in, and an optional quiet window.
 */
export const notificationPrefsSchema = z.object({
  /** per-event-type email toggles (absent ⇒ the §5.11 default for the row). */
  email: z.record(notificationEventTypeSchema, z.boolean()).optional(),
  /** per-event-type in-app toggles — the same server-side authority the 1.x app reads (REQ-MOBILE-19). */
  inApp: z.record(notificationEventTypeSchema, z.boolean()).optional(),
  /** digest opts — run_finished may batch hourly; voice_stale batches weekly (§5.11 "email digest weekly"). */
  digest: z
    .object({
      run_finished: z.literal("hourly").optional(),
      voice_stale: z.literal("weekly").optional(),
    })
    .partial()
    .optional(),
  /** per-PROJECT overrides — the only project-scoped row at MVP is the Advanced `run_progress` opt-in. */
  project: z
    .record(z.string(), z.object({ run_progress: z.boolean().optional() }).partial())
    .optional(),
  quietHours: quietHoursSchema.nullish(),
});
export type NotificationPrefs = z.infer<typeof notificationPrefsSchema>;

/**
 * The §5.11 matrix, declaratively — one row per event type; the source of truth the AC1 fixtures verify
 * and every channel (email, in-app, the 1.x push transport) resolves against.
 *   `email`:      "always" (default on) · "digest" (the only mail is the digest) · "opt_in" (off default)
 *                 · "none" (the event never mails)
 *   `inApp`:      the Inbox row exists — "always" or "opt_in" (project-scoped for run_progress)
 *   `defaultOn`:  the row's §5.11 default for its toggles
 *   `osLevelOnlyWhenUnfocused`: §5.11 — an OS-level notification fires only while the project is not focused.
 *   `collapse`:   the Inbox collapse-key family — a run's notifications update one row in place.
 */
export const NOTIFICATION_MATRIX = {
  approval_waiting: {
    inApp: "always", push: true, email: "always", defaultOn: true, configurable: true,
    osLevelOnlyWhenUnfocused: true, quietHoursDeferrable: false, collapse: "run",
  },
  gate_reminder: {
    inApp: "always", push: true, email: "always", defaultOn: true, configurable: true,
    osLevelOnlyWhenUnfocused: true, quietHoursDeferrable: false, collapse: "run",
  },
  spend_gate: {
    inApp: "always", push: true, email: "always", defaultOn: true, configurable: false,
    osLevelOnlyWhenUnfocused: true, quietHoursDeferrable: false, collapse: "run",
  },
  run_finished: {
    inApp: "always", push: true, email: "always", defaultOn: true, configurable: true,
    osLevelOnlyWhenUnfocused: true, quietHoursDeferrable: true, collapse: "run",
  },
  run_failed: {
    inApp: "always", push: true, email: "always", defaultOn: true, configurable: true,
    osLevelOnlyWhenUnfocused: true, quietHoursDeferrable: false, collapse: "run",
  },
  run_cancelled_recovered: {
    inApp: "always", push: false, email: "none", defaultOn: true, configurable: true,
    osLevelOnlyWhenUnfocused: true, quietHoursDeferrable: false, collapse: "run",
  },
  auto_proceeded: {
    inApp: "always", push: false, email: "always", defaultOn: true, configurable: true,
    osLevelOnlyWhenUnfocused: true, quietHoursDeferrable: false, collapse: "run",
  },
  voice_stale: {
    inApp: "always", push: false, email: "digest", defaultOn: true, configurable: true,
    osLevelOnlyWhenUnfocused: true, quietHoursDeferrable: false, collapse: "voice",
  },
  credits_threshold: {
    inApp: "always", push: false, email: "always", defaultOn: true, configurable: true,
    osLevelOnlyWhenUnfocused: true, quietHoursDeferrable: false, collapse: "billing",
  },
  trial_payment: {
    inApp: "always", push: true, email: "always", defaultOn: true, configurable: false,
    osLevelOnlyWhenUnfocused: true, quietHoursDeferrable: false, collapse: "billing",
  },
  chat_reply: {
    inApp: "always", push: true, email: "opt_in", defaultOn: true, configurable: true,
    osLevelOnlyWhenUnfocused: true, quietHoursDeferrable: true, collapse: "run",
  },
  run_progress: {
    inApp: "opt_in", push: false, email: "none", defaultOn: false, configurable: true,
    osLevelOnlyWhenUnfocused: true, quietHoursDeferrable: false, collapse: "run",
  },
  product_update: {
    inApp: "none", push: false, email: "opt_in", defaultOn: false, configurable: true,
    osLevelOnlyWhenUnfocused: true, quietHoursDeferrable: false, collapse: "account",
  },
} as const;
export type NotificationMatrixRow = (typeof NOTIFICATION_MATRIX)[NotificationEventType];

/** The event types that can send email at all (in-app-only rows have no template). */
export const EMAIL_EVENT_TYPES = NOTIFICATION_EVENT_TYPES.filter(
  (t) => NOTIFICATION_MATRIX[t].email !== "none",
) as NotificationEventType[];

/**
 * The effective email toggle for an event type: stored pref wins, absent ⇒ the matrix default, and a
 * non-configurable row is always ON no matter what was stored (defense in depth — the API also rejects).
 * opt_in rows (chat_reply's optional email, product updates) default OFF.
 */
export function emailEnabled(prefs: NotificationPrefs | null | undefined, type: NotificationEventType): boolean {
  if (isNonConfigurableEvent(type)) return true;
  const row = NOTIFICATION_MATRIX[type];
  if (row.email === "none") return false;
  // "opt_in" rows (chat_reply's optional arm, product updates) mail only when the user turns them on;
  // `defaultOn` describes the row's in-app arm, so it cannot be used as the email default here.
  if (row.email === "opt_in") return prefs?.email?.[type] ?? false;
  return prefs?.email?.[type] ?? row.defaultOn;
}

/**
 * The effective in-app toggle (P1.19): stored `inApp` pref wins, absent ⇒ the matrix default —
 * `run_progress` is the ONLY off-by-default row and it is per-PROJECT (the project-scoped pref must be
 * explicitly true; a global inApp toggle for it is ignored). Non-configurable rows are always ON.
 */
export function inAppEnabled(
  prefs: NotificationPrefs | null | undefined,
  type: NotificationEventType,
  projectId?: string | null,
): boolean {
  if (isNonConfigurableEvent(type)) return true;
  if (NOTIFICATION_MATRIX[type].inApp === "none") return false;
  if (type === "run_progress") {
    // the Advanced row is per-project opt-in ONLY (§5.11 "off — Advanced opt-in") — a global toggle
    // can switch it OFF once opted in but never opts a project in.
    const scoped = projectId != null && prefs?.project?.[projectId]?.run_progress === true;
    const userOff = prefs?.inApp?.run_progress === false;
    return scoped && !userOff;
  }
  return prefs?.inApp?.[type] ?? NOTIFICATION_MATRIX[type].defaultOn;
}

/** The stored digest mode for an event (run_finished→hourly; voice_stale's weekly digest is its email arm). */
export function digestMode(
  prefs: NotificationPrefs | null | undefined,
  type: "run_finished" | "voice_stale",
): "hourly" | "weekly" | null {
  if (type === "voice_stale") return "weekly"; // §5.11: the voice-stale email is ALWAYS the weekly digest
  return prefs?.digest?.run_finished === "hourly" ? "hourly" : null;
}

/** The complete effective matrix for the settings surface: every type's toggles + its lock. */
export function effectiveEmailMatrix(
  prefs: NotificationPrefs | null | undefined,
): Record<NotificationEventType, { enabled: boolean; inApp: boolean; digest: string | null; configurable: boolean }> {
  const out = {} as Record<
    NotificationEventType,
    { enabled: boolean; inApp: boolean; digest: string | null; configurable: boolean }
  >;
  for (const t of NOTIFICATION_EVENT_TYPES) {
    out[t] = {
      enabled: emailEnabled(prefs, t),
      inApp: inAppEnabled(prefs, t),
      digest:
        t === "run_finished"
          ? digestMode(prefs, "run_finished")
          : t === "voice_stale"
            ? "weekly"
            : null,
      configurable: !isNonConfigurableEvent(t),
    };
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

// ---------- the §5.11 collapse key + the Inbox payload (P1.19) ----------

/**
 * The §5.11 collapse key: "a run's notifications collapse to one Inbox item — the collapse key is the
 * run id." Non-run rows collapse on their own family key (a voice's staleness row updates in place;
 * each credits threshold is a separate event; each billing reason is a separate event).
 */
export function inboxCollapseKey(
  type: NotificationEventType,
  ids: { runId?: string | null; personaId?: string | null; billingAccountId?: string | null; tag?: string | null },
): string {
  const fam = NOTIFICATION_MATRIX[type].collapse;
  if (fam === "run" && ids.runId) return `run:${ids.runId}`;
  if (fam === "voice") return `voice:${ids.personaId ?? "unknown"}`;
  if (fam === "billing") return `billing:${ids.billingAccountId ?? "acct"}:${ids.tag ?? type}`;
  return `acct:${type}${ids.tag ? `:${ids.tag}` : ""}`;
}

/** The shared §10.1 Inbox row (InboxItem) — the shape web and the 1.x app both consume (REQ-MOBILE-19). */
export const inboxItemSchema = z.object({
  id: z.string().min(1),
  /** 'blocked' (approval/decision — badge-counted) | 'event' (a §5.11 notification) | 'voice' (stale). */
  kind: z.enum(["blocked", "event", "voice"]),
  /** the §5.11 event type for kind='event'; 'gate'/'decision' for kind='blocked'; 'stale' for voices. */
  type: z.string(),
  title: z.string().max(200),
  body: z.string().max(400).optional(),
  /** the §4.2 app-path deep link — every row lands on a focused surface, never a dead end. */
  href: z.string().max(2000),
  projectId: z.string().nullable().optional(),
  projectTitle: z.string().max(140).nullable().optional(),
  runId: z.string().nullable().optional(),
  unread: z.boolean(),
  createdAt: z.string(),
  /** kind='blocked' rows carry their gate/decision payload inline (the Needs-you wire shape). */
  gate: z.unknown().optional(),
  decision: z.unknown().optional(),
});
export type InboxItem = z.infer<typeof inboxItemSchema>;

/** The §10.1 NotificationDevice row — POST/DELETE /devices registers the 1.x push transport later. */
export const notificationDeviceSchema = z.object({
  id: z.string().min(1),
  platform: z.enum(["web", "ios", "android"]),
  token: z.string().min(1).max(2000),
  createdAt: z.string(),
});
export type NotificationDevice = z.infer<typeof notificationDeviceSchema>;

// ---------- Inbox copy (the in-app template registry — same notes.ts discipline) ----------

const label2 = z.string().max(80).regex(/^[\w .:'/–—()+-]*$/, "inbox label must be a controlled token");
const bounded = z.string().max(300);
const title2 = z.string().max(140);
const credits2 = z.number().int().nonnegative();

/**
 * The in-app row's copy for an event — a fixed template + whitelisted params (ids, counts, bounded
 * labels; NEVER finding/draft text — REQ-MOBILE-20's payload rule applies to the in-app channel too).
 */
export const INBOX_COPY: Record<
  NotificationEventType,
  { params: z.ZodType<unknown>; render: (p: never) => { title: string; body?: string } }
> = {
  approval_waiting: {
    params: z.object({ gateLabel: label2, projectTitle: title2.optional() }),
    render: ((p: { gateLabel: string; projectTitle?: string }) => ({
      title: `${p.gateLabel} is waiting on you`,
      ...(p.projectTitle ? { body: p.projectTitle } : {}),
    })) as never,
  },
  spend_gate: {
    params: z.object({ gateLabel: label2, projectTitle: title2.optional() }),
    render: ((p: { gateLabel: string; projectTitle?: string }) => ({
      title: `Spend needs your call: ${p.gateLabel}`,
      ...(p.projectTitle ? { body: p.projectTitle } : {}),
    })) as never,
  },
  gate_reminder: {
    params: z.object({
      gateLabel: label2,
      offsetLabel: label2,
      doNothing: label2,
      projectTitle: title2.optional(),
    }),
    render: ((p: { gateLabel: string; offsetLabel: string; doNothing: string; projectTitle?: string }) => ({
      title: `${p.gateLabel} — ${p.doNothing} in ${p.offsetLabel}`,
      ...(p.projectTitle ? { body: p.projectTitle } : {}),
    })) as never,
  },
  auto_proceeded: {
    params: z.object({
      gateLabel: label2,
      actionLabel: label2,
      spentCredits: credits2,
      capCredits: credits2,
      projectTitle: title2.optional(),
    }),
    render: ((p: {
      gateLabel: string; actionLabel: string; spentCredits: number; capCredits: number; projectTitle?: string;
    }) => ({
      title: `${p.gateLabel} proceeded — the run ${p.actionLabel}`,
      body: `${p.spentCredits} of ${p.capCredits} credits${p.projectTitle ? ` · ${p.projectTitle}` : ""}`,
    })) as never,
  },
  run_finished: {
    // RES.2 — `deliveryLabel` carries the run-level label ("Unverified"); it reads above the rest of the
    // row copy, the same slot it occupies on the run card + dossier (above the verdict).
    // UX.1 (ADR-063) — a `completed_partial` run never claims it "finished": the partial flag rewords
    // the title so the row says exactly what happened (kept results, not a completed deliverable).
    params: z.object({
      projectTitle: title2.optional(),
      workflowLabel: label2.optional(),
      deliveryLabel: label2.optional(),
      partial: z.boolean().optional(),
    }),
    render: ((p: { projectTitle?: string; workflowLabel?: string; deliveryLabel?: string; partial?: boolean }) => ({
      title: p.partial
        ? `${p.workflowLabel ?? "Run"} stopped early — the kept results are ready`
        : `${p.workflowLabel ?? "Run"} finished — the deliverable is ready`,
      ...(p.deliveryLabel
        ? {
            body: `${p.deliveryLabel} — claims could not be checked; research credits refunded.${p.projectTitle ? ` · ${p.projectTitle}` : ""}`,
          }
        : p.projectTitle
          ? { body: p.projectTitle }
          : {}),
    })) as never,
  },
  run_failed: {
    params: z.object({ projectTitle: title2.optional() }),
    render: ((p: { projectTitle?: string }) => ({
      title: "Run failed — see what was kept",
      ...(p.projectTitle ? { body: p.projectTitle } : {}),
    })) as never,
  },
  run_cancelled_recovered: {
    // UX.1 (ADR-063) — "Run recovered" named nothing; the honest version says the run stalled and
    // the system restarted it (a heartbeat-stale orphan requeue is exactly that).
    params: z.object({ variant: z.enum(["cancelled", "recovered"]), projectTitle: title2.optional() }),
    render: ((p: { variant: "cancelled" | "recovered"; projectTitle?: string }) => ({
      title:
        p.variant === "cancelled"
          ? "Run was cancelled by the system"
          : "Run stalled — restarted automatically",
      ...(p.projectTitle ? { body: p.projectTitle } : {}),
    })) as never,
  },
  voice_stale: {
    params: z.object({ personaName: label2, pillLabel: label2 }),
    render: ((p: { personaName: string; pillLabel: string }) => ({
      title: `Voice needs attention: ${p.personaName}`,
      body: p.pillLabel,
    })) as never,
  },
  credits_threshold: {
    params: z.object({ percent: z.number().int().min(1).max(100) }),
    render: ((p: { percent: number }) => ({ title: `Credits: ${p.percent}% used` })) as never,
  },
  trial_payment: {
    params: z.object({ reason: bounded }),
    render: ((p: { reason: string }) => ({ title: p.reason })) as never,
  },
  chat_reply: {
    params: z.object({ projectTitle: title2.optional() }),
    render: ((p: { projectTitle?: string }) => ({
      title: "The Assistant replied",
      ...(p.projectTitle ? { body: p.projectTitle } : {}),
    })) as never,
  },
  run_progress: {
    params: z.object({
      phase: label2,
      ordinal: z.number().int().positive(),
      of: z.number().int().positive(),
      projectTitle: title2.optional(),
    }),
    render: ((p: { phase: string; ordinal: number; of: number; projectTitle?: string }) => ({
      title: `Phase ${p.ordinal} of ${p.of} finished: ${p.phase}`,
      ...(p.projectTitle ? { body: p.projectTitle } : {}),
    })) as never,
  },
  product_update: {
    params: z.object({ subject: bounded }),
    render: ((p: { subject: string }) => ({ title: p.subject })) as never,
  },
};

export function renderInboxCopy<K extends NotificationEventType>(
  type: K,
  params: unknown,
): { title: string; body?: string } {
  const entry = INBOX_COPY[type];
  const parsed = entry.params.parse(params);
  return (entry.render as (p: never) => { title: string; body?: string })(parsed as never);
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
    z.object({ projectTitle: title.optional(), openUrl: url, deliveryLabel: label.optional() }),
    (p) => {
      const where = p.projectTitle ? ` on “${p.projectTitle}”` : "";
      // RES.2 — an Unverified delivery leads with the run-level label, above everything else in the body
      // (the same slot it occupies above the verdict on the card + dossier), and states the refund.
      const lines = p.deliveryLabel
        ? [
            `${p.deliveryLabel} — research could not check the claims${where}.`,
            `The research-phase credits were refunded.`,
            `Open the project to read the deliverable.`,
          ]
        : [`Your run finished${where} — the deliverable is ready.`, `Open the project to read it.`];
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

  // ---- P1.19 — the deferred §5.11 email rows ----

  /** §5.11 "voice stale → email: weekly digest" — the ONLY mail the event sends. */
  voice_stale: define(
    z.object({
      count: z.number().int().positive(),
      voices: z.array(z.object({ name: label, pill: label })).min(1).max(50),
      openUrl: url,
    }),
    (p) => {
      const lines = [
        `${p.count} voice${p.count === 1 ? "" : "s"} need${p.count === 1 ? "s" : ""} attention:`,
        ...p.voices.map((v) => `• ${v.name} — ${v.pill}`),
        `Open the voice library to update.`,
      ];
      return {
        subject: `Voices: ${p.count} stale`,
        text: `${lines.join("\n")}\n\nOpen: ${p.openUrl}`,
        html: shell(lines, [{ label: "Open", url: p.openUrl }]),
      };
    },
  ),

  /** §5.11 "chat reply while backgrounded — email optional" (the opt-in arm; in-app is default). */
  chat_reply: define(
    z.object({ projectTitle: title.optional(), openUrl: url }),
    (p) => {
      const where = p.projectTitle ? ` on “${p.projectTitle}”` : "";
      const lines = [`The Assistant replied${where}.`, `Open the project to read it.`];
      return {
        subject: `New reply${where}`,
        text: `${lines.join("\n")}\n\nOpen: ${p.openUrl}`,
        html: shell(lines, [{ label: "Open", url: p.openUrl }]),
      };
    },
  ),

  /** §5.11 "product updates — email only, off by default" (the opt-in arm). */
  product_update: define(
    z.object({ subject: label, summary: z.string().max(400), openUrl: url }),
    (p) => {
      const lines = [p.subject, p.summary];
      return {
        subject: p.subject,
        text: `${lines.join("\n")}\n\nOpen: ${p.openUrl}`,
        html: shell(lines, [{ label: "Open", url: p.openUrl }]),
      };
    },
  ),
} as const;

/**
 * Mail shapes that are NOT one-event-per-row — the optional hourly run-finished digest batches several
 * finished runs into one mail (§5.11 "digest (hourly)").
 */
export const DIGEST_TEMPLATES = {
  run_finished_digest: define(
    z.object({
      count: z.number().int().positive(),
      runs: z.array(z.object({ workflowLabel: label, projectTitle: title.optional(), openUrl: url })).min(1).max(100),
    }),
    (p) => {
      const lines = [
        `${p.count} run${p.count === 1 ? "" : "s"} finished this hour:`,
        ...p.runs.map((r) => `• ${r.workflowLabel}${r.projectTitle ? ` — ${r.projectTitle}` : ""} ${r.openUrl}`),
      ];
      return {
        subject: `Runs: ${p.count} finished`,
        text: lines.join("\n"),
        html: shell(lines, p.runs.slice(0, 5).map((r) => ({ label: "Open", url: r.openUrl }))),
      };
    },
  ),
} as const;

export function renderDigest<K extends keyof typeof DIGEST_TEMPLATES>(
  key: K,
  params: z.infer<(typeof DIGEST_TEMPLATES)[K]["params"]>,
): RenderedEmail {
  const t = DIGEST_TEMPLATES[key];
  return (t.render as (p: never) => RenderedEmail)(t.params.parse(params) as never);
}

// self-check: the registry covers every email-capable event type exactly.
for (const t of EMAIL_EVENT_TYPES) {
  if (!(t in EMAIL_TEMPLATES)) throw new Error(`EMAIL_TEMPLATES missing ${t}`);
}

/** The event types that carry an email template (a subset of NOTIFICATION_EVENT_TYPES — in-app-only
 *  rows like run_progress have no mail arm at all). */
export type EmailEventType = keyof typeof EMAIL_TEMPLATES;

/** Render an email for an event type from its whitelisted params (validated + bounded like notes.ts). */
export function renderEmail<K extends EmailEventType>(
  type: K,
  params: z.infer<(typeof EMAIL_TEMPLATES)[K]["params"]>,
): RenderedEmail {
  const t = EMAIL_TEMPLATES[type];
  const parsed = t.params.parse(params);
  return (t.render as (p: never) => RenderedEmail)(parsed as never);
}
