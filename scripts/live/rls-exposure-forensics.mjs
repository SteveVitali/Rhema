#!/usr/bin/env node
// R6FOR.2 (REQ-FOR-4 · GD-EXPOSURE.R6 "Preserve now + rule" · D-SEC.1-2) — RLS-exposure forensics.
//
// Decides, from evidence, whether any REAL (non-is_test) user received another REAL workspace's
// data through the confirmed RLS-bypass leak routes during the 2026-09-17 → 2026-10-01 window.
// Two inputs:
//
//   1. The preserved Cloud Run request logs (gitignored, local only):
//        docs/build/logs/sec1-2-exposure/window-all-api-web.json   (18,482 entries)
//        docs/build/logs/sec1-2-exposure/leak-route-requests.json (444 entries)
//   2. Prod READ-ONLY over the IAP tunnel — the system-role `postgres` DSN (NEVER the app login;
//      FORCE RLS would read the tenant tables as empty). Every statement runs inside
//      `begin read only` … `rollback`. Zero writes, $0 spend.
//
// Usage:
//   DATABASE_URL=postgres://postgres:…@127.0.0.1:15433/rhema \
//     node scripts/live/rls-exposure-forensics.mjs [--window <path>] [--leak <path>]
//                                                [--include-ids] [--json]
//
// `--include-ids` adds workspace ids to the report for the OPERATOR's local use only — the
// committed output stays de-identified (counts, route families, date ranges, anonymized
// `real-ws-N` labels; never a log line, an IP, a user id, an email, or a name).
//
// ── Method ────────────────────────────────────────────────────────────────────────────────
// Access logs carry no principal (no cookie is logged), and prod `session.ip_address` is blank
// on 36/37 rows, so a request cannot be joined to a session directly. Attribution instead uses
// the request stream itself: every request path that carries a tenant ULID resolves to an owner
// workspace via prod tables, so each (remoteIp, uaClass) bucket's MODAL resource owner is the
// requester's workspace estimate; api-host calls from the web BFF's GCP-egress IPs are paired to
// their nearest same-family web-service entry (observed web→api gap ≈ 28 ms) before bucketing.
// The per-route verdict then compares the requester workspace with the workspaces whose rows
// the pre-fix query could have returned (route shapes re-confirmed against `git show` of the
// SEC.1 / STB.2 fix commits and the `deployments` table's deployed_at boundaries).
// ──────────────────────────────────────────────────────────────────────────────────────────

import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";

const require = createRequire(
  resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "integration", "package.json"),
);
const pg = require("pg");

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DEFAULT_LEAK = resolve(REPO, "docs/build/logs/sec1-2-exposure/leak-route-requests.json");
const DEFAULT_WINDOW = resolve(REPO, "docs/build/logs/sec1-2-exposure/window-all-api-web.json");
const PAIR_RADIUS_MS = 2000; // web SSR → api BFF call; observed ≈28 ms, generous bound
const ULID_RE = /[0-9A-HJKMNP-TV-Z]{26}/g; // ULID = 26 Crockford chars
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

// ── pure helpers (unit-tested) ─────────────────────────────────────────────────────────────

/** First 10 ULID chars are a 48-bit ms epoch; returns null on a non-ULID. */
export function decodeUlidMs(id) {
  if (typeof id !== "string" || id.length < 10) return null;
  let ms = 0;
  for (const ch of id.slice(0, 10)) {
    const v = CROCKFORD.indexOf(ch);
    if (v < 0) return null;
    ms = ms * 32 + v;
  }
  return ms > Number.MAX_SAFE_INTEGER ? null : ms;
}

/** UA family: browser UAs share cookies; "node"/curl/python are automation. */
export function uaClass(ua) {
  if (!ua) return "none";
  if (ua.startsWith("Mozilla")) return "browser";
  return ua.split(/[\s/]/)[0].slice(0, 24);
}

