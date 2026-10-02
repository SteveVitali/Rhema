// @rhema/egress-proxy — the request pipeline (REQ-SPEC-11; §12.7, §12.8d). The heart of the proxy.
//
// One credentialed request in → validate → cap → outbound-channel limits → URL-policy rewrite → forward →
// meter → log → out. Every refusal is attributed and logged; every served response is metered into the rows
// of record and counted against the cap. The pipeline is PURE of the network: the forward step is injected, so
// the whole flow (incl. metering a fixture provider response) runs deterministically in-process. Cross-cutting
// invariant: cost/cap/logging derive only from the resolved run context and the provider RESPONSE — never from
// request headers or bodies the sandbox controls (I1); there is never an unmetered inference channel (I2).

import { isOverCap, type CapAccountant } from "./cap.js";
import type { RunContext, RunContextResolver } from "./context.js";
import {
  buildUpstreamHeaders,
  isEndpointAllowed,
  isModelAllowed,
  presentedAgentId,
  presentedCredential,
  presentedPhaseClass,
  presentedStep,
} from "./credential.js";
import {
  buildRequestFetchLogRow,
  buildServerToolFetchLogRow,
  type FetchLogBase,
  type FetchLogRow,
} from "./fetch-log.js";
import { ulid, type IdFactory } from "./ids.js";
import { meterResponse } from "./metering.js";
import { hostnameOf, registrableDomainOf } from "./domains.js";
import {
  extractExecutedServerToolUses,
  extractResponseServerTools,
  extractResponseServerToolsSse,
  extractServerToolInvocations,
  guardWebFetchUrl,
  NovelDomainTracker,
  ResearchUsageTracker,
  type ResearchReservation,
  rewriteFetchUrl,
} from "./outbound-limits.js";
import { isSseBody } from "./usage-block.js";
import { checkSearchQuery, SUSPICIOUS_QUERY_THRESHOLD } from "./ngram.js";
import { isModelPriceable } from "./rates.js";
import type { FetchLogWriter, SecretProvider, UsageWriter } from "./sinks.js";
import { DenialSpikeTracker, type EventSink } from "./signals.js";
import {
  ensureServerWebTools,
  injectUrlPolicyIntoBody,
  resolveServerWebToolConfig,
  webToolGrantsOf,
} from "./url-policy.js";
import { extractModel, extractUsage } from "./usage-block.js";

