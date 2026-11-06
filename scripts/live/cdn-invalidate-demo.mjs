#!/usr/bin/env node
// R7DEP.1 (spec §3.3 S-13; REQ-DWEB-10; GD-DEPLOY.R7 item 8) — the ONE sanctioned Cloud CDN
// invalidation: `/bff/p/demo~*` on the prod URL map. Demo twins are public edge-cached
// (`cache-control: public, max-age=300, s-maxage=86400` + ETag; full-query-string cache key), so a
// deploy that changes their bodies must evict the stale entries — the `?b=<sha>` key makes NEW
// fetches safe, but already-cached query-less twin URLs still serve the old body without this act.
//
// This script exists so the act is scoped, recorded, and dry-runnable — never a free-form gcloud:
//
//   node scripts/live/cdn-invalidate-demo.mjs --dry-run        # resolves + prints the exact call
//   node scripts/live/cdn-invalidate-demo.mjs                  # THE ACT (runs the printed call)
//   node scripts/live/cdn-invalidate-demo.mjs --path '/bff/p/demo~<essay>/*'   # narrower, still demo
//
// Refusals (hard, no override):
//   - any --path outside the demo BFF namespace (`/bff/p/demo~…*`) — including `/*`, `/bff/*`,
//     `/p/demo~*`, `/bff/p/demo*` (a real project slug), or a `*` anywhere but the tail;
//   - any stack other than the prod URL map (this act is prod-only; previews carry no public DNS);
//   - an ambiguous or missing url-map resolution (0 or >1 `rhema-prod-urlmap*` matches) unless
//     `--url-map <name>` pins it explicitly.
//
// The dry-run is EQUAL to the act: same resolution, same argv — only the `invalidate-cdn-cache`
// exec is skipped and printed instead. Commit both outputs (the ticket requires it).

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export class CdnInvalidationRefusal extends Error {
  constructor(message) {
    super(message);
    this.name = "CdnInvalidationRefusal";
  }
}

/** The default S-13 act: every cached demo BFF twin on the prod URL map. */
export const DEFAULT_PATH = "/bff/p/demo~*";
/** The prod app host the demo twins are served on (scoped so other hosts are untouched). */
export const DEFAULT_HOST = "rhema.tools";
export const DEFAULT_PROJECT = "rhema-507501";

/**
 * The demo-twin namespace guard. A valid invalidation path:
 *   - starts with `/bff/p/demo~` — the reserved slug prefix (real project slugs never carry `~`;
 *     `/bff/p/demo*` WITHOUT the tilde would match real tenants' twins and is refused);
 *   - is a prefix pattern: `*` appears at most once and only as the final character;
 *   - contains only path characters (no whitespace, no `?`, no `#`, no `..` traversal);
 *   - carries no scheme/host (a path, never a URL — host scoping is the --host flag's job).
 * Returns the path unchanged on success; throws CdnInvalidationRefusal otherwise.
 */
export function assertDemoInvalidationPath(path) {
  if (typeof path !== "string" || path.length === 0) {
    throw new CdnInvalidationRefusal("cdn-invalidate-demo: a --path is required");
  }
  if (/^https?:\/\//i.test(path)) {
    throw new CdnInvalidationRefusal(
      `cdn-invalidate-demo: '${path}' is a URL, not a path — pass a path like ${DEFAULT_PATH}`,
    );
  }
  if (!path.startsWith("/bff/p/demo~")) {
    throw new CdnInvalidationRefusal(
      `cdn-invalidate-demo: refusing path '${path}' — outside the demo BFF namespace ` +
        `(only '/bff/p/demo~…*' paths may be invalidated; real tenants live at '/bff/p/<slug>' ` +
        `and the document routes at '/p/demo~*' are not the twin cache)`,
    );
  }
  const rest = path.slice("/bff/p/demo~".length);
  // `rest` is the essay segment onward: either `*` (the canonical act — every demo twin) or
  // ≥1 path character optionally ending in `*`. A bare `/bff/p/demo~` names no twin — refused.
  if (rest.length === 0 || !/^[A-Za-z0-9_.~/\-]*\*?$/.test(rest)) {
    throw new CdnInvalidationRefusal(
      `cdn-invalidate-demo: refusing path '${path}' — after '/bff/p/demo~' only ` +
        `[A-Za-z0-9_.~/-] plus a single trailing '*' are permitted (no whitespace, '?', '#', ` +
        `or mid-path wildcards), and the prefix alone names no twin`,
    );
  }
  if (path.includes("..")) {
    throw new CdnInvalidationRefusal(
      `cdn-invalidate-demo: refusing path '${path}' — '..' traversal is never valid`,
    );
  }
  const star = path.indexOf("*");
  if (star !== -1 && star !== path.length - 1) {
    throw new CdnInvalidationRefusal(
      `cdn-invalidate-demo: refusing path '${path}' — '*' is only allowed as the final character`,
    );
  }
  return path;
}

