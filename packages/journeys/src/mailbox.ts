// JOURNEY.1 — the keyless Gmail mailbox client (deliverable: "a mailbox client that…").
// Reads the operator-provisioned test mailbox via Gmail DWD: a locally-minted JWT (iss = the
// rhema-journeys service account, sub = the test mailbox, scope = gmail.readonly) is signed by the
// IAM Credentials API (the CALLER's Workload Identity / ADC identity — never a key file), exchanged
// via the OAuth JWT-bearer grant for a Gmail access token. Nothing secret is ever material to the
// repo or CI — WI federation issues the caller credential; the SA has no exported key (SEC.1 proved
// this path live against production).

import { execFileSync } from "node:child_process";

/** The operator-provisioned Gmail DWD service account for the test mailbox (adopted by infra). */
export const JOURNEY_SA = "rhema-journeys@rhema-507501.iam.gserviceaccount.com";
/** The ONLY mailbox this client may ever read — the hard pin (the pin cannot be widened by callers). */
export const TEST_MAILBOX = "test@rhema.tools";
export const GMAIL_READ_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const TOKEN_AUD = "https://oauth2.googleapis.com/token";
const IAMCRED = "https://iamcredentials.googleapis.com/v1";
const GMAIL = "https://gmail.googleapis.com/gmail/v1";

type FetchFn = typeof fetch;

export interface GmailMessage {
  readonly id: string;
  readonly subject: string;
  readonly from: string;
  readonly to: string;
  readonly date: string;
  /** concatenated decoded text/plain + text/html bodies */
  readonly body: string;
}

export interface MailboxClient {
  /** the mailbox the client reads — always `test@rhema.tools` */
  readonly userId: string;
  /** gmail search over the test mailbox (q syntax e.g. `to:x newer_than:30m`) → newest-first ids */
  listMessages(q: string): Promise<string[]>;
  getMessage(id: string): Promise<GmailMessage>;
  /** poll until a message matching `q` whose body contains `needle` appears; returns the message */
  awaitMessage(q: string, needle: RegExp | string, timeoutMs: number): Promise<GmailMessage>;
  /** poll until a magic-link URL for `email` arrives; returns the absolute link */
  awaitMagicLink(email: string, sinceEpochSec: number, timeoutMs: number): Promise<string>;
}

export interface MailboxDeps {
  /** defaults to the JOURNEY_SA constant */
  saEmail?: string;
  /** caller-credential provider for the signJwt call (env JOURNEY_GCP_ACCESS_TOKEN → gcloud ADC) */
  callerToken?: () => Promise<string>;
  fetchFn?: FetchFn;
  /** injectable clock (tests) */
  now?: () => number;
}

