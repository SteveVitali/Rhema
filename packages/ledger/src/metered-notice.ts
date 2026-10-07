// ECON.1 (ADR-014 §1; REQ-SPEC-32(a); invariant "never a silent bill") — the paid-account notice for
// the `debitMode=metered` flip: the recipient query, the template (D.2 vocabulary — credits / cap /
// top-up / plan; never "you will be billed"), the send plan, and the in-app `inbox_items` leg.
// The operator-invoked CLI (`scripts/live/send-metered-notice.mjs`) defaults to --dry-run; nothing in
// this module sends or flips anything on its own.

import type { SqlClient, IdFactory, MailSender } from "@rhema/orchestrator";

/** One notice recipient — a distinct user behind a paid billing account (paid plan or top-up holder). */
export interface MeteredNoticeRecipient {
  readonly userId: string;
  readonly email: string;
  readonly workspaceId: string;
  readonly billingAccountId: string;
  /** 'subscription' | 'topup' | 'subscription+topup' — why they qualify. */
  readonly reason: string;
}

/**
 * The recipient query (ticket §7): **active paid subscriptions and top-up holders**, excluding flagged
 * test tenants (workspaces.is_test). Allowlisted system-pool scan with explicit predicates — joins
 * billing_account → workspace → members → users; emits ids + the qualifying reason, no content.
 */
export async function meteredNoticeRecipients(exec: SqlClient): Promise<MeteredNoticeRecipient[]> {
  const rows = (
    await exec.query(
      `with paid as (
         select ba.id as billing_account_id,
                bool_or(s.id is not null) as has_sub,
                bool_or(cl.id is not null) as has_topup
           from billing_accounts ba
           left join subscriptions s
             on s.billing_account_id = ba.id and s.status = 'active' and s.tier <> 'free'
           left join credit_ledger cl
             on cl.billing_account_id = ba.id and cl.kind = 'grant' and cl.bucket = 'topup'
          group by ba.id
       )
       select distinct u.id as user_id, u.email, w.id as workspace_id, p.billing_account_id,
              case when p.has_sub and p.has_topup then 'subscription+topup'
                   when p.has_sub then 'subscription' else 'topup' end as reason
         from paid p
         join workspaces w on w.billing_account_id = p.billing_account_id
         join workspace_members wm on wm.workspace_id = w.id
         join "user" u on u.id = wm.user_id
        where (p.has_sub or p.has_topup)
          and coalesce(w.is_test, false) = false
        order by u.id`,
      [],
    )
  ).rows as {
    user_id: string;
    email: string;
    workspace_id: string;
    billing_account_id: string;
    reason: string;
  }[];
  return rows.map((r) => ({
    userId: r.user_id,
    email: r.email,
    workspaceId: r.workspace_id,
    billingAccountId: r.billing_account_id,
    reason: r.reason,
  }));
}

