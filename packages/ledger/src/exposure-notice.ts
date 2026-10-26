// R6CNT.2 (REQ-LCH-4; GD-EXPOSURE-NOTICE.R6 "Approve as drafted") — the RLS-exposure notice send
// tool. Recipients = the holders of the real (non-`is_test`) workspaces active during the exposure
// window (the forensics `docs/build/reports/2026-10-21_R6FOR.2/exposure-forensics.md` established
// every identified requester/owner is operator/staff-controlled — zero external users existed
// in-window). The body is the H11-approved text VERBATIM — never edit it here; if the operator
// approves different words, the approval artifact `notice-draft.md` changes first and this constant
// is re-pinned to match (the template test asserts the approved lines).
//
// The operator-invoked CLI (`scripts/live/send-exposure-notice.mjs`) defaults to --dry-run; nothing
// in this module sends or writes on its own. Delivery mirrors deliverMeteredNotice: an idempotent
// `inbox_items` collapse-key upsert (the in-app leg) + one dedup-keyed `notification_deliveries`
// claim before the email send (a re-run never double-mails).

import type { SqlClient, IdFactory, MailSender } from "@rhema/orchestrator";

/**
 * The exposure window per R6FOR.2: RLS was bypassed by the app role from the 0026-apply
 * (2026-09-17) until the 0045/`rhema_app_login` switch took effect (fix boundary 2026-10-01T02:09Z
 * — deploy timestamp + 15-min skew, per the forensics). "Active in the window" = a session that
 * overlaps it (created before the fix boundary, not expired before the window opened).
 */
export const EXPOSURE_WINDOW_START = "2026-09-17T00:00:00Z";
export const EXPOSURE_WINDOW_END = "2026-10-01T02:09:00Z";

/** One notice recipient — a distinct user holding a real workspace that was active in the window. */
export interface ExposureNoticeRecipient {
  readonly userId: string;
  readonly email: string;
  /** One real workspace the user holds (delivery rows need a tenant key; per-user dedup collapses them). */
  readonly workspaceId: string;
}

/**
 * The recipient query (GD-EXPOSURE-NOTICE.R6 scope: "the holders of the real workspaces active in
 * the window"). Real = `workspaces.is_test = false` (the forensics' materiality note established
 * every such holder is operator/staff-controlled). Allowlisted system-pool scan — ids + email only.
 */
export async function exposureNoticeRecipients(
  exec: SqlClient,
): Promise<ExposureNoticeRecipient[]> {
  const rows = (
    await exec.query(
      `select u.id as user_id, u.email, min(w.id) as workspace_id
         from "user" u
         join workspace_members wm on wm.user_id = u.id
         join workspaces w on w.id = wm.workspace_id
        where coalesce(w.is_test, false) = false
          and exists (
            select 1 from session s
             where s.user_id = u.id
               and s.created_at <= $1::timestamptz
               and s.expires_at >= $2::timestamptz
          )
        group by u.id, u.email
        order by u.id`,
      [EXPOSURE_WINDOW_END, EXPOSURE_WINDOW_START],
    )
  ).rows as { user_id: string; email: string; workspace_id: string }[];
  return rows.map((r) => ({ userId: r.user_id, email: r.email, workspaceId: r.workspace_id }));
}

