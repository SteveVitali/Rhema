import { randomBytes } from "node:crypto";
import { evaluateUrl } from "@rhema/hooks";
import type { UrlPolicy } from "@rhema/hooks";
import { fetchGuarded, type FetchGuardDeps, type FetchGuardOptions } from "./fetch-guarded.js";

// The client-side `fetcher` tool path (§12.8(a); REQ-SPEC-25(a)). At Full board every Editor fetch routes
// through this: the per-run URL policy (hold-outs / blocked domains / user exclusions) is applied FIRST via
// the boundary hook's `evaluateUrl({ viaFetcher: true })`, then the SSRF + size/redirect guards, then the page
// is returned WRAPPED as untrusted so downstream prompts treat it as data, never instructions (control (b)).

/**
 * Wrap fetched content so the model reads it as untrusted data (§12.8(b)). A per-fetch random nonce is baked
 * into the boundary tags and any literal occurrence of the closing token in the content is neutralized, so a
 * hostile page cannot emit `</document>` to break out of the wrapper and smuggle instructions.
 */
export function wrapUntrusted(sourceUrl: string, content: string, nonceGen: () => string = defaultNonce): string {
  const safeUrl = sourceUrl.replace(/"/g, "%22");
  const nonce = nonceGen();
  const close = `</untrusted:${nonce}>`;
  // defang the closing token (and generic </untrusted) so the content cannot forge the boundary.
  const safe = content.replace(/<\/untrusted/gi, "<​/untrusted");
  return `<untrusted:${nonce} trust="untrusted" src="${safeUrl}">\n${safe}\n${close}`;
}

function defaultNonce(): string {
  return randomBytes(9).toString("base64url");
}

export type FetcherToolResult =
  | { readonly ok: true; readonly content: string; readonly finalUrl: string; readonly contentType: string }
  | { readonly ok: false; readonly denyReason: string; readonly reason: string };

export interface FetcherToolDeps extends FetchGuardDeps {
  /** Decode fetched bytes to text for wrapping (the fetcher itself parses nothing; this is a lossless decode). */
  readonly decode?: (bytes: Uint8Array, contentType: string) => string;
}

/**
 * Fetch a URL for a run through the fetcher tool: policy check → SSRF/guard → untrusted-wrapped text.
 * `isCalibrator` threads the holdout-calibrator exception through to `evaluateUrl`.
 */
export async function fetchViaFetcher(
  url: string,
  policy: UrlPolicy,
  deps: FetcherToolDeps,
  opts: FetchGuardOptions & { isCalibrator?: boolean } = {},
): Promise<FetcherToolResult> {
  const decision = evaluateUrl(url, policy, { viaFetcher: true, isCalibrator: opts.isCalibrator });
  if (decision.decision === "deny") {
    return { ok: false, denyReason: decision.denyReason ?? "policy", reason: decision.reason ?? "URL policy denied" };
  }
  const res = await fetchGuarded(url, deps, opts);
  if (!res.ok) {
    return { ok: false, denyReason: res.denyReason, reason: res.reason };
  }
  const decode = deps.decode ?? ((b) => new TextDecoder("utf-8").decode(b));
  const text = decode(res.bytes, res.contentType);
  return { ok: true, content: wrapUntrusted(res.finalUrl, text), finalUrl: res.finalUrl, contentType: res.contentType };
}
