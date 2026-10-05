import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { applyMigrations, withTenant, type TenantClient } from "@rhema/db";

// P1.22 — the full-surface tenancy audit (REQ-ARCH-25/26/27; REQ-DATA-4 amended). Two parts:
//
//  1. THE CENSUS — every table in the migrated schema is classified, from pg_catalog + the real FK
//     graph, into exactly one bucket; an unclassified or misclassified table fails loudly:
//       A) `workspace_id`-keyed + FORCE ROW LEVEL SECURITY + the uniform `tenant_isolation` policy
//          — the enforced tenant tables (the tables tenant routes address DIRECTLY).
//       B) `workspace_id`-keyed but deliberately unguarded — a PINNED exemption map, one reason each
//          (system-scoped stores, auth-resolution tables, the run_events partition, support tooling).
//       C) no `workspace_id`, but an FK path to a tenant table — tenancy is carried by the parent;
//          the test VERIFIES the FK chain actually resolves (not just that a comment says so).
//       D) no `workspace_id`, no FK path — a PINNED non-tenant set (auth/tenancy roots, billing-account
//          scope, benchmark enclave, references/registries, proxy internals).
//     A table added without a classification decision fails this test — that IS the enumeration the
//     ticket demands (every P1-era table included).
//
//  2. THE POOLED PROBE — one reused connection (role `rhema_app`, FORCE-RLS bound) alternates tenants
//     through `withTenant` over every bucket-A table incl. the P1-era ones; assert isolation,
//     deny-by-default with no tenant, and WITH CHECK on a cross-tenant write.
//
// Named residual (audited, not silently accepted): bucket-C child tables carry no row-level policy —
// a tenant-scoped transaction that queried a child table WITHOUT joining through its parent could
// read cross-tenant rows. Compensating controls: child ids are unguessable ULIDs, every app read runs
// inside `withTenant` and addresses children via the parent, and this census pins the set so the
// surface cannot grow unmarked. The residual is named in docs/security/tenancy-audit.md and the
// pen-test scope (P1.22).

let pg: PGlite;
let db: TenantClient & { exec(sql: string): Promise<void> };

beforeEach(async () => {
  pg = new PGlite();
  await pg.exec("select 1");
  db = { query: (s, p) => pg.query(s, p) as Promise<{ rows: unknown[] }>, exec: (s) => pg.exec(s) };
  await applyMigrations(db);
});
afterEach(() => pg.close());

interface TableRow {
  relname: string;
  relkind: string;
  relrowsecurity: boolean;
  relforcerowsecurity: boolean;
  has_ws: boolean;
}

async function catalog(): Promise<TableRow[]> {
  const res = await pg.query(
    `select c.relname, c.relkind::text, c.relrowsecurity, c.relforcerowsecurity,
            exists (select 1 from information_schema.columns k
                     where k.table_schema='public' and k.table_name=c.relname
                       and k.column_name='workspace_id') as has_ws
       from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind in ('r','p')`,
  );
  return res.rows as TableRow[];
}

async function fkParents(): Promise<Map<string, Set<string>>> {
  const res = await pg.query(
    `select distinct tc.table_name as child, ccu.table_name as parent
       from information_schema.table_constraints tc
       join information_schema.key_column_usage kcu
         on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
       join information_schema.constraint_column_usage ccu
         on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
      where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'`,
  );
  const m = new Map<string, Set<string>>();
  for (const r of res.rows as { child: string; parent: string }[]) {
    if (!m.has(r.child)) m.set(r.child, new Set());
    m.get(r.child)!.add(r.parent);
  }
  return m;
}

/** The pinned exemption set — workspace_id-keyed tables deliberately outside RLS. A change here is an
 *  audit event: every entry must keep its reason honest. */
const WS_EXEMPTIONS = new Map<string, string>([
  ["admin_actions", "operator audit — support/admin act cross-tenant by design (0020)"],
  ["pause_signals", "proxy→worker pause transport — system-scoped, never user-served (0041)"],
  ["slo_samples", "platform SLO telemetry — api writes inside its tenant tx; worker probes cross-tenant percentiles; 7d retention (0042)"],
  ["run_events_default", "default partition of RLS-forced run_events; no direct app grant (0008)"],
  ["run_events_internal", "system-scoped internal events — never served on a tenant route; 30d retention (0008)"],
  ["support_access_grants", "support tooling — the grant's purpose IS cross-tenant staff access (0040)"],
  ["support_access_log", "support audit trail — user-scoped rows, staff actor (0040)"],
  ["team_waitlist", "signup rows; workspace_id is an optional invite backlink (0036)"],
  ["workspace_members", "auth-time membership resolve predates the tenant context (0025; apps/collab sql.ts)"],
]);

