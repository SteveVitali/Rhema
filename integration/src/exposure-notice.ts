// R6CNT.2 — the live entrypoint behind scripts/live/send-exposure-notice.mjs. Operator-invoked
// send of the H11-approved RLS-exposure notice (`@rhema/ledger` exposure-notice.ts;
// GD-EXPOSURE-NOTICE.R6 "Approve as drafted", R6FOR.2 verdict YES): --dry-run (the DEFAULT)
// prints the recipient list + rendered template + counts and writes nothing; --send additionally
// writes the inbox rows + claims the delivery rows + mails through Resend.
//
//   DATABASE_URL       a pg connection string able to see every workspace (the system role)
//   RESEND_API_KEY     required only for --send (the email leg; the inbox rows still write without it)
//   EMAIL_FROM         e.g. "Rhema <security@rhema.tools>" for --send
//   --send             actually deliver; absent ⇒ dry-run print only
//
// Exit 0 on a clean plan/send; 1 on a connection/usage error. ids + counts only in the output
// (no user content — Manifest #10; emails are the minimum needed to operate the send).

import pg from "pg";
import { randomUUID } from "node:crypto";
import type { SqlClient, IdFactory } from "@rhema/orchestrator";
import { deliverExposureNotice, planExposureNotice } from "@rhema/ledger";
import type { MailSender } from "@rhema/orchestrator";

function need(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`[exposure-notice] missing env ${name}`);
    process.exit(1);
  }
  return v;
}

/** Minimal Resend sender for the operator CLI (the deployed mailer lives in apps/worker). */
function resendMailer(apiKey: string): MailSender {
  return {
    async send(msg) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          from: msg.from ?? need("EMAIL_FROM"),
          to: msg.to,
          subject: msg.subject,
          text: msg.text,
          html: msg.html,
        }),
      });
      const body = (await res.json()) as { id?: string; message?: string };
      if (!res.ok || !body.id) {
        throw new Error(`resend send failed ${res.status}: ${body.message ?? "unknown"}`);
      }
      return { id: body.id };
    },
  };
}

async function main(): Promise<number> {
  const send = process.argv.includes("--send");
  const pool = new pg.Pool({ connectionString: need("DATABASE_URL") });
  const exec: SqlClient = {
    query: (text, params) => pool.query(text, params as never[]),
  };
  const ids: IdFactory = (prefix) => `${prefix}_${randomUUID()}`;
  try {
    const plan = await planExposureNotice(exec);
    console.log(`[exposure-notice] mode=${send ? "SEND" : "dry-run"}`);
    console.log(`[exposure-notice] recipients=${plan.wouldEmail}`);
    for (const r of plan.recipients) {
      console.log(JSON.stringify({ userId: r.userId, email: r.email }));
    }
    console.log("---- subject ----");
    console.log(plan.message.subject);
    console.log("---- text ----");
    console.log(plan.message.text);
    if (!send) {
      console.log(
        "[exposure-notice] dry-run — nothing written, nothing sent (pass --send to deliver)",
      );
      return 0;
    }
    const apiKey = process.env.RESEND_API_KEY;
    const mailer = apiKey ? resendMailer(apiKey) : undefined;
    const out = await deliverExposureNotice(
      exec,
      {
        ids,
        ...(mailer ? { mailer } : {}),
        ...(process.env.EMAIL_FROM ? { emailFrom: process.env.EMAIL_FROM } : {}),
      },
      { send: true, now: new Date() },
    );
    for (const o of out) console.log(JSON.stringify(o));
    console.log(
      `[exposure-notice] delivered ${out.filter((o) => o.emailLeg === "sent").length} emails, ${out.filter((o) => o.inbox === "written").length} inbox rows`,
    );
    return 0;
  } finally {
    await pool.end();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error("[exposure-notice] failed:", err);
    process.exit(1);
  });
