import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createOrchestratorTestDb, seedProject, makeDeps, type OrchestratorTestDb, type TestDeps } from "@rhema/orchestrator/testing";
import { ACCOUNT_DELETION_CONFIRMATION } from "@rhema/contracts";
import { createSettingsRoutes, ACCOUNT_HARD_DELETE_QUEUE } from "./settings-routes.js";
import type { Principal } from "./index.js";

// P1.20 — the §14.7 settings api half over PGlite via Hono's app.request:
//  • Account — profile read/write (byline mirrors into user.prefs), the magic-link email change
//    (verification row + auth.mail send + confirm), and session revoke.
//  • Preferences — the user.prefs blob merges; a null field deletes (top-level AND nested
//    editor/rigorByWorkflow); strict-schema rejects unknown keys/bad enums.
//  • Data — support access grants 72 h + user-visible log (grant/revoke idempotent), the Q-26
//    preference opt-out round-trips, deletion request/cancel rides the 14-day grace + the
//    account.hard-delete queue, and the integrations read/disconnect keeps samples.
//  • Project settings — REQ-GENRE-2 safe fields only; a protocol_id change stamps
//    protocol_changed_at for the next Review's scope card.

let db: OrchestratorTestDb;
let deps: TestDeps;
const NOW = new Date("2026-09-20T12:00:00Z");

const USER = "01JQ0000000000000000000MB1";
const WS = "01JQ0000000000000000000WS1";
const BA = "ba_seed";
const PROJ = "01JQ0000000000000000PROJ1";
const PERSONA = "01JQ0000000000000000PER1";

const principal = (): Principal => ({ userId: USER, workspaceId: WS, billingAccountId: BA });

function app(p: Principal | null = principal()) {
  return createSettingsRoutes({
    principal: () => p,
    db: db.client,
    txRunner: db.txRunner,
    ids: deps.ids,
    clock: deps.clock,
    queue: deps.queue,
    appBaseUrl: "http://app.test",
  });
}

