# GATE G1 — Phase-0 exit (operator reads out; never guessed past)

> **Milestone gate — NOT an `implement-spec` input.** The chain STOPS here after ticket 16 until
> the operator dispositions the exit readout that ticket produces.

Criteria (spec §17 Phase-0 row, quoted in full in `00_MANIFEST.md` § Milestone gates): a Review of
each of the three real projects end-to-end in `dev` with `boundary.attested violations = 0`
(attestation from hydration manifest + proxy log); cited ⇒ fetched green against the proxy log;
every sidecar `parseStatus = ok`; a gate edit round-tripping through the serializer into the next
phase's file; proxy-metered = SDK-reported cost ± 2%; the §18 evaluation pilot wave run end-to-end
on the dev set with σ_d estimated and benchmark n fixed (REQ-EVAL-5).

Also read here: the §16.3 #24 scope re-estimate; the §16.4 rule that the §1.4/§15.1 marketing
claims do not ship until this criterion holds.

**Exit readout (produced by P0.15):** [`docs/phase0-exit-readout.md`](../phase0-exit-readout.md) — each
criterion mapped to its measured/deferred result. Its current verdict: the composition is proven
deterministically and the pilot wave is met; the live `dev` half (three-project Reviews, instrumented
cost runs, live gate round-trip) is **blocked pending the `dev` deploy** (DEFERRALS D-P0.15-1..5, and
the deploy chain D-P0.01-7 / D-P0.06-1 / D-P0.07-1 / D-P0.08-1 / D-P0.09-1). **G1 is not passable while
those Phase-0-scoped rows are OPEN** (DEFERRALS rule 4).

**The tickets that close them:** `16_P0.15b__phase0-live-bringup-and-g1.md` (**Stage A** — the offline
deploy artifacts: the Pulumi/GCP IaC, the live SDK adapter, the arm executors, the live-exit driver,
etc.; the live network no-egress facts already proven live, D-P0.01-2 DONE) followed by
`16_P0.15c__phase0-live-bindings-and-engine-e2e.md` (**the live execution** — write the deferred live
client bindings, build/push the run-task image with the vendored SDK, deploy the full `dev` stack, run
the live 3-project Reviews + instrumented cost + gate round-trip + cap-402 + start-latency, close every
G1-scoped deferral, rewrite the readout with measured values). Both run after ticket 16 and before this
gate; read G1 only once P0.15c reports G1 ready.

- [ ] Operator disposition recorded in the ledger (`.agents/scratch/rhema-build-ledger.md`).
