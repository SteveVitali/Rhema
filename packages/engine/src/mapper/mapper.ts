// @rhema/engine/mapper — SDK messages → the §12.5 typed run events (REQ-ARCH-14/15; REQ-ARCH-12).
//
// A pure, stateful mapper turns the SDK message stream into the typed events the orchestrator posts to
// `/internal/runs/:id/events`. It is the substrate for `FakeEngine` (ledger G21) and the conformance suite
// both engines pass (REQ-ARCH-7). The load-bearing rules, all enforced here and asserted by the suite:
//   • REQ-ARCH-14 — `agent.note` text comes ONLY from `@rhema/contracts` note templates; model/page text
//     never reaches a note. The mapper passes structured params (counts, a bounded host label), never prose.
//   • REQ-ARCH-15 — `source.read` URLs come from the tool RESULT, never the model's request.
//   • REQ-ARCH-12 — every event carries the catalogue's visibility; internal types are tagged `internal`
//     (the SSE route drops them). The mapper never re-labels.
// Events that are computed at harvest/commit from artifacts + sidecars (claim.checked, finding.emitted,
// section.drafted, artifact.written, boundary.*) are the orchestrator's, NOT the mapper's — they are not
// derivable from the raw stream. Credits need the proxy rate table, so the mapper yields a `usage` marker
// (tokens) and the orchestrator renders `usage.tick` (credits).

import { renderNote } from "@rhema/contracts";
import type { EngineEvent, ResultSubtype, UsageSnapshot } from "../engine.js";
import { emptyUsage } from "../engine.js";
import type {
  SdkAssistantMessage,
  SdkContentBlock,
  SdkMessage,
  SdkResultMessage,
  SdkUserMessage,
} from "../sdk-types.js";
import { addUsage, setUsageTotals, cloneUsage } from "../usage.js";
import { event } from "./build-event.js";
import { extractFetchResult, extractSearchResultCount, hostOf, isAbsoluteHttpUrl } from "./tool-results.js";

/** What the mapper needs to know about the phase it is mapping. */
export interface MapperContext {
  /** the phase key + position, for note ordinals. */
  readonly phaseKey: string;
  readonly ordinal: number;
  readonly of: number;
  /** the main agent's label (the seat), attributed to non-subagent events. */
  readonly mainAgentLabel: string;
}

type SearchTool = "WebSearch" | "web_search";
type FetchTool = "WebFetch" | "web_fetch";
type SubagentTool = "Task" | "Agent";

const SEARCH_NAMES = new Set<string>(["WebSearch", "web_search"] satisfies SearchTool[]);
const FETCH_NAMES = new Set<string>(["WebFetch", "web_fetch"] satisfies FetchTool[]);
const SUBAGENT_NAMES = new Set<string>(["Task", "Agent"] satisfies SubagentTool[]);

