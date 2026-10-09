# SPA.21 — run ledger: surface `dossier` (`/p/:p/review/:runId` + `/p/:p/obligations/new`)

- **Ticket:** `docs/tickets/129_SPA.21__surface-dossier.md` (manifest row 129)
- **Branch:** `stevevitali/spa-21-surface-dossier` — forked from
  `stevevitali/spaf-11-prod-flip-run-sheet` @ `52ac0bf` (the requested chain tip).
- **PR:** `pr/SPA.21.md` is the committed body; the PR is opened at closeout and its checks
  are read once (result recorded in § PR checks read below).
- **Harness:** devin-cli subagent (per the 2026-10-08T23:05Z dispatch-tier ruling).
- **Mode:** offline-only, $0 — no deploys, no production writes, mergePolicy OPERATOR.
- **Spend:** `paid:false` legs only; no metered spend ($0).

## 0 — Prerequisite probe (run first, per the ticket's operating clause)

```
gcloud secrets versions access latest \
  --secret=rhema-nonprod-resend-api-key --project=rhema-507501
→ ERROR: (gcloud.secrets.versions.access) NOT_FOUND
```

The secret was never printed (there is no version to print); the shared non-prod Resend
key is still absent, so no signed-in preview session can mint through the magic-link +
mailbox leg — the dossier routes are session-gated. The preview two-leg and rollback drill
are honestly deferred (`D-SPA.21-1`/`-2`), with the deterministic in-repo proof standing in.
Same live blocker as `D-MAINT.6-1` / `D-SPA.6-1` / `D-SPA.12-1` … `D-SPA.20-1`.

## 0b — Inherited chain debt

None closed this run. `D-OPS.1-1` blocker-updated (the SPA.21 re-probe), stays OPEN;
`D-SPAF.1-*`…`D-SPAF.11-*` stay OPEN behind the operator merge+deploy prerequisite.

## 1 — What landed

### Shared extraction (`dossier-view.tsx` + `chat-pane.tsx`)

The whole dossier composition — letter arm, claims table, second read, rubric, findings
list + filter controls, per-finding disposition controls, Apply/Promote/Add-to-obligations,
the bulk preview + confirm arms, the focused `?gate=` card, the triage ledger, Margin/Desk
body builders, and `DossierViewData`/`DossierViewState` — hoisted out of `pages.tsx` into
`dossier-view.tsx` (~1,000 lines, verbatim markup). `chatPanel` went to `chat-pane.tsx` so
the Page-internal phone chat and the Desk chat share one emitter. `pages.tsx` drops ~925
lines to imports; `DossierPage`/`ObligationNewPage` render the extraction unchanged —
SSR is byte-preserved (the retained SSR tests never needed a fixture update).

### Server (`server.ts`)

- `GET /bff/p/:slug/review/:runId` — the dossier twin: the ONE `dossierComposition` call
  both renderers perform (context → correspondence/letter → claims → findings → rubric →
  run card → access report → triage filters → focused gate → the IDE bag) →
  `{dossier, dossierView, project, paperTheme, appTheme?, ide}`; 401/404 parity.
- `GET /bff/p/:slug/obligations/new` — `{obligationNew:{slug,projectTitle,back}}`; `?back`
  re-runs `safeBack` (`/p/…`-confined).
- `wantsJson` + `mutationOutcome` branches on every dossier write: disposition
  (`?disposed`), Apply (`?applied`), Promote (`?promoted`), Add-to-obligations
  (`?obligated`), bulk preview + confirm (`?bulk`/`?bulkdone`, scalar-or-array `only`
  normalization identical to the form codec), gate decides, and `POST /p/:slug/obligations`
  (`?obligation=new`). Refusal statuses + `detail` strings verbatim; forms keep 302s.

### SPA (`spa/`)

