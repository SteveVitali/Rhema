import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createOrchestratorTestDb,
  seedProject,
  seedRun,
  makeDeps,
  type OrchestratorTestDb,
  type TestDeps,
} from "@rhema/orchestrator/testing";
import { createRun } from "@rhema/orchestrator";
import { deliverRun } from "@rhema/orchestrator";
import { InMemoryContentStore } from "@rhema/mirror";
import type { ConversionResult } from "@rhema/contracts";
import { normalizeUrl } from "@rhema/contracts";
import { createImportedDraft } from "./import.js";
import { createApp, type Principal } from "./index.js";
import type { SqlClient } from "./invite.js";
import type { ExportRunner } from "./export-routes.js";

// R7HOME.2a (REQ-HOME-4, REQ-VIS-4, REQ-DATA-21) — the four freeze triggers, one test each, on a
// WORKING imported draft produced by the real `createImportedDraft` path. Each fails when its
// trigger call is removed:
//   • run read — run-creation's promote-on-launch freeze (`run_read`);
//   • dossier reference — delivery's `freezeDraft` (`dossier_ref`);
//   • promote — the product's Promote IS promote-on-launch: the run sheet's "will be promoted to vN"
//     launch (verified: no standalone draft-promote verb exists in the codebase);
//   • export — `POST /projects/:id/export`'s `freezeDraft` (`export`), wired in this ticket.

const RESULT: ConversionResult = {
  sourceFormat: "md",
  markdown: "# Imported\n\nImported prose body.\n",
  counts: { words: 3, footnotes: 0, citationSpans: 0, tables: 0, figures: 0 },
  warnings: [],
  unconverted: [],
  quality: "clean",
  qualityNotes: [],
};

let db: OrchestratorTestDb;
let deps: TestDeps;
let sql: SqlClient;
let store: InMemoryContentStore;
let seed: Awaited<ReturnType<typeof seedProject>>;
let idc = 0;
const ids = () => `imp_${++idc}`;

const principal = (): Principal => ({
  userId: seed.userId,
  workspaceId: seed.workspaceId,
  billingAccountId: seed.billingAccountId,
});

beforeEach(async () => {
  db = await createOrchestratorTestDb();
  deps = makeDeps(db);
  sql = { query: (q, p) => db.pg.query(q, p as unknown[]) as Promise<{ rows: unknown[] }> };
  store = new InMemoryContentStore();
  idc = 0;
});
afterEach(() => db.close());

/** The working imported head, created through the real import write. */
async function importedHead(draftN = 1) {
  seed = await seedProject(db, { draftN });
  const created = await createImportedDraft(
    { db: sql, contentStore: store, ids, txRunner: db.txRunner },
    {
      projectId: seed.projectId,
      workspaceId: seed.workspaceId,
      actor: { kind: "user", userId: seed.userId },
      result: RESULT,
    },
  );
  expect(created.outcome).toBe("overwrote"); // the seeded empty head
  return created;
}

const headRow = async (draftId: string) =>
  (await db.pg.query(`select state, frozen_by, promoted_version_id from drafts where id = $1`, [draftId]))
    .rows[0] as { state: string; frozen_by: { cause: string } | null; promoted_version_id: string | null };