interface PendingSearch {
  query: string;
  agentLabel: string;
}
interface PendingFetch {
  requestHost?: string;
  agentLabel: string;
}
interface PendingSubagent {
  label: string;
  inputs: "explicit_files" | "inherit";
  fileCount: number;
  model?: string;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/** A stateful mapper for one phase. `push` maps a message; `flush` emits terminal-only leftovers. */
export interface Mapper {
  push(msg: SdkMessage): EngineEvent[];
  flush(): EngineEvent[];
  usage(): UsageSnapshot;
}

export function createMapper(ctx: MapperContext): Mapper {
  const usage = emptyUsage();
  const pendingSearch = new Map<string, PendingSearch>();
  const pendingFetch = new Map<string, PendingFetch>();
  const pendingSubagent = new Map<string, PendingSubagent>();
  /** subagent tool_use id → label, so turns with `parent_tool_use_id` attribute to the subagent. */
  const subagentLabelById = new Map<string, string>();
  let sourcesRead = 0;
  let compactions = 0;

  const labelFor = (parentToolUseId: string | null | undefined): string =>
    (parentToolUseId && subagentLabelById.get(parentToolUseId)) || ctx.mainAgentLabel;

  function handleToolUse(block: Extract<SdkContentBlock, { type: "tool_use" }>, agentLabel: string): EngineEvent[] {
    const out: EngineEvent[] = [];
    if (SEARCH_NAMES.has(block.name)) {
      // Bound the query to the §12.5 free-text cap here: a hostile query stuffed with draft text must not
      // crash the whitelist validator (that would drop the whole event stream); the proxy's `suspicious_query`
      // n-gram check (§12.8d) is the real exfil control, not this.
      pendingSearch.set(block.id, { query: (str(block.input.query) ?? "").slice(0, 280), agentLabel });
      return out; // emitted on the result (we need resultCount)
    }
    if (FETCH_NAMES.has(block.name)) {
      const reqUrl = str(block.input.url);
      const requestHost = reqUrl ? hostOf(reqUrl) : undefined;
      pendingFetch.set(block.id, { ...(requestHost ? { requestHost } : {}), agentLabel });
      // internal audit of the REQUEST (never a user event; the request URL is not a source.read — REQ-ARCH-15).
      out.push(event("tool.audit", { tool: block.name, toolUseId: block.id, phase: "request" }, agentLabel));
      return out;
    }
    if (SUBAGENT_NAMES.has(block.name)) {
      const label = str(block.input.subagent_type) ?? str(block.input.description) ?? "agent";
      // an in-query Task is a researcher fan-out: it inherits the seat's mounts (§12.6). Input-scoped
      // subagents are launched by the orchestrator as SEPARATE queries, not via this tool.
      const model = str(block.input.model);
      const pending: PendingSubagent = { label, inputs: "inherit", fileCount: 0, ...(model ? { model } : {}) };
      pendingSubagent.set(block.id, pending);
      subagentLabelById.set(block.id, label);
      out.push(
        event(
          "subagent.started",
          { label, inputs: pending.inputs, fileCount: pending.fileCount, ...(model ? { model } : {}) },
          agentLabel,
        ),
      );
      return out;
    }
    // Read/Write/Edit/Glob/Grep/Bash and anything else: internal audit only (no content, no user event).
    out.push(event("tool.audit", { tool: block.name, toolUseId: block.id }, agentLabel));
    return out;
  }

  function handleAssistant(msg: SdkAssistantMessage): EngineEvent[] {
    const out: EngineEvent[] = [];
    const agentLabel = labelFor(msg.parent_tool_use_id);
    if (msg.message.usage) {
      addUsage(usage, msg.message.usage);
      out.push({ kind: "usage", snapshot: cloneUsage(usage) });
    }
    for (const block of msg.message.content) {
      if (block.type === "tool_use") out.push(...handleToolUse(block, agentLabel));
      // text / thinking blocks are the model's own words — they NEVER become a user event.
    }
    return out;
  }

  function handleUser(msg: SdkUserMessage): EngineEvent[] {
    const out: EngineEvent[] = [];
    const content = msg.message.content;
    if (typeof content === "string") return out;
    for (const block of content) {
      if (block.type !== "tool_result") continue;
      const id = block.tool_use_id;
      const search = pendingSearch.get(id);
      if (search) {
        pendingSearch.delete(id);
        const resultCount = extractSearchResultCount(block.content);
        out.push(event("search.performed", { query: search.query, resultCount, agentLabel: search.agentLabel }, search.agentLabel));
        out.push(event("search.result", { toolUseId: id, resultCount }, search.agentLabel));
        continue;
      }
      const fetch = pendingFetch.get(id);
      if (fetch) {
        pendingFetch.delete(id);
        if (block.is_error) {
          const domain = fetch.requestHost ?? "source";
          out.push(event("source.denied", { urlDomain: domain, reason: "blocked by policy" }, fetch.agentLabel));
          continue;
        }
        const r = extractFetchResult(block.content); // url ONLY from the RESULT (REQ-ARCH-15)
        if (r.url && isAbsoluteHttpUrl(r.url)) {
          sourcesRead += 1;
          out.push(
            event(
              "source.read",
              {
                url: r.url,
                ...(r.title ? { title: r.title } : {}),
                ...(r.status !== undefined ? { status: r.status } : {}),
                ...(r.bytes !== undefined ? { bytes: r.bytes } : {}),
                agentLabel: fetch.agentLabel,
              },
              fetch.agentLabel,
            ),
          );
          // template-only note: a COUNT, never the page's text (REQ-ARCH-14).
          out.push(event("agent.note", renderNote("reading_sources", { n: sourcesRead }), fetch.agentLabel));
        }
        out.push(event("tool.audit", { tool: "web_fetch", toolUseId: id, phase: "result" }, fetch.agentLabel));
        continue;
      }
      const sub = pendingSubagent.get(id);
      if (sub) {
        pendingSubagent.delete(id);
        out.push(event("subagent.finished", { label: sub.label, fileCount: sub.fileCount }, sub.label));
        continue;
      }
    }
    return out;
  }

  function handleResult(msg: SdkResultMessage): EngineEvent[] {
    // the result carries the CUMULATIVE total — overwrite, never add (see setUsageTotals; §12.7 cross-check).
    setUsageTotals(usage, msg.usage, msg.total_cost_usd);
    const subtype = mapResultSubtype(msg);
    return [{ kind: "result", subtype, usage: cloneUsage(usage) }];
  }

  return {
    push(msg): EngineEvent[] {
      switch (msg.type) {
        case "assistant":
          return handleAssistant(msg);
        case "user":
          return handleUser(msg);
        case "result":
          return handleResult(msg);
        case "system":
          if (msg.subtype === "compact_boundary") {
            compactions += 1;
            return [event("context.compacted", { count: compactions })];
          }
          return [];
        case "stream_event":
        default:
          return []; // partial-streaming deltas are not mapped (we map whole messages)
      }
    },
    flush(): EngineEvent[] {
      const out: EngineEvent[] = [];
      // Any search whose result never arrived — the SERVER-side `web_search` is the only search
      // path (P0.15i) and its results ride inline `web_search_tool_result` blocks, never a
      // `tool_result` — flushes with `resultCount: null`: the query is real evidence worth
      // keeping, but the count was never observable. Emitting `0` here claimed "empty result
      // set" for searches that billed and returned content — the fabricated zeros were the
      // "6 empty search events" that misdirected the Leg-1a diagnosis (RES.3).
      for (const [, s] of pendingSearch) {
        out.push(event("search.performed", { query: s.query, resultCount: null, agentLabel: s.agentLabel }, s.agentLabel));
      }
      pendingSearch.clear();
      return out;
    },
    usage: () => cloneUsage(usage),
  };
}

/** Map the result subtype onto the completion-oracle vocabulary (REQ-SPEC-13 leg a). */
function mapResultSubtype(msg: SdkResultMessage): ResultSubtype {
  switch (msg.subtype) {
    case "success":
      return "success";
    case "error_max_turns":
      return "error_max_turns";
    case "refusal":
      return "refusal";
    case "budget":
      return "budget";
    default:
      return "error_during_execution";
  }
}

/** Convenience: drain a whole message array through a fresh mapper (used by the conformance suite). */
export function mapMessages(messages: readonly SdkMessage[], ctx: MapperContext): EngineEvent[] {
  const m = createMapper(ctx);
  const out: EngineEvent[] = [];
  for (const msg of messages) out.push(...m.push(msg));
  out.push(...m.flush());
  return out;
}