/**
 * Route family for a logged request. The three confirmed leak surfaces (SEC.1 doc + fix
 * commits): `GET /voices` (persona list — pre-fix selected ALL personas), `loadProject` reads
 * (chat/outline — pre-fix had no workspace predicate), and the dossier GET (pre-fix joined
 * across correspondence_items without the tenant check, fixed by STB.2). Residual bucket-A
 * routes (`/voices/:id…`) relied on RLS alone — same bypass exposure shape.
 */
export function classifyPath(service, host, method, path) {
  const segs = path.split("/").filter(Boolean);
  if (segs[0] === "voices") {
    if (segs.length === 1) return method === "GET" ? "voices-list" : "voices-write";
    return method === "GET" ? "voices-id" : "voices-write";
  }
  if (segs[0] === "projects" && segs.length >= 2) {
    const sub = segs.slice(2);
    if (sub.includes("dossier")) return "dossier";
    if (sub[0] === "chat") return method === "GET" ? "chat" : "chat-write";
    if (sub[0] === "outline") return method === "GET" ? "outline" : "outline-write";
    // the rest of /projects/:id… is residual bucket A (GET by id — RLS was the only check).
    return method === "GET" ? "projects-id" : "projects-write";
  }
  if (segs[0] === "runs" && segs.length >= 2) {
    return method === "GET" ? "runs-id" : "runs-write";
  }
  if (segs[0] === "billing") {
    // GET /billing/usage is the §14.5 user-keyed glance (bucket D); /billing/usage/run/:id etc
    // are the bucket-A id-lookups.
    if (segs.length === 2 && segs[1] === "usage") return "user-keyed";
    return method === "GET" ? "billing-id" : "billing-write";
  }
  if (segs[0] === "p" && segs.length >= 2) {
    const sub = segs.slice(2);
    if (sub[0] === "chat") return method === "GET" ? "chat" : "chat-write";
    if (sub[0] === "outline") return method === "GET" ? "outline" : "outline-write";
    return "public-page"; // the Page family is public by design
  }
  // user-keyed routes (bucket D): the route enforces principal.userId — same-workspace data only.
  if (["session", "inbox", "usage"].includes(segs[0])) return "user-keyed";
  // web SSR documents that embed the voices surface; non-app paths are scanner noise.
  if (service === "web" && path === "/voices") return "voices-list";
  if (service === "web" && path === "/voices/new") return "web-doc";
  if (path === "/projects") return "list-route"; // every list route carried the predicate
  return "non-app";
}

/** Families that get a requester-vs-owner verdict; everything else is census-only. */
export const VERDICT_FAMILIES = new Set([
  "voices-list",
  "voices-id",
  "dossier",
  "chat",
  "outline",
  "voices-write",
  "chat-write",
  "outline-write",
  "runs-id",
  "projects-id",
  "billing-id",
  "runs-write",
  "projects-write",
  "billing-write",
]);

/** Normalize a raw Cloud Logging entry. Returns null for non-request rows. */
export function toEntry(e) {
  const r = e.httpRequest;
  if (!r || !r.requestUrl) return null;
  let url;
  try {
    url = new URL(r.requestUrl);
  } catch {
    return null;
  }
  const service = (e.resource?.labels?.service_name ?? "").includes("web")
    ? "web"
    : (e.resource?.labels?.service_name ?? "").includes("api")
      ? "api"
      : "other";
  return {
    ts: Date.parse(e.timestamp ?? e.receiveTimestamp ?? 0),
    service,
    host: url.host,
    method: r.requestMethod ?? "GET",
    path: url.pathname,
    status: r.status ?? 0,
    ip: r.remoteIp ?? "",
    ua: r.userAgent ?? "",
    family: classifyPath(service, url.host, r.requestMethod ?? "GET", url.pathname),
  };
}

export const extractIds = (path) => path.match(ULID_RE) ?? [];

