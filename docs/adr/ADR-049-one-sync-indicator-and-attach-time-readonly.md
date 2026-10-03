# ADR-049: One sync indicator — the Page's `[data-sync-pill]`; read-only reaches the client at attach

- **Status:** Accepted
- **Date:** 2026-10-02
- **Ticket:** EDIT.1
- **Requirement ids:** REQ-IDE-43
- **Spec:** §5.10, §15.4

## Context

Two "sync" surfaces existed. `PageEditor` renders the live `[data-sync-pill]` the island drives
from `CollabSyncEvent`s (synced ✓ / syncing… / offline · n queued / read-only). `IdeShell`'s
status bar rendered a second `.ide-sync` span that defaulted to `Synced` whenever `status.sync`
was unset — i.e. always: nothing fed it client-side, so every IDE page carried a second, lying
indicator (REQ-IDE-43 calls for *the* autosave signal). Separately, a read-only collab attach
(run lock, non-editable working head, Showcase draft) set `connectionConfig.readOnly`
server-side but never told the client — the wire already had the `rhema.readonly` stateless and
the client already handled it, but nothing sent it, so a locked page's pill said "synced" while
the framework silently refused its updates until the 10 s doc poll corrected the picture. And
`connect-src 'self'` relied on CSP3's scheme mapping for the same-origin `wss://` collab socket —
correct in Chromium, historically inconsistent in WebKit (the journey harness is Chromium-only).

## Decision

- **The `[data-sync-pill]` is the ONE indicator** (ADR-049's surviving surface): fixed
  bottom-right, driven by the collab session, `role="status" aria-live="polite"`. The shell's
  `.ide-sync` status-bar span, its `status.sync` prop, the `synced|syncing|offline` statusBar
  labels, and the dead `.ide-sync` CSS rule are removed — the status bar keeps version / words /
  read-time / venue cap / credits.
- **`rhema.readonly` rides at attach.** A new `connected` hook sends the stateless to the
  attaching connection whenever `context.readOnly` — the pill flips to read-only immediately,
  matching §5.10's truthfulness (the framework refuses the connection's updates either way; now
  the UI says so).
- **Read-only SSR carries no collab wire.** A page rendered `readOnly` (phone width, the
  Showcase) no longer receives `collabWsUrl` — the island mounts the static view and never
  connects, so a §15.4-read-only surface cannot even attempt a write.
- **`connect-src` names the collab origin explicitly** (`'self' wss://<app-host>` derived from
  the configured `COLLAB_WS_URL`) — the same-origin socket no longer depends on a browser's
  scheme-mapping interpretation.

## Consequences

- Every save-state signal a user sees originates from one element with §5.10's vocabulary; there
  is no second indicator to disagree with it.
- A lock landing between SSR and attach, a Showcase draft, and a non-editable working head all
  present "read-only" to the user at connect time — the pill's state is provable, not inferred.
- The explicit `wss://` source makes the collab connect engine-independent; the WebKit
  *verification* leg stays a deferral row (harness limitation), the CSP control removes the
  underlying ambiguity it would have probed.
