// SEC.1 (REQ-SPEC-30; ADR-017; journey step X1's API half) — the two-tenant isolation probe.
//
// DETERMINISTIC mode (default — `vitest` drives it, or `tsx two-tenant-probe.ts`): the real api
// createApp() over PGlite, bound EXACTLY as prod binds it — `deps.principal` is
// `sessionScopedPrincipal` (the ALS), `deps.db` is `createScopedDb(userPool, { role:
// rhema_app_login })`, and `txRunner` already pins `rhema_app_login` in the harness — so the probe
// exercises the same privilege/RLS posture the user-serving pool runs under. Two tenants (A, B) are
// seeded with marker-bearing rows across the whole entity surface; EVERY tenant-scoped GET route
// from Hono's `app.routes` census is then called as A with B's ids substituted into the path params
// (and as a bare list), and the response is scanned for B's markers. Any B marker in A's view —
// beyond the id the requester themselves supplied in the path — is a finding. The census is pinned:
// a GET route that is neither probed nor explicitly exempted below FAILS the run, so a new tenant
// read can never slip past unprobed.
//
// LIVE mode (`tsx two-tenant-probe.ts --base-url https://api.rhema.tools [--web-url https://rhema.tools]`):
// takes two session cookies from env (`PROBE_SESSION_A`, `PROBE_SESSION_B` — real magic-link sessions,
// never persisted), calls the tenant list routes as each tenant, treats each tenant's own response
// ids as that tenant's marker set, and asserts zero cross-visibility; then fetches the web pages
// /voices, /app, /app/inbox, /usage and looks for the other tenant's markers in the HTML. Session
// material goes nowhere but the request headers.

import {
  createOrchestratorTestDb,
  seedProject,
  seedRun,
  seedGate,
  makeDeps,
  type OrchestratorTestDb,
} from "@rhema/orchestrator/testing";
import { USER_SERVING_ROLE } from "@rhema/db";
import { quarantineKey, convertedResultKey, USERCONTENT_URL_TTL_SECONDS, type UserContentSigner } from "@rhema/contracts";
import {
  createApp,
  createScopedDb,
  runWithPrincipal,
  sessionScopedPrincipal,
  type Principal,
  type TenantPool,
} from "@rhema/api";

// ---------------------------------------------------------------- markers ----

/** Every seeded entity id for a tenant — the marker set a foreign response must never contain. */
export interface TenantMarkers {
  readonly userId: string;
  readonly workspaceId: string;
  readonly billingAccountId: string;
  readonly projectId: string;
  readonly draftId: string;
  readonly runId: string;
  readonly gateId: string;
  readonly personaId: string;
  readonly connectionId: string;
  readonly discoveredItemId: string;
  readonly threadId: string;
  readonly artifactId: string;
  readonly artifactVersionId: string;
  readonly correspondenceId: string;
  readonly findingId: string;
  readonly figureId: string;
  readonly liveDocId: string;
  readonly restorePointId: string;
  readonly decisionRequestId: string;
  readonly checkoutSessionId: string;
  readonly guidanceId: string;
  readonly inboxItemId: string;
  readonly actionTokenId: string;
  /** DEF.4 — a completed, in-window, debit-bearing run: the refund WRITE leg's target. */
  readonly refundableRunId: string;
  /** human-readable marker strings (names/titles) that must never cross. */
  readonly textMarkers: readonly string[];
  /** every marker — ids + text — flattened for the response scan. */
  readonly all: readonly string[];
}

