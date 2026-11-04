// R7RO.1 (REQ-DWEB-14; spec §3.3 S-3) — the ONE client read-only mechanism. The reason arrives on
// TWO carriers: the boot payload (`readOnlyProject` — the document-level `demo`/`showcase` stamp)
// and the Page-family JSON twins (`project.readOnlyProject` — the row facts the request-scoped
// boot cannot see, `run_lock` included). Both decode fail-closed; the twin fact wins when both
// exist. Frozen VERSIONS are never a reason (S-3/RV-19 — typing in one forks v(N+1)).
//
//   • `readOnlyProjectFor(boot, twin)` — the pure derive (one call site per leaf/surface).
//   • `useReadOnlyProject(twin)` — the React accessor over the boot singleton.
//   • `readOnlyProjectNow(twin)` — the non-React read (mount effects, the controller).
//   • `<ReadOnlyNotice>` — the ONE notice per reason in the page header area.

import { useMemo, type ReactNode } from "react";
import type { ReadOnlyProject, ReadOnlyReason } from "@rhema/contracts";
import { readOnlyProjectOf } from "@rhema/contracts";
import { COPY } from "../copy.js";
import { getSpaBoot, type SpaBoot } from "./boot.js";

/** The minimal twin shape the derive reads — every Page-family twin's `project` bag. */
export interface ReadOnlyTwinCarrier {
  readonly project?: {
    readonly slug?: string;
    readonly readOnlyProject?: ReadOnlyProject | null;
  } | null;
}

/**
 * Boot + twin → the effective read-only fact (twin wins; unknown shapes never assert). The boot
 * slot is a DOCUMENT-level fact for the project that served the shell — it applies only when it
 * names the same slug as the twin (or the caller's route param), so an in-app hop to another
 * project never inherits a stale showcase/demo stamp.
 */
export function readOnlyProjectFor(
  boot: SpaBoot | null,
  twin?: ReadOnlyTwinCarrier | null,
  routeSlug?: string,
): ReadOnlyProject | null {
  const fromTwin = readOnlyProjectOf(twin?.project?.readOnlyProject);
  if (fromTwin != null) return fromTwin;
  const slug = twin?.project?.slug ?? routeSlug;
  if (slug != null && boot?.project?.slug === slug) return readOnlyProjectOf(boot?.readOnlyProject);
  return null;
}

/** The React accessor — derived once per leaf render over the boot singleton + the twin. */
export function useReadOnlyProject(twin?: ReadOnlyTwinCarrier | null): ReadOnlyProject | null {
  return useMemo(() => readOnlyProjectFor(getSpaBoot(), twin), [twin]);
}

/** The non-React read (page-mount effects, imperative paths) — the same derive, no hook. */
export function readOnlyProjectNow(twin?: ReadOnlyTwinCarrier | null): ReadOnlyProject | null {
  return readOnlyProjectFor(getSpaBoot(), twin);
}

/** The withheld-control tooltip — one honest reason line per reason (a COPY leaf; literal
 *  references so the copy-containment walk resolves every leaf). */
export function readOnlyReasonText(reason: ReadOnlyReason): string {
  switch (reason) {
    case "demo":
      return COPY.readOnly.reason.demo;
    case "showcase":
      return COPY.readOnly.reason.showcase;
    case "run_lock":
      return COPY.readOnly.reason.run_lock;
  }
}

/**
 * The ONE notice per reason (REQ-DWEB-14, spec §3.3 S-3): the `demo` sentence (verbatim), the
 * Showcase banner copy + the styled primary **Duplicate** affordance (its ONE write — C10), or
 * nothing for `run_lock` (the Page's existing lock banner IS the notice — DS §5.4's banner is
 * reused, and under a lock the Cancel-run exit stays available).
 */
export function ReadOnlyNotice(props: {
  readonly reason: ReadOnlyReason;
  readonly slug?: string;
}): ReactNode {
  const { reason, slug } = props;
  if (reason === "run_lock") return null; // the Page's lock banner carries the notice verbatim
  return (
    <div
      role="note"
      data-readonly-notice={reason}
      style={{
        border: "1px solid var(--shell-border)",
        borderRadius: "10px",
        padding: "12px 16px",
        margin: "0 0 16px",
        background: "var(--shell-raised)",
        fontSize: "13px",
      }}
    >
      {reason === "showcase" ? (
        <>
          <strong>{COPY.showcase.bannerTitle}</strong>
          <span style={{ color: "var(--shell-fg-muted)" }}> — {COPY.showcase.bannerBody} </span>
          {slug != null ? (
            <form method="post" action={`/p/${slug}/duplicate`} data-duplicate-form="true" style={{ display: "inline" }}>
              <button
                type="submit"
                data-readonly-duplicate="true"
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  padding: "4px 12px",
                  borderRadius: "6px",
                  border: "1px solid var(--accent)",
                  background: "var(--accent)",
                  color: "var(--shell-bg)",
                  cursor: "pointer",
                }}
              >
                {COPY.showcase.duplicateCta}
              </button>
            </form>
          ) : null}
        </>
      ) : (
        <span>{COPY.readOnly.demoNotice}</span>
      )}
    </div>
  );
}