/**
 * (remoteIp, uaClass) activity buckets over the whole preserved window: each bucket accumulates
 * owner-workspace hits from every ULID-bearing request it made. The bucket's modal owner is the
 * requester-workspace estimate — a real user overwhelmingly touches their own workspace's ids.
 */
export function buildBuckets(entries, ownerOf) {
  const buckets = new Map();
  for (const e of entries) {
    const key = `${e.ip}|${uaClass(e.ua)}`;
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { key, hits: new Map(), n: 0 }));
    b.n++;
    for (const id of extractIds(e.path)) {
      const o = ownerOf(id);
      if (o) b.hits.set(o.ws, (b.hits.get(o.ws) ?? 0) + 1);
    }
  }
  return buckets;
}

/** Ordered owner candidates for a bucket: [ws, count] desc. */
const candidatesOf = (bucket) =>
  bucket ? [...bucket.hits.entries()].sort((a, b) => b[1] - a[1]) : [];

/**
 * Nearest same-family web-service entry within `radiusMs` — the api host only ever saw the web
 * service's GCP-egress IPs on BFF calls, so the paired web entry carries the real client IP.
 */
export function pairWebEntry(apiEntry, webEntries, radiusMs = PAIR_RADIUS_MS) {
  let best = null;
  for (const w of webEntries) {
    if (w.family !== apiEntry.family || w.family === "non-app") continue;
    const ids = extractIds(apiEntry.path);
    if (ids.length && !ids.every((id) => w.path.includes(id))) continue;
    const dt = Math.abs(w.ts - apiEntry.ts);
    if (dt <= radiusMs && (!best || dt < best.dt)) best = { entry: w, dt };
  }
  return best?.entry ?? null;
}

/**
 * Requester-workspace inference for one leak entry. Order: (a) BFF temporal pairing for
 * api-service calls → the paired web entry's bucket; (b) the entry's own bucket modal.
 * Returns { ws|null, via, tied } — `via` records how the attribution was reached (method limit
 * evidence); `tied` marks a non-dominant modal (still reported, lower confidence).
 */
export function inferRequester(entry, buckets, webEntries) {
  const look = (e) => {
    const c = candidatesOf(buckets.get(`${e.ip}|${uaClass(e.ua)}`));
    if (!c.length) return null;
    const total = c.reduce((s, [, n]) => s + n, 0);
    const tied = c.length > 1 && c[0][1] === c[1][1];
    return { ws: c[0][0], share: c[0][1] / total, tied };
  };
  if (entry.service === "api") {
    const web = pairWebEntry(entry, webEntries);
    if (web) {
      const r = look(web);
      if (r) return { ...r, via: "bff-pair" };
      // the web twin had no resolvable ids — fall through to the api bucket itself
    }
    const r = look(entry);
    return r ? { ...r, via: "bucket-modal" } : { ws: null, via: "unattributed", tied: false };
  }
  const r = look(entry);
  return r ? { ...r, via: "bucket-modal" } : { ws: null, via: "unattributed", tied: false };
}

/**
 * The rows a pre-fix route could have returned for one entry, as owner workspaces:
 *   voices-list → every live persona's workspace (the pre-fix query had no predicate);
 *   id routes   → the owner of the ULID(s)/slug in the path.
 * `ownerOf(id)` resolves personas/projects/runs/threads/connections ids + project/persona slugs.
 * `personasLiveAt(ts)` → the personas existing at ts (ULID-minted ms ≤ ts, not yet deleted).
 */
export function exposedOwners(entry, { personasLiveAt, ownerOf }) {
  if (entry.family === "voices-list") {
    return new Set(personasLiveAt(entry.ts).map((p) => p.ws));
  }
  const out = new Set();
  for (const id of extractIds(entry.path)) {
    const o = ownerOf(id);
    if (o) out.add(o.ws);
  }
  return out;
}

/**
 * Per-request outcome. `served` = 2xx (data actually returned); `written` = mutating verb that
 * could have touched the foreign row. Real means non-is_test on BOTH sides — test-tenant traffic
 * is out of the REQ-FOR-4 definition and recorded separately.
 */