/** Seed a full entity surface for one tenant with `t` baked into every id + marker string. */
export async function seedProbeTenant(db: OrchestratorTestDb, t: "a" | "b"): Promise<TenantMarkers> {
  const userId = `usr_probe_${t}`;
  const billingAccountId = `ba_probe_${t}`;
  const workspaceId = `ws_probe_${t}`;
  const projectId = `prj_probe_${t}`;
  const seed = await seedProject(db, {
    userId, billingAccountId, workspaceId, projectId, draftN: 1, draftId: `dft_probe_${t}`,
  });
  const draftId = seed.draftId!;
  const runId = `run_probe_${t}`;
  await seedRun(db, { runId, workspaceId, projectId, state: "running" });
  const gateId = `gate_probe_${t}`;
  await seedGate(db, { gateId, runId, kind: "refusal", onExpiry: "cancel" });

  const marker = (n: string) => `MARKER_${t.toUpperCase()}_${n}`;
  const personaId = `per_probe_${t}`;
  const connectionId = `con_probe_${t}`;
  const discoveredItemId = `di_probe_${t}`;
  const threadId = `thr_probe_${t}`;
  const artifactId = `art_probe_${t}`;
  const artifactVersionId = `av_probe_${t}`;
  const correspondenceId = `corr_probe_${t}`;
  const findingId = `fnd_probe_${t}`;
  const figureId = `fig_probe_${t}`;
  const liveDocId = `ldoc_probe_${t}`;
  const restorePointId = `rp_probe_${t}`;
  const decisionRequestId = `dcr_probe_${t}`;
  const checkoutSessionId = `cs_probe_${t}`;
  const guidanceId = `gui_probe_${t}`;
  const inboxItemId = `inb_probe_${t}`;
  const actionTokenId = `eat_probe_${t}`;
  const refundableRunId = `run_probe_${t}_ref`;
  await seedRun(db, { runId: refundableRunId, workspaceId, projectId, state: "completed" });
  await db.pg.query("update runs set ended_at = now() where id = $1", [refundableRunId]);

  await db.pg.exec(`
    insert into personas (id, workspace_id, display_name, mode, kind, provenance)
      values ('${personaId}','${workspaceId}','${marker("VOICE")}','self','leaf','user');
    insert into connections (id, persona_id, provider, status) values ('${connectionId}','${personaId}','upload','ok');
    insert into discovered_items (id, connection_id, external_id, title, state)
      values ('${discoveredItemId}','${connectionId}','ext_${t}','${marker("ITEM")}','new');
    insert into threads (id, project_id, name) values ('${threadId}','${projectId}','${marker("THREAD")}');
    insert into artifacts (id, workspace_id, project_id, kind, namespace, mirror_path)
      values ('${artifactId}','${workspaceId}','${projectId}','draft','ns','${marker("PATH")}');
    insert into artifact_versions (id, artifact_id, ordinal, content_sha256, s3_key, bytes, media_type, created_by)
      values ('${artifactVersionId}','${artifactId}',1,'sha_${t}','k_${t}',10,'text/markdown','{}'::jsonb);
    insert into correspondence_items (id, project_id, kind, draft_id, run_id, ordinal, delivered_at, artifact_ids)
      values ('${correspondenceId}','${projectId}','review','${draftId}','${runId}',1,now(),'{}');
    insert into findings (id, correspondence_id, draft_id, ordinal, kind, severity, origin, title, body)
      values ('${findingId}','${correspondenceId}','${draftId}',1,'note','minor','agent','${marker("FINDING")}','b');
    insert into figures (id, project_id, spec_kind, caption) values ('${figureId}','${projectId}','table','${marker("FIGURE")}');
    insert into live_docs (id, draft_id, y_state, state_vector) values ('${liveDocId}','${draftId}','\\x00'::bytea,'\\x00'::bytea);
    insert into restore_points (id, live_doc_id, s3_key, kind, cause, label)
      values ('${restorePointId}','${liveDocId}','k_${t}','snapshot','named','${marker("RP")}');
    insert into decision_requests (id, project_id, text, options)
      values ('${decisionRequestId}','${projectId}','${marker("DCR")}','{a,b}');
    insert into checkout_sessions (id, workspace_id, billing_account_id, user_id, kind, plan, cycle)
      values ('${checkoutSessionId}','${workspaceId}','${billingAccountId}','${userId}','subscribe','studio','monthly');
    insert into guidance (id, project_id, body) values ('${guidanceId}','${projectId}','${marker("GUIDANCE")}');
    insert into inbox_items (id, user_id, project_id, kind, payload)
      values ('${inboxItemId}','${userId}','${projectId}','run.delivered','{}'::jsonb);
    insert into notification_prefs (user_id, prefs) values ('${userId}','{}'::jsonb)
      on conflict (user_id) do nothing;
    insert into email_action_tokens (id, workspace_id, gate_id, run_id, user_id, action, expires_at)
      values ('${actionTokenId}','${workspaceId}','${gateId}','${runId}','${userId}','open',now()+interval '1 hour');
    -- DEF.4 — a refund-eligible run per tenant (terminal, in-window, one committed debit): the
    -- refund WRITE leg proves a foreign id can never resolve into a refund, however eligible.
    insert into steps (id, run_id, phase, ordinal, state)
      values ('st_${refundableRunId}','${refundableRunId}','craft',1,'done');
    insert into credit_balances (billing_account_id, bucket, available, held)
      values ('${billingAccountId}','included',5000,0) on conflict do nothing;
    insert into credit_ledger (id, workspace_id, billing_account_id, kind, credits, bucket, run_id, phase_id, source, idempotency_key)
      values ('led_${refundableRunId}','${workspaceId}','${billingAccountId}','debit',160,'included','${refundableRunId}','st_${refundableRunId}','phase','debit:${refundableRunId}');
  `);

  const ids = [
    userId, billingAccountId, workspaceId, projectId, draftId, runId, gateId, personaId,
    connectionId, discoveredItemId, threadId, artifactId, artifactVersionId, correspondenceId,
    findingId, figureId, liveDocId, restorePointId, decisionRequestId, checkoutSessionId,
    guidanceId, inboxItemId, actionTokenId, refundableRunId,
  ];
  const textMarkers = ["VOICE", "ITEM", "THREAD", "PATH", "FINDING", "FIGURE", "RP", "DCR", "GUIDANCE"].map(
    (n) => marker(n),
  );
  return {
    userId, workspaceId, billingAccountId, projectId, draftId, runId, gateId, personaId,
    connectionId, discoveredItemId, threadId, artifactId, artifactVersionId, correspondenceId,
    findingId, figureId, liveDocId, restorePointId, decisionRequestId, checkoutSessionId,
    guidanceId, inboxItemId, actionTokenId, refundableRunId,
    textMarkers,
    all: [...ids, ...textMarkers],
  };
}

