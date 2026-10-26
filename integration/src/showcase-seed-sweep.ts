// R6CNT.2 — the prod showcase-seed sweep (`seedShowcaseProject`, idempotent). Finds every workspace
// that has at least one member but no `showcase` project and seeds the worked-example dossier for
// it, exactly as provisioning would have (the Wells fixture + the content-store letter bytes so
// they render). Memberless workspaces are skipped — nothing to attribute ownership to.
//
//   DATABASE_URL=postgres://postgres:<pw>@127.0.0.1:15433/rhema \
//     node_modules/.bin/tsx integration/src/showcase-seed-sweep.ts            # dry-run: list targets only
//   DATABASE_URL=… OBJECTS_BUCKET=rhema-prod-artifacts \
//     node_modules/.bin/tsx integration/src/showcase-seed-sweep.ts --seed    # write the seeds
//
// Prints one JSON line per workspace (counts + ids only — Manifest #10).

import pg from "pg";
import { seedShowcaseProject } from "@rhema/db";
import { createGcsContentStore } from "@rhema/mirror";
import { randomUlids } from "@rhema/orchestrator";

function need(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`[showcase-sweep] missing env ${name}`);
    process.exit(1);
  }
  return v;
}

async function main(): Promise<number> {
  const seed = process.argv.includes("--seed");
  const pool = new pg.Pool({ connectionString: need("DATABASE_URL") });
  const db = {
    exec: (s: string) => pool.query(s),
    query: (s: string, p?: unknown[]) => pool.query(s, p as never[]),
  };
  try {
    const targets = (
      await pool.query(
        `select w.id workspace_id, min(m.user_id) as user_id
           from workspaces w
           join workspace_members m on m.workspace_id = w.id
          where not exists (select 1 from projects p where p.workspace_id = w.id and p.slug = 'showcase')
          group by w.id
          order by w.id`,
      )
    ).rows as { workspace_id: string; user_id: string }[];
    console.log(
      `[showcase-sweep] mode=${seed ? "SEED" : "dry-run"} membered workspaces missing a showcase: ${targets.length}`,
    );
    if (!seed) {
      for (const t of targets) console.log(JSON.stringify({ workspaceId: t.workspace_id }));
      return 0;
    }
    const store = await createGcsContentStore({
      bucketName: process.env.OBJECTS_BUCKET ?? "rhema-prod-artifacts",
    });
    const ids = randomUlids();
    let seeded = 0;
    for (const t of targets) {
      const res = await seedShowcaseProject(db, {
        workspaceId: t.workspace_id,
        ownerId: t.user_id,
        ids: () => ids("ulid"),
        store,
      });
      seeded += 1;
      console.log(JSON.stringify({ workspaceId: t.workspace_id, projectId: res.projectId }));
    }
    const after = (
      (await pool.query("select count(*)::int n from projects where slug='showcase'")).rows[0] as {
        n: number;
      }
    ).n;
    console.log(`[showcase-sweep] seeded ${seeded}; showcase projects now ${after}`);
    return 0;
  } finally {
    await pool.end();
  }
}

void main().then((code) => process.exit(code));
