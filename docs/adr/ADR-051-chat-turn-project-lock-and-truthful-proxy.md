# ADR-051: Chat turns keep the project lock; the web proxy passes every refusal through truthfully

- **Status:** Accepted
- **Date:** 2026-10-03
- **Ticket:** RUN.1
- **Requirement ids:** REQ-CHAT-9, REQ-CHAT-14, REQ-VIS-11
- **Spec:** §6.3 (concurrency: reads never lock), §7.1 (turn anatomy)

## Context

Two defects shared one route surface. First, chat POSTs returned a bare HTTP 502: the web layer
called `deps.dataSource.postChatTurn?.(...).catch(() => null)`, so every upstream distinction —
402 `insufficient_balance`, 409 `run_in_progress`, 403, 422 — collapsed into `null` and then into
a generic 502 with no log trail. Second, the ticket asked to re-check whether a chat turn should
take the project lock at all: §6.3 says "reads … never lock", and a chat turn writes only the
assistant namespace, so `lockSetSpec {projectId}` refusing a turn while a Review holds the
project lock was a candidate root cause of the observed failures.

## Decision

- **The chat turn keeps `lockSetSpec {projectId}`.** A chat turn is not a read — it creates a
  `chat_turn` run that writes artifacts and usage records into the project workspace while a
  Review/Revise run may be mid-flight mutating the same workspace. §6.3's "reads never lock"
  does not apply to a run-creating write. The refusal is `409 run_in_progress` and the
  user-facing line is "a run is in progress — chat after it finishes": truthful, actionable, and
  strictly better than two writers interleaving.
- **The web proxy preserves the api's truth.** `chatCall` (apps/web/src/server.ts ~600) is the
  one seam all chat write/status routes use: the api's non-5xx `ApiError` status + code pass
  through unchanged (402/403/409/422 keep their codes), an api 5xx becomes `502
  chat_upstream_error`, a transport failure becomes `502 chat_unavailable`, and an unbound
  data-source seam is `503 chat_not_wired` — never a mystery 502.
- **Every refusal logs exactly one structured line** — `{level, msg, route, requestId,
  upstreamStatus, upstreamCode}` — and never the message text, thread content, or prompt
  material (REQ-VIS-11). OBS.1 generalises this pattern to every route; RUN.1 fixed chat only.

## Consequences

- A chat turn attempted while a run holds the project lock answers 409 with the run id — the UI
  can deep-link the live run instead of showing a dead error.
- Operators can finally correlate a chat failure to its cause: `requestId` joins the web log
  line, and `upstreamStatus`/`upstreamCode` name the api's own refusal vocabulary.
- `suggestion_too_large` keeps its special form-post redirect (the §7.4 caller-correctable
  refusal); all other codes take the truthful JSON path even on form submits.

## Alternatives considered

- **Drop `lockSetSpec {projectId}` on chat turns.** Rejected — a turn is a run and writes; two
  writers on one project workspace is exactly what the lock exists to prevent. The fix is the
  truthful 409, not lock removal.
- **Map all refusals to 200-with-error-body.** Rejected — the api already speaks HTTP status;
  re-encoding its vocabulary in a 200 envelope hides the truth from intermediaries and the R4
  journey's probes.
- **Log the request body for diagnosis.** Rejected — REQ-VIS-11 forbids user content in logs;
  the structured fields (route/status/code/requestId) are sufficient to locate the cause.

## Revisit trigger

Reopen the lock half if a future workflow makes `chat_turn` read-only (no artifact writes), or if
product wants chat to queue behind a live run rather than refuse. Reopen the logging half when
OBS.1 lands the generalized error-line contract.
