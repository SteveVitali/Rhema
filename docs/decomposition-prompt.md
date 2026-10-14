# Decomposition prompt — round 5 (post-SPA disposition)

*Frozen invocation record for `decompose-spec` — run in `mode=extend` against the existing
committed build memory. Written 2026-10-15 after O1–O3 of `docs/post-spa-disposition-brief.md`
(ledger `docs/research-ledger.md`; spec ratified at `d9c8066` + ratification commit).*

## Invocation

```
decompose-spec spec=docs/post-spa-disposition-spec.md mode=extend \
  ledger=true dispatch_target=subagent granularity=balanced \
  tickets_dir=docs/tickets
```

## Binding constraints (from the brief + §10 ratification)

- **mode=extend**: open a new `### Round 5` banner in `docs/tickets/00_MANIFEST.md`'s chain
  table; fork tickets from the current `chainTip` (branch `stevevitali/r5-synthesis`, SHA
  `d9c8066` at prompt-freeze — re-confirm at SETUP). Never rename existing ticket files; append
  under `## Plan extensions`.
- **The spec is the contract source.** Tickets cite `docs/post-spa-disposition-spec.md` §§ and
  REQ ids (`REQ-NAVM-*`, `REQ-NAVT-*`, `REQ-NAVC-16..23`, `REQ-ECON-1..13`, `REQ-FND-6..8`,
  `REQ-FIX-*`, `REQ-OPS-1..7`, `REQ-COST-1..6`, `REQ-MEM-1..10`, `REQ-G1-1..5`). Nothing restates
  the design.
- **Ratified rulings (§10) are constraints, not open questions:** delegated-interceptor
  mechanism; `testCheapRoute` as `is_test` server default + opt-outs; ~$60 window envelope;
  cost posture ruling precedes levers; BL-38 deletions confirmed after dry-run; literal per-row
  DROP closes.
- **Out of scope** (hard): eval/benchmark track (BL-40/43/44/45 + corpus), BL-39 partner
  program, §16.4 marketing claims, backend data-model/API redesign, re-litigating landed ADRs.
- **Operator-owned** (HUMAN rows, never implement-spec inputs): merges (BL-01/81), Resend
  secret seed (BL-80 — gates stream V-2), Stripe/admin-key/pen-test/exposure items, metered-flip
  + unit-econ rulings (BL-13/68), entitlement rulings (BL-50/51), billing-export flip
  (D-OPS.2-1), Google sign-in (D-MAINT.4-1), H4/H5 (BL-41/42), T8 mint if chosen, funded-window
  open (gate), BL-38 production-write approval (gate after dry-run).
- **Sequence constraints (dependency edges):**
  - REQ-NAVC-17 registry fix must land before `R10.keepalive` (REQ-NAVT-5).
  - REQ-NAVC-18 freshness policy must land before `R10` (REQ-NAVT-4) — O2-F5.
  - REQ-ECON-6 seed-pollution fix must land before seeded-artifact legs AND before any window.
  - REQ-ECON-7 cap enforcement + REQ-ECON-8 fail-closed must land before the funded window.
  - The `testCheapRoute` arm (§5.2) lands before the funded window.
  - Stream V-2 preview legs gate on the Resend secret HUMAN row.
  - Nightly-green close (BL-74 remainder) is merge-dependent (BL-01).
- **Tail**: `tail=full` (REC.* closeout rows exist per `reconcile-build`; this round has real
  reconciliation surface — disposition-table closures, spec fold-back, backlog cleanup).

## Partition guidance (from synthesis — the decomposer may revise)

- **stream C + E are mergeable early code work** (fixture/harness fixes, validator parsers,
  BUILD_INDEX, status-cell normalization) — low coupling, $0 verification.
- **stream A (nav) splits at its seams, ~4 tickets:** (i) interceptor core + `data-spa-native` +
  stub ids + SsrHandoff replace + spy migration; (ii) settle contract (`data-nav-count`,
  mounted-pending, settle helpers, runner `documentLoads` un-gating) + dom-contract rows;
  (iii) registry/freshness invariants (NAVC-17/18) + transition tests (NAVC-22);
  (iv) `R10`/`R10.keepalive` legs + head/scroll/keymap acceptance (NAVC-16/19/21/23).
- **stream B ~3 tickets:** guard-defect fixes (ECON-6/7/8 + cumulative-scope pin); the
  `testCheapRoute` arm + `COGS_LEVERS_TEST` default + REQ-ECON-5 rollup rule; funded-window
  regime + driver-build prerequisites (REQ-FND-7).
- **stream V** — 2 tickets: SHA-exact $0 composed pass (V-1); preview legs behind the secret
  (V-2).
- **stream D** — operator-gated items become HUMAN rows; the delegated BL-38 cleanup script is
  one ticket behind a GATE (dry-run → operator confirm → apply).
- **stream F** — funded legs are skeleton/GATE-blocked tickets: GATE-FUNDED-WINDOW with the
  §5.5 checklist quoted verbatim as thresholds; legs schedule after it.
- **Ledger-derived rows** (zombie-cell normalization, DROP closes) fold into the E-hygiene
  ticket carrying REQ-MEM-1/2.