/** One inbound request as the proxy sees it (method, target, headers, raw body). */
export interface ProxyRequest {
  readonly method: string;
  readonly host: string;
  readonly path: string;
  /** The full URL (scheme+host+path) for the fetch log. */
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

export interface UpstreamResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

/** Forwards a validated, rewritten request to the provider. Injected, so the pipeline is network-free in tests. */
export type Forwarder = (req: {
  method: string;
  host: string;
  path: string;
  headers: Record<string, string>;
  body: string;
}) => Promise<UpstreamResponse>;

export interface ProxyResponse {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly body: string;
}

export interface HandlerDeps {
  readonly resolver: RunContextResolver;
  readonly secrets: SecretProvider;
  readonly forward: Forwarder;
  readonly usageWriter: UsageWriter;
  readonly fetchLogWriter: FetchLogWriter;
  readonly capAccountant: CapAccountant;
  readonly events: EventSink;
  readonly novelDomains?: NovelDomainTracker;
  /**
   * Per-run cumulative research-use counter (PRB.22). Shared per-process state — the default is a
   * module-level instance so the bound holds across requests even when the dep isn't threaded.
   */
  readonly researchUsage?: ResearchUsageTracker;
  readonly denialSpikes?: DenialSpikeTracker;
  readonly newId?: IdFactory;
  readonly now?: () => Date;
}

function parseJsonBody(body: string): Record<string, unknown> | undefined {
  if (!body) return undefined;
  try {
    const v = JSON.parse(body);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

function headerValue(headers: Readonly<Record<string, string>>, name: string): string | undefined {
  const target = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) if (k.toLowerCase() === target) return v;
  return undefined;
}

function jsonError(type: string, message: string): string {
  return JSON.stringify({ error: { type, message } });
}

/** The deps the pre-forward pipeline needs — everything except the (buffered) forwarder, which the caller runs. */
/**
 * The process-wide default `ResearchUsageTracker` (PRB.22). Unlike a per-request `new`, a shared default
 * preserves the cross-request bound when a host doesn't thread the dep — the proxy is the run's single
 * meter of record for its lifetime, so this state is legitimately process-scoped.
 */
const sharedResearchUsage = new ResearchUsageTracker();

export type PrepareDeps = Omit<HandlerDeps, "forward">;

/** A prepared forward: the rewritten upstream request + a `meter` closure that runs steps 8–9 over the response. */
export interface PreparedForward {
  readonly kind: "forward";
  readonly forwardReq: { method: string; host: string; path: string; headers: Record<string, string>; body: string };
  /**
   * Meter + fetch-log the served response (§12.7; steps 8–9). Takes the FULL response body (buffered by the
   * caller, or accumulated while streaming) — metering is the meter of record, so it always reads the complete
   * response, never a partial frame. Call exactly once per response.
   */
  meter(upstream: UpstreamResponse): Promise<void>;
  /**
   * RES.1 — release this request's in-flight research reservation when the forward itself fails (the meter
   * path releases too, idempotently). The caller invokes it on a `forward`/`streamForward` throw so a dead
   * upstream can't hold a budget slice hostage.
   */
  release(): void;
}

/** The outcome of the pre-forward pipeline: an early refusal to return as-is, or a prepared forward. */
export type PreparedResult = { readonly kind: "response"; readonly response: ProxyResponse } | PreparedForward;

/** Response framing headers the proxy must not pass back verbatim (the transport re-derives them). */
const RESPONSE_FRAMING_HEADERS = new Set(["transfer-encoding", "connection", "keep-alive", "content-length"]);

/** Strip the framing headers the transport re-derives (a streamed response is chunked; no content-length). */
export function stripResponseFramingHeaders(headers: Readonly<Record<string, string>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) if (!RESPONSE_FRAMING_HEADERS.has(k.toLowerCase())) out[k] = v;
  return out;
}

/**
 * Run the pre-forward pipeline (steps 1–6): credential gate → endpoint/model allowlist → cap → outbound-channel
 * limits + URL-policy rewrite. Returns EITHER an early refusal response (402/403 — never throws for policy) OR
 * a prepared forward carrying the rewritten upstream request + a `meter` closure (steps 8–9). Shared by the
 * buffered `handleProxyRequest` and the streaming `streamProxyRequest` so both paths meter identically.
 */
export async function prepareProxyRequest(req: ProxyRequest, deps: PrepareDeps): Promise<PreparedResult> {
  const newId: IdFactory = deps.newId ?? ulid;
  const nowIso = (): string => (deps.now ? deps.now() : new Date()).toISOString();
  const denialSpikes = deps.denialSpikes ?? new DenialSpikeTracker();
  const novelDomains = deps.novelDomains ?? new NovelDomainTracker();
  const researchUsage = deps.researchUsage ?? sharedResearchUsage;

  // --- 1. Credential gate: resolve the per-run context, or refuse (no run_id ⇒ no fetch_log attribution) ---
  const credential = presentedCredential(req.headers);
  const ctx: RunContext | null = credential ? await deps.resolver.resolve(credential) : null;
  if (!ctx) {
    const reason = credential ? "invalid proxy credential" : "missing proxy credential";
    await deps.events.emitEgressDenied({ host: req.host, url: req.url, status: 403, reason });
    return { kind: "response", response: { status: 403, headers: { "content-type": "application/json" }, body: jsonError("egress.denied", reason) } };
  }

  const agentId = presentedAgentId(req.headers) ?? ctx.agentId;
  const logBase: FetchLogBase = { runId: ctx.runId, attempt: ctx.attempt, agentLabel: agentId };
  const writeFetch = async (row: FetchLogRow): Promise<void> => {
    // meterOnly contexts (the est_ claim pre-pass) carry no `runs` row — fetch_log FKs to runs(id),
    // so the write would throw inside meter() and truncate a served response. Their meter of record
    // is the usage row itself.
    if (ctx.meterOnly) return;
    await deps.fetchLogWriter.write(row);
  };
  // Same FK boundary for the event sinks: run_events*/pause_signals reference runs(id). A meterOnly
  // context keeps the refusal's HTTP semantics but emits nothing run-scoped.
  const events: EventSink = ctx.meterOnly
    ? { emitEgressDenied: () => Promise.resolve(), emitPauseSignal: () => Promise.resolve() }
    : deps.events;

  // A refusal that is attributable to a run: log it, emit egress.denied, and pause on a denial spike. Returns a
  // prepared `response` (there is no upstream to forward for a refusal).
  const denyEgress = async (status: number, reason: string): Promise<PreparedResult> => {
    await writeFetch(
      buildRequestFetchLogRow({ ...logBase, ts: nowIso() }, { url: req.url, status, decision: "deny", denyReason: reason }),
    );
    await events.emitEgressDenied({
      runId: ctx.runId,
      attempt: ctx.attempt,
      agentId,
      host: req.host,
      url: req.url,
      status,
      reason,
    });
    const spike = denialSpikes.record(ctx.runId);
    if (spike.spike) {
      await events.emitPauseSignal({
        runId: ctx.runId,
        reason: "egress_denied_spike",
        detail: { count: spike.count },
      });
    }
    return { kind: "response", response: { status, headers: { "content-type": "application/json" }, body: jsonError("egress.denied", reason) } };
  };

  // --- 2. Endpoint allowlist ---
  if (!isEndpointAllowed(ctx.allowlist, req.host, req.path)) {
    return denyEgress(403, `endpoint ${req.host}${req.path} is not on the run allowlist`);
  }

  // --- 3. Model allowlist + priceability (never serve a model we cannot meter) ---
  const body = parseJsonBody(req.body);
  const model = typeof body?.["model"] === "string" ? (body["model"] as string) : undefined;
  if (model !== undefined) {
    if (!isModelAllowed(ctx.allowlist, model)) {
      return denyEgress(403, `model ${model} is not on the run allowlist`);
    }
    if (!isModelPriceable(ctx.rateTableVersion, model)) {
      return denyEgress(403, `model ${model} is not priceable under rate table v${ctx.rateTableVersion}`);
    }
  }

  // --- 4. Cap: a run already at/over cap is refused BEFORE forwarding (engine sees `budget`) ---
  const spent = await deps.capAccountant.spentCredits(ctx.runId);
  if (isOverCap(spent, ctx.capCredits)) {
    await writeFetch(
      buildRequestFetchLogRow(
        { ...logBase, ts: nowIso() },
        { url: req.url, status: 402, decision: "deny", denyReason: "cap" },
      ),
    );
    return {
      kind: "response",
      response: {
        status: 402,
        headers: { "content-type": "application/json" },
        body: jsonError("budget", `run ${ctx.runId} has reached its cap of ${ctx.capCredits} credits`),
      },
    };
  }

  // --- 5. Outbound-channel limits: ENFORCE + rewrite the outbound body (§12.8d). This pass runs over the
  //        request's server-tool blocks (which include full history) so it must be idempotent and NOT log
  //        allowed passthroughs — else a fetch would be re-logged every turn it stays in history. The fetch
  //        log's per-fetch/search rows are sourced from the RESPONSE instead (step 9). Only the terminal
  //        `suspicious_query` block writes a request-side row (it happens once — it stops the run). ---
  // P1.21 (§6.7/REQ-WF-8; §16.4's memo-confidentiality row) — a Memo run carries
  // `urlPolicy.fetchUserDataForbidden` + the `user_sources[]` domains. Search-query text is then
  // CONFIDENTIAL-adjacent: a query could quote internal figures, so every logged row carries the
  // redacted placeholder, never the raw query — zero fetch-log rows may carry user-source content.
  const userDataForbidden = ctx.urlPolicy.fetchUserDataForbidden === true;
  const userSourceDomainSet = new Set(ctx.urlPolicy.userSourceDomains ?? []);
  /**
   * A URL hits the user-source boundary when its hostname IS a frozen user-source host or sits under
   * one (`docs.internal.example.com` covers its own subpaths; `example.com` covers `a.example.com`).
   */
  const hitsUserSource = (url: string): string | undefined => {
    const host = hostnameOf(url);
    if (!host) return undefined;
    for (const d of userSourceDomainSet) {
      if (host === d || host.endsWith(`.${d}`)) return host;
    }
    return undefined;
  };
  /** The query text a fetch-log row may carry (redacted under the memo confidentiality boundary). */
  const loggableQuery = (q: string | undefined): string | undefined =>
    userDataForbidden ? "[redacted: user-source confidentiality]" : q;

  let outboundBody: unknown = body;
  const invocations = extractServerToolInvocations(body);
  for (const inv of invocations) {
    if (inv.kind === "search") {
      const check = checkSearchQuery(inv.query, ctx.draftText, SUSPICIOUS_QUERY_THRESHOLD);
      if (check.suspicious) {
        await writeFetch(
          buildServerToolFetchLogRow(
            { ...logBase, ts: nowIso() },
            { kind: "search", query: loggableQuery(inv.query), decision: "deny", denyReason: "suspicious_query" },
          ),
        );
        await events.emitPauseSignal({
          runId: ctx.runId,
          reason: "suspicious_query",
          detail: { matchLength: check.matchLength, agentId },
        });
        // Close the channel immediately; the orchestrator (P0.08) reacts to the pause signal.
        return {
          kind: "response",
          response: {
            status: 403,
            headers: { "content-type": "application/json" },
            body: jsonError("suspicious_query", `search query shares ${check.matchLength} consecutive draft words`),
          },
        };
      }
    } else {
      // fetch: strip an over-long query string, then apply the novel-domain cap — rewrite the outbound body
      // to neutralize; no per-fetch log row here (the tracker dedups domains, so re-processing history is safe).
      const guard = guardWebFetchUrl(inv.url);
      let effectiveUrl = inv.url;
      if (guard.action === "stripped") {
        effectiveUrl = guard.url;
        outboundBody = rewriteFetchUrl(outboundBody, inv.path, guard.url);
      } else if (guard.action === "refused") {
        outboundBody = rewriteFetchUrl(outboundBody, inv.path, "");
        continue;
      }
      const domain = registrableDomainOf(effectiveUrl);
      // P1.21 — a fetch to one of the run's `user_sources[]` domains is a `web_fetch_of_user_data`
      // violation: hard-deny the request BEFORE forwarding (a `user_source` deny row — URL only, the
      // source's bytes never enter the log), pause the run like the other exfiltration guards. The
      // injected `blocked_domains` is the second layer, not the enforcement of record.
      const userSourceHost = hitsUserSource(effectiveUrl);
      if (userSourceHost) {
        await writeFetch(
          buildServerToolFetchLogRow(
            { ...logBase, ts: nowIso() },
            { kind: "fetch", url: effectiveUrl, decision: "deny", denyReason: "user_source" },
          ),
        );
        await events.emitPauseSignal({
          runId: ctx.runId,
          reason: "user_source_fetch",
          detail: { domain: userSourceHost, agentId },
        });
        return {
          kind: "response",
          response: {
            status: 403,
            headers: { "content-type": "application/json" },
            body: jsonError("user_source", `web_fetch of user-supplied data is forbidden for this run (${userSourceHost})`),
          },
        };
      }
      if (domain) {
        const admit = novelDomains.admit(ctx.runId, domain, ctx.knownDomains, ctx.novelDomainCap);
        if (!admit.admitted) outboundBody = rewriteFetchUrl(outboundBody, inv.path, "");
      }
    }
  }

  // --- 6. Server web tools + URL policy (§12.6; P0.15i; PRB.22 research bound). GUARANTEE the run's server
  //        web_search tool is in the request (the vendored CLI does not reliably add it — P0.15h
  //        `searches=0`), then scope every server web tool to the run's allowed/blocked domains. The
  //        research bound rides here too: committed use is the max of THIS request's EXECUTED history
  //        (result-bearing `server_tool_use`/`web_*_tool_result` blocks persist in `messages[]`; RES.1 —
  //        a bare call block is not an execution) and the tracker's metered-response totals (covers
  //        input-scoped subagents whose history the main request never carries); the run's live
  //        reservations sit on top, so `ensureServerWebTools` shrinks `max_uses` to the remainder and
  //        drops the tool at zero — and a non-research-phase request sees the remainder NET of the
  //        research floor (REQ-SPEC-31(2)). The search RESULT urls land in the fetch log at step 9, so
  //        `cited⇒fetched` has real provenance. ---
  const isMessagesCreate = req.method.toUpperCase() === "POST" && req.path.replace(/\?.*$/, "").endsWith("/v1/messages");
  // RES.1 — EXECUTED-only history: a flat `tool_use`/`server_tool_use` block in `messages[]` is the
  // model's CALL, not proof the provider ran anything (the request-content contract the incident
  // exploited). Only `server_tool_use` inside a RESULT-bearing message (the provider-written turn the
  // client echoes back) and `web_*_tool_result` blocks count — `extractExecutedServerToolUses`.
  const historyUse = extractExecutedServerToolUses(body);
  const meteredUse = researchUsage.usage(ctx.runId);
  const committed = {
    searches: Math.max(historyUse.searches, meteredUse.searches),
    fetches: Math.max(historyUse.fetches, meteredUse.fetches),
  };
  // RES.1 — the research floor (REQ-SPEC-31(2)): only a request stamped `research` by the harness
  // (`x-rhema-phase-class`, which the agent cannot set) may draw the floor share; `preflight` bypasses
  // the bound entirely (its probe declares `max_uses: 1`) so a budget-exhausted resume still re-preflights.
  const phaseClass = presentedPhaseClass(req.headers);
  const preflight = phaseClass === "preflight";
  const floorEligible = phaseClass === "research";
  let reservation: ResearchReservation | undefined;
  let ensured: { body: unknown; added: boolean };
  if (isMessagesCreate) {
    // Committed + the live in-flight grants is the bound — serialized here, per-request, so N parallel
    // requests cannot each be granted the same remaining slice before any of them meters.
    const inflight = researchUsage.inflight(ctx.runId);
    const used = preflight
      ? { searches: 0, fetches: 0 }
      : { searches: committed.searches + inflight.searches, fetches: committed.fetches + inflight.fetches };
    ensured = ensureServerWebTools(outboundBody, resolveServerWebToolConfig(ctx.webTools), used, {
      floorEligible,
      bypassBudget: preflight,
    });
    // The grant this request received becomes a reservation — released inside `meter` when the response's
    // real usage lands (or by the caller on a forward failure). Idempotent.
    reservation = researchUsage.reserve(ctx.runId, webToolGrantsOf(ensured.body));
  } else {
    ensured = { body: outboundBody, added: false };
  }
  const injected = injectUrlPolicyIntoBody(ensured.body, ctx.urlPolicy);
  const finalBody =
    injected.rewritten || ensured.added || outboundBody !== body ? JSON.stringify(injected.body) : req.body;

  // --- 7. Prepare the forward with the provider key; the sandbox's own auth is stripped (AC5). The caller runs
  //        it (buffered or streaming); the `meter` closure below folds steps 8–9 over the COMPLETE response. ---
  const forwardReq = {
    method: req.method,
    host: req.host,
    path: req.path,
    headers: buildUpstreamHeaders(req.headers, deps.secrets.anthropicApiKey()),
    body: finalBody,
  };

  const meter = async (upstream: UpstreamResponse): Promise<void> => {
   try {
    // --- 8. Meter every served response's usage into the rows of record (§12.7) ---
    if (upstream.status >= 200 && upstream.status < 300) {
      const contentType = headerValue(upstream.headers, "content-type");
      const usage = extractUsage(upstream.body, contentType);
      if (usage) {
        // The response's model is authoritative (what was billed); fall back to the request's. Never a silent
        // default — an un-nameable model throws rather than mis-metering (I2).
        const meterModel = extractModel(upstream.body, contentType) ?? model;
        if (!meterModel) {
          throw new Error(
            `metered response for run ${ctx.runId} carries usage but no model — refusing to meter silently (REQ-SPEC-11)`,
          );
        }
        const metered = meterResponse({
          ctx,
          usage,
          model: meterModel,
          agentId,
          id: newId(),
          ts: nowIso(),
          // RPT.1 (§14.5 Level 4) — the harness-stamped step key (`x-rhema-step`, agent-forge-proof via
          // the credential injector) attributes this metered burn to the phase that made it.
          stepId: presentedStep(req.headers),
          // the provider's per-request id — the usage.reconcile join key (REQ-BILL-13).
          providerRequestId: headerValue(upstream.headers, "request-id") ?? null,
        });
        await deps.usageWriter.write(metered.row);
        await deps.capAccountant.record(ctx.runId, metered.platformCredits);
      }
      // The fetch log of record's per-fetch/search rows: THIS turn's real server-tool activity, from the
      // response (logged once — the source for source cards and cited ⇒ fetched, REQ-DATA-16). The SSE path
      // reads the accumulated stream body (D-P0.07-5), so streaming + buffered fold identical rows.
      const serverTools = isSseBody(upstream.body, contentType)
        ? extractResponseServerToolsSse(upstream.body) // streaming response (D-P0.07-5)
        : extractResponseServerTools(upstream.body); // buffered JSON response
      // PRB.22: feed the per-run research bound. The metered `server_tool_use` counts are authoritative
      // (they're what the provider billed); block-level fetch activity also counts search-result urls,
      // so it is not a per-invocation count — usage only.
      // RES.1 — a preflight probe bypasses the bound at ADMISSION (bypassBudget); it must not consume it
      // at settlement either. The probe's whole job is proving the tools reach the model before paid
      // research runs — charging its executions against the envelope shrinks the very share it verifies
      // (the first live probe spent 2 of 8 searches + 2 of 16 fetches on preflight alone). The usage row
      // still meters above (billing truth); only the bound-tracker skips the probe.
      if (!preflight) {
        researchUsage.record(ctx.runId, {
          fetches: usage?.webFetchRequests ?? 0,
          searches: usage?.webSearchRequests ?? 0,
        });
      }
      for (const act of serverTools) {
        await writeFetch(
          act.kind === "search"
            ? buildServerToolFetchLogRow({ ...logBase, ts: nowIso() }, { kind: "search", query: loggableQuery(act.query), decision: "allow" })
            : buildServerToolFetchLogRow({ ...logBase, ts: nowIso() }, { kind: "fetch", url: act.url, ...(act.bytes !== undefined ? { bytes: act.bytes } : {}), decision: "allow" }),
        );
      }
    }
    // --- 9. Log the served request (never the body) ---
    await writeFetch(
      buildRequestFetchLogRow(
        { ...logBase, ts: nowIso() },
        { url: req.url, status: upstream.status, bytes: Buffer.byteLength(upstream.body), decision: "allow" },
      ),
    );
   } finally {
    // RES.1 — the grant is now either metered (2xx) or unreachable (non-2xx/meter throw); either way the
    // reservation hands its slice back so a later request isn't starved by an abandoned grant.
    reservation?.release();
   }
  };

  const release = (): void => {
    reservation?.release();
  };

  return { kind: "forward", forwardReq, meter, release };
}

/**
 * Handle one proxied request end-to-end (the BUFFERED path). Runs the pre-forward pipeline, forwards (the
 * injected `forward` buffers the whole response), meters, and returns the response to send back to the sandbox.
 * Never throws for a policy refusal (it returns 402/403); it throws only on an internal invariant breach.
 */
export async function handleProxyRequest(req: ProxyRequest, deps: HandlerDeps): Promise<ProxyResponse> {
  const prep = await prepareProxyRequest(req, deps);
  if (prep.kind === "response") return prep.response;
  let upstream: UpstreamResponse;
  try {
    upstream = await deps.forward(prep.forwardReq);
  } catch (e) {
    prep.release(); // RES.1 — a dead upstream must not hold the reservation slice
    throw e;
  }
  await prep.meter(upstream);
  return { status: upstream.status, headers: { ...upstream.headers }, body: upstream.body };
}

// ---------------------------------------------------------------- streaming path (D-P0.07-5) ----------------

/** An upstream response whose body is delivered incrementally (undici's Readable satisfies `AsyncIterable`). */
export interface StreamingUpstreamResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: AsyncIterable<Uint8Array>;
}

