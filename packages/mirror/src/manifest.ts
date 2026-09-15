// The hydration manifest and the derived `manifest.md` (§11.5; REQ-DATA-5, REQ-VIS-6). The manifest is the
// signed contract that makes the mirror "a cache, never a second source of truth" (REQ-DATA-8): it lists every
// mounted path with its `artifact_version_id`, `sha256` and mount mode, so harvest can prove a read-only file
// was not tampered with (hash check) and the attestation can prove which paths were mounted for which seat.
// `manifest.md` is REGENERATED from tables into the mirror (never a file the user edits) — the round timeline.

import type { AgentTypeKey, ArtifactKind } from "@rhema/contracts";
import type { MountRoot } from "@rhema/hooks";

/** One mounted path (§11.5 `.rhema/manifest.json` row). `kind` is null for derived files (e.g. manifest.md). */
export interface MirrorManifestEntry {
  readonly path: string;
  readonly root: MountRoot;
  readonly artifactVersionId: string | null;
  readonly sha256: string;
  readonly mode: "read" | "readwrite";
  readonly kind: ArtifactKind | null;
  readonly namespace: string;
  /** the head version's immutability — a write to an immutable artifact is refused at commit (§12.2/§12.6). */
  readonly immutable: boolean;
}

/** The full hydration manifest for one (run, attempt, seat) materialization. */
export interface MirrorManifest {
  readonly seat: AgentTypeKey;
  readonly entries: readonly MirrorManifestEntry[];
}

/** Index the manifest by path for harvest's O(1) diff. */
export function manifestByPath(m: MirrorManifest): Map<string, MirrorManifestEntry> {
  const out = new Map<string, MirrorManifestEntry>();
  for (const e of m.entries) out.set(e.path, e);
  return out;
}

/**
 * Render `manifest.md` from the manifest (REQ-VIS-6). A derived, read-only artifact — the round timeline as a
 * grouped listing of the mounted artifacts (by top-level namespace), never the user's editable file. Kept
 * deterministic (stable ordering) so the round-trip golden and snapshot tests are stable.
 */
export function renderManifestMd(m: MirrorManifest): string {
  const lines: string[] = [`# Manifest`, ``, `Seat: ${m.seat}`, ``];
  const byTop = new Map<string, MirrorManifestEntry[]>();
  for (const e of m.entries) {
    const top = topLevel(e.path);
    (byTop.get(top) ?? byTop.set(top, []).get(top)!).push(e);
  }
  for (const top of [...byTop.keys()].sort()) {
    lines.push(`## ${top}`, ``);
    for (const e of [...byTop.get(top)!].sort((a, b) => a.path.localeCompare(b.path))) {
      lines.push(`- \`${e.path}\` — ${e.kind ?? "derived"} (${e.mode})`);
    }
    lines.push(``);
  }
  return lines.join("\n");
}

/** The top-level path segment (`agents`, `drafts`, `profile`, …) — the attestation's `by_top_level` bucket. */
export function topLevel(path: string): string {
  const p = path.replace(/^\.?\/*/, "");
  const i = p.indexOf("/");
  return i === -1 ? p : p.slice(0, i);
}
