# External pen test — scope document (P1.22 W11)

Stage-A artifact. This document IS the ticket's pen-test output: the controls list + surface map the
engagement tests against, sized so procurement can run without a design deep-dive. The engagement
itself + findings triage are the operator's Stage-B procurement — a slipped engagement is not a quiet
skip: the §17 readout says so and names the compensating controls (the deterministic suite + the live
smokes).

## Engagement shape

- **Model:** external, authenticated (two paid tenants + one free trial account provisioned by the
  operator), white-box on request (repo read for the scope surfaces only).
- **Duration:** 2 weeks active test + 1 week report. **Launch window:** findings triaged before public
  launch — criticals are launch-blocking; highs sized.
- **Environment:** production (`api.rhema.tools`, `rhema.tools`, `usercontent.rhema.tools`) or the
  staging clone; live runs consume paid inference, so the operator provisions the test tenants and the
  credit budget.
- **Rules of engagement:** no tenant data beyond the provisioned accounts; egress-denied spikes pause
  runs by design — induced spikes are in-scope and expected; paid-inference budget capped per tenant.

## Surface map

| Surface | Entry points | Notes |
|---|---|---|
| api (`api.rhema.tools`) | all routes; auth (`__Host-` cookies, session middleware, Origin guard); run routes (launch, gates, caps); internal run API (run-token auth, `attempt` fencing); billing/trial/entitlement flows; imports (quarantine presign) | token tests: forged run tokens, `attempt` replay, cross-run tokens |
| web (`rhema.tools`) | SSR surfaces; CSP nonce scheme; auth flow; sheet launch params | injected `<script>` in user-controlled fields; CSP bypass attempts |
| usercontent (`usercontent.rhema.tools` + `*.`) | object GET/PUT; quarantine keys | cookie theft (none exist — assert it); content-type confusion; path traversal `quarantine/a/../b` |
| egress proxy | `web_fetch`/`web_search` through a live run | the §12.8 channel: query smuggling, n-gram evasion, domain-cap evasion |
| run-task sandbox | GKE Job, two-uid split, distroless image (no shell/pkg manager, static applets), read-only rootfs, tmpfs mounts, Localhost `rhema-run-task` AppArmor profile (mount allow-list; SEC.3) | shell escape → forge audit/fetch-log/event rows; spend outside the meter; read `/var/run/rhema/harness`; mount/unshare beyond the profile's scoped-runner sequence (profile allows only propagation-private on `/`, the `/work` tmpfs overmount, and `/tmp/scoped-stash` ↔ `/work/scoped` ro binds) |
| fetcher + convert | URL fetches (SSRF, robots, rate limit), no-network convert Job | SSRF via crafted URLs; convert egress attempt |
| tenancy | cross-workspace reads/writes on every route; RLS bypass via connection pooling | the pooled two-tenant test's live counterpart |
| ingest | API/MCP key rotation (LIVE_KEYS), credential-handling paths | planted secrets; key material in logs |

## Controls list — what is claimed (the suite asserts each; the pen test tries to break it)

§12.8 injection controls, all executable in `@rhema/security-checks` (`injection-controls.test.ts`):

- **(a)** Full-board fetch traffic routes through the `fetcher` tool — no direct `WebFetch`/`WebSearch`
  tool exposure to the agent at a Full board.
- **(b)** Every fetched page and chat attachment is `<document trust="untrusted">`-wrapped.
- **(c)** Model-independent verdict source checks: a `verified`/`contradicted` Tier-1 verdict citing a
  URL that fails the rule downgrades to `unverifiable` (`sourceCheck: 'suspicious_source'`) at commit;
  schema validation on findings/verdicts/source notes at commit.
- **(d)** Outbound-channel limits at the proxy: >256-char query strings refused; per-run
  distinct-registrable-domain cap; ≥12-word draft n-gram match → `suspicious_query` → pause +
  refusal-class card. Planted exfiltration fixtures exercise each.
- **(e)** The input-scoped second read never sees fetched pages (mount-manifest assertion); subagent
  outputs are file-read.
- **(f)** Privilege separation: `harness` uid holds run token + proxy credential; `agent` uid runs
  scrubbed; a shell escape cannot forge rows or spend outside the meter.
- **REQ-ARCH-32:** an `egress.denied` spike pauses the run end-to-end (signal transport + worker sweep).

Plus: tenancy (forced-RLS + pooled isolation), secrets boundary (harness-only file, `0600`, scrubbed
agent env, no provider keys in web/collab/model process), quarantine-key tenant binding, CSP/cookie
posture above, retention/tombstone lifecycle.

## Residual-risk statement (verbatim, §14.7 privacy sentence — REQ-SPEC-25)

> "Rhema does not train models on your content. Model providers process it under their commercial API
> terms: [list]. During a review the Editor searches the web to check your claims; Rhema limits and
> monitors what those searches can carry, but a search query is text that leaves Rhema."

The stated residual: an injected Editor can still exfiltrate draft fragments through **short search
queries** — ≤256 chars, under the domain cap, below the 12-word n-gram threshold. The controls bound
and monitor the channel; they do not close it. The scope asks the pen test to size that residual
concretely (how much a motivated injection can actually move per query, per run) — a number the readout
and the copy can cite honestly.

## Findings triage (operator's Stage-B protocol)

- **Critical** (auth bypass, cross-tenant read/write, secret disclosure, cap circumvention):
  launch-blocking — fix before public launch, no exceptions.
- **High** (control bypass with material impact): sized; fix or accept-with-mitigation recorded in
  DEFERRALS.
- **Medium/low**: backlog tickets.
- Every finding lands in `docs/build/readouts/` + a DEFERRALS row if carried; none silently dropped.
