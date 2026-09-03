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
  extractServerToolInvocations,
  guardWebFetchUrl,
  NovelDomainTracker,
  rewriteFetchUrl,
} from "./outbound-limits.js";
import { checkSearchQuery, SUSPICIOUS_QUERY_THRESHOLD } from "./ngram.js";
import { isModelPriceable } from "./rates.js";
import type { FetchLogWriter, SecretProvider, UsageWriter } from "./sinks.js";
import { DenialSpikeTracker, type EventSink } from "./signals.js";
import { injectUrlPolicyIntoBody } from "./url-policy.js";
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

/**
 * Handle one proxied request end-to-end. Returns the response to send back to the sandbox. Never throws for a
 * policy refusal (it returns 402/403); it throws only on an internal invariant breach (e.g. an unpriceable
 * model that slipped the up-front guard) rather than serving unmetered.
 */
export async function handleProxyRequest(req: ProxyRequest, deps: HandlerDeps): Promise<ProxyResponse> {
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
    return { status: 403, headers: { "content-type": "application/json" }, body: jsonError("egress.denied", reason) };
  }

  const agentId = presentedAgentId(req.headers) ?? ctx.agentId;
  const logBase: FetchLogBase = { runId: ctx.runId, attempt: ctx.attempt, agentLabel: agentId };
  const writeFetch = async (row: FetchLogRow): Promise<void> => {
    await deps.fetchLogWriter.write(row);
  };

  // A refusal that is attributable to a run: log it, emit egress.denied, and pause on a denial spike.
  const denyEgress = async (status: number, reason: string): Promise<ProxyResponse> => {
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
    return { status, headers: { "content-type": "application/json" }, body: jsonError("egress.denied", reason) };
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
      status: 402,
      headers: { "content-type": "application/json" },
      body: jsonError("budget", `run ${ctx.runId} has reached its cap of ${ctx.capCredits} credits`),
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
          status: 403,
          headers: { "content-type": "application/json" },
          body: jsonError("suspicious_query", `search query shares ${check.matchLength} consecutive draft words`),
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

  // --- 6. URL policy: inject allowed/blocked_domains into server-tool bodies (§12.6) ---
  const injected = injectUrlPolicyIntoBody(outboundBody, ctx.urlPolicy);
  const finalBody =
    injected.rewritten || outboundBody !== body ? JSON.stringify(injected.body) : req.body;

  // --- 7. Forward with the provider key; the sandbox's own auth is stripped (AC5) ---
  const upstream = await deps.forward({
    method: req.method,
    host: req.host,
    path: req.path,
    headers: buildUpstreamHeaders(req.headers, deps.secrets.anthropicApiKey()),
    body: finalBody,
  });

  // --- 8. Meter every served response's usage into the rows of record (§12.7) ---
  if (upstream.status >= 200 && upstream.status < 300) {
    const contentType = headerValue(upstream.headers, "content-type");
    const usage = extractUsage(upstream.body, contentType);
    if (usage) {
      // The response's model is authoritative (what was billed); fall back to the request's. Never a silent
      // default — an un-nameable model throws in meterResponse rather than mis-metering (I2).
      const meterModel = extractModel(upstream.body, contentType) ?? model;
      if (!meterModel) {
        throw new Error(
          `metered response for run ${ctx.runId} carries usage but no model — refusing to meter silently (REQ-SPEC-11)`,
        );
      }
      const metered = meterResponse({ ctx, usage, model: meterModel, agentId, id: newId(), ts: nowIso() });
      await deps.usageWriter.write(metered.row);
      await deps.capAccountant.record(ctx.runId, metered.platformCredits);
    }
    // The fetch log of record's per-fetch/search rows: THIS turn's real server-tool activity, from the
    // response (logged once — the source for source cards and cited ⇒ fetched, REQ-DATA-16).
    for (const act of extractResponseServerTools(upstream.body)) {
      await writeFetch(
        act.kind === "search"
          ? buildServerToolFetchLogRow({ ...logBase, ts: nowIso() }, { kind: "search", query: act.query, decision: "allow" })
          : buildServerToolFetchLogRow({ ...logBase, ts: nowIso() }, { kind: "fetch", url: act.url, decision: "allow" }),
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

  return { status: upstream.status, headers: { ...upstream.headers }, body: upstream.body };
}
