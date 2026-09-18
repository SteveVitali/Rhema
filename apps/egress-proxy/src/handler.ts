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
} from "./credential.js";
import {
  buildRequestFetchLogRow,
  buildServerToolFetchLogRow,
  type FetchLogBase,
  type FetchLogRow,
} from "./fetch-log.js";
import { ulid, type IdFactory } from "./ids.js";
import { meterResponse } from "./metering.js";
import { registrableDomainOf } from "./domains.js";
import {
  extractResponseServerTools,
  extractResponseServerToolsSse,
  extractServerToolInvocations,
  guardWebFetchUrl,
  NovelDomainTracker,
  rewriteFetchUrl,
} from "./outbound-limits.js";
import { isSseBody } from "./usage-block.js";
import { checkSearchQuery, SUSPICIOUS_QUERY_THRESHOLD } from "./ngram.js";
import { isModelPriceable } from "./rates.js";
import type { FetchLogWriter, SecretProvider, UsageWriter } from "./sinks.js";
import { DenialSpikeTracker, type EventSink } from "./signals.js";
import { ensureServerWebTools, injectUrlPolicyIntoBody, resolveServerWebToolConfig } from "./url-policy.js";
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
    await deps.fetchLogWriter.write(row);
  };

  // A refusal that is attributable to a run: log it, emit egress.denied, and pause on a denial spike. Returns a
  // prepared `response` (there is no upstream to forward for a refusal).
  const denyEgress = async (status: number, reason: string): Promise<PreparedResult> => {
    await writeFetch(
      buildRequestFetchLogRow({ ...logBase, ts: nowIso() }, { url: req.url, status, decision: "deny", denyReason: reason }),
    );
    await deps.events.emitEgressDenied({
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
      await deps.events.emitPauseSignal({
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
  let outboundBody: unknown = body;
  const invocations = extractServerToolInvocations(body);
  for (const inv of invocations) {
    if (inv.kind === "search") {
      const check = checkSearchQuery(inv.query, ctx.draftText, SUSPICIOUS_QUERY_THRESHOLD);
      if (check.suspicious) {
        await writeFetch(
          buildServerToolFetchLogRow(
            { ...logBase, ts: nowIso() },
            { kind: "search", query: inv.query, decision: "deny", denyReason: "suspicious_query" },
          ),
        );
        await deps.events.emitPauseSignal({
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
      if (domain) {
        const admit = novelDomains.admit(ctx.runId, domain, ctx.knownDomains, ctx.novelDomainCap);
        if (!admit.admitted) outboundBody = rewriteFetchUrl(outboundBody, inv.path, "");
      }
    }
  }

  // --- 6. Server web tools + URL policy (§12.6; P0.15i). GUARANTEE the run's server web_search tool is in the
  //        request (the vendored CLI does not reliably add it — P0.15h `searches=0`; web_fetch is off by default,
  //        see `WebToolPolicy.fetch`), then scope every server web tool to the run's allowed/blocked domains.
  //        Injection is limited to a Messages create request; a run tunes it via `ctx.webTools`. The search
  //        RESULT urls land in the fetch log at step 9, so `cited⇒fetched` has real provenance. ---
  const isMessagesCreate = req.method.toUpperCase() === "POST" && req.path.replace(/\?.*$/, "").endsWith("/v1/messages");
  const ensured = isMessagesCreate
    ? ensureServerWebTools(outboundBody, resolveServerWebToolConfig(ctx.webTools))
    : { body: outboundBody, added: false };
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
      for (const act of serverTools) {
        await writeFetch(
          act.kind === "search"
            ? buildServerToolFetchLogRow({ ...logBase, ts: nowIso() }, { kind: "search", query: act.query, decision: "allow" })
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
  };

  return { kind: "forward", forwardReq, meter };
}

/**
 * Handle one proxied request end-to-end (the BUFFERED path). Runs the pre-forward pipeline, forwards (the
 * injected `forward` buffers the whole response), meters, and returns the response to send back to the sandbox.
 * Never throws for a policy refusal (it returns 402/403); it throws only on an internal invariant breach.
 */
export async function handleProxyRequest(req: ProxyRequest, deps: HandlerDeps): Promise<ProxyResponse> {
  const prep = await prepareProxyRequest(req, deps);
  if (prep.kind === "response") return prep.response;
  const upstream = await deps.forward(prep.forwardReq);
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
 * accumulated in parallel and metered ONCE after the stream ends (metering never blocks delivery; the proxy
 * stays the meter of record). An early policy refusal (there is no upstream to stream) is written whole.
 */
export async function streamProxyRequest(req: ProxyRequest, deps: StreamingHandlerDeps, sink: ResponseSink): Promise<void> {
  const prep = await prepareProxyRequest(req, deps);
  if (prep.kind === "response") {
    sink.writeHead(prep.response.status, prep.response.headers);
    if (prep.response.body) sink.write(Buffer.from(prep.response.body, "utf8"));
    sink.end();
    return;
  }

  const upstream = await deps.streamForward(prep.forwardReq);
  sink.writeHead(upstream.status, stripResponseFramingHeaders(upstream.headers));

  const chunks: Buffer[] = [];
  for await (const chunk of upstream.body) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    chunks.push(buf);
    sink.write(buf); // incremental delivery — the SDK gets each frame as it streams in
  }
  sink.end();

  // meter over the COMPLETE accumulated body, after the client already has the stream (§12.7; I2).
  await prep.meter({ status: upstream.status, headers: upstream.headers, body: Buffer.concat(chunks).toString("utf8") });
}
