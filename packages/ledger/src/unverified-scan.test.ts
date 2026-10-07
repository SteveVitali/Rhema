import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { scanHistoricalUnverifiedRuns } from "./unverified-scan.js";
import {
  createLedgerTestDb,
  seedProject,
  seedRun,
  seedBalances,
  type LedgerTestDb,
} from "./testing/index.js";

// RES.2 (REQ-SPEC-31(3)) — the historical zero-coverage scan: READ-ONLY, recomputes the delivery-time
// predicate off the persisted claim ledger for completed runs that predate `runs.delivery`, and lists
// would-be refunds for the operator's decision (it never writes a refund or a relabel).

let db: LedgerTestDb;
const WS = "ws_seed";
const BA = "ba_seed";

beforeEach(async () => {
  db = await createLedgerTestDb();
  await seedProject(db, { workspaceId: WS, billingAccountId: BA, draftN: 1 }); // dft_prj_seed_1 backs the FKs
});
afterEach(() => db.close());

// `correspondence_items` is unique on (draft_id, kind, ordinal) — a per-test counter keeps the seeded
// reviews distinct on the shared fixture draft.
let ciOrdinal = 0;

/** A completed run + its correspondence item (a real seeded draft backs `draft_id`); claims under it. */
async function seedCompletedRun(runId: string, opts: { entitlementId?: string; spent?: number } = {}) {
  await seedRun(db, { runId, workspaceId: WS, projectId: "prj_seed", state: "completed", spentCredits: opts.spent ?? 190 });
  await db.pg.query(
    `insert into correspondence_items(id, project_id, draft_id, run_id, kind, ordinal, delivered_at, artifact_ids)
       values ($1, 'prj_seed', 'dft_prj_seed_1', $2, 'review', $3, now(), '{}')`,
    [`ci_${runId}`, runId, ++ciOrdinal],
  );
  if (opts.entitlementId) {
    await db.pg.query(`update runs set entitlement_id = $2 where id = $1`, [runId, opts.entitlementId]);
  }
}

async function seedClaim(args: {
  correspondenceId: string;
  ordinal: number;
  tier: number;
  url?: string;
  sources?: string[];
}) {
  await db.pg.query(
    `insert into claims(id, correspondence_id, draft_id, ordinal, text, tier, verdict, url)
       values ($1,$2,'dft_prj_seed_1',$3,$4,$5,'unverifiable',$6)`,
    [`clm_${args.correspondenceId}_${args.ordinal}`, args.correspondenceId, args.ordinal, `claim ${args.ordinal}`, args.tier, args.url ?? null],
  );
  for (const [i, url] of (args.sources ?? []).entries()) {
    await db.pg.query(
      `insert into claim_sources(claim_id, ordinal, url, normalized_url, accessed_at, stance)
         values ($1,$2,$3,$4,now(),'supports')`,
      [`clm_${args.correspondenceId}_${args.ordinal}`, i, url, url],
    );
  }
}

/** Steps + their debit ledger rows, written directly (the scan reads ledger truth, not the write path). */
async function seedResearchDebits(runId: string, amounts: { phase: string; credits: number }[]) {
  for (const [i, a] of amounts.entries()) {
    await db.pg.query(
      `insert into steps(id, run_id, phase, ordinal, state) values ($1,$2,$3,$4,'done')`,
      [`s_${runId}_${i}`, runId, a.phase, i + 1],
    );
    await db.pg.query(
      `insert into credit_ledger(id, workspace_id, billing_account_id, kind, credits, bucket, run_id, phase_id, source, idempotency_key)
         values ($1,$2,$3,'debit',$4,'included',$5,$6,'run',$7)`,
      [`led_${runId}_${i}`, WS, BA, a.credits, runId, `s_${runId}_${i}`, `debit:${runId}:${i}`],
    );
  }
}

describe("scanHistoricalUnverifiedRuns (RES.2 historical list)", () => {
  it("lists a zero-coverage completed Review with its would-be refund, reads nothing labelled", async () => {
    await seedBalances(db, { billingAccountId: BA, balances: { included: 1000 } });
    // the incident shape: 2 checkable claims, every citation stripped at delivery (no claim_sources, null url).
    await seedCompletedRun("run_zero");
    await seedClaim({ correspondenceId: "ci_run_zero", ordinal: 1, tier: 1 });
    await seedClaim({ correspondenceId: "ci_run_zero", ordinal: 2, tier: 2 });
    await seedResearchDebits("run_zero", [
      { phase: "verification", credits: 100 },
      { phase: "discourse", credits: 60 },
      { phase: "letter", credits: 30 },
    ]);

    const res = await scanHistoricalUnverifiedRuns(db.client);
    expect(res.scanned).toBe(1);
    expect(res.unverified).toHaveLength(1);
    expect(res.unverified[0]).toMatchObject({
      runId: "run_zero",
      workspaceId: WS,
      billingAccountId: BA,
      checkableClaims: 2,
      coveredClaims: 0,
      wouldRefundCredits: 160, // verification + discourse — never the letter debit
      entitlementId: null,
      testTenant: false,
    });
    // read-only contract: no delivery label written, no refund rows created.
    const run = (await db.client.query("select delivery from runs where id='run_zero'")).rows[0] as { delivery: unknown };
    expect(run.delivery).toBeNull();
    expect((await db.client.query("select count(*)::int n from credit_ledger where kind='refund'")).rows[0]).toMatchObject({ n: 0 });
  });

  it("excludes covered, non-checkable-only, already-labelled, and test-tenant runs", async () => {
    await seedCompletedRun("run_partial");
    await seedClaim({ correspondenceId: "ci_run_partial", ordinal: 1, tier: 1, url: "https://fetched.example/x" });
    await seedClaim({ correspondenceId: "ci_run_partial", ordinal: 2, tier: 2 }); // stripped

    await seedCompletedRun("run_notier");
    await seedClaim({ correspondenceId: "ci_run_notier", ordinal: 1, tier: 3 });

    await seedCompletedRun("run_labelled");
    await seedClaim({ correspondenceId: "ci_run_labelled", ordinal: 1, tier: 1 });
    await db.pg.query(
      `update runs set delivery = '{"label":"unverified","checkableClaims":1,"coveredClaims":0}'::jsonb where id = 'run_labelled'`,
    );

    await seedCompletedRun("run_test");
    await seedClaim({ correspondenceId: "ci_run_test", ordinal: 1, tier: 1 });
    await db.pg.query(`update workspaces set is_test = true where id = $1`, [WS]);

    const res = await scanHistoricalUnverifiedRuns(db.client);
    expect(res.scanned).toBe(4);
    const ids = res.unverified.map((r) => r.runId);
    // the already-labelled run predates nothing — it's settled business, not historical.
    // the test tenant still surfaces (flagged) so the operator sees it was excluded deliberately.
    expect(ids).not.toContain("run_partial");
    expect(ids).not.toContain("run_notier");
    expect(ids).not.toContain("run_labelled");
    expect(res.unverified.find((r) => r.runId === "run_test")?.testTenant).toBe(true);
  });
});
