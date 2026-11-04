// The snapshot contract/drift harness (ADR-126): compile-time `satisfies` lives at each
// projection site; this module is the RUNTIME half — one registered structural validator per
// snapshot `kind`, behind a registration seam so 218a adds dossier/run-report/timeline/figure/
// card kinds WITHOUT forking this file (ticket deliverable 5).

import type { EssayIndex, SnapshotFile } from "./model.js";

/** A kind's structural validator — returns violation strings (empty = valid). */
export type KindValidator = (env: SnapshotFile) => readonly string[];

const registry = new Map<string, KindValidator>();

/** Register a snapshot kind's validator. Idempotent by kind — a re-registration of the same
 *  kind is a programming error (it would hide a forked validator). */
export function registerSnapshotKind(kind: string, validate: KindValidator): void {
  if (registry.has(kind)) throw new Error(`snapshot kind already registered: ${kind}`);
  registry.set(kind, validate);
}

/** The kinds this ticket owns (218a's kinds live in its own module, registered the same way). */
export function registeredKinds(): readonly string[] {
  return [...registry.keys()].sort();
}

/** Validate one snapshot file against its kind's registered validator. An unregistered kind is
 *  a failure, never a skip — the harness is the contract. */
export function validateSnapshot(env: SnapshotFile): readonly string[] {
  const v = registry.get(env.kind);
  if (v === undefined) return [`unregistered snapshot kind: ${env.kind}`];
  return v(env);
}

// ---- structural helpers — shape checks only; the DTO `satisfies` carries the type contract ----

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null;
const has = (x: unknown, ...keys: string[]): string[] =>
  isObj(x) ? keys.filter((k) => !(k in x)) : keys;
const allStrings = (x: unknown): boolean => Array.isArray(x) && x.every((i) => typeof i === "string");

function editorDocShape(env: SnapshotFile): readonly string[] {
  const dto = env.dto;
  const missing = has(dto, "draftId", "draftN", "origin", "state", "markdown", "lock", "findings");
  if (missing.length > 0) return [`editor-doc missing: ${missing.join(",")}`];
  const d = dto as Record<string, unknown>;
  const bad: string[] = [];
  if (typeof d["markdown"] !== "string") bad.push("markdown not a string");
  if (!Array.isArray(d["findings"])) bad.push("findings not an array");
  return bad;
}

function versionsShape(env: SnapshotFile): readonly string[] {
  const dto = env.dto;
  const missing = has(dto, "chip", "drafts");
  if (missing.length > 0) return [`versions missing: ${missing.join(",")}`];
  const d = dto as Record<string, unknown>;
  const bad: string[] = [];
  if (!("workingN" in d)) bad.push("workingN absent");
  if (!Array.isArray(d["drafts"])) bad.push("drafts not an array");
  else
    for (const [i, dr] of (d["drafts"] as unknown[]).entries())
      bad.push(
        ...has(dr, "draftId", "n", "origin", "state", "reviewed", "answered", "obligations").map(
          (k) => `drafts[${i}].${k} missing`,
        ),
      );
  return bad;
}

function whatChangedShape(env: SnapshotFile): readonly string[] {
  const dto = env.dto;
  const missing = has(dto, "ok", "responseId", "beforeN", "view");
  if (missing.length > 0) return [`what-changed missing: ${missing.join(",")}`];
  const view = (dto as Record<string, unknown>)["view"];
  const vbad = has(view, "strip", "moves", "unlinked", "rebutted");
  if (vbad.length > 0) return [`what-changed view missing: ${vbad.join(",")}`];
  const bad: string[] = [];
  const v = view as Record<string, unknown>;
  for (const k of ["moves", "rebutted"]) if (!Array.isArray(v[k])) bad.push(`view.${k} not an array`);
  const un = v["unlinked"];
  if (!isObj(un) || !Array.isArray(un["hunks"]) || !Array.isArray(un["entries"]))
    bad.push("view.unlinked malformed");
  return bad;
}

