// PRB.09 — the pg-boss → orchestrator mapping for the two notification queues (§5.11; REQ-IDE-47):
//   `notify`    — domain jobs (gate waiting / reminders / terminal / credits / trial). The handler is the
//                 orchestrator's `handleNotifyJob` — it re-reads state, claims the dedup row, mints signed
//                 action links, and enqueues `mail.send`.
//   `mail.send` — the transport leg: `ResendMailSender` wraps the Resend SDK behind the orchestrator's
//                 `MailSender` seam so every test runs against a fixture (no live send ever — AC).
// The Resend API key arrives as a Secret Manager secret-name → value at boot (env.ts), never a plaintext
// client env; the From address is plain deploy config.

import { Resend } from "resend";
import {
  handleMailSendJob,
  handleNotifyJob,
  type MailSender,
  type NotificationJobPayload,
  type OrchestratorDeps,
} from "@rhema/orchestrator";

export interface WorkerNotificationDeps extends OrchestratorDeps {
  /** unset ⇒ `mail.send` no-ops (a preview stage without a Resend key stays green). */
  readonly mailer?: MailSender;
  readonly emailFrom?: string;
}

/** The Resend adapter — the ONLY place the provider SDK is touched. */
export class ResendMailSender implements MailSender {
  private readonly client: Resend;
  constructor(
    apiKey: string,
    private readonly defaultFrom: string,
  ) {
    this.client = new Resend(apiKey);
  }

  async send(msg: { to: string; subject: string; text: string; html: string; from?: string }): Promise<{ id: string }> {
    const res = await this.client.emails.send({
      from: msg.from ?? this.defaultFrom,
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
    });
    if (res.error) throw new Error(`resend: ${res.error.message}`);
    return { id: res.data?.id ?? "" };
  }
}

export async function handleNotifyJobPayload(
  deps: WorkerNotificationDeps,
  payload: NotificationJobPayload,
): Promise<void> {
  await handleNotifyJob(deps, payload);
}

export async function handleMailSendJobPayload(
  deps: WorkerNotificationDeps,
  payload: {
    deliveryId: string;
    workspaceId: string;
    to: string;
    subject: string;
    text: string;
    html: string;
  },
): Promise<void> {
  if (!deps.mailer) return; // unconfigured transport — the delivery row stays 'claimed' for a later re-drive
  await handleMailSendJob(
    { txRunner: deps.txRunner, mailer: deps.mailer, clock: deps.clock, ...(deps.emailFrom ? { emailFrom: deps.emailFrom } : {}) },
    payload,
  );
}
