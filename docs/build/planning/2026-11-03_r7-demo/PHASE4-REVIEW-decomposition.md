# Phase-4 adversarial review — round-7 decomposition (rows 209–254)

*Reviewer: fresh context, not the author. Date: 2026-11-03. Inputs: spec v0.2 §3/§4/§5/§6/§8/§10;
`docs/decomposition-prompt-r7.md`; tickets 209–254 (incl. 214a/223a/247a); manifest `### Round 7`,
round-7 REQ index, invariants 18–20; LEDGER CURRENT STATE + GATE DECISIONS `### Round 7`.
Mechanical checks run: header fields + 9 body sections present on every code ticket; universal
phase-gate AC present verbatim on all 45 code/tail tickets (absent only on the 252 gate, correct);
`Run:` line present on every non-HUMAN/GATE file; Requirement-ID sections extracted and diffed
against spec §4.*

## Findings

| id | severity | ticket(s) | finding | evidence | required change |
|---|---|---|---|---|---|
| P4-1 | blocking | 224 | R7a deploy never classifies its payload against the golden re-run rule. 250 has the unticked item; 224 does not. R7a edits the worker run-job module and the orchestrator (213 retires `run.walkthrough`), and the rule says "when in doubt, treat as protocol-affecting". | 224 Gate status (no golden item); 250:36–37; `docs/ops/golden-rerun-rule.md` §"What counts"; `apps/worker/src/run-jobs.ts` `handleRunWalkthrough` | Add to 224: an unticked `[ ] Golden re-run, only if protocol-affecting → PAUSE` item, plus a committed classification deliverable and AC (copy 250 deliverable 1). Have 213 record the classification argument in ADR-130: the walkthrough is a lazy post-delivery call, outside the Review output. |
| P4-2 | major | 223, 224 | The insert-only role pattern as written would trip `check-additive-migrations`, which is GD-DEPLOY.R7's additive condition. To `SET LOCAL ROLE` to the new NOLOGIN role, the api role needs membership: `GRANT <new> TO <existing api role>`. The lint keys on the **grantee** being new, so this is `role_change`, which means a PAUSE at 224 Part B. 223's wording ("granted only on the role this file creates") reads the rule backwards. | 223:44–46, 67–69, 80; `scripts/check-additive-migrations.mjs:91–95` | 223 must choose a lint-clean channel: e.g. a `SECURITY DEFINER` insert function owned by the new role, with `GRANT EXECUTE ON FUNCTION … TO rhema_app` (it carries `ON`, so it is additive). Add an AC that runs the lint on the exact file. If no clean channel exists, PAUSE for a ruling before 224. |
| P4-3 | major | 226, 228, 229, 232, 246 (vs 248) | Orphan seam: the R7b chrome in a demo boot. AppShell wraps every `/_authenticated` leaf, and demo Pages bypass that gate (220 d7). So the sidebar (recent projects, Inbox badge, credits, account menu), the ⌘K palette (`GET /search`), the chat composer and `PREFETCH_SAFE` all mount on `/demo/*`. No R7b ticket owns demo-mode behaviour. Leaks surface only at 248, under a ≤ 100-line fix bound. Tour beat 2 shows the sidebar, so the demo-variant sidebar is a real design decision. | 226/228/232 have no demo-boot clause (grep); 248 d6 + Notes "Leak-fix bound"; 246:173 covers QueryClient only | 226 owns the demo-boot AppShell variant: which items render, with no tenant reads, plus a DOM test that a demo boot issues zero non-allowlisted requests. Add the same demo-boot AC to 228 (palette off or demo-scoped), 232 (composer disabled via ReadOnlyProject) and 246 (prefetch limited to demo twins). 248 keeps only the re-run. |
| P4-4 | major | 211, 212, 226, 229, 231, 232, 235, 238, 243 | Nightly hazard not handled for R7b leg flips, or for the R7a sub-assertions. The nightly runs `main`'s registry against prod. R7b PRs merge to `main` after 224, but prod serves R7a until 250. A U1–U7 leg flipped `expected:"green"` in its PR will redden the nightly. 220–222 and 248 carry the `ready-to-flip` clause; these owners do not. | grep `ready-to-flip` → only 220/221/222/224/248/250; 209 Notes "Why the sub-assertions exist" | Add 209's nightly-hazard clause to each listed ticket. Hold the flip as `ready-to-flip` with preview evidence; 224 flips U3.stopgap / R8.showcase.spa, and 250 flips U1–U7. 250 d7 already expects this, so make the owners match it. |
| P4-5 | major | 209, 220, 221 | Leg-owner conflict. 209's table assigns `R*.demo` → R7DEM.5. 220 (R7DEM.4) flips both `R*.demo` and `P1.demo`, and 221 only "extends" them. The registry allows one owner, and only the owner flips (DACC-8). | 209 d4 table; 220 d15 + AC "Stage B"; 221 d10 | Set `R*.demo` → R7DEM.4 in 209's table: 220 builds the signed-in render. Record it as 209's owned pick, and keep 221 as extender. |
| P4-6 | major | 218, 221 (213) | Fragmented decision: the hub-card counting rule. 218 owns "demo-card bucket selection over 213's count rule" and emits structured numbers. 221 Notes also own "the hub card counting rule" and re-derive the counts in a test. That creates two candidate implementations of the RV-30 rule. | 218 d8 + Notes "Owns"; 221 d3 + Notes "Decisions this ticket owns" | 218 is the sole owner of card facts and counts (pure). 221 renders 218's structured numbers and asserts equality with 218's function, never a re-derivation. Edit 221's Notes. |
| P4-7 | major | 232, 245 | Fragmented decision: the chat markdown seam. 232 opens a D-row "unblock: 245 merged; 245 plugs its renderer into the seam". 245 has no such deliverable, AC or Notes entry, and never mentions 232 or chat. | 232:163–169; 245 d3 site list (findings, inbox, letters, what-changed only) | Add to 245 (renderer half, see Split decisions): "plug the renderer into 232's chat render seam; close D-R7TALK.1a-n; DOM test on an assistant bubble". REQ-TALK-2's markdown B evidence then rides 250. |
| P4-8 | major | 222, 224 (219) | Orphan seam: re-pinning real data after a synthetic-first run. 222's 11 steps target SPD-specific ids (C23a, F1/F23/F31/F42, M2, III16), which the synthetic fixture cannot exercise. If 220–222 run before 219, 224 must "verify and close" the D-rows, but 224 forbids feature code, and fixing step data or quotes is code. | 222 d3 + Notes "Data discipline"; 224 d1 last bullet vs Out of scope "only code … is the CDN invalidation script" | Make 219 a hard dependency of 222 (SPD script and quotes), and leave 220/221 on synthetic. As a fallback, 224 names a pre-declared insert row (`222b_R7DEM.6c` re-pin) instead of in-ticket edits. |
| P4-9 | major | 240, 244 (vs DACC-6) | The public-surface deltas exceed the enumerated DACC-6 list. 240's round-down changes public `/pricing` text. 244's jargon pass changes non-landing public strings such as "Have an invitation?". Neither is in DACC-6's enumerated list (landing CTA + refresh, `/showcase` link, signed-in `/pricing`, SPA Showcase). DACC-6 also requires a re-capture "after each owning ticket", but both defer it to 250. | spec §4.17 DACC-6; 240 Notes "Public delta"; 244:84–85, 140–141 | Amend DACC-6's enumerated list by a dated banner + ADR note (240 for `/pricing` round-down; 244 for public copy), or get an operator ruling (Q2). Each re-captures `public-ssr-baseline` locally against its build, or opens a D-row that 250 closes. |
| P4-10 | major | 248 | Declared dependencies omit tour-target movers named in spec §5.5. §5.5 lists "COPY.1" (both 244 and 245), but 248 lists only 244. The re-pin also consumes 233 (Findings tab "From Review of vN", beat 5), 242 (Figures list, beat 7), 239 (`reserved-chords.json`), 231 (GUARD-3 exclusion list), 228/232 (proxy walk of palette/chat) and 247a (soft block). | 248 Depends on; §5.5; 248 Load anchors cite 231/239 | Add 228, 231, 232, 233, 239, 242, 245, and soft 247a. |
| P4-11 | major | 249 | False transitivity claim. 249 says 240/241/242 are "reached transitively through 248's dependency on 243". They are not: 240 and 242 hang off 227, and 241 off 236. Global GUARD-1 over unmigrated files fails lint. | 249 Depends on; 240/241/242 Depends on | Declare 232, 234, 240, 241, 242, 243 (+ the split rows 240a and 243a) explicitly. |
| P4-12 | major | 238 (235, 236) | 238 owns U5.write, whose "new project" step needs 236. Fork semantics need 235's four freeze triggers. Both are listed only as "row-order reliance (not a §10 dep)", so a leg owner depends on an undeclared row. | 238:104, 180–183 | Declare 235 and 236. |
| P4-13 | major | 214, 218, 220, 221, 225, 240, 243, 245, 250 | Overflow risk. Authors flagged at-ceiling or over-M sizes on rows that also carry live acts (previews, real export) or very large Load sets (R3 444 lines, `api-client` DTOs). With a non-compacting 256k worker, these are split-now cases, not runtime clauses. | each ticket's Size budget / Notes § Sizing | Apply the *Split decisions* below. |
| P4-14 | minor | 229, 232, 235, 236, 246 | Rows at M-upper with no pre-declared runtime cut. Invariant 17 has the worker request a split, and that needs a named seam. | Size budgets: 229 ~850, 232 ~800, 235 ~750, 236 ~800; 246 has 8 items | Add the cut lines given under *Keep, with runtime split clause*. |
| P4-15 | minor | 223, 237, 243, 245, 223a | Undeclared (row-order) dependencies: 223 → 222 (tour callbacks); 237 → 227 (breadcrumb) and 228 (⌘K falls through to the palette); 243 → 241 (formatter); 245 → 244 (copy lint, "when 244 has landed"). 223a points forward to "224 Part A", so the manifest DAG reads 224 ↔ 223a. | each Depends on / Notes | Declare them. Give 223a `Depends on: 219, 222, 223` (§10), and describe 224's Part A/Part B pause as internal to 224. |
| P4-16 | minor | 225–249 (cross-phase) | If R7b is developed on a parallel stack (§5.1 allows it), its declared DAG forks at 210 only. But 229 builds on 212, 232/233 consume 213, 236/237/238/247 consume 211, and 248 consumes 222. | 225 Depends on: 210; 229:5–7; 232:9 | Either fork the R7b stack after 213 (225 → 213), or declare each cross-phase dependency explicitly. |
| P4-17 | minor | 237–249 | The §5.1 merge-after-224 clause is present on 225–236 and missing on 237–249. Bottom-up stacking makes this transitively safe, but the wording is inconsistent. | grep "224" per ticket | Add the one-line clause, or state once in the manifest that it covers all R7b rows. |
| P4-18 | minor | 214 | REQ-DOPS-1 (R4 REQ-DEMO-OPS-1: corpus only in `packages/demo-corpus`; `demo.*` COPY family) is mapped to R7DEM.1 in the manifest, but no ticket stamps it. | manifest:826; 214 REQ section | 214 stamps REQ-DOPS-1, and 222 stamps the `FUNNEL_SCOPE` half. |
| P4-19 | minor | 246, 250 | REQ-SPEED-5 has two "primary" claims. The manifest says R7SYNC.1, but the B evidence (prod timings) is 250's. | manifest:822; 246 d8; 250 d9 | Primary → 250 (B). 246 stamps it as "preview record". |
| P4-20 | minor | 218, 224, 250, 252 | Some stamps are not explicit ids: "REQ-CORPUS-12/13", "REQ-DACC-1 through -6", "REQ-DACC-1…7". 252 stamps nothing (REQ-CLOSE-2). | REQ sections | Expand to explicit ids. 252 lists REQ-CLOSE-2. |
| P4-21 | minor | 218, 220, 242 | Imported-figure card: 218 asks the decomposer to confirm that 220 renders it. 220 d11 accepts, but the manifest doesn't record that. 242 (the R7b figures migration) never mentions the `specKind:"image"` variant, and 248 beat 7 targets the Figures list. | 218 Notes "Shared-decision flag"; 220 d11; grep `specKind` | Record "figure image card → 220" in manifest § Decomposition decisions. Add an AC to 242 that preserves the image variant (DOM test). |
| P4-22 | minor | 209, 217 | `parseDraftLedgerSections` has two trackers. 209 seeds BACKLOG (§7), and 217 opens a DEFERRALS row (REQ-CONV-17). This is consistent as written (217 cross-references the BL id). The open D-row is round-7-scoped, though, so it needs an owner and date or it blocks GATE-ACCEPT. | 209 Notes "Spec tension"; 217:54–56; 252 DEFERRALS rule | 217's row carries owner + date. 253 closes it to BACKLOG. Adjudicated OK otherwise. |
| P4-23 | minor | 248, 222 | The D2.tour owner is R7DEM.6a (single owner), but 248 re-flips it. | 209 d4; 248 d7 | 209 records that 248 is a sanctioned re-flipper, or reassigns the owner to R7TOUR.2 at 248 (a registry-row edit in 248). |
| P4-24 | minor | 244 | GUARD-2's copy lint covers `demo.*`, but 244 may not edit H15-signed demo copy. A banned term there (e.g. "gate") would deadlock. | 244:91, 139 | Route a violation to 248's changed-leaf list. Never exempt it silently. |
| P4-25 | minor | 250, 209 | U6 paid mechanism is ambiguous. 250 anchors "the U6 paid row with its capUsd" in the registry, while 209 forbids a `paid:true` U6 row (the weekly cron sweeps it). | 209 Out of scope; 250 Load anchors | 250 names the mechanism: a CLI one-shot with `--paid --headroom`, or the existing `R4` paid row as updated by 232. No new `paid:true` row. |
| P4-26 | minor | 224 | Rollback execution is not gated. 250 marks executing the rollback as an unticked operator go; 224 does not. | 250:39–40; 224 Gate status | Add the same unticked item to 224. |
| P4-27 | minor | 219 | Hand-authored, corpus-derived data (real `convert-overrides.json`, the denylist line-allowlist) is created *after* H14 signs, so no human reviews it before permanent public history. | 214a Withheld; 219 d2 | 219 AC: override and allowlist rows hold ids plus file:line only, no quoted prose. The PR body flags them for the operator's merge read. |
| P4-28 | minor | 223a, 214a | Format: 223a has no `Sequence:` line. 214a has no `Depends on` (only a trigger). | file headers | Add both. |

