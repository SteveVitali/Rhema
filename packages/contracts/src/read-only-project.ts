// R7RO.1 (REQ-DWEB-14; spec §3.3 S-3, RV-19) — the ONE client read-only mechanism shared by the
// demo, the seeded Showcase, and the §5.4 run lock. Carried in the Page-family JSON twins
// (`project.readOnlyProject`) and the SPA boot payload; the client derives it once and hides or
// disables every write control BEFORE any request is made, with one notice per reason — the
// server guards (409 `showcase_read_only`, the §6.3 lock saves guard) stay as defence in depth.
//
// `demo` and `showcase` are project/document postures; `run_lock` is DS §5.4's "a reader-run has
// frozen the head" (any HOLDING lock — writer runs lock the whole project). A FROZEN VERSION is
// not read-only: typing in it forks v(N+1) (REQ-WRITE-7), so `state === "frozen"` never maps to a
// reason here — only the run lock does.

/** The read-only reason vocabulary — the union S-3 names, verbatim. */
export const READ_ONLY_REASONS = ["demo", "showcase", "run_lock"] as const;
export type ReadOnlyReason = (typeof READ_ONLY_REASONS)[number];

/** The shared carrier: a project/page the client renders without write controls. */
export interface ReadOnlyProject {
  readonly reason: ReadOnlyReason;
}

/** Wire validation — the twin/boot decoder's fail-closed parse (unknown ⇒ null, never a reason). */
export function readOnlyProjectOf(value: unknown): ReadOnlyProject | null {
  if (value == null || typeof value !== "object") return null;
  const reason = (value as { reason?: unknown }).reason;
  return typeof reason === "string" && (READ_ONLY_REASONS as readonly string[]).includes(reason)
    ? { reason: reason as ReadOnlyReason }
    : null;
}