// ---------------------------------------------------------------- census ----

/**
 * GET routes the probe deliberately does NOT call — each with the audit reason. A GET route absent
 * from BOTH the probed run and this list fails the census (the mechanism by which every future
 * tenant read is forced through the probe).
 */
const GET_EXEMPTIONS = new Map<string, string>([
  ["GET /healthz", "public liveness — no tenant data"],
  ["GET /pricing/rates", "public rate publication — global, not tenant-scoped (REQ-BILL-19)"],
  ["GET /protocols", "global protocol registry — no tenant rows"],
  ["GET /showcase", "the §15.4 public fixture project — deliberately global ($0 demo dossier)"],
  ["GET /internal/runs/:id/hydration", "pod surface — Bearer run token, not session-scoped"],
  ["GET /internal/runs/:id/runspec", "pod surface — Bearer run token, not session-scoped"],
]);

/**
 * Turn a Hono route pattern into a concrete path whose params carry the FOREIGN tenant's ids, and
 * report which markers were placed in the URL — those are excluded from the response scan (a route
 * may legitimately echo the caller-supplied id, e.g. `usageLevel2.projectId`; echoing a value the
 * requester already knew is not a cross-tenant disclosure).
 */
function fillPath(
  path: string,
  foreign: TenantMarkers,
): { path: string; suppliedMarkers: Set<string> } {
  const supplied = new Set<string>();
  const pick = (m: string) => (supplied.add(m), m);
  const out = path.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (whole, name: string) => {
    switch (name) {
      case "id":
        if (path.startsWith("/projects/")) return pick(foreign.projectId);
        if (path.startsWith("/voices/")) return pick(foreign.personaId);
        if (path.startsWith("/runs/")) return pick(foreign.runId);
        if (path.startsWith("/billing/checkout-sessions/")) return pick(foreign.checkoutSessionId);
        if (path.startsWith("/billing/usage/run/")) return pick(foreign.runId);
        if (path.startsWith("/billing/usage/project/")) return pick(foreign.projectId);
        if (path.startsWith("/inbox/")) return pick(foreign.inboxItemId);
        if (path.startsWith("/artifacts/")) return pick(foreign.artifactId);
        return pick(foreign.projectId);
      case "runId": case "rid": case "run": return pick(foreign.runId);
      case "tid": return pick(foreign.threadId);
      case "pinId": return `pin_${foreign.threadId}`;
      case "did": case "draftId": return pick(foreign.draftId);
      case "rp": return pick(foreign.restorePointId);
      case "artifactId": return pick(foreign.artifactId);
      case "vid": return pick(foreign.artifactVersionId);
      case "figureId": return pick(foreign.figureId);
      case "fid": return pick(foreign.findingId);
      case "cid":
        return pick(path.startsWith("/voices/") ? foreign.connectionId : foreign.correspondenceId);
      case "gid":
        return pick(path.includes("/guidance/") ? foreign.guidanceId : foreign.gateId);
      case "itemId": return pick(foreign.discoveredItemId);
      case "dcr": return pick(foreign.decisionRequestId);
      case "token": return pick(foreign.actionTokenId);
      case "v": case "m": case "n": return "1";
      case "key": return "step_1";
      case "gapId": case "hunkId": case "subagentId": return "x";
      default:
        throw new Error(`unhandled path param :${name} in ${path} — extend fillPath or exempt the route`);
    }
  });
  return { path: out, suppliedMarkers: supplied };
}