const get = (path: string, headers: Record<string, string> = {}) => app().request(path, { headers });
const jsonReq = (method: "POST" | "PUT", path: string, body: unknown) =>
  app().request(path, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const put = (path: string, body: unknown) => jsonReq("PUT", path, body);
const post = (path: string, body: unknown) => jsonReq("POST", path, body);

beforeEach(async () => {
  db = await createOrchestratorTestDb();
  deps = makeDeps(db, { now: NOW });
  await seedProject(db, { userId: USER, workspaceId: WS, billingAccountId: BA, projectId: PROJ, draftN: 1 });
  await db.pg.query("insert into workspace_members(workspace_id, user_id, role) values ($1,$2,'admin')", [WS, USER]);
  await db.pg.query(`update "user" set name = 'Seed User', image = null where id = $1`, [USER]);
});
afterEach(() => db.close());

describe("GET /settings/account — profile + methods + sessions (§14.7)", () => {
  it("returns the profile, sign-in methods, sessions (current marked via cookie), no pending state", async () => {
    await db.pg.query(
      `insert into account(id, user_id, provider_id, account_id, issuer) values ('a1',$1,'google','g-123','local:oauth:google')`,
      [USER],
    );
    // bind expiries against the FIXED clock (PGlite now() is the wall clock, not deps.clock).
    const day = 24 * 3600_000;
    await db.pg.query(
      `insert into session(id, user_id, token, expires_at, user_agent) values
         ('s_cur',$1,'tok_cur', $2, 'agent-one'),
         ('s_other',$1,'tok_other', $2, 'agent-two'),
         ('s_old',$1,'tok_old', $3, 'agent-old')`,
      [USER, new Date(NOW.getTime() + day), new Date(NOW.getTime() - day)],
    );
    const res = await get("/settings/account", { cookie: "__Host-rhema.session_token=tok_cur.sig" });
    expect(res.status).toBe(200);
    const dto = (await res.json()) as {
      user: { name: string; email: string; byline: string | null; pendingEmail: string | null };
      signInMethods: { kind: string }[];
      sessions: { id: string; current: boolean }[];
      deletion: null;
    };
    expect(dto.user.name).toBe("Seed User");
    expect(dto.user.pendingEmail).toBeNull();
    expect(dto.signInMethods.map((m) => m.kind)).toEqual(["magic_link", "google"]);
    // only live sessions; the request's own token marks current (the signature half never leaves).
    expect(dto.sessions.map((s) => s.id).sort()).toEqual(["s_cur", "s_other"]);
    expect(dto.sessions.find((s) => s.id === "s_cur")?.current).toBe(true);
    expect(dto.sessions.find((s) => s.id === "s_other")?.current).toBe(false);
    expect(dto.deletion).toBeNull();
  });

  it("401s without a principal", async () => {
    expect((await app(null).request("/settings/account")).status).toBe(401);
  });
});

describe("PUT /settings/account — name/byline/avatar", () => {
  it("writes the profile fields and mirrors byline into user.prefs", async () => {
    const res = await put("/settings/account", { name: "New Name", byline: "S. Seed", image: "https://x.test/a.png" });
    expect(res.status).toBe(200);
    const row = (
      await db.pg.query(`select name, byline, image, prefs from "user" where id = $1`, [USER])
    ).rows[0] as { name: string; byline: string; image: string; prefs: { byline?: string } };
    expect(row).toMatchObject({ name: "New Name", byline: "S. Seed", image: "https://x.test/a.png" });
    expect(row.prefs.byline).toBe("S. Seed");
    // clearing the byline removes both the column AND the pref.
    await put("/settings/account", { byline: "" });
    const cleared = (
      await db.pg.query(`select byline, prefs from "user" where id = $1`, [USER])
    ).rows[0] as { byline: string | null; prefs: { byline?: string } };
    expect(cleared.byline).toBeNull();
    expect(cleared.prefs.byline).toBeUndefined();
  });

  it("422s an empty name and an empty patch", async () => {
    expect((await put("/settings/account", { name: "  " })).status).toBe(422);
    expect((await put("/settings/account", {})).status).toBe(422);
  });
});

describe("email change — verification row + auth.mail + confirm", () => {
  it("mints the token, queues the magic link, and confirm switches the address", async () => {
    const res = await post("/settings/account/email", { email: "new@example.test" });
    expect(res.status).toBe(200);
    expect((await res.json()) as { pendingEmail: string }).toMatchObject({ pendingEmail: "new@example.test" });
    // the mail rides the same auth.mail queue as the sign-in magic link, targeting the WEB confirm route.
    const mail = deps.queue.ofName("auth.mail");
    expect(mail).toHaveLength(1);
    expect(mail[0]!.payload.to).toBe("new@example.test");
    const link = (mail[0]!.payload.text as string).match(/confirmEmail=(\S+)/)?.[1];
    expect(link).toBeTruthy();
    // pending shows on the account read.
    const acct = (await (await get("/settings/account")).json()) as { user: { pendingEmail: string } };
    expect(acct.user.pendingEmail).toBe("new@example.test");
    // the confirm consumes the token — email + verified flip, the row is gone.
    const ok = await post("/settings/account/email/confirm", { token: decodeURIComponent(link!) });
    expect(ok.status).toBe(200);
    const row = (await db.pg.query(`select email, email_verified from "user" where id = $1`, [USER])).rows[0] as {
      email: string;
      email_verified: boolean;
    };
    expect(row).toEqual({ email: "new@example.test", email_verified: true });
    expect((await post("/settings/account/email/confirm", { token: decodeURIComponent(link!) })).status).toBe(410);
  });

  it("422s a bad address and the same address", async () => {
    expect((await post("/settings/account/email", { email: "nope" })).status).toBe(422);
    const me = (await db.pg.query(`select email from "user" where id = $1`, [USER])).rows[0] as { email: string };
    expect((await post("/settings/account/email", { email: me.email })).status).toBe(422);
  });
});

describe("POST /settings/sessions/revoke", () => {
  it("deletes the named session; an unknown id 404s", async () => {
    await db.pg.query(
      `insert into session(id, user_id, token, expires_at) values ('s1',$1,'t1', now() + interval '1 day')`,
      [USER],
    );
    expect((await post("/settings/sessions/revoke", { sessionId: "s1" })).status).toBe(200);
    expect((await db.pg.query(`select id from session where id = 's1'`)).rows).toHaveLength(0);
    expect((await post("/settings/sessions/revoke", { sessionId: "s1" })).status).toBe(404);
    expect((await post("/settings/sessions/revoke", {})).status).toBe(422);
  });
});

describe("GET|PUT /settings/preferences — the user.prefs blob", () => {
  it("round-trips the account defaults; a null field deletes the key (top-level + nested)", async () => {
    const set = await put("/settings/preferences", {
      defaultModelTier: "frontier",
      defaultRigor: "quick",
      rigorByWorkflow: { review: "full_board", revise: "quick" },
      approvalPolicy: "wait_each",
      editor: { paperTheme: "dark", fontPreset: "mono", fontSizeStep: 1 },
    });
    expect(set.status).toBe(200);
    const read = (await (await get("/settings/preferences")).json()) as {
      prefs: Record<string, unknown>;
      consentDontAskUnder: number;
      appTheme: string;
    };
    expect(read.prefs).toMatchObject({
      defaultModelTier: "frontier",
      defaultRigor: "quick",
      rigorByWorkflow: { review: "full_board", revise: "quick" },
      approvalPolicy: "wait_each",
      editor: { paperTheme: "dark", fontPreset: "mono", fontSizeStep: 1 },
    });
    // null = unset: top-level + one nested key each.
    const del = await put("/settings/preferences", {
      defaultModelTier: null,
      rigorByWorkflow: { revise: null },
      editor: { fontPreset: null },
    });
    expect(del.status).toBe(200);
    const prefs = ((await del.json()) as { prefs: Record<string, unknown> }).prefs;
    expect(prefs.defaultModelTier).toBeUndefined();
    expect(prefs.defaultRigor).toBe("quick"); // untouched
    expect(prefs.rigorByWorkflow).toEqual({ review: "full_board" });
    expect(prefs.editor).toEqual({ paperTheme: "dark", fontSizeStep: 1 });
  });

  it("422s an unknown key and an out-of-vocabulary value", async () => {
    expect((await put("/settings/preferences", { theme: "dark" })).status).toBe(422);
    expect((await put("/settings/preferences", { defaultModelTier: "opus" })).status).toBe(422);
    expect((await put("/settings/preferences", { approvalPolicy: "yolo" })).status).toBe(422);
  });
});

describe("support access (REQ-VIS-11) — the 72-h grant + user-visible log", () => {
  it("enable mints one 72-h grant + a 'granted' row; re-enable is idempotent; disable revokes + logs", async () => {
    const on = await post("/settings/support-access", { enabled: true });
    expect(on.status).toBe(200);
    const grant = ((await on.json()) as { grant: { expiresAt: string } }).grant;
    expect(new Date(grant.expiresAt).getTime() - NOW.getTime()).toBe(72 * 60 * 60 * 1000);

    // idempotent — a second enable returns the same grant, no second grant/log row.
    await post("/settings/support-access", { enabled: true });
    expect((await db.pg.query("select id from support_access_grants where user_id = $1", [USER])).rows).toHaveLength(1);
    expect(
      (await db.pg.query("select id from support_access_log where user_id = $1 and action = 'granted'", [USER])).rows,
    ).toHaveLength(1);

    const data = (await (await get("/settings/data")).json()) as {
      supportAccess: { active: boolean; grant: { expiresAt: string } | null; log: { action: string }[] };
    };
    expect(data.supportAccess.active).toBe(true);
    expect(data.supportAccess.grant?.expiresAt).toBe(grant.expiresAt);
    expect(data.supportAccess.log.map((l) => l.action)).toEqual(["granted"]);

    await post("/settings/support-access", { enabled: false });
    const after = (await (await get("/settings/data")).json()) as { supportAccess: { active: boolean; log: { action: string }[] } };
    expect(after.supportAccess.active).toBe(false);
    // grant + revoke share the fixed clock — assert membership, not arrival order.
    expect(after.supportAccess.log.map((l) => l.action).sort()).toEqual(["granted", "revoked"]);
    // already off → a no-op, no extra noise.
    await post("/settings/support-access", { enabled: false });
    expect((await db.pg.query("select id from support_access_log where user_id = $1", [USER])).rows).toHaveLength(2);
  });

  it("an expired grant reads inactive; a non-boolean enabled 422s", async () => {
    // bind against the FIXED clock — PGlite's now() is the wall clock, not deps.clock.
    await db.pg.query(
      `insert into support_access_grants(id, user_id, workspace_id, granted_at, expires_at)
       values ('g_old',$1,$2,$3,$4)`,
      [USER, WS, new Date(NOW.getTime() - 80 * 3600_000), new Date(NOW.getTime() - 8 * 3600_000)],
    );
    const data = (await (await get("/settings/data")).json()) as { supportAccess: { active: boolean } };
    expect(data.supportAccess.active).toBe(false);
    expect((await post("/settings/support-access", { enabled: "yes" })).status).toBe(422);
  });
});

describe("Q-26 preference-profile opt-out (REQ-OBJ-14)", () => {
  it("round-trips through user.prefs and the Data read", async () => {
    const put1 = await put("/settings/preference-profile", { optOut: true });
    expect(put1.status).toBe(200);
    const prefs = (await db.pg.query(`select prefs from "user" where id = $1`, [USER])).rows[0] as {
      prefs: { preferenceOptOut?: boolean };
    };
    expect(prefs.prefs.preferenceOptOut).toBe(true);
    const data = (await (await get("/settings/data")).json()) as { preferenceOptOut: boolean };
    expect(data.preferenceOptOut).toBe(true);
    await put("/settings/preference-profile", { optOut: false });
    expect(
      ((await (await get("/settings/data")).json()) as { preferenceOptOut: boolean }).preferenceOptOut,
    ).toBe(false);
    expect((await put("/settings/preference-profile", { optOut: "yes" })).status).toBe(422);
  });
});

describe("REQ-ACCT-4 — delete account: typed confirmation → 14-day grace → hard-delete job", () => {
  it("rejects a wrong confirmation; the right one starts the clock + enqueues the job", async () => {
    expect((await post("/settings/account/delete", { confirmation: "DELETE" })).status).toBe(422);
    const res = await post("/settings/account/delete", { confirmation: ACCOUNT_DELETION_CONFIRMATION });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { deletion: { requestedAt: string; graceEndsAt: string } };
    expect(body.deletion.requestedAt).toBe(NOW.toISOString());
    expect(new Date(body.deletion.graceEndsAt).getTime() - NOW.getTime()).toBe(14 * 24 * 60 * 60 * 1000);
    const jobs = deps.queue.ofName(ACCOUNT_HARD_DELETE_QUEUE);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.payload).toMatchObject({ userId: USER });
    expect(jobs[0]!.singletonKey).toBe(`${ACCOUNT_HARD_DELETE_QUEUE}:${USER}`);
    expect(jobs[0]!.startAfterMs).toBe(14 * 24 * 60 * 60 * 1000);
    // the banner state rides the account + data reads.
    expect(
      ((await (await get("/settings/account")).json()) as { deletion: { graceEndsAt: string } | null }).deletion?.graceEndsAt,
    ).toBe(body.deletion.graceEndsAt);
  });

  it("a second request keeps the FIRST clock (no grace extension); cancel clears it inside the window", async () => {
    await post("/settings/account/delete", { confirmation: ACCOUNT_DELETION_CONFIRMATION });
    deps.clock.set(new Date(NOW.getTime() + 2 * 24 * 60 * 60 * 1000)); // +2 days
    const again = (await (await post("/settings/account/delete", { confirmation: ACCOUNT_DELETION_CONFIRMATION })).json()) as {
      deletion: { requestedAt: string };
    };
    expect(again.deletion.requestedAt).toBe(NOW.toISOString()); // the first request's clock, not now
    const cancel = await post("/settings/account/delete/cancel", {});
    expect(cancel.status).toBe(200);
    expect((await db.pg.query(`select deletion_requested_at from "user" where id = $1`, [USER])).rows[0]).toEqual({
      deletion_requested_at: null,
    });
    expect((await post("/settings/account/delete/cancel", {})).status).toBe(409);
  });
});

