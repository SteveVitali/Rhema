// Seat mount filtering (§12.6 mount layer; REQ-DATA-10, REQ-ARCH-16). The mirror materializes ONLY the
// seat's allowlist — "the project root IS the allowlist" — so the Editor↔Drafter wall and the persona
// hold-out are structural, not conventional: an artifact path appears in the Editor's tree only if some
// Editor mount glob matches it, so `agents/author/**`, `preferences.md`, and voice-print/lexicon/exemplars
// are absent by construction, never by a filter that could regress. The authoritative seat table is
// `SEAT_MOUNTS` in @rhema/hooks (P0.05) — this module reuses it verbatim; it is NOT re-derived here.

import type { AgentTypeKey } from "@rhema/contracts";
import type { WorkflowManifest } from "@rhema/protocols";
import { SEAT_MOUNTS, type MountRoot, type MountSpec } from "@rhema/hooks";

/** A seat's mount specs, split by the root the path is relative to. */
export function seatMounts(seat: AgentTypeKey): readonly MountSpec[] {
  return SEAT_MOUNTS[seat] ?? [];
}

/**
 * Match a mirror path (relative to its root) against a §12.6 mount glob. Only two glob forms exist (types.ts):
 * an exact path, or a `prefix/**` subtree — mirroring @rhema/hooks so a path is mounted here iff the same glob
 * would authorize a read there.
 */
export function matchesMountGlob(path: string, glob: string): boolean {
  const p = normalizePath(path);
  if (glob.endsWith("/**")) {
    const prefix = glob.slice(0, -3);
    return p === prefix || p.startsWith(`${prefix}/`);
  }
  return p === normalizePath(glob);
}

/** The mount spec (if any) under `root` whose glob matches `path` — the FIRST match, its `mode` the file's mode. */
export function mountFor(seat: AgentTypeKey, root: MountRoot, path: string): MountSpec | null {
  for (const spec of seatMounts(seat)) {
    if (spec.root === root && matchesMountGlob(path, spec.glob)) return spec;
  }
  return null;
}

/** True when the seat mounts this path (under `root`) at all — the "was it mounted for this seat" predicate. */
export function isMounted(seat: AgentTypeKey, root: MountRoot, path: string): boolean {
  return mountFor(seat, root, path) !== null;
}

/** True when the seat may WRITE this path (a `readwrite` mount matches) — the write-back allowlist (§12.2). */
export function isWritable(seat: AgentTypeKey, root: MountRoot, path: string): boolean {
  return mountFor(seat, root, path)?.mode === "readwrite";
}

/** Strip a leading `./` and any leading slashes so mount matching is anchored at the root. */
export function normalizePath(path: string): string {
  return path.replace(/^\.\//, "").replace(/^\/+/, "");
}

// ---------------------------------------------------------------------------------------------------------
// PRB.19 (F26b) — declared-output writability. The ported skills write their deliverables at the SHARED paths
// the manifest declares (`respond-to-review` SKILL.md: "Copy `drafts/vN.md` → `drafts/v(N+1).md`", "write the
// response letter to `correspondence/vN-response.md`") — while §12.6 mounts `drafts/**`/`correspondence/**`
// read-only for every seat, so the live Revise's pod-local outputs were dropped at harvest as
// `out_of_allowlist` and lost with the pod (D-PRB.16-1 evidence). The contract: a run's DECLARED
// `phase.artifacts` are writable BY that run — the manifest is the delivery contract's own statement of what
// the run must produce, so the hydration grants exactly those resolved paths as readwrite (all other shared
// artifacts stay read-only evidence mounts). This keeps the §12.6 seat table byte-identical and the server's
// delivery transaction the only writer of `correspondence_items`/`drafts` ROWS — the grant widens only which
// artifact FILES the seat may commit.
// ---------------------------------------------------------------------------------------------------------

/** `vN` / `v(N+1)` / `(N+1)` placeholders in declared artifact paths (the same tokens resolveKey compiles).
 *  P1.12 adds `<slug>` — the outline artifact's per-thread slug, expanded from the run's frozen
 *  `inputs.outlineSlug` (one path segment, like `<run>`). */
const DECLARED_VERSION_TOKEN = /v\(N\+1\)|vN|\(N\+1\)|<slug>/;

function expandDeclaredPath(
  path: string,
  ctx: { baseDraftN: number | null; reviewedDraftN: number | null; slug?: string | null },
): string[] {
  // `<slug>` resolves from the frozen run input; absent (a non-outline run never declares one) it
  // falls back to the constant the promotion sheet uses, so grant + phase_output agree.
  const resolved = path.replaceAll("<slug>", ctx.slug ?? "outline");
  if (!DECLARED_VERSION_TOKEN.test(resolved)) return [normalizePath(resolved)];
  // `vN` names the REVIEWED draft's ordinal (v1-response-ledger = the ledger answering review-of-v1) and
  // `v(N+1)`/`(N+1)` names the next draft ordinal. When the delivery base differs from the reviewed draft
  // (a manual-revision run on a divergent head) both readings are granted — an unused grant commits nothing.
  const ns = new Set<number>([ctx.reviewedDraftN, ctx.baseDraftN].filter((n): n is number => n != null));
  const out: string[] = [];
  for (const n of ns) {
    const expanded = normalizePath(
      resolved
        .replace(/v\(N\+1\)/g, `v${n + 1}`)
        .replace(/vN/g, `v${n}`)
        .replace(/\(N\+1\)/g, String(n + 1)),
    );
    if (!out.includes(expanded)) out.push(expanded);
  }
  return out;
}

/**
 * The project-mirror paths a run may write because the WORKFLOW MANIFEST declares them as phase outputs and
 * §12.6 mounts them read-only for this seat. `baseDraftN` is the delivery base's `n` (the draft the run
 * revises); `reviewedDraftN` the reviewed draft's `n` when the response answers a review of a different draft.
 * A declared path whose mount is already `readwrite` (or not mounted at all) yields no grant — the seat's own
 * namespaces need none and an unmounted path gains none. Returns sorted, deduped paths.
 */
export function declaredWritableArtifacts(
  seat: AgentTypeKey,
  manifest: WorkflowManifest,
  ctx: { baseDraftN: number | null; reviewedDraftN: number | null; slug?: string | null },
): string[] {
  const granted = new Set<string>();
  for (const phase of manifest.phases) {
    for (const declared of phase.artifacts) {
      for (const path of expandDeclaredPath(declared, ctx)) {
        const mount = mountFor(seat, "project", path);
        if (mount && mount.mode === "read") granted.add(path);
      }
    }
  }
  return [...granted].sort();
}
