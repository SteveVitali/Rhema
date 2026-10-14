# R5.O2 — Adversarial-review dispositions

**Verdict: REVISE.** 4 blockers, 9 majors, 9 minor/nit. All 22 findings dispositioned in the revised `docs/post-spa-disposition-spec.md`. Reviewer-verified-correct (no action): the getMatchedRoutes/spaRouteFor failure mode, the SsrHandoff Back-loop, client-redirect stub misclassification risk, settle blindness, seed pollution, guard fail-open, cap non-enforcement, cogsLevers seam, UA-CH root cause, TEST_MAILBOX plus-tag, data-edit-source presence, funded-window fail-close, memory-hygiene claims, T13F/T8 mechanics.

| # | sev | disposition |
|---|---|---|
| 1 REQ-OPS collision | blocker | fixed — D1's family renumbered REQ-COST-1..6; Redis-degradation gate + worker soak restored to §7 |
| 2 G1 table absent | blocker | fixed — full per-row table committed to r5_g1_dispositions.md |
| 3 §9 missing OPERATOR/DEFER | blocker | fixed — OPERATOR bundle + DEFER enumeration added; Q-3/Q-5/Q-8 restored |
| 4 funded census dropped | blocker | fixed — §5.6 census table + REQ-FND-6/7/8 |
| 5 NAVT-4 assert fails by construction | blocker | fixed — ordering declared (NAVC-18 lands first); mark-read parity recorded |
| 6 NAVC map off-by-one | major | fixed — 16..23 + A5-7 merge recorded; NAVC-24 defined as nonexistent |
| 7 REQ-ECON-5 dropped | major | fixed — restored in §5.2 + Q-ECON.b registered |
| 8 stream-A legs homeless | major | fixed — stream V added (§9) |
| 9 BL-29 drops D1 headline | major | fixed — rewritten verbatim (convert-svc drift −$44/mo first); Q-POSTURE added |
| 10 spy-migration blast radius | major | fixed — §2.4 names the ~12-suite assign→replace migration + shared seam |
| 11 cumulative guard unfiltered | major | fixed — REQ-ECON-6 extended; scope pinned or ⚑ total-spend declared |
| 12 OQ1 dropped | major | fixed — §2.4 + REQ-NAVC-23 carry the pin-verify |
| 13 phantom-destroy cites | major | fixed — re-cited :157/:173-174/:213-226; invariant restated |
| 14 stub-id prefixes | minor | fixed — all three carry `/_authenticated/` |
| 15 §4.2 xref | minor | fixed — REQ-NAVC-17 |
| 16 JOURNEY_ANDROID_UA fabricated | minor | fixed — mint UA constant; steps.ts:1211 precedent cited |
| 17 register hygiene | minor | fixed — Q-A4-1/6 moved impl-level; Q-N5 merged into Q-ECON.d; ledger Q-3/Q-5/Q-8 + C bookkeeping restored |
| 18 nav-count manifest wording | minor | fixed — all-documents required |
| 19 cap basis unstated | minor | fixed — caps declared levered-expected |
| 20 documentLoads gated | minor | fixed — REQ-NAVT-3 names the un-gating |
| 21 dangling REQ ids | minor | fixed — NAVM-9, REQ-FIX-*, REQ-FND-*, REQ-G1-* all cited; target=_self rule added |
| 22 nits | nit | fixed — A3 phrasing, BL-38 naming, stopPropagation audit recorded, resetScroll ruling added |
