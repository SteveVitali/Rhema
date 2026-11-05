// 220a R7DEM.4b (REQ-DWEB-6 client half, REQ-DWEB-9/11/16; spec §3.3 S-1/S-14; ADR-126) — the
// SPA's demo reads: the boot fact (`boot.demo`), the demo-namespace path predicate the
// `_authenticated` gate + the click interceptor share, and the `?b=<sha>` twin arm (S-13 —
// immutable snapshots ride long-lived CDN cache keys pinned to the deploy). A demo boot is a
// PATH FACT (the `/demo` + `/p/demo~` namespace), never a renderer flag — the server stamps it
// on the shell embed and the client never invents it (`check:spa-env` — no env read).

import { isDemoNamespacePath } from "@rhema/contracts";
import { getSpaBoot } from "./boot.js";

export { isDemoNamespacePath };

/** The demo boot fact (null outside a demo document). Module-level, like `getSpaBoot` — the
 *  route guards and the interceptor are non-React readers. */
export function demoBootNow(): { essay: string; slug: string; signedIn: boolean; build: string | null } | null {
  return getSpaBoot()?.demo ?? null;
}

/** The `_authenticated` gate predicate: a demo boot on a demo-namespace path skips the session
 *  read entirely — the PATH is checked, not just the boot, so an in-SPA hop to `/app` still
 *  hits the real gate (R3 P1). */
export function isDemoGateSkip(pathname: string): boolean {
  return demoBootNow() != null && isDemoNamespacePath(pathname);
}

/**
 * The S-13 twin arm — append `?b=<build>` (or `&b=` on a query-bearing path) to demo JSON
 * reads: `/bff/p/demo~*` twins and the public `/bff/demo/*` endpoints. Snapshots are
 * immutable across deploys, so the key binds the edge cache to the build SHA. Non-demo
 * paths and a missing build SHA pass through untouched.
 */
export function demoTwinPath(path: string): string {
  const build = demoBootNow()?.build;
  if (build == null || build === "") return path;
  if (!/^\/bff\/p\/demo~/.test(path) && !path.startsWith("/bff/demo/")) return path;
  return `${path}${path.includes("?") ? "&" : "?"}b=${encodeURIComponent(build)}`;
}
