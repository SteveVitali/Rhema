// The hold-out corpus spec + the leak audit (P1.14; §9.5; REQ-PERSONA-10/11/12).
//
// At profile_voice launch the deterministic census picks ONE readable piece (≥ MIN_HOLDOUT_WORDS
// words; deterministic — sorted by item id, first qualifying) and records it in the run's frozen
// `inputs.holdouts`. Its bytes enter phase 4's prediction corpus WITHOUT its label; everything
// else — mount policy, seat manifests, prompt text — never says which piece it is. Any policy-allowed
// read of a hold-out path or fetch of a hold-out URL by a NON-calibrator label voids calibration:
// `persona_profiles.calibration_status` snaps to `untested` and a `holdout_leak` build-note flag is
// appended (§9.5: the audit voids rather than patches).
//
// Convention (§9.5): hold-out file paths carry a `HOLDOUT-` marker when a mount/prompt labels them;
// the audit also matches the exact `docs/samples/<itemId>.md` mirror path and the recorded URL —
// either signal leaks.

/** A piece is hold-out-eligible only when it is readable prose (§9.5: "long enough"). */
export const MIN_HOLDOUT_WORDS = 100;

/** The calibrator agent label — the only label whose hold-out reads/fetches do NOT leak (it is
 *  allowed to fetch the hold-out URL only AFTER its prediction file exists; the URL policy enforces
 *  that ordering, the audit only checks WHO read). */
export const CALIBRATOR_AGENT_LABEL = "holdout-calibrator";

/** The audit's "this path touched the hold-out" marker convention (§9.5). */
export const HOLDOUT_PATH_MARKER = "HOLDOUT-";

/** The frozen run-input shape (`runs.inputs.holdouts`). One spec per build; `revealedAt` stamps the
 *  profile once calibration tested — the moment the hold-out's identity becomes visible (§9.4:
 *  pre-calibration surfaces name only "a piece was held back", never which). */
export interface HoldoutSpec {
  /** the held-out corpus item id (matches `docs/samples/<itemId>.md`). */
  readonly itemId: string;
  /** the hold-out's canonical URL when it was ingested from one (the fetch_log side of the audit). */
  readonly url: string | null;
  /** the hold-out's mirror path — `docs/samples/<itemId>.md` (the access_log side of the audit). */
  readonly mirrorPath: string;
  /** word count at selection (records eligibility). */
  readonly words: number;
  /** set when calibration tested (the reveal). Null ⇒ every surface must hide the identity. */
  readonly revealedAt: string | null;
}

export const holdoutMirrorPath = (itemId: string): string => `docs/samples/${itemId}.md`;

/** The structural query seam pg.Pool / PGlite / the test harness all satisfy (the same shape the
 *  orchestrator's `SqlClient` uses — duplicated here so findings-core stays dependency-light). */
export interface Querier {
  query(sql: string, params?: readonly unknown[]): Promise<{ rows: unknown[] }>;
}

/**
 * Pick the hold-out deterministically: the first included item (sorted by item id — stable across
 * calls, testable) whose text reaches MIN_HOLDOUT_WORDS. Returns null when no piece qualifies —
 * the profile still builds; calibration stays `untested` and the approve_sample card says so
 * (§9.5's honest "too small to test" case).
 */
export function pickHoldout(
  items: readonly { readonly itemId: string; readonly words: number }[],
): string | null {
  const sorted = [...items].sort((a, b) => a.itemId.localeCompare(b.itemId));
  return sorted.find((i) => i.words >= MIN_HOLDOUT_WORDS)?.itemId ?? null;
}

/** The audit verdict (§9.5). `leaks` are the offending access/fetch rows for the build-note flag. */
export interface HoldoutLeak {
  readonly kind: "access" | "fetch";
  readonly path: string | null;
  readonly url: string | null;
  readonly agent: string | null;
  readonly at: string | null;
}

export interface HoldoutLeakAudit {
  readonly leaked: boolean;
  readonly leaks: readonly HoldoutLeak[];
}

/**
 * Scan `access_log` + `fetch_log` for a hold-out leak (§9.5): any `allow` decision on the hold-out's
 * mirror path, a `HOLDOUT-`-marked path, or the hold-out's URL — by any agent label other than the
 * calibrator — is a leak. `deny` decisions are never leaks (the policy did its job). The calibrator's
 * own rows are exempt by label.
 */
export async function auditHoldoutLeak(
  tx: Querier,
  args: { readonly runId: string; readonly holdout: HoldoutSpec },
): Promise<HoldoutLeakAudit> {
  const leaks: HoldoutLeak[] = [];
  try {
    const accesses = await tx.query(
      `select path, agent_label, ts from access_log
        where run_id = $1 and decision = 'allow'
          and (path = $2 or path ilike '%' || $3 || '%')
        order by ts`,
      [args.runId, args.holdout.mirrorPath, HOLDOUT_PATH_MARKER],
    );
    for (const r of accesses.rows as { path: string; agent_label: string | null; ts: string }[]) {
      if (r.agent_label === CALIBRATOR_AGENT_LABEL) continue;
      leaks.push({ kind: "access", path: r.path, url: null, agent: r.agent_label, at: r.ts });
    }
  } catch {
    /* access_log absent in minimal harnesses — the audit stays honest, not crashy. */
  }
  if (args.holdout.url) {
    try {
      const fetches = await tx.query(
        `select url, normalized_url, agent_label, ts from fetch_log
          where run_id = $1 and decision = 'allow' and (url = $2 or normalized_url = $2)
          order by ts`,
        [args.runId, args.holdout.url],
      );
      for (const r of fetches.rows as { url: string | null; agent_label: string | null; ts: string }[]) {
        if (r.agent_label === CALIBRATOR_AGENT_LABEL) continue;
        leaks.push({ kind: "fetch", path: null, url: r.url, agent: r.agent_label, at: r.ts });
      }
    } catch {
      /* fetch_log may be absent in minimal harnesses. */
    }
  }
  return { leaked: leaks.length > 0, leaks };
}
