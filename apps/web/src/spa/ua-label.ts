// R7KIT.3a (REQ-KIT-4; R5 D3) — the session list's UA→label parser. Settings renders
// "Chrome on macOS · this device", never the raw agent string. An in-house table — no
// dependency (the AC's licence/pin leg is trivially discharged). Unknown agents fall back
// to "Unknown device"; the row keeps the session id in `data-session` for identification.

const BROWSERS: readonly { readonly label: string; readonly re: RegExp }[] = [
  // Order matters: Edge/Opera/Firefox UAs all carry "Safari"/"Chrome" tokens, so the
  // specific engines test first and generic Chrome/Safari last.
  { label: "Edge", re: /Edg(?:iOS|A)?\// },
  { label: "Opera", re: /OPR\/|Opera\// },
  { label: "Firefox", re: /FxiOS|Firefox\// },
  { label: "Chrome", re: /CriOS|Chrome\/|Chromium\// },
  { label: "Safari", re: /Version\/[\d.]+\s+Safari\/|Safari\// },
];

const SYSTEMS: readonly { readonly label: string; readonly re: RegExp }[] = [
  // iOS before macOS (iPad UAs can carry "Macintosh" + "Mobile"), Android before Linux.
  { label: "iOS", re: /iPhone|iPad|iPod/ },
  { label: "Android", re: /Android/ },
  { label: "Windows", re: /Windows NT|Win64|Win32/ },
  { label: "ChromeOS", re: /CrOS/ },
  { label: "macOS", re: /Mac OS X|Macintosh/ },
  { label: "Linux", re: /Linux|X11/ },
];

/**
 * "Chrome on macOS" — the session row's device label. `null`/empty ⇒ `null` so the caller
 * falls back to the session's ipAddress/id (no UA was ever recorded); a real but
 * unparseable agent ⇒ "Unknown device", never the raw string.
 */
export function sessionAgentLabel(userAgent: string | null | undefined): string | null {
  if (userAgent == null || userAgent.trim() === "") return null;
  const ua = userAgent;
  // Command-line agents name themselves — "curl/8.4.0" reads as its own tool.
  const cli = /^(curl|wget|HTTPie|PostmanRuntime|python-requests|Go-http-client)\b/i.exec(ua);
  if (cli) return cli[1]!.replace(/^./, (c) => c.toUpperCase());
  const browser = BROWSERS.find((b) => b.re.test(ua))?.label ?? null;
  const system = SYSTEMS.find((s) => s.re.test(ua))?.label ?? null;
  if (browser != null && system != null) return `${browser} on ${system}`;
  if (browser != null) return browser;
  if (system != null) return system;
  return "Unknown device";
}
