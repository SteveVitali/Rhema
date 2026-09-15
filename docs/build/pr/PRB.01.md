# PRB.01 — Beta web shell, invite gating, sample dossier

Implements `docs/tickets/17_PRB.01__beta-shell-and-invites.md` — the first Phase-B (Review beta) ticket. Builds
the beta's front door: invite-gated sign-in, a deliberately flat dark web shell, a project list whose rows are
derived from the §6.3 state function, and a public invite page with a read-only sample dossier.

**Context:** Phase 0 exited (GATE G1 PASSED, 2026-09-15); GATE G2 (wave-1 LIFT) is **DEFERRED** by operator
decision (`readouts/GATE-G2.md`). Per that decision this ships **no efficacy/marketing claims** (§16.4 stands
until the eval clears) and **no pricing/plans page** (REQ-BETA-19) — the beta is private and capped.

## Summary

- **Invite gating** (`apps/api/src/invite.ts`, migration `0016_invites.sql`): an invite gate (`check`/`consume`)
  over an `invites` + `invite_redemptions` table — single-use-by-default codes, optional email allowlist,
  expiry/revocation, and an atomic conditional-UPDATE that closes the last-use race. Enforced at the web
  `/login` POST: **no valid invitation ⇒ no auth request is ever made** (Google + magic link). No public signup
  path, no pricing page (REQ-BETA-19).
- **Flat dark shell** (`@rhema/tokens` §5.9 values + `themeCss()`; `@rhema/ui` React primitives; `apps/web`
  React Router SSR served by Hono): a header + single centred column, Dark by default, phone-width readable, on
  the canonical `/p/:project` URLs (§4.2). No pane system — that is the §5 design system (P1.01). Built with
  `tsc` (no Vite / no framework mode) — see **ADR-007**; this is REQ-BETA-21 **stopgap #2**.
- **Project list** (`apps/api/src/project-list.ts` → `@rhema/ui` `ProjectList`): each row's pill + one primary
  action is **derived from the §6.3 `projectState` function** (`@rhema/orchestrator`) over the project's real
  rows — no stored `status` column (REQ-SPEC-3, REQ-PROD-9).
- **Invite page + read-only sample dossier** (`apps/web` `InvitePage` + `@rhema/ui` `DossierView` +
  `sample-dossier.ts`): an Essay-protocol dossier drawn from a real project, whose claim ledger carries a
  **contradicted Tier-1 claim shown with the source the fact-check fetched** (REQ-POS-3) — the 60-second proof
  that this is not chat. Read-only (no triage/disposition controls).
- **Vocabulary lint wiring** (`@rhema/contracts` `lintCopy`): a reusable word-boundary lint over the Appendix
  D.2 bedrock (`reserved-strings.ts`) — the "extends P0.02's data for UI strings" mechanism. The beta's copy
  table (`apps/web/src/copy.ts`) lints green (REQ-PROD-6 / REQ-BILL-18).

## What changed

- **New:** `packages/tokens/src/{tokens,theme-css}.ts`; `packages/contracts/src/vocab-lint.ts`;
  `packages/db/migrations/0016_invites.sql` + `packages/db/src/schema/invites.ts`;
  `apps/api/src/{invite,project-list}.ts`; `packages/api-client/src/index.ts` (typed client);
  `packages/ui/src/{primitives,shell,project-list,dossier}.tsx`;
  `apps/web/src/{copy,sample-dossier,state-map,data,page-data,pages,routes,render,server,main}.ts(x)`.
- **Changed:** `apps/api/src/index.ts` (mount shell + invite routes when `deps.db` present); barrels for
  `@rhema/tokens`/`@rhema/ui`/`@rhema/contracts`/`@rhema/db`/`@rhema/api-client`/`@rhema/web`; `@rhema/ui` +
  `apps/web` package.json/tsconfig (React + JSX); `vitest.config.ts` (automatic JSX + `.test.tsx`).
- **Docs:** `docs/adr/ADR-007-*`, `docs/build/runs/PRB.01.md`, `docs/tickets/DEFERRALS.md` (PRB.01 rows).

## Design decisions

- **ADR-007** — beta shell = React Router **declarative SSR** compiled by `tsc` (no Vite/framework mode), served
  by Hono, no client bundle (progressive-enhancement forms + links). Keeps the `turbo build/lint/typecheck`
  green gate intact and fits REQ-BETA-21's throwaway flat shell.
- **`apps/web` stays decoupled** from heavy packages — the project list arrives as a DTO from `apps/api` (which
  owns the `projectState` derivation); web depends only on `@rhema/api-client`/`@rhema/ui`/`@rhema/tokens`/
  `@rhema/contracts`. Every user-facing string is a prop / lives in the lint-checked copy table.
- **Vocab lint** is a **word-boundary** function (so "Project" passes though "Pro" is banned, "authority" passes
  though "author" is reserved), run as the deterministic i18n test — the precise vehicle for AC4 (the coarse
  eslint global rule stays as-is).

## Verification

- `pnpm turbo build lint typecheck` → **102/102**. `pnpm test` → **1303 pass / 2 skip**, no regressions.
  `check-build-memory.sh .` → 0 violations.
- Per-AC deterministic tests (unit on PGlite + integration via Hono `app.request`) + a live HTTP boot of the
  shell over a real socket — see the AC table below.

## Requirement ids

REQ-BETA-19, REQ-BETA-21 (stopgap #2 declared), REQ-PROD-9 (surface half), REQ-SPEC-3 (UI half),
REQ-PROD-6 / REQ-BILL-18 (lint wiring), REQ-POS-3 (sample-dossier rule). Also §4.2 (URLs), §5.9 (tokens).

## Acceptance criteria → evidence

| AC | Status | Evidence |
|---|---|---|
| AC1 — signup refused w/o invite; w/ one → project list | met | `apps/api/src/invite.test.ts` (6); `apps/web/src/server.test.ts` AC1 (POST /login gates before auth; `/app`→`/login`); live boot: no-code→400, GOOD+magic→200 sent, GOOD+google→302 |
| AC2 — rows derive pill/action from the state function; no stored status | met | `apps/api/src/project-list.test.ts` (5: `projectState()` equality, no status column, tenant scope); `packages/ui/src/ui.test.tsx`; live boot `/app`→pill+action |
| AC3 — sample dossier read-only + contradicted Tier-1 + fetched chip | met | `apps/web/src/server.test.ts` AC3 + `sample-dossier.test.ts`; live boot `/`→`[contradicted-t1,fetched-chip,courtlistener]`, `aria-readonly`, no button/form |
| AC4 — i18n/string lint green vs Appendix D.2 | met | `packages/contracts/src/vocab-lint.test.ts` (6); `apps/web/src/copy.test.ts` (`lintCopy(collectCopyStrings())` == []) |
| AC5 — no public pricing/plans/signup-without-invite | met | `apps/web/src/routes.test.ts`; `server.test.ts` AC5; live boot `/pricing`→404 |

## Deferrals (gate-pending, not fabricated)

- **D-PRB.01-1** — live Google/magic-link e2e + `consume` at account creation (needs Better Auth mounted on
  `dev`; **D-P0.01-3**). The gate + web pre-gate are built and tested; the live OAuth binding is deploy-gated.
- **D-PRB.01-2** — operator content sign-off for the sample dossier (**HUMAN H3**); the stand-in honours
  REQ-POS-3 today.
- **D-PRB.01-3** — the live api `createApp({db})` binding must pass a tenant-scoped (`withTenant`) client
  (**D-P0.08-1**); the route filters by `workspace_id` explicitly as defense.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
