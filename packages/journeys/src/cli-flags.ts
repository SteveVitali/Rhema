// SPA.6 — the renderer/surface flag validation (REQ-VFY-7/8/10; design/29 §per-flip runbook).
// Extracted from cli.ts so the leg contract is unit-testable — `cli.ts` stays the process shell
// (argv/env/exit codes), this module carries the decisions.
//
//   --expect-renderer ssr|spa   assert data-renderer on every same-origin document
//   --surface <key[,key…]>      the SURFACE_GATES subset + the --expect-renderer scope
//
// SPA.28 — `--pin-renderer`/`isProdTarget` retired with `x-rhema-renderer` (REQ-SEQ-4's removal
// leg); the CLI refuses the retired flag outright.
//
// Every invalid value is an error STRING returned to the caller (the CLI prints + exits 2) —
// nothing here throws or exits, so a test asserts the full refusal table.

import { SPA_SURFACES, type SpaSurface } from "@rhema/contracts";
import type { RendererName } from "./settle.js";
import { SURFACE_GATES, stepsForSurfaces } from "./surface-gates.js";

/** Parse an `ssr|spa` flag value; undefined ⇒ unset. Returns the error string on anything else. */
export function parseRendererFlag(
  raw: string | undefined,
  flag: string,
): { value?: RendererName; error?: string } {
  if (raw === undefined) return {};
  if (raw === "ssr" || raw === "spa") return { value: raw };
  return { error: `${flag} must be ssr|spa — got ${JSON.stringify(raw)}` };
}

/** Parse `--surface a,b` into canonical keys; unknown tokens are errors (never dropped). */
export function parseSurfaces(
  raw: string | undefined,
): { surfaces?: SpaSurface[]; error?: string } {
  if (raw === undefined) return {};
  const keys = raw
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x !== "");
  for (const key of keys) {
    if (!(SPA_SURFACES as readonly string[]).includes(key)) {
      return {
        error: `--surface: unknown key ${JSON.stringify(key)} (known: ${SPA_SURFACES.join(", ")})`,
      };
    }
  }
  return { surfaces: keys as SpaSurface[] };
}

/** Resolve the gate ids for the selected surfaces — propagates the empty-gate refusal. */
export function gatedStepIds(
  surfaces: readonly SpaSurface[],
  stepPaid: (id: string) => boolean | undefined,
): { ids?: Set<string>; error?: string } {
  let resolved: readonly string[];
  try {
    resolved = stepsForSurfaces(surfaces);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  const ids = new Set(resolved);
  // REQ-VFY-10 — a flip gate may only ever select $0 steps (schema-tested; belt + suspenders here).
  const paidHit = [...ids].filter((id) => stepPaid(id));
  if (paidHit.length > 0) {
    return {
      error: `--surface resolved paid steps (${paidHit.join(", ")}) — REQ-VFY-10 forbids paid legs in a flip gate`,
    };
  }
  return { ids };
}

/** The per-surface gate echo the CLI prints (what the leg will run + what's still owed). */
export function gateEcho(key: SpaSurface): string {
  const g = SURFACE_GATES[key];
  return (
    `surface ${key}: gate ${g.steps.join(",") || "∅"}` +
    (g.owed.length ? ` · owed: ${g.owed.join("; ")}` : "") +
    (g.weeklyHolds.length ? ` · weekly-holds: ${g.weeklyHolds.join(",")}` : "")
  );
}
