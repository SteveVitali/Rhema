# Run ledger — 338_R6FIX.56 (proxy MIG PROACTIVE roll)

Harness: devin-cli/swe-2-high (direct implementation — infra posture fix, Stage-A proof only)

- 2026-11-26 — F-R7UX.8-1 recorded on the UX wave: `RegionInstanceGroupManager` defaults to
  `OPPORTUNISTIC` — `pulumi up` repinning the proxy image never rolls the running VM. Hit
  twice (pr-425, pr-426): the proxy served the deleted hello-world template on :8443 → run
  agent phase "JSON but not a Message" failures; discharged in-run by manual
  `update-instances --minimal-action replace`. The finding's owed guard: post-up
  `list-instances` template verify — OR pin `PROACTIVE`; this ticket takes the declared
  posture (no script machinery, prod benefit too: a deploy that changes the proxy template
  now rolls prod VMs automatically — which is what a template-changing deploy means).
- 2026-11-26 — `updatePolicy` on the MIG: `PROACTIVE` + `minimalAction:"REPLACE"` +
  `replacementMethod:"SUBSTITUTE"` + `maxSurgeFixed:1`/`maxUnavailableFixed:0` — the
  substitute instance joins and health-checks before the old drops (zero-gap; the
  fail-closed egress posture never sees a dead backend).
- Verify: `compute.test.ts` new leg pins the declared posture — 30/30 green.
- Live datum (parked — spend ruling): the next preview `up` exercising a template repin
  converges the VM without the manual `update-instances` step.
