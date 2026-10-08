# SPA.11 — surface: inbox (run ledger)

- **Status:** DONE (deterministic legs; preview two-leg + rollback BLOCKED — see §3; recorded honestly)
- **Harness:** Devin CLI (agentic coding subagent); model: Cognition Devin; tier: n/a (build work)
- **Ticket:** `docs/tickets/109_SPA.11__surface-inbox.md` (manifest row 109)
- **Branch:** `stevevitali/spa-11-surface-inbox`, stacked on
  `stevevitali/spaf-1-prod-flip-usage` @ `d41e4a4` (`OPERATOR` merge policy, **not merged**).
- **Goal:** migrate the `inbox` surface (`/app/inbox`) to the React SPA behind the `inbox` flag —
  BFF read twin, JSON mutation branches, ported components emitting the manifest vocabulary
  verbatim, component tests/axe, retained SSR, journey re-specs + gate wiring, the dev
  stage-fact line (REQ-SEQ-9).
- **Spend:** $0. No deploys, no production writes, no live legs (preview blocked — §3).

## 0 — Context load

- DEFERRALS.md read first (per AGENTS): `D-SPA.6-1` assessed — still OPEN. Leg (b) needs BOTH the
  now-authorized image path (operator amendment 2026-10-08T16:34Z — scoped Cloud Builds into a
  `rhema-pr-<n>` AR + `preview-stack.mjs` bring-up) AND signed-in sessions on the preview —
  `D-OPS.1-1` stays the operative blocker (§3). Also read: `D-SPAF.1-1..4` (post-deploy usage
  legs + the REQ-SEQ-10 nightly-green gate that binds SPAF.2 — none touched; prod deploys are
  operator-run).
- LEDGER CURRENT STATE read: `nextTicket: SPA.11`, `chainTip:
  stevevitali/spaf-1-prod-flip-usage`, `mergePolicy: OPERATOR`, `round: 4`,
  `dispatchTarget: subagent`, `pinnedBaseSha: fab08ed`.
