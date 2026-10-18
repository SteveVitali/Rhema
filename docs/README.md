<!--
  docs/README.md — the docs map with a mode column (BM-DOCS-02). Added by MAINT.1 (build-memory v2 migration).
  One row per top-level docs/ entry. The numbered docs are NOT renamed (the frozen spec cites them).
-->
# Rhēma docs

The Rhēma design record and build memory. Each entry has a **mode** that says how it may change.

**Where the build is (2026-10-18):** the product runs in production on `rhema.tools` (GCP; Cloud SQL
prod / AlloyDB dev+previews); the round-3 launch-readiness invariants are ratified spec —
REQ-SPEC-29 (browser-journey acceptance via `@rhema/journeys`), REQ-SPEC-30 (tenant isolation in
depth), REQ-SPEC-31 (research integrity / *Unverified* delivery), REQ-SPEC-32 (cost truthfulness).
The round-4/5 frontend-SPA migration is **authored-dormant**: engineered and deterministic-test
green at the chain tip — round 5 added the client-side-navigation mechanism (one delegated
`document` click interceptor; ADR-110; spec §14.19) — unmerged pending the operator's ordered
activation ([`build/INTEGRATION_PLAN.md`](./build/INTEGRATION_PLAN.md) §R4/§R5) — prod still
serves pre-chain ancestors, so nothing round-4/5 is live yet (the spec's §14.17 posture;
[`build/OPERATIONAL_READINESS.md`](./build/OPERATIONAL_READINESS.md)). Open-state honesty: trial
interim terms (`audience: "test_tenants"`, ADR-014), purchases `"closed"` (ADR-028), refund window
`test_tenants`-only (ADR-071; BL-30 pending), four SLO breaches open (D-SLO.1-5…8), G2 deferred —
no efficacy claims anywhere (REQ-EVAL-19).

| Mode | What it means | How it changes |
|---|---|---|
| **frozen** | written once, then immutable (captured evidence / a ratified artifact) | not edited; corrections are recorded elsewhere |
| **frozen-with-amendments** | the ratified spec | amend via the manifest amendment protocol + an ADR; ids append-only |
| **append-only** | a register or immutable-decision record | add rows/records; never rewrite a landed entry |
| **historical record** | a committed record of what happened during the build | not rewritten; only broken references repaired |
| **generated** | derived from source by a script | edit the source + regenerate; never hand-edit the output |

| Entry | Mode | What it is / how to change it |
|---|---|---|
| [`1_founding-prompt.md`](./1_founding-prompt.md) | **frozen** | The founding prompt. Historical; not edited. |
| [`2_research-and-design-ledger.md`](./2_research-and-design-ledger.md) | **frozen** | The phase 1–5 research + design ledger (Q register, streams, change log). Frozen at ratification; the change log gains dated lines only. |
| [`4_external-chatgpt-product-business-critique.md`](./4_external-chatgpt-product-business-critique.md) | **frozen** | An external product/business critique captured during synthesis. Not edited. |
| [`5_round2-ledger.md`](./5_round2-ledger.md) | **frozen** | The round-2 research ledger. Not edited. |
| [`6_ticket-decomposition-prompt.md`](./6_ticket-decomposition-prompt.md) | **frozen** | The decomposition hand-off prompt (regenerates the ticket chain). Not edited. |
| [`frontend-spa-brief.md`](./frontend-spa-brief.md) | **frozen** | The operator's round-4 brief (2026-10-07) that seeded the SPA spec. Captured, not edited. |
| [`research-ledger.md`](./research-ledger.md) | **frozen** | The round-4 research & design ledger (BM-SYNTH-01) — living until the spec was ratified, frozen since (2026-10-08). |
| [`OUTLINE_TRACE.md`](./OUTLINE_TRACE.md) | **frozen** | The brief→spec coverage trace for the round-4 spec (synthesis artifact). Not edited. |
| [`decomposition-prompt.md`](./decomposition-prompt.md) | **frozen** | The round-4 synthesize→decompose hand-off prompt, frozen at ratification (2026-10-08, spec v1.0). |
| [`frontend-spa-spec.md`](./frontend-spa-spec.md) | **frozen-with-amendments** | The canonical round-4 spec (v1.2): the v1.0 body plus **§14 Spec amendments** — the as-built record (§14.18/§14.19 carry the round-5 client-side-navigation fold-back). Where the body and §14 disagree, §14 is correct. |
| [`rhema-design-spec.md`](./rhema-design-spec.md) | **frozen-with-amendments** | The canonical, ratified design spec (v1.0). Change a requirement by amending here, then the manifest `## Spec amendments applied` + an ADR — never fork the design into a ticket. |
| [`phase0-exit-readout.md`](./phase0-exit-readout.md) | **append-only** | The G1 Phase-0 exit readout: each criterion → measured/deferred result. Updated by appending measured values as the live legs land. |
| [`phase1-exit-readout.md`](./phase1-exit-readout.md) | **append-only** | The Phase-1 exit readout (§17, P1.22): each criterion → build evidence or honest "unmeasured"; corrections land as dated entries in its append-only Corrections section. |
| [`research/`](./research/) | **frozen** | Numbered research notes (phases 1–3). Historical; not edited. |
| [`design/`](./design/) | **frozen** | Numbered design notes (phase 3). Historical; not edited. |
| [`tickets/`](./tickets/) | **historical record** | The committed contract record: [`tickets/00_MANIFEST.md`](./tickets/00_MANIFEST.md) is the chain order; each `NN_<ID>__…` file is one ticket's contract; executed contracts are not rewritten. [`tickets/DEFERRALS.md`](./tickets/DEFERRALS.md) is **append-only** (read first every run; never overwritten). |
| [`build/`](./build/) | **historical record** | Committed build memory (build-memory v2, ADR-004): the machine-state ledger [`build/LEDGER.md`](./build/LEDGER.md), the per-ticket run ledgers [`build/runs/`](./build/runs/) and PR bodies [`build/pr/`](./build/pr/), [`build/BUILD_INDEX.md`](./build/BUILD_INDEX.md), gate readouts [`build/readouts/`](./build/readouts/). Validated by `check-build-memory.sh`; `build/logs/` is the one gitignored subtree; the marker [`build/README.md`](./build/README.md) is living. |
| [`adr/`](./adr/) | **append-only** | Architecture Decision Records. A decision is immutable; a change is a **new** ADR. The index [`adr/README.md`](./adr/README.md) is **generated** by `build-memory adr-index` — never hand-edited. |
| [`ops/`](./ops/) | **living** | Operator-facing runbooks and review rules: [`ops/slo-review.md`](./ops/slo-review.md) (the REQ-ARCH-34 weekly SLO review), [`ops/debit-mode-flip.md`](./ops/debit-mode-flip.md) (the committed→metered flip), and [`ops/playbooks/`](./ops/playbooks/) (one per alert row). Correct in place as the procedures evolve. |
| [`security/`](./security/) | **living** | Security audit + engagement records: the usercontent/CSP audit, the tenancy audit, the RLS-exposure review, and the pen-test scope/vendor-package/findings-triage set. Correct in place; dated findings stay attributed to their date. |
