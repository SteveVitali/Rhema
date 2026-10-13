// The boundary attestation (REQ-DATA-19/20; REQ-ARCH-20 amended; §12.6). The trust chip rests on facts the
// sandbox cannot touch: (1) the server-generated HYDRATION MANIFEST — which paths were mounted for which seat
// ("never mounted" is provable; "never read" is not); (2) the PROXY REQUEST LOG — every search/fetch that left
// the sandbox, tagged run/attempt/agent from the per-run credential; (3) the orchestrator's SUBAGENT LAUNCH
// records + `producerQueryId`. The in-container audit (access_log) is the fourth, SECONDARY "attempts" input.
// At delivery the orchestrator builds `access_report` from these and emits `boundary.attested`; a report with
// denied attempts is still delivered but shows the count — honesty about attempts is the point. The skill's
// own attestation sentence is never parsed.

import type { AgentTypeKey } from "@rhema/contracts";
import { topLevel, type MirrorManifest, type MirrorManifestEntry } from "./manifest.js";
import type { SqlExecutor } from "./sql.js";

/**
 * Iteration caps as orchestrator budgets (REQ-DATA-20; §12.6): a fidelity audit / gap check may iterate at
 * most 3×, a re-plan at most 2×; exceeding one ends the step `completed_partial` with the artifact retained.
 * Encoded here as data; re-plan (2) is enforced in the orchestrator's replan path (P0.08/P1.10). CAP.3
 * (D-STB.5b-2) gives the audit/gap caps their consumer: every input-scoped subagent iteration is a
 * `subagent_launches` row through `recordSubagentLaunch`, so the launch recorder refuses the (cap+1)-th
 * launch for a capped role — the ledger is the budget, counted per run across attempts.
 */
export const ITERATION_CAPS = { audit: 3, gapCheck: 3, replan: 2 } as const;

/** The scoped-role labels whose launches are bounded by `ITERATION_CAPS` (§12.6 roles). */
export const SCOPED_LABEL_CAPS: Readonly<Record<string, number>> = {
  "fidelity-auditor": ITERATION_CAPS.audit,
  "gap-analyst": ITERATION_CAPS.gapCheck,
};

/** The (cap+1)-th scoped launch of a capped role for one run — the audit budget spent. */
export class IterationCapError extends Error {
  constructor(
    readonly runId: string,
    readonly label: string,
    readonly cap: number,
  ) {
    super(`iteration cap reached: scoped role '${label}' already launched ${cap}× for run ${runId} (ITERATION_CAPS)`);
    this.name = "IterationCapError";
  }
}

export interface SubagentScoping {
  readonly label: string;
  readonly inputsKind: "explicit_files" | "inherit";
  readonly fileCount: number;
}

export interface AccessReport {
  readonly runId: string;
  readonly attempt: number;
  readonly seat: AgentTypeKey | string;
  /** counts from the hydration manifest — the "which paths were mounted" fact. */
  readonly mountedPathCount: number;
  readonly byTopLevel: Record<string, number>;
  /** every URL that left the sandbox (the proxy log). */
  readonly fetches: number;
  /** denied attempts (proxy 403 + in-container hook denials) — the SECONDARY "attempts" record. */
  readonly deniedAttempts: number;
  /** dropped write-back boundary violations from the delivering harvest (§12.2). */
  readonly violations: number;
  readonly subagents: readonly SubagentScoping[];
}

// ---------------------------------------------------------------- persistence (server-side facts)

/** Persist the hydration manifest for (run, attempt) — one row per attempt (materialize before step 1 / resume). */
export async function recordMounts(
  exec: SqlExecutor,
  args: { runId: string; attempt: number; manifest: MirrorManifest },
): Promise<void> {
  await exec.query(
    `insert into run_mounts(run_id, attempt, seat, manifest, materialized_at)
     values ($1,$2,$3,$4, now())
     on conflict (run_id, attempt) do update set seat = excluded.seat, manifest = excluded.manifest,
       materialized_at = excluded.materialized_at`,
    [args.runId, args.attempt, args.manifest.seat, JSON.stringify(args.manifest.entries)],
  );
}

export interface RecordLaunchArgs {
  readonly runId: string;
  readonly attempt: number;
  readonly label: string;
  readonly model?: string;
  readonly inputsKind: "explicit_files" | "inherit";
  readonly inputPaths?: readonly string[];
  readonly producerQueryId?: string;
}

/**
 * Record an orchestrator-launched input-scoped subagent (§12.6; the producer-check + attestation source).
 * CAP.3 (D-STB.5b-2): this is also the iteration-cap choke point — a capped role's (cap+1)-th launch for the
 * run throws `IterationCapError` BEFORE the row lands, so the launch loop ends the audit with the artifacts
 * already produced rather than burning a fourth query. Uncapped roles (second-reader, holdout-calibrator)
 * are untouched.
 */
