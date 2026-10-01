// The run walkthrough (§5.5 D20; §5.6; REQ-IDE-19 amended): ONE package-class model call, made lazily — a
// delivered run's first Timeline card render (or its Retry button) enqueues `run.walkthrough`, the worker
// handler gathers a NARROW delivered-artifact whitelist, calls the bound generator once, enforces ≤200
// words mechanically, and stores {status,text,model,inputDigest,attempts,…} on `runs.walkthrough`. Never
// agent-prose-derived progress: the input whitelist is artifact identity + shape (kind, path, word count)
// plus run facts — no prompts, reasoning, transcripts, or source-note bodies. A failed attempt records
// {status:'failed',lastError} and the card's Retry re-enqueues; a job that died before writing leaves
// `walkthrough` null and the NEXT render re-enqueues (self-healing).

import { createHash } from "node:crypto";
import { RUN_JOBS } from "./queue.js";
import type { OrchestratorDeps } from "./internal-api.js";
import type { RunState } from "./state-machine.js";

export const WALKTHROUGH_MAX_WORDS = 200;

/** The states a walkthrough exists for — "delivered" in the card's sense (a report link is offered). */
const DELIVERED_STATES: readonly RunState[] = ["completed", "completed_partial"];

/** The persisted `runs.walkthrough` jsonb shape (0030). */
export interface WalkthroughRecord {
  readonly status: "ready" | "failed";
  readonly text?: string;
  readonly model?: string;
  readonly inputDigest?: string;
  readonly attempts: number;
  readonly generatedAt?: string;
  readonly lastAttemptAt?: string;
  readonly lastError?: string;
}

/** One whitelist entry per delivered artifact — identity + shape, never body. */
export interface WalkthroughArtifact {
  readonly kind: string;
  readonly path: string;
  readonly wordCount: number | null;
}

/** Everything the generator may see. Bounded, derived only from delivered run facts. */
export interface WalkthroughInput {
  readonly runId: string;
  readonly workflow: string;
  readonly state: RunState;
  readonly phases: readonly { phase: string; credits: number; durationMs: number | null }[];
  readonly claimsVerified: number | null;
  readonly spentCredits: number;
  readonly artifacts: readonly WalkthroughArtifact[];
}

export interface WalkthroughResult {
  readonly text: string;
  readonly model: string;
}

/** The deploy-bound seam: one package-class model call per `generate` (the worker binds the real caller). */
export interface WalkthroughGenerator {
  generate(input: WalkthroughInput): Promise<WalkthroughResult>;
}

export interface WalkthroughDeps extends OrchestratorDeps {
  readonly walkthrough: WalkthroughGenerator;
}

function digestInput(input: WalkthroughInput): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

/** Mechanically cap the model's prose at 200 words (cut at the boundary; no ellipsis counted as a word). */
export function enforceWordCap(text: string): string {
  const words = text.trim().split(/\s+/).filter((w) => w.length > 0);
  if (words.length <= WALKTHROUGH_MAX_WORDS) return text.trim();
  return words.slice(0, WALKTHROUGH_MAX_WORDS).join(" ");
}

interface WalkthroughRunRow {
  state: RunState;
  workflow: string;
  spent_credits: number;
  walkthrough: WalkthroughRecord | null;
}

/**
 * The lazy enqueue (§5.5): called while assembling a delivered run's card. Sends `run.walkthrough` when the
 * record is absent — a `ready`/`failed` record is never auto-regenerated (Retry is the explicit path), and
 * the singleton key dedupes concurrent renders.
 */
export async function maybeEnqueueWalkthrough(
  deps: OrchestratorDeps,
  args: { runId: string; workspaceId: string; state: RunState; walkthrough: WalkthroughRecord | null },
): Promise<void> {
  if (!DELIVERED_STATES.includes(args.state)) return;
  if (args.walkthrough != null) return;
  await deps.queue.send(
    RUN_JOBS.walkthrough,
    { runId: args.runId, workspaceId: args.workspaceId },
    { singletonKey: `walkthrough:${args.runId}` },
  );
}

export type GenerateWalkthroughResult =
  | { readonly ok: true; readonly status: "ready" | "failed"; readonly attempts: number }
  | { readonly ok: false; readonly reason: "not_found" | "not_delivered" | "already_ready" };

