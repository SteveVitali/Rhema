// JOURNEY.1 — run nonce + test identity helpers. Every artifact a journey run creates (voice names,
// project titles, marker strings) is namespaced by the nonce so steps are idempotent and a re-run
// never collides with a previous run's data (the purge sweep reaps them anyway — workspaces flagged
// `is_test`, migration 0046).

import { randomBytes } from "node:crypto";

/** Short lowercase nonce for one journey run (tag-safe for names, plus-tags and domains). */
export function journeyNonce(): string {
  return randomBytes(6).toString("hex"); // 12 hex chars
}

/** The test identity for `tag` under this run's nonce: `test+j<nonce><tag>@rhema.tools`. */
export function testIdentity(nonce: string, tag: string): string {
  const clean = tag.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 16);
  return `test+j${nonce}${clean}@rhema.tools`;
}

/** A nonce-namespaced marker string that must never cross tenant boundaries. */
export function marker(nonce: string, name: string): string {
  return `JRN-${nonce.toUpperCase()}-${name.toUpperCase()}`;
}
