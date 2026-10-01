// @rhema/run-task — the research preflight probe (RES.1; REQ-SPEC-31(3)).
//
// Before the run's FIRST paid phase — and again on every pod start/resume — the harness proves that every
// model × server-tool pair the run may exercise actually works THROUGH THE RUN'S OWN PROXY. The 2026-09-30
// Quick/Base Review charged a complete run whose `web_search` never reached the model; this probe is the
// fail-closed guard that turns that regression into a cheap, immediate `research_preflight_failed` instead
// of a paid Unverifiable dossier.
//
// The probe is a real `/v1/messages` call against the EGRESS-PROXY base (NOT the loopback injector — the
// injector's whole job is agent traffic) carrying the run credential + `x-rhema-phase-class: preflight`.
// The `preflight` class bypasses the run's remaining-budget bound at the proxy, so a budget-exhausted
// resume still re-proves the pairs; each probe declares the server-authored tool variant with
// `max_uses: 1` so a rogue tool call can never burn the budget. Probes are metered like any served
// response — on failure the terminal settle absorbs them as platform cost, never a user debit.

import type { ResearchPreflightSpec } from "@rhema/orchestrator";
import { PHASE_CLASS_HEADER, PROXY_CREDENTIAL_HEADER } from "./proxy-injector.js";

export type { ResearchPreflightSpec };

export interface PreflightPairResult {
  readonly model: string;
  readonly tool: string;
  readonly ok: boolean;
  /** provider HTTP status when the pair was refused (no status ⇒ a transport failure). */
  readonly status?: number;
  /** the provider error type when present — never prompt/draft text. */
  readonly reason?: string;
}

export type PreflightOutcome =
  | { readonly ok: true; readonly probed: number }
  | { readonly ok: false; readonly probed: number; readonly failures: readonly PreflightPairResult[] };

/** The per-probe ceiling: a hung provider request must not stall pod start past this. */
export const PREFLIGHT_TIMEOUT_MS = 30_000;
/** `max_tokens` on the probe — the tool call + a short answer; never a paid workload. */
const PREFLIGHT_MAX_TOKENS = 1024;

/**
 * The fixed probe prompt per tool (§12.8(d)-safe: no draft text, so the n-gram guard stays quiet).
 * `web_fetch` needs a URL already in the conversation — the fetch channel only reaches URLs the
 * request carries — so the prompt pins a stable public page.
 */
const PROBE_PROMPTS: Record<"web_search" | "web_fetch", string> = {
  web_search: "Search the web for the current year and answer with the number only.",
  web_fetch: "Fetch the page at https://example.com/ and answer with its title only.",
};

/**
 * REQ-SPEC-31(1) pass rule: a pair passes only when the response carries a REAL
 * `web_search_tool_result` / `web_fetch_tool_result` block — never an error block (the provider ran
 * the tool and reported `*_tool_result_error`) and never a missing block (the model answered without
 * calling the tool, the incident's exact failure shape). A 2xx alone is NOT a pass.
 */
function toolResultPassed(tool: "web_search" | "web_fetch", content: unknown): boolean {
  if (!Array.isArray(content)) return false;
  const want = `${tool}_tool_result`;
  for (const b of content) {
    const blk = b as { type?: unknown; content?: unknown } | null;
    if (blk?.type !== want) continue;
    const c = blk.content;
    // an errored result carries `{type: "<tool>_tool_result_error", error_code}`; a real result is a
    // result array (search) or a `<tool>_result` object (fetch) — anything not marked *_error counts.
    const errType = Array.isArray(c)
      ? undefined
      : (c as { type?: unknown } | null | undefined)?.type;
    if (typeof errType !== "string" || !errType.includes("error")) return true;
  }
  return false;
}

/**
 * Run every `model × tool` pair through the run's proxy. Probes run in parallel (the run's own proxy is
 * the admission point — the same serialization the incident lacked). Each probe declares ONLY its
 * target tool and forces the call (`tool_choice: {type:"tool"}`), so the pair genuinely exercises the
 * server-tool path — a response without the tool's result block fails the pair even on a 2xx.
 * Non-2xx (the provider validating `tools[]` at request time — the incident's refusal class) and
 * transport errors both fail closed.
 */
export async function runResearchPreflight(args: {
  /** the egress-proxy base URL — the run's real `ANTHROPIC_BASE_URL`, credentialed by the harness. */
  readonly baseUrl: string;
  readonly credential: string;
  readonly spec: ResearchPreflightSpec;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
}): Promise<PreflightOutcome> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const base = args.baseUrl.replace(/\/$/, "");
  const timeoutMs = args.timeoutMs ?? PREFLIGHT_TIMEOUT_MS;

  const results = await Promise.all(
    args.spec.pairs.map(async (pair): Promise<PreflightPairResult> => {
      const toolType = args.spec.toolTypes[pair.tool];
      try {
        const res = await fetchImpl(`${base}/v1/messages`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            [PROXY_CREDENTIAL_HEADER]: args.credential,
            // the bypass class: the proxy lifts the budget bound for a stamped probe so a spent-budget
            // resume still re-preflights (RES.1). `max_uses: 1` bounds the declared tool anyway.
            [PHASE_CLASS_HEADER]: "preflight",
          },
          body: JSON.stringify({
            model: pair.model,
            max_tokens: PREFLIGHT_MAX_TOKENS,
            messages: [{ role: "user", content: PROBE_PROMPTS[pair.tool] }],
            tools: [{ type: toolType, name: pair.tool, max_uses: 1 }],
            tool_choice: { type: "tool", name: pair.tool },
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) {
          const errBody = (await res.json().catch(() => ({}))) as { error?: { type?: string } };
          return {
            model: pair.model,
            tool: pair.tool,
            ok: false,
            status: res.status,
            ...(errBody.error?.type ? { reason: errBody.error.type } : {}),
          };
        }
        const body = (await res.json().catch(() => ({}))) as { content?: unknown };
        return toolResultPassed(pair.tool, body.content)
          ? { model: pair.model, tool: pair.tool, ok: true, status: res.status }
          : { model: pair.model, tool: pair.tool, ok: false, status: res.status, reason: "no_tool_result" };
      } catch (e) {
        return { model: pair.model, tool: pair.tool, ok: false, reason: `transport:${(e as Error).name}` };
      }
    }),
  );

  const failures = results.filter((r) => !r.ok);
  return failures.length === 0
    ? { ok: true, probed: results.length }
    : { ok: false, probed: results.length, failures };
}

/** Render a probe failure list for the `failStep` reason — pair ids + statuses only, no content. */
export function describePreflightFailures(
  failures: readonly { model: string; tool: string; status?: number; reason?: string }[],
): string {
  return failures
    .map((f) => `${f.model}×${f.tool} ${f.status !== undefined ? `HTTP ${f.status}` : "no-response"}${f.reason ? ` (${f.reason})` : ""}`)
    .join("; ");
}