/**
 * Parse `gcloud compute url-maps list --format=json` output and return THE prod url-map name.
 * Expects exactly one `rhema-prod-urlmap*` match — 0 or >1 returns null so the caller refuses
 * rather than guess (an ambiguous act on the wrong map is worse than no act).
 */
export function urlMapNameFromList(jsonText, prefix = "rhema-prod-urlmap") {
  let list;
  try {
    list = JSON.parse(jsonText);
  } catch {
    return null;
  }
  if (!Array.isArray(list)) return null;
  const names = list.map((m) => m?.name).filter((n) => typeof n === "string" && n.startsWith(prefix));
  return names.length === 1 ? names[0] : null;
}

/** The exact gcloud argv for the act — printed by --dry-run, executed without it. */
export function invalidateArgv({ urlMap, path, host, project, async = false }) {
  const args = [
    "compute",
    "url-maps",
    "invalidate-cdn-cache",
    urlMap,
    "--path",
    path,
    "--project",
    project,
  ];
  if (host) args.push("--host", host);
  if (async) args.push("--async");
  return args;
}

function gcloudExec(args, { capture = false } = {}) {
  const r = spawnSync("gcloud", args, {
    stdio: capture ? ["inherit", "pipe", "inherit"] : "inherit",
    encoding: "utf8",
  });
  return { status: r.status ?? 1, stdout: r.stdout ?? "" };
}

/**
 * resolve the url map: `--url-map` wins; otherwise list and require exactly one match.
 * `exec` is injectable so tests never shell out.
 */
export function resolveUrlMap({ explicit, project, exec = gcloudExec }) {
  if (explicit) return explicit;
  const r = exec(["compute", "url-maps", "list", "--project", project, "--format", "json"], {
    capture: true,
  });
  if (r.status !== 0) {
    throw new CdnInvalidationRefusal(
      `cdn-invalidate-demo: 'gcloud compute url-maps list' failed (status ${r.status}) — ` +
        `cannot resolve the prod URL map; pass --url-map <name> explicitly`,
    );
  }
  const name = urlMapNameFromList(r.stdout);
  if (!name) {
    throw new CdnInvalidationRefusal(
      `cdn-invalidate-demo: expected exactly one 'rhema-prod-urlmap*' url-map, got 0 or >1 — ` +
        `refusing to guess; pass --url-map <name> explicitly`,
    );
  }
  return name;
}

export function run(argv, { exec = gcloudExec, out = console.log } = {}) {
  const take = (flag) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const dryRun = argv.includes("--dry-run");
  const path = assertDemoInvalidationPath(take("--path") ?? DEFAULT_PATH);
  const host = take("--host") ?? DEFAULT_HOST;
  const project = take("--project") ?? DEFAULT_PROJECT;
  if (!/^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(host)) {
    throw new CdnInvalidationRefusal(
      `cdn-invalidate-demo: refusing --host '${host}' — expected a DNS hostname like ${DEFAULT_HOST}`,
    );
  }
  const urlMap = resolveUrlMap({ explicit: take("--url-map"), project, exec });
  const args = invalidateArgv({ urlMap, path, host, project, async: argv.includes("--async") });
  if (dryRun) {
    out(`[cdn-invalidate-demo] DRY-RUN — would execute: gcloud ${args.join(" ")}`);
    return 0;
  }
  out(`[cdn-invalidate-demo] executing: gcloud ${args.join(" ")}`);
  const r = exec(args);
  if (r.status !== 0) {
    console.error(
      `[cdn-invalidate-demo] invalidate-cdn-cache failed (status ${r.status}) — the act did NOT ` +
        `complete; report, do not retry-blind`,
    );
    return r.status;
  }
  out(
    `[cdn-invalidate-demo] invalidation submitted for '${path}' on url-map '${urlMap}'` +
      (host ? ` host '${host}'` : "") +
      ` — the operation is eventually consistent (Cloud CDN polls propagation per edge)`,
  );
  return 0;
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  try {
    process.exit(run(process.argv.slice(2)));
  } catch (e) {
    console.error(e instanceof CdnInvalidationRefusal ? e.message : e);
    process.exit(2);
  }
}
