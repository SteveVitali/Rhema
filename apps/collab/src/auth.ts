// The collab auth hook's halves (P1.03; REQ-DATA-44). `authenticate` resolves the session — the
// `__Host-` cookie rides the same-origin WebSocket upgrade (the LB path-routes `/collab` on the app
// host), with the provider's in-band `token` as the non-browser fallback — then `authorizeDocument`
// scopes the draft lookup through `withTenant`, so a cross-workspace document name resolves to
// not-found by RLS, never by a string compare the caller could skip.
//
// Write-intent on a FROZEN head is lazy (REQ-IDE-46): merely OPENING a /v/:n page never mints a
// draft — the first debounced store materializes through saveManualRevision, which forks v(N+1).
// Once a working `human_revision` child EXISTS the socket is refused with a structured
// `frozen_fork` reason carrying the child id, and the client transport rebinds `draft:<id>` to it.
// Read-only intent (`?intent=ro`) attaches without any fork path — a pure read view.

import {
  resolveSessionPrincipal,
  sessionTokenFromCookieHeader,
  type SessionPrincipal,
} from "@rhema/db";
import type { SqlExecutor } from "@rhema/mirror";
import { editorLockForRuns, HOLDING_STATES, type EditorLock } from "@rhema/orchestrator";
import { isHumanEditableDraftOrigin } from "@rhema/contracts";
import type { CollabDb } from "./sql.js";

/** The connection context every later hook sees (Hocuspocus merges onAuthenticate's return). */
export interface CollabContext {
  readonly userId: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly draftId: string;
  /** server-refused writes — a run lock, a frozen head read, or a non-editable working head. */
  readonly readOnly: boolean;
}

/** The refusal thrown out of the auth hook; `reason` rides the permission-denied wire message. */
export class AuthRefusal extends Error {
  constructor(
    /** the wire reason — a plain token or a JSON `{code,…}` the client parses (frozen_fork). */
    readonly reason: string,
  ) {
    super(reason);
    this.name = "AuthRefusal";
  }
}

/** The wire code the client transport rebases on: the offline-edits-on-frozen fork (REQ-IDE-46). */
export const FORK_REASON_CODE = "frozen_fork";

export interface DraftBinding {
  readonly draftId: string;
  readonly projectId: string;
  readonly draftN: number;
  readonly origin: string;
  readonly state: string;
  readonly liveDocId: string | null;
  readonly lock: EditorLock | null;
  /** §15.4 — the workspace's read-only worked example (the HTTP guard 409s its saves; the WSS leg
   *  attaches read-only so no keystroke ever forks the seeded head). */
  readonly showcase: boolean;
}

interface DraftRow {
  id: string;
  project_id: string;
  n: number;
  origin: string;
  state: string;
  live_doc_id: string | null;
  workspace_id: string;
  showcase: boolean;
}

/** The §6.3 lock read (same shape as the api's editorLock — HOLDING_STATES + editorLockForRuns). */
export async function draftLock(
  exec: SqlExecutor,
  projectId: string,
  draftId: string,
): Promise<EditorLock | null> {
  const runs = (
    await exec.query(
      `select id, workflow, lock_set from runs where project_id = $1 and state = any($2::text[])`,
      [projectId, HOLDING_STATES as unknown as string[]],
    )
  ).rows as { id: string; workflow: string; lock_set: string[] }[];
  return editorLockForRuns(
    runs.map((r) => ({ id: r.id, workflow: r.workflow, lockSet: r.lock_set ?? [] })),
    { projectId, draftId },
  );
}

/**
 * Resolve `draft:<id>` under the tenant: the draft + its project's workspace (RLS makes a
 * cross-workspace id invisible → undefined) + the held run lock. Caller decides writable/read-only.
 */
export async function resolveDraftBinding(
  exec: SqlExecutor,
  workspaceId: string,
  draftId: string,
): Promise<DraftBinding | undefined> {
  const row = (
    await exec.query(
      `select d.id, d.project_id, d.n, d.origin, d.state, d.live_doc_id, p.workspace_id, p.showcase
         from drafts d join projects p on p.id = d.project_id
        where d.id = $1`,
      [draftId],
    )
  ).rows[0] as DraftRow | undefined;
  // The RLS join already denies cross-tenant rows; the belt check keeps a policy regression loud.
  if (!row || row.workspace_id !== workspaceId) return undefined;
  const lock = await draftLock(exec, row.project_id, row.id);
  return {
    draftId: row.id,
    projectId: row.project_id,
    draftN: row.n,
    origin: row.origin,
    state: row.state,
    liveDocId: row.live_doc_id,
    lock,
    showcase: row.showcase === true,
  };
}

export interface CollabIds {
  (prefix: string): string;
}

export interface CollabClock {
  now(): Date;
}

