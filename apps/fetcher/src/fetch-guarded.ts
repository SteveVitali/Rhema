import { assertPublicHost, type DnsResolver } from "./ssrf.js";

// The guarded fetch (§13.3; REQ-INGEST-12). http(s) only; every redirect hop re-resolved and re-checked
// (rebind-proof); ≤5 redirects; 25 MB / 20 s caps; content-type allowlist; honest user-agent. It PARSES
// NOTHING — it returns raw bytes + metadata (the F41 split: fetcher fetches, convert parses).

export const MAX_BYTES = 25 * 1024 * 1024; // 25 MB
export const TIMEOUT_MS = 20_000; // 20 s
export const MAX_REDIRECTS = 5;
export const USER_AGENT = "RhemaBot/1.0 (+https://rhema.tools/bot)";

/** The content types the fetcher will return (an allowlist; everything else is refused before download). */
export const DEFAULT_CONTENT_TYPE_ALLOWLIST = [
  "text/html",
  "text/plain",
  "text/markdown",
  "application/xhtml+xml",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/rtf",
  "application/epub+zip",
  "application/json",
  "application/octet-stream",
];

/** A minimal HTTP response the forwarder yields (streaming body so the size cap can abort early). */
export interface ForwardResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: AsyncIterable<Uint8Array>;
}

/** The injected outbound HTTP call (no auto-redirect). Real impl = undici; tests supply canned responses. */
export type Forwarder = (
  url: string,
  opts: {
    method: "GET";
    headers: Record<string, string>;
    signal: AbortSignal;
    /** The validated IP the guard resolved — the forwarder MUST connect to this exact address (pin), so a
     *  rebinding host cannot flip between the check and the connect (TOCTOU). TLS SNI stays the hostname. */
    pinnedIp: string;
  },
) => Promise<ForwardResponse>;

export interface FetchGuardDeps {
  readonly resolve: DnsResolver;
  readonly forward: Forwarder;
}

export interface FetchGuardOptions {
  readonly maxBytes?: number;
  readonly timeoutMs?: number;
  readonly maxRedirects?: number;
  readonly contentTypeAllowlist?: readonly string[];
  readonly userAgent?: string;
}

export type FetchGuardResult =
  | {
      readonly ok: true;
      readonly finalUrl: string;
      readonly status: number;
      readonly contentType: string;
      readonly bytes: Uint8Array;
      readonly hops: number;
    }
  | {
      readonly ok: false;
      readonly denyReason: "scheme" | "ssrf" | "redirect" | "content_type" | "too_large" | "timeout" | "status" | "error";
      readonly reason: string;
      readonly finalUrl: string;
    };

function baseType(contentType: string | undefined): string {
  return (contentType ?? "").split(";")[0]!.trim().toLowerCase();
}

async function drainWithCap(body: AsyncIterable<Uint8Array>, maxBytes: number): Promise<Uint8Array | null> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of body) {
    total += chunk.byteLength;
    if (total > maxBytes) return null; // over cap — abort
    chunks.push(chunk);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

/** Fetch a URL under the SSRF + size/time/redirect/content-type guards. Never follows a redirect blindly. */
export async function fetchGuarded(
  url: string,
  deps: FetchGuardDeps,
  opts: FetchGuardOptions = {},
): Promise<FetchGuardResult> {
  const maxBytes = opts.maxBytes ?? MAX_BYTES;
  const maxRedirects = opts.maxRedirects ?? MAX_REDIRECTS;
  const allowlist = opts.contentTypeAllowlist ?? DEFAULT_CONTENT_TYPE_ALLOWLIST;
  const ua = opts.userAgent ?? USER_AGENT;
  const deadline = Date.now() + (opts.timeoutMs ?? TIMEOUT_MS);

  let current = url;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    let parsed: URL;
    try {
      parsed = new URL(current);
    } catch {
      return { ok: false, denyReason: "error", reason: "invalid URL", finalUrl: current };
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { ok: false, denyReason: "scheme", reason: `scheme ${parsed.protocol} not allowed (http/https only)`, finalUrl: current };
    }

    // Re-resolve + re-check the host on EVERY hop (DNS rebinding defense), then PIN the validated IP for the
    // connect so the forwarder cannot re-resolve to a different (private) address (TOCTOU).
    const host = await assertPublicHost(parsed.hostname, deps.resolve);
    if (!host.ok || !host.ip) {
      return { ok: false, denyReason: "ssrf", reason: host.reason ?? "blocked host", finalUrl: current };
    }
    const pinnedIp = host.ip;

    // A single OVERALL deadline is shared across all hops (a 5-redirect chain cannot exceed the 20 s budget).
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      return { ok: false, denyReason: "timeout", reason: `exceeded ${opts.timeoutMs ?? TIMEOUT_MS} ms budget`, finalUrl: current };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), remaining);
    try {
      const res = await deps.forward(current, {
        method: "GET",
        headers: { "user-agent": ua, accept: "*/*", "accept-encoding": "identity" },
        signal: controller.signal,
        pinnedIp,
      });

      // Redirect: re-validate at the next hop (never follow to a private target).
      if (res.status >= 300 && res.status < 400 && res.headers["location"]) {
        if (hop >= maxRedirects) {
          return { ok: false, denyReason: "redirect", reason: `exceeded ${maxRedirects} redirects`, finalUrl: current };
        }
        try {
          current = new URL(res.headers["location"], current).toString();
        } catch {
          return { ok: false, denyReason: "error", reason: "invalid redirect location", finalUrl: current };
        }
        continue;
      }

      if (res.status < 200 || res.status >= 300) {
        return { ok: false, denyReason: "status", reason: `upstream status ${res.status}`, finalUrl: current };
      }

      const ct = baseType(res.headers["content-type"]);
      if (!allowlist.includes(ct)) {
        return { ok: false, denyReason: "content_type", reason: `content-type ${ct || "(none)"} not on the allowlist`, finalUrl: current };
      }

      // The drain is inside the try so an abort mid-body maps to `timeout`, not an uncaught throw.
      const bytes = await drainWithCap(res.body, maxBytes);
      if (bytes == null) {
        return { ok: false, denyReason: "too_large", reason: `body exceeds ${maxBytes} bytes`, finalUrl: current };
      }
      return { ok: true, finalUrl: current, status: res.status, contentType: ct, bytes, hops: hop };
    } catch (e) {
      const aborted = e instanceof Error && (e.name === "AbortError" || controller.signal.aborted);
      return {
        ok: false,
        denyReason: aborted ? "timeout" : "error",
        reason: aborted ? `exceeded ${opts.timeoutMs ?? TIMEOUT_MS} ms budget` : String((e as Error)?.message ?? e),
        finalUrl: current,
      };
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, denyReason: "redirect", reason: "redirect loop", finalUrl: current };
}