// ---------------------------------------------------------------- report ----

export interface ProbeFinding {
  readonly route: string;
  readonly asTenant: string;
  readonly status: number;
  readonly leaked: readonly string[];
}

export interface ProbeReport {
  readonly mode: "deterministic" | "live";
  readonly routesProbed: number;
  /** DEF.4 — tenant-scoped WRITE routes probed (the refund route; a finding, not a count, fails it). */
  readonly writesProbed: number;
  readonly routesExempt: readonly string[];
  readonly findings: readonly ProbeFinding[];
  readonly ownDataSanity: readonly string[];
  readonly passed: boolean;
}

function scanForMarkers(text: string, markers: readonly string[]): string[] {
  return markers.filter((m) => text.includes(m));
}

// ------------------------------------------------------ deterministic mode ----

export async function runDeterministicProbe(): Promise<ProbeReport> {
  const db = await createOrchestratorTestDb();
  try {
    const a = await seedProbeTenant(db, "a");
    const b = await seedProbeTenant(db, "b");

    // The user-serving pool: every statement runs AS `rhema_app_login` — the scoped path pins it
    // inside `withTenant` (set_config('role',…,true)); the unscoped fallback pins it around the
    // call — either way a query that needs more than the user role's grants turns red here, exactly
    // as it would against prod's `DATABASE_URL`.
    const asUser = async <T>(fn: () => Promise<T>): Promise<T> => {
      await db.client.query("set role rhema_app_login");
      try {
        return await fn();
      } finally {
        await db.client.query("reset role");
      }
    };
    const userPool: TenantPool = {
      query: (sql, params) => asUser(() => db.client.query(sql, params)),
      connect: async () => ({
        query: (sql, params) => db.client.query(sql, params),
        release: () => {},
      }),
    };

    // One app for both tenants — the prod binding verbatim: the ALS carries the principal per
    // request (`sessionScopedPrincipal`), `deps.db` is the scoped client, `txRunner` pins the role.
    const deps = makeDeps(db);
    // R6UCD.1 — the mint seam bound to a recording fake (prod binds `createGcsV4UserContentSigner`;
    // the v4 wire is Stage-B). A foreign-key mint attempt must never even ASK the signer.
    const mintCalls: Parameters<UserContentSigner["signGet"]>[0][] = [];
    const app = createApp({
      ...deps,
      principal: sessionScopedPrincipal,
      db: createScopedDb(userPool, { role: USER_SERVING_ROLE }),
      // DEF.4 — the refund write leg runs under the harshest posture (flag OPEN): a foreign id must
      // still 404 and write nothing — the workspace predicate + RLS, not the flag, is the boundary.
      refundWindowMode: "open",
      userContentSigner: {
        async signGet(a) {
          mintCalls.push(a);
          return {
            url: `https://storage.googleapis.com/probe-uc/${a.key}?response-content-disposition=${encodeURIComponent(a.responseDisposition)}&response-content-type=${encodeURIComponent(a.responseType)}&X-Goog-Signature=probe`,
            expiresAt: Date.now() + a.expiresSeconds * 1_000,
          };
        },
      },
    });
    const principalOf = (t: TenantMarkers): Principal => ({
      userId: t.userId,
      workspaceId: t.workspaceId,
      billingAccountId: t.billingAccountId,
    });
    const requestAs = async (t: TenantMarkers, path: string, init?: RequestInit): Promise<Response> =>
      runWithPrincipal(principalOf(t), async () => app.request(path, init));

    // ---- census: every GET route is probed or explicitly exempted; an exemption that names a gone
    // route is stale and fails too. ----
    const gets = (app.routes as { method: string; path: string }[])
      .filter((r) => r.method === "GET")
      .map((r) => `GET ${r.path}`)
      .sort();
    const probed: string[] = [];
    const findings: ProbeFinding[] = [];
    const ownDataSanity: string[] = [];
    for (const route of gets) {
      if (GET_EXEMPTIONS.has(route)) continue;
      probed.push(route);
    }
    for (const exempted of GET_EXEMPTIONS.keys()) {
      if (!gets.includes(exempted)) {
        findings.push({
          route: exempted,
          asTenant: "census",
          status: 0,
          leaked: ["stale exemption — route no longer exists"],
        });
      }
    }

    // ---- own-data sanity: fail-closed ≠ empty. Each tenant sees its own markers on the lists. ----
    for (const [self, foreign, tag] of [
      [a, b, "a"],
      [b, a, "b"],
    ] as const) {
      for (const list of ["/voices", "/projects", "/inbox"]) {
        const res = await requestAs(self, list);
        const body = await res.text();
        const foreignHits = scanForMarkers(body, foreign.all);
        if (foreignHits.length) {
          findings.push({ route: `GET ${list}`, asTenant: tag, status: res.status, leaked: foreignHits });
        }
      }
      const voices = await (await requestAs(self, "/voices")).text();
      const projects = await (await requestAs(self, "/projects")).text();
      if (!scanForMarkers(voices, self.all).length) {
        ownDataSanity.push(`${tag}: /voices shows none of its own personas`);
      }
      if (!scanForMarkers(projects, self.all).length) {
        ownDataSanity.push(`${tag}: /projects shows none of its own projects`);
      }
    }

    // ---- the probe: every non-exempt GET as A-with-B-ids and B-with-A-ids. ----
    for (const [as, foreign, tag] of [
      [a, b, "a"],
      [b, a, "b"],
    ] as const) {
      for (const route of probed) {
        const { path, suppliedMarkers } = fillPath(route.slice(4), foreign);
        let res: Response;
        try {
          res = await requestAs(as, path);
        } catch {
          continue; // a route that throws on a foreign id fails closed — no leak surface
        }
        const body = await res.text().catch(() => "");
        const hits = scanForMarkers(body, foreign.all).filter((m) => !suppliedMarkers.has(m));
        if (hits.length) {
          findings.push({ route, asTenant: tag, status: res.status, leaked: hits });
        }
      }
    }

    // ---- the refund WRITE leg (DEF.4; REQ-SPEC-30): POST /runs/<foreign refund-eligible run>/refund
    // as each tenant must 404 — the workspace predicate + RLS hide the row entirely — and must leave
    // NO request row / NO refund ledger row on the foreign run. The supplied id is excluded from the
    // marker scan (the requester chose it); any other foreign marker in the body is a finding. The
    // own-run POST is the sanity: the route is genuinely mounted (fail-closed ≠ dead).
    let writesProbed = 0;
    for (const [as, foreign, tag] of [
      [a, b, "a"],
      [b, a, "b"],
    ] as const) {
      const res = await requestAs(as, `/runs/${foreign.refundableRunId}/refund`, { method: "POST" });
      writesProbed++;
      if (res.status !== 404) {
        findings.push({
          route: "POST /runs/:id/refund",
          asTenant: tag,
          status: res.status,
          leaked: ["a foreign run id resolved — the refund write must 404"],
        });
      }
      const body = await res.text().catch(() => "");
      const hits = scanForMarkers(body, foreign.all).filter((m) => m !== foreign.refundableRunId);
      if (hits.length) {
        findings.push({ route: "POST /runs/:id/refund", asTenant: tag, status: res.status, leaked: hits });
      }
      // and the durable check: no request row, no refund ledger row on the foreign run.
      const reqN = Number(
        (
          (await db.client.query("select count(*)::int n from user_refund_requests where run_id = $1", [
            foreign.refundableRunId,
          ])).rows[0] as { n: number }
        ).n,
      );
      const ledN = Number(
        (
          (await db.client.query(
            "select count(*)::int n from credit_ledger where run_id = $1 and kind = 'refund'",
            [foreign.refundableRunId],
          )).rows[0] as { n: number }
        ).n,
      );
      if (reqN !== 0 || ledN !== 0) {
        findings.push({
          route: "POST /runs/:id/refund",
          asTenant: tag,
          status: res.status,
          leaked: [`foreign run carries ${reqN} request row(s) + ${ledN} refund row(s)`],
        });
      }
    }
    {
      const own = await requestAs(a, `/runs/${a.refundableRunId}/refund`, { method: "POST" });
      writesProbed++;
      if (own.status !== 200) {
        ownDataSanity.push(
          `a: own refund-eligible run did not refund under flag-open (status ${own.status})`,
        );
      }
    }

    // ---- the mint leg (R6UCD.1; REQ-POST-7; ADR-113; invariant 13): `GET /usercontent/sign`
    // must never sign a key under a foreign tenant's prefix — foreign `quarantine/<ws>/<id>` +
    // `converted/<ws>/<id>.json` queries answer 404 with NO url and the signer is never even
    // asked — while the tenant's own key mints the §13.3-bound short-lived URL. The route is also
    // in the GET census above (a keyless probe answers the same uniform 404). ----
    const mintCallsBefore = mintCalls.length;
    for (const [as, foreign, tag] of [
      [a, b, "a"],
      [b, a, "b"],
    ] as const) {
      for (const key of [
        quarantineKey(foreign.workspaceId, "u_probe"),
        convertedResultKey(quarantineKey(foreign.workspaceId, "u_probe")),
      ]) {
        writesProbed++;
        const res = await requestAs(as, `/usercontent/sign?key=${encodeURIComponent(key)}`);
        const body = await res.text().catch(() => "");
        if (res.status !== 404 || /"url"\s*:/.test(body)) {
          findings.push({
            route: "GET /usercontent/sign",
            asTenant: tag,
            status: res.status,
            leaked: [`foreign key ${key} did not answer a clean 404 (url in body: ${/"url"\s*:/.test(body)})`],
          });
        }
        // the key itself was caller-supplied — any OTHER foreign marker in the body is a leak.
        const hits = scanForMarkers(body, foreign.all).filter((m) => m !== foreign.workspaceId);
        if (hits.length) {
          findings.push({ route: "GET /usercontent/sign", asTenant: tag, status: res.status, leaked: hits });
        }
      }
    }
    if (mintCalls.length !== mintCallsBefore) {
      findings.push({
        route: "GET /usercontent/sign",
        asTenant: "census",
        status: 0,
        leaked: ["the signer was invoked for a foreign key — signing MUST follow the tenant check"],
      });
    }
    {
      writesProbed++;
      const key = quarantineKey(a.workspaceId, "u_probe");
      const res = await requestAs(a, `/usercontent/sign?key=${encodeURIComponent(key)}`);
      if (res.status !== 200) {
        ownDataSanity.push(`a: own quarantine key did not mint (status ${res.status})`);
      } else {
        const body = (await res.json()) as { url?: string; expiresAt?: number };
        const last = mintCalls[mintCalls.length - 1];
        if (!last || last.key !== key) {
          ownDataSanity.push("a: the mint did not bind the requested key");
        } else if (last.expiresSeconds > USERCONTENT_URL_TTL_SECONDS) {
          ownDataSanity.push(`a: minted TTL ${last.expiresSeconds}s exceeds the ${USERCONTENT_URL_TTL_SECONDS}s bound`);
        } else if (
          last.responseType !== "application/octet-stream" ||
          last.responseDisposition !== "attachment"
        ) {
          ownDataSanity.push(
            "a: the default mint did not bind the §13.3 download policy (octet-stream + attachment)",
          );
        }
        if (!body.url || !body.expiresAt) {
          ownDataSanity.push("a: the mint body lacked url/expiresAt");
        }
      }
    }

    return {
      mode: "deterministic",
      routesProbed: probed.length,
      writesProbed,
      routesExempt: [...GET_EXEMPTIONS.keys()],
      findings,
      ownDataSanity,
      passed: findings.length === 0 && ownDataSanity.length === 0,
    };
  } finally {
    await db.close();
  }
}

