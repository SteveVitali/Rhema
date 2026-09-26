// Per-host politeness limiter (≤1 request per second per host — REQ-INGEST-12). A monotonic last-hit map; the
// clock is injected so tests are deterministic.

export class HostRateLimiter {
  private readonly last = new Map<string, number>();
  constructor(
    private readonly minIntervalMs = 1000,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** When the next request to `host` is permitted (ms since epoch). */
  nextAllowedAt(host: string): number {
    const prev = this.last.get(host);
    return prev == null ? this.now() : prev + this.minIntervalMs;
  }

  /** Try to take a slot for `host`. Returns true (and records the hit) if allowed now, else false. */
  take(host: string): boolean {
    const t = this.now();
    if (t < this.nextAllowedAt(host)) return false;
    this.last.set(host, t);
    return true;
  }
}
