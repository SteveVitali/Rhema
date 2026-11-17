# 294_R6NOTE.3 — backlog hygiene: dated closures (BL-91/92/103/107)

## Summary

Records-only: four BL rows verified already discharged by their named carriers but still `open` —
BL-91 (REQ-HOME-1: no Apply button, non-default-only params), BL-92 (REQ-KIT-2 two-variant Chip,
B8 named in `timeline.tsx:208`), BL-103 (flip sweep DONE, residual → BL-104), BL-107 (REQ-CLOSE-4
discharged by `254_R7DOC.1`, re-verified by the `290_R6FIX.26` sweep). Dated closures only.

## Test plan

- [x] Each closure re-verified against the carrier's landed code/tests this run.
- [x] Append-only vs `origin/main`, gitleaks — clean.

Generated with [Devin](https://devin.ai)