/** Bucket C — the tenant-by-FK child tables (verified against the live FK graph below). */
const TENANT_BY_FK = new Set([
  "access_log", "agent_instances", "artifact_versions", "claim_sources", "claims", "connections",
  "correspondence_items", "decision_requests", "decisions", "discovered_items", "dispositions",
  "drafts", "fetch_log", "figure_versions", "figures", "findings", "gates", "guidance", "live_docs",
  "obligation_findings", "obligation_transitions", "persona_build_notes", "persona_members",
  "persona_profiles", "profile_corrections", "project_members", "provenance_maps", "restore_points",
  "revision_obligations", "run_idempotency", "run_mounts", "sample_versions", "steps",
  "subagent_launches", "threads", "working_copies",
]);

/** Bucket D — no tenant key, no FK path: auth/tenancy roots, billing-account scope, the benchmark
 *  enclave, references/registries, proxy internals. A user-facing row landing here is a bug this test catches. */
const NON_TENANT = new Set([
  // auth + tenancy roots (they RESOLVE the tenant — chicken-and-egg; collab/sql.ts says it verbatim)
  "user", "account", "session", "verification", "device", "workspaces",
  "invites", "invite_redemptions",
  // billing-account scope (the tenant key is billing_account_id; route-enforced)
  "billing_accounts", "subscriptions", "credit_balances",
  "trial_entitlements", "trial_spend_daily", "trial_unlock_checks",
  // user-scoped surfaces (the tenant key is user_id; route-enforced)
  "inbox_items", "notification_devices", "notification_prefs",
  // system stores / registries / internals
  "_migrations", "agent_types", "protocols", "deployments", "acquisition_events",
  "estimate_cache", "estimator_config", "estimator_fits", "stripe_events",
  "proxy_credentials", "proxy_allowlists",
  // the benchmark enclave (isolated system surface)
  "benchmark_arm_configs", "benchmark_arm_runs", "benchmark_consequence_log",
  "benchmark_contamination_records", "benchmark_corpus_drafts", "benchmark_deviations",
  "benchmark_enclave_access_log", "benchmark_extraction_audits", "benchmark_gold_annotations",
  "benchmark_judge_calibrations", "benchmark_judge_scores", "benchmark_match_records",
  "benchmark_memorization_probes", "benchmark_normalized_findings",
  "benchmark_pairwise_preferences", "benchmark_preregistrations",
  "benchmark_provider_verifications", "benchmark_wave_drafts", "benchmark_wave_reports",
  "benchmark_waves",
]);

/** The enforced tenant set — workspace_id + FORCE RLS + the uniform policy. */
const EXPECTED_RLS_FORCED = new Set([
  "account_exports", "ai_use_additions", "analytics_events", "artifacts", "auto_reload_events",
  "checkout_sessions", "credit_ledger", "email_action_tokens", "notification_deliveries",
  "personas", "project_search_docs", "projects", "run_event_seq", "run_events", "runs",
  "timeline_events", "usage_records",
]);

