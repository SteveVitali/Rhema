# Run ledger — R7UX.11 (row 334)

Harness: devin-cli/swe-2-high/subagent
Skills: implement-spec (full)
Started: 2026-11-26
Closed: 2026-11-26T16:35Z
Spec: docs/tickets/334_R7UX.11__marketing-redesign.md
Base: `stevenvitali/r7ux-10-word-diff-marks` (worktree tip `91638a9e` at dispatch —
unmerged; mergePolicy OPERATOR). _2026-11-26: PR #427 merged mid-run (`86f7f7b8`) — the
base is now an ancestor of `origin/main`; the PR is stacked on `main`._
Branch: `stevenvitali/r7ux-11-marketing-redesign`
Config: implement-spec full; live = Stage A + owned pr-<n> preview walk (324 ruling; $0,
prod untouched)
Budget: ~800 changed lines incl. tests (L) — stop + request a split past it.

## Deferrals read

- Read `docs/tickets/DEFERRALS.md` at run start (2026-11-26). No `OPEN` row names this
  ticket or BL-89 as its unblocker.
- `D-R7UX.1-1` … `D-R7UX.10-1` (OPEN) — the sibling deployed-tip re-walks — untouched:
  they unblock only on the operator's stack merge + a deploy carrying those SHAs.
- This ticket's Live stage is "Stage A + preview walk": the deployed-tip re-walk lands as
  a new `D-R7UX.11-2` row at close; remaining copy/art lands as `D-R7UX.11-1`.
- Owes: BACKLOG BL-89 landing pointer → `334_R7UX.11 (PR #<n>, unmerged)`; BL-89 closes
  when the operator merges.

## Requirements (spec Goal/anchors, BL-89)

1. The marketing surface gets a dedicated layout + nav distinct from the app shell
   (DS §15.1, spec line ~2873): `Rhema · Product · Workflows · Pricing · Changelog ·
   Docs · Sign in · [Get Rhema free]`.
2. The REQ-PUB-2 scope cap had shipped a minimal version; this lands the structural
   redesign — a marketing-only layout (nav, section rhythm, footer) consistent with the
   landing/dossier visual language UX.4 unified, with real nav anchors for the existing
   sections.
3. Content is *moved/restructured*, not invented — every claim keeps its existing
   wording; anything needing new copy renders a marked placeholder (§16.4 claims stay
   G2-gated; `lintGrowthCopy`/`lintCopy` clean).
4. Acceptance: nav anchors route to the existing sections; the app-shell chrome does not
   render on marketing pages; the no-JS SSR document carries nav + all sections (RV-36);
   `/` + each-section + mobile-width screenshots on an owned preview.

## Findings (Phase 0)

- **The design source EXISTS** — `docs/rhema-design-spec.md` §15 resolves (line ~2873),
  so the ticket's structural-only fallback ("if DS:2827's material is absent, ship the
  shell + defer copy") is NOT triggered. §15.1's nav set is the contract above; the
  twelve-section order already matches the shipped landing
  (`hero, dossier, workflow, seat, voices, runs, models, proof, pricing, changelog,
  faq, final-cta`), so this ticket is chrome + anchors + footer, not content moves.
- The pre-existing marketing chrome was `MarketingShell` in `apps/web/src/marketing.tsx`
  (R7PUB.1, REQ-PUB-2) — a thin header (wordmark + a couple of links) wrapping landing
  and `/pricing`, with the shared `publicFooter()` legal line.
- **§15.1 "Docs" has no public docs surface** — no `/docs` route exists. It renders as
  a marked non-link placeholder (`data-mk-nav-pending="docs"`, title explaining), never
  a dead href or a 404 — recorded as the deferred-copy/navigation item `D-R7UX.11-1`.
- Signed-in `/` still server-redirects to `/app` (`server.ts` ~2836); the signed-in
  `/pricing` arm swaps "Sign in" for `data-pricing-app` → `/app` (REQ-PUB-1 preserved).

## Implementation

