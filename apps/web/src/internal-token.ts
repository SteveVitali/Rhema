// SEC.2 (ADR-040) — the web runtime SA's OIDC ID-token minter for the trusted client-IP channel.
//
// The token is minted ambiently from the Cloud Run metadata server (`audience` = the api origin) —
// NO secret reaches web (REQ-ARCH-30). Three cache postures keep the mint off the hot path and keep
// a metadata outage from costing a per-request round-trip:
//   * hit:  cached to `exp − 60s` (tokens live ~1h; a ~10min renewal margin), or a 50min fallback
//           when the exp claim can't be read;
//   * miss: negative-cached 60s (local dev — no metadata server — must not pay a DNS/connect failure
//           per request);
//   * fetch itself is bounded by a 2s timeout so a hung metadata path never stalls a user request.
// A failure resolves `null` — never throws: the api's penultimate-XFF rule is the (weaker) fallback.

/** GCE/Cloud Run metadata OIDC identity endpoint (`audience` = the token's target). */
export const GCE_METADATA_IDENTITY_URL =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity";

const POSITIVE_FALLBACK_MS = 50 * 60_000;
const EXP_SKEW_MS = 60_000;
const NEGATIVE_TTL_MS = 60_000;
const MINT_TIMEOUT_MS = 2_000;

export interface InternalTokenMinterOptions {
  /** The audience the api verifies (`INTERNAL_AUTH_AUDIENCE`). Unset ⇒ always `null` (local dev). */
  readonly audience?: string;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => number;
  /** Mint fetch bound (default 2s) — a hung metadata path never stalls a user request. */
  readonly timeoutMs?: number;
}

/** `exp` claim of a JWT without verifying it — cache timing only; the api verifies the signature. */
function tokenExpMs(token: string): number | undefined {
  try {
    const payload = token.split(".")[1];
    if (!payload) return undefined;
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      exp?: unknown;
    };
    return typeof claims.exp === "number" ? claims.exp * 1000 : undefined;
  } catch {
    return undefined;
  }
}

/** Build `() => Promise<string | null>` — a token for `audience`, or `null` when unmintable. */
export function createInternalTokenMinter(
  opts: InternalTokenMinterOptions,
): () => Promise<string | null> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const now = opts.now ?? Date.now;
  const timeoutMs = opts.timeoutMs ?? MINT_TIMEOUT_MS;
  const audience = opts.audience?.replace(/\/+$/, "");
  let positive: { token: string; until: number } | null = null;
  let negativeUntil = 0;

  return async (): Promise<string | null> => {
    if (!audience) return null;
    if (positive && now() < positive.until) return positive.token;
    if (now() < negativeUntil) return null;
    try {
      const res = await fetchImpl(
        `${GCE_METADATA_IDENTITY_URL}?audience=${encodeURIComponent(audience)}&format=full`,
        {
          headers: { "Metadata-Flavor": "Google" },
          signal: AbortSignal.timeout(timeoutMs),
        },
      );
      const token = res.ok ? (await res.text()).trim() : "";
      if (!token) {
        negativeUntil = now() + NEGATIVE_TTL_MS;
        return null;
      }
      const exp = tokenExpMs(token);
      positive = {
        token,
        until: exp !== undefined ? exp - EXP_SKEW_MS : now() + POSITIVE_FALLBACK_MS,
      };
      return token;
    } catch {
      negativeUntil = now() + NEGATIVE_TTL_MS;
      return null; // no metadata server / timeout ⇒ no stamp; never fail the request over it
    }
  };
}