export interface ExposureNoticeMessage {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

/**
 * The H11-approved notice text — VERBATIM from `docs/build/reports/2026-10-21_R6FOR.2/notice-draft.md`
 * (GD-EXPOSURE-NOTICE.R6: operator verbatim `"Approve as drafted"`, received 2026-10-21T19:35Z).
 * Line breaks re-wrapped to 78 cols; content words, figures (252 reads / 4 write candidates), dates,
 * and the security@rhema.tools contact are unchanged.
 */
export function exposureNoticeTemplate(): ExposureNoticeMessage {
  const subject = "A security notice about your Rhema workspace data";
  const paragraphs = [
    `Hello,`,
    `We are writing to tell you plainly about a data-exposure incident that affected workspaces on Rhema.`,
    `What happened. Between 17 September 2026 and 1 October 2026, a database misconfiguration meant that row-level security — the mechanism that keeps each workspace's data separate — was switched off for the account our application used to serve requests, and several of our endpoints did not carry their own workspace check as a backstop. During that period, requests to those endpoints could return data belonging to a different workspace.`,
    `What was exposed. Our review of the full request logs for that period found that workspace data was in fact served across workspace boundaries on 252 occasions. The data involved was:\n\n- voice/persona profiles (list and detail views),\n- project details and project chat context, and\n- review dossier/correspondence content.\n\nWe also found 4 requests that may have written to another workspace's records; the evidence for those is weaker and they are most likely our own administrative activity, but we are disclosing them for completeness.`,
    `When. The first confirmed cross-tenant response was on 22 September 2026; the last was on 1 October 2026, before the fix below took full effect at approximately 02:09 UTC that day.`,
    `What we have done. We fixed the affected endpoints to always check the workspace explicitly (deployed in stages: the dossier route on 25 September, the remaining routes on 1 October), and on 1 October we moved every user-facing service to a database role that cannot bypass row-level security, so the same class of bug cannot silently recur. We also added a standing cross-tenant check to our test suite and an automated census that fails the build if a new table is added without an isolation decision.`,
    `What you should know. Every account involved in the confirmed events is an internal or staff-operated account — we have no evidence that any outside user received anyone else's data. We are telling you anyway because your workspace was part of the affected set and you deserve to know.`,
    `Questions. If you have any questions or want more detail about what was and was not exposed, reply to this message or write to security@rhema.tools. We will answer directly.`,
    `— The Rhema team`,
  ];
  const text = paragraphs.join("\n\n");
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = paragraphs
    .map((p) => {
      if (p.includes("\n- ")) {
        const [head, tail] = p.split("\n\n- ");
        const items = tail!.split("\n").map((l) => l.replace(/^- /, "").replace(/,$/, ""));
        const closing = tail!
          .split("\n\n")
          .slice(1)
          .map((s) => `<p>${esc(s)}</p>`)
          .join("\n");
        return `<p>${esc(head!)}</p>\n<ul>\n${items
          .map((i) => `<li>${esc(i)}</li>`)
          .join("\n")}\n</ul>${closing ? `\n${closing}` : ""}`;
      }
      return `<p>${esc(p)}</p>`;
    })
    .join("\n");
  return { subject, text, html };
}

/** The in-app notice row's collapse key — a re-send updates in place, never duplicates (§5.11). */
export const EXPOSURE_NOTICE_COLLAPSE_KEY = "rls-exposure-notice:v1";
/** The email leg's delivery dedup key (notification_deliveries is unique on user × channel × key). */
export const EXPOSURE_NOTICE_DEDUP_KEY = "rls-exposure-notice:v1";

export interface ExposureNoticePlan {
  readonly recipients: ExposureNoticeRecipient[];
  readonly message: ExposureNoticeMessage;
  readonly wouldEmail: number;
  readonly wouldInbox: number;
}

/** The send plan — what --dry-run prints: every recipient, the rendered message, the counts. */
export async function planExposureNotice(exec: SqlClient): Promise<ExposureNoticePlan> {
  const recipients = await exposureNoticeRecipients(exec);
  const message = exposureNoticeTemplate();
  return { recipients, message, wouldEmail: recipients.length, wouldInbox: recipients.length };
}

/**
 * Deliver the notice to every recipient: an `inbox_items` upsert per user (collapse-key idempotent)
 * plus one claimed `notification_deliveries` row + a `mailer.send` per user (dedup-keyed — a re-run
 * never double-mails). `send=false` writes nothing and sends nothing.
 */
export async function deliverExposureNotice(
  exec: SqlClient,
  deps: { ids: IdFactory; mailer?: MailSender; emailFrom?: string },
  args: { readonly send: boolean; readonly now: Date },
): Promise<
  {
    userId: string;
    email: string;
    inbox: "written" | "skipped";
    emailLeg: "sent" | "claimed" | "no_mailer" | "skipped";
  }[]
> {
  const plan = await planExposureNotice(exec);
  const out: {
    userId: string;
    email: string;
    inbox: "written" | "skipped";
    emailLeg: "sent" | "claimed" | "no_mailer" | "skipped";
  }[] = [];
  for (const r of plan.recipients) {
    if (!args.send) {
      out.push({ userId: r.userId, email: r.email, inbox: "skipped", emailLeg: "skipped" });
      continue;
    }
    // in-app leg — the §5.11 collapse-key upsert (kind 'event'; payload {type,title,body,href}).
    await exec.query(
      `insert into inbox_items(id, user_id, project_id, kind, payload, collapse_key, run_id, visible_at, read_at, created_at)
       values ($1,$2,null,'event',$3::jsonb,$4,null,$5,null,$5)
       on conflict (user_id, collapse_key) where collapse_key is not null
       do update set payload = excluded.payload, visible_at = excluded.visible_at, read_at = null`,
      [
        deps.ids("ibx"),
        r.userId,
        JSON.stringify({
          type: "security_notice",
          title: plan.message.subject,
          body: plan.message.text,
          href: "/inbox",
        }),
        EXPOSURE_NOTICE_COLLAPSE_KEY,
        args.now,
      ],
    );
    // email leg — claim the delivery row first (dedup on user × channel × key), then send.
    const claimed = await exec.query(
      `insert into notification_deliveries(id, workspace_id, user_id, channel, event_type, dedup_key, subject, status, created_at)
       values ($1,$2,$3,'email','security_notice',$4,$5,'claimed',$6)
       on conflict (user_id, channel, dedup_key) do nothing
       returning id`,
      [
        deps.ids("ndl"),
        r.workspaceId,
        r.userId,
        EXPOSURE_NOTICE_DEDUP_KEY,
        plan.message.subject,
        args.now,
      ],
    );
    if (claimed.rows.length === 0) {
      out.push({ userId: r.userId, email: r.email, inbox: "written", emailLeg: "skipped" });
      continue;
    }
    if (!deps.mailer) {
      out.push({ userId: r.userId, email: r.email, inbox: "written", emailLeg: "no_mailer" });
      continue;
    }
    await deps.mailer.send({
      to: r.email,
      subject: plan.message.subject,
      text: plan.message.text,
      html: plan.message.html,
      ...(deps.emailFrom ? { from: deps.emailFrom } : {}),
    });
    await exec.query(`update notification_deliveries set status='sent', sent_at=$2 where id=$1`, [
      (claimed.rows[0] as { id: string }).id,
      args.now,
    ]);
    out.push({ userId: r.userId, email: r.email, inbox: "written", emailLeg: "sent" });
  }
  return out;
}