- `apps/web/src/marketing.tsx` — `MarketingShell` upgraded: sticky full-width
  `data-mk-nav` header (wordmark + `MARKETING_NAV` data: `product → /#dossier`,
  `workflows → /#workflow`, `demo → /demo` with `data-spa-native` +
  `data-demo-entry="nav"` (S-14 document navigation), `pricing → /pricing`,
  `changelog → /#changelog`, the `data-mk-nav-pending="docs"` span, `signIn → /login`
  (or `data-pricing-app → /app` signed-in), `cta → /signup` "Get Rhēma free"). Marketing
  column widened to 1120 px (vs the 880 px beta `Shell`). Footer rebuilt as
  `data-mk-footer` — the section map repeated (incl. `/#faq`) ahead of the shared
  `publicFooter()` legal line. All plain anchors — no island, progressive enhancement
  only.
- `apps/web/src/copy.ts` — +12 `COPY.landing.nav.*` keys (`lintGrowthCopy`/`lintCopy`
  clean — no efficacy claims; `COMPARATIVE_WAVE_MET=false`).
- `apps/web/src/dom-contract.ts` — +3 hooks: `data-mk-nav-item`, `data-mk-nav-pending`,
  `data-mk-footer`.
- `apps/web/src/marketing.test.ts` — +55 lines of legs (below).

## Verify (Stage A)

- `marketing.test.ts` BL-89 legs: `data-mk-nav` present + app-shell hooks absent
  (`data-app-shell`/`data-app-sidebar`/`data-shell-wordmark`/`data-shell-account`);
  `data-mk-nav-item` order `[product, workflows, demo, pricing, changelog, signIn, cta]`;
  every `/#<id>` anchor routes to a rendered `id`; `data-mk-nav-pending="docs"` present
  with its title and no `href="/docs"`; `href="/demo"` carries `data-spa-native`;
  `/login` + `/signup` real routes; `data-mk-footer` with `/#faq` + `data-legal-nav`;
  all twelve `id="<section>"` present; `/pricing` signed-out rides the same chrome and
  the signed-in arm emits `data-pricing-app` `/app` (never `/login`).
- Web suite: 104 files / 1738 tests green.
- `pnpm turbo build lint typecheck` — 138/138 tasks.
- `check:dom-contract` / `check:spa-env` / `check:protocol-markers` OK; `check:spa-budget`
  shows the standing +33.9 kB cumulative WARN vs `04a4e98b` (GD-KIT3A-BUDGET /
  GD-SPA-ENTRY.R7 stand, disclosed on every R7UX row; ticket delta ≈0 — SSR-only change).
- 193+/44− across 4 files vs ~800 budget.
- Prettier `--check` fails on the 4 touched files — **pre-existing drift at base**
  (verified on the unmodified tree; not reformatted per docs/AGENTS.md format-only-what-
  you-touch).
- Code commit `44521777` pushed.

## Continuation (preview + walk)

- 2026-11-26 — `pr-428` bring-up (216 resources): `init` (owned `rhema:owner=ops-preview`)
  → config (project/region, gitSha `44521777…`, protocolsVersion `0.4.0+07b1ad37ddaaa6f4`,
  `placeholderImage` hello — pause:3.9 gone, oauth id, apparmor `Localhost`/`rhema-run-task`)
  → `resend-pull` (`rhema-nonprod-resend-api-key@1` + `previews@rhema.tools`) →
  `pulumi install` → `up` converging passes: pass 1 — 214 created + 1 import
  (`rhema-journeys-sa`; AlloyDB primary 368 s, Redis 327 s, GKE 610 s, nodepool 83 s),
  1 AlertPolicy 404 on the just-created `slo_violations` logging metric (≤10-min
  propagation class); `ciPreviewSweepBucketsList` created fresh (no orphan import needed).