**Adjudicated, no change needed:**
- **Sidebar Demo item (226 vs 248).** 226 withholds it and 248 adds or verifies it. SHELL-2's B evidence for the item is 248's; 251 maps both.
- **`[`/`]` and the keymap table (226 vs 239).** 226 owns the schema, checker and the two chords; 239 extends them within that schema.
- **Run sheet across 241/243.** The split is explicit: the SPA surface and helpers are 241's; the `@rhema/ui` controls and the no-JS script are 243's.

## Split decisions (final recommended new rows)

Filenames follow BM-MANIFEST-03 suffixes. Every moved REQ is re-stamped on the new row, and the
manifest REQ index and 209's owner table are updated. 209 has not run, so no record edits are needed.

1. **214 → 214 + `214b_R7DEM.1b__published-fetch-real-export.md`.**
   - **214 keeps:** the package, allowlist/exporter, sanitizer, denylist gate, image sanitization
     (the synthetic exported image is byte-pinned), PROVENANCE writer, version metadata, synthetic
     fixture, licence carve-out and tripwire.
   - **214b gets:** `fetch-published.mjs` and its one pre-authorized run (carrying 214's `[x]`
     item); the file-targeted redaction data; the local real export, sanitizer, denylist and
     `gitleaks dir`; the H14 packet and `export-manifest.json` digest.
   - **Moves:** REQ-CORPUS-12 (fetch half; 214 keeps the data shape) and REQ-DOPS-4, plus both
     live-executed ACs.
   - **Deps:** 214b → 214. 215 → 214 only.
   - **H14:** depends on 214b. Prefer renaming the uncommitted marker to `214c_HUMAN-H14` so the
     lexical order matches. The never-rename rule protects committed files only. Otherwise list
     214b before 214a in the manifest.
