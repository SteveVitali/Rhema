# R6: code-side UX audit (round-7 research row)

- **Date:** 2026-11-03. **Branch:** `stevevitali/r7-demo-spec` at `a34eb51`. **Mode:** read-only static audit. No source was changed and prod was not touched.
- **Counterpart:** the parallel prod browser audit. Every row below is a code fact with a file:line. Where a row is an inference about runtime behaviour (React event bubbling, CSS geometry), it is marked **[infer]**, and the browser audit should confirm or kill it.
- **Not run:** no build, no tests, no journeys, no browser. Bundle sizes come from the local `apps/web/public/spa` build already on disk, which may be stale relative to prod. A local build proves nothing about the deployed SHA.

## 0. TL;DR: eight root causes behind most of the operator's complaints

1. **There is no button or form-control styling layer.** `themeCss()` contains no `button`/`input`/`select`/`textarea` rules and never declares `color-scheme`. The only 16 control rules in `ideCss()` are scoped to IDE regions (rail, desk tabs, status bar, palette). `@rhema/ui` exports no Button or Field primitive. Result: about 166 of about 345 visible controls render as OS-default light widgets on a dark shell, and the other ~173 are hand-styled inline with 70 distinct padding values (§4).
2. **There is no persistent app shell.** `/_authenticated` renders a bare `<Outlet>`. Each workspace leaf mounts its own `<Shell>` with its own hand-picked `nav`. That is 14 different nav sets, against REQ-IDE-2 ("Rail is the only persistent global chrome, identical in workspace and project") (§3).
3. **Several common actions still cause document reloads:**
   - The brand link `/` on every Shell page reloads twice (`/` → 302 → `/app`).
   - Chat send, the Timeline approval cards and the explainer dismiss are native form POSTs that reload the page.
   - Note and cancel-run redirect through `/edit/:id`, a reload stub.
   - Opening a project with a finished run triggers a `reloadDocument` handoff.
   - The seeded **Showcase** project, which is the first project every new user opens, is always forced to a server-rendered document (SSR), so everything reachable from it navigates as a classic multi-page site (§2).
