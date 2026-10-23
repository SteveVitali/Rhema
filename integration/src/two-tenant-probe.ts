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
// R6SECR.1 (REQ-SEC-3) extended it: each tenant's typed ids are harvested from /session + the
// lists, then `LIVE_FOREIGN_GETS` plants them (or `secr_probe_*` fakes where a family has no
// harvestable id) into every user-serving api family — voices, projects (chat/outline/timeline/
// settings/figures/files), runs, billing, the `/usercontent/sign` mint legs, the token routes —
// plus `LIVE_FOREIGN_BFF_GETS`/`LIVE_BFF_LIST_GETS` on the web twin, and a second write leg
// (`POST /inbox/<foreign>/read`).

import {
  createOrchestratorTestDb,
  seedProject,
  seedRun,
  seedGate,
  makeDeps,
  type OrchestratorTestDb,
} from "@rhema/orchestrator/testing";
import { USER_SERVING_ROLE } from "@rhema/db";
import { InMemoryContentStore } from "@rhema/mirror";
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
  /** F-R6SECR.1-1 — a `response`-kind correspondence the what-changed route can actually resolve. */
  readonly responseCorrId: string;
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
  // F-R6SECR.1-1 — a `response` correspondence: `/responses/:cid/what-changed` only resolves when
  // the cid's row is kind='response' — the review-kind corr above never reaches the projector, so
  // this row is what makes that route family honest (it must 404 at the guard, not at the kind).
  const responseCorrId = `corrsp_probe_${t}`;
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
    insert into correspondence_items (id, project_id, kind, draft_id, run_id, prior_review_id, ordinal, delivered_at, artifact_ids)
      values ('${responseCorrId}','${projectId}','response','${draftId}','${runId}','${correspondenceId}',2,now(),'{}');
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
    responseCorrId,
    findingId, figureId, liveDocId, restorePointId, decisionRequestId, checkoutSessionId,
    guidanceId, inboxItemId, actionTokenId, refundableRunId,
  ];
  const textMarkers = ["VOICE", "ITEM", "THREAD", "PATH", "FINDING", "FIGURE", "RP", "DCR", "GUIDANCE"].map(
    (n) => marker(n),
  );
  return {
    userId, workspaceId, billingAccountId, projectId, draftId, runId, gateId, personaId,
    connectionId, discoveredItemId, threadId, artifactId, artifactVersionId, correspondenceId,
    responseCorrId,
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
        return pick(
          path.startsWith("/voices/")
            ? foreign.connectionId
            : path.includes("/responses/")
              ? foreign.responseCorrId
              : foreign.correspondenceId,
        );
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
      // F-R6SECR.1-1 — a bound store via the prod seam (server.ts binds `contentStoreFor`):
      // without it every store-dependent route (`/v/:n/diff/:m`, `/responses/:cid/what-changed`,
      // `/review/:runId/dossier`) 500s at the "content store unavailable" check BEFORE the tenant
      // predicate runs — the exact masking that let the revision-routes leak ship. Empty is fine:
      // the marker scan keys on ids the unscoped SQL returns, not on served bytes.
      contentStoreFor: async () => new InMemoryContentStore(),
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

// ---- R6SECR.1 (REQ-SEC-3) — planted-foreign-id live legs ----------------------
//
// The original live mode probed four list routes + one foreign detail. The launch-blocking
// review needs the same assertion on EVERY user-serving family the leak classes touched:
// voices, projects (chat/outline/timeline/settings/figures/files — `loadProject`'s bucket),
// runs, billing, the R6UCD.1 signed-URL mint, the token routes, and the `/bff/*` twins on
// web. Each tenant's own ids are harvested from `/session` + the list routes; the templates
// below fill `{name}` with the FOREIGN tenant's ids (or planted `secr_probe_*` fakes where a
// family has no harvestable id — a fake asserts the uniform not_found oracle, a harvested id
// additionally asserts a real foreign row can never resolve).

interface LiveIds {
  readonly workspaceId?: string;
  readonly userId?: string;
  readonly billingAccountId?: string;
  readonly projectId?: string;
  readonly projectSlug?: string;
  readonly runId?: string;
  readonly draftId?: string;
  readonly personaId?: string;
  readonly inboxItemId?: string;
  /** all of this tenant's project slugs — used to pick a genuinely-foreign slug value. */
  readonly slugs?: ReadonlySet<string>;
}

/** api routes — `{x}` params filled from the foreign tenant's harvested ids. */
const LIVE_FOREIGN_GETS: readonly string[] = [
  "/voices/{personaId}",
  "/voices/{personaId}/connections",
  "/voices/{personaId}/estimate",
  "/voices/{personaId}/samples/{itemId}",
  "/voices/{personaId}/update",
  "/projects/{projectId}/chat",
  "/projects/{projectId}/chat/sources",
  "/projects/{projectId}/chat/threads/{threadId}/pins",
  "/projects/{projectId}/chat/threads/{threadId}/remembers",
  "/projects/{projectId}/chat/threads/{threadId}/turns/{runId}",
  "/projects/{projectId}/outline",
  "/projects/{projectId}/outline/promotion",
  "/projects/{projectId}/timeline",
  "/projects/{projectId}/versions",
  "/projects/{projectId}/settings",
  "/projects/{projectId}/settings/approvals",
  "/projects/{projectId}/approval-overrides",
  "/projects/{projectId}/decisions",
  "/projects/{projectId}/pretriage",
  "/projects/{projectId}/figures",
  "/projects/{projectId}/figures/{figureId}",
  "/projects/{projectId}/files",
  "/projects/{projectId}/bibliography",
  "/projects/{projectId}/ai-use",
  "/projects/{projectId}/voice",
  "/projects/{projectId}/export/dialog",
  "/projects/{projectId}/editor/{draftId}",
  "/projects/{projectId}/editor/resolve/{v}",
  "/projects/{projectId}/drafts/{draftId}/restore-points",
  "/projects/{projectId}/drafts/{draftId}/restore-points/{rp}/preview",
  "/projects/{projectId}/review/{runId}/dossier",
  "/projects/{projectId}/responses/{cid}/what-changed",
  "/projects/{projectId}/v/2/diff/1",
  "/projects/{projectId}/findings/{fid}/resolve",
  "/projects/{projectId}/artifacts/{artifactId}/page",
  "/projects/{projectId}/gates",
  "/runs/{runId}/report",
  "/runs/{runId}/events",
  "/billing/usage/project/{projectId}",
  "/billing/usage/run/{runId}/advanced",
  "/billing/checkout-sessions/{checkoutSessionId}",
  "/usercontent/sign?key=quarantine/{workspaceId}/secr_probe",
  "/usercontent/sign?key=converted/{workspaceId}/secr_probe.json",
  "/export/download?token={token}",
  "/api/action/{token}",
  // session-scoped (not foreign-id) GETs — the body must still carry no foreign marker.
  "/settings/account",
  "/settings/data",
  "/settings/integrations",
  "/settings/preferences",
  "/settings/privacy",
  "/settings/explainers",
  "/billing/balance",
  "/billing/subscription",
  "/billing/usage/account",
];

/** api routes DESIGNED to answer 200 with an empty, caller-scoped rollup for any id — the
 *  response echoes only the supplied id and is byte-identical for a nonexistent project
 *  (usageLevel2's every query is workspace-predicated), so the 200-substantive heuristic
 *  exempts them; a foreign marker in the body would still be caught by the scan. */
const LIVE_FOREIGN_200_OK: ReadonlySet<string> = new Set([
  "/billing/usage/project/{projectId}",
]);

/** `/bff/*` twins on the web origin — `{slug}` filled with a slug/id absent from the
 *  requester's own project set; every answer must be ≥400 and marker-free. */
const LIVE_FOREIGN_BFF_GETS: readonly string[] = [
  "/bff/p/{slug}",
  "/bff/p/{slug}/usage",
  "/bff/p/{slug}/settings",
  "/bff/p/{slug}/export",
  "/bff/p/{slug}/import",
  "/bff/p/{slug}/outline",
  "/bff/p/{slug}/outline/promote",
  "/bff/p/{slug}/run",
  "/bff/p/{slug}/r/{runId}",
  "/bff/p/{slug}/review/{runId}",
  "/bff/p/{slug}/figures",
  "/bff/p/{slug}/visualize",
  "/bff/p/{slug}/voice/reseed",
  "/bff/p/{slug}/obligations/new",
  "/bff/p/{slug}/v/1",
  "/bff/p/{slug}/v/2/diff/1",
  "/bff/p/{slug}/a/{artifactId}",
  "/bff/p/{slug}/revisions/{cid}",
  "/bff/voices/{personaId}",
];

/** `/bff/*` session-scoped twins — no foreign id to plant; the body must carry none. */
const LIVE_BFF_LIST_GETS: readonly string[] = [
  "/bff/app",
  "/bff/app/inbox",
  "/bff/voices",
  "/bff/usage",
  "/bff/settings/account",
  "/bff/settings/preferences",
  "/bff/settings/notifications",
  "/bff/settings/integrations",
  "/bff/settings/data",
  "/bff/settings/billing",
  "/bff/feed-labels",
  "/bff/app/new",
];

/** Fill `{name}` placeholders: harvested foreign ids where they exist, planted fakes
 *  otherwise (they assert the uniform-not-found oracle). `supplied` = markers legitimately
 *  placed in the URL — excluded from the response scan (echoing a caller-supplied id is not
 *  a cross-tenant disclosure). */
function fillLivePath(
  template: string,
  foreign: LiveIds,
): { path: string; supplied: Set<string> } {
  const supplied = new Set<string>();
  const pick = (v: string | undefined, fake: string) => {
    const out = v ?? fake;
    supplied.add(out);
    return out;
  };
  const path = template.replace(/\{([a-zA-Z]+)\}/g, (_w, name: string) => {
    switch (name) {
      case "personaId": return pick(foreign.personaId, "secr_probe_persona");
      case "projectId": return pick(foreign.projectId, "secr_probe_project");
      case "runId": return pick(foreign.runId, "secr_probe_run");
      case "draftId": return pick(foreign.draftId, "secr_probe_draft");
      case "workspaceId": return pick(foreign.workspaceId, "secr_probe_ws");
      case "itemId": return pick(foreign.inboxItemId, "secr_probe_item");
      case "threadId": return pick(undefined, "secr_probe_thread");
      case "figureId": return pick(undefined, "secr_probe_figure");
      case "artifactId": return pick(undefined, "secr_probe_artifact");
      case "cid": return pick(undefined, "secr_probe_corr");
      case "fid": return pick(undefined, "secr_probe_finding");
      case "rp": return pick(undefined, "secr_probe_rp");
      case "checkoutSessionId": return pick(undefined, "secr_probe_checkout");
      case "token": return pick(undefined, "secr_probe_token");
      case "slug": return pick(foreign.projectSlug ?? foreign.projectId, "secr_probe_slug");
      case "v": return "1";
      default: throw new Error(`unhandled live-path param {${name}} in ${template}`);
    }
  });
  return { path, supplied };
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
  const getWeb = async (path: string, session: string) => {
    const res = await fetch(`${webUrl ?? baseUrl}${path}`, {
      headers: { cookie: session },
      redirect: "manual",
    });
    return { status: res.status, body: await res.text() };
  };

  // collect each tenant's own marker set from its list routes (+ /session for the account ids)
  const markersOf = async (session: string): Promise<Set<string>> => {
    const s = new Set<string>();
    for (const route of ["/session", ...LIVE_LIST_ROUTES]) {
      const { body } = await getJson(route, session);
      for (const m of extractMarkers(body)) s.add(m);
    }
    return s;
  };

  // R6SECR.1 — the tenant's typed own ids: /session for the account triple, the project row
  // carrying the most context (prefer one with a run + draft), the first persona, the first
  // inbox item, the first usage run (a runId fallback for run-less projects).
  const idsOf = async (session: string): Promise<LiveIds> => {
    const out: { [k: string]: unknown } = {};
    const sess = await getJson("/session", session).then((r) => {
      try { return JSON.parse(r.body) as Record<string, string>; } catch { return {}; }
    });
    out.workspaceId = sess.workspaceId;
    out.userId = sess.userId;
    out.billingAccountId = sess.billingAccountId;
    const projects = await getJson("/projects", session).then((r) => {
      try { return (JSON.parse(r.body) as { projects?: Record<string, string | null>[] }).projects ?? []; }
      catch { return []; }
    });
    const best =
      projects.find((p) => p.latestReviewRunId && p.headDraftId) ??
      projects.find((p) => p.latestReviewRunId) ??
      projects[0];
    out.projectId = best?.id ?? undefined;
    out.projectSlug = best?.slug ?? undefined;
    out.runId = best?.latestReviewRunId ?? undefined;
    out.draftId = best?.headDraftId ?? undefined;
    const voices = await getJson("/voices", session).then((r) => {
      try { return (JSON.parse(r.body) as { voices?: { personaId?: string }[] }).voices ?? []; }
      catch { return []; }
    });
    out.personaId = voices.find((v) => v.personaId)?.personaId;
    const inbox = await getJson("/inbox", session).then((r) => {
      try { return (JSON.parse(r.body) as { items?: { id?: string }[] }).items ?? []; }
      catch { return []; }
    });
    out.inboxItemId = inbox.find((i) => i.id)?.id;
    // every own slug — the BFF foreign-slug leg picks a foreign value NOT in this set (a
    // same-named foreign slug resolves to the requester's OWN row, which proves nothing).
    out.slugs = new Set(projects.map((p) => p.slug).filter((s): s is string => typeof s === "string"));
    if (!out.runId) {
      const usage = await getJson("/billing/usage", session).then((r) => {
        try { return (JSON.parse(r.body) as { runs?: { runId?: string; projectId?: string }[] }).runs ?? []; }
        catch { return []; }
      });
      const u = usage.find((x) => x.runId);
      out.runId = u?.runId;
      out.projectId = out.projectId ?? u?.projectId;
    }
    return out as LiveIds;
  };

  const aMarkers = await markersOf(sessionA);
  const bMarkers = await markersOf(sessionB);
  const aIds = await idsOf(sessionA);
  const bIds = await idsOf(sessionB);
  let writesProbed = 0;

  // api JSON: every list route as each tenant must contain none of the other's markers
  let routesProbed = 0;
  for (const [session, foreign, foreignIds, ownIds, tag] of [
    [sessionA, bMarkers, bIds, aIds, "a"],
    [sessionB, aMarkers, aIds, bIds, "b"],
  ] as const) {
    for (const route of LIVE_LIST_ROUTES) {
      const { status, body } = await getJson(route, session);
      const hits = [...foreign].filter((m) => body.includes(m));
      if (hits.length) findings.push({ route: `GET ${route}`, asTenant: tag, status, leaked: hits.slice(0, 10) });
    }
    // and a foreign id in a detail route must not resolve — prefer the real foreign persona id
    const foreignId = foreignIds.personaId ?? [...foreign][0];
    if (foreignId) {
      const { status, body } = await getJson(`/voices/${foreignId}`, session);
      const hits = [...foreign].filter((m) => body.includes(m) && m !== foreignId);
      if (status === 200 || hits.length) {
        findings.push({ route: `GET /voices/<foreign>`, asTenant: tag, status, leaked: hits.slice(0, 10) });
      }
      // DEF.4 — the refund WRITE leg: POSTing the foreign id must never refund (2xx) nor echo
      // foreign markers beyond the supplied id — 403 (flag) / 404 (scope) are the only honest answers.
      const wr = await fetch(`${baseUrl}/runs/${encodeURIComponent(foreignIds.runId ?? foreignId)}/refund`, {
        method: "POST",
        headers: { cookie: session },
      });
      writesProbed++;
      const wrBody = await wr.text().catch(() => "");
      const wrHits = [...foreign].filter((m) => wrBody.includes(m) && m !== (foreignIds.runId ?? foreignId));
      if (wr.status < 300 || wr.status >= 500 || wrHits.length) {
        findings.push({
          route: "POST /runs/<foreign>/refund",
          asTenant: tag,
          status: wr.status,
          leaked: wrHits.slice(0, 10).concat(wr.status < 300 || wr.status >= 500 ? [`status ${wr.status}`] : []),
        });
      }
      // R6SECR.1 — the inbox WRITE leg (idempotent mark-read; a foreign item id must never
      // resolve): POST /inbox/<foreign-or-planted item>/read answers ≥400 and echoes nothing.
      const wrInbox = await fetch(
        `${baseUrl}/inbox/${encodeURIComponent(foreignIds.inboxItemId ?? "secr_probe_item")}/read`,
        { method: "POST", headers: { cookie: session } },
      );
      writesProbed++;
      const wiBody = await wrInbox.text().catch(() => "");
      const wiHits = [...foreign].filter(
        (m) => wiBody.includes(m) && m !== foreignIds.inboxItemId,
      );
      if (wrInbox.status < 300 || wrInbox.status >= 500 || wiHits.length) {
        findings.push({
          route: "POST /inbox/<foreign>/read",
          asTenant: tag,
          status: wrInbox.status,
          leaked: wiHits.slice(0, 10).concat(
            wrInbox.status < 300 || wrInbox.status >= 500 ? [`status ${wrInbox.status}`] : [],
          ),
        });
      }
    }

    // R6SECR.1 — planted-foreign-id GETs across every user-serving api family. A foreign id in
    // the path must never resolve the foreign row's data into this tenant's response; the mint
    // legs additionally must answer a uniform 404 with no `url` field (no key oracle).
    for (const template of LIVE_FOREIGN_GETS) {
      const { path, supplied } = fillLivePath(template, foreignIds);
      routesProbed++;
      const { status, body } = await getJson(path, session);
      const hits = [...foreign].filter((m) => body.includes(m) && !supplied.has(m));
      if (hits.length) {
        findings.push({ route: `GET ${template}`, asTenant: tag, status, leaked: hits.slice(0, 10) });
      }
      if (template.startsWith("/usercontent/sign") && (status !== 404 || /"url"\s*:/.test(body))) {
        findings.push({
          route: `GET ${template}`,
          asTenant: tag,
          status,
          leaked: [`foreign mint key did not answer a clean 404 (url in body: ${/"url"\s*:/.test(body)})`],
        });
      }
      // a harvested (real) foreign id that resolves 200 with a body full of the requester's own
      // markers is fine (e.g. an id that collides is impossible — ULIDs); a 200 carrying ANY
      // non-supplied foreign marker was already caught by the scan above. A 200 with a
      // substantive payload on a foreign id is itself suspect — flag it for the report (the
      // routes here all scope by workspace, so an honest answer is 404/403/422, never 200-data).
      // `LIVE_FOREIGN_200_OK` whitelists the routes DESIGNED to answer an empty rollup for any id
      // (usageLevel2 scopes every query by workspace and echoes the supplied id — the response is
      // byte-identical for a nonexistent id, so it is not even an existence oracle).
      if (
        status === 200 &&
        supplied.size > 0 &&
        body.length > 64 &&
        !hits.length &&
        !LIVE_FOREIGN_200_OK.has(template)
      ) {
        const hasRealForeignId = [...supplied].some((s) => foreign.has(s));
        if (hasRealForeignId) {
          findings.push({
            route: `GET ${template}`,
            asTenant: tag,
            status,
            leaked: [`200 with a substantive body (${body.length}b) on a real foreign id — review the response`],
          });
        }
      }
    }

    // the `/bff/*` twins — list reads must carry no foreign marker; foreign-slug legs must
    // answer ≥400 AND carry no foreign marker. The slug value is picked OUTSIDE the requester's
    // own slug set (a same-named foreign slug would resolve to the requester's own row and
    // prove nothing); absent one, the foreign project id stands in (never a valid slug).
    if (webUrl) {
      // the foreign-slug value: prefer a REAL foreign slug absent from the requester's own set
      // (a same-named slug resolves to the requester's own row and proves nothing); absent one,
      // the foreign project id stands in (it is never a valid slug).
      const foreignSlugValue =
        [...(foreignIds.slugs ?? [])].find((s) => !(ownIds.slugs ?? new Set()).has(s)) ??
        foreignIds.projectId ??
        "secr_probe_slug";
      const bffIds: LiveIds = { ...foreignIds, projectSlug: foreignSlugValue };
      for (const template of LIVE_BFF_LIST_GETS) {
        routesProbed++;
        const { status, body } = await getWeb(template, session);
        const hits = [...foreign].filter((m) => body.includes(m));
        if (hits.length) {
          findings.push({ route: `GET ${template} (bff)`, asTenant: tag, status, leaked: hits.slice(0, 10) });
        }
      }
      for (const template of LIVE_FOREIGN_BFF_GETS) {
        const { path, supplied } = fillLivePath(template, bffIds);
        routesProbed++;
        const { status, body } = await getWeb(path, session);
        const hits = [...foreign].filter((m) => body.includes(m) && !supplied.has(m));
        if (status < 400 || hits.length) {
          findings.push({
            route: `GET ${template} (bff)`,
            asTenant: tag,
            status,
            leaked: hits.slice(0, 10).concat(status < 400 ? [`status ${status} on a foreign slug`] : []),
          });
        }
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
    routesProbed: LIVE_LIST_ROUTES.length + routesProbed + (webUrl ? LIVE_PAGES.length : 0),
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
