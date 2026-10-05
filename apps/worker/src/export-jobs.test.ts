import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createOrchestratorTestDb,
  seedProject,
  makeDeps,
  type OrchestratorTestDb,
  type TestDeps,
} from "@rhema/orchestrator/testing";
import { InMemoryContentStore, sha256Hex } from "@rhema/mirror";
import type { MailSender } from "@rhema/orchestrator";
import {
  handleAccountExport,
  ACCOUNT_EXPORT_LINK_TTL_MS,
  type WorkerAccountExportDeps,
} from "./export-jobs.js";

// P1.18 — the account.export consumer on PGlite (REQ-ACCT-3): a `building` row builds the zip
// through @rhema/archive, lands content-addressed in the workspace's object bucket, mints the
// 7-day token (hash only on the row), and sends the emailed link through the MailSender fixture.
// A re-delivered job on a `ready` row is a no-op; a missing store marks the row `failed`.

const MD = `# Manuscript\n\nBody text.\n`;

let db: OrchestratorTestDb;
let deps: TestDeps;
let store: InMemoryContentStore;
let seed: Awaited<ReturnType<typeof seedProject>>;
const sentMail: { to: string; subject: string; text: string; html: string }[] = [];

const mailer: MailSender = {
  async send(msg) {
    sentMail.push({ to: msg.to, subject: msg.subject, text: msg.text, html: msg.html });
    return { id: `mail_${sentMail.length}` };
  },
};

function workerDeps(): WorkerAccountExportDeps {
  return {
    systemExec: db.client,
    store,
    mailer,
    emailFrom: "rhema@test.dev",
    linkBaseUrl: "https://api.test",
    clock: deps.clock,
  };
}

/** Seed one draft artifact + the building account_exports row; returns the export id. */
async function seedBuildingExport(): Promise<string> {
  const artId = deps.ids("art");
  const verId = deps.ids("av");
  const { sha256 } = await store.putText(seed.workspaceId, MD);
  await db.pg.query(
    `insert into artifacts(id, workspace_id, project_id, kind, namespace, mirror_path, head_version_id)
     values ($1,$2,$3,'draft','shared','drafts/v1.md',$4)`,
    [artId, seed.workspaceId, seed.projectId, verId],
  );
  await db.pg.query(
    `insert into artifact_versions(id, artifact_id, ordinal, content_sha256, s3_key, bytes, media_type, created_by)
     values ($1,$2,1,$3,'k',$4,'text/markdown',$5::jsonb)`,
    [verId, artId, sha256, Buffer.byteLength(MD), JSON.stringify({ kind: "human" })],
  );
  const exportId = deps.ids("aexp");
  await db.pg.query(
    `insert into account_exports(id, workspace_id, user_id, kind, status) values ($1,$2,$3,'account_zip','building')`,
    [exportId, seed.workspaceId, seed.userId],
  );
  return exportId;
}

beforeEach(async () => {
  sentMail.length = 0;
  db = await createOrchestratorTestDb();
  deps = makeDeps(db);
  store = new InMemoryContentStore();
  seed = await seedProject(db);
});
afterEach(() => db.close());

describe("handleAccountExport (REQ-ACCT-3)", () => {
  it("builds the zip, stores it, mints the 7-day token, and emails the link", async () => {
    const exportId = await seedBuildingExport();
    const out = await handleAccountExport(workerDeps(), {
      exportId,
      workspaceId: seed.workspaceId,
      userId: seed.userId,
    });
    expect(out.status).toBe("ready");
    if (out.status === "ready") expect(out.emailed).toBe(true);

    const row = (
      await db.pg.query(
        `select status, sha256, bytes, s3_key, token_sha256, expires_at from account_exports where id = $1`,
        [exportId],
      )
    ).rows[0] as {
      status: string; sha256: string; bytes: number; s3_key: string;
      token_sha256: string; expires_at: Date;
    };
    expect(row.status).toBe("ready");
    expect(row.sha256).toBeTruthy();
    expect(row.bytes).toBeGreaterThan(0);
    // the zip is retrievable from the content-addressed store.
    expect(await store.get(row.sha256)).toBeTruthy();
    // seven-day expiry, minted off the injected clock.
    expect(row.expires_at.getTime() - deps.clock.now().getTime()).toBe(ACCOUNT_EXPORT_LINK_TTL_MS);
    // the email carries the token link; the row keeps only its hash (REQ-ARCH-30).
    expect(sentMail).toHaveLength(1);
    const link = /https:\/\/api\.test\/export\/download\?token=([^\s"<]+)/.exec(sentMail[0]!.text)?.[1];
    expect(link).toBeTruthy();
    expect(sha256Hex(link!)).toBe(row.token_sha256);
  });

  it("a re-delivered job on a ready row is a no-op (idempotent)", async () => {
    const exportId = await seedBuildingExport();
    await handleAccountExport(workerDeps(), {
      exportId,
      workspaceId: seed.workspaceId,
      userId: seed.userId,
    });
    const out = await handleAccountExport(workerDeps(), {
      exportId,
      workspaceId: seed.workspaceId,
      userId: seed.userId,
    });
    expect(out.status).toBe("skipped");
    expect(sentMail).toHaveLength(1); // no second email
  });

  it("marks the row failed when no content store is bound", async () => {
    const exportId = await seedBuildingExport();
    const out = await handleAccountExport(
      { systemExec: db.client, clock: deps.clock },
      { exportId, workspaceId: seed.workspaceId, userId: seed.userId },
    );
    expect(out.status).toBe("failed");
    const row = (
      await db.pg.query(`select status, error from account_exports where id = $1`, [exportId])
    ).rows[0] as { status: string; error: string };
    expect(row.status).toBe("failed");
    expect(row.error).toBe("content_store_unavailable");
  });
});
