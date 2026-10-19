// JOURNEY — a local Crockford-base32 ULID mint, verbatim-shaped like the canonical
// `ulid()` in packages/orchestrator/src/ids.ts (kept dependency-free: @rhema/journeys
// does not consume @rhema/orchestrator). Needed because every run-event payload id
// (`draft.forked`, `revision.move_traced`, …) is validated against the 26-char ULID
// schema at the api write boundary — a seed minting randomUUID() ids builds a dossier
// whose Apply action 500s the api → 502 at the web dual-mode route (the 2026-10-15
// VERIF.1 live read: `unhandled_route_error` ZodError "id must be a 26-char
// Crockford-base32 ULID" at payload.draftId inside traceManualRevision).

import { randomInt } from "node:crypto";

/** Crockford base32 (no I/L/O/U) — the ULID alphabet `idSchema` validates. */
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** A ULID: 48-bit timestamp (10 chars) + 80-bit randomness (16 chars), 26 Crockford chars. */
export function journeyUlid(now: number = Date.now()): string {
  let time = "";
  let t = Math.floor(now);
  for (let i = 0; i < 10; i++) {
    time = CROCKFORD[t % 32] + time;
    t = Math.floor(t / 32);
  }
  let rand = "";
  for (let i = 0; i < 16; i++) rand += CROCKFORD[randomInt(0, 32)];
  return time + rand;
}