function versionDiffShape(env: SnapshotFile): readonly string[] {
  const dto = env.dto;
  const missing = has(dto, "ok", "before", "after", "diff", "view");
  if (missing.length > 0) return [`version-diff missing: ${missing.join(",")}`];
  const diff = (dto as Record<string, unknown>)["diff"];
  const dmiss = has(diff, "hunks", "unchanged", "beforeBlocks", "afterBlocks");
  if (dmiss.length > 0) return [`version-diff.diff missing: ${dmiss.join(",")}`];
  return [];
}

function filesShape(env: SnapshotFile): readonly string[] {
  const dto = env.dto;
  const missing = has(dto, "sections");
  if (missing.length > 0) return missing.map((k) => `files missing: ${k}`);
  const sections = (dto as Record<string, unknown>)["sections"];
  if (!Array.isArray(sections)) return ["files.sections not an array"];
  const bad: string[] = [];
  for (const [i, s] of sections.entries())
    bad.push(...has(s, "key", "rows", "advancedRows", "sealedCount").map((k) => `sections[${i}].${k} missing`));
  return bad;
}

function projectsShape(env: SnapshotFile): readonly string[] {
  const dto = env.dto;
  if (!Array.isArray(dto)) return ["projects payload not an array"];
  const bad: string[] = [];
  for (const [i, r] of (dto as unknown[]).entries())
    bad.push(...has(r, "id", "slug", "title", "state").map((k) => `projects[${i}].${k} missing`));
  return bad;
}

/** The document-side kind set — registered here, once, at module load. */
export function registerDocumentKinds(): void {
  registerSnapshotKind("projects", projectsShape);
  registerSnapshotKind("editor-doc", editorDocShape);
  registerSnapshotKind("artifact-page", editorDocShape);
  registerSnapshotKind("versions", versionsShape);
  registerSnapshotKind("version-diff", versionDiffShape);
  registerSnapshotKind("what-changed", whatChangedShape);
  registerSnapshotKind("files", filesShape);
}

// ---- the drift leg: committed snapshots vs a fresh projection -----------------------------

/** Read every committed snapshot file's envelope (the index is a manifest, not an envelope). */
export function snapshotEnvelopes(
  files: ReadonlyMap<string, string>,
): readonly { path: string; env: SnapshotFile }[] {
  const out: { path: string; env: SnapshotFile }[] = [];
  for (const [path, bytes] of files) {
    if (path === "index.json" || path.endsWith("/index.json")) continue;
    const env = JSON.parse(bytes) as SnapshotFile;
    if (env.format === 1 && typeof env.kind === "string") out.push({ path, env });
  }
  return out;
}

/** Structural check of an `EssayIndex` — every chunk file the index names must exist and every
 *  emitted chunk must be named (no orphan payloads, no dangling keys). */
export function indexViolations(
  index: EssayIndex,
  emitted: ReadonlyMap<string, string>,
): readonly string[] {
  const bad: string[] = [];
  const named = new Set<string>();
  for (const [kind, table] of Object.entries(index.chunks))
    for (const [key, file] of Object.entries(table)) {
      named.add(file);
      if (!emitted.has(file)) bad.push(`index names missing chunk ${file} (${kind}/${key})`);
    }
  for (const file of emitted.keys())
    if (file !== "index.json" && !named.has(file)) bad.push(`orphan chunk not in index: ${file}`);
  return bad;
}

/** `resolve` must cover "working" + every `1..head.n`. */
export function resolveViolations(index: EssayIndex): readonly string[] {
  const bad: string[] = [];
  for (let n = 1; n <= index.head.n; n++)
    if (index.resolve[String(n)] === undefined) bad.push(`resolve missing "${n}"`);
  if (index.resolve["working"] === undefined) bad.push(`resolve missing "working"`);
  else if (index.resolve["working"].draftId !== index.head.draftId)
    bad.push(`resolve "working" → ${index.resolve["working"].draftId}, head is ${index.head.draftId}`);
  return bad;
}

/** Guard helper for tests: every env's `key`/`essay` must be consistent strings. */
export function envelopeViolations(env: SnapshotFile): readonly string[] {
  const bad: string[] = [];
  if (env.format !== 1) bad.push("format ≠ 1");
  if (typeof env.essay !== "string" || env.essay === "") bad.push("essay missing");
  if (typeof env.key !== "string") bad.push("key missing");
  return bad;
}

export { allStrings as _allStrings };
