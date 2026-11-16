# 274_HUMAN — operator-acts

**Status:** open · **Phase:** handoff inserts (mode=extend) · **Prereqs:** merged `main`; order per the handoff (266 first, then 267; billing items ahead of non-defect rows; 274 is a HUMAN row) · **Size:** M · **Origin:** operator handoff 2026-11-15 (`rhema-boilerplate-findings-handoff/findings-note.md`), findings re-verified at tip by the read-only pass — verdicts recorded in `docs/build/runs/rh-verify.md`.

## Scope (verified findings — the note's "agent-reported" items are re-confirmed in the verify run)

HUMAN row — operator acts: RH-6 DMARC (+CAA) DNS records; RH-28 `send` MX at Squarespace + Resend re-verify; RH-27 phone pairing for Cloud push; 'not-Rhēma' items noted for operator: stray GCP project `pr-23aed7d73660bf80` on the billing account, GitHub ruleset admin bypass (Episteme), episteme.live auto-renew by 2026-12-08

Every fix carries its own regression that fails pre-fix where a code test applies. Read the findings note's cited lines; treat each as a hypothesis — if code disagrees, STOP and report, don't deviate silently.

## Verify

Focused tests + `pnpm turbo build` on touched pkgs + typecheck/lint; `docs/build/runs/274_HUMAN.md` + `docs/build/pr/274_HUMAN.md`; DEFERRALS/BACKLOG rows named by the findings; BUILD_INDEX + LEDGER lines; `gh pr create --base main`; `ci-boundary.sh --pr`; `check-append-only --base origin/main`; `check-build-memory` (inherited classes — not yours). Never merge; $0 unless the ticket names a read-only prod check; secrets/user data never in records.