describe("the tenancy census (REQ-ARCH-25/26 — every table classified, exhaustively)", () => {
  it("every table lands in exactly one pinned bucket; no unclassified table exists", async () => {
    const tables = await catalog();
    const parents = await fkParents();
    const wsSet = new Set(tables.filter((t) => t.has_ws).map((t) => t.relname));
    const pathToWs = (t: string, seen = new Set<string>()): boolean => {
      if (seen.has(t)) return false;
      seen.add(t);
      for (const p of parents.get(t) ?? []) if (wsSet.has(p) || pathToWs(p, seen)) return true;
      return false;
    };

    const problems: string[] = [];
    const classified = new Set<string>();
    for (const t of tables) {
      const name = t.relname;
      if (t.has_ws) {
        const guarded = t.relrowsecurity && t.relforcerowsecurity;
        if (guarded && EXPECTED_RLS_FORCED.has(name)) classified.add(name);
        else if (!guarded && WS_EXEMPTIONS.has(name)) classified.add(name);
        else problems.push(`${name}: ws-keyed, ${guarded ? "RLS'd but not in the pinned set" : "unguarded and not exempted"}`);
      } else if (pathToWs(name)) {
        if (TENANT_BY_FK.has(name)) classified.add(name);
        else problems.push(`${name}: tenant-by-FK child not in the census`);
      } else {
        if (NON_TENANT.has(name)) classified.add(name);
        else problems.push(`${name}: non-tenant table not in the census`);
      }
    }
    // and nothing pinned is stale — a renamed/dropped table surfaces here, not silently.
    const live = new Set(tables.map((t) => t.relname));
    for (const pinned of [...EXPECTED_RLS_FORCED, ...WS_EXEMPTIONS.keys(), ...TENANT_BY_FK, ...NON_TENANT]) {
      if (!live.has(pinned)) problems.push(`${pinned}: pinned but absent from the schema`);
    }
    // every ws-keyed guarded table carries the uniform tenant_isolation policy.
    const pols = new Set(
      (await pg.query(`select tablename from pg_policies where policyname='tenant_isolation'`))
        .rows.map((r) => (r as { tablename: string }).tablename),
    );
    for (const name of EXPECTED_RLS_FORCED) {
      if (!pols.has(name)) problems.push(`${name}: RLS-forced but no tenant_isolation policy`);
    }
    expect(problems).toEqual([]);
    expect(classified.size).toBe(tables.length);
  });
});

