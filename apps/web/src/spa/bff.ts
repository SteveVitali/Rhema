// SPA.4 (REQ-FW-6, REQ-DAT-2/3, REQ-BFF-30; design/20 §3) — `bffFetch`, the ONE transport for every
// JSON read/write the SPA makes. Same-origin relative paths only (a bundle never holds a credential;
// the session cookie rides `credentials:"same-origin"` — REQ-ARCH-33, spec §2 I-5). Non-2xx answers
// parse the server's `{error:<code>, detail?}` envelope into a `BffError` that preserves the upstream
// status + code + the `x-rhema-request-id` correlation header (spec §3.3); the 401 leg invalidates
// `["session"]` and document-navigates to `/login` (`/login` is outside the SPA tree, so it is a real
// navigation, never an in-router redirect). bffFetch itself issues exactly one fetch — POST retries
// are forbidden (REQ-BFF-30) and GET retry policy lives in the QueryClient, not here.

import { navigateDocument } from "./dom.js";

/** `{error, detail?}` non-2xx responses, thrown with the upstream status preserved (REQ-DAT-2). */
export class BffError extends Error {
  /** The HTTP status (upstream status for proxied api failures). */
  readonly status: number;
  /** The server's stable `{error}` code string — ApiError.code's client twin (REQ-BFF-4). */
  readonly code: string;
  /** The optional `{detail}` payload the server attached. */
  readonly detail?: string;
  /** `x-rhema-request-id` correlation (spec §3.3) — the log line's join key. */
  readonly requestId?: string;

  constructor(status: number, code: string, opts?: { detail?: string; requestId?: string }) {
    super(`${status} ${code}${opts?.detail ? `: ${opts.detail}` : ""}`);
    this.name = "BffError";
    this.status = status;
    this.code = code;
    if (opts?.detail != null) this.detail = opts.detail;
    if (opts?.requestId != null) this.requestId = opts.requestId;
  }
}

/**
 * The 401 leg's owner — bound once by `mountSpa` (it closes over the QueryClient so the session
 * query can be removed). Unbound ⇒ the document navigation still happens; a bare module must
 * degrade to the safe leg, never a no-op.
 */
let onSessionExpired: () => void = () => navigateDocument("/login");

export function setSessionExpiredHandler(fn: () => void): void {
  onSessionExpired = fn;
}

/**
 * The one JSON transport. `path` is a same-origin `/…` path (absolute/other-origin URLs are
 * rejected — the cookie must never ride a cross-origin request, REQ-DAT-7). `init.json` is the
 * structured request body (POSTs are caller-driven; there is no client-side retry).
 * `init.form` is the SPA.12 import leg (REQ-BFF-17): a multipart body never becomes a JSON field —
 * the FormData rides verbatim (the browser sets the multipart content-type + boundary) while the
 * `accept` header still selects the server's JSON envelope over the 302.
 */
export async function bffFetch<T>(
  path: string,
  init?: { method?: string; json?: unknown; form?: FormData },
): Promise<T> {
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new BffError(0, "bff_path_must_be_same_origin");
  }
  if (init?.json !== undefined && init?.form !== undefined) {
    throw new BffError(0, "bff_body_ambiguous");
  }
  const res = await fetch(path, {
    method: init?.method ?? "GET",
    credentials: "same-origin",
    headers: {
      accept: "application/json",
      ...(init?.json !== undefined ? { "content-type": "application/json" } : {}),
    },
    ...(init?.json !== undefined ? { body: JSON.stringify(init.json) } : {}),
    ...(init?.form !== undefined ? { body: init.form } : {}),
  });
  if (res.status === 401) {
    // The session ended server-side — drop the cached principal and hand the document to /login.
    onSessionExpired();
    throw new BffError(401, "unauthenticated", { requestId: res.headers.get("x-rhema-request-id") ?? undefined });
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: unknown; detail?: unknown } | null;
    throw new BffError(res.status, typeof body?.error === "string" ? body.error : "request_failed", {
      detail: typeof body?.detail === "string" ? body.detail : undefined,
      requestId: res.headers.get("x-rhema-request-id") ?? undefined,
    });
  }
  return (await res.json()) as T;
}