describe("the four freeze triggers on a working imported draft", () => {
  it("run read — a run whose lock set names the draft freezes it (cause run_read)", async () => {
    const created = await importedHead();
    const res = await createRun(deps, {
      workspaceId: seed.workspaceId,
      billingAccountId: seed.billingAccountId,
      projectId: seed.projectId,
      workflow: "review",
      seat: "editor",
      idempotencyKey: "idem-runread",
      lockSetSpec: { projectId: seed.projectId, draftId: created.draftId, corrKind: "review", corrK: 1 },
      inputs: { draftId: created.draftId, phases: {}, sidecar: true },
      inputSnapshot: { draftSha256: created.contentSha256, wordCount: 3 },
      modelProfile: { tier: "balanced" },
      modelTier: "balanced",
      rigor: "standard",
      estimateCredits: 10,
      capCredits: 20,
      rateTableVersion: 1,
      phaseClassesUsed: ["research", "judge", "generate", "package"],
      sheetLaunched: true,
      requestedBy: seed.userId,
    });
    expect(res.ok).toBe(true);
    const head = await headRow(created.draftId);
    expect(head.state).toBe("frozen");
    expect(head.frozen_by?.cause).toBe("run_read");
  });

  it("dossier reference — a delivery referencing the draft freezes it (cause dossier_ref)", async () => {
    const created = await importedHead(2);
    const RUN = "run_deliver";
    const FETCHED = "https://a.example/one";
    await seedRun(db, { runId: RUN, workspaceId: seed.workspaceId, projectId: seed.projectId, state: "finalizing" });
    await db.pg.query(
      `insert into fetch_log(run_id, ts, agent_label, attempt, kind, url, normalized_url, decision)
       values ($1, now(), 'editor', 1, 'fetch', $2, $3, 'allow')`,
      [RUN, FETCHED, normalizeUrl(FETCHED)],
    );
    const claimLedger = {
      sidecar: "claim_ledger",
      version: 1,
      claims: [{ ordinal: 1, text: "c1", tier: 2, verdict: "verified", url: FETCHED, normalizedUrl: normalizeUrl(FETCHED), humanAdded: false }],
    };
    const result = await deliverRun(
      { ...deps, store },
      {
        billingAccountId: seed.billingAccountId,
        holdLedgerId: "hold_1",
        spentCredits: 1,
        capCredits: 10,
        delivery: {
          runId: RUN,
          attempt: 1,
          workspaceId: seed.workspaceId,
          projectId: seed.projectId,
          draftId: created.draftId,
          correspondenceKind: "review",
          deliveredVersionIds: [created.versionId],
          draftPromotedVersionId: created.versionId,
          sidecars: [{ filename: "01-claim-ledger.json", json: claimLedger }],
          claimLedger: claimLedger as never,
          verdictContext: { citationDomains: new Set(), reputableDomains: new Set(), searchResultDomains: new Set() },
        },
      },
    );
    expect(result.ok).toBe(true);
    const head = await headRow(created.draftId);
    expect(head.state).toBe("frozen");
    expect(head.frozen_by?.cause).toBe("dossier_ref");
  });

  it("promote — the sheet's promote-on-launch freezes the head (POST /projects/:id/runs)", async () => {
    const created = await importedHead();
    const app = createApp({ ...deps, principal: () => principal() });
    const res = await app.request(`/projects/${seed.projectId}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        idempotencyKey: "idem-promote",
        workflow: "review",
        modelProfile: { tier: "balanced" },
        modelTier: "balanced",
        rigor: "standard",
        estimateCredits: 560,
        capCredits: 840,
        rateTableVersion: 1,
        inputs: { draftId: created.draftId, sidecar: true },
        inputSnapshot: { wordCount: 3 },
        draftId: created.draftId,
        corrKind: "review",
        corrK: 1,
      }),
    });
    expect(res.status).toBe(201);
    const head = await headRow(created.draftId);
    expect(head.state).toBe("frozen");
    // promote-on-launch records the mechanism — the run read it; the draft was promoted to vN.
    expect(head.frozen_by?.cause).toBe("run_read");
  });

  it("export — POST /projects/:id/export freezes the exported head (cause export)", async () => {
    const created = await importedHead();
    const runner: ExportRunner = {
      run: async (args) => ({
        bytes: new TextEncoder().encode(args.markdown),
        mediaType: "text/markdown; charset=utf-8",
        extension: "md",
      }),
    };
    const app = createApp({
      ...deps,
      principal: () => principal(),
      db: sql,
      contentStore: store,
      exportRunner: runner,
    });
    const res = await app.request(`/projects/${seed.projectId}/export`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ format: "md", draftId: created.draftId }),
    });
    expect(res.status).toBe(200);
    const head = await headRow(created.draftId);
    expect(head.state).toBe("frozen");
    expect(head.frozen_by?.cause).toBe("export");
    expect(head.promoted_version_id).toBe(created.versionId);
  });
});
