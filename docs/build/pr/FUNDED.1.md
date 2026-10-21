# FUNDED.1 — Funded-window wave (window attempted — envelope exhausted at bind, $0 spent)

Manifest row 167 · stacks on `stevevitali/verif-2-preview-legs` (tip `9dcfcf9`, the
GATE-R5F disposition commit) · merge policy **OPERATOR** — do not merge from the build
environment · contract `docs/tickets/167_FUNDED.1__funded-window-wave.md` (expanded at run
time from skeleton on the PASSED disposition) · run ledger `docs/build/runs/FUNDED.1.md` ·
live evidence `docs/build/reports/2026-10-16_funded-env/`.

## What lands — and the finding the operator needs to rule on

The skeleton ticket expanded per `decompose-spec mode=extend` on the GATE-R5F disposition
(**"PASSED — open the window"**): the 21-leg `paid:true` wave in checklist order (T9 →
launchers → riders → B19C last-and-conditional, Σ declared caps $54.50) plus every §5.6
census item whose driver landed, with a declared per-dispatch `--headroom` plan.

**The window could not open.** With the system-role DSN bound over the IAP tunnel
(`postgres`, `rolsuper|rolbypassrls` verified), `funded-window.mjs --dry-run` measures:

- **pinned-scope cumulative $80.86 / 2,430 flagged-tenant proxy rows since 2026-10-01
  ≥ the ~$60 re-authorized cap** — every dispatch refuses pre-dispatch (`cumUsd ≥
  ROUND_CAP` → exit 3). ISO-week spend is $0.00; the $80.86 is entirely Oct 1–6 pre-window
  spend (the earlier windows' legs under the same epoch).
- `tenant` row also FAILs closed (`test+jrn-a@rhema.tools` absent — reaped); the other
  seven rows PASS (dsn, headroom $54.50 declared = Σ caps, caps, ordering, exclusions,
  opt-outs, unpaused).

**$0.00 spent. Zero production mutations — no dispatch, no tenant provisioning, no
house-grant, no seed writes, no `FUNDED_ROUND_SINCE` override.** Minting credits on a
tenant that cannot legally run a leg is not honest provisioning; re-epoching the envelope
is a re-authorization the operator owns.

## What the operator can rule on (named, not self-authorized)

- **(a) Re-authorize a new envelope** — `FUNDED_ROUND_SINCE=<window-open>` re-epochs the
  cumulative so only new spend counts; or
- **(b) raise `FUNDED_WINDOW_CAP_USD`** above the $80.86 history; or
- **(c) accept the wave stays owed** — every funded D-row remains OPEN under its existing
  carrier; `D-CAP.2-1` carries the dated exhaustion note.

Note Q-ECON.f was ruled against the old unfiltered figure ($145.95); the pinned scope
re-measures the same history at $80.86 — above $60 either way, so the exhaustion finding
is robust to the query-scope question.

## Verification

- `pnpm turbo build lint typecheck` — 135/135 green
- `pnpm test` — 502 files / **5,814 pass / 4 skip / 0 fail**
- `check:licenses` · `check:protocol-markers` · `check:no-cookies` · `check:spa-budget` ·
  `check:spa-env` · `check:dom-contract` — all green
- `check-build-memory.sh .` + `check-append-only.mjs --base 9dcfcf9` — clean

## Boundaries honored

No secrets in evidence (`provided:` lines only); no `pulumi`/deploy/DNS/stateful change;
the mechanical guard's refusal is reported verbatim, never patched or overridden; red/owed
legs stay honestly owed with named carriers.