export async function recordSubagentLaunch(
  exec: SqlExecutor,
  deps: { ids: (prefix: string) => string; clock: { now(): Date } },
  args: RecordLaunchArgs,
): Promise<string> {
  const cap = SCOPED_LABEL_CAPS[args.label];
  if (cap != null) {
    const prior = (
      await exec.query(
        `select count(*)::int as n from subagent_launches where run_id = $1 and label = $2`,
        [args.runId, args.label],
      )
    ).rows[0] as { n: number };
    if (prior.n >= cap) throw new IterationCapError(args.runId, args.label, cap);
  }
  const id = deps.ids("sub");
  const paths = args.inputPaths ?? [];
  await exec.query(
    `insert into subagent_launches(id, run_id, attempt, label, model, inputs_kind, input_paths, file_count,
       producer_query_id, launched_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [id, args.runId, args.attempt, args.label, args.model ?? null, args.inputsKind, paths as string[], paths.length, args.producerQueryId ?? null, deps.clock.now()],
  );
  return id;
}

// ---------------------------------------------------------------- build

/** Build the `access_report` from the persisted server-side facts for (run, attempt). */
export async function buildAccessReport(
  exec: SqlExecutor,
  args: { runId: string; attempt: number; violations?: number },
): Promise<AccessReport> {
  const mountRes = await exec.query("select seat, manifest from run_mounts where run_id = $1 and attempt = $2", [
    args.runId,
    args.attempt,
  ]);
  const mountRow = mountRes.rows[0] as { seat: string; manifest: MirrorManifestEntry[] | string } | undefined;
  const entries: MirrorManifestEntry[] = mountRow
    ? typeof mountRow.manifest === "string"
      ? (JSON.parse(mountRow.manifest) as MirrorManifestEntry[])
      : mountRow.manifest
    : [];
  const seat = mountRow?.seat ?? "unknown";

  const byTopLevel: Record<string, number> = {};
  for (const e of entries) {
    const top = topLevel(e.path);
    byTopLevel[top] = (byTopLevel[top] ?? 0) + 1;
  }

  // the proxy request log (fetches that left the sandbox) + its denials.
  const fetchRes = await exec.query(
    `select
        count(*) filter (where decision in ('allow','success','ok') and kind in ('fetch','search'))::int as fetches,
        count(*) filter (where decision not in ('allow','success','ok'))::int as denied
       from fetch_log where run_id = $1`,
    [args.runId],
  );
  const fetchRow = (fetchRes.rows[0] as { fetches: number; denied: number } | undefined) ?? { fetches: 0, denied: 0 };

  // the in-container audit — secondary "attempts": denied hook decisions.
  const accessRes = await exec.query(
    `select count(*) filter (where decision <> 'allow')::int as denied from access_log where run_id = $1`,
    [args.runId],
  );
  const accessDenied = (accessRes.rows[0] as { denied: number } | undefined)?.denied ?? 0;

  const subRes = await exec.query(
    `select label, inputs_kind, file_count from subagent_launches where run_id = $1 and attempt = $2 order by launched_at`,
    [args.runId, args.attempt],
  );
  const subagents: SubagentScoping[] = (subRes.rows as { label: string; inputs_kind: "explicit_files" | "inherit"; file_count: number }[]).map(
    (r) => ({ label: r.label, inputsKind: r.inputs_kind, fileCount: r.file_count }),
  );

  return {
    runId: args.runId,
    attempt: args.attempt,
    seat,
    mountedPathCount: entries.length,
    byTopLevel,
    fetches: fetchRow.fetches,
    deniedAttempts: fetchRow.denied + accessDenied,
    violations: args.violations ?? 0,
    subagents,
  };
}

/** The `boundary.attested` event payload (§12.5 catalogue) derived from an access_report. */
export function accessReportEvent(r: AccessReport): {
  paths_touched_count: number;
  by_top_level: Record<string, number>;
  denied_count: number;
  violations: number;
  subagents: number;
  fetches: number;
} {
  return {
    paths_touched_count: r.mountedPathCount,
    by_top_level: r.byTopLevel,
    denied_count: r.deniedAttempts,
    violations: r.violations,
    subagents: r.subagents.length,
    fetches: r.fetches,
  };
}

/** Render the `access_report` artifact (SR trust chip) — the delivered dossier shows this data (AC7). */
export function renderAccessReportMd(r: AccessReport): string {
  const lines: string[] = [
    `# Access report`,
    ``,
    `Seat: ${r.seat}`,
    `Mounted paths: ${r.mountedPathCount}`,
    `URLs fetched: ${r.fetches}`,
    `Blocked attempts: ${r.deniedAttempts}`,
    `Boundary violations: ${r.violations}`,
    ``,
    `## Mounted by top-level`,
    ``,
  ];
  for (const top of Object.keys(r.byTopLevel).sort()) lines.push(`- ${top}: ${r.byTopLevel[top]}`);
  lines.push(``, `## Subagent scoping`, ``);
  if (r.subagents.length === 0) lines.push(`- (none)`);
  for (const s of r.subagents) lines.push(`- ${s.label}: ${s.inputsKind} (${s.fileCount} files)`);
  return lines.join("\n");
}
