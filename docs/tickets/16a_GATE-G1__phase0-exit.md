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

- [ ] Operator disposition recorded in the ledger (`.agents/scratch/rhema-build-ledger.md`).
