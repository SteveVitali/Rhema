// The revision surfaces (PRB.06; §5.8): the What-changed GET the revision page SSRs, and the hunk-comment
// POST that turns a note on a changed block into a `Guidance` row the NEXT Revise consumes (§6.5 —
// guidance is the only human input the skills accept after launch). Both are session-authenticated,
// server-rendered data routes: no editor state, no client diffing (REQ-SPEC-19).

import { Hono } from "hono";
import { captureGuidance, type OrchestratorDeps } from "@rhema/orchestrator";
import type { ContentStore } from "@rhema/mirror";
import { loadWhatChanged, loadVersionDiff, findHunk } from "./what-changed.js";
import type { Principal } from "./run-routes.js";
import type { SqlClient } from "./invite.js";
import { showcaseReadOnlyGuard } from "./showcase.js";

export interface RevisionApiDeps extends OrchestratorDeps {
  readonly principal: (c: { req: { header(name: string): string | undefined } }) => Principal | null;
  /** the workspace-bound readable store (same seam as the deliver route's `contentStoreFor`). */
  contentStoreFor?(workspaceId: string): Promise<ContentStore>;
  readonly store?: ContentStore;
  /** P1.17 — the scoped read the Showcase read-only guard uses. Unset ⇒ the guard is inert. */
  readonly db?: SqlClient;
}

export function createRevisionRoutes(deps: RevisionApiDeps): Hono {
  const app = new Hono();
  // P1.17 (§15.4) — the Showcase dossier is read-only: comments on its response/diff hunks 409.
  if (deps.db) app.use("/projects/:id/*", showcaseReadOnlyGuard(deps.db));
  const storeFor = async (workspaceId: string): Promise<ContentStore | null> =>
    (deps.contentStoreFor ? await deps.contentStoreFor(workspaceId) : deps.store) ?? null;

  // What-changed (§5.8): the move cards + Inline hunks + obligation discharge lines + the strip, joined
  // server-side from the frozen response ledger + the two frozen/working draft versions.
  app.get("/projects/:id/responses/:cid/what-changed", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const store = await storeFor(principal.workspaceId);
    if (!store) return c.json({ error: "content store unavailable" }, 500);
    const res = await deps.txRunner.run(principal.workspaceId, (tx) =>
      loadWhatChanged(tx, store, { projectId: c.req.param("id"), responseId: c.req.param("cid") }),
    );
    if (!res.ok) return c.json({ error: res.reason }, 404);
    return c.json(res);
  });

  // A comment on a changed hunk → a `Guidance` row the next Revise consumes (§6.5; the ticket's
  // "hunk comments become next-round Guidance"). Run-scope to the NEXT revise is not knowable at post
  // time, so the row is project-scope guidance narrowed to the `revise` workflow — the next Revise's
  // phase-boundary consume picks it up, exactly like a queued note.
  app.post("/projects/:id/responses/:cid/hunks/:hunkId/comments", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const body = (await c.req.json().catch(() => ({}))) as { text?: string };
    if (!body.text || !body.text.trim()) return c.json({ error: "text required" }, 400);
    const store = await storeFor(principal.workspaceId);
    if (!store) return c.json({ error: "content store unavailable" }, 500);
    const res = await deps.txRunner.run(principal.workspaceId, (tx) =>
      loadWhatChanged(tx, store, { projectId: c.req.param("id"), responseId: c.req.param("cid") }),
    );
    if (!res.ok) return c.json({ error: res.reason }, 404);
    const hunk = findHunk(res.view, c.req.param("hunkId"));
    if (!hunk) return c.json({ error: "hunk_not_found" }, 404);
    // the anchor names the hunk's first changed block (the after side when present — where the comment
    // lands in v(N+1)) in the verbatim §11.3 shape, so the consuming Revise can re-resolve it.
    const b = hunk.after[0] ?? hunk.before[0];
    const g = await captureGuidance(deps, {
      workspaceId: principal.workspaceId,
      projectId: c.req.param("id"),
      userId: principal.userId,
      source: "inline_comment",
      text: body.text.trim(),
      scope: "project",
      workflows: ["revise"],
      ...(b
        ? {
            anchors: [
              {
                blockId: b.blockId,
                quote: b.text.slice(0, 200),
                startOffset: b.startOffset,
                endOffset: b.endOffset,
                confidence: 1,
              },
            ],
          }
        : {}),
    });
    return c.json({ guidanceId: g.guidanceId, hunkId: hunk.id }, 201);
  });

  // ---- P1.08 — the generalized compare pair (§5.8): ANY two drafts (`m` may be `working`). The
  //      response-scoped routes above remain — a review-answer pair IS the ledgered case; this route
  //      projects the same view over arbitrary pairs (unledgered ⇒ every hunk Unlinked). ----
  app.get("/projects/:id/v/:n/diff/:m", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const store = await storeFor(principal.workspaceId);
    if (!store) return c.json({ error: "content store unavailable" }, 500);
    const res = await deps.txRunner.run(principal.workspaceId, (tx) =>
      loadVersionDiff(tx, store, {
        projectId: c.req.param("id"),
        beforeRef: c.req.param("n"),
        afterRef: c.req.param("m"),
      }),
    );
    if (!res.ok) return c.json({ error: res.reason }, 404);
    return c.json(res);
  });

  // The generalized compare's hunk-comment POST — the same Guidance write as the response-scoped
  // route (`source:'inline_comment'`, project scope, `workflows:['revise']`), resolved against the
  // version-pair's hunks server-side.
  app.post("/projects/:id/v/:n/diff/:m/hunks/:hunkId/comments", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const body = (await c.req.json().catch(() => ({}))) as { text?: string };
    if (!body.text || !body.text.trim()) return c.json({ error: "text required" }, 400);
    const store = await storeFor(principal.workspaceId);
    if (!store) return c.json({ error: "content store unavailable" }, 500);
    const res = await deps.txRunner.run(principal.workspaceId, (tx) =>
      loadVersionDiff(tx, store, {
        projectId: c.req.param("id"),
        beforeRef: c.req.param("n"),
        afterRef: c.req.param("m"),
      }),
    );
    if (!res.ok) return c.json({ error: res.reason }, 404);
    const hunk = findHunk(res.view, c.req.param("hunkId"));
    if (!hunk) return c.json({ error: "hunk_not_found" }, 404);
    const b = hunk.after[0] ?? hunk.before[0];
    const g = await captureGuidance(deps, {
      workspaceId: principal.workspaceId,
      projectId: c.req.param("id"),
      userId: principal.userId,
      source: "inline_comment",
      text: body.text.trim(),
      scope: "project",
      workflows: ["revise"],
      ...(b
        ? {
            anchors: [
              {
                blockId: b.blockId,
                quote: b.text.slice(0, 200),
                startOffset: b.startOffset,
                endOffset: b.endOffset,
                confidence: 1,
              },
            ],
          }
        : {}),
    });
    return c.json({ guidanceId: g.guidanceId, hunkId: hunk.id }, 201);
  });

  return app;
}
