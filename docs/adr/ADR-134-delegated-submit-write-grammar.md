# ADR-134: R7RELOAD.1 delegated submit, write grammar, and outcome census decisions

- **Status:** accepted
- **Date:** 2026-11-05
- **Ticket:** 231_R7RELOAD.1 (REQ-RELOAD-2, REQ-RELOAD-3, REQ-RELOAD-4, REQ-GUARD-3)
- **Spec:** `docs/tickets/231_R7RELOAD.1__no-reload-forms.md`; `docs/round-7-draft-spec.md` §4.8/§4.16

## Context

R6 T1–T3 leaked: the pane forms (Timeline gate Approve/Decline, the explainer dismiss, the run
card's steering posts) mounted inside chrome-owned containers — never inside a leaf's React
`onSubmit` subtree — so the three per-surface write regexes (`DOSSIER_WRITE`, `EDITOR_WRITE`,
`RUN_REPORT_WRITE`) could never see them and they reloaded the document on every submit. The
ticket owns the allowlist's location, the exemption list for the `mutationOutcome` census, and
the chat envelope's exact shape.

## Decision

1. **One delegated submit at the `IdeChrome` host.** The host `<div>` wraps every pane body AND
   the leaf Outlet; its `onSubmit` runs the shared handler. A leaf's own `onSubmit` (nearer the
   form) claims its submits first — `defaultPrevented` skips at the host — so the two legs never
   double-post. There is still exactly ONE interception grammar.
2. **The shared allowlist lives at `apps/web/src/spa/write-paths.tsx` (`SPA_WRITE`)** — the union
   of the retired surface grammars plus the pane-body-only paths (`explainers/*/dismiss`,
   `r/*/pause|resume|stop|cancel|note`, `decisions/*`). A source census test fails if any surface
   re-declares an `*_WRITE` grammar. Chat forms are deliberately outside the grammar (232 owns
   their fetch mutation), the export download and `/logout` stay native document navigations.
3. **Every `server.ts` POST handler answers through `mutationOutcome` or a named exemption.** The
   exemptions, enumerated in `write-paths.test.ts`: funnel auth forms (`/signup`, `/login` — they
   re-render documents), JSON-only endpoints (`/ide/theme`, `/p/:project/paper-theme`,
   `/edit/:draftId/save`, `gates/:gid/activity`, `/a/*` beacons, every `/bff/*` twin), the binary
   `/p/:project/export`, and registrations resolved through `mutationOutcome`-bearing factories
   (`dispositionHandler`, `findingActionHandler`, `steerHandler`, `billingPost`/`billingBase`,
   `bffRoute`, `chatReply`, `chatInvalid`).
4. **The chat JSON arm is the `mutationOutcome` envelope verbatim** — `{ok:true, redirect, data}`
   at 200 — replacing the verbatim-DTO 201s. The envelope is the contract every other write
   already honors; refusal paths keep `chatFail`'s truthful status + stable code on BOTH arms
   (a form post's refusal is never a redirect). Validation failures are stable snake-case codes
   (`chat_turn_required` … `chat_attachment_required`); a no-JS form lands the `#chat` flash
   redirect, never a raw JSON page.
5. **GUARD-3's sanctioned document navigations are a named vocabulary**
   (`SANCTIONED_DOCUMENT_NAVIGATIONS` in `packages/journeys/src/noreload.ts`): `demo-entry`,
   `demo-exit`, `logout`, `stripe-handoff`, `oauth-handoff`, `binary-export`, `file-passthrough`,
   `document-stub`. A declared name EXPECTS its document load — it is not merely permitted — and
   replants the window marker on the fresh document.

## Consequences

- A form inside ANY pane body (gate cards, steering posts, the explainer dismiss) is now a JSON
  mutation — scroll and focus are preserved by construction (REQ-UX-4), and the chrome no longer
  reloads per write.
- A caller inspecting chat's 201 becomes 200 + envelope; tests were updated and 245's `errorCopy`
  maps the stable codes to user sentences.
- A new form POST outside `SPA_WRITE` keeps its native leg — safe default (the strangler's
  document nav still answers it), but the census + walk are the tripwires.

## Alternatives considered

- **Per-pane delegated handlers** (the dossier's `PaneIntercept` model): rejected — the Timeline
  is chrome-rendered outside every surface's subtree; only a host-level leg covers it.
- **Keeping the chat 201 verbatim-DTO arm**: rejected — it made chat the only non-envelope write
  in the app and 232 would have had to special-case it anyway.

## Revisit trigger

232_R7TALK.1a lands the chat fetch mutations; if its composer needs streaming/attachments the
envelope shape may need a `data`-carrying variant — reopen then.