describe("GET /settings/integrations + disconnect (REQ-ACCT-2)", () => {
  beforeEach(async () => {
    await db.pg.query(
      `insert into personas(id, workspace_id, slug, display_name, mode, kind) values ($1,$2,'voice-1','Voice One','self','leaf')`,
      [PERSONA, WS],
    );
    await db.pg.query(
      `insert into connections(id, persona_id, provider, handle, status, auth_ref) values
         ('cn_sub',$1,'substack','@seed','connected','oauth-ref'),
         ('cn_med',$1,'medium',null,'degraded',null)`,
      [PERSONA],
    );
    await db.pg.query(
      `insert into discovered_items(id, connection_id, title, state) values
         ('di1','cn_sub','Post one','included'),
         ('di2','cn_sub','Post two','candidate'),
         ('di3','cn_sub','Post three','included')`,
      [],
    );
  });

  it("lists the uniform cards with counts + persona; disconnect drops the credential, keeps the items", async () => {
    const dto = (await (await get("/settings/integrations")).json()) as {
      connections: { id: string; provider: string; status: string; items: number; includedItems: number; persona: { name: string } }[];
      voices: { name: string }[];
    };
    expect(dto.voices.map((v) => v.name)).toEqual(["Voice One"]);
    const sub = dto.connections.find((cn) => cn.id === "cn_sub")!;
    expect(sub).toMatchObject({ provider: "substack", status: "connected", items: 3, includedItems: 2 });
    expect(sub.persona.name).toBe("Voice One");

    const res = await post("/settings/integrations/cn_sub/disconnect", {});
    expect(res.status).toBe(200);
    const row = (await db.pg.query(`select removed_at, status, auth_ref from connections where id = 'cn_sub'`)).rows[0] as {
      removed_at: Date | null;
      status: string;
      auth_ref: string | null;
    };
    expect(row.removed_at).not.toBeNull();
    expect(row.status).toBe("removed");
    expect(row.auth_ref).toBeNull(); // the credential is gone NOW
    // the ingested samples remain — REQ-ACCT-2's "samples remain unless separately removed".
    expect((await db.pg.query(`select id from discovered_items where connection_id = 'cn_sub'`)).rows).toHaveLength(3);
    // gone from the listing; a second disconnect 404s.
    const dto2 = (await (await get("/settings/integrations")).json()) as { connections: { id: string }[] };
    expect(dto2.connections.map((cn) => cn.id)).toEqual(["cn_med"]);
    expect((await post("/settings/integrations/cn_sub/disconnect", {})).status).toBe(404);
  });

  it("a connection owned by another workspace 404s (the workspace predicate is the tenant guard)", async () => {
    await db.pg.query(`insert into billing_accounts(id) values ('ba_other') on conflict (id) do nothing`, []);
    await db.pg.query(
      `insert into workspaces(id, kind, name, billing_account_id) values ('ws_other','personal','Other','ba_other') on conflict (id) do nothing`,
      [],
    );
    await db.pg.query(
      `insert into personas(id, workspace_id, slug, mode, kind) values ('p_other','ws_other','v2','self','leaf')`,
      [],
    );
    await db.pg.query(`insert into connections(id, persona_id, provider) values ('cn_other','p_other','gdrive')`, []);
    expect((await post("/settings/integrations/cn_other/disconnect", {})).status).toBe(404);
    expect(
      ((await db.pg.query(`select removed_at from connections where id = 'cn_other'`)).rows[0] as { removed_at: Date | null })
        .removed_at,
    ).toBeNull();
  });
});

