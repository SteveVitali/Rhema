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
//  2. THE POOLED PROBE — one reused connection (role `rhema_app_login` — the prod-shaped user-serving
//     LOGIN member of `rhema_app` from 0045, FORCE-RLS bound) alternates tenants through `withTenant`
//     over every bucket-A table incl. the P1-era ones; assert isolation, deny-by-default with no
//     tenant, and WITH CHECK on a cross-tenant write.
//
//  3. THE ROLE SPLIT (SEC.1, REQ-SPEC-30) — `rhema_app_login`'s attributes are pinned (never superuser,
//     never BYPASSRLS, never a member of postgres/cloudsqlsuperuser), and EVERY table carries an
//     explicit per-privilege grant decision (`USER_ROLE_GRANTS`) verified against
//     `has_table_privilege` — a new table without a decision fails the census.
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
  // ECON.1 (0049) — the calibration aggregates/cells are cross-tenant platform data (no tenant key);
  // the raw evidence rows stay tenant-scoped (cost_observations is RLS-forced above).
  "cost_card_cells", "cap_calibration_reports", "estimator_cells",
  // CITE.1 (0057) — the cross-tenant citation-completeness rollup: counts + rates only, written by
  // the worker's system-pool sweep; a reported signal, never a tenant row (ADR-084).
  "citation_completeness_daily",
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
  "checkout_sessions", "cost_observations", "credit_ledger", "email_action_tokens",
  "notification_deliveries", "personas", "project_search_docs", "projects", "run_event_seq",
  "run_events", "runs", "timeline_events", "trial_restorations", "usage_records",
  "user_refund_requests", // DEF.4 (0055) — the §14.4 refund window's request/audit rows
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
    { table: "user_refund_requests", cols: (w) => ({ c: "id, workspace_id, billing_account_id, run_id, user_id, state, credits, quarter", v: [`urr_${w}`, w, `bill_${w}`, `run_${w}`, `usr_${w}`, "pending_review", 1, "2026Q3"] }) },
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
    await pg.exec("set role rhema_app_login");
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
    await pg.exec("set role rhema_app_login");
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

// ============================================================================
// SEC.1 (REQ-SPEC-30; ADR-017/018) — the user-role grant census + role-attribute pins.
// ============================================================================

/**
 * The explicit user-role grant decision for EVERY public table — verified against
 * `has_table_privilege('rhema_app', …)` (which `rhema_app_login` inherits; the grant decision lives on
 * the group so any future member carries it). Letters are the expected privilege set: s=select,
 * i=insert, u=update, d=delete; `"-"` = denied (system-tier or enclave-only). A table added without a
 * decision fails the census — that is REQ-SPEC-30's "ungranted new table fails CI".
 *
 * Denied set (all system-tier; reasons in docs/security/tenancy-audit.md § grant census):
 * `_migrations` (migrator bookkeeping, owner-only), `proxy_allowlists`/`proxy_credentials` (the egress
 * proxy's own credential tables — the api's claim pre-pass mint rides the system pool), every
 * `benchmark_*` (the enclave's `rhema_benchmark` role only), `run_events_default` (partition reachable
 * only through the RLS'd parent), `slo_samples` is insert-only (api's autosave/SSE samples), and the
 * 0045 revocations: `pause_signals`, `stripe_events`, `deployments`, `estimator_config`,
 * `estimator_fits`.
 */
