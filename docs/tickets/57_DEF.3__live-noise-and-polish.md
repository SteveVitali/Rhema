# DEF.3 — Live noise + polish (F7/F9/F10)

- **Sequence:** 57 · **Phase:** post-P1 defect pass · **Tag:** fix
- **base_branch:** `stevevitali/p1-22-launch-checks` (chain tip).
- **Depends on:** STB.3 findings. Independent of DEF.1/DEF.2.
- **Scope (one line):** the smaller live-verified defects — the SDK `/api/hello` probe tripping
  real SLOs (F7), the dead `/api/action` deep-link (F9), and the chat_turn 43>40 cap overshoot
  (F10).
- **Spec §§:** 13.5 (SLO truthfulness), 10.1 (notification deep-links), 12.2 (cap semantics).
- **REQ coverage:** REQ-ARCH-13 (SLO instrumentation), REQ-OBJ-6 (action links), REQ-BILL cap
  semantics.
- **Run:** `implement-spec spec=docs/tickets/57_DEF.3__live-noise-and-polish.md`
- **Gate status:** $0 Stage A. Stage B ≤$5 (one chat_turn re-verify).
- **Live stage:** operator-gated re-verify of the cap fix.

## Goal

- **F7 — SDK `/api/hello` probe denied by run allowlist → noise → real SLO trips.** The SDK's
  health probe hits a path the run allowlist denies, generating `egress_denied_10m` trips (28
  rows one night). Either allowlist the probe path per spec, or make the probe path not count
  toward the alert — pick the honest fix, not suppression.
- **F9 — `/api/action` deep-link dead.** The signed-action URL machinery (P1.19's notification
  actions, PRB.09's base) returns a dead link — the route never got mounted or the path moved.
  Wire it.
- **F10 — chat_turn cap overrun: metered 43 vs cap 40.** Small but real — the cap should hard-stop
  at 40, not overshoot. Find where the cap check races the stream.

## Load-bearing context

- Findings detail: `docs/build/runs/STB.3.md` §4 (F7, F9, F10).
- `/api/action` should carry the signed-action token flow — check `apps/api/src/` for the
  intended mount point.
- F10's 3-credit overshoot pattern resembles the committed-vs-metered gap (F5/DEF.2) — check
  whether it's the same root or a distinct cap-check race before fixing.

## Acceptance

- **AC1** — each finding has root-cause + fix + regression test; the F7 fix removes the SLO noise
  without hiding real denials.
- **AC2** — gates green; `runs/DEF.3.md` evidence.
- **AC3** — F10's cap is a hard stop at the declared bound.

## Verify

- Standard gates + `check-build-memory.sh .`. Stage B: one bounded chat_turn ≤$5 re-verify.