4. **The Timeline pane defaults open, and below 1280 px it becomes an `position:absolute` overlay with no scrim and no dismiss gesture.** Between 1024 and 1279 px it covers the right ~60–170 px of the draft text and every finding tick. Between 768 and 1023 px it is a bottom sheet covering 55% of the page. The tested `paneLayout()` has no runtime caller (§6).
5. **"QUIET" works as specified, but the spec is wrong for a solo writer.** Quiet is the catch-all group: anything not running, not waiting on the user, and not an unread review. It is collapsed by default (REQ-IDE-4), and its header carries a voice-filing sub-count ("N Unfiled · M with a Voice") that mixes two taxonomies. Almost every project therefore lands inside one collapsed "QUIET" bucket (§5).
6. **Raw error codes reach users.** `err.detail ?? err.code` is rendered in 7 places. Native-form failures (chat) render the server's raw JSON as a full page.
7. **The editor has no formatting UI.** There is no toolbar and no bubble menu. The only shortcuts are ⌘B, ⌘I, ⌘`, ⌘⇧S and the Markdown input rules. There is no link command. Commenting is a form at the bottom of the page, not a selection → comment flow. The selection popover offers paid verbs only (§6.3).
8. **Snappiness:**
   - Bundles are fine: main is ~93 kB gzipped against a 250 kB ceiling.
   - The latency comes from repeated cold boots (point 3), no prefetch at all (REQ-UX-2 overridden), a serial handoff POST before every project open, chrome that unmounts and remounts across leaves, and fonts that are not preloaded (§7).

## 1. Charter rubric (binding items, with code status)

Sources are abbreviated as follows. DS = `docs/rhema-design-spec.md`. SPA = `docs/frontend-spa-spec.md`, which is canonical. d2, d24 and d25 are `docs/design/{2,24,25}_*.md`. ✗ = the code visibly violates the item, ~ = partial, ✓ = holds. The last column lists the UXC row ids that carry the evidence.

| # | REQ / § | Requirement (one line) | Source | Code | UXC |
|---|---|---|---|---|---|
| 1 | REQ-UX-1 | No document reloads inside the signed-in app; the IDE shell mounts once per project | d24:136, SPA:213 | ✗ | N1–N8 |
| 2 | REQ-NAV-9 / §14.19 | One delegated click interceptor; only the enumerated exceptions take document navigation (`/logout`, Stripe/OAuth, binaries, stubs) | SPA:694-725 | ~ (the interceptor is correct; forms and redirects leak) | N2–N6 |
| 3 | REQ-NAV-11 | Mutation outcome is a push; apply-then-strip is a replace | d25:274 | ~ | N3 |
| 4 | REQ-UX-2 → REQ-NAVM-7 | Hover/focus prefetch, formally overridden (no `defaultPreload:"intent"`) | SPA:744-748 | ✓ as overridden, but it costs speed | P2 |
| 5 | REQ-IDE-1 | Every object has a stable URL; opening it restores the layout with the target focused | DS:396 | ~ | — |
| 6 | REQ-NAV-10 | Surface-scoped 404s, never a generic error page | d25:265 | ~ (bare `<main>`, no chrome) | E3 |
| 7 | REQ-IDE-2 | The Rail is the only persistent global chrome, identical in workspace and project, with the Inbox badge always visible | DS:370, 781 | ✗ | C1 |
| 8 | DS §4 | Rail items: Projects · Voices · Inbox · Usage · Settings | DS:364-365 | ✗ (the IDE rail has Home · Inbox · View · Settings) | C2 |
| 9 | DS §4 | Workspace = lists and details; IDE = panes; "nothing else exists" | DS:371 | ✗ (6 project-scoped pages render outside the IDE) | C3 |
| 10 | REQ-PROD-7 / copy | "Voices", "Approval"; fixed vocabularies | DS:372, 408, 419 | ✓ mostly | — |
| 11 | REQ-UX-5 | Generated CSS over tokens; semantic classes + `var(--*)` inline; new shared classes join the generator | d24:140, SPA:212 | ✗ in spirit (2,013 inline `style={}`; no control classes) | S1–S4 |
| 12 | REQ-UX-16 | Hover and focus states on controls; skip link; pending state per route | d24:151 | ✗ (raw controls have no hover state) | S1 |
| 13 | REQ-UX-13 | `.paper` remaps `--shell-*`; components never read `--paper-*` directly | d24:148 | ✗ (compare and what-changed read `--paper-diff-*`, which is undefined) | D4 |
| 14 | REQ-IDE-38 | Token palette and contrast floors; 4-pt spacing; radii 4/8/12 | DS:721-736, d2:692 | ~ (radii 6/7/10/999 and paddings off-scale) | D1 |
| 15 | REQ-IDE-39 | Paper type: Literata 17/1.55; shell UI 14/13/12 | DS:738 | ~ (shell uses 10.5/11/11.5/12.5/15/16) | D2 |
| 16 | REQ-IDE-8 | 7 regions; Files and Desk start closed; Margin only when findings exist; pane state per user per project | DS:447-461 | ~ (Timeline starts open at every width) | L1 |
| 17 | DS §5.1 | Widths 56/240/660/280/320 and the yield order at 1600/1280/1024/768 | DS:457 | ~ (CSS implements it; the overlay occludes) | L1–L3 |
| 18 | REQ-IDE-9 | Page clamped to 45–80 ch, target 68; drags collapse the neighbour rather than break the clamp | DS:459-461 | ~ (no clamp guard for overlays) | L1 |
| 19 | DS §5.1 | Focus ⌘⇧F; View menu ⌘⇧M | DS:459 | ✓ | — |
| 20 | REQ-IDE-23/24 | Findings as decorations; linked selection across Margin, Desk and triage | DS:520, 645 | ✓ (decorations plugin, linked selection) | — |
| 21 | REQ-UX-8 / REQ-IDE-49 | Scoped finding keys; ⌘K palette; `?` cheat sheet | DS:785-799 | ✓ in the IDE, ✗ on `/app` (§5.2 promises "Search ⌘K") | ED4 |
| 22 | REQ-IDE-43 | The sync pill is the only autosave UI | DS:750 | ✓ | — |
| 23 | REQ-UX-3 | Every surface has a pending render; the paper never shows a spinner | d24:138 | ~ (pending drops all chrome) | P3 |
| 24 | REQ-UX-4 | Optimistic safe actions; no mutation resets scroll or focus | d24:139 | ✗ wherever a native POST reloads | N3–N5 |
| 25 | R25 / REQ-SAFE-7 | gzip ceilings: entry 250 kB, editor 400 kB, total JS 800 kB, CSS 60 kB | SPA:59, 614 | ✓ (main ~93 kB, editor ~160 kB) | — |
| 26 | DS SLOs | Landing LCP <2.5 s, CLS <0.05; first finding <90 s | DS:2847, 2872 | ? (no font preload → possible CLS) | P4 |
| 27 | REQ-IDE-41 / REQ-UX-14 | Designed state catalogue; the only blocking modal is Cancel-run | DS:744 | ~ | E1–E3 |
| 28 | REQ-UX-12 | `@rhema/ui` carries no text; every string is a COPY leaf | d24:147 | ✗ (hard-coded strings in ui, ide and state-map) | D5 |
| 29 | REQ-UX-7 / REQ-NAV-7 | WCAG 2.2 AA; title update + h1 focus or live region; overlays return focus | d24:142 | ~ | A1 |
| 30 | REQ-IDE-42 | 2-px focus ring; no colour-only encoding; 200% zoom | DS:742 | ✓ (global `:focus-visible`) | — |
| 31 | REQ-GROWTH-2/17 | One token set; light and dark variants of every surface at AA; no flash of the wrong theme | DS:736, 2876 | ~ (no `color-scheme` → native controls ignore the theme) | S1 |
| 32 | REQ-UX-10 | Phone capability comes from the server; desktop-only subtrees never enter the DOM | d24:145 | ~ (the UA regex also catches Android tablets) | L4 |
| 33 | REQ-MOBILE-3 | Phone: read-only Page + approvals, dispositions, chat; targets ≥44 px | DS:1667, d24:63 | ✓ (UX.2) | — |
| 34 | DS §15 | Marketing nav: Product · Workflows · Pricing · Changelog · Docs · Sign in · CTA; landing "on par with frontier AI products" | DS:2827, founding:9 | ✗ (Pricing · Sign in · CTA in the 880-px beta Shell) | C4 |
| 35 | REQ-IDE-4 / §5.2 | Attention groups; Quiet collapsed; new projects Unfiled | DS:465-487 | ✓ as written, but the operator rejects it | Q1 |
| 36 | REQ-IDE-10 | Default / On demand / Advanced tiers; no modal tours | DS:461 | ✓ | — |
| 37 | Founding | "Rival Cursor/Codex/Claude Code in intuitiveness, elegance, simplicity"; autosave with no data loss | 1_founding-prompt.md:9 | ✗ (see everything above) | all |

There is no binding selection → comment or formatting-toolbar requirement in the docs. The founding prompt asks for a "beautiful formatted editor UI", and DS treats comments on the Page as Guidance (DS:524, 755). ED1 treats the toolbar gap as a charter gap, not a REQ violation.

## 2. Navigation: every remaining source of full-document navigation

The interceptor itself (`apps/web/src/spa/nav-intercept.ts:44-120`) is correct and follows the spec. The leaks are below and around it. "Intended" means the spec requires the reload.

| # | Trigger | Evidence | Why it reloads | Fix direction |
|---|---|---|---|---|
| T1 | Brand wordmark on every `<Shell>` page (14 surfaces) and the 404 "Home" link | `packages/ui/src/shell.tsx:33` `href="/"`; `apps/web/src/spa/states.tsx:111` | `/` is in `SPA_PUBLIC_ROUTES` (`packages/contracts/src/spa.ts:117`), so it is out of tree and goes native. The server then 302s signed-in users to `/app` (`server.ts:2333`): **two** document loads. | Shell takes a `homeHref` prop; authed surfaces pass `/app`. Better: the AppShell (WP3) owns the brand. |
| T2 | Chat: composer, notes, pins, plan decision, correction, suggestion (9 forms) | `packages/ui/src/chat-panel.tsx:230-440`; `apps/web/src/spa/surfaces/editor.tsx:372`, `run-report.tsx:233` (`chatBody` with no interceptor); the dossier wraps chat in `PaneIntercept` (`dossier.tsx:394`), but `DOSSIER_WRITE` (`dossier.tsx:79-80`) has no `chat/` paths | Native POST, then `c.redirect` (`server.ts:1675, 1686`, and the success leg). No JS enhancement exists anywhere: there is no `chat-composer` handler in `spa/` or `client/`. An empty send returns `c.json({error:"threadId + message required"},422)` (`server.ts:1668`), so the browser shows **raw JSON as the page**. | Give chat a mutation and a streaming read (the turn POST returns JSON, then the SSE/Query invalidate). Server: `wantsJson` dual-mode on all `/chat/*`. |
| T3 | Timeline approval card (Approve/Decline) and the explainer dismiss, rendered via `renderGateCard` | `apps/web/src/spa/surfaces/dossier.tsx:263-290` (`TimelineGateCard`), mounted at `editor.tsx:367`, `dossier.tsx:402`, `run-report.tsx:229`; forms at `packages/ui/src/gate-card.tsx:484, 543` | **[infer]** The card renders inside IdeShell's `<aside class="ide-timeline">`. React's synthetic `submit` bubbles through the React tree to IdeShell, never to the surface `<div onSubmit>`, so `EDITOR_WRITE` (`editor.tsx:76`), which already lists `gates/…`, never sees it. Native POST → 302 → reload. A test covers only the focused gate in the Page body (`dossier.dom.test.tsx:499-520`). | One delegated `onSubmit` at the `IdeChrome` host covering every pane body (generalise `PaneIntercept`), with one shared write-path allowlist. |
| T4 | Note, cancel run, and revise on the Page | `server.ts:5824` (`/edit/:id?noted=1`), `server.ts:5843`; `editor.tsx:186-196` routes `env.redirect`; the route at `routes/_authenticated/p.$project.edit.$draftId.tsx:10` throws `reloadDocument` | The success redirect targets the `/edit/:draftId` stub, which is in `RELOAD_STUB_IDS` (`nav-intercept.ts:33-37`). | Server redirects straight to `/p/:slug/v/:n?noted=1` (the stub's own target). Retire the hop from all write responses. |
| T5 | ⌘K palette result for a draft | `server.ts:1540` path `/p/${slug}/edit/${refId}` | Same stub. | Emit `/p/:slug/v/:n`. |
| T6 | Opening a project that has an unread `run_finished` row | `routes/_authenticated/p.$project.index.tsx:36-40` `redirect({href, reloadDocument:true})` | The comment cites "flag-safety the SSR 302 had", but there are no flags any more (SPA.28). | `redirect({href})` in-router. Also move the POST off the critical path (P1). |
| T7 | `/p/:p/v/working` miss arm | `routes/_authenticated/p.$project.v.$v.tsx:37, 60` | `reloadDocument:true` on `twin.redirect` (→ `/p/:slug`), which is an in-tree target. | In-router redirect. |
| T8 | **Showcase project**: every Page-family route | `states.tsx:68-72` `twinForcesSsr`; `server.ts:3950` `forcedSsr = isPhoneRequest(c) \|\| row.showcase === true`; leaves at `p.$project.v.$v.tsx:63` and others → `SsrHandoff` → `replaceDocument` (`states.tsx:34-38`) | REQ-ED-12 forces the read-only Page to SSR. The SSR document mounts the `ide.js`/`page.js` islands, not the SPA, so **every link from there is a native navigation**. The Showcase is seeded into every workspace as the first-value surface (DS:180), so a new user's first minutes run as a multi-page site. | Render showcase read-only in the SPA (`readOnly`, no collab), keep SSR for phone only. This needs a ruling (Q3), and it overlaps R7 demo mode. |
| T9 | Phone UA: all 5 `pageMount` routes | `packages/contracts/src/spa.ts:166-171`; `apps/web/src/device.ts:12-14` | By design (REQ-ED-12/REQ-UX-10). `/Android/i` also routes Android **tablets** to the phone SSR. | Narrow the regex to `Mobi`; tablets get desktop. |
| T10 | `/p/:p/f/:fid`, `/app/usage/r/:runId` | `nav-intercept.ts:33-37` | Intended (blob and API passthrough). | Keep, and mark with `data-spa-native` for clarity. |
| T11 | `/pricing/rates` link in the run report; `/pricing`, `/showcase` from the app | `run-report.tsx:285` | Public SSR, intended. It does leave the app chrome entirely, though. | Open in a new tab, or render the rate table in-app. |
| T12 | Logout, Stripe and OAuth handoffs, binary exports (`/usage.csv`, `/export/ai-use/*`) | `project-home.tsx:261`; `navigateDocument(env.url)` in billing, settings, voices, onboarding, run-sheet, dossier and editor | Intended (SPA:714-725). | Keep. |
| T13 | 401 from any `/bff` read | `bff.ts:38`, `routes/_authenticated.tsx:20` | Intended. | Keep. |

SSR still serves the public funnel and legal pages (intended), the phone and showcase Page family (T8/T9), and the SSR not-found fallback. `client-entries.mjs` keeps `ide`, `page` and `landing`. `apps/web/src/client/ide.ts` (1,152 lines) re-implements the SPA's `spa/ide/controller.ts` (1,195 lines). The two will drift, and every showcase or phone visit runs the island copy.

## 3. Nav chrome: every distinct header

| Surface | Component / file:line | Nav items (left → right) |
|---|---|---|
| Landing `/` | `<Shell>` `apps/web/src/marketing.tsx:72-81` | Rhēma · tagline · Pricing · Sign in · [Get started] |
| Pricing | `marketing.tsx:247-256` | Rhēma · tagline · **Rhēma** (duplicate) · Sign in |
| Showcase (public) | `marketing.tsx:575-586` | Rhēma · tagline · Pricing · (Sign up \| All projects) |
| Signup / Login / Legal | `marketing.tsx:476`, `pages.tsx:254`, `legal.tsx:119` | Rhēma only (no nav) |
| Invite | `pages.tsx:201` | Rhēma · tagline · Sign in |
| Project home `/app` | `spa/surfaces/project-home.tsx:245-268` | Rhēma · Balance chip (→`/usage`) · Voices · Settings · Sign out. **No Inbox, no Usage label.** |
| Inbox | `spa/surfaces/inbox.tsx:164-172` | Rhēma · All projects · **Billing** |
| Settings (account etc.) | `spa/surfaces/settings.tsx:282` + `SettingsNav` `:236-262` | Rhēma · All projects; sub-nav Account · Preferences · Notifications · Integrations · Billing · Data |
| Billing | `spa/surfaces/billing.tsx:210, 229` | Rhēma · All projects + SettingsNav |
| Billing return | `billing.tsx:458` | Rhēma · Billing |
| Project settings | `settings.tsx:976-985` | Rhēma · Back to the project · Settings. The null-data path shows **billing's** "Billing is temporarily unavailable" copy (`settings.tsx:963-966`, `copy.ts:1560`). |
| Usage / project usage | `spa/surfaces/usage.tsx:42, 163-166` | Rhēma · All projects / Back to the project |
| Voices list / detail | `spa/surfaces/voices.tsx:358, 404, 413, 905` | Rhēma · All projects / All voices; tabs `voices.tsx:524` |
| Voice reseed | `voices.tsx:1318` | Rhēma · **"All voices" pointing at `/p/${slug}`** (wrong label for the target) |
| New project | `spa/surfaces/onboarding.tsx:384-387, 686, 697` | Rhēma · tagline · All projects |
| Outline, Figures | `spa/surfaces/outline.tsx:218-340`, `figures.tsx:114-489` | Rhēma only; the "Back to the project" link sits in the **body** (`outline.tsx:231`, `figures.tsx:126`) |
| Obligation new | `dossier.tsx:502` | Rhēma · *project title* |
| IDE (editor, dossier, run sheet, run report, export, import) | `IdeShell` `packages/ui/src/ide-shell.tsx:186-205` | Rail: ⌂ Home · ◎ Inbox(badge) · ▤ View · ⚙ Settings. Phonebar: ← Home · title · ◎ |
| Pending / 404 / error | `spa/states.tsx:44-52, 101-130` | **No chrome at all** (bare `<main><h1>`) |

Differences across these headers:

- There are four back-link idioms: "All projects", "Back to the project", a project title, and a link in the body.
- Inbox appears only in the IDE rail. Usage is reachable only through the balance chip on `/app` (`packages/ui/src/chips.tsx:104`). Voices are absent from the IDE. Billing appears on Inbox but not on `/app`.
- Sign out exists only on `/app`.
- Every leaf owns its header, so moving between workspace pages unmounts and remounts the chrome. The pending state renders with no header at all, so the header flashes.
- Project-scoped pages outside `SPA_IDE_FRAMED_ROUTES` (`packages/contracts/src/spa.ts:65-77`) leave the IDE entirely: outline, figures, settings, usage, obligations/new and voice/reseed. Outline is a core artifact, and opening it drops the rail, Files, Timeline and chat.

## 4. Styling coverage

**CSS inventory.** There are **no `.css` files** in `apps/web` or `packages`. Exactly two generated stylesheets exist:

- `themeCss()` (`packages/tokens/src/theme-css.ts:53-161`, about 7.5 kB): tokens, `body`, `a`, `:focus-visible`, `.paper`, the pulse animation, reduced motion and print.
- `ideCss()` (`packages/tokens/src/ide-css.ts`, about 25.9 kB): IDE regions only.

Both are inlined into every SPA shell (`apps/web/src/spa-shell.ts:228`). SSR non-IDE documents carry only the theme stylesheet (`apps/web/src/render.tsx:128`). The light theme is opt-in through `[data-theme="light"]`. Nothing anywhere sets `color-scheme` (grep empty), so native controls and scrollbars always render in the UA's light style.

**Controls census.** I ran a static classifier over `apps/web/src/spa/surfaces/*.tsx`, `apps/web/src/*.tsx` and `packages/ui/src/*.tsx`, excluding tests and hidden inputs:

| Control | No styling or font-size only | Inline background/border | className |
|---|---|---|---|
| `<button>` | 69 | 76 | 10 |
| `<input>` | 52 | 78 | 1 |
| `<select>` | 41 | 4 | 0 |
| `<textarea>` | 4 | 15 | 0 |

By file (raw / total):

| Area | Raw / total by file |
|---|---|
| Settings | `settings.tsx` 38/48 |
| Workspace | `chat-panel.tsx` 17/17, `run-sheet.tsx` 12/17 plus ui `run-sheet.tsx` 12/18, `voices.tsx` 9/55, `project-home.tsx` 7/9, `billing.tsx` 7/13, `export.tsx` 7/8, `page-editor.tsx` 6/7, `approval-settings.tsx` 6/10, `page-chrome.tsx` 6/9, `onboarding.tsx` 5/12, `findings-desk.tsx` 4/4 |

Some IDE-region raw buttons get descendant rules (`.ide-rail button`, `.ide-statusbar button`), so the IDE is less affected than workspace pages.

Typical raw controls:

- `project-home.tsx:299` `<button type="submit" style={{ fontSize: "13px" }}>`, the search submit.
- `project-home.tsx:303-307`, a group-by `<select>` plus an "Apply" button.
- `billing.tsx:315-421`, every billing CTA.
- `page-editor.tsx:374, 393`, Revise and Cancel run.
- `settings.tsx:624`, the quiet-hours `<select>`.

**Inconsistency among the hand-styled controls.** Across 2,013 `style={…}` props there are 70 distinct `padding` literals. Radii: 8px ×80, 6px ×41, 999px ×18, 10px ×14, 4px ×12, 7px ×10, 12px ×9. Tokens define only 4/8/12. Primary buttons are each re-declared by hand, for example `figures.tsx:301, 368, 391, 532`, `dossier.tsx:526`, `onboarding.tsx:638, 789` and `outline.tsx:259`. Some carry `cursor:pointer` and some do not. None has a hover or disabled state.

**SSR and SPA use the same CSS**, so there is no divergence by stylesheet. The divergence is in **behaviour**: the `ide.js` island versus `controller.ts`.

## 5. The "QUIET" filing

- **What it is in code.** It is the fourth §5.2 attention group. The API derives it in `apps/api/src/project-list.ts:130-135`: `needs_you` if a gate is waiting, `running` if a run is live, `ready_to_read` if the state is `reviewed` and the letter is unopened, **otherwise `quiet`**. The web side maps it in `apps/web/src/state-map.ts:184-213`:
  - The labels are hard-coded rather than COPY: `GROUP_LABELS.quiet = "Quiet"` at `:174-179`.
  - Rows with no group fall back to quiet at `:195`.
  - `collapsed: key === "quiet"` is at `:211`.
  - The summary at `:197-200` is `"${unfiled} Unfiled · ${n} with a Voice"`.
  - `ProjectGroupList` (`packages/ui/src/project-list.tsx:339-409`) renders it as an uppercase (`textTransform:"uppercase"`, `:315`), collapsed `<details>`: "▸ QUIET · 7 — 5 Unfiled · 2 with a Voice · Show".
- **Where the default comes from.** Everything that is not transient lands in Quiet: a fresh project, a draft with no review, a review whose letter was opened, and accepted or exported projects. For a solo writer, Needs you, Running and Ready to read are short-lived, so the steady state of `/app` is one collapsed QUIET bucket. "Unfiled" is the voice-grouping word (REQ-IDE-6: new projects default to Unfiled). Putting it in the attention header makes it read as a filing location, which explains the operator's term "QUIET filing".
- **Alternatives already in code.** `?groupBy=voice` (`groupByVoice`, `state-map.ts:216+`), which lists Unfiled first, plus filters for voice, protocol and sort.
- **What the charter says.** DS §5.2 (DS:465-487) and REQ-IDE-4 (d2:111; DS:3150) specify exactly this: Quiet collapsed by default, labelled verbatim on mobile S2 (DS:1696). d11:46 had flagged "Quiet vs Idle". HOT.1 only added a disclosure cue, PR-J5/BL-54. **The code complies with the spec. The problem is product judgement, and fixing it requires a spec amendment.** See Q1.

## 6. Editor and IDE layout

### 6.1 Geometry, computed from `LAYOUT` (`packages/tokens/src/tokens.ts:207-232`) and `ide-css.ts:110-134`

Defaults are `DEFAULT_PANE_STATE` (`packages/ide/src/state.ts:14-27`): Files is a strip, **Timeline is open**, the Desk is closed (it opens at 280 px while a run is live, `ide-shell.tsx:161`), and Margin cards show when findings exist. The paper is `68ch` ≈ 660 px including 2 × 32 px padding.

| Viewport | Mode | Panes | Page region | Effect **[infer; confirm in the browser audit]** |
|---|---|---|---|---|
| 1920 | wide | 56 + 36 + 280 + 320 + 2 × 5 handles = 702 | ~1,218 | Fine. |
| 1440 | wide | 702 | ~738 → paper 660 | Fine. **With Files open (<1600):** Margin becomes ticks and Timeline becomes an absolute overlay. The paper spans x≈520–1180 and the overlay x≈1120–1440, so ~60 px of text and every tick are covered. |
| 1280 | wide | 702 | ~578 → paper squeezed to ~546 (text ≈ 50 ch) | Below the 68-ch target, but not occluded. |
| 1024–1279 | narrow | Margin ticks 36; Timeline overlay `right:0; width:min(320px,85vw); z-index:20` (`ide-css.ts:126-129`) | ~886 at 1024 | Overlay x≈704–1024 against paper x≈210–870: **~166 px of body text plus all finding ticks covered.** No scrim, no outside-click or Esc close (`controller.ts` handles Esc only for menus and palette, `:908, 935, 952`), and the open state is persisted to localStorage. |
| 768–1023 (iPad portrait) | single | Timeline open → bottom sheet at 55% height (`ide-css.ts:133`); Files → drawer | — | **The bottom 55% of the Page is covered on first load.** |
| <768, desktop UA | CSS phone | rail, files, timeline, desk, margin and status bar `display:none !important` (`ide-css.ts:139`) | full | Full-capability DOM with no way to reach the hidden panes (the phonebar has only Home and Inbox). |
| Phone UA | SSR read-only | — | — | Intended (REQ-MOBILE-3); also catches Android tablets (`device.ts:13`). |

`paneLayout()` (`packages/ide/src/layout.ts:70-120`) is the tested source of this yield logic, and it computes `pageCh`. It has **no runtime caller**: the grep finds only tests. The CSS breakpoints run alone, so no JavaScript adjusts defaults per viewport or protects the 45-ch floor (REQ-IDE-9).

### 6.2 Other layout issues

- At ~768-px laptop heights, an open Desk (280 px) plus the 28-px status bar leaves about 370 px for the Page.
- The resize handles are `aria-hidden tabIndex=-1` (`ide-shell.tsx:236, 268`), so pane sizes cannot be changed from the keyboard.
- The rail's ⌂ ◎ ▤ ⚙ are Unicode glyphs (`ide-shell.tsx:196-203`). Inter does not cover all of them, so the OS fallback glyph varies across platforms. The only SVG in the app is the brand (`apps/web/src/brand.ts`).

### 6.3 Editor ergonomics compared with the charter (founding:9 "beautiful formatted editor"; DS §5.4)

- **Keymap.** `packages/editor/src/plugins.ts:163-180` binds ⌘Z/Y, ⌘B, ⌘I, ⌘`, ⌘⇧S, list Tab/⇧Tab, and Markdown input rules for headings, quotes, lists and code fences (`:149-161`). It has **no link command (⌘K is taken by the palette), no heading or paragraph shortcuts, no block-type menu, and no toolbar or bubble menu**. Users who do not know Markdown cannot format.
- **Selection popover.** `packages/ide/src/menus.ts:29-39` offers Ask · Visualize · Fact-check · Review this section · Line edit · Cut to length. These are agent verbs, some of them paid. There is **no Comment/Note, no formatting and no copy-link**. The strings are hard-coded English inside `@rhema/ide`.
- **Comments.** The note form sits at the bottom of the Page (`page-editor.tsx:511-519`) as a native `<form>`, and its submit lands T4's reload. It is not anchored to a selection.
- **Page header crowding.** The sync pill, the version/fork banner (Revise button), the lock banner (Cancel run) and the proposal cards all stack **inside the paper sheet** above the text (`page-editor.tsx:352-430`), each with raw `fontSize:12px` buttons. The prose starts lower and the paper metaphor breaks.
- **Overview versus the draft.** `/p/:slug` renders `ProjectOverviewBody` (approvals, triage, voice, then the page host) (`editor.tsx:467-486`, `page-chrome.tsx:371+`). To reach the editable draft the user goes to `/v/working` (`page-chrome.tsx:481`). Coding IDEs open straight to the file.
- **What works.** Findings decorations (`packages/editor/src/decorations.ts`; `.rm-finding-*` rules in `ide-css.ts:260-280`), linked selection, J/K keys, ⌘⇧F focus view, the cheat sheet and the measure clamp tokens. Typography tokens are correct (Literata 17/1.55, measure 68 ch).

## 7. Performance and snappiness levers

| Lever | State | Evidence |
|---|---|---|
| Bundles | Healthy. Local gzip: `main` 92.7 kB, `editor` 159.7 kB, CodeMirror 89.3 kB, `dist-*` 74.3 kB; leaf chunks 4–10 kB | `apps/web/spa-budget.json`; `public/spa/assets` |
| Document reloads | Each one re-pays shell + main + leaf + twin + editor chunk + collab connect | §2 |
| Prefetch | None: router preload disabled because some loaders have side effects | `apps/web/src/spa/main.tsx:54-62` (REQ-NAVM-7) |
| Project open | `beforeLoad` awaits `POST /bff/p/:slug/handoff` before any loader starts, a serial round trip on every project entry | `p.$project.index.tsx:30-40` |
| Pending UI | `PendingShell` → `SurfaceShell` paints a bare `<main><h1>` plus skeleton with **no Shell or rail**, so the chrome flashes away | `states.tsx:44-58` |
| Query freshness | `retry` is tuned; few `staleTime` overrides (`queries.ts:89` 30 s, `:100` ∞); everything else defaults to 0, so warm data refetches on mount | `queries.ts` |
| Fonts | Literata variable woff2 (110 kB normal plus 113 kB italic) and Inter (48 kB), `font-display: swap`, **no `<link rel=preload as=font>`**, so the reading face swaps in visibly | `theme-css.ts:32-44`; grep shows no preload |
| Optimism | Mutations wait for the server, then `invalidateQueries({queryKey:["bff"]})`, which invalidates *everything* | `project-home.tsx:207-210`, `dossier.tsx:491` |
| Authenticated first paint | The SPA shell has no SSR content, so the first paint is a skeleton until the JS and the twin arrive | `spa-shell.ts` |

Recommended levers, none of which needs router preload:

- Query-level `prefetchQuery` on `pointerenter`/`focusin` for side-effect-free GET twins only.
- Move the handoff check into the twin GET's response so it is not a pre-loader POST.
- A persistent AppShell, so pending renders inside the chrome.
- Preload `literata-…-normal.woff2` and `inter-…woff2`.
- Scoped invalidation keys.
- Optimistic updates for safe toggles (REQ-UX-4).

## 8. Design-system health

- **Colour tokens.** Usage is good: only a handful of hex fallbacks remain. `compare.tsx:62-64` and `what-changed.tsx:65-66` read `--paper-diff-add/del`, which are **undefined**, so they always fall back to light-tuned `rgba(30,130,60,.07)`, which is nearly invisible on the dark paper. `--sev-ok` (`outline.tsx:238`) is undefined.
- **Dark/light.** There is one token set. Dark is the default; Light and Auto are opt-in. Native controls ignore the theme because `color-scheme` is never declared.
- **Type scale.** Out-of-scale sizes are used: 11px ×43, 10.5 ×9, 11.5 ×3, 12.5 ×11, 15 ×14 and 16 ×14, against the 14/13/12 shell scale. `PageTitle` (h1) and `SectionTitle` (h2) are both 20 px (`packages/ui/src/shell.tsx:69-82`).
- **Icons.** There is no icon set, only Unicode glyphs (▤ × ⌂ ◎ ⚙ ▸ ✓).
- **Empty and error states.**
  - `err.detail ?? err.code` is shown verbatim in `editor.tsx:204`, `dossier.tsx:233, 487`, `run-report.tsx:191`, `voices.tsx:254`, `onboarding.tsx:229` and `figures.tsx:195, 453` (the last puts the code into a `?notice=`).
  - Server `error` values are often prose rather than codes, for example "threadId + message required" and "project not found" (`server.ts:1663-1668`).
  - Native-form failures render as raw JSON documents.
- **Copy ownership.** The following strings are hard-coded outside COPY: "Project actions" and "· Show"/"· Hide" (`project-list.tsx:249, 392, 395`), `aria-label="Status"` (`ide-shell.tsx:370`), "Files" (`files-pane.tsx:116`), menu labels (`packages/ide/src/menus.ts`), and the group labels (`state-map.ts:174`).
- **Accessibility.** Basics hold: a global 2-px focus ring, a skip link, aria-labels on glyph links, and UX.2's phone target floor. Gaps: raw controls have no hover or disabled styling, resize is not keyboard-operable, and the overlay Timeline does not trap or return focus.
- **Duplication.** `PhoneBlockedNote` exists in both `pages.tsx:78` and `page-chrome.tsx:68`. The `ide.ts` island duplicates `controller.ts`.

## 9. Findings

Severity: P0 = broken, P1 = violates the charter and is visible, P2 = polish. Size: S = under a day, M = 1–3 days, L = more than 3 days.

### Navigation (N)

| id | sev | Evidence | User-visible symptom | Root cause | Fix direction | Size |
|---|---|---|---|---|---|---|
| UXC-1 (N2) | **P0** | `chat-panel.tsx:440`; `server.ts:1660-1700`; `dossier.tsx:79-80` | Every chat send reloads the whole IDE. An empty send shows a raw JSON page. | Chat is form-only with no JSON path, and no interceptor covers it. | Chat mutation + JSON dual-mode + Query/SSE refresh; client-side empty guard. | M |
| UXC-2 (N3) | P1 | `dossier.tsx:263-290`; `gate-card.tsx:484, 543`; `editor.tsx:367` | Approving from the Timeline card reloads the page and resets scroll and focus. | Forms in pane bodies sit outside the surface's React `onSubmit` subtree. | One chrome-level delegated submit plus a shared write allowlist. | S–M |
| UXC-3 (N1) | P1 | `shell.tsx:33`; `server.ts:2333`; `states.tsx:111` | Clicking the logo reloads twice and flashes the marketing route. | `href="/"` is a public SSR route. | `homeHref` prop / AppShell. | S |
| UXC-4 (N4/N5) | P1 | `server.ts:1540, 5824, 5843`; `nav-intercept.ts:33-37` | Saving a note, cancelling a run, or opening a draft from ⌘K reloads the page. | Redirects target the `/edit/:id` reload stub. | Redirect to `/v/:n` directly. | S |
| UXC-5 (N6/N7) | P1 | `p.$project.index.tsx:39`; `p.$project.v.$v.tsx:37, 60` | Opening a project after a run finishes reloads the page. | Stale `reloadDocument:true` on in-tree targets. | In-router redirect. | S |
| UXC-6 (N8) | P1 | `states.tsx:68`; `server.ts:3950` | The Showcase (the first project) behaves like a classic multi-page site, and every click reloads. | REQ-ED-12 forced-SSR showcase leg. | SPA read-only render for showcase (Q3). | M |
| UXC-7 | P2 | `client/ide.ts` (1,152 lines) vs `spa/ide/controller.ts` (1,195 lines) | Showcase and phone IDE behave differently from the SPA. | Two controllers. | Shrink the island to the phone subset after UXC-6. | M |
| UXC-8 (T9) | P2 | `device.ts:13` | Android tablets get the read-only phone Page. | `/Android/i`. | Use `Mobi` / client hints only. | S |

### Chrome / IA (C)

| id | sev | Evidence | Symptom | Root cause | Fix direction | Size |
|---|---|---|---|---|---|---|
| UXC-9 (C1) | P1 | `routes/_authenticated.tsx:28` (`component: Outlet`); 14 `<Shell nav=…>` call sites (§3) | Nav items change page to page; Inbox, Usage and Sign out appear and disappear. | No persistent authenticated layout; per-leaf headers. | `AppShell` layout route: left Rail (Projects · Voices · Inbox(badge) · Usage · Settings · account menu) shared with the IDE rail (REQ-IDE-2). | M |
| UXC-10 (C2) | P1 | `ide-shell.tsx:195-204` | Voices and Usage cannot be reached from inside a project; "View" sits in the global rail. | Rail items diverge from DS:364. | Same item set as the AppShell; View moves to the status bar or menu. | S |
| UXC-11 (C3) | P1 | `packages/contracts/src/spa.ts:65-77`; outline, figures, settings, usage, obligations and reseed leaves | Opening the outline or figures drops you out of the IDE, and the way back is a link in the body. | Those routes are unframed. | Frame them (Page content inside IdeChrome) or open them as Files entries; at minimum use the AppShell. | M |
| UXC-12 | P2 | `voices.tsx:1318`; `settings.tsx:963-966`; `inbox.tsx:169`; `marketing.tsx:252` | Wrong labels: "All voices" goes to the project; project settings outage shows billing copy; Inbox shows a Billing link; Pricing duplicates the brand. | Hand-picked nav per leaf. | Removed by UXC-9; fix the copy keys. | S |
| UXC-13 (C4) | P1 | `marketing.tsx:64-81`; `shell.tsx:39-49` (880-px column) | The landing page looks like the beta shell, not a frontier product page. | The landing reuses the `REQ-BETA-21` stopgap Shell. | A dedicated marketing layout and nav per DS:2827 (needs content and design; it may belong to the R7 demo hub). | M–L |

### Styling (S)

| id | sev | Evidence | Symptom | Root cause | Fix direction | Size |
|---|---|---|---|---|---|---|
| UXC-14 (S1) | **P1** | `theme-css.ts:53-161` (no control rules, no `color-scheme`) | Grey and white OS buttons and selects on the dark shell. | No base control CSS. | `color-scheme: dark` on `:root`, `light` under `[data-theme=light]`; base `button`/`input`/`select`/`textarea`/checkbox/radio rules on tokens (bg, border, radius-2, 13 px, hover, disabled, focus). | S |
| UXC-15 (S2) | P1 | `packages/ui/src/index.ts` (no Button or Field) | Every surface invents its own buttons (70 paddings, 7 radii). | No primitives. | `Button` (primary/secondary/ghost/danger, sm/md), `TextField`, `Select`, `Checkbox`, `FieldRow`, emitting classes from a new `uiCss()` in tokens (REQ-UX-5-compatible). | M |
| UXC-16 (S3) | P1 | `settings.tsx` (38 raw / 48), `billing.tsx`, `run-sheet.tsx`, `export.tsx`, `project-home.tsx`, `chat-panel.tsx` | The most-used forms (settings, the paid-run sheet, chat) look the least finished. | As above. | Migrate surfaces in batches (WP2a–d). | M ×4 |
| UXC-17 (S4) | P2 | `project-home.tsx:302-329` | Group-by, protocol and sort each need a separate "Apply" click. | No-JS form parity carried over into the SPA. | Submit on change (the no-JS submit button stays inside `<noscript>`). | S |
| UXC-18 | P2 | ESLint config has no rule | The drift will recur. | No guard. | Lint against raw `<button>`/`<select>` in surfaces and against `fontSize` literals outside the scale. | S |

### Layout and editor (L, ED)

| id | sev | Evidence | Symptom | Root cause | Fix direction | Size |
|---|---|---|---|---|---|---|
| UXC-19 (L1) | **P1** | `state.ts:18`; `ide-shell.tsx:172`; `ide-css.ts:121-129` | At 1024–1279 px (and below 1600 with Files open) the Timeline covers the right edge of the draft and every finding tick. | Defaults open with absolute overlay geometry, no dismiss, and the open state persists. | Viewport-aware default (closed in narrow and single modes), Esc / outside-click / scrim, not persisted from overlay mode; or collapse to a 36-px strip like the Margin. Wire `paneLayout()` as the runtime source. | S–M |
| UXC-20 (L2) | P1 | `ide-css.ts:131-134` | On iPad portrait the bottom 55% of the page is covered on load. | Sheet defaults open. | Same as above: the sheet opens on demand. | S |
| UXC-21 (L3) | P2 | `ide-css.ts:138-139` | A narrow desktop window hides every pane with no way back. | CSS phone mode on a desktop DOM. | Phonebar gains Files, Timeline and Chat toggles in CSS-phone mode. | S |
| UXC-22 (ED1) | P1 | `plugins.ts:163-180`; no toolbar component exists | Formatting is Markdown-only; there are no link, heading or quote controls. | Not built. | A floating format bubble on selection (B, I, link, H2/H3, quote, list) plus ⌘⌥1-3 and a link shortcut (⌘⇧K, since ⌘K is the palette). | M |
| UXC-23 (ED2) | P1 | `menus.ts:29-39`; `page-editor.tsx:511-519` | You cannot comment on a passage; the note form sits far below the text. | No selection → Guidance path. | "Comment" as the first item in the selection menu, anchored Guidance (DS:524), rendered in the Margin. | M |
| UXC-24 (ED3) | P2 | `page-editor.tsx:352-430` | Banners and buttons crowd the top of the paper. | Chrome placed inside `.paper`. | Move the sync pill, banners and proposals into a page header strip above the sheet; style them with the primitives. | S |
| UXC-25 (ED4) | P2 | `editor.tsx:467-486`; `page-chrome.tsx:481` | Opening a project shows an overview, not the draft; `/app` has no ⌘K. | IA choice; the palette lives only in the IDE controller. | Open to the head draft with approvals in the Timeline/Inbox (Q8); global ⌘K in the AppShell. | M |
| UXC-26 | P2 | `ide-shell.tsx:236, 268`; `ide-shell.tsx:196-203` | Panes cannot be resized from the keyboard; glyph icons vary by OS. | `aria-hidden` handles; no icon set. | `role=separator` plus arrow keys; an SVG icon subset (Q7). | S |

### Errors and copy (E)

| id | sev | Evidence | Symptom | Root cause | Fix direction | Size |
|---|---|---|---|---|---|---|
| UXC-27 (E1) | P1 | `editor.tsx:204`, `dossier.tsx:233, 487`, `run-report.tsx:191`, `voices.tsx:254`, `onboarding.tsx:229`, `figures.tsx:453` | Users see `lock_held`, `upstream_unavailable` and similar codes. | `err.detail ?? err.code` shown as-is. | `errorCopy(code)` COPY table with a generic fallback; log `requestId`. | S |
| UXC-28 (E2) | P1 | `server.ts:1663-1668` and peers | A raw JSON page on native-form failures; prose in the `error` field. | Form posts get JSON errors. | `mutationOutcome` for every form route (flash redirect for forms, a stable code for JSON). | S |
| UXC-29 (E3) | P2 | `states.tsx:44-58, 101-130` | Loading, 404 and error screens have no header or nav. | The chrome belongs to the leaves. | Removed by the AppShell (UXC-9). | S |
| UXC-30 (D5) | P2 | `project-list.tsx:249, 392`; `state-map.ts:174`; `menus.ts`; `ide-shell.tsx:370` | Hard-coded strings (REQ-UX-12). | Copy ownership leaks. | Move them to COPY / `labels`. | S |

### Design tokens (D) and performance (P)

| id | sev | Evidence | Symptom | Root cause | Fix direction | Size |
|---|---|---|---|---|---|---|
| UXC-31 (D1/D2) | P2 | Counts in §4 and §8 | Uneven sizes and corners. | No scale enforcement. | Add `--fs-*` and `--radius-pill` tokens; lint. | S |
| UXC-32 (D4) | P2 | `what-changed.tsx:65`; `compare.tsx:62`; `outline.tsx:238` | The diff tint is invisible on dark paper; the "saved" note falls back to muted. | Undefined tokens. | Define `--paper-diff-add/del` and `--state-ok` per theme, with contrast tests. | S |
| UXC-33 (P1) | P1 | `p.$project.index.tsx:30-40` | A visible delay on every project open. | Serial handoff POST. | Fold the handoff into the twin GET, or run it in parallel after first paint. | S |
| UXC-34 (P2) | P1 | `main.tsx:54-62` | Every first visit to a page waits a full round trip. | No prefetch at all. | Query-level hover/focus prefetch for a `PREFETCH_SAFE` set of GET twins (Q4). | S–M |
| UXC-35 (P3) | P2 | `states.tsx:44`; `queries.ts` | The chrome flashes; broad refetches after every write. | Pending outside the chrome; `["bff"]` invalidation. | AppShell; scoped keys; `staleTime` per twin class. | S |
| UXC-36 (P4) | P2 | `theme-css.ts:32-44` | The serif swaps in on the paper (FOUT). | No font preload. | `<link rel=preload as=font crossorigin>` for Literata-normal and Inter in the shell and SSR heads. | S |

## 10. Proposed decomposition (work packages of at most M)

1. **WP1: Control base layer (S).** `color-scheme`, plus base control rules in `themeCss()`, plus `uiCss()` with `.btn*`, `.field`, `.select`. Covers UXC-14. Prerequisite for WP2.
2. **WP2: UI primitives and migration (M each, 4 tickets).** `Button` and the Field family in `@rhema/ui` with DOM-contract hooks preserved (declared-hook changes go through `dom-contract.ts`). Migration batches:
   - (a) settings and billing;
   - (b) run-sheet, export, project-home;
   - (c) voices, onboarding, outline, figures;
   - (d) chat-panel, gate-card, page-editor, findings-desk.

   Each batch adds the lint rule for its directory. Covers UXC-15, 16, 17, 18 and 31.
3. **WP3a: AppShell layout route (M).** Persistent Rail for `/_authenticated` workspace leaves (Projects · Voices · Inbox · Usage · Settings · account/Sign out), with pending, error and 404 states inside it; brand → `/app`. Covers UXC-3, 9, 12, 29 and 35 (chrome part).
4. **WP3b: Unify the IDE rail with the AppShell and frame the project-scoped pages (M).** Covers UXC-10, 11 and 25 (⌘K part).
5. **WP4: Reload eliminators (M).**
   - Chrome-level delegated submit for pane bodies.
   - Chat JSON dual-mode and mutation.
   - `/edit/:id` redirects replaced with `/v/:n` in server writes and palette paths.
   - In-router handoff and `v/working` redirects.

   Add a journey assertion of `documentLoads === 1` across chat send and Timeline approve. Covers UXC-1, 2, 4, 5 and 28.
6. **WP5: Showcase in the SPA (M; needs Q3 and an ADR amending REQ-ED-12).** A read-only SPA Page for `row.showcase`, sharing the mechanism with R7 demo mode; the island shrinks to phone only. Covers UXC-6, 7 and 8.
7. **WP6: IDE pane geometry (S–M).** Viewport-aware defaults, dismissible overlay and sheet, `paneLayout()` wired at runtime, keyboard resize, phonebar toggles. Covers UXC-19, 20, 21 and 26 (handles part).
8. **WP7: Project home grouping (S–M; needs Q1).** Covers UXC-17 if WP2b has not already.
9. **WP8: Error copy (S).** Covers UXC-27 and 30.
10. **WP9: Editor ergonomics (M).** Format bubble, shortcuts, selection → Comment as Guidance, page header strip. Covers UXC-22, 23 and 24.
11. **WP10: Speed (M).** Prefetch-safe twins, handoff folded into the twin, font preload, scoped invalidation, optimistic toggles. Covers UXC-33, 34, 35 and 36.
12. **WP11: Token gaps and icons (S).** Covers UXC-32 and 26 (icons part).
13. **WP12: Marketing layout and nav (M; it may be absorbed by the R7 `/demo` hub design).** Covers UXC-13.

Suggested order: WP1 → WP4 → WP6 → WP3a → WP2(a–d) ∥ WP8 → WP3b → WP10 → WP9 → WP7 → WP5 → WP12. Every package that changes a user surface needs Stage-B browser evidence at the deployed SHA (root `AGENTS.md` gotcha 4) and DOM-contract updates in the same change.

## 11. Open questions for the operator, with recommendations

1. **Q1: QUIET (REQ-IDE-4, DS §5.2).** Amend it? **Recommendation: yes.** The default `/app` becomes a flat "Recent" list sorted by last activity, expanded. Needs you, Running and Ready to read appear as pinned sections above it only when they are non-empty. Retire the "Quiet" label, and drop the Unfiled/Voice sub-count from the attention view (it belongs to `Group by: Voice`). New projects stay Unfiled in the voice taxonomy.
2. **Q2: Rail versus header.** Should REQ-IDE-2's single left Rail apply to workspace pages too, replacing every `<Shell>` header in the signed-in app? **Recommendation: yes.** This matches Claude.ai, Cursor and Codex, and it is what the spec already says.
3. **Q3: Showcase SSR (REQ-ED-12 showcase leg).** Accept an SPA read-only render for showcase, keeping SSR only for phone? **Recommendation: yes.** It removes the multi-page first-run experience and is the same mechanism R7 demo mode needs.
4. **Q4: Prefetch (REQ-UX-2, overridden by REQ-NAVM-7 / GATE-ACCEPT.R5).** Allow Query-level `prefetchQuery` (no router `beforeLoad`/loader) on hover and focus for an audited GET-twin allowlist? **Recommendation: yes.** It preserves the side-effect rationale behind the override.
5. **Q5: Styling doctrine (REQ-UX-5).** Bless a generated component stylesheet (`uiCss()`) with class-based primitives, and lint against inline control styling in surfaces? **Recommendation: yes.** It keeps "generated CSS over tokens" and ends the 2,000-prop drift.
6. **Q6: Chat transport.** Confirm the composer moves to a fetch-plus-stream path, with no full-page form POST in the SPA (no-JS form parity kept only for SSR). **Recommendation: yes.** Chat is a founding-prompt core feature.
7. **Q7: Icon set.** Approve a vendored SVG subset, for example Lucide under ISC (it should pass `check:licenses`). **Recommendation: yes,** about 20 icons inlined as a sprite.
8. **Q8: The project landing view.** Should `/p/:slug` open the head draft, with approvals moved to the Timeline and Inbox, rather than the overview? **Recommendation: yes.** Approvals stay one click away through the Inbox badge.
9. **Q9: Spec vocabulary drift.** DS §4.2 uses `/app/voices` and `/app/usage`, but the shipped routes are `/voices` and `/usage`. Record an amendment, rather than move the routes. **Recommendation: amend the spec.**