/** Forwards a prepared request and returns the upstream response as a byte stream (injected; network-free tests). */
export type StreamingForwarder = (req: {
  method: string;
  host: string;
  path: string;
  headers: Record<string, string>;
  body: string;
}) => Promise<StreamingUpstreamResponse>;

/** A minimal streamed-response sink the handler writes to incrementally (a Node `ServerResponse` satisfies it). */
export interface ResponseSink {
  writeHead(status: number, headers: Record<string, string>): void;
  write(chunk: Uint8Array): void;
  end(): void;
}

export interface StreamingHandlerDeps extends PrepareDeps {
  readonly streamForward: StreamingForwarder;
}

/**
 * Handle one proxied request the STREAMING way (D-P0.07-5): run the pre-forward pipeline, then forward and pipe
 * the upstream bytes to `sink` AS THEY ARRIVE — so the Agent SDK sees each SSE frame incrementally instead of
 * waiting for the whole buffered response (the P0.15e suspect for the agent→proxy hang). The full response is
 * accumulated in parallel and metered ONCE over the complete body. An early policy refusal (there is no
 * upstream to stream) is written whole.
 *
 * Ordering invariant (DEF.3 / STB.3 F10): the TERMINAL upstream chunk is withheld until the usage record
 * commits — a client that observes end-of-stream is always already on the meter. §12.4's residual overrun
 * bound is one in-flight request; before this fix the whole response (including the usage-bearing tail)
 * could be consumed while the meter write was still in flight — and a meter refusal would have silently
 * delivered a complete-but-unmetered response (an I2 breach). A meter throw now truncates the stream
 * instead: the client sees a broken response, never an unmetered success.
 */
