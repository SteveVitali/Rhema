# ADR-108: The showcase leg of the Page family's forced-SSR truth rides the BFF twin, not the boot map

- **Status:** Accepted
- **Date:** 2026-10-10
- **Ticket:** SPACAP.3
- **Requirement ids:** REQ-ED-12 (forced-SSR posture — phone/showcase read-only Page); REQ-VFY-5
  (the posture the prod leg asserts); REQ-BFF-2 (the twin is the document's composition verbatim)
- **Spec:** docs/frontend-spa-spec.md §4 (the fixed handler order); docs/design/23 §7 (the Page
  twins); docs/design/25 §strangler (the SsrHandoff seam)

## Context

SPACAP.1's seam hunt (`docs/build/reports/CAPSTONE_GAP_ANALYSIS_SPA.md` §4.5, routed gap G2)
found one real composed-path divergence (LOW): the server's Page-family
document handlers force SSR on `isPhoneRequest(c) || row.showcase === true` (server.ts — the five
GETs `/p/:slug`, `/v/:v`, `/v/:n/diff/:m`, `/a/:artifactId`, `/revisions/:cid`), while the shell's
boot map replicated only the phone leg (`deviceClass === "phone" && doc.pageMount === true`,
`spa-shell.ts`). `row.showcase` is **row data** the request-scoped boot payload cannot see — the
`surfaces` map is route-keyed, not slug-keyed. Consequence: on desktop the boot map marked the
five Page-family routes `"spa"` even for showcase projects, so an in-SPA navigation to
`/p/<showcase-slug>` rendered the SPA Page where a document load would have served the forced-SSR
read-only document. The BFF aggregates already enforced the same `phone || row.showcase` posture
(`readOnly: true` ships, `collabWsUrl` is withheld), so the divergence was renderer label + render
path, not capability — but it was a real seam: two layers disagreeing about which renderer owns a
document.

## Decision

Each of the five Page-family BFF twins ships `project.showcase: true` when `row.showcase === true`
(the row fact, verbatim — the same field `ProjectRow.showcase` already carries). Each leaf route
consults the shared `twinForcesSsr(twin)` predicate (`spa/states.tsx`) and, when the flag is set,
hands the navigation back through `SsrHandoff` — the same document-load seam the phone leg takes.
The document GET then re-runs the server's fixed handler order and lands the forced-SSR arm.
Result: the client's effective renderer predicate mirrors the server's `phone || showcase`
expression exactly — the **boot map owns the phone leg** (a request fact it can see) and the
**twin owns the showcase leg** (a row fact only the composition can see). Forced-SSR remains a
server verdict in both directions; the client never decides a renderer, it only recognizes which
document owns the route.

Parity is pinned by removal-detecting tests: `renderer-overrides.test.ts` counts the verbatim
`isPhoneRequest(c) || row.showcase === true` document arms (5), the boot-map phone leg (1), the
twin `showcase` emissions (5), and the five leaf `twinForcesSsr` consults by name; the dom suite
asserts a showcase twin drives `navigateDocument` on all five routes and a non-showcase twin never
does; the server suite asserts the flag ships on all five twins for a showcase row and is absent
otherwise.

## Consequences

- The G2 divergence is closed: an in-SPA navigation into a showcase Page-family route document-
  navigates and lands the read-only SSR document — identical to what a direct load always did.
- One extra BFF read precedes the handoff (the twin fetch the leaf needed anyway to learn the row
  fact); the handoff paints the same `SurfaceShell` skeleton the phone leg paints.
- The `readOnly`/`collabWsUrl`-withheld posture the aggregates already ship is kept verbatim —
  belt-and-braces behind the handoff.
- A live re-verification leg (in-SPA showcase handoff + the document's forced-SSR posture on the
  deployed tip) is deferred to `D-SPACAP.3-1` — it verifies deployed code only.

## Alternatives considered

- **Embed the showcase slug set in the boot payload** (`surfaces` stays the verdict source): the
  map is route-keyed, so this would add a second lookup dimension (per-slug) plus a `listProjects`
  read to every shell serve — heavier, and it duplicates a fact the twin already computes.
- **Accept the divergence and record it** (SPACAP.1's option (b)): the read-only posture is
  already enforced at the BFF layer, so this was defensible — but a cheap, testable fix exists and
  the spec's renderer-ownership contract (forced-SSR is a server verdict) is cleaner kept than
  waived. The prompt routed G2 as a fix commit.
- **Hand off in `loader` via `redirect({reloadDocument:true})`** instead of the component-level
  `SsrHandoff`: equivalent outcome, but it would bypass the `spaRuntime.assign` seam (the router's
  `window.location.href` write is unobservable to the test harness) and split the handoff across
  two mechanisms; `SsrHandoff` is the one seam both legs already share.

## Revisit trigger

If the Page family's forced-SSR surface ever grows past `phone || showcase` (e.g., a
capability-detected collab leg), the twin-flag shape scales the same way — revisit whether the
flag should become a server-emitted `forcedSsr` verdict rather than a row fact at that point.
