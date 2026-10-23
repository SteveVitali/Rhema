# ADR-119: Cap-death and honest-block attribution in the run_success_rate denominator (agent proposal — NOT adopted)

- **Status:** Proposed
- **approved:** **no** — operator decision owed; nothing below is adopted. `slo.ts` is unchanged and
  the probe still counts every `state='failed'` terminal run in the failure numerator.
- **Date:** 2026-10-21
- **Ticket:** R6FOR.1 (REQ-FOR-1, REQ-FOR-2; the ticket's operator-pause clause — an agent may only
  *propose* a denominator/target semantic change)
- **Requirement ids:** REQ-FOR-1, REQ-FOR-2
- **Spec:** rhema-design-spec §13.5 (`run_success_rate` ≥97% weekly / ≥95% daily over
  completed+failed+system-cancelled), §7.1 (per-turn budgets), `docs/ops/slo-review.md`;
  evidence: `docs/build/reports/2026-10-21_R6FOR.1/prod-forensics.md`

## Context

R6FOR.1's live read (system-role DSN, read-only, 2026-10-21) classified the two named
`run_success_rate` failures the launch-readiness probe surfaced:

1. `01M3EGS55XHHFBT6CNS7Z3F5N9` (`research_burst`, `phase_blocked`, 2026-09-26): the Plan phase
   wrote `.rhema/phase-result.json {"status":"blocked"}` **exactly per the skill contract**
   ("a burst that cannot decompose the question … reports `{"status":"blocked"}` — it never
   silently proceeds", `skills/research-burst/SKILL.md:63`). The agent honestly declined; the
   765-credit hold was fully released; the user was charged 0. It lands in `failed` today.
2. `01M3EW0EQJ3ZSNCW3TQ140NGBE` (`chat_turn`, `cap_reached`, 2026-09-26): the turn's consented
   budget was `credits: 5` — requester-set below the §7.1 40-credit ceiling via
   `effectiveBudget` (an edited plan may only shrink). The proxy enforced the cap (3 `cap`
   denials, 402), the settle released the 5-credit hold and absorbed the 16-credit metered
   overrun (`adjustment`, `absorbed`); the user was charged 0. The cap did precisely its job.
   It lands in `failed` today.

Under §13.5's current semantics both count against the platform's success rate. Neither is a
platform reliability failure in the sense the SLO is meant to catch (provider aborts, engine
crashes, metering defects): one is a contract-correct domain verdict, the other is a
user-consented bound doing its job — and both left the user uncharged, the honest-refund
posture working as designed.

## Decision

**Proposed, not adopted** (operator approval required; the ticket gates any denominator or
target semantic change on it):

1. Attribute terminal failures by provenance before the denominator counts them:
   - **`cap_reached` where the tripped cap is requester/consenter-set** (a `chat_turn`
     `inputs.budget` shrunk below the §7.1 ceiling, or an edited plan card) → **user-side
     outcome** — excluded from the failure numerator, same class as user cancels.
   - **`cap_reached` where the tripped cap is system-derived** (the run's estimate-sized
     `cap_credits`) → **platform failure** — an under-sized estimate that kills mid-run is
     ours; it stays in the numerator.
   - **`phase_blocked` where the SDK finished cleanly** (`succeeded`) and the skill wrote a
     contract `blocked` phase result → **domain verdict** — proposed exclusion; the block
     is the agent's honest answer, already surfaced to the user as such. (Operators may
     instead elect to keep it in the numerator — the honest posture is arguable either way;
     that is the question this ADR puts to the operator.)
   - Provider aborts, engine errors, metering defects → platform, unchanged.
2. **No target change** is proposed (≥97% weekly / ≥95% daily stays).
3. If approved, the probe implementation, the failure-attribution field on terminal runs, and
   `docs/ops/slo-review.md`'s "what counts" note land in a follow-up ticket — this ticket
   makes **no** code change to SLO semantics.

## Consequences

- If adopted: the two named failures leave the denominator and the launch-readiness
  `run_success_rate` reflects platform reliability only; a user who deliberately ships a tiny
  budget no longer dents the SLO. Risk: a shrunk budget that still fails a *reasonable* turn
  could mask real under-delivery — mitigated by keeping system-derived caps in the numerator
  and by the weekly review reading the excluded-class count alongside the rate.
- If rejected: `cap_reached` and `phase_blocked` stay failures; the SLO is strictly more
  conservative and no attribution plumbing is needed.
- Either way: **today's semantics are preserved** — no probe/target edit was made under this
  ticket.

## Alternatives considered

- **Count everything as failure (status quo):** simplest; keeps user-consented bounds in a
  platform-reliability number and lets a $0-charge honest block read as a platform outage.
- **Exclude all `cap_reached`:** rejected — a system-estimate cap that trips mid-run IS a
  platform failure (under-sized estimate); blanket exclusion would hide it.
- **Widen the denominator instead of the numerator classes:** rejected — a denominator change
  is a heavier semantic move with no evidence need.

## Revisit trigger

Operator ruling on this proposal (required before any `slo.ts` attribution change). Reopen if
R6WATCH.1's weekly reread shows the excluded class hiding real under-delivery, or if
`phase_blocked` volume becomes material (an over-blocking burst would argue for keeping it in
the numerator).
