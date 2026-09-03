# HUMAN H1 — auth-mode spike: RESOLVED BY DESIGN (2026-09-02)

> **No longer an open investigation.** The 2026-09-02 amendment moved inference from "Claude Platform
> on AWS" (Marketplace) to the **direct Anthropic API** (`api.anthropic.com`, platform-billed). There
> is therefore **no SigV4-vs-direct-key auth mode to investigate**: the egress proxy always injects the
> Anthropic API key (read from Secret Manager) for requests bearing a valid per-run proxy credential.
> Ticket 07 no longer has a human prerequisite. (See 00_MANIFEST.md § Spec amendments applied.)

The three former spike questions, now answered by the first-party API's known behaviour:

- [x] **Auth mode** — a **direct API key** (no SigV4, no task-role signing). The proxy injects it.
- [x] **Usage block** — the Anthropic Messages API returns a `usage` block on every response, including
      `input_tokens`, `output_tokens`, cache read/creation tokens, and `server_tool_use` for web
      search/fetch — exactly what the proxy meters (§12.7).
- [x] **Usage & Cost report** — the Anthropic Console usage/cost export is matchable by request id
      (the `request-id` response header), which the nightly reconciliation (§12.7 cross-check 2) keys on.

**One-line confirmation task (optional, when the key exists):** issue one `POST /v1/messages` with a
web-search tool and confirm the response carries the `usage` block and a `request-id` header. This is a
sanity check, not a gate — the direct API is the reference and ticket 07 builds against it unconditionally.

**Exit:** already satisfied — ticket 07 builds the direct-key injection path.