export interface MeteredNoticeMessage {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

/**
 * The notice copy (§6 of ADR-014's gate — sent BEFORE the flip; REQ-BILL-2's 30-day spirit).
 * Canonical vocabulary only: credits, cap, top-up, plan. It announces that charges will follow the
 * measured meter — it never says "you will be billed" (invariant #1 / REQ-BILL-18) and never names a
 * price that did not come from the store.
 */
export function meteredNoticeTemplate(args: {
  readonly effectiveDate: string; // ISO date the operator chose
  readonly appOrigin: string; // e.g. https://rhema.app
}): MeteredNoticeMessage {
  const { effectiveDate, appOrigin } = args;
  const subject = `An update to how runs charge credits — effective ${effectiveDate}`;
  const text = [
    `Hi,`,
    ``,
    `Starting ${effectiveDate}, a run's charge will follow its measured usage exactly: the credits`,
    `drawn equal what the run actually used, still capped at the guaranteed cap shown on the run`,
    `sheet before you start it. Until now a run charged the committed estimate at each phase; now`,
    `the final figure is the metered one — sometimes a little higher, sometimes a little lower.`,
    ``,
    `What stays the same:`,
    `- Your cap is unchanged: a run can never exceed the cap you consented to.`,
    `- Your plan and credit price are unchanged.`,
    `- Failed runs are still refunded; a run that hits its cap still stops there.`,
    ``,
    `If you keep a top-up balance, it carries over untouched. You can see every run's metered`,
    `figure — credits and dollars — on its run card and on your Usage page:`,
    `${appOrigin}/usage`,
    ``,
    `Questions? Reply to this email.`,
    ``,
    `— Rhema`,
  ].join("\n");
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = [
    `<p>Hi,</p>`,
    `<p>Starting <strong>${esc(effectiveDate)}</strong>, a run's charge will follow its measured usage`,
    `exactly: the credits drawn equal what the run actually used, still capped at the guaranteed cap`,
    `shown on the run sheet before you start it. Until now a run charged the committed estimate at`,
    `each phase; now the final figure is the metered one — sometimes a little higher, sometimes a`,
    `little lower.</p>`,
    `<p><strong>What stays the same:</strong></p>`,
    `<ul>`,
    `<li>Your cap is unchanged: a run can never exceed the cap you consented to.</li>`,
    `<li>Your plan and credit price are unchanged.</li>`,
    `<li>Failed runs are still refunded; a run that hits its cap still stops there.</li>`,
    `</ul>`,
    `<p>If you keep a top-up balance, it carries over untouched. You can see every run's metered`,
    `figure — credits and dollars — on its run card and on your`,
    `<a href="${esc(appOrigin)}/usage">Usage page</a>.</p>`,
    `<p>Questions? Reply to this email.</p>`,
    `<p>— Rhema</p>`,
  ].join("\n");
  return { subject, text, html };
}

/** The in-app notice row's collapse key — a re-send updates in place, never duplicates (§5.11). */
export const METERED_NOTICE_COLLAPSE_KEY = "metered-debit-notice:v1";
/** The email leg's delivery dedup key (notification_deliveries is unique on user × channel × key). */
export const METERED_NOTICE_DEDUP_KEY = "metered-debit-notice:v1";

export interface MeteredNoticePlan {
  readonly recipients: MeteredNoticeRecipient[];
  readonly message: MeteredNoticeMessage;
  readonly wouldEmail: number;
  readonly wouldInbox: number;
}

/** The send plan — what --dry-run prints: every recipient, the rendered message, the counts. */
export async function planMeteredNotice(
  exec: SqlClient,
  args: { readonly effectiveDate: string; readonly appOrigin: string },
): Promise<MeteredNoticePlan> {
  const recipients = await meteredNoticeRecipients(exec);
  const message = meteredNoticeTemplate(args);
  return { recipients, message, wouldEmail: recipients.length, wouldInbox: recipients.length };
}

/**
 * Deliver the notice to every recipient: an `inbox_items` upsert per user (the in-app leg; collapse
 * key makes re-sends idempotent) plus one claimed `notification_deliveries` row + a `mailer.send`
 * per user (the email leg; dedup-keyed so a re-run never double-mails). Returns per-recipient
 * outcomes so the CLI can print them. `send=false` (dry-run) writes nothing and sends nothing.
 */
export async function deliverMeteredNotice(
  exec: SqlClient,
  deps: { ids: IdFactory; mailer?: MailSender; emailFrom?: string },
  args: {
    readonly effectiveDate: string;
    readonly appOrigin: string;
    readonly send: boolean;
    readonly now: Date;
  },
): Promise<
  {
    userId: string;
    email: string;
    inbox: "written" | "skipped";
    emailLeg: "sent" | "claimed" | "no_mailer" | "skipped";
  }[]
> {
  const plan = await planMeteredNotice(exec, args);
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
          type: "billing_notice",
          title: plan.message.subject,
          body: plan.message.text,
          href: "/usage",
        }),
        METERED_NOTICE_COLLAPSE_KEY,
        args.now,
      ],
    );
    // email leg — claim the delivery row first (dedup on user × channel × key: a re-run finds the
    // claimed row and never double-sends), then send through the injected mailer seam.
    const claimed = await exec.query(
      `insert into notification_deliveries(id, workspace_id, user_id, channel, event_type, dedup_key, subject, status, created_at)
       values ($1,$2,$3,'email','billing_notice',$4,$5,'claimed',$6)
       on conflict (user_id, channel, dedup_key) do nothing
       returning id`,
      [
        deps.ids("ndl"),
        r.workspaceId,
        r.userId,
        METERED_NOTICE_DEDUP_KEY,
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