// -------------------------------------------------------------- live mode ----

const LIVE_LIST_ROUTES = ["/voices", "/projects", "/inbox", "/billing/usage"];
const LIVE_PAGES = ["/voices", "/app", "/app/inbox", "/usage"];

/** Extract id-ish tokens from a JSON body — a tenant's own response defines its marker set. */
function extractMarkers(body: string): Set<string> {
  const out = new Set<string>();
  for (const m of body.matchAll(/"([A-Za-z]*(?:id|Id|key))"\s*:\s*"([^"]{6,})"/g)) {
    if (m[2]) out.add(m[2]);
  }
  return out;
}

export async function runLiveProbe(baseUrl: string, webUrl?: string): Promise<ProbeReport> {
  const sessionA = process.env.PROBE_SESSION_A;
  const sessionB = process.env.PROBE_SESSION_B;
  if (!sessionA || !sessionB) {
    throw new Error("live probe needs PROBE_SESSION_A + PROBE_SESSION_B env vars (magic-link session cookies)");
  }
  const findings: ProbeFinding[] = [];
  const getJson = async (path: string, session: string) => {
    const res = await fetch(`${baseUrl}${path}`, { headers: { cookie: session } });
    return { status: res.status, body: await res.text() };
  };

  // collect each tenant's own marker set from its list routes
  const markersOf = async (session: string): Promise<Set<string>> => {
    const s = new Set<string>();
    for (const route of LIVE_LIST_ROUTES) {
      const { body } = await getJson(route, session);
      for (const m of extractMarkers(body)) s.add(m);
    }
    return s;
  };
  const aMarkers = await markersOf(sessionA);
  const bMarkers = await markersOf(sessionB);
  let writesProbed = 0;

  // api JSON: every list route as each tenant must contain none of the other's markers
  for (const [session, foreign, tag] of [
    [sessionA, bMarkers, "a"],
    [sessionB, aMarkers, "b"],
  ] as const) {
    for (const route of LIVE_LIST_ROUTES) {
      const { status, body } = await getJson(route, session);
      const hits = [...foreign].filter((m) => body.includes(m));
      if (hits.length) findings.push({ route: `GET ${route}`, asTenant: tag, status, leaked: hits.slice(0, 10) });
    }
    // and a foreign id in a detail route must not resolve — take one from the other tenant's set
    const foreignId = [...foreign][0];
    if (foreignId) {
      const { status, body } = await getJson(`/voices/${foreignId}`, session);
      const hits = [...foreign].filter((m) => body.includes(m) && m !== foreignId);
      if (status === 200 || hits.length) {
        findings.push({ route: `GET /voices/<foreign>`, asTenant: tag, status, leaked: hits.slice(0, 10) });
      }
      // DEF.4 — the refund WRITE leg: POSTing the foreign id must never refund (2xx) nor echo
      // foreign markers beyond the supplied id — 403 (flag) / 404 (scope) are the only honest answers.
      const wr = await fetch(`${baseUrl}/runs/${encodeURIComponent(foreignId)}/refund`, {
        method: "POST",
        headers: { cookie: session },
      });
      writesProbed++;
      const wrBody = await wr.text().catch(() => "");
      const wrHits = [...foreign].filter((m) => wrBody.includes(m) && m !== foreignId);
      if (wr.status < 300 || wr.status >= 500 || wrHits.length) {
        findings.push({
          route: "POST /runs/<foreign>/refund",
          asTenant: tag,
          status: wr.status,
          leaked: wrHits.slice(0, 10).concat(wr.status < 300 || wr.status >= 500 ? [`status ${wr.status}`] : []),
        });
      }
    }
  }

  // web pages: the HTML must not contain the other tenant's markers
  if (webUrl) {
    for (const [session, foreign, tag] of [
      [sessionA, bMarkers, "a"],
      [sessionB, aMarkers, "b"],
    ] as const) {
      for (const page of LIVE_PAGES) {
        const res = await fetch(`${webUrl}${page}`, { headers: { cookie: session } });
        const body = await res.text();
        const hits = [...foreign].filter((m) => body.includes(m));
        if (hits.length) findings.push({ route: `GET ${page} (web)`, asTenant: tag, status: res.status, leaked: hits.slice(0, 10) });
      }
    }
  }

  return {
    mode: "live",
    routesProbed: LIVE_LIST_ROUTES.length + (webUrl ? LIVE_PAGES.length : 0),
    writesProbed,
    routesExempt: [],
    findings,
    ownDataSanity: aMarkers.size === 0 ? ["a: no own markers extracted — session may be dead"] : [],
    passed: findings.length === 0 && aMarkers.size > 0 && bMarkers.size > 0,
  };
}

// ------------------------------------------------------------------- cli ----

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop() ?? "");
if (isMain) {
  const args = process.argv.slice(2);
  const baseUrlIdx = args.indexOf("--base-url");
  const report =
    baseUrlIdx >= 0
      ? await runLiveProbe(args[baseUrlIdx + 1]!, args.includes("--web-url") ? args[args.indexOf("--web-url") + 1] : undefined)
      : await runDeterministicProbe();
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.passed ? 0 : 1);
}
