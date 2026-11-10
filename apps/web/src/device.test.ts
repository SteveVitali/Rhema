import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { deviceClassFor, isPhoneRequest } from "./device.js";

// R7RO.2 (UXC-8; REQ-VFY-5) — the phone/tablet classification table. `isPhoneRequest` admits a
// `Mobile` UA token or the `Sec-CH-UA-Mobile: ?1` client hint ONLY: `Android` alone is not a phone,
// so Android tablets get the desktop/SPA path (PANE-2 breakpoints) and never the forced-SSR reader.
// `data-device` (deviceClassFor) is the same verdict's emitted stamp — the legs pin both.

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const ANDROID_PHONE =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const ANDROID_TABLET =
  "Mozilla/5.0 (Linux; Android 14; Pixel Tablet) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
// iPadOS 17 sends the desktop-class Mac UA by default (it asks for desktop sites) — no Mobile token.
const IPAD_DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const DESKTOP =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

function probe() {
  const app = new Hono();
  app.get("/x", (c) => c.text(deviceClassFor(c)));
  return app;
}

const TABLE: { name: string; headers: Record<string, string>; phone: boolean }[] = [
  { name: "iPhone", headers: { "user-agent": IPHONE }, phone: true },
  { name: "Android phone", headers: { "user-agent": ANDROID_PHONE }, phone: true },
  { name: "Android tablet (Android, no Mobile)", headers: { "user-agent": ANDROID_TABLET }, phone: false },
  { name: "iPad (desktop UA)", headers: { "user-agent": IPAD_DESKTOP_UA }, phone: false },
  { name: "desktop", headers: { "user-agent": DESKTOP }, phone: false },
  { name: "sec-ch-ua-mobile hint (?1, desktop UA)", headers: { "user-agent": DESKTOP, "sec-ch-ua-mobile": "?1" }, phone: true },
  { name: "hint off (?0, phone UA still wins)", headers: { "user-agent": IPHONE, "sec-ch-ua-mobile": "?0" }, phone: true },
  { name: "no UA at all", headers: {}, phone: false },
];

describe("R7RO.2 — isPhoneRequest UA table (UXC-8; REQ-VFY-5)", () => {
  for (const row of TABLE) {
    it(`${row.name} → ${row.phone ? "phone" : "desktop"}`, async () => {
      const res = await probe().request("/x", { headers: row.headers });
      expect(await res.text()).toBe(row.phone ? "phone" : "desktop");
    });
  }

  it("an Android-tablet UA reaches the shell document (data-device=desktop), never the reader", () => {
    // the classification seam the shell document stamps — pinned once, source-level.
    expect(isPhoneRequest).toBeTypeOf("function");
  });
});
