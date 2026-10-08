/**
 * Pure protocol-marker detection (spec §13.2 `public-safe`; REQ-ARCH-33; SPA.8 / REQ-SAFE-1/2).
 * Protocol IP — skill text, rubric language, calibration prompts — is baked into the private
 * `run-task` image only and must never reach a client bundle, the OpenAPI document, or any event
 * payload. Any occurrence of a sentinel marker in a public-facing artifact is a leak and fails CI.
 *
 * The private `packages/protocols` sources tag their sensitive blocks with these sentinels as
 * exported string constants (`src/protocols.ts`, `src/manifest-types.ts`); the stub carries none.
 * The marker set is load-bearing: `check:protocol-markers` fails closed if a marker is absent from
 * the sources (the tripwire is unarmed) or present in a public artifact (a leak).
 */

export const DEFAULT_MARKERS = [
  "RHEMA-PROTOCOL-SECRET",
  "BEGIN-RHEMA-RUBRIC",
  "BEGIN-RHEMA-CALIBRATION",
  "rhema:protocol-only",
];

/**
 * @param {string} text
 * @param {string[]} [markers]
 * @returns {string[]} the markers found (empty when clean)
 */
export function findMarkers(text, markers = DEFAULT_MARKERS) {
  if (typeof text !== "string" || text.length === 0) return [];
  const hits = [];
  for (const marker of markers) {
    if (text.includes(marker)) hits.push(marker);
  }
  return hits;
}

/**
 * REQ-SAFE-2 layer 2 — sourcemap provenance. `.map` `sources[]` entries are original file paths
 * (minification-proof): a source under any of these path fragments inside a public artifact's map
 * is a deterministic leak, whether or not a sentinel string survives treeshaking.
 *
 * The list is the union of (a) protocol/eval IP (`packages/protocols`, `packages/evals`,
 * `evals-stub`, the `@rhema/protocols`/`@rhema/evals` pnpm forms) and (b) server-only code that must
 * never be bundled for the browser (the server apps + the DB/orchestrator/ingest/benchmark
 * packages). `packages/api-client` is NOT banned here: the islands legitimately embed none of it
 * today and REQ-FW-9's value-import ban is enforced on the SPA graph specifically (see
 * `SPA_MAP_SOURCE_RULES` in check-protocol-markers.mjs).
 */
export const PROVENANCE_BANS = [
  { re: /packages\/protocols\//, label: "packages/protocols" },
  { re: /packages\/protocols-stub\//, label: "packages/protocols-stub" },
  { re: /@rhema[+/]protocols/, label: "@rhema/protocols" },
  { re: /packages\/evals\//, label: "packages/evals" },
  { re: /@rhema[+/]evals/, label: "@rhema/evals" },
  // RHEMA_EVALS_PATH resolves a private checkout OUTSIDE the repo — cover the `evals/` segment
  // form too (a map source that is an external absolute/relative path to the evals tree).
  { re: /(^|\/)evals(-stub)?\//, label: "evals checkout" },
  { re: /apps\/run-task\//, label: "apps/run-task" },
  { re: /apps\/api\//, label: "apps/api" },
  { re: /apps\/worker\//, label: "apps/worker" },
  { re: /apps\/egress-proxy\//, label: "apps/egress-proxy" },
  { re: /apps\/fetcher\//, label: "apps/fetcher" },
  { re: /apps\/convert\//, label: "apps/convert" },
  { re: /apps\/collab\//, label: "apps/collab" },
  { re: /apps\/export\//, label: "apps/export" },
  { re: /packages\/db\//, label: "packages/db" },
  { re: /packages\/orchestrator\//, label: "packages/orchestrator" },
  { re: /packages\/ingest\//, label: "packages/ingest" },
  { re: /packages\/benchmark\//, label: "packages/benchmark" },
];

/**
 * Find provenance leaks in a sourcemap's `sources[]` array.
 * @param {string[]} sources the parsed `.map` `sources` entries
 * @param {Array<{re: RegExp, label: string}>} [bans]
 * @returns {string[]} human-readable hits `"<source> [<label>]"`
 */
export function findProvenanceLeaks(sources, bans = PROVENANCE_BANS) {
  if (!Array.isArray(sources)) return [];
  const hits = [];
  for (const src of sources) {
    if (typeof src !== "string") continue;
    const norm = src.split("\\").join("/");
    for (const ban of bans) {
      if (ban.re.test(norm)) {
        hits.push(`${norm} [${ban.label}]`);
        break;
      }
    }
  }
  return hits;
}
