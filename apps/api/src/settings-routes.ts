// P1.20 — the §14.7 settings tree's api half (REQ-ACCT-1/2/4, REQ-VIS-11, REQ-OBJ-14,
// REQ-GATE-3/10, REQ-GENRE-2). Session-authed like the sibling settings routes; writes ride
// `txRunner` (tenant-scoped) where the row is tenant-keyed and the account-scoped `deps.db`
// where it is not ("user", session, account, verification, support_access_* carry no RLS tenant).
//
//   GET  /settings/account                      — profile + sign-in methods + sessions + pending
//                                                  email change + deletion banner state
//   PUT  /settings/account                      — name / byline / image (avatar)
//   POST /settings/account/email                — start an email change: verification token +
//                                                  `auth.mail` link (same queue the magic link rides)
//   POST /settings/account/email/confirm        — consume the token (proof of the new mailbox)
//   POST /settings/sessions/revoke              — revoke one active session row
//   GET  /settings/preferences                  — user.prefs + consent threshold + app theme
//   PUT  /settings/preferences                  — merge a validated UserPrefs patch (§14.7)
//   GET  /settings/data                         — the Data section's read: analytics opt-out, the
//                                                  Q-26 preference-profile opt-out, support-access
//                                                  grant + visible log, pending deletion
//   POST /settings/support-access               — {enabled} — mint/revoke the 72-h grant + log rows
//   PUT  /settings/preference-profile           — {optOut} — the Q-26 capture opt-out (default-on)
//   POST /settings/account/delete               — typed-confirmation request → grace + hard-delete job
//   POST /settings/account/delete/cancel        — cancel inside the grace window
//   GET  /settings/integrations                 — uniform provider cards (P1.15's connections)
//   POST /settings/integrations/:id/disconnect  — remove the connection + credential, keep samples
//   GET  /projects/:id/settings                 — the §4.2 project-settings read
//   PUT  /projects/:id/settings                 — the REQ-GENRE-2 safe-field patch

import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import { PROTOCOL_CARDS, protocolCard } from "@rhema/protocols";
import {
  ACCOUNT_DELETION_CONFIRMATION,
  SUPPORT_ACCESS_TTL_MS,
  deletionGraceEndsAt,
  parseUserPrefs,
  projectSettingsPatchSchema,
  supportGrantActive,
  userPrefsSchema,
  type AccountSettingsDto,
  type DataSettingsDto,
  type IntegrationsSettingsDto,
  type ProjectSettingsDto,
  type SessionInfoDto,
  type SignInMethodDto,
  type SupportAccessLogDto,
  type UserPrefs,
} from "@rhema/contracts";
import type { Queue, SqlClient } from "@rhema/orchestrator";
import { sessionTokenFromCookieHeader } from "./auth-context.js";
import type { Principal } from "./run-routes.js";

export interface SettingsApiDeps {
  /** session principal (the middleware-resolved one). */
  principal(c: { req: { header(name: string): string | undefined } }): Principal | null;
  /** account + tenant reads — unscoped tables only need the principal's own id predicates. */
  db: SqlClient;
  /** tenant-scoped writes (RLS backstop on tenant-keyed tables). */
  txRunner: { run<T>(workspaceId: string, fn: (tx: SqlClient) => Promise<T>): Promise<T> };
  ids(prefix?: string): string;
  clock: { now(): Date };
  /**
   * The pg-boss queue: the deletion request enqueues `account.hard-delete` (startAfter = the
   * grace end) and the email change reuses the `auth.mail` send payload the magic-link ride uses.
   * Unset ⇒ the writes still land (the row is the state; a deploy without the queue skips the
   * enqueue/mail leg).
   */
  queue?: Queue;
  /** the app origin the email-confirm link targets (the web route consumes it). */
  appBaseUrl?: string;
}

export const ACCOUNT_HARD_DELETE_QUEUE = "account.hard-delete";
const AUTH_MAIL_QUEUE = "auth.mail";
/** The pending email change's verification row lives one hour — same shape as Better Auth's links. */
const EMAIL_CHANGE_TTL_MS = 60 * 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface UserRow {
  id: string;
  name: string | null;
  email: string;
  email_verified: boolean;
  image: string | null;
  byline: string | null;
  prefs: unknown;
  analytics_opt_out: boolean;
  consent_dont_ask_under: number;
  app_theme: string;
  deletion_requested_at: string | Date | null;
}

