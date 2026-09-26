// @rhema/fetcher — the network-only link-read service (§12.1, §13.3). SSRF-guarded, parses nothing (the F41
// split: fetcher fetches, convert parses). Exposes the guard + the client-side fetcher tool path (§12.8a).

export const PACKAGE_NAME = "@rhema/fetcher" as const;

export { isBlockedIp, assertPublicHost } from "./ssrf.js";
export type { DnsResolver, HostCheck } from "./ssrf.js";
export {
  fetchGuarded,
  MAX_BYTES,
  TIMEOUT_MS,
  MAX_REDIRECTS,
  USER_AGENT,
  DEFAULT_CONTENT_TYPE_ALLOWLIST,
} from "./fetch-guarded.js";
export type { Forwarder, ForwardResponse, FetchGuardDeps, FetchGuardOptions, FetchGuardResult } from "./fetch-guarded.js";
export { fetchViaFetcher, wrapUntrusted } from "./tool.js";
export type { FetcherToolResult, FetcherToolDeps } from "./tool.js";
export { parseRobots, robotsAllows } from "./robots.js";
export type { RobotsRules } from "./robots.js";
export { HostRateLimiter } from "./rate-limit.js";
export { createFetcherApp } from "./server.js";
export type { FetcherDeps } from "./server.js";
export { undiciForwarder, dnsResolver } from "./undici-forwarder.js";