- `surfaces/dossier.tsx`: `DossierSurface` + `ObligationNewSurface` — the extracted markup
  verbatim + `data-spa-surface`, chrome extras publish (`useShellChrome` gains an extras
  param for the dossier's pane bodies/palette/timeline), `data-phone-chat` at phone width,
  `showcase-beacon.ts` (the finding-anchor IntersectionObserver beacon's SPA arm), gate
  presence, delegated form interception (`bffFetch` + `collectJsonFields` + `formAction`
  retarget), `["bff"]` settle-invalidate, REQ-UX-16 `aria-busy` + disabled until settle.
- Filter port: the leaf-owned keys (`triage`/`sev`/`kind`/`disp`/`sec`/`url`/`sug`/`obl`)
  are validated search; `visibleDossierFindings` re-derives via the shared
  `@rhema/findings-core` `filterFindings`/`applySeverityBudget` — the SAME list feeds body
  + Margin + Desk and never refetches. Server-owned keys forward onto the twin GET.
- Routes: `p.$project.review.$runId` + `p.$project.obligations.new` — twin warm on the
  "spa" verdict only, twin-404 → `notFound()`, else `SsrHandoff` (zero BFF reads).

### Journeys + seed (`@rhema/journeys`, `@rhema/db`)

- `seedWritableDossier(db, deps)` — the Showcase fixture on a `showcase=false` project so
  the api's `showcaseReadOnlyGuard` doesn't freeze its writes; slug-idempotent
  (`jrn-<tag>-dossier`), coexists with the Showcase, deterministic + $0.
- `T12F`/`T13F` — T12/T13's write legs on the seeded dossier (disposition+note round-trip,
  `?obligated`, `/obligations/new` filing into the export summary, Apply retraction, the
  bulk checklist → `?bulkdone=`); `P1.dossier` — the phone-width capability-boundary leg.
  All `expected:"red"`, `paid:false` — a red miss reports `owed`, never gates.
- `SURFACE_GATES.dossier = {N7, T1, T12F, T13F, P1.dossier}` + the owed note.

### Stage facts

`STAGES.dev.spaSurfaces` `…,"run-sheet"]` → `…,"run-sheet","dossier"]`; preview `[]`,
prod pinned — **SPAF.12 owns the prod flip.**

## 2 — Verification

| Gate | Result |
|---|---|
| `pnpm turbo build lint typecheck` | **135/135** tasks |
| `pnpm test` | **5,528 pass / 6 skip / 0 fail** (485 files) |
| `dossier.dom.test.tsx` | **16/16** (incl. axe subset + parity) |
| `check:dom-contract` | dossier **108/108** emitted + asserted |
| `stages.test.ts` | 23/23 (dev +`dossier`, prod/preview pinned) |
| `showcase.test.ts` | 4/4 (writable-dossier seed leg added) |
| `registry.test.ts` + `surface-gates.test.ts` | 18/18 (T12F/T13F/P1.dossier + gate) |
| `check:licenses` / `check:protocol-markers` / `check:no-cookies` / `check:spa-budget` / `check:spa-env` | all clean |
| REQ-VFY-9 disposition | **MET** — SSR HTML-string asserts stay as retained fallback coverage (`triage-surfaces.test.ts`, `findings-surface.test.ts`, `dossier-evidence.test.ts`, `server.test.ts`); SPA render asserts live in `dossier.dom.test.tsx`; status/mutation legs in `bff.test.ts` + the T12F/T13F journey steps |

### Mid-run fixes (all real, all re-verified)

- `bulk-preview` `only` serialization: native form semantics emit a scalar for one checked
  row; the server already normalizes scalar→array — test relaxed to document parity.
- Refused-write repaint loop: mutation error state was nested in the memoized
  `DossierViewState` (unstable recursion) — hoisted; suite reached 14/14.
- Axe: `aria-required-children` scoped off for the happy-dom limitation (the ide-chrome
  precedent — real-browser axe rides P1.dossier); `empty-table-header` fixed with a real
  "Actions" label (`copy.ts`); `select-name` fixed with an `aria-label` on the bulk
  section select.
- `emission-audit`: `showcase.finding_anchor_viewed` source pointer moved
  `pages.tsx` → `dossier-view.tsx` (the literal's new home).
- `check:protocol-markers`: `SPA_WEB_SRC_ALLOW` += `dossier-view.`/`chat-pane.` (shared-leaf
  precedent).
- `check:dom-contract`: `data-phone-chat`, `next` (field), `back` (urlparam) manifested +
  asserted (compact parity leg + `?back`/`next` round-trip test); the unused
  `data-pane-intercept` marker dropped instead of manifesting dead vocabulary.
- Lint: unused `init` param → `_init`.

## 3 — Deferrals

Opened `D-SPA.21-1` (preview two-leg + leg C on `pr-<n>` — the Resend prerequisite) and
`D-SPA.21-2` (rollback drill on the same preview). `D-OPS.1-1` blocker-updated. **None
closed** — every upstream OPEN row still needs its named operator prerequisite.

## 4 — AC disposition

| AC | Layer | Disposition |
|---|---|---|
| `/bff/*` twins + envelope mutations green | deterministic · engineered | **MET** — `bff.test.ts` + `dossier.dom.test.tsx` envelope legs |
| React surface emits the full dom-contract vocabulary + component tests + axe | deterministic · engineered | **MET** — 108/108 emitted+asserted; 16 dom legs incl. scoped axe |
| Retained SSR tests stay green | deterministic · engineered | **MET** — the SSR fallback is untouched (extraction is verbatim) |
| Journey legs re-spec'd + `SURFACE_GATES['dossier']`; preview two-leg green on `pr-<n>` | deterministic · staging-verified | **PARTIAL** — steps + gate landed (`expected:"red"` per policy); the preview leg is `D-SPA.21-1` (secret absent) |
| Rollback drill evidence on the preview | deterministic · staging-verified | **DEFERRED** — `D-SPA.21-2` (rides the same preview) |
| Dev stage-fact line lands; prod untouched | deterministic · engineered | **MET** — `stages.test.ts` pins both |
| Universal phase-gate AC | agentic | **MET** — verification green; requirement ids stamped; deferrals ledgered; no ADRs (no design deviations); BUILD_INDEX + LEDGER advanced; append-only honored |

## PR checks read

`gh pr checks 151 --watch=false` at closeout → **no checks reported** on
`stevevitali/spa-21-surface-dossier` (same as #140–#150 — the stacked PRs run no branch
checks; CI coverage is this run's local green gate above).