- 2026-11-26 — Cloud Build `138a4a46` all-10 @ `44521777` (14m51s,
  `_ALLOW_PLACEHOLDER_SDK=1` — the walk is public-surface only; `/` needs no inference,
  the F-R7UX.9-1 caveat) → digests pinned (`serviceImages` ×8 + `runTaskImageDigest` +
  `proxyImage`) → `up`: api rev `00002-hqj` terminal pre-migrate (R7DEP.2 class) →
  migrate Job `…-34ca754-thnk9` applied → rev `00003-zdw` forced via `gcloud run
  services update --image` + serving → `appBaseUrl`/`apiPublicUrl` pinned → converged.
- 2026-11-26 — **F-R7UX.8-1 class re-verified present + discharged per its own guard:**
  the image-pin `up` replaced the proxy template (`tmpl-7570a4b`) but did NOT roll the VM
  (`proxy-42s4` still on `tmpl-b9d85b5`) → `update-instances --minimal-action replace`
  → VM recreated on the new template.
- 2026-11-26 — Provenance: `/healthz/` `{"gitSha":"445217777b6b6a0107eac66843baf47aa5e5136e"}`
  = PR head; `GET /` 200.
- 2026-11-26 — **Walk PASS** (`reports/2026-11-26_r7ux11-marketing/`): `/` 200 with
  `position:sticky` `data-mk-nav`; the §15.1 set in order — Product → `/#dossier`,
  Workflows → `/#workflow`, Demo → `/demo` (`data-spa-native` + `data-demo-entry="nav"`),
  Pricing → `/pricing`, Changelog → `/#changelog`, **Docs** = `SPAN` placeholder
  (`data-mk-nav-pending="docs"`, title "Docs — the public docs site is on the roadmap",
  no href), Sign in → `/login`, CTA → `/signup` "Get Rhēma free"; zero app-shell hooks;
  all twelve sections in order; `data-mk-footer` with `/#faq` + `data-legal-nav`.
  **No-JS leg** (context `javaScriptEnabled:false`): identical chrome + all 12 sections +
  footer — RV-36 verified live. **`/pricing` signed-out**: same chrome, `signIn → /login`,
  no app shell. **Mobile** (390×844): nav wraps, `overflowX:false`, 12 sections.
  Screenshots: `hero.png`, `sec-<id>.png` ×11, `footer.png`, `pricing.png`,
  `mobile-top.png`, `mobile-mid.png` (16 PNGs + walk-facts.json, `verdict: PASS`).
- 2026-11-26 — Teardown per the owned lifecycle (destroy → orphan → rm, never
  `destroy --remove`): `destroy` pass 1 deleted 134 (AlloyDB 358 s, Redis 225 s,
  nodepool 253 s, GKE 315 s) → pass 2 `--continue-on-error` deleted 79 →
  `private-app` subnet `rhema-pr-428-private-app-3931511` pinned by Google-owned
  `serverless-ipv4-cloudrun-1795704044969372363` (F-OPS.1-12 GC-lag class — the Cloud
  Run serverless reservation releases on Google's clock) → reservation released
  ~16:29Z (~84 min lag, inside the 50 min–2 h window) → final pass deleted the last
  3 (subnet + net + stack) → **orphan sweep CLEAN** (`preview-orphan-sweep.mjs` —
  zero live `pr-<n>` resources, no `--allow` needed; the other
  `serverless-ipv4-cloudrun-*` addresses in the project belong to other stacks) →
  `rm` deregistered; `Pulumi.pr-428.yaml` restored to the tree per the
  pr-425/426/427 precedent.

## Real vs placeholder inventory (the §15.1 report)

- **Real, moved copy:** every section — hero, dossier, workflow, seat, voices, runs,
  models, proof, pricing, changelog, faq, final-cta — keeps its pre-existing wording;
  nothing new was written. Nav labels come from new `COPY.landing.nav.*` keys
  (chrome vocabulary, not claims).
- **Marked placeholders:** `Docs` nav item (`data-mk-nav-pending="docs"` — §15.1's
  destination has no public surface) → D-R7UX.11-1. The hero-recording slot stays
  placeholder-framed pending uncommitted assets (same row).

Closed: 2026-11-26T16:35Z