export function verdict(entry, requester, owners, wsIsTest) {
  if (entry.family === "non-app" || entry.family === "web-doc") return "non-app";
  if (entry.family.endsWith("-write")) {
    entry._write = true;
  }
  if (!(entry.status >= 200 && entry.status < 300)) return "not-served";
  if (!owners.size) return "own-or-empty"; // e.g. /voices list before any persona existed
  if (!requester.ws) {
    return [...owners].some((ws) => !wsIsTest(ws)) ? "unresolved-possible" : "unresolved-test-only";
  }
  const foreign = [...owners].filter((ws) => ws !== requester.ws);
  if (!foreign.length) return "own";
  const foreignReal = foreign.filter((ws) => !wsIsTest(ws));
  if (wsIsTest(requester.ws)) return "test-requester";
  if (!foreignReal.length) return "foreign-test-only";
  return entry._write ? "cross-tenant-write" : "exposed";
}

/** Deterministic anonymizer: stable `real-ws-N` labels in first-seen order. */
export function anonymizer() {
  const map = new Map();
  return (ws, isTest) => {
    if (isTest) return "test-ws";
    if (!map.has(ws)) map.set(ws, `real-ws-${map.size + 1}`);
    return map.get(ws);
  };
}

// ── prod reads (BEGIN READ ONLY) ────────────────────────────────────────────────────────────

async function readProd(pool) {
  const c = await pool.connect();
  try {
    await c.query("begin read only");
    const q = (sql, p = []) => c.query(sql, p).then((r) => r.rows);
    return {
      workspaces: await q("select id, kind, is_test, created_at from workspaces"),
      members: await q("select workspace_id, user_id from workspace_members"),
      sessions: await q(
        "select user_id, created_at, expires_at from session where expires_at >= $1",
        ["2026-09-17T00:00:00Z"],
      ),
      personas: await q("select id, workspace_id, deleted_at from personas"),
      projects: await q("select id, workspace_id, slug, created_at from projects"),
      runs: await q("select id, workspace_id, project_id, created_at from runs"),
      threads: await q("select t.id, p.workspace_id from threads t join projects p on p.id = t.project_id"),
      connections: await q(
        "select cn.id, p.workspace_id from connections cn join personas p on p.id = cn.persona_id",
      ),
      artifacts: await q("select id, workspace_id from artifacts"),
      figures: await q("select f.id, p.workspace_id from figures f join projects p on p.id = f.project_id"),
      timeline: await q("select id, workspace_id from timeline_events"),
      checkouts: await q("select id, workspace_id from checkout_sessions"),
      deploys: await q(
        "select id, git_sha, deployed_at from deployments where stage='prod' order by deployed_at",
      ),
    };
  } finally {
    await c.query("rollback").catch(() => undefined);
    c.release();
  }
}

// ── analysis driver ────────────────────────────────────────────────────────────────────────

