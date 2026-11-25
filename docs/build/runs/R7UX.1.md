# Run ledger — R7UX.1 (row 324)

Harness: devin-cli/swe-2-high/subagent
Skills: unknown
Started: 2026-11-25T06:51Z
Closed: 2026-11-25 (records commit)
Spec: docs/tickets/324_R7UX.1__app-content-column.md
Base: `stevenvitali/r6fix-52-mem-hygiene` @ `4fe7a888` (unmerged — OPERATOR; ff'd from `e22f5286`
  when the 335_R6FIX.53 insert landed on the base mid-run)
Branch: `stevenvitali/r7ux-1-app-content-column`
Config: implement-spec full (ledger/self-review/gap/tests/evidence on; live = Stage A + owned
pr-<n> preview walk per GD-UXBACKLOG-1/GD-PREVIEW.R7, $0, prod untouched)
Budget: ~300 changed lines incl. tests (S)

## Deferrals read

- Read `docs/tickets/DEFERRALS.md` at run start (2026-11-25). This ticket is visual polish
  on the SPA `/app` shell with `Depends on: nothing (chain tip only)` — no `OPEN` row names
  this ticket, its branch, or the /app content column as its unblocker. The UX wave's own
  deferral obligation is the ticket's Live-stage line: Stage-B re-walk at a deployed tip
  rides the standing deferral mechanism (see Gap table — D-R7UX.1-1 appended this run).

## Requirements (spec Goal/anchors)

1. `/app` lays its content column out at ≈850 px max-width, centered, beneath the
   full-width header — "instead of the current big empty canvas" (BL-90 / R5 A6 P2).
2. The header stays full-width (the shell's `data-shell-topbar` region is not pulled into
   the column).
3. A footer strip renders only the `Rhēma` mark — no links, no extra text.
4. Whitespace below the column fills naturally (no forced stretch/centering gimmicks).
5. Selectors only via `dom-contract.ts` (declare, emit, assert); layout through `ui-*`/the
   shell's own `app-shell-*` token vocabulary — no raw controls (GUARD-1 untouched).
6. Out of scope: timeline, files-panel, dossier, landing, pricing (UX.2–UX.5), any
   API/SSR/behavior change, REQ ids unchanged.

## Acceptance criteria (working checklist — layers on close)

- [x] DOM tests prove: /app content region carries the centered ~850px max-width rule
      (class/rule asserted, not pixel-perfect). *(engineered — 14/14 dom tests)*
- [x] DOM tests prove: the header stays full-width; the footer shows only `Rhēma`.
      *(engineered)*
- [x] `pnpm turbo build lint typecheck` clean for touched packages; web suite +
      `check:dom-contract`, `check:spa-budget`, `check:spa-env` green. *(engineered)*
- [x] SPA entry-graph + gzip budget do not regress beyond standing headroom — **+39 gz B**
      (250,543 vs ceiling 250,582; REQ-KIT-5 ≤15 kB). *(engineered)*
- [x] Preview walk: `preview-stack.mjs` on the PR head → headless `/app` walk + screenshot
      showing centered column + footer → destroy + orphan check + rm. *(staging-verified —
      `pr-418`, walked at `0e3e3008`, torn down clean)*
- [ ] Stage-B re-walk at a deployed tip → `met-engineered(D-R7UX.1-1)` per the ticket's
      Live-stage line. *(deferred — row appended this run)*

## Plan

