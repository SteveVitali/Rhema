# R6CNT.1 — H4 venue-table evidence (REQ-LCH-2a; for HUMAN-H11)

Prepared 2026-10-21. Every seeded venue/outlet row in `packages/protocols/src/protocols.ts`
(`ACADEMIC_PROTOCOL.venue_bar.table`, `OP_ED_PROTOCOL.venue_bar.table`, `MEMO_PROTOCOL.venue_bar`),
checked against the live venue page. All `as_of` today = `2026-09-01` (`VENUE_AS_OF`).
Proposed `verified_at` for confirmed rows: `2026-10-21T00:00:00.000Z` (matches `ESSAY_PROTOCOL` format).
**No seed value was changed — flagged rows stay stale until the operator rules (REQ-LCH-4 / R6CNT.2).**

Fetch note: NYT help-center, PLOS, LAT, Globe (apps) pages fetched live this run. WaPo/WSJ/USAToday
blocked the fetch (403/402) — their quoted caps come from each outlet's own page text surfaced in
search results; those rows are flagged, not silently trusted. Re-fetch in a browser during H11.

| Seed row (protocol) | Seed cap | Live page (URL) | Live quoted cap | Verdict | Proposed verified_at |
|---|---|---|---|---|---|
| PLOS ONE abstract (Academic) | ≤300 words | https://journals.plos.org/plosone/s/submission-guidelines | "Not exceed 300 words" (Abstract section, fetched 2026-10-21) | **MATCH** | `2026-10-21T00:00:00.000Z` |
| NYT (Op-ed) | 400–1,200 | https://help.nytimes.com/115003870867-Reader-Submissions/115014809107-New-York-Times-Opinion-Guest-Essays | "a word count typically from 800 to 1,200 words, although we sometimes publish essays that are shorter or longer" (fetched) | **FLAGGED** — seed min 400 vs live typical floor 800 | after operator rules on `minWords` |
| WaPo (Op-ed) | ≤750 | https://helpcenter.washingtonpost.com/hc/en-us/articles/115003675788-Submit-an-op-ed | "Submissions should be limited to 800 words." (search-index quote; live fetch 403) | **FLAGGED** — fetch blocked + cap differs (800 vs 750) | pending re-fetch + ruling |
| WSJ (Op-ed) | 600–1,200 | https://www.wsj.com/articles/op-ed-guidelines-for-the-wall-street-journal-1483740089 | "between 400 and 1,000 jargon-free words" (search-index quote; live fetch 403) | **FLAGGED** — fetch blocked + range differs | pending re-fetch + ruling |
| LAT (Op-ed) | ~750 max | https://www.latimes.com/oe-howtosubmitoped-story.html | "Most published articles are about 750 to 1,000 words in length." (fetched) | **FLAGGED** — live gives a 750–1,000 band, not a ≤750 cap | after operator rules on bounds |
| USA Today (Op-ed) | 650–900 | https://www.usatoday.com/story/opinion/2019/12/04/submit-letters-columns-and-comment-social/2608825001/ | "Columns typically run 550 to 750 words." (search-index quote; live fetch 402) | **FLAGGED** — fetch blocked + range differs | pending re-fetch + ruling |
| Globe (Op-ed) | ≤700 | https://apps.bostonglobe.com/opinion/graphics/2021/06/meet-globe-opinion/ | "About 800 words is a good target length." (fetched; older Globe pages still say "keep the piece to 700 words") | **FLAGGED** — current Globe guidance ~800 vs seed ≤700 | after operator rules on `maxWords` |
| Memo silent-read | no cap — row shape only | n/a (internal format; `venue_bar.kind = "silent-read"`, prompt only, no table) | n/a | **shape confirmed in code** — nothing external to fetch | n/a |

Summary: 1 row matches verbatim (PLOS ONE), 6 outlet rows differ from the live guidance (2 confirmed
by fetch, 4 on search-index quotes after fetch blocks), 1 row is shape-only. The seed looks drawn
from ~2010-era guidance (OpEd Project lists); live guidance has drifted. Recommendation for H11:
approve PLOS ONE's `verified_at` now; for the six flagged rows choose update-to-live-values
(recommended: NYT 800–1,200, WaPo ≤800, WSJ 400–1,000, LAT 750–1,000, USAToday 550–750, Globe ≤800 —
all subject to a browser re-fetch of the 403/402 pages) or keep-as-stale.
