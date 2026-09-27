// A beta-grade signup/magic-link throttle (PRB.13; REQ-BETA-19 amended 2026-09-16): a fixed-window
// counter over two independent dimensions — per source IP and per email. No captcha vendor, no risk
// scoring; the ticket's abuse control is deliberately this and only this. The clock is injected so the
// window boundary is deterministic under test.
//
// In-memory by design: the beta runs a handful of Cloud Run instances and the limiter is per-instance
// (an attacker behind N instances gets N× the window — accepted for beta; a shared store is D-PRB.13-1,
// scheduled with the prod bring-up). The limiter is fail-open on its own internals (a buggy limiter must
// not take signup down) but the ROUTES treat `allowed:false` as a hard 429.

export interface ThrottleVerdict {
  readonly allowed: boolean;
  /** Seconds until the blocking window resets (present only when not allowed). */
  readonly retryAfterSec?: number;
}

export interface IpEmailThrottle {
  /**
   * Record one attempt under (ip, email). `allowed:false` when EITHER dimension is over its limit for the
   * current window; `retryAfterSec` is the time until the blocking window resets. Every attempt counts —
   * blocked attempts do not extend the window (fixed windows reset on schedule, not on last-hit).
   */
  attempt(ip: string, email?: string): ThrottleVerdict;
}

export interface IpEmailThrottleOptions {
  /** Max attempts per source IP per window. */
  readonly perIp: number;
  /** Max attempts per email per window. */
  readonly perEmail: number;
  /** Window length in milliseconds. */
  readonly windowMs: number;
  /** Injected clock (default `Date.now`) so tests control the window boundary. */
  readonly now?: () => number;
}

export function createIpEmailThrottle(opts: IpEmailThrottleOptions): IpEmailThrottle {
  const now = opts.now ?? Date.now;
  // key → { windowStart, count }; a key's window starts at its first hit after expiry.
  const windows = new Map<string, { start: number; count: number }>();

  function hit(key: string): { allowed: boolean; retryAfterSec?: number } {
    const t = now();
    let w = windows.get(key);
    if (!w || t - w.start >= opts.windowMs) {
      w = { start: t, count: 0 };
      windows.set(key, w);
    }
    w.count += 1;
    // Cheap sweep: windows are only created on hit, so the map can only grow with real traffic; evict the
    // expired entries on a bounded cadence to bound memory on a hot route.
    if (windows.size > 10_000) {
      for (const [k, v] of windows) if (t - v.start >= opts.windowMs) windows.delete(k);
    }
    const max = key.startsWith("ip:") ? opts.perIp : opts.perEmail;
    if (w.count > max) {
      return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((w.start + opts.windowMs - t) / 1000)) };
    }
    return { allowed: true };
  }

  return {
    attempt(ip: string, email?: string): ThrottleVerdict {
      const ipKey = `ip:${ip.trim() || "unknown"}`;
      const emailKey = email?.trim() ? `em:${email.trim().toLowerCase()}` : undefined;
      const ipVerdict = hit(ipKey);
      const emailVerdict = emailKey ? hit(emailKey) : { allowed: true };
      if (!ipVerdict.allowed) return ipVerdict;
      return emailVerdict;
    },
  };
}
