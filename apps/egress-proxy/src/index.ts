// @rhema/egress-proxy — the only route out of the sandbox subnet (REQ-SPEC-11, REQ-ARCH-31 amended; §12.7).
//
// A TypeScript forward proxy (undici) that is, for every run: the usage METER OF RECORD (`usage_records
// {source:'proxy'}`), the run cap's ENFORCER (402 at cap), the FETCH LOG of record (`fetch_log`), and the
// credential gate that presents the direct Anthropic API key ONLY for a valid per-run credential bound to the
// run's orchestrator-issued allowlist. It rewrites server-tool bodies for the run's URL policy and the §12.8d
// outbound-channel limits. It is outside the sandbox's reach: nothing a request carries can alter metering,
// the cap, or the log. Credential MINTING + allowlist authoring are P0.08; this ticket validates and consumes.
//
// The pipeline (`handleProxyRequest`) is pure of the network — the forward step is injected — so the whole
// flow is deterministically tested in-process. `createProxyServer` is the live shell; its DB-backed resolver,
// Secret Manager key source, and network bind are live wiring gated on a GCP deploy (DEFERRALS P0.07).

export const PACKAGE_NAME = "@rhema/egress-proxy" as const;

export * from "./rates.js";
export * from "./usage-block.js";
export * from "./context.js";
export * from "./credential.js";
export * from "./url-policy.js";
export * from "./domains.js";
export * from "./ngram.js";
export * from "./outbound-limits.js";
export * from "./metering.js";
export * from "./fetch-log.js";
export * from "./cap.js";
export * from "./sinks.js";
export * from "./signals.js";
export * from "./ids.js";
export * from "./handler.js";
export * from "./server.js";

/** Marker export retained for the build graph / provenance job. */
export function packageInfo(): { name: string } {
  return { name: PACKAGE_NAME };
}
