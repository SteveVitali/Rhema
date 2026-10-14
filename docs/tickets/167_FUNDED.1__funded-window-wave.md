# FUNDED.1 — Funded-window wave (the paid-leg sweep)

- **Sequence:** 167 · **Phase:** round 5 · **Kind:** skeleton
- **base_branch:** current checkout
- **Depends on:** 166_GATE-R5F (PASSED) + 160_R5ECON.3's regime landed+deployed
- **Gate status:** gated on 166_GATE-R5F
- **Live stage:** operator-gated: paid prod legs under the §5.5 regime (~$60 envelope)
- **Production mutations:** journey tenant provisioning + paid model runs (the regime's own accounting)
- **Size budget:** TBD at expansion

> **Skeleton only** — gated on GATE-R5F. Body expands at run time to enumerate the wave's legs.

## Scope (one line)
Execute the funded wave under the new regime in checklist order (T9 → launchers → riders →
B19C last-and-conditional): the 21 registry `paid:true` legs + the §5.6 census items whose
drivers landed (RES.1 excerpt, ADR-086 rate read, RES.3 verify, R5ECON.2 OFF/ON pairs if built,
BL-78's ~$1 rider) — closing the stream-F deferral rows with evidence.

## Spec §§
`docs/post-spa-disposition-spec.md` §5 (all of it) + §5.6 census · `docs/research/r5_f1_funded-census.md`

## REQ coverage
REQ-FND-6 REQ-FND-8 + every D-* funded row the wave discharges (enumerated at expansion)