- Entry gate (REQ-SEQ-5): the foundation set SPA.1–10 + the SPAF.1 flip fact all landed —
  BUILD_INDEX rows 128–136 carry them (PRs #120–129, unmerged stack); the base tip `d41e4a4` is
  SPAF.1's closeout. Asserted, not re-derived.
- Design sources applied: `docs/design/22` endpoint table (`app.inbox` row — `{items, badge,
  gateCards}` aggregate), `docs/design/29` route-map `inbox` row, `docs/design/27` (two-leg +
  rollback mechanics + REQ-VFY-8 per-surface gate splits), spec `docs/frontend-spa-spec.md`
  §4/§8/§9.

## 1 — What landed

### `apps/web/src/server.ts` — `GET /bff/app/inbox` (REQ-BFF-1/8/9, REQ-DAT-4)

- `bffRoute`-gated read twin returning `{items, badge, gateCards}` — the SAME aggregate the
  document handler composes at `server.ts` `/app/inbox`: api-ordered `InboxItemDto[]`, the raw
  badge count, and the §6.4 gate-card join — one `listGates` per DISTINCT `projectId` among
  gate rows, keyed by **inbox-item id** (the row's `gate.gateId` is the join key).
- Degrade semantics verbatim: `swallowDegraded` per seam — a missed read lands the SSR's own
  composed defaults (`items: []`, `badge: 0`, a row's missed join simply omits its `gateCards`
  entry so the row degrades to its deep link) — while an upstream 401 rethrows into the
  `{error:"unauthenticated"}` envelope, never a politely-empty page.

### JSON mutation branches (REQ-BFF-1/2/3)

- `POST /app/inbox/read`: `wantsJson` callers post `{item}` and answer
  `{ok:true, redirect:"/app/inbox"}` via `mutationOutcome`; `parseBody` on the form leg is
  verbatim, and a JSON body with no `item` skips the mark seam (same as an empty form field).
- `POST /app/inbox/read-all`: same envelope split.
- Both: no session → JSON callers get `{error:"unauthenticated"}` 401, form callers keep the
  `/login` redirect; side effects stay swallowed/idempotent exactly as before.

### `apps/web/src/gate-card.tsx` — the shared gate-card module

- Extracted from `pages.tsx` verbatim: `gateCardFor`, `gateCardModel`, `dispositionLabels`,
  `decisionsLabels`, `decisionLine`, `approvalRowLabels`, `outlineLabels` — one COPY-bound
  composition both renderers consume (a copy fix lands on both at once).
- New `opts.presenceScript` flag (default `true`): `false` suppresses the card's `activityUrl`
  (and so its inline `<script>`) — an innerHTML script never executes inside a React mount.
- The module stays server-graph clean — no DOM types (the server tsconfig excludes DOM libs).

### `apps/web/src/spa/gate-presence.ts` — `useGatePresence` (REQ-SPEC-18)

- The verbatim React port of `GateCard`'s inline presence script: `present`/`blur` on
  visibilitychange/focus/blur, `reading` on the `[data-gate-artifact]` click, `sendBeacon` →
  keepalive-fetch fallback, best-effort (a dropped ping just lets the countdown run — the same
  failure shape as a no-JS read). The mount asserts the SAME gate the SSR script carries —
  `model.autoProceed` only (decided by the shared `gateCardModel`).

### `apps/web/src/spa/surfaces/inbox.tsx` — `InboxSurface`

- The §5.11 grouping verbatim: **blocked/Needs-you → unread → earlier → voices**; the badge line
  renders `blocked.length` (the count of what you see — never the raw api number); the honest
  empty state; the read-all form only when event rows exist.
- Blocked rows port all three kinds verbatim: `<details>` gate rows (`data-inbox-kind="gate"`,
  `data-inbox-gate-card` on the joined card mount, `decideNote` on a missed join), decision rows
  through `DecisionsList` (`data-inbox-kind="decision"`), plain blocked rows.
- **SSR markup parity fix:** the unread row's mark-read `<form>` sat inside a flex `<p>` in the
  SSR source — `form` is a p-closing tag, so parsers hoisted it out (and the stray `</p>` minted
  a phantom paragraph). `pages.tsx` now emits the sibling shape directly; the SPA emits the same —
  identical, valid DOM on both renderers. (The 1em phantom spacing under each unread row's button
  goes away on SSR too — an invalid-markup bugfix, not a redesign.)
- Forms keep their SSR `method`/`action` verbatim — the no-JS post is the same element; React
  `onSubmit` intercepts into `useMutation` + `inboxQuery` invalidation on settle (server-truth
  repaint — never optimistic mirroring; a refused mark leaves the row unread). Buttons carry
  `aria-busy`/`disabled` while in flight.
- All user-facing text via `COPY.inbox` + shared helpers (copy-containment clean — the scan's
  `>`→`<` text-window grammar also keys on typed arrow params, so submit handlers rely on JSX
  prop-context inference).

### `apps/web/src/spa/queries.ts` — `inboxQuery`

- `BffInboxTwin` = `{items: InboxItemDto[], badge: number, gateCards: Record<string, GateCardDto>}`;
  `["bff","app","inbox"]` under the REQ-BFF-10/11 key grammar; `bffFetch` transport; the shared
  `retryPolicy`. Mark mutations invalidate this key on settle.

### Route leaf — `routes/_authenticated/app.inbox.tsx` (REQ-SEQ-9)

- Loader warms `inboxQuery` **only** when the boot verdict is `spa` (the handoff path never spends
  the read); component re-consults `isSpaEnabled` → `SsrHandoff` on any other verdict;
  `isPending` → `SurfaceShell`; non-401 errors → thrown to the route's designed error state
  (REQ-UX-6); `compact` rides the boot's `deviceClass` (the same phone verdict SSR reads).
- `pendingComponent: PendingShell`; overrides (`?ssr=1`/`?renderer=spa`/`x-rhema-renderer`) ride
  the unchanged consult machinery.

### `apps/web/src/dom-contract.ts` — inbox vocabulary completed

- `data-inbox-read-all`, `data-inbox-mark-read`, and the `name="item"` field joined the manifest
  (the SSR emitted them already — journey-asserted hooks that pre-date the completeness pass);
  `emittedBy` names `pages.tsx / spa/surfaces/inbox.tsx` on every inbox row; `data-gate-artifact`
  joined the shared block (the presence hook's ping target). `check:dom-contract`: **502 entries
  / 18 surfaces; inbox 12/12 emitted+asserted.**

### Journey re-spec (REQ-VFY-8) + dev flag

- `T2` split → `T2.badge` (badge ⇄ Needs-you rows + open-link leg, fresh `t2` tenant) and
  `T2.matrix` (the notification matrix + quiet-hours, fresh `t2m`) — same owner `STB.5a`.
- `R8` split → `R8.showcase` / `R8.prefs` / `R8.inbox` — same owner `UX.1`, same
  `returningUser("a")` leg.
- `SURFACE_GATES.inbox` = `["T2.badge", "R8.inbox", "X1.inbox"]`; `settings` → `T2.matrix`,
  `R8.prefs` (T3 note kept); `project-home`/`editor` → `T2.badge`; legNotes dropped where the
  split made the leg the whole step. `registry.test.ts` id + green lists updated.
- `STAGES.dev.spaSurfaces = ["usage", "inbox"]` — the surface's dev line (REQ-SEQ-3/9). Preview
  `[]` (flips only via `rhema:spaSurfaces`); **prod untouched** — `["usage"]` stays SPAF.1's, and
  `inbox`'s prod flip is SPAF.2 gated on the REQ-SEQ-10 bake. `stages.test.ts` pins it.

### Tests

- `apps/web/src/spa/inbox.dom.test.tsx` (**12**): production-router mounts at `/app/inbox` —
  every manifest hook emitted, four sections in order, gate row mounts the joined card /
  missed join degrades to the deep link, decision rows render their options, the badge IS the
  blocked count, mark-read posts `{item}` JSON and repaints from the server, mark-all-read posts
  and repaints, `SsrHandoff` on the unflipped verdict + no BFF spend, pending shell, non-401
  designed error, component axe.
- `apps/web/src/bff.test.ts` — the inbox block: aggregate payload + join keying, one `listGates`
  per distinct project, missed join → `{}`, degraded seams → SSR's composed defaults, upstream
  401 → `unauthenticated`, no-session 401-JSON; mutation legs: JSON envelope, no-item no-op,
  form-post 302 verbatim, unauthed JSON→401 / form→redirect split.
- `apps/web/src/spa/spa.dom.test.tsx` — the seeded-principal leg moved to `/app/new` (inbox now
  legitimately spends its own BFF read — the seed-satisfaction assertion is unchanged in intent).
- Retained SSR: `inbox-phone.test.ts` untouched and green — **REQ-VFY-9 disposition**: render
  asserts now have React-twin counterparts in `inbox.dom.test.tsx`; status/forward legs gained
  BFF-twin coverage in `bff.test.ts`; form-POST legs gained mutation-test coverage — the SSR file
  itself stays as the fallback renderer's own coverage.

## 2 — Verification

| Gate | Result |
|---|---|
| `pnpm turbo build lint typecheck` | **PASS — 135/135 tasks** |
| `pnpm test` (root vitest) | **PASS — 473 files, 5,050 pass, 4 skip, 0 fail** |
| `spa/inbox.dom.test.tsx` | 12 legs green |
| `bff.test.ts` | 65 legs green (inbox twin + mutation blocks included) |
| `inbox-phone.test.ts` | 13 legs green — SSR verbatim |
| `check:dom-contract` | **PASS — 502 entries / 18 surfaces; inbox 12/12** |
| `check:spa-budget` | **PASS — all ceilings held** |
| `check:licenses` / `check:protocol-markers` / `check:no-cookies` / `check:spa-env` | **PASS — clean** |

## 3 — Preview two-leg + rollback: BLOCKED (recorded honestly)

The ticket's staging-verified AC (legs A `x-rhema-renderer: ssr`, B flag-on `--expect-renderer
spa`, C full `paid:false` on `pr-<n>`; rollback drill; `D-SPA.6-1b`) could not execute. Two
independent preconditions, only one lifted:

- **Images + preview stack — NOW AUTHORIZED.** The operator's amended pre-authorization (LEDGER
  2026-10-08T16:34Z) lets workers run `gcloud builds submit --config
  infra/cloudbuild/image-set.yaml` scoped to needed services into the preview's own
  `rhema-pr-<n>` AR, then `preview-stack.mjs init/config/up`. `pulumi stack ls` verified this
  run: `dev` + `prod` only — no `pr-<n>` exists yet (creation itself is now permitted).
- **Signed-in sessions — still impossible on previews (`D-OPS.1-1`, OPEN).** Every inbox gate
  step — `T2.badge`, `R8.inbox`, `X1.inbox` — needs a signed-in context; `JourneySessions` mints
  only through the real magic-link mailbox (real Resend key + gmail DWD on `test@rhema.tools`),
  and previews carry placeholder provider secrets + invite-mode signup **by design**
  (REQ-ARCH-38). No test-session seam exists on non-prod. Legs A/B (the `SURFACE_GATES.inbox`
  subset under each renderer pin) and the signed-in bulk of leg C cannot execute on `pr-<n>`
  regardless of infra spend — and the sessionless legs (N10-shaped) can't observe
  `data-renderer="spa"` at all, because every flagged surface is auth-gated.

**Disposition:** `D-SPA.6-1` stays OPEN — its leg (b) unblocks when BOTH halves exist (images now
authorized; preview session wiring still owed by `D-OPS.1-1`'s route). Compensating deterministic
legs cover the same contract: `inbox.dom.test.tsx` mounts the production router under flipped and
unflipped verdicts (SsrHandoff + no-BFF-spend asserted), `spa-flag.test.ts` pins the override
semantics, `check:dom-contract` pins SSR⇄SPA vocabulary parity, and `SURFACE_GATES["inbox"]` →
`T2.badge`/`R8.inbox`/`X1.inbox` are renderer-agnostic green steps.

## 4 — AC disposition

| AC | Status |
|---|---|
| `/bff/*` twin + envelope mutations — typed JSON, preserved statuses | **MET (deterministic)** — `GET /bff/app/inbox`; JSON branches on `/app/inbox/read` + `/read-all`; form 302s verbatim |
| React surface emits the full dom-contract vocabulary — component tests + axe | **MET (deterministic)** — 12/12 hooks, `expectManifestEmission` + axe on the mounted surface |
| Retained SSR tests green — fallback untouched | **MET** — `inbox-phone.test.ts` verbatim; the only `pages.tsx` touch is the invalid-nesting fix + the gate-card extraction (import-only) |
| Journey legs re-spec'd + `SURFACE_GATES['inbox']`; preview two-leg A/B/C green on `pr-<n>` | **PARTIAL** — T2/R8 split + `inbox → {T2.badge, R8.inbox, X1.inbox}` verified in-tree; preview legs **BLOCKED** (§3) → `D-SPA.6-1`/`D-OPS.1-1` stay OPEN |
| Rollback drill on preview | **BLOCKED** (§3) — compensating deterministic legs mounted instead |
| Entry gate: SPA.1–10 + SPAF.1 landed | **MET** — BUILD_INDEX 128–136 |
| Dev stage-fact line; prod untouched | **MET** — `dev.spaSurfaces=["usage","inbox"]`; preview `[]` / prod `["usage"]` pinned in test |

## 5 — Deviations + notes

- **`pages.tsx` got a real markup fix** (not just the extraction): the `<p>…<form>` nesting was
  invalid HTML whose parsed DOM differed from the source — repaired on both renderers at once so
  SSR stays the parity source.
- **Copy-containment grammar:** the scan treats `>` … `<` spans as JSX text — typed arrow params
  like `(e: FormEvent<HTMLFormElement>)` behind an `=>` read as "text". Handlers now rely on JSX
  prop-context inference; named helpers keep types in signatures the scanner doesn't traverse.
- **`gate-presence.ts` is browser-only** by construction — the first extraction pass put the
  presence logic inside `gate-card.tsx` and broke the server typecheck (no DOM libs); the split
  module is the fix and documents the boundary.
- `D-SPA.6-1` — OPEN, unchanged (§3). No new deferral rows — `D-OPS.1-1` already names the
  preview-session blocker this leg needs.
- **Size ~1.5k lines vs ~600 guide** — recorded per SPA.5–10 precedent (the surface + its test
  file + the journey split ARE the deliverable).

## 6 — Closeout addendum (post-PR)

- **PR:** #130 — `gh pr create --base stevevitali/spaf-1-prod-flip-usage` (stacked; **not
  merged** — `OPERATOR` policy).
- **Checks read (once, at closeout):** pending at write time; recorded honestly, not claimed.
- **Commits:** impl `2f31d14` · docs pre-closeout + this ledger — see the branch tip.
- **Build memory:** `runs/SPA.11.md` + `pr/SPA.11.md` committed · BUILD_INDEX row 137 · LEDGER
  `lastCompleted: SPA.11`, `nextTicket: SPAF.2`, `chainTip:
  stevevitali/spa-11-surface-inbox` · PHASE LOG entry appended.
- **Chain tip left behind:** `stevevitali/spa-11-surface-inbox` — next row (SPAF.2, prod flip:
  `inbox`) stacks here; SPAF.2's entry gate still requires D-SPAF.1-4's nightly green.
- **Spend:** $0 · zero production writes · zero deploys.