export async function streamProxyRequest(req: ProxyRequest, deps: StreamingHandlerDeps, sink: ResponseSink): Promise<void> {
  const prep = await prepareProxyRequest(req, deps);
  if (prep.kind === "response") {
    sink.writeHead(prep.response.status, prep.response.headers);
    if (prep.response.body) sink.write(Buffer.from(prep.response.body, "utf8"));
    sink.end();
    return;
  }

  let upstream: StreamingUpstreamResponse;
  try {
    upstream = await deps.streamForward(prep.forwardReq);
  } catch (e) {
    prep.release(); // RES.1 — a dead upstream must not hold the reservation slice
    throw e;
  }
  sink.writeHead(upstream.status, stripResponseFramingHeaders(upstream.headers));

  const chunks: Buffer[] = [];
  let last: Buffer | undefined;
  try {
    for await (const chunk of upstream.body) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      chunks.push(buf);
      if (last !== undefined) sink.write(last); // incremental delivery — every frame but the terminal one
      last = buf;
    }
  } catch (e) {
    prep.release(); // RES.1 — a truncated upstream must not hold the reservation slice
    throw e;
  }

  // Meter over the COMPLETE accumulated body BEFORE the final bytes leave (§12.7; I2). A throw here
  // propagates — the shell closes the socket mid-stream (truncated response) rather than serving
  // a complete-but-unmetered one.
  await prep.meter({ status: upstream.status, headers: upstream.headers, body: Buffer.concat(chunks).toString("utf8") });

  // Meter committed: release the withheld tail and close — stream end now implies the meter of record.
  if (last !== undefined) sink.write(last);
  sink.end();
}