/** Create a Gmail client for the pinned test mailbox. `userId` MUST be `test@rhema.tools`. */
export function createGmailClient(userId: string, deps: MailboxDeps = {}): MailboxClient {
  // The hard pin — refuse at construction so no caller can ever widen the mailbox.
  if (userId !== TEST_MAILBOX) {
    throw new Error(`mailbox client is pinned to ${TEST_MAILBOX} — refusing userId ${userId}`);
  }
  const sa = deps.saEmail ?? JOURNEY_SA;
  const fetchFn = deps.fetchFn ?? fetch;
  const now = deps.now ?? (() => Date.now());
  const callerToken = deps.callerToken ?? defaultCallerToken;
  let gmailToken: { tok: string; exp: number } | undefined;

  async function signJwt(payload: Record<string, unknown>): Promise<string> {
    const tok = await callerToken();
    const r = await fetchFn(
      `${IAMCRED}/projects/-/serviceAccounts/${encodeURIComponent(sa)}:signJwt`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" },
        body: JSON.stringify({ payload: JSON.stringify(payload) }),
      },
    );
    if (!r.ok) throw new Error(`iamcredentials signJwt ${r.status}: ${await r.text()}`);
    const j = (await r.json()) as { signedJwt?: string };
    if (!j.signedJwt) throw new Error("signJwt returned no signedJwt");
    return j.signedJwt;
  }

  async function accessToken(): Promise<string> {
    if (gmailToken && gmailToken.exp > now() + 30_000) return gmailToken.tok;
    const iat = Math.floor(now() / 1000);
    // The sub is the pinned mailbox — never anything else (double-checked at this seam too).
    const signedJwt = await signJwt({
      iss: sa,
      sub: TEST_MAILBOX,
      scope: GMAIL_READ_SCOPE,
      aud: TOKEN_AUD,
      iat,
      exp: iat + 3600,
    });
    const r = await fetchFn(TOKEN_AUD, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${encodeURIComponent(signedJwt)}`,
    });
    if (!r.ok) throw new Error(`jwt-bearer exchange ${r.status}: ${await r.text()}`);
    const j = (await r.json()) as { access_token?: string; expires_in?: number };
    if (!j.access_token) throw new Error("jwt-bearer exchange returned no access_token");
    gmailToken = { tok: j.access_token, exp: now() + (j.expires_in ?? 3600) * 1000 };
    return gmailToken.tok;
  }

  async function gmail(path: string): Promise<unknown> {
    const r = await fetchFn(`${GMAIL}/users/${encodeURIComponent(TEST_MAILBOX)}/${path}`, {
      headers: { authorization: `Bearer ${await accessToken()}` },
    });
    if (!r.ok) throw new Error(`gmail ${path} ${r.status}: ${await r.text()}`);
    return r.json();
  }

  function decodeBody(msg: unknown): string {
    const parts: string[] = [];
    const walk = (node: unknown): void => {
      if (node === null || typeof node !== "object") return;
      const n = node as { mimeType?: string; body?: { data?: string }; parts?: unknown[] };
      if (
        n.body?.data &&
        (n.mimeType === "text/plain" || n.mimeType === "text/html" || !n.mimeType)
      ) {
        parts.push(Buffer.from(n.body.data, "base64url").toString("utf8"));
      }
      for (const p of n.parts ?? []) walk(p);
    };
    walk(msg);
    return parts.join("\n");
  }

  return {
    userId: TEST_MAILBOX,
    async listMessages(q) {
      const j = (await gmail(
        `messages?q=${encodeURIComponent(q)}&maxResults=10`,
      )) as { messages?: { id: string }[] };
      return (j.messages ?? []).map((m) => m.id);
    },
    async getMessage(id) {
      const j = (await gmail(`messages/${id}?format=full`)) as {
        payload?: { headers?: { name: string; value: string }[] };
      };
      const hdr = Object.fromEntries(
        (j.payload?.headers ?? []).map((h) => [h.name.toLowerCase(), h.value]),
      );
      return {
        id,
        subject: hdr.subject ?? "",
        from: hdr.from ?? "",
        to: hdr.to ?? "",
        date: hdr.date ?? "",
        body: decodeBody(j.payload),
      };
    },
    async awaitMessage(q, needle, timeoutMs) {
      const deadline = now() + timeoutMs;
      while (now() < deadline) {
        for (const id of await this.listMessages(q)) {
          const m = await this.getMessage(id);
          const hit =
            typeof needle === "string" ? m.body.includes(needle) : needle.test(m.body);
          if (hit) return m;
        }
        await new Promise((r) => setTimeout(r, 3000));
      }
      throw new Error(`awaitMessage timed out after ${timeoutMs}ms: q=${q}`);
    },
    async awaitMagicLink(email, sinceEpochSec, timeoutMs) {
      // Resend signs links with click tracking; accept either the raw app link or a tracked
      // https link whose body contains the token (extract the last https URL that matches).
      const msg = await this.awaitMessage(
        `to:${email} after:${sinceEpochSec}`,
        /magic-link|verify|token=/i,
        timeoutMs,
      );
      const urls = msg.body.match(/https?:\/\/[^\s"'<>()]+/g) ?? [];
      const link = urls.find((u) => /\/api\/auth\/magic-link\/verify/.test(u)) ?? urls.find((u) => /token=/.test(u));
      if (!link) throw new Error(`magic-link email for ${email} has no verify link (subject: ${msg.subject})`);
      return link.replace(/[.,;]+$/, "");
    },
  };
}

/** Caller credential for signJwt: explicit env token, else gcloud ADC (never a key file). */
async function defaultCallerToken(): Promise<string> {
  const envTok = process.env.JOURNEY_GCP_ACCESS_TOKEN;
  if (envTok) return envTok;
  try {
    return execFileSync("gcloud", ["auth", "application-default", "print-access-token"], {
      encoding: "utf8",
    }).trim();
  } catch {
    throw new Error(
      "no caller credential: set JOURNEY_GCP_ACCESS_TOKEN or `gcloud auth application-default login` " +
        "(the CI nightly uses Workload Identity Federation to mint it)",
    );
  }
}
