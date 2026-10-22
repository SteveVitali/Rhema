// R6UCD.1 (REQ-POST-7, ADR-113) — the user-content mint route.
//
// The §13.3 delivery contract, amended 2026-10-21: the edge-signed CDN backend was nonfunctional
// (the LB→bucket origin read was never granted — `D-R5OPS.1-2`), so the api mints GCS V4 signed
// GETs on `storage.googleapis.com/<user-content>/<key>` after a tenant check. The signed
// `response-content-type` / `response-content-disposition` params carry the serve policy — GCS
// emits them verbatim — and the URL lands outside every `rhema.tools` cookie scope: NO credential
// can ever ride it, no cookie is ever set by the mint.
//
// TENANT CHECK: this generic route mints only for keys that DECLARE their tenant —
// `quarantine/<workspaceId>/<uploadId>` and `converted/<workspaceId>/<uploadId>.json`
// (`userContentKeyOwner`). A key whose segment differs from the session workspace answers a
// uniform `not_found` — no URL, no oracle. Keys that carry no tenant segment
// (`ingest-originals/<sha256>`) are mint-eligible only through a tenant-scoped row resolve
// (the `/voices/:id/samples/:itemId/raw` path), never here.

import { Hono } from "hono";
import {
  mintUserContentUrl,
  userContentKeyOwner,
  type UserContentSigner,
} from "@rhema/contracts";
import type { Principal } from "./run-routes.js";
import { logApiRouteError } from "./observability.js";

export interface UserContentApiDeps {
  readonly principal: (c: { req: { header(name: string): string | undefined } }) => Principal | null;
  /** The mint seam (GCS v4 GET presigner over the user-content bucket). Unset ⇒ 503. */
  readonly userContentSigner?: UserContentSigner;
}

export function createUserContentRoutes(deps: UserContentApiDeps): Hono {
  const app = new Hono();

  // GET /usercontent/sign?key=<objectKey>&type=<claimed-content-type> → {url, expiresAt}.
  app.get("/usercontent/sign", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const signer = deps.userContentSigner;
    if (!signer) return c.json({ error: "usercontent_unavailable" }, 503);
    const key = c.req.query("key");
    const owner = userContentKeyOwner(key);
    if (!owner || owner.workspaceId !== principal.workspaceId) {
      // Uniform not_found — foreign and malformed keys answer identically, and the body NEVER
      // carries a URL (AC: foreign-tenant id → 404, no URL).
      return c.json({ error: "not_found" }, 404);
    }
    try {
      const minted = await mintUserContentUrl(signer, {
        key: key as string,
        // `type` is the caller's CLAIM of the stored type — the policy clamps it through the
        // rendered allowlist, so a bogus type can only ever tighten to octet-stream+attachment.
        contentType: c.req.query("type"),
      });
      return c.json(minted);
    } catch (e) {
      logApiRouteError(c, e, { status: 503, msg: "usercontent_sign_failed" });
      return c.json({ error: "usercontent_unavailable" }, 503);
    }
  });

  return app;
}