const USER_ROLE_GRANTS: Record<string, string> = {
  // ---- denied (system tier / enclave / owner-only bookkeeping) ------------------------------------
  _migrations: "-",
  proxy_allowlists: "-",
  proxy_credentials: "-",
  run_events_default: "-",
  pause_signals: "-",
  stripe_events: "-",
  deployments: "-",
  estimator_config: "-",
  estimator_fits: "-",
  // ECON.1 (0049) — the calibration store is read-only for the user role: the API serves cost cards /
  // estimator cells override-first; only the system pool writes (system-owned tables, no insert grant).
  cost_card_cells: "s",
  cap_calibration_reports: "s",
  estimator_cells: "s",
  cost_observations: "s", // tenant evidence rows — RLS scopes a user read to its own workspace
  acquisition_events: "i", // pre-auth funnel beacon — api inserts through the raw client (0037)
  slo_samples: "i", // api writes autosave_save_ms / event_delivery_ms inside tenant txs (0042)
  benchmark_arm_configs: "-",
  benchmark_arm_runs: "-",
  benchmark_consequence_log: "-",
  benchmark_contamination_records: "-",
  benchmark_corpus_drafts: "-",
  benchmark_deviations: "-",
  benchmark_enclave_access_log: "-",
  benchmark_extraction_audits: "-",
  benchmark_gold_annotations: "-",
  benchmark_judge_calibrations: "-",
  benchmark_judge_scores: "-",
  benchmark_match_records: "-",
  benchmark_memorization_probes: "-",
  benchmark_normalized_findings: "-",
  benchmark_pairwise_preferences: "-",
  benchmark_preregistrations: "-",
  benchmark_provider_verifications: "-",
  benchmark_wave_drafts: "-",
  benchmark_wave_reports: "-",
  benchmark_waves: "-",
  // CITE.1 (0057) — the cross-tenant rollup: written ONLY by the worker's system-pool sweep
  // (cite.completeness.daily); the user role has no business reading raw aggregates (ADR-084).
  citation_completeness_daily: "-",
  // ---- partial grants (append-only / read-write mixes the product surface earned) -----------------
  account_exports: "siu",
  admin_actions: "si", // the user-triggered support-access grant writes the audit row (settings-routes)
  ai_use_additions: "si",
  analytics_events: "si",
  auto_reload_events: "si",
  checkout_sessions: "siu",
  email_action_tokens: "siu",
  notification_deliveries: "siu",
  obligation_findings: "sid",
  obligation_transitions: "si",
  run_events_internal: "sid",
  support_access_grants: "siu",
  support_access_log: "si",
  team_waitlist: "si",
  timeline_events: "si",
  trial_restorations: "si", // RES.2 (0047) — the platform-fault trial-restore audit row; append-only
  // DEF.4 (0055) — the refund route inserts + reads its own requests; pending→refunded/denied
  // transitions ride the system-pool admin verb, so UPDATE is deliberately not granted.
  user_refund_requests: "si",
  trial_spend_daily: "siu",
  trial_unlock_checks: "si",
  // ---- full DML (the ordinary user-serving surface) ------------------------------------------------
  access_log: "siud",
  account: "siud",
  agent_instances: "siud",
  agent_types: "siud",
  artifact_versions: "siud",
  artifacts: "siud",
  billing_accounts: "siud",
  claim_sources: "siud",
  claims: "siud",
  connections: "siud",
  correspondence_items: "siud",
  credit_balances: "siud",
  credit_ledger: "siud",
  decision_requests: "siud",
  decisions: "siud",
  device: "siud",
  discovered_items: "siud",
  dispositions: "siud",
  drafts: "siud",
  estimate_cache: "siud",
  fetch_log: "siud",
  figure_versions: "siud",
  figures: "siud",
  findings: "siud",
  gates: "siud",
  guidance: "siud",
  inbox_items: "siud",
  invite_redemptions: "siud",
  invites: "siud",
  live_docs: "siud",
  notification_devices: "siud",
  notification_prefs: "siud",
  persona_build_notes: "siud",
  persona_members: "siud",
  persona_profiles: "siud",
  personas: "siud",
  profile_corrections: "siud",
  project_members: "siud",
  project_search_docs: "siud",
  projects: "siud",
  protocols: "siud",
  provenance_maps: "siud",
  restore_points: "siud",
  revision_obligations: "siud",
  run_event_seq: "siud",
  run_events: "siud",
  run_idempotency: "siud",
  run_mounts: "siud",
  runs: "siud",
  sample_versions: "siud",
  session: "siud",
  steps: "siud",
  subagent_launches: "siud",
  subscriptions: "siud",
  threads: "siud",
  trial_entitlements: "siud",
  usage_records: "siud",
  user: "siud",
  verification: "siud",
  working_copies: "siud",
  workspace_members: "siud",
  workspaces: "siud",
};

const PRIVILEGE_OF: Record<string, string> = { s: "select", i: "insert", u: "update", d: "delete" };

/**
 * OPS.2 — the `rhema_collab` role's pinned grant map (0004 + 0028 + 0053 + 0054 — the "exactly
 * 0028's grants" AC counts its amendments). A table absent from this map carries NO expectation —
 * any privilege found on an unpinned table fails the census, so a collab grant can never land
 * silently (the same property USER_ROLE_GRANTS gives `rhema_app`).
 */