const USER_COLS = `id, name, email, email_verified, image, byline, prefs, analytics_opt_out,
  consent_dont_ask_under, app_theme, deletion_requested_at`;

async function loadUser(db: SqlClient, userId: string): Promise<UserRow | null> {
  return (
    ((await db.query(`select ${USER_COLS} from "user" where id = $1`, [userId]))
      .rows[0] as UserRow | undefined) ?? null
  );
}

interface GrantRow {
  id: string;
  granted_at: string | Date;
  expires_at: string | Date;
  revoked_at: string | Date | null;
}

async function loadActiveGrant(db: SqlClient, userId: string, now: Date): Promise<GrantRow | null> {
  const rows = (
    await db.query(
      `select id, granted_at, expires_at, revoked_at from support_access_grants
        where user_id = $1 and revoked_at is null and expires_at > $2
        order by granted_at desc limit 1`,
      [userId, now],
    )
  ).rows as GrantRow[];
  return rows[0] ?? null;
}

async function appendSupportLog(
  db: SqlClient,
  ids: (p?: string) => string,
  row: {
    userId: string;
    workspaceId: string;
    grantId?: string | null;
    actor: string;
    action: "granted" | "revoked" | "accessed" | "expired";
    detail?: string | null;
    at?: Date;
  },
): Promise<void> {
  await db.query(
    `insert into support_access_log (id, user_id, workspace_id, grant_id, actor, action, detail, at)
     values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      ids("salog"),
      row.userId,
      row.workspaceId,
      row.grantId ?? null,
      row.actor,
      row.action,
      row.detail ?? null,
      row.at ?? new Date(),
    ],
  );
}

/** REQ-VIS-11's shared logger: a staff access writes BOTH the user-visible support_access_log row
 *  and the operator-side admin_actions audit row (action 'support_access'). The admin-cli calls
 *  this — every transcript/project view an operator takes is on the record. */
export async function logSupportAccess(
  db: SqlClient,
  ids: (p?: string) => string,
  args: {
    userId: string;
    workspaceId: string;
    grantId: string;
    actor: string;
    detail?: string | null;
    at?: Date;
  },
): Promise<void> {
  const at = args.at ?? new Date();
  await appendSupportLog(db, ids, {
    userId: args.userId,
    workspaceId: args.workspaceId,
    grantId: args.grantId,
    actor: args.actor,
    action: "accessed",
    detail: args.detail ?? null,
    at,
  });
  await db.query(
    `insert into admin_actions (id, actor, action, workspace_id, credits, note, at)
     values ($1,$2,'support_access',$3,null,$4,$5)`,
    [
      ids("adm"),
      args.actor,
      args.workspaceId,
      `support access for user ${args.userId} (grant ${args.grantId})${args.detail ? ` — ${args.detail}` : ""}`,
      at,
    ],
  );
}

export function createSettingsRoutes(deps: SettingsApiDeps): Hono {
  const app = new Hono();

  // ---- Account (§14.7) --------------------------------------------------------------------------------------

  app.get("/settings/account", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const user = await loadUser(deps.db, principal.userId);
    if (!user) return c.json({ error: "not_found" }, 404);

    const accounts = (
      await deps.db.query(`select provider_id from account where user_id = $1 order by created_at`, [
        principal.userId,
      ])
    ).rows as { provider_id: string }[];
    const methods: SignInMethodDto[] = [
      { kind: "magic_link", label: "Email magic link", detail: user.email },
      ...accounts
        .filter((a) => a.provider_id !== "credential")
        .map((a) => ({
          kind: a.provider_id as string,
          label: a.provider_id === "google" ? "Google" : a.provider_id,
        })),
    ];

    // Sessions: the raw cookie token (before the '.') marks "This device" — never returned.
    const cookieToken = sessionTokenFromCookieHeader(c.req.header("cookie"));
    const sessions = (
      await deps.db.query(
        `select id, token, user_agent, ip_address, created_at, expires_at from session
          where user_id = $1 and expires_at > $2 order by created_at desc`,
        [principal.userId, deps.clock.now()],
      )
    ).rows as {
      id: string;
      token: string;
      user_agent: string | null;
      ip_address: string | null;
      created_at: string | Date;
      expires_at: string | Date;
    }[];
    const sessionDtos: SessionInfoDto[] = sessions.map((s) => ({
      id: s.id,
      userAgent: s.user_agent,
      ipAddress: s.ip_address,
      createdAt: new Date(s.created_at).toISOString(),
      expiresAt: new Date(s.expires_at).toISOString(),
      current: cookieToken != null && s.token === cookieToken,
    }));

    // A pending email change: the verification row's identifier is user-scoped; the value carries
    // {token, email} — only the email echo leaves here (the token never renders).
    const pending = (
      await deps.db.query(
        `select value from verification where identifier = $1 and expires_at > $2
          order by created_at desc limit 1`,
        [`email-change:${principal.userId}`, deps.clock.now()],
      )
    ).rows[0] as { value: string } | undefined;
    let pendingEmail: string | null = null;
    try {
      pendingEmail = pending ? (JSON.parse(pending.value) as { email?: string }).email ?? null : null;
    } catch {
      pendingEmail = null;
    }

    const requestedAt = user.deletion_requested_at ? new Date(user.deletion_requested_at) : null;
    const dto: AccountSettingsDto = {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.email_verified,
        image: user.image,
        byline: user.byline ?? parseUserPrefs(user.prefs).byline ?? null,
        pendingEmail,
      },
      signInMethods: methods,
      sessions: sessionDtos,
      deletion: requestedAt
        ? { requestedAt: requestedAt.toISOString(), graceEndsAt: deletionGraceEndsAt(requestedAt).toISOString() }
        : null,
    };
    return c.json(dto);
  });

  app.put("/settings/account", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const body = (await c.req.json().catch(() => null)) as {
      name?: unknown;
      byline?: unknown;
      image?: unknown;
    } | null;
    if (!body) return c.json({ error: "invalid_json" }, 400);
    const name =
      body.name === undefined ? undefined : typeof body.name === "string" ? body.name.trim().slice(0, 120) : null;
    const byline =
      body.byline === undefined
        ? undefined
        : typeof body.byline === "string"
          ? body.byline.trim().slice(0, 140)
          : null;
    const image =
      body.image === undefined
        ? undefined
        : body.image === null
          ? null
          : typeof body.image === "string"
            ? body.image.trim().slice(0, 500)
            : undefined;
    if (name === undefined && byline === undefined && image === undefined) {
      return c.json({ error: "nothing_to_update" }, 422);
    }
    if (name === null || (name !== undefined && name.length === 0)) {
      return c.json({ error: "name_empty" }, 422);
    }
    const sets: string[] = ["updated_at = now()"];
    const params: unknown[] = [principal.userId];
    const push = (col: string, v: unknown) => {
      params.push(v);
      sets.push(`${col} = $${params.length}`);
    };
    if (name !== undefined) push("name", name);
    if (byline !== undefined) push("byline", byline === "" ? null : byline);
    if (image !== undefined) push("image", image === "" ? null : image);
    await deps.db.query(`update "user" set ${sets.join(", ")} where id = $1`, params);
    // byline also lands in prefs so the voice-byline default and the zip's preference snapshot agree.
    if (byline !== undefined) {
      const prefs = parseUserPrefs(
        ((await loadUser(deps.db, principal.userId)) ?? ({} as UserRow)).prefs,
      );
      const next: UserPrefs = { ...prefs, ...(byline ? { byline } : {}) };
      if (!byline) delete next.byline;
      await deps.db.query(`update "user" set prefs = $2 where id = $1`, [
        principal.userId,
        JSON.stringify(next),
      ]);
    }
    return c.json({ ok: true });
  });

  // ---- Email change: a `verification` row + the auth.mail queue (same transport as the magic link).
  // The link lands on the WEB's settings route which POSTs the confirm back through the api. ----

  app.post("/settings/account/email", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const body = (await c.req.json().catch(() => null)) as { email?: unknown } | null;
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!EMAIL_RE.test(email)) return c.json({ error: "invalid_email" }, 422);
    const user = await loadUser(deps.db, principal.userId);
    if (!user) return c.json({ error: "not_found" }, 404);
    if (user.email.toLowerCase() === email) return c.json({ error: "same_email" }, 422);

    const token = randomBytes(24).toString("base64url");
    const now = deps.clock.now();
    await deps.db.query(`delete from verification where identifier = $1`, [
      `email-change:${principal.userId}`,
    ]);
    await deps.db.query(
      `insert into verification (id, identifier, value, expires_at) values ($1,$2,$3,$4)`,
      [
        deps.ids("ver"),
        `email-change:${principal.userId}`,
        JSON.stringify({ token, email }),
        new Date(now.getTime() + EMAIL_CHANGE_TTL_MS),
      ],
    );
    if (deps.queue && deps.appBaseUrl) {
      const url = `${deps.appBaseUrl}/app/settings/account?confirmEmail=${encodeURIComponent(token)}`;
      await deps.queue
        .send(AUTH_MAIL_QUEUE, {
          to: email,
          subject: "Confirm your new Rhema email",
          text: `Confirm this address for your Rhema account: ${url}`,
          html: `<p><a href="${url}">Confirm this address</a> for your Rhema account.</p>`,
        })
        .catch(() => undefined);
    }
    return c.json({ ok: true, pendingEmail: email });
  });

  app.post("/settings/account/email/confirm", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const body = (await c.req.json().catch(() => null)) as { token?: unknown } | null;
    const token = typeof body?.token === "string" ? body.token : "";
    if (!token) return c.json({ error: "token_required" }, 422);
    const row = (
      await deps.db.query(
        `select id, value from verification where identifier = $1 and expires_at > $2
          order by created_at desc limit 1`,
        [`email-change:${principal.userId}`, deps.clock.now()],
      )
    ).rows[0] as { id: string; value: string } | undefined;
    let parsed: { token?: string; email?: string } = {};
    try {
      parsed = row ? (JSON.parse(row.value) as typeof parsed) : {};
    } catch {
      parsed = {};
    }
    if (!row || parsed.token !== token || !parsed.email) {
      return c.json({ error: "invalid_or_expired_token" }, 410);
    }
    await deps.db.query(`update "user" set email = $2, email_verified = true, updated_at = now() where id = $1`, [
      principal.userId,
      parsed.email,
    ]);
    await deps.db.query(`delete from verification where id = $1`, [row.id]);
    return c.json({ ok: true, email: parsed.email });
  });

  app.post("/settings/sessions/revoke", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const body = (await c.req.json().catch(() => null)) as { sessionId?: unknown } | null;
    const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
    if (!sessionId) return c.json({ error: "session_required" }, 422);
    const res = await deps.db.query(
      `delete from session where id = $1 and user_id = $2 returning id`,
      [sessionId, principal.userId],
    );
    if (res.rows.length === 0) return c.json({ error: "not_found" }, 404);
    return c.json({ ok: true });
  });

  // ---- Preferences (§14.7): the user.prefs blob + the consent threshold + app theme read ----

  app.get("/settings/preferences", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const user = await loadUser(deps.db, principal.userId);
    if (!user) return c.json({ error: "not_found" }, 404);
    return c.json({
      prefs: parseUserPrefs(user.prefs),
      consentDontAskUnder: user.consent_dont_ask_under,
      appTheme: user.app_theme,
    });
  });

  app.put("/settings/preferences", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const raw = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
      return c.json({ error: "invalid_preferences" }, 422);
    }
    // Unset semantics (§14.7's "per-project overrides win" needs account defaults to be removable):
    // a null field deletes the pref — strip the nulls before the strict schema parse, then delete
    // the named keys from the merged blob. Same rule one level deep under `editor` (a per-field
    // merge) and `rigorByWorkflow` (a per-workflow merge).
    const NESTED = ["editor", "rigorByWorkflow"] as const;
    const topDeletes: string[] = [];
    const nestedDeletes: Record<(typeof NESTED)[number], string[]> = { editor: [], rigorByWorkflow: [] };
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (v === null) {
        topDeletes.push(k);
        continue;
      }
      if ((NESTED as readonly string[]).includes(k) && v != null && typeof v === "object" && !Array.isArray(v)) {
        const inner: Record<string, unknown> = {};
        for (const [ek, ev] of Object.entries(v as Record<string, unknown>)) {
          if (ev === null) nestedDeletes[k as (typeof NESTED)[number]].push(ek);
          else inner[ek] = ev;
        }
        cleaned[k] = inner;
        continue;
      }
      cleaned[k] = v;
    }
    const parsed = userPrefsSchema.safeParse(cleaned);
    if (!parsed.success) return c.json({ error: "invalid_preferences" }, 422);
    const patch = parsed.data;
    const user = await loadUser(deps.db, principal.userId);
    if (!user) return c.json({ error: "not_found" }, 404);
    const current = parseUserPrefs(user.prefs);
    // shallow merge + a nested merge per NESTED member; the collected nulls delete their keys.
    const next: UserPrefs = { ...current, ...patch };
    for (const k of NESTED) {
      if (patch[k] || current[k]) {
        next[k] = { ...current[k], ...patch[k] } as never;
      }
    }
    for (const k of topDeletes) {
      delete (next as Record<string, unknown>)[k];
    }
    for (const k of NESTED) {
      const bag = next[k] as Record<string, unknown> | undefined;
      if (!bag) continue;
      for (const ek of nestedDeletes[k]) delete bag[ek];
      if (Object.keys(bag).length === 0) delete (next as Record<string, unknown>)[k];
    }
    await deps.db.query(`update "user" set prefs = $2, updated_at = now() where id = $1`, [
      principal.userId,
      JSON.stringify(next),
    ]);
    return c.json({ ok: true, prefs: next });
  });

  // ---- Data & privacy (§14.7) --------------------------------------------------------------------------------

  app.get("/settings/data", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const user = await loadUser(deps.db, principal.userId);
    if (!user) return c.json({ error: "not_found" }, 404);
    const prefs = parseUserPrefs(user.prefs);
    const now = deps.clock.now();
    const grant = await loadActiveGrant(deps.db, principal.userId, now);
    const log = (
      await deps.db.query(
        `select id, grant_id, actor, action, detail, at from support_access_log
          where user_id = $1 order by at desc limit 50`,
        [principal.userId],
      )
    ).rows as { id: string; grant_id: string | null; actor: string; action: string; detail: string | null; at: string | Date }[];
    const logDtos: SupportAccessLogDto[] = log.map((l) => ({
      id: l.id,
      grantId: l.grant_id,
      actor: l.actor,
      action: l.action as SupportAccessLogDto["action"],
      detail: l.detail,
      at: new Date(l.at).toISOString(),
    }));
    const requestedAt = user.deletion_requested_at ? new Date(user.deletion_requested_at) : null;
    const dto: DataSettingsDto = {
      analyticsOptOut: user.analytics_opt_out,
      preferenceOptOut: prefs.preferenceOptOut === true,
      supportAccess: {
        active: grant != null && supportGrantActive(grant, now),
        grant: grant
          ? {
              grantedAt: new Date(grant.granted_at).toISOString(),
              expiresAt: new Date(grant.expires_at).toISOString(),
            }
          : null,
        log: logDtos,
      },
      deletion: requestedAt
        ? { requestedAt: requestedAt.toISOString(), graceEndsAt: deletionGraceEndsAt(requestedAt).toISOString() }
        : null,
    };
    return c.json(dto);
  });

  // REQ-VIS-11 — the "Allow Rhema staff to view my projects for support (per request, 72 h)" toggle.
  // Enable mints one active 72-h grant + a 'granted' log row; disable revokes + a 'revoked' row.
  // Idempotent: enabling while enabled returns the live grant (no second row).
  app.post("/settings/support-access", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const body = (await c.req.json().catch(() => null)) as { enabled?: unknown } | null;
    if (typeof body?.enabled !== "boolean") return c.json({ error: "enabled_required" }, 422);
    const now = deps.clock.now();
    const existing = await loadActiveGrant(deps.db, principal.userId, now);
    if (body.enabled) {
      if (existing) {
        return c.json({
          ok: true,
          grant: {
            grantedAt: new Date(existing.granted_at).toISOString(),
            expiresAt: new Date(existing.expires_at).toISOString(),
          },
        });
      }
      const grantId = deps.ids("sag");
      const expiresAt = new Date(now.getTime() + SUPPORT_ACCESS_TTL_MS);
      await deps.db.query(
        `insert into support_access_grants (id, user_id, workspace_id, granted_at, expires_at)
         values ($1,$2,$3,$4,$5)`,
        [grantId, principal.userId, principal.workspaceId, now, expiresAt],
      );
      await appendSupportLog(deps.db, deps.ids, {
        userId: principal.userId,
        workspaceId: principal.workspaceId,
        grantId,
        actor: "user",
        action: "granted",
        detail: "support access granted (72 h)",
        at: now,
      });
      return c.json({
        ok: true,
        grant: { grantedAt: now.toISOString(), expiresAt: expiresAt.toISOString() },
      });
    }
    if (!existing) return c.json({ ok: true }); // already off — no-op, no log noise
    await deps.db.query(`update support_access_grants set revoked_at = $2 where id = $1`, [
      existing.id,
      now,
    ]);
    await appendSupportLog(deps.db, deps.ids, {
      userId: principal.userId,
      workspaceId: principal.workspaceId,
      grantId: existing.id,
      actor: "user",
      action: "revoked",
      at: now,
    });
    return c.json({ ok: true });
  });

  // Q-26 (REQ-OBJ-14): the preference-profile capture opt-out. Default-on learning ⇒ this stores
  // the OUT flag; `preferenceCaptureEnabled` is the consumption rule the capture path reads.
  app.put("/settings/preference-profile", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const body = (await c.req.json().catch(() => null)) as { optOut?: unknown } | null;
    if (typeof body?.optOut !== "boolean") return c.json({ error: "optOut_required" }, 422);
    const user = await loadUser(deps.db, principal.userId);
    if (!user) return c.json({ error: "not_found" }, 404);
    const next: UserPrefs = { ...parseUserPrefs(user.prefs), preferenceOptOut: body.optOut };
    await deps.db.query(`update "user" set prefs = $2, updated_at = now() where id = $1`, [
      principal.userId,
      JSON.stringify(next),
    ]);
    return c.json({ ok: true, preferenceOptOut: body.optOut });
  });

  // ---- REQ-ACCT-4 — Delete account: typed confirmation → deletion_requested_at (the grace clock) →
  // the delayed `account.hard-delete` job. Cancel inside the window clears the marker; the enqueued
  // job re-checks the marker and no-ops when it's gone. ----

  app.post("/settings/account/delete", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const body = (await c.req.json().catch(() => null)) as { confirmation?: unknown } | null;
    if (body?.confirmation !== ACCOUNT_DELETION_CONFIRMATION) {
      return c.json({ error: "confirmation_required" }, 422);
    }
    const user = await loadUser(deps.db, principal.userId);
    if (!user) return c.json({ error: "not_found" }, 404);
    const now = deps.clock.now();
    // keep the FIRST request's clock if one is already running — re-requesting must not extend grace.
    const requestedAt = user.deletion_requested_at ? new Date(user.deletion_requested_at) : now;
    if (!user.deletion_requested_at) {
      await deps.db.query(`update "user" set deletion_requested_at = $2, updated_at = now() where id = $1`, [
        principal.userId,
        now,
      ]);
    }
    if (deps.queue) {
      await deps.queue
        .send(
          ACCOUNT_HARD_DELETE_QUEUE,
          {
            tenantId: principal.workspaceId,
            userId: principal.userId,
            deletionRequestedAt: requestedAt.toISOString(),
          },
          {
            startAfterMs: Math.max(0, deletionGraceEndsAt(requestedAt).getTime() - now.getTime()),
            singletonKey: `account.hard-delete:${principal.userId}`,
          },
        )
        .catch(() => undefined);
    }
    return c.json({
      ok: true,
      deletion: {
        requestedAt: requestedAt.toISOString(),
        graceEndsAt: deletionGraceEndsAt(requestedAt).toISOString(),
      },
    });
  });

  app.post("/settings/account/delete/cancel", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const now = deps.clock.now();
    const res = await deps.db.query(
      `update "user" set deletion_requested_at = null, updated_at = now()
        where id = $1 and deletion_requested_at is not null and deletion_requested_at > $2
        returning id`,
      [principal.userId, new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)],
    );
    if (res.rows.length === 0) {
      const user = await loadUser(deps.db, principal.userId);
      return c.json(
        { error: user?.deletion_requested_at ? "grace_expired" : "not_requested" },
        409,
      );
    }
    return c.json({ ok: true });
  });

  // ---- Integrations (§14.7 "one uniform card component") — P1.15's connections surface. ---------

  app.get("/settings/integrations", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const rows = (
      await deps.db.query(
        `select cn.id, cn.provider, cn.handle, cn.status, cn.error, cn.last_sync_at,
                p.id as persona_id, coalesce(p.display_name, p.slug) as persona_name, p.slug as persona_slug,
                count(di.id)::int as items,
                count(di.id) filter (where di.state in ('included','removed_remote'))::int as included
           from connections cn
           join personas p on p.id = cn.persona_id
           left join discovered_items di on di.connection_id = cn.id
          where p.workspace_id = $1 and cn.removed_at is null
          group by cn.id, p.id, p.display_name, p.slug
          order by cn.provider, cn.id`,
        [principal.workspaceId],
      )
    ).rows as {
      id: string;
      provider: string;
      handle: string | null;
      status: string;
      error: string | null;
      last_sync_at: string | Date | null;
      persona_id: string;
      persona_name: string | null;
      persona_slug: string | null;
      items: number;
      included: number;
    }[];
    const voices = (
      await deps.db.query(
        `select id, slug, display_name from personas where workspace_id = $1 order by display_name, id`,
        [principal.workspaceId],
      )
    ).rows as { id: string; slug: string | null; display_name: string | null }[];
    const dto: IntegrationsSettingsDto = {
      connections: rows.map((r) => ({
        id: r.id,
        provider: r.provider as IntegrationsSettingsDto["connections"][number]["provider"],
        handle: r.handle,
        status: r.status as IntegrationsSettingsDto["connections"][number]["status"],
        error: r.error,
        lastSyncAt: r.last_sync_at ? new Date(r.last_sync_at).toISOString() : null,
        persona: { id: r.persona_id, name: r.persona_name, slug: r.persona_slug },
        items: r.items,
        includedItems: r.included,
      })),
      voices: voices.map((v) => ({ id: v.id, slug: v.slug, name: v.display_name ?? v.slug ?? v.id })),
    };
    return c.json(dto);
  });

  // Disconnect removes the credential IMMEDIATELY (auth_ref dropped in the same update); the
  // discovered/confirmed samples stay (REQ-ACCT-2: "samples remain unless separately removed").
  app.post("/settings/integrations/:id/disconnect", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const id = c.req.param("id");
    const res = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      const r = await tx.query(
        `update connections set removed_at = now(), status = 'removed', auth_ref = null
          where id = $1 and removed_at is null
            and persona_id in (select id from personas where workspace_id = $2)
          returning id`,
        [id, principal.workspaceId],
      );
      return r.rows.length;
    });
    if (res === 0) return c.json({ error: "not_found" }, 404);
    return c.json({ ok: true });
  });

  // ---- Project settings (§4.2 /p/:project/settings; §6.7; REQ-GENRE-2 safe fields) --------------

  app.get("/projects/:id/settings", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const p = (
      await deps.db.query(
        `select p.id, p.slug, p.title, p.protocol_id, p.protocol_version, p.venue,
                p.rigor_default, p.model_tier_default, p.paper_theme, p.approval_policy,
                p.persona_id, p.tags, p.protocol_changed_at, p.protocol_overrides,
                coalesce(ps.display_name, ps.slug) as persona_name, ps.slug as persona_slug
           from projects p left join personas ps on ps.id = p.persona_id
          where p.id = $1 and p.workspace_id = $2 and p.deleted_at is null`,
        [c.req.param("id"), principal.workspaceId],
      )
    ).rows[0] as
      | {
          id: string;
          slug: string;
          title: string;
          protocol_id: string | null;
          protocol_version: number;
          venue: string | null;
          rigor_default: string | null;
          model_tier_default: string | null;
          paper_theme: string;
          approval_policy: string;
          persona_id: string | null;
          tags: string[] | null;
          protocol_changed_at: string | Date | null;
          protocol_overrides: unknown;
          persona_name: string | null;
          persona_slug: string | null;
        }
      | undefined;
    if (!p) return c.json({ error: "not_found" }, 404);
    // the protocol picker's options are the published §5.3 cards (same source as GET /protocols) —
    // the db's `protocols` table holds seeded BODIES, not the display list.
    const protocols = PROTOCOL_CARDS.map((card) => ({ id: card.id, name: card.name }));
    const dto: ProjectSettingsDto = {
      project: {
        id: p.id,
        slug: p.slug,
        title: p.title,
        protocolId: p.protocol_id,
        protocolVersion: p.protocol_version,
        venue: p.venue,
        rigorDefault: p.rigor_default as ProjectSettingsDto["project"]["rigorDefault"],
        modelTierDefault: p.model_tier_default as ProjectSettingsDto["project"]["modelTierDefault"],
        paperTheme: p.paper_theme as ProjectSettingsDto["project"]["paperTheme"],
        approvalPolicy: p.approval_policy as ProjectSettingsDto["project"]["approvalPolicy"],
        persona: p.persona_id ? { id: p.persona_id, name: p.persona_name, slug: p.persona_slug } : null,
        tags: p.tags ?? [],
        protocolChangedAt: p.protocol_changed_at ? new Date(p.protocol_changed_at).toISOString() : null,
        protocolOverrides:
          p.protocol_overrides && typeof p.protocol_overrides === "object"
            ? (p.protocol_overrides as ProjectSettingsDto["project"]["protocolOverrides"])
            : null,
      },
      protocols,
    };
    return c.json(dto);
  });

  // The safe-field patch (REQ-GENRE-2): venue / protocol_id / rigor & tier defaults / paper theme /
  // protocol_overrides. A protocol_id change stamps protocol_changed_at — the next Review's scope
  // card carries the mark (§6.7); run creation clears it once a review carries it.
  app.put("/projects/:id/settings", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const body = await c.req.json().catch(() => null);
    const parsed = projectSettingsPatchSchema.safeParse(body ?? {});
    if (!parsed.success) return c.json({ error: "invalid_patch" }, 422);
    const patch = parsed.data;
    if (Object.keys(patch).length === 0) return c.json({ error: "nothing_to_update" }, 422);
    const projectId = c.req.param("id");
    const result = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      const cur = (
        await tx.query(
          `select id, protocol_id from projects where id = $1 and workspace_id = $2 and deleted_at is null`,
          [projectId, principal.workspaceId],
        )
      ).rows[0] as { id: string; protocol_id: string | null } | undefined;
      if (!cur) return { status: "not_found" as const };
      // the pickable ids are the §5.3 cards (only Essay's body is seeded in the `protocols` table —
      // validating against the table would reject the other three published ids).
      if (patch.protocolId !== undefined && patch.protocolId !== cur.protocol_id) {
        if (protocolCard(patch.protocolId) == null) return { status: "bad_protocol" as const };
      }
      const sets: string[] = [];
      const params: unknown[] = [projectId];
      const push = (clause: string, v: unknown) => {
        params.push(v);
        sets.push(clause.replace("?", `$${params.length}`));
      };
      if (patch.venue !== undefined) push("venue = ?", patch.venue);
      if (patch.protocolId !== undefined && patch.protocolId !== cur.protocol_id) {
        push("protocol_id = ?", patch.protocolId);
        push("protocol_changed_at = ?", deps.clock.now());
        // P1.21 (REQ-GENRE-3) — pin the switch to the protocol's CURRENT seed version so delivered
        // dossiers stamp `protocol@version` against the body that was live at the change, never a
        // re-resolved later one. A card with no seeded row falls back to v1 (the seeds land with the
        // migrations; a missing row means a hand-registered id).
        const v = (
          await tx.query(`select max(version)::int as v from protocols where id = $1`, [patch.protocolId])
        ).rows[0] as { v: number | null } | undefined;
        push("protocol_version = ?", v?.v ?? 1);
      }
      if (patch.rigorDefault !== undefined) push("rigor_default = ?", patch.rigorDefault);
      if (patch.modelTierDefault !== undefined) push("model_tier_default = ?", patch.modelTierDefault);
      if (patch.paperTheme !== undefined) push("paper_theme = ?", patch.paperTheme);
      if (patch.protocolOverrides !== undefined) {
        push("protocol_overrides = ?", patch.protocolOverrides ? JSON.stringify(patch.protocolOverrides) : null);
      }
      if (sets.length > 0) {
        await tx.query(`update projects set ${sets.join(", ")} where id = $1`, params);
      }
      return { status: "ok" as const };
    });
    if (result.status === "not_found") return c.json({ error: "not_found" }, 404);
    if (result.status === "bad_protocol") return c.json({ error: "unknown_protocol" }, 422);
    return c.json({ ok: true });
  });

  return app;
}
