# HUMAN H4 — Venue-table verification

> **Operator work — NOT an `implement-spec` input.** Complete before ticket 49 (P1.21) starts.

Per spec §16.3 #14 and REQ-GENRE-3: every Op-ed outlet row (NYT 400–1,200; WaPo ≤750; WSJ
600–1,200; LAT ~750; USA Today 650–900; Globe ≤700) and every seeded venue row (e.g. PLOS ONE
abstract ≤300) carries no date on its source page — **verify each against the live source** and
record `verified_at` per row before the protocols seed.

- [ ] All rows verified with dates; handed to ticket 49's session.
