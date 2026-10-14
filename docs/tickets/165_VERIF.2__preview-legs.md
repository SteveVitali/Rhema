# VERIF.2 — Preview-leg wave on an owned `pr-<n>` stack (stream V-2)

- **Sequence:** 165 · **Phase:** round 5 · **Kind:** ticket
- **base_branch:** current checkout
- **Depends on:** 164_COST.1 (chain position) + **HUMAN-H8's Resend seed** (withholds every leg)
- **Run:** `implement-spec spec=docs/tickets/165_VERIF.2__preview-legs.md`
- **Gate status:** none once the secret lands — the D-rows cite H8 honestly until then
- **Live stage:** pr-<n> preview ($0 legs; preview resource hours recorded — target ≤$8)
- **Production mutations:** none — every leg runs on an owned `pr-<n>` preview, destroyed at closeout
- **Size budget:** ~200 changed lines (evidence + leg re-specs)

## Goal
Discharge the 15 surviving preview legs (D-SPA.6/12..24-1 — REQ-G1-3's stream-V-2 arm) on a
signed-in `pr-<n>` preview: mailbox-minted session via MAINT.6's `resend-pull`/`seed-invite` +
journeys `--invite-code`, asserting `data-renderer`/`data-ssr-cause` only.

## Load
- `docs/post-spa-disposition-spec.md` §9 V-2 + `docs/research/r5_g1_dispositions.md` (row list)
- `scripts/live/preview-stack.mjs` (verb order: init → config → resend-pull → up → seed-invite → journeys)
- `docs/tickets/DEFERRALS.md` D-SPA.*-1 preview rows + D-MAINT.6-1 + D-OPS.1-1

## In scope — deliverables
0. **D-OPS.1-2** — the live paused-AlloyDB leg runs inside this preview-stack exercise (named carrier).
1. Stand `pr-<n>` with the chain-tip images; `resend-pull` + `seed-invite`; mint a real session
   via the mailbox leg.
2. Execute the 15 preview legs; assert `data-renderer`/`data-ssr-cause` only (no paid, no writes
   beyond the preview's own data).
3. Flip each closed D-row with its evidence pointer; honestly re-owe any leg that still fails
   with the classification.
4. Destroy the stack at closeout; resource cost recorded.

## Acceptance criteria
- [ ] All 15 preview legs executed on the owned preview with committed evidence *(staging-verified)*
- [ ] Zero prod writes; spend ledger recorded *(deterministic)*
- [ ] verification green; BUILD_INDEX row + LEDGER advanced. *(agentic — universal AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-OPS-5 REQ-G1-3 (V-2 half)