export function analyze(windowEntries, prod) {
  const wsById = new Map(prod.workspaces.map((w) => [w.id, w]));
  const wsIsTest = (ws) => wsById.get(ws)?.is_test === true;

  // Per-route exposure windows end at the fix's prod deploy. `deployed_at` is the record time —
  // a Cloud Run rollout trails it, so requests keep counting as exposable for FIX_SKEW_MS past
  // the row (conservative: over-counts boundary exposure, never under-counts).
  const FIX_SKEW_MS = 15 * 60 * 1000;
  const deployTs = (shaPrefix) => {
    const d = prod.deploys.find((x) => x.git_sha.startsWith(shaPrefix));
    return d ? new Date(d.deployed_at).getTime() + FIX_SKEW_MS : null;
  };
  const STB2_DOSSIER_FIX = "f3c7e135"; // prod:f3c7e13… — dossier workspace predicate
  const SEC1_FIX = "987ce0024"; // prod:987ce00… — /voices + loadProject predicates + role switch
  const fixBoundary = { dossier: deployTs(STB2_DOSSIER_FIX), sec1: deployTs(SEC1_FIX) };
  const postFix = (e) => {
    const b = e.family === "dossier" ? fixBoundary.dossier : fixBoundary.sec1;
    return b !== null && e.ts >= b;
  };

  // id → owner resolution: ULIDs via resource tables; slugs via projects.slug. The owner shape is
  // {ws: <workspaceId>, isTest} — every consumer reads `.ws` (bucket hits + exposedOwners).
  const idOwner = new Map();
  const put = (id, ws) => idOwner.set(id, { ws, isTest: wsById.get(ws)?.is_test === true });
  prod.personas.forEach((p) => put(p.id, p.workspace_id));
  prod.projects.forEach((p) => {
    put(p.id, p.workspace_id);
    if (p.slug) idOwner.set(p.slug, { ws: p.workspace_id, isTest: wsById.get(p.workspace_id)?.is_test === true });
  });
  prod.runs.forEach((r) => put(r.id, r.workspace_id));
  prod.threads.forEach((t) => put(t.id, t.workspace_id));
  prod.connections.forEach((x) => put(x.id, x.workspace_id));
  (prod.artifacts ?? []).forEach((a) => put(a.id, a.workspace_id));
  (prod.figures ?? []).forEach((f) => put(f.id, f.workspace_id));
  (prod.timeline ?? []).forEach((t) => put(t.id, t.workspace_id));
  (prod.checkouts ?? []).forEach((x) => put(x.id, x.workspace_id));
  const ownerOf = (id) => idOwner.get(id) ?? null;

  // persona existence at ts: ULID mint time bounds creation; deleted_at bounds the end.
  const personas = prod.personas.map((p) => ({
    id: p.id,
    ws: p.workspace_id,
    mintedMs: decodeUlidMs(p.id) ?? 0,
    deletedAt: p.deleted_at ? Date.parse(p.deleted_at) : null,
  }));
  const personasLiveAt = (ts) =>
    personas.filter((p) => p.mintedMs <= ts && (p.deletedAt === null || p.deletedAt > ts));

  const buckets = buildBuckets(windowEntries, ownerOf);
  const webEntries = windowEntries.filter((e) => e.service === "web");

  // session universe at ts: which workspaces held a live session (method-limit evidence for
  // unattributed requests — a request with no resolvable requester could still only come from a
  // workspace that was actually signed in at the time).
  const userWs = new Map();
  prod.members.forEach((m) => {
    if (!userWs.has(m.user_id)) userWs.set(m.user_id, new Set());
    userWs.get(m.user_id).add(m.workspace_id);
  });
  const sessionWsAt = (ts) => {
    const out = new Set();
    for (const s of prod.sessions) {
      if (new Date(s.created_at) <= ts && ts <= new Date(s.expires_at)) {
        (userWs.get(s.user_id) ?? []).forEach((ws) => out.add(ws));
      }
    }
    return out;
  };

  const anon = anonymizer();
  const families = {};
  const fam = (k) =>
    (families[k] ??= {
      requests: 0,
      served: 0,
      outcomes: {},
      exposureEvents: 0,
      crossTenantWrites: 0,
      firstTs: null,
      lastTs: null,
      requesterRealWs: new Set(),
      ownerRealWs: new Set(),
      pairs: {},
      pairFirstTs: {},
      pairLastTs: {},
      attribution: {},
    });

  const unresolvedPossible = [];
  const census = {};
  for (const e of windowEntries) {
    if (e.service === "other") continue;
    census[e.family] = (census[e.family] ?? 0) + 1;
    if (!VERDICT_FAMILIES.has(e.family)) continue;
    const F = fam(e.family);
    F.requests++;
    if (e.status >= 200 && e.status < 300) F.served++;
    // a request at/after the fix deploy (+ skew) could not have returned cross-tenant rows.
    const owners = postFix(e) ? new Set() : exposedOwners(e, { personasLiveAt, ownerOf });
    const requester = inferRequester(e, buckets, webEntries);
    F.attribution[requester.via] = (F.attribution[requester.via] ?? 0) + 1;
    const v = postFix(e) ? "post-fix" : verdict(e, requester, owners, wsIsTest);
    F.outcomes[v] = (F.outcomes[v] ?? 0) + 1;
    if (v === "exposed" || v === "cross-tenant-write") {
      if (v === "exposed") F.exposureEvents++;
      else F.crossTenantWrites++;
      const req = anon(requester.ws, wsIsTest(requester.ws));
      F.requesterRealWs.add(req);
      const foreignReal = [...owners].filter((ws) => ws !== requester.ws && !wsIsTest(ws));
      for (const ws of foreignReal) {
        const ownerLabel = anon(ws, false);
        F.ownerRealWs.add(ownerLabel);
        const pairKey = `${req}→${ownerLabel}${v === "cross-tenant-write" ? " (write)" : ""}`;
        F.pairs[pairKey] = (F.pairs[pairKey] ?? 0) + 1;
        if (!F.pairFirstTs[pairKey] || e.ts < F.pairFirstTs[pairKey]) F.pairFirstTs[pairKey] = e.ts;
        if (!F.pairLastTs[pairKey] || e.ts > F.pairLastTs[pairKey]) F.pairLastTs[pairKey] = e.ts;
      }
      if (!F.firstTs || e.ts < F.firstTs) F.firstTs = e.ts;
      if (!F.lastTs || e.ts > F.lastTs) F.lastTs = e.ts;
    }
    if (v === "unresolved-possible") {
      const sess = sessionWsAt(new Date(e.ts));
      const realCandidates = [...sess].filter((ws) => !wsIsTest(ws));
      unresolvedPossible.push({ ts: e.ts, family: e.family, realSessionWs: realCandidates.length });
    }
  }

  const routeVerdict = (F) =>
    F && (F.exposureEvents > 0 || F.crossTenantWrites > 0)
      ? "yes"
      : F && (F.outcomes["unresolved-possible"] ?? 0) > 0
        ? "undetermined"
        : "no";

  const perRoute = {};
  for (const [k, F] of Object.entries(families)) {
    perRoute[k] = {
      requests: F.requests,
      served2xx: F.served,
      verdict: routeVerdict(F),
      exposureEvents: F.exposureEvents,
      crossTenantWrites: F.crossTenantWrites,
      firstExposure: F.firstTs ? new Date(F.firstTs).toISOString() : null,
      lastExposure: F.lastTs ? new Date(F.lastTs).toISOString() : null,
      distinctRequesterRealWorkspaces: F.requesterRealWs.size,
      distinctOwnerRealWorkspaces: F.ownerRealWs.size,
      exposurePairs: Object.fromEntries(
        Object.entries(F.pairs).map(([k, n]) => [
          k,
          {
            events: n,
            first: new Date(F.pairFirstTs[k]).toISOString(),
            last: new Date(F.pairLastTs[k]).toISOString(),
          },
        ]),
      ),
      outcomes: F.outcomes,
      attribution: F.attribution,
    };
  }
  return {
    perRoute,
    unresolvedPossible,
    census,
    wsById,
    anon,
    fixBoundary: {
      dossier: fixBoundary.dossier ? new Date(fixBoundary.dossier).toISOString() : null,
      sec1: fixBoundary.sec1 ? new Date(fixBoundary.sec1).toISOString() : null,
      skewMs: FIX_SKEW_MS,
    },
  };
}

