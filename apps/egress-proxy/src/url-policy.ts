// @rhema/egress-proxy — inject the run's URL policy into server-tool request bodies (§12.6 URL layer).
//
// Anthropic's server tools filter by DOMAIN via `allowed_domains` / `blocked_domains` on the tool definition.
// The proxy rewrites every `/v1/messages` body so the run's policy is enforced regardless of what the sandbox
// put there: hold-out / excluded / paywalled domains become `blocked_domains`; the calibrator's narrowing
// becomes `allowed_domains`. The API forbids setting BOTH on one tool, so a run with an allow-list wins and
// its block-list is dropped for that tool. This DUPLICATES the hook's URL layer on purpose (defense in depth).

import type { ProxyUrlPolicy } from "./context.js";

/** A tool definition is a server web tool when its name or type names web_search / web_fetch. */
function isServerWebTool(tool: unknown): tool is Record<string, unknown> {
  if (!tool || typeof tool !== "object") return false;
  const t = tool as { name?: unknown; type?: unknown };
  const tag = `${typeof t.name === "string" ? t.name : ""} ${typeof t.type === "string" ? t.type : ""}`;
  return tag.includes("web_search") || tag.includes("web_fetch");
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function union(a: readonly string[], b: readonly string[]): string[] {
  return [...new Set([...a, ...b])];
}

/**
 * Rewrite each server web tool in `body.tools` to carry the run's domain policy. Returns a NEW body (the input
 * is not mutated) and whether anything changed. A run with `allowedDomains` narrows to that list (blocked
 * dropped, per the API's mutual-exclusivity rule); otherwise the run's blocked domains are unioned onto the
 * tool's own. When the policy has neither list, the body is returned unchanged.
 */
export function injectUrlPolicyIntoBody(
  body: unknown,
  policy: ProxyUrlPolicy,
): { body: unknown; rewritten: boolean } {
  const hasAllow = (policy.allowedDomains?.length ?? 0) > 0;
  const hasBlock = policy.blockedDomains.length > 0;
  if (!hasAllow && !hasBlock) return { body, rewritten: false };
  if (!body || typeof body !== "object") return { body, rewritten: false };

  const clone = JSON.parse(JSON.stringify(body)) as { tools?: unknown };
  if (!Array.isArray(clone.tools)) return { body, rewritten: false };

  let rewritten = false;
  clone.tools = clone.tools.map((tool) => {
    if (!isServerWebTool(tool)) return tool;
    const t = tool as Record<string, unknown>;
    if (hasAllow) {
      rewritten = true;
      const next = { ...t, allowed_domains: [...(policy.allowedDomains ?? [])] };
      delete (next as Record<string, unknown>)["blocked_domains"];
      return next;
    }
    // block-list mode: union onto whatever the sandbox set, and drop any allow-list (API forbids both).
    rewritten = true;
    const merged = union(asStringArray(t["blocked_domains"]), policy.blockedDomains);
    const next = { ...t, blocked_domains: merged };
    delete (next as Record<string, unknown>)["allowed_domains"];
    return next;
  });

  return rewritten ? { body: clone, rewritten } : { body, rewritten: false };
}
