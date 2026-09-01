# HUMAN H1 — M15 spike: Claude Platform on AWS auth mode

> **Operator/eng investigation — NOT an `implement-spec` input.** Must be answered **before
> ticket 07 (egress proxy)** — the two proxy designs differ (spec §16.3 #5; §12.9 M15).

Answer, with evidence recorded here:

- [ ] Does the Marketplace flavour authenticate with **SigV4** (proxy signs with its task role,
      injects no key) or a **direct key** (proxy injects; the fallback design)?
- [ ] Do its responses carry the `usage` block the proxy meters (incl. `server_tool_use`)?
- [ ] What is the shape of its Usage & Cost report, and is it matchable by request id
      (nightly reconciliation, §12.7 cross-check 2)?

**Exit:** ticket 07's session is told which design to build. Source: the H0 account-rep thread
plus an empirical check against the endpoint once the subscription exists.