- `packages/tokens/src/ide-css.ts`: `.app-shell-column` (width 100% · max-width 850px ·
  margin 0 auto) + `.app-shell-footer` (flex:0 0 auto bottom strip, border-top, centered,
  faint — the old `Shell` footer's shape) appended to the R7SHELL.1a block.
- `apps/web/src/spa/app-shell.tsx` (`WorkspaceAppShell`): when `loc.pathname === "/app"`,
  wrap `{children}` in `<div className="app-shell-column" data-shell-column>` inside
  `.app-shell-content` and render
  `<footer className="app-shell-footer" data-shell-footer>{COPY.footer}</footer>` as a
  sibling pinned after the scroll region in `.app-shell-main`. Scope is `/app` exactly —
  other leaves (inbox/settings/voices/IDE) unchanged; sibling UX tickets own them.
- `apps/web/src/dom-contract.ts`: declare `data-shell-column` + `data-shell-footer`
  (conditional, spa/app-shell.tsx).
- `apps/web/src/spa/app-shell.dom.test.tsx`: new legs — column emits + carries the leaf;
  `ideCss()` asserts the `.app-shell-column` rule is centered 850px; `[data-shell-topbar]`
  stays outside the column (full-width); footer tag `FOOTER`, textContent === `Rhēma`,
  no links/controls; negative leg on `/app/inbox` (no column/footer).
- Records: `pr/R7UX.1.md`, BUILD_INDEX row, LEDGER PHASE LOG + CURRENT STATE advance,
  DEFERRALS `D-R7UX.1-1` (Stage-B re-walk at a deployed tip).

## Test matrix

| AC | Test |
|---|---|
| centered ~850px column rule on /app | `app-shell.dom.test.tsx` — `[data-shell-column]` wrap + `ideCss()` rule assert |
| header stays full-width | same — `[data-shell-topbar]` outside column, `.app-shell-main` direct child |
| footer = only `Rhēma` | same — `[data-shell-footer]` text + no `a`/`nav`/`button` descendants |
| scoping (no column/footer elsewhere) | same — `/app/inbox` negative leg |
| budgets | `pnpm check:spa-budget` + `check:spa-entry-graph` + `check:spa-env` output |

## Progress

- 2026-11-25T06:51Z — worktree `wt-r7ux1` on `stevenvitali/r7ux-1-app-content-column` @
  `e22f5286`; DEFERRALS + AGENTS hierarchy read; anchors confirmed (`app-shell.tsx:833-879`,
  `ide-css.ts:399-460`, `dom-contract.ts:302-341`). Node 24.21.0 (engine floor ≥20.19; CI
  major is 22 — Node 22 not installed locally; Vite requires ≥22.12, satisfied).
- `pnpm install --frozen-lockfile` clean (evals → public stub, as designed).
- ~07:0xZ — base ff'd `e22f5286` → `4fe7a888` (335_R6FIX.53 ticket insert landed mid-run);
  dom suite re-green at the new tip (14/14). Code commit `0e3e3008` (4 files, +76/−1) →
  pushed → **PR #418** (base `stevenvitali/r6fix-52-mem-hygiene`).
- ~07:0xZ–07:3xZ — **preview `pr-418`** per the owned lifecycle: `init` → config
  (project/region/gitSha `0e3e3008`/protocolsVersion `0.4.0+07b1ad37ddaaa6f4`/
  googleOauthClientId/runTaskAppArmor*) → `resend-pull` (nonprod key @1 +
  `previews@rhema.tools`) → `up`. Three converging passes + one owned-preview repair:
  (a) the project-level `ciPreviewSweepBucketsList` custom role already existed (an orphan
  from a prior preview's `retainOnDelete` grant set, 313_R6FIX.42) → imported into the
  stack so `destroy` cleans it; (b) `gcr.io/google-containers/pause:3.9` is GONE from gcr
  (first `up` failed all 8 Cloud Run creates on image-not-found — the placeholder fallback
  can no longer realize a service; worth a dated infra note); (c) api `00001-kr8` went
  terminal pre-migrations (`database "rhema" does not exist`, the R7DEP.2 class) → forced a
  fresh revision post-migrate (`00002-gp2` serving). Cloud Build `47bd484c` all-10 images
  @ `0e3e3008` (~11m53s, `_ALLOW_PLACEHOLDER_SDK=1` — no vendored SDK in the clean worktree;
  run-task never launches here). Digests pinned (`serviceImages` ×8 + `runTaskImageDigest`
  + `proxyImage`), `appBaseUrl`/`apiPublicUrl` set, migrate job `…-3568e9f` applied the
  schema, `seed-invite` → invite `prv-418-test`. Provenance: web + api `/healthz/` →
  `gitSha 0e3e3008487c1688b460811b9173b25dbd1cf772` (the PR head).
- 07:3xZ — **headless `/app` walk PASS** (`walk-facts.json` + `app-1440.png`/`app-1024.png`
  in `reports/2026-11-25_r7ux-1-app-walk/`): real magic-link mint for `test+r7ux1@rhema.tools`
  through the `prv-418-test` invite (`signinVia: mailbox`, pinned `test@rhema.tools` Gmail
  client) → `/app` at 1440×900: `.app-shell-column` width **850** at left **419** — exactly
  centered inside `.app-shell-content` (left 248, width 1192 ⇒ (1192−850)/2 = 171);
  `.app-shell-footer` tag `FOOTER`, text `Rhēma`, **0** `a`/`nav`/`button` descendants,
  `previousElementSibling` = `.app-shell-content`, pinned to the bottom edge (858.5–900);
  topbar outside the column (hidden at desktop, `<768` control). At 1024 the column shrinks
  with the region (776 = content width) — fluid cap, not fixed. Screenshots are test-tenant
  evidence (P-1 compliant).
- 07:4xZ–09:3xZ — **teardown, three acts, clean.** `destroy` pass 1 deleted 129 then halted —
  `rhema-pr-418-private-app` was pinned by two Google-owned
  `serverless-ipv4-cloudrun-{1795591267061886208,1795591784963172001}` address reservations
  (the known serverless GC-lag class — pr-207's ran ~2h20m; not user-deletable, retry until
  released). Pass 2 deleted 26 more (63 skeleton resources left: secrets, buckets,
  net+subnets, AR repo, SAs/IAM, health check, cert, metrics). The reservations released at
  ~09:29Z (~1h44m after service deletion — inside the 1–2h class); pass 3 deleted the
  remaining 60 → 0 stack resources. The imported `ciPreviewSweepBucketsList` project role
  was `state delete`d (not destroyed) to preserve the shared project resource
  (F-R7UX.1-1). **Orphan sweep CLEAN** (`preview-orphan-sweep.mjs` — zero live `pr-<n>`
  resources across the estate). `rm` deregistered `pr-418` (`pulumi stack ls` ⇒ dev + prod
  only); `pulumi stack rm` also deleted `Pulumi.pr-418.yaml` from disk — restored to the
  tree for the records commit per the pr-230/pr-385 precedent.

## Gap table

(filled at Phase 4 — every ticket requirement mapped to evidence above: column rule
(ideCss `max-width: 850px; margin: 0 auto`), footer copy-only (`COPY.footer` = `Rhēma`),
header/topbar stays outside the column, `/app`-only scope (inbox negative leg), budget
delta +39 B recorded, out-of-scope surfaces untouched.)

## Evidence log

- `app-shell.dom.test.tsx` — 14/14 pass at `0e3e3008`.
- `pnpm check:dom-contract` / `check:spa-env` / `check:spa-entry-graph` — pass.
- `pnpm check:spa-budget` — base entry graph 250,543 gz B vs ceiling 250,582 ⇒ **+39 B**.
- `pnpm turbo build` — 13/13 tasks green.
- Preview `pr-418`: Cloud Build `47bd484c` SUCCESS (all-10, tag `r7ux-1`, `_GIT_SHA=0e3e3008…`);
  walk facts + screenshots → `reports/2026-11-25_r7ux-1-app-walk/`.

## Evidence report

(in the PR body + this ledger; `reports/2026-11-25_r7ux-1-app-walk/` carries the screenshots
and measured DOM facts.)