/**
 * Resolve the session + authorize the document. `token` is the provider's in-band credential (the
 * non-browser path); the browser's session arrives on the upgrade request's Cookie header. Throws
 * AuthRefusal for every denial — Hocuspocus turns the throw into a permission-denied close.
 */
export async function authenticateConnection(
  deps: {
    db: CollabDb;
    ids: CollabIds;
    clock: CollabClock;
    /** injectable for tests; defaults to the shared @rhema/db resolver. */
    resolvePrincipal?: (token: string) => Promise<SessionPrincipal | null>;
  },
  args: {
    documentName: string;
    cookieHeader: string | null;
    token: string | null;
    /** 'ro' attaches read-only (the /v/:n frozen read view); anything else asks for write. */
    intent: string | null;
  },
): Promise<CollabContext> {
  if (!args.documentName.startsWith("draft:")) throw new AuthRefusal("unknown_document");
  const draftId = args.documentName.slice("draft:".length);
  const token = sessionTokenFromCookieHeader(args.cookieHeader) ?? args.token ?? null;
  if (!token) throw new AuthRefusal("unauthenticated");
  const resolve = deps.resolvePrincipal ?? ((t: string) => resolveSessionPrincipal(deps.db, t));
  const principal = await resolve(token);
  if (!principal) throw new AuthRefusal("unauthenticated");

  const ctx = await deps.db.scoped(principal.workspaceId, async (tx): Promise<CollabContext> => {
    const binding = await resolveDraftBinding(tx, principal.workspaceId, draftId);
    if (!binding) throw new AuthRefusal("not_found");

    // A run holds the head (§6.3) — attach read-only; the framework refuses the connection's updates.
    if (binding.lock) {
      return {
        userId: principal.userId,
        workspaceId: principal.workspaceId,
        projectId: binding.projectId,
        draftId: binding.draftId,
        readOnly: true,
      };
    }

    // EDIT.1 (§15.4) — the Showcase's drafts attach read-only regardless of state: the worked
    // example's seeded head must never fork under a keystroke (the api's showcaseReadOnlyGuard
    // already 409s the HTTP save; this is the same posture on the WSS leg).
    if (binding.showcase) {
      return {
        userId: principal.userId,
        workspaceId: principal.workspaceId,
        projectId: binding.projectId,
        draftId: binding.draftId,
        readOnly: true,
      };
    }

    if (binding.state === "frozen") {
      if (args.intent === "ro") {
        return {
          userId: principal.userId,
          workspaceId: principal.workspaceId,
          projectId: binding.projectId,
          draftId: binding.draftId,
          readOnly: true,
        };
      }
      // Write intent on a frozen head. Three cases, all preserving "FIRST EDIT lands on the working
      // head" — merely opening the /v/:n page must never mint a draft:
      //  • the project already HAS a working human head ⇒ the client's offline edits belong on it;
      //    refuse with the `frozen_fork` payload and the client rebinds `draft:<headId>`. The head
      //    needn't be this base's direct human_revision child — a duplicated project's `duplicate`
      //    working head and a deep lineage's open grandchild are the same "the head follows itself"
      //    surface (a fork here would mint a second working draft — the unique index forbids it).
      //  • the open head is in-flight agent/seed work ⇒ read-only attach; it isn't the editor's
      //    surface and a human save has nowhere to land.
      //  • no working head at all ⇒ attach writable; the first debounced STORE materializes through
      //    saveManualRevision, which performs the v(N+1) fork — then the store hook closes the
      //    connections and this same rebind path runs.
      const working = (
        await tx.query(
          `select id, n, origin from drafts where project_id = $1 and state = 'working'`,
          [binding.projectId],
        )
      ).rows[0] as { id: string; n: number; origin: string } | undefined;
      if (working && isHumanEditableDraftOrigin(working.origin)) {
        throw new AuthRefusal(
          JSON.stringify({ code: FORK_REASON_CODE, draftId: working.id, draftN: working.n }),
        );
      }
      if (working) {
        return {
          userId: principal.userId,
          workspaceId: principal.workspaceId,
          projectId: binding.projectId,
          draftId: binding.draftId,
          readOnly: true,
        };
      }
      return {
        userId: principal.userId,
        workspaceId: principal.workspaceId,
        projectId: binding.projectId,
        draftId: binding.draftId,
        readOnly: false,
      };
    }

    // A working head that isn't human-authored (an in-flight agent draft, a seed) is not the
    // editor's surface — saveManualRevision's `not_editable` rule, expressed as a read-only attach.
    // `duplicate` (a project copy's open head) and `human_upload` edit in place like human_revision.
    const writable = isHumanEditableDraftOrigin(binding.origin);
    return {
      userId: principal.userId,
      workspaceId: principal.workspaceId,
      projectId: binding.projectId,
      draftId: binding.draftId,
      readOnly: !writable,
    };
  });
  return ctx;
}