/**
 * `run.walkthrough` job handler: load the run, gather the whitelist, ONE `generate` call, store the record.
 * The model call happens OUTSIDE the run-row lock (a tx held across a network call invites contention);
 * the write tx re-reads the row so a concurrent ready/attempt isn't clobbered.
 */
export async function generateWalkthrough(
  deps: WalkthroughDeps,
  args: { runId: string; workspaceId: string },
): Promise<GenerateWalkthroughResult> {
  const now = deps.clock.now();

  const prepared = await deps.txRunner.run(args.workspaceId, async (tx) => {
    const run = (
      await tx.query("select state, workflow, spent_credits, walkthrough from runs where id = $1 for update", [args.runId])
    ).rows[0] as WalkthroughRunRow | undefined;
    if (!run) return { kind: "not_found" } as const;
    if (!DELIVERED_STATES.includes(run.state)) return { kind: "not_delivered" } as const;
    if (run.walkthrough?.status === "ready") return { kind: "already_ready" } as const;

    // claim the attempt inside the lock so two racing jobs can't both make the call
    const attempts = (run.walkthrough?.attempts ?? 0) + 1;
    const claimed: WalkthroughRecord = {
      status: "failed",
      attempts,
      lastAttemptAt: now.toISOString(),
      lastError: "in_progress",
      ...(run.walkthrough?.model != null ? { model: run.walkthrough.model } : {}),
    };
    await tx.query("update runs set walkthrough = $2 where id = $1", [args.runId, JSON.stringify(claimed)]);

    // the narrow whitelist: committed phases + delivered artifact identity/shape + run facts
    const steps = (
      await tx.query(
        `select phase, credits, extract(epoch from (ended_at - started_at)) * 1000 as duration_ms
           from steps where run_id = $1 and state = 'done' order by ordinal`,
        [args.runId],
      )
    ).rows as { phase: string; credits: number; duration_ms: string | null }[];

    const artifacts = (
      await tx.query(
        `select a.kind, a.mirror_path as path, av.word_count
           from steps s
           join artifact_versions av on av.id = any(s.produced_version_ids)
           join artifacts a on a.id = av.artifact_id
          where s.run_id = $1 and s.state = 'done' order by s.ordinal`,
        [args.runId],
      )
    ).rows as { kind: string; path: string; word_count: number | null }[];

    // claims verified: the run's check.result / claim progress surfaced as verified count, when recorded
    const claims = (
      await tx.query(
        `select count(*)::int as n from run_events
          where run_id = $1 and type = 'claim.checked' and payload->>'verdict' = 'verified'`,
        [args.runId],
      )
    ).rows[0] as { n: number } | undefined;

    const input: WalkthroughInput = {
      runId: args.runId,
      workflow: run.workflow,
      state: run.state,
      phases: steps.map((s) => ({
        phase: s.phase,
        credits: s.credits,
        durationMs: s.duration_ms != null ? Math.round(Number(s.duration_ms)) : null,
      })),
      claimsVerified: claims?.n ?? null,
      spentCredits: run.spent_credits,
      artifacts: artifacts.map((a) => ({ kind: a.kind, path: a.path, wordCount: a.word_count })),
    };
    return { kind: "go", attempts, input } as const;
  });

  if (prepared.kind === "not_found") return { ok: false, reason: "not_found" } as const;
  if (prepared.kind === "not_delivered") return { ok: false, reason: "not_delivered" } as const;
  if (prepared.kind === "already_ready") return { ok: false, reason: "already_ready" } as const;

  const generated = await deps.walkthrough
    .generate(prepared.input)
    .then((r) => ({ ok: true as const, text: enforceWordCap(r.text), model: r.model }))
    .catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }));

  const record: WalkthroughRecord = generated.ok
    ? {
        status: "ready",
        text: generated.text,
        model: generated.model,
        inputDigest: digestInput(prepared.input),
        attempts: prepared.attempts,
        generatedAt: deps.clock.now().toISOString(),
        lastAttemptAt: now.toISOString(),
      }
    : {
        status: "failed",
        attempts: prepared.attempts,
        lastAttemptAt: now.toISOString(),
        lastError: generated.error.slice(0, 500),
      };

  await deps.txRunner.run(args.workspaceId, async (tx) => {
    await tx.query("update runs set walkthrough = $2 where id = $1", [args.runId, JSON.stringify(record)]);
  });
  return { ok: true, status: record.status, attempts: record.attempts };
}
