// Device-capability request classification (§10.1; moved verbatim out of server.ts for SPA.3 so
// the shell module shares the one phone verdict without a server↔shell import cycle). The
// §10.1 phone-width input set is a server-rendered variant of the SAME components (REQ-SPEC-20);
// the client capability picks the variant, not a viewport guess.

import type { Context } from "hono";

/** The `data-device` vocabulary — what REQ-VFY-5 checks against a rendered document. */
export type DeviceClass = "phone" | "desktop";

/**
 * §10.1 phone detection — verbatim `isPhoneRequest` from server.ts: a phone UA or the
 * Sec-CH-UA-Mobile hint picks the phone-width variant; everything else is the desktop input set.
 */
export function isPhoneRequest(c: Context): boolean {
  if (c.req.header("sec-ch-ua-mobile") === "?1") return true;
  const ua = c.req.header("user-agent") ?? "";
  return /Mobi|iPhone|Android/i.test(ua);
}

/** The capability word the shell stamps on `<html data-device>` and into the boot payload. */
export function deviceClassFor(c: Context): DeviceClass {
  return isPhoneRequest(c) ? "phone" : "desktop";
}
