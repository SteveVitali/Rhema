# ADR-017: Tenant isolation in depth — user-serving code cannot bypass RLS

- **Status:** Accepted
- **Date:** 2026-09-30
- **Ticket:** SEC.1
- **Requirement ids:** REQ-SPEC-30 (new), REQ-DATA-4 (strengthened), REQ-ARCH-30
- **Spec:** §11.4, §13.3 (2026-09-30 banners); Appendix A.9

## Context

Every tenant table has carried `FORCE ROW LEVEL SECURITY` since `0004_rls.sql`. On 2026-09-17, PRB.16's live
finding added `0026_system_bypassrls.sql`: `alter role postgres bypassrls`. The intent was to let the
system-scoped sweeps see rows (stranded-run legs, the parked-run sweep, run_events retention, the circuit-breaker
read).

Every prod service connects as `postgres`, so the change also exempted every **user-serving** query from RLS.
Since then, any query that relied on RLS alone has returned every workspace's rows in prod. The tests run on
PGlite without that role, so they stayed green. There have been two live leaks:
- **STB.2 (2026-09-25):** the dossier route, patched with a predicate at that one route.
- **2026-09-30 browser review:** `/voices` (`voice-routes.ts` ~349), which listed another workspace's voices to a
  brand-new account.

## Decision

Per REQ-SPEC-30, split the roles rather than retrofit ~1,000 call sites:
1. **User-serving pool (`DATABASE_URL`).** The api, collab and user-scoped worker handlers connect with a
   dedicated role **without** `BYPASSRLS`, over the existing forced RLS and `SET LOCAL` scope.
2. **System pool (`SYSTEM_DATABASE_URL`).** Only the documented system paths keep a bypass role. A lint forbids
   user-route code from importing it. Each system-pool query carries an explicit workspace predicate or sits on an
   allowlist of intentional cross-tenant scans. SEC.1 audits exactly these call sites.
3. **Proof.**
   - The integration suite runs as the user-serving role.
   - A two-tenant probe over every tenant-scoped read route runs on the deployed stage.
   - Later tickets that add a tenant read extend the probe.
4. **Rollback and disclosure.**
   - The switch is reversible by configuration (the pool URL).
   - It is operator-paused, because it is a database role change (ADR-013).
   - SEC.1 emits the list of user-serving queries that relied on RLS alone and were therefore exposed since
     2026-09-17. The disclosure decision is the operator's (HUMAN-H7, BL-37).

## Consequences

- **Queries fail closed.** Code that quietly depended on the bypass while serving users now returns zero rows. It
  is found by the suite (run as the new role) and by the probe before prod, or it surfaces as an empty surface,
  not a leak.
- **A new generated secret.** The role password is IaC-generated for a new role (pre-authorized). The switch
  itself pauses for the operator.
- **Explicit predicates.** They are required only on the system pool. Adding them across user-serving code is
  not retrofitted; RLS carries that layer, and new code follows the lint.

## Alternatives considered

- **Revert 0026.** Re-breaks the system sweeps (the reason it exists).
- **Audit and add a predicate to every query, keeping the bypass role.** ~1,000 call sites cannot be proven
  complete, and one miss is a leak — today's state.
- **Keep patching routes as found.** How the second leak happened.

## Revisit trigger

- Any cross-tenant row observed on any route after SEC.1 lands.
- A need for a new cross-tenant read in user-serving code.
- A system-pool query found serving a user request.