2. **218 → 218 + `218a_R7DEM.3b__projector-runs-figures-counts.md`** (the author's cut).
   - **218 keeps:** editor docs, versions and diffs, what-changed, files tree, artifact pages,
     chunking, and the contract/drift harness.
   - **218a gets:** dossier, run report, timeline, S-9 replay, the figure image DTO, and card
     facts/counts (the sole owner per P4-6).
   - **Moves:** REQ-DWEB-15, REQ-TOUR-1 (data), REQ-SYNC-2 (demo half).
   - **Deps:** 218a → 218 and 213. 219 and 220 → 218a.
3. **220 → 220 (server) + `220a_R7DEM.4b__demo-spa-boot-url.md` (SPA).**
   - **220 keeps:** registry, guard, `demoDataSource`, nested JSON app, shell boot payload, SHA-keyed
     twins, asset route, image assertion, the `/demo` SSR frame, the `demo` bucket creation, and
     R3 §7 tests 1–8. That is REQ-DWEB-1…5, 8, 10, 17 and REQ-DOPS-2.
   - **220a gets:** the S-1 spike plus the rewrite or 302 fallback; SPA boot fixes (d7);
     document-navigation entry/exit predicate and DOM tests; the figure-card render; the
     `R*.demo`/`P1.demo` legs and the owned preview. That is REQ-DWEB-6 (client half), 9, 11, 16.
   - **Deps:** 220a → 220. 221 → 220a.
4. **221 → 221 + `221a_R7DEM.5b__demo-hub-cards.md`.**
   - **221 keeps:** the recording proxy and regenerated table, effect closure, label rendering
     (d6a), REQ-TOUR-6/7, the lazy tour seam and bundle grep, and `D3.readonly`. That is
     REQ-DWEB-7/12/13.
   - **221a gets:** the hub, cards, "What to look at", `demoDeepLink`, the tour-entry href, hub
     hooks, `D1.hub`, and the `R*.demo`/`P1.demo` extensions. That is REQ-TOUR-1/3/8.
   - **Deps:** 221a → 221. 222 → 221a + 219 (P4-8). 223 → 221a + 222.
5. **225 → 225 + `225a_R7KIT.2b__primitives-forms-guard-rule.md`.**
   - **225 keeps:** baseline/delta report, all dependencies, `uiCss()`, entry-graph guard, ADR-129,
     and the shell-critical primitives (Tooltip, DropdownMenu, Dialog/Sheet incl. non-modal,
     Button/IconButton, Badge, Kbd, Skeleton, Toast).
   - **225a gets:** Popover, ContextMenu, Select, Tabs, Checkbox, RadioGroup, Switch, cmdk Combobox,
     TextField, TextArea, RadioCards, two-variant Chip, EmptyState, Accordion, and the
     `rhema/no-raw-controls` rule (off). REQ-GUARD-1 (authoring) moves.
   - **Deps:** 225a → 225. 226 → 225. 228, 229 and every later Stream-U row → 225a.
6. **240 → 240 + `240a_R7KIT.3a2__migrate-voices.md`** (the author's cut).
   - `voices.tsx` and its DOM test move, with batch-a GUARD-1 enablement for that file.
   - **Deps:** 240a → 240. 249 → 240a.
7. **243 → 243 + `243a_R7KIT.3e__dossier-layout-claims.md`** (the author's cut).
   - REQ-PANE-5 and REQ-COPY-8 move, with the migration of `dossier-view.tsx`,
     `packages/ui/src/{dossier,letter,claims,findings}.tsx`.
   - The **U4.controls flip moves to 243a**: the dossier is among its 12 surfaces. Set the U4
     owner to `R7KIT.3e` in 209's table, and record the §10 owner-map deviation.
   - **Deps:** 243a → 243. 244, 245, 247a and 248 → 243a.
8. **245 → 245 + `245a_R7COPY.1c__error-copy.md`.**
   - **245 keeps:** REQ-COPY-3 (renderer, monospace rule, URL wrap) and the 232 chat-seam closure
     (P4-7).
   - **245a gets:** REQ-COPY-2 (`errorCopy`, the code inventory and its extraction).
   - **Deps:** 245 → 244. 245a → 245 (stack order) and consumes 231/238 codes. 248 → 245.
9. **250 → `249a_R7PUB.1__landing-pricing-refresh.md` + 250.**
   - **249a gets:** REQ-PUB-1 and REQ-PUB-2, the hero recording from its **own** owned preview of
     the 248+249 tip (§5.6 permits this), the ADR-127 asset declaration, and the PUB-side DACC-6
     re-capture. It carries no prod act.
   - **Deps:** 249a → 248, 249. 250 → 249a.
   - **250 keeps** deliverables 1, 2 and 6–10 (one preview walk, deploy, Stage B, U6, SPEED-5).
     This removes ~450 code lines and a second preview re-up from the heaviest live row.

**Keep, with a runtime split clause** (add the named cut to each ticket's Notes):

| Row | Cut (a) | Cut (b) |
|---|---|---|
| 229 | engine + `paneLayout()` + breakpoints + Desk→panel move | codec v2 migration + U3 leg + ADR banner |
| 232 | JSON send + progress + U6 (REQ-TALK-3, REQ-RELOAD-1) | thread/composer/cost footnote (REQ-TALK-2) + `chat-panel` GUARD-1 |
| 235 | API/DB + freeze triggers + DATA-14 + U7 (REQ-HOME-4) | fidelity UI (REQ-HOME-5) |
| 236 | opens-to-Page + Project settings page (REQ-HOME-2) | blank new project + outline source (REQ-HOME-3/6) |
| 246 | SYNC-3/4/5 | SPEED-1…5 |

211 and 213 already carry adequate clauses.

**Over-factoring.** No merges are recommended. The small rows are deliberate isolations:
- 219: the data commit;
- 224: live-heavy;
- 233: the money investigation;
- 242: a spec-defined batch;
- 249: the guard flip.

## Questions for the operator

1. **Golden re-run at R7a.** Is the walkthrough retirement (213: worker `run.walkthrough` job and
   orchestrator module removed; the Review output is untouched) protocol-affecting under
   `docs/ops/golden-rerun-rule.md`? If yes, 224 pauses for a cohort spend ruling (≤ $100 cap). If
   no, please rule it non-affecting so 224 can cite your words.
2. **DACC-6 deltas.** Do you accept two changes as added enumerated deltas: public `/pricing`
   plan-value lines rounding down (240; a §8.2 truthfulness fix), and public non-landing jargon
   fixes such as "Have an invitation?" (244)?
3. **Tour copy after H15.** 248 may change H15-signed `demo.tour.*` leaves, and its plan is your
   merge-time read of the changed-leaf list. Is that sufficient, or do you want an H15 re-sign of
   the changed leaves before 250 deploys them?
4. **Preview envelope.** 31 tickets each stand up an owned `pr-<n>` (≈ $2–8 each; up to ~$250
   in aggregate). Spec §6 pre-authorizes owned previews but sets no aggregate cap. Do you want an
   envelope, or should R7b rows batch their Stage-B walks into 248's and 250's previews?
