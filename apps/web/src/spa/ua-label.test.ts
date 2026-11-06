// R7KIT.3a (REQ-KIT-4; R5 D3) — the session-agent parser's table test: every supported
// browser × system combination lands its "X on Y" label, command-line agents name
// themselves, and unknown/empty input falls back honestly (never the raw string).

import { describe, expect, it } from "vitest";
import { sessionAgentLabel } from "./ua-label.js";

const TABLE: readonly [string, string][] = [
  // Chrome × systems
  [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Chrome on macOS",
  ],
  [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Chrome on Windows",
  ],
  [
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Chrome on Linux",
  ],
  [
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1",
    "Chrome on iOS",
  ],
  [
    "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    "Chrome on Android",
  ],
  // Safari × systems
  [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
    "Safari on macOS",
  ],
  [
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    "Safari on iOS",
  ],
  // Firefox × systems
  [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0",
    "Firefox on macOS",
  ],
  [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
    "Firefox on Windows",
  ],
  ["Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0", "Firefox on Linux"],
  [
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/121.0 Mobile/15E148 Safari/605.1.15",
    "Firefox on iOS",
  ],
  ["Mozilla/5.0 (Android 14; Mobile; rv:121.0) Gecko/121.0 Firefox/121.0", "Firefox on Android"],
  // Edge × systems
  [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
    "Edge on macOS",
  ],
  [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
    "Edge on Windows",
  ],
  [
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
    "Edge on Linux",
  ],
  [
    "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 EdgA/120.0.0.0",
    "Edge on Android",
  ],
  [
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) EdgiOS/120.0.0.0 Version/17.0 Mobile/15E148 Safari/605.1.15",
    "Edge on iOS",
  ],
  // Command-line agents name themselves.
  ["curl/8.4.0", "Curl"],
  ["Go-http-client/2.0", "Go-http-client"],
  // Partial parses degrade to what we know — never the raw string.
  ["Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "Windows"],
  ["MyCustomAgent/1.0 (Macintosh)", "macOS"],
];

describe("sessionAgentLabel (REQ-KIT-4; D3)", () => {
  it.each(TABLE)("%s → %s", (ua, expected) => {
    expect(sessionAgentLabel(ua)).toBe(expected);
  });

  it("unknown agents fall back — never echo the raw string", () => {
    expect(sessionAgentLabel("SomeTotallyUnknownAgent/9.9 xyzzy")).toBe("Unknown device");
    expect(sessionAgentLabel("SomeTotallyUnknownAgent/9.9 xyzzy")).not.toContain("9.9");
  });

  it("absent agents return null so the row falls back to ip/id", () => {
    expect(sessionAgentLabel(null)).toBeNull();
    expect(sessionAgentLabel(undefined)).toBeNull();
    expect(sessionAgentLabel("")).toBeNull();
    expect(sessionAgentLabel("   ")).toBeNull();
  });
});