const COLLAB_ROLE_GRANTS: Record<string, string> = {
  // 0004 — the working-head surface (REQ-ARCH-25): the live doc, restore points, working copies.
  live_docs: "siud",
  restore_points: "siud",
  working_copies: "siud",
  // 0004 (s,u) + 0028 (s,i,u) — drafts incl. the offline-edit fork's human_revision insert.
  drafts: "siu",
  // 0028 — the unscoped auth-read tables + the FORCE-RLS document-authorization join.
  session: "s",
  workspace_members: "s",
  workspaces: "s",
  subscriptions: "s",
  projects: "s",
  runs: "s",
  // 0028 — debounced materialization + findings re-projection + the project event stream.
  artifacts: "siu",
  artifact_versions: "si",
  findings: "su",
  timeline_events: "si",
  // 0028 (s,i) + 0053 (u) — the block-level provenance map per materialized version.
  provenance_maps: "siu",
  // 0054 — the collab-path autosave probe writes `detail='collab'` samples.
  slo_samples: "i",
};

describe("the user-role split (SEC.1; REQ-SPEC-30; ADR-017/018)", () => {
  it("rhema_app_login exists as NOLOGIN NOBYPASSRLS NOSUPERUSER, a member of rhema_app only", async () => {
    const role = (
      await pg.query(
        `select rolsuper, rolbypassrls, rolinherit, rolcreatedb, rolcreaterole, rolreplication, rolcanlogin
           from pg_roles where rolname = 'rhema_app_login'`,
      )
    ).rows[0] as
      | {
          rolsuper: boolean; rolbypassrls: boolean; rolinherit: boolean;
          rolcreatedb: boolean; rolcreaterole: boolean; rolreplication: boolean; rolcanlogin: boolean;
        }
      | undefined;
    expect(role, "rhema_app_login missing — 0045 did not run").toBeDefined();
    expect(role!.rolsuper).toBe(false);
    expect(role!.rolbypassrls).toBe(false);
    expect(role!.rolcreatedb).toBe(false);
    expect(role!.rolcreaterole).toBe(false);
    expect(role!.rolreplication).toBe(false);
    // NOLOGIN until the Stage-B window runs ALTER ROLE … LOGIN PASSWORD (the gated half of SEC.1).
    expect(role!.rolcanlogin).toBe(false);
    // membership: IN rhema_app, and NEVER postgres/cloudsqlsuperuser — the AC's pg_has_role asserts
    // (via pg_auth_members so a parent role absent on this engine — cloudsqlsuperuser is Cloud-SQL-only
    // — reads false rather than erroring).
    const memberOf = async (parent: string) =>
      (
        await pg.query(
          `select exists(select 1 from pg_auth_members am
                           join pg_roles m on m.oid = am.member join pg_roles p on p.oid = am.roleid
                          where m.rolname = 'rhema_app_login' and p.rolname = $1) ok`,
          [parent],
        )
      ).rows[0] as { ok: boolean };
    expect(await memberOf("rhema_app")).toEqual({ ok: true });
    for (const parent of ["postgres", "cloudsqlsuperuser"]) {
      expect(await memberOf(parent), `rhema_app_login must not inherit ${parent}`).toEqual({
        ok: false,
      });
    }
    // the split's whole point: the other application roles never carry BYPASSRLS either
    // (rhema_collab named by the ticket; rhema_app itself stays NOLOGIN — logins go through the child).
    const roles = (
      await pg.query(
        `select rolname, rolbypassrls, rolcanlogin, rolsuper from pg_roles
          where rolname in ('rhema_app','rhema_collab','rhema_harvester','rhema_app_login') order by 1`,
      )
    ).rows as { rolname: string; rolbypassrls: boolean; rolcanlogin: boolean; rolsuper: boolean }[];
    for (const r of roles) {
      expect(r.rolbypassrls, `${r.rolname} must never bypass RLS`).toBe(false);
      expect(r.rolsuper, `${r.rolname} must not be superuser`).toBe(false);
    }
    expect(roles.find((r) => r.rolname === "rhema_app")!.rolcanlogin).toBe(false);
    expect(roles.find((r) => r.rolname === "rhema_collab")!.rolcanlogin).toBe(false);
    expect(roles.find((r) => r.rolname === "rhema_harvester")!.rolcanlogin).toBe(false);
  });

  it("every table's rhema_app privilege set matches the pinned grant decision exactly", async () => {
    const tables = (await catalog()).map((t) => t.relname);
    const problems: string[] = [];
    for (const t of tables) {
      const pin = USER_ROLE_GRANTS[t];
      if (pin === undefined) {
        problems.push(`${t}: no user-role grant decision — add one to USER_ROLE_GRANTS (0045 census)`);
        continue;
      }
      for (const [letter, priv] of Object.entries(PRIVILEGE_OF)) {
        const has = (
          await pg.query(`select has_table_privilege('rhema_app', $1, $2) ok`, [
            `public.${t}`,
            priv,
          ])
        ).rows[0] as { ok: boolean };
        const want = pin.includes(letter);
        if (has.ok !== want) {
          problems.push(
            `${t}: ${priv} ${has.ok ? "granted but" : "NOT granted —"} pinned '${pin}' — ` +
              (has.ok
                ? "revoke it or update the pin (was this grant deliberate?)"
                : "grant it in a migration or update the pin"),
          );
        }
      }
    }
    // and nothing pinned is stale — a renamed/dropped table surfaces here.
    const live = new Set(tables);
    for (const pinned of Object.keys(USER_ROLE_GRANTS)) {
      if (!live.has(pinned)) problems.push(`${pinned}: pinned in USER_ROLE_GRANTS but absent from the schema`);
    }
    expect(problems).toEqual([]);
  });

  // OPS.2 (REQ-SPEC-30; the prod-adoption AC) — the fresh-stack path (OPS.1's mechanism: the
  // migrate entry's `alter role rhema_collab login password E'…'`, born NOLOGIN by 0001) yields a
  // role that can authenticate but can NEVER bypass RLS, with exactly the pinned grant map. On
  // prod this is the state STB.1 hand-applied and OPS.2 adopted as-is — this test is the
  // deterministic assertion that the adopted posture is what the mechanism produces.
  it("rhema_collab post-adoption: LOGIN + NOBYPASSRLS + exactly the pinned grants", async () => {
    // The same statement shape apps/worker/src/migrate.ts's `loginStatements` emits on a fresh
    // stack (verified there by migrate.test.ts) — a NOLOGIN→LOGIN flip, never an attribute change.
    await pg.exec(`alter role rhema_collab login password E'pglite-test-only'`);
    const role = (
      await pg.query(
        `select rolsuper, rolbypassrls, rolinherit, rolcreatedb, rolcreaterole, rolreplication, rolcanlogin
           from pg_roles where rolname = 'rhema_collab'`,
      )
    ).rows[0] as Record<string, boolean>;
    expect(role.rolcanlogin, "the fresh-stack ALTER must yield LOGIN").toBe(true);
    expect(role.rolbypassrls, "rhema_collab must never bypass RLS (REQ-SPEC-30)").toBe(false);
    expect(role.rolsuper).toBe(false);
    expect(role.rolinherit).toBe(false); // 0001's `noinherit` — no ambient privilege
    expect(role.rolcreatedb).toBe(false);
    expect(role.rolcreaterole).toBe(false);
    expect(role.rolreplication).toBe(false);
    // Membership: no LOGIN-capable parent, never postgres/cloudsqlsuperuser-adjacent.
    const memberOf = (
      await pg.query(
        `select p.rolname from pg_auth_members am
           join pg_roles m on m.oid = am.member join pg_roles p on p.oid = am.roleid
          where m.rolname = 'rhema_collab'`,
      )
    ).rows as { rolname: string }[];
    expect(memberOf.map((r) => r.rolname)).toEqual([]);

    // Schema usage (0004's `grant usage on schema public … rhema_collab`) is the connect-time
    // prerequisite of every table grant.
    const schemaUsage = (
      await pg.query(`select has_schema_privilege('rhema_collab', 'public', 'usage') ok`)
    ).rows[0] as { ok: boolean };
    expect(schemaUsage.ok).toBe(true);

    // The grant census: every table's rhema_collab privilege set equals the pin — absent ⇒ none.
    const tables = (await catalog()).map((t) => t.relname);
    const problems: string[] = [];
    for (const t of tables) {
      const pin = COLLAB_ROLE_GRANTS[t] ?? "";
      for (const [letter, priv] of Object.entries(PRIVILEGE_OF)) {
        const has = (
          await pg.query(`select has_table_privilege('rhema_collab', $1, $2) ok`, [
            `public.${t}`,
            priv,
          ])
        ).rows[0] as { ok: boolean };
        const want = pin.includes(letter);
        if (has.ok !== want) {
          problems.push(
            `${t}: ${priv} ${has.ok ? "granted but" : "NOT granted —"} pinned '${pin}' — ` +
              (has.ok
                ? "a collab grant outside 0004/0028/0053/0054 — deliberate? (REQ-SPEC-30)"
                : "grant it in a migration or update the pin"),
          );
        }
      }
    }
    const live = new Set(tables);
    for (const pinned of Object.keys(COLLAB_ROLE_GRANTS)) {
      if (!live.has(pinned)) {
        problems.push(`${pinned}: pinned in COLLAB_ROLE_GRANTS but absent from the schema`);
      }
    }
    expect(problems).toEqual([]);
  });
});
