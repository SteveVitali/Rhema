import { randomBytes } from "node:crypto";
import { buildAccountZip } from "@rhema/archive";
import { s3KeyFor, sha256Hex, type ContentStore } from "@rhema/mirror";
import type { MailSender, SqlClient } from "@rhema/orchestrator";

// P1.18 — the `account.export` consumer (REQ-ACCT-3; §13.4). The api's POST /account/export wrote the
// `account_exports` row (status 'building') and enqueued this job; the handler re-reads the row,
// builds the deterministic zip through @rhema/archive, stores the bytes content-addressed in the
// workspace's object bucket, mints the emailed-link TOKEN (the row keeps sha256(token) only — the
// secret rides the email, REQ-ARCH-30's discipline), stamps the 7-day expiry, marks the row ready,
// and sends the link through the Resend MailSender seam. Idempotent: a re-delivered job on a `ready`
// row is a no-op; a deterministic failure marks the row `failed` rather than burning pg-boss retries
// on a rebuild that cannot succeed.

export const ACCOUNT_EXPORT_QUEUE = "account.export";
/** §13.4 — the emailed zip link lives seven days from mint. */
export const ACCOUNT_EXPORT_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface AccountExportJobPayload {
  readonly exportId: string;
  readonly workspaceId: string;
  readonly userId: string;
}

export interface WorkerAccountExportDeps {
  /** system-scoped client — the worker is system-side; the row carries workspace_id (no RLS tenant). */
  readonly systemExec: SqlClient;
  /** the objects bucket seam (live: createGcsContentStore per workspace; tests: in-memory). */
  readonly contentStoreFor?: (workspaceId: string) => Promise<ContentStore>;
  readonly store?: ContentStore;
  /** the Resend seam — unset ⇒ the zip still lands `ready`; the mail leg skips (preview stages). */
  readonly mailer?: MailSender;
  readonly emailFrom?: string;
  /** the api origin the emailed token link hits (`<linkBaseUrl>/export/download?token=…`). */
  readonly linkBaseUrl?: string;
  readonly clock: { now(): Date };
}

export type AccountExportOutcome =
  | { readonly status: "ready"; readonly bytes: number; readonly emailed: boolean }
  | { readonly status: "skipped" }
  | { readonly status: "failed"; readonly error: string };

export async function handleAccountExport(
  deps: WorkerAccountExportDeps,
  payload: AccountExportJobPayload,
): Promise<AccountExportOutcome> {
  const { systemExec } = deps;
  const row = (
    await systemExec.query(
      `select id, workspace_id, user_id, status from account_exports where id = $1`,
      [payload.exportId],
    )
  ).rows[0] as { id: string; workspace_id: string; user_id: string; status: string } | undefined;
  if (!row) return { status: "skipped" };
  if (row.status === "ready") return { status: "skipped" }; // the singleton re-delivered — no second build.

  const store =
    (deps.contentStoreFor ? await deps.contentStoreFor(row.workspace_id) : deps.store) ?? null;
  if (!store) {
    await systemExec.query(
      `update account_exports set status = 'failed', error = 'content_store_unavailable' where id = $1`,
      [row.id],
    );
    return { status: "failed", error: "content_store_unavailable" };
  }

  try {
    const now = deps.clock.now();
    const zip = await buildAccountZip({
      exec: systemExec,
      store,
      workspaceId: row.workspace_id,
      exportedAt: now,
      userId: row.user_id, // §11.7 — the requester's preference profile travels in state.json
    });
    const { key } = await store.put(row.workspace_id, zip.sha256, zip.bytes);
    const token = randomBytes(24).toString("base64url");
    const expiresAt = new Date(now.getTime() + ACCOUNT_EXPORT_LINK_TTL_MS);
    await systemExec.query(
      `update account_exports
          set status = 'ready', sha256 = $2, bytes = $3, s3_key = $4, token_sha256 = $5,
              ready_at = now(), expires_at = $6
        where id = $1`,
      [row.id, zip.sha256, zip.bytes.byteLength, key ?? s3KeyFor(row.workspace_id, zip.sha256), sha256Hex(token), expiresAt],
    );

    // The emailed link — token-gated on the api (GET /export/download?token=…). Skipped legs (no
    // mailer / no origin / no user email) still leave the row ready: the in-app download path works.
    let emailed = false;
    const user = (
      await systemExec.query(`select email from "user" where id = $1`, [row.user_id])
    ).rows[0] as { email: string } | undefined;
    if (deps.mailer && deps.linkBaseUrl && user?.email) {
      const link = `${deps.linkBaseUrl.replace(/\/+$/, "")}/export/download?token=${encodeURIComponent(token)}`;
      const expires = expiresAt.toISOString().slice(0, 10);
      await deps.mailer.send({
        to: user.email,
        ...(deps.emailFrom ? { from: deps.emailFrom } : {}),
        subject: "Your Rhema export is ready",
        text: `Your account export is ready.\n\nDownload: ${link}\n\nThis link expires on ${expires} (7 days). Request a fresh export any time.`,
        html: `<p>Your account export is ready.</p><p><a href="${link}">Download the export zip</a></p><p>This link expires on ${expires} (7 days). Request a fresh export any time.</p>`,
      });
      emailed = true;
    }
    return { status: "ready", bytes: zip.bytes.byteLength, emailed };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await systemExec
      .query(`update account_exports set status = 'failed', error = $2 where id = $1`, [
        row.id,
        message.slice(0, 500),
      ])
      .catch(() => {});
    return { status: "failed", error: message };
  }
}