describe("GET|PUT /projects/:id/settings — REQ-GENRE-2 safe fields + the §6.7 marker", () => {
  it("reads the safe fields and patches them; a protocol change stamps protocol_changed_at", async () => {
    const dto = (await (await get(`/projects/${PROJ}/settings`)).json()) as {
      project: {
        protocolId: string | null;
        rigorDefault: string | null;
        modelTierDefault: string | null;
        approvalPolicy: string;
        protocolChangedAt: string | null;
        protocolOverrides: unknown;
      };
      protocols: { id: string; name: string }[];
    };
    expect(dto.project.protocolChangedAt).toBeNull();
    // the picker options are the published §5.3 cards (same source as GET /protocols).
    expect(dto.protocols.map((p) => p.id)).toEqual(["essay", "academic", "op-ed", "memo"]);

    const patch = await put(`/projects/${PROJ}/settings`, {
      venue: "LRB",
      protocolId: "essay",
      rigorDefault: "full_board",
      modelTierDefault: "frontier",
      paperTheme: "dark",
      protocolOverrides: { length: 8000, phaseDefaults: { verification: false }, stage: "near_final" },
    });
    expect(patch.status).toBe(200);
    const row = (
      await db.pg.query(
        `select venue, protocol_id, rigor_default, model_tier_default, paper_theme, protocol_changed_at, protocol_overrides
           from projects where id = $1`,
        [PROJ],
      )
    ).rows[0] as {
      venue: string;
      protocol_id: string;
      rigor_default: string;
      model_tier_default: string;
      paper_theme: string;
      protocol_changed_at: Date | null;
      protocol_overrides: { stage?: string; length?: number };
    };
    expect(row.venue).toBe("LRB");
    expect(row.protocol_id).toBe("essay");
    expect(row.protocol_changed_at).not.toBeNull(); // §6.7 marker armed
    expect(row.protocol_overrides).toMatchObject({ length: 8000, stage: "near_final" });
    // re-writing the same protocol does NOT re-stamp.
    const stamp1 = row.protocol_changed_at;
    await put(`/projects/${PROJ}/settings`, { protocolId: "essay" });
    const stamp2 = (
      await db.pg.query(`select protocol_changed_at from projects where id = $1`, [PROJ])
    ).rows[0] as { protocol_changed_at: Date | null };
    expect(stamp2.protocol_changed_at).toEqual(stamp1);
  });

  it("rigor/tier null clears to 'inherit the account default'; unknown protocol + foreign fields 422", async () => {
    await put(`/projects/${PROJ}/settings`, { rigorDefault: "quick", modelTierDefault: "base" });
    const cleared = await put(`/projects/${PROJ}/settings`, { rigorDefault: null, modelTierDefault: null });
    expect(cleared.status).toBe(200);
    const row = (
      await db.pg.query(`select rigor_default, model_tier_default from projects where id = $1`, [PROJ])
    ).rows[0] as { rigor_default: string | null; model_tier_default: string | null };
    expect(row).toEqual({ rigor_default: null, model_tier_default: null });

    expect((await put(`/projects/${PROJ}/settings`, { protocolId: "nope" })).status).toBe(422);
    // REQ-GENRE-2 — anything outside the safe set is rejected, not silently dropped.
    expect((await put(`/projects/${PROJ}/settings`, { title: "hax" })).status).toBe(422);
    expect((await put(`/projects/${PROJ}/settings`, {})).status).toBe(422);
    expect((await put(`/projects/${PROJ}/settings`, { rigorDefault: "mega" })).status).toBe(422);
    // another workspace's project 404s.
    await db.pg.query(
      `insert into workspaces(id, kind, name, billing_account_id) values ('ws2','personal','Two','ba_seed')
         on conflict (id) do nothing`,
      [],
    );
    await db.pg.query(`insert into projects(id, workspace_id, owner_id, title, slug) values ('p2','ws2',$1,'T','s2')`, [USER]);
    expect((await get(`/projects/p2/settings`)).status).toBe(404);
    expect((await put(`/projects/p2/settings`, { venue: "X" })).status).toBe(404);
  });
});