// ── CLI ─────────────────────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const flag = (n, dflt) => {
    const i = args.indexOf(n);
    return i >= 0 ? args[i + 1] : dflt;
  };
  const includeIds = args.includes("--include-ids");
  const asJson = args.includes("--json");
  const dsn = process.env.DATABASE_URL;
  if (!dsn) {
    console.error("[rls-exposure] DATABASE_URL (system role) is required — see header.");
    process.exit(2);
  }
  const leakPath = flag("--leak", DEFAULT_LEAK);
  const windowPath = flag("--window", DEFAULT_WINDOW);
  const leakRaw = JSON.parse(readFileSync(leakPath, "utf8"));
  const windowRaw = JSON.parse(readFileSync(windowPath, "utf8"));
  const leak = leakRaw.map(toEntry).filter(Boolean);
  const win = windowRaw.map(toEntry).filter(Boolean);
  console.error(`[rls-exposure] loaded ${win.length} window / ${leak.length} leak entries`);

  const pool = new pg.Pool({ connectionString: dsn, max: 1 });
  let prod;
  try {
    prod = await readProd(pool);
  } finally {
    await pool.end();
  }

  const { perRoute, unresolvedPossible, census, fixBoundary } = analyze(win, prod);

  const report = {
    generatedAt: new Date().toISOString(),
    inputs: {
      windowEntries: win.length,
      leakEntries: leak.length,
      leakFirstTs: leak.length ? new Date(Math.min(...leak.map((e) => e.ts))).toISOString() : null,
      leakLastTs: leak.length ? new Date(Math.max(...leak.map((e) => e.ts))).toISOString() : null,
    },
    universe: {
      workspacesTotal: prod.workspaces.length,
      workspacesTest: prod.workspaces.filter((w) => w.is_test).length,
      workspacesReal: prod.workspaces.filter((w) => !w.is_test).length,
      personasTotal: prod.personas.length,
      personaOwnerRealWorkspaces: new Set(
        prod.personas.map((p) => p.workspace_id).filter((ws) => !(prod.workspaces.find((w) => w.id === ws)?.is_test)),
      ).size,
      sessionsInTable: prod.sessions.length,
      sessionOwnerWorkspaces: new Set(
        prod.sessions.flatMap((s) => prod.members.filter((m) => m.user_id === s.user_id).map((m) => m.workspace_id)),
      ).size,
      projectsTotal: prod.projects.length,
      runsTotal: prod.runs.length,
    },
    fixBoundary,
    windowCensus: census,
    leakSubsetCensus: leak.reduce((m, e) => ({ ...m, [e.family]: (m[e.family] ?? 0) + 1 }), {}),
    perRoute,
    anyYes: Object.values(perRoute).some((r) => r.verdict === "yes"),
    unresolvedPossibleCount: unresolvedPossible.length,
    methodLimits: [
      "access logs carry no principal (no cookie/token is logged); prod session.ip_address is blank on 36/37 session rows, so requester attribution is the request-stream's modal resource-owner inference (+BFF temporal pairing for api calls through the web service's egress IPs) — heuristic, recorded per family under `attribution`",
      "response bodies are not logged; `served` = HTTP 2xx on a route whose pre-fix query is re-confirmed unpredicated — the exposure set is what the query COULD have returned",
      "ownership/existence uses current prod rows (personas have no created_at column; ULID mint time bounds creation, deleted_at bounds the end; rows hard-purged in-window are invisible — 26 requests carry 4 unresolvable ids)",
      "session rows can be deleted on sign-out/expiry, so an unattributed request cannot be proven benign — such requests are counted under `unresolved-possible` with the count of real workspaces that held a live session at that moment",
      "deploy boundaries come from prod `deployments.deployed_at`: dossier fix prod:f3c7e13… 2026-09-25T22:14:02Z; SEC.1 predicates+role switch prod:987ce00… 2026-10-01T01:54:21Z (exposure windows end at those rows)",
    ],
  };
  if (includeIds) {
    report._identified = { note: "operator-local only — never commit this output" };
  }
  console.log(JSON.stringify(report, null, asJson ? 0 : 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error("[rls-exposure] failed:", e);
    process.exit(1);
  });
}
