import type { SqlExecutor } from "./types.js";

// Dev-set headline guard (REQ-EVAL-1; AC6): "dev-set results never appear in headline numbers"; "synthetic-flaw
// suites are scorer-development tools; their numbers are never published as benchmark results." A wave report render
// that would place a dev-set (or scorer-development-only) draft into a HEADLINE table fails LOUDLY — the guard is the
// last line of defence behind the DB admission trigger (which already bars a dev-set draft from a scored wave). This
// also carries REQ-EVAL-19 forward: no comparative/superiority number reaches a surface from the dev set.

/** Raised when a headline table would include a draft that is barred from headlines. */
export class DevSetInHeadlineError extends Error {
  constructor(public readonly draftIds: string[]) {
    super(
      `benchmark: headline table includes ${draftIds.length} dev-set/scorer-development draft(s) ` +
        `[${draftIds.join(", ")}] — dev-set and synthetic numbers never enter a headline (REQ-EVAL-1)`,
    );
    this.name = "DevSetInHeadlineError";
  }
}

/** A headline-table row carrying the draft it aggregates + whether that draft is headline-barred. */
export interface HeadlineRow {
  readonly draftId: string;
  readonly isDevSet: boolean;
  readonly scorerDevelopmentOnly?: boolean;
}

/**
 * Assert that none of a headline table's rows is headline-barred (pure — the caller supplies the tags). Throws
 * `DevSetInHeadlineError` naming every offending draft. Use this at the point a wave report renders a headline table.
 */
export function assertHeadlineTable(rows: readonly HeadlineRow[]): void {
  const barred = rows.filter((r) => r.isDevSet || r.scorerDevelopmentOnly === true).map((r) => r.draftId);
  if (barred.length > 0) throw new DevSetInHeadlineError([...new Set(barred)]);
}

/**
 * DB-backed variant: resolve each draft id's dev-set flag from the corpus and assert none is barred (AC6). A draft id
 * not found in the corpus is treated as UNKNOWN and rejected — a headline table may only cite known, non-dev-set
 * corpus drafts. Also rejects any draft admitted only to a dev-set (pilot) wave when `waveId` is given.
 */
export async function assertHeadlineDrafts(
  exec: SqlExecutor,
  draftIds: readonly string[],
  waveId?: string,
): Promise<void> {
  if (draftIds.length === 0) return;
  const rows = (
    await exec.query(
      `select id, is_dev_set from benchmark_corpus_drafts where id = any($1)`,
      [[...draftIds]],
    )
  ).rows as { id: string; is_dev_set: boolean }[];
  const known = new Map(rows.map((r) => [r.id, r.is_dev_set] as const));
  const offending: string[] = [];
  for (const id of draftIds) {
    const devSet = known.get(id);
    if (devSet === undefined || devSet) offending.push(id); // unknown OR dev-set → barred
  }
  if (waveId) {
    const wave = (
      await exec.query(`select is_dev_set from benchmark_waves where id = $1`, [waveId])
    ).rows[0] as { is_dev_set: boolean } | undefined;
    if (!wave || wave.is_dev_set) {
      // a dev-set (pilot) wave is never a headline source — every draft it scores is barred.
      for (const id of draftIds) if (!offending.includes(id)) offending.push(id);
    }
  }
  if (offending.length > 0) throw new DevSetInHeadlineError([...new Set(offending)]);
}