describe("the two-tenant pooled probe over the full enforced surface (REQ-DATA-4)", () => {
  // Insert minimal rows for both tenants in every bucket-A table (superuser — RLS bypasses the owner),
  // then read through `withTenant` as `rhema_app` on ONE reused connection.
  const TENANT_TABLES: { table: string; cols: (ws: string) => { c: string; v: unknown[] } }[] = [
    { table: "projects", cols: (w) => ({ c: "id, workspace_id, owner_id, title, slug", v: [`prj_${w}`, w, `usr_${w}`, "P", `s-${w}`] }) },
    { table: "personas", cols: (w) => ({ c: "id, workspace_id, mode, kind", v: [`per_${w}`, w, "self", "leaf"] }) },
    { table: "artifacts", cols: (w) => ({ c: "id, workspace_id, project_id, kind, namespace, mirror_path", v: [`art_${w}`, w, `prj_${w}`, "draft", "ns", `p/${w}`] }) },
    { table: "analytics_events", cols: (w) => ({ c: "id, workspace_id, event", v: [`ae_${w}`, w, "e"] }) },
    { table: "ai_use_additions", cols: (w) => ({ c: "id, workspace_id, project_id, sentence, by_actor", v: [`ai_${w}`, w, `prj_${w}`, "s", '{"kind":"user"}'] }) },
    { table: "project_search_docs", cols: (w) => ({ c: "id, project_id, workspace_id, kind", v: [`psd_${w}`, `prj_${w}`, w, "project"] }) },
    { table: "timeline_events", cols: (w) => ({ c: "id, project_id, workspace_id, type, payload", v: [`te_${w}`, `prj_${w}`, w, "t", "{}"] }) },
    { table: "notification_deliveries", cols: (w) => ({ c: "id, workspace_id, user_id, event_type, dedup_key", v: [`nd_${w}`, w, `usr_${w}`, "gate.opened", `dk_${w}`] }) },
    { table: "checkout_sessions", cols: (w) => ({ c: "id, workspace_id, billing_account_id, kind", v: [`cs_${w}`, w, `bill_${w}`, "subscribe"] }) },
    { table: "auto_reload_events", cols: (w) => ({ c: "id, workspace_id, billing_account_id, reason, outcome", v: [`ar_${w}`, w, `bill_${w}`, "below_threshold", "skipped"] }) },
    { table: "account_exports", cols: (w) => ({ c: "id, workspace_id, user_id", v: [`ax_${w}`, w, `usr_${w}`] }) },
    { table: "usage_records", cols: (w) => ({ c: "id, ts, workspace_id, billing_account_id, run_id, role, provider, model, model_tier, rate_table_version, list_cost_usd, credits, source", v: [`ur_${w}`, new Date(), w, `bill_${w}`, `run_${w}`, "editor", "anthropic", "claude-opus-5", "frontier", 1, 0, 0, "proxy"] }) },
    { table: "credit_ledger", cols: (w) => ({ c: "id, workspace_id, billing_account_id, kind, credits, bucket, source, idempotency_key", v: [`cl_${w}`, w, `bill_${w}`, "grant", 1, "included", "seed", `ik_${w}`] }) },
    { table: "runs", cols: (w) => ({ c: "id, workspace_id, workflow, state, inputs, model_profile, model_tier, rigor, estimate_credits, cap_credits, rate_table_version", v: [`run_${w}`, w, "review", "running", "{}", "balanced", "balanced", "standard", 1, 1, 1] }) },
    { table: "run_event_seq", cols: (w) => ({ c: "run_id, workspace_id", v: [`run_${w}`, w] }) },
    { table: "run_events", cols: (w) => ({ c: "run_id, seq, workspace_id, day, type, payload, density, at", v: [`run_${w}`, 1, w, "2026-09-02", "run.state_changed", "{}", "normal", new Date()] }) },
    { table: "email_action_tokens", cols: (w) => ({ c: "id, workspace_id, gate_id, run_id, user_id, action, expires_at", v: [`eat_${w}`, w, `gate_${w}`, `run_${w}`, `usr_${w}`, "open", new Date()] }) },
  ];

  it("isolates every enforced tenant table on one reused connection", async () => {
    // seed parents (superuser — RLS bypasses the owner)
    await pg.exec(`
      insert into billing_accounts (id) values ('bill_ws_a'), ('bill_ws_b');
      insert into workspaces (id, kind, name, billing_account_id) values
        ('ws_a','personal','A','bill_ws_a'), ('ws_b','personal','B','bill_ws_b');
      insert into "user" (id, email) values ('usr_ws_a','a@x.test'), ('usr_ws_b','b@x.test');
    `);
    for (const w of ["ws_a", "ws_b"]) {
      for (const t of TENANT_TABLES) {
        const { c, v } = t.cols(w);
        if (t.table === "email_action_tokens") {
          // the token's gate + run FKs need parents first
          await pg.query(`insert into gates(id, run_id, kind, on_expiry, opened_at, blocking)
            values ($1,$2,'refusal','cancel',now(),true) on conflict do nothing`, [`gate_${w}`, `run_${w}`]).catch(() => undefined);
        }
        const ph = v.map((_, i) => `$${i + 1}`).join(",");
        await pg.query(`insert into ${t.table}(${c}) values (${ph})`, v);
      }
    }
    await pg.exec("set role rhema_app");
    try {
      for (const t of TENANT_TABLES) {
        const a = await withTenant(db, "ws_a", (tx) => tx.query(`select * from ${t.table}`));
        const b = await withTenant(db, "ws_b", (tx) => tx.query(`select * from ${t.table}`));
        const aWs = new Set((a.rows as { workspace_id: string }[]).map((r) => r.workspace_id));
        const bWs = new Set((b.rows as { workspace_id: string }[]).map((r) => r.workspace_id));
        expect(aWs, `${t.table} leaked under ws_a`).toEqual(new Set(["ws_a"]));
        expect(bWs, `${t.table} leaked under ws_b`).toEqual(new Set(["ws_b"]));
        // deny-by-default: no tenant set → nothing visible on the same connection.
        const none = await db.query(`select count(*)::int c from ${t.table}`);
        expect((none.rows[0] as { c: number }).c, `${t.table} visible without a tenant`).toBe(0);
      }
      // WITH CHECK: a tenant cannot write another tenant's row (projects stands in for all).
      await expect(
        withTenant(db, "ws_a", (tx) =>
          tx.query(`insert into projects(id, workspace_id, owner_id, title, slug) values ('evil','ws_b','usr_ws_a','X','x')`),
        ),
      ).rejects.toThrow();
    } finally {
      await pg.exec("reset role");
    }
  });

  it("the exempted tables are unreachable-or-system under the app role exactly as documented", async () => {
    await pg.exec("set role rhema_app");
    try {
      // run_events_default has no direct grant — the partition is only reachable through the RLS'd parent.
      await expect(db.query("select count(*) from run_events_default")).rejects.toThrow();
      // the auth-resolution table is reachable but carries no tenant filter — the audit's stated posture.
      const wm = await db.query("select count(*)::int c from workspace_members");
      expect((wm.rows[0] as { c: number }).c).toBe(0);
    } finally {
      await pg.exec("reset role");
    }
  });
});
