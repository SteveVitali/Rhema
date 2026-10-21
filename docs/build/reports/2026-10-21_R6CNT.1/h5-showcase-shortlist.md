# R6CNT.1 — H5 public-domain Showcase essay shortlist (REQ-LCH-2b; for HUMAN-H11 pick)

Prepared 2026-10-21. `GD-SHOWCASE.R6` = "Public-domain essay". Five candidates, Essay protocol, all
unambiguously public domain in the US **and** UK/EU (published pre-1930; every author dead >70 yrs).
Word counts measured on the Project Gutenberg texts this run (full text fetched).

## Recommended pick: H.G. Wells, "The Extinction of Man" (1894/1897)

- PD basis: published *Pall Mall Budget* 1894, collected *Certain Personal Matters* (Lawrence &
  Bullen, 1897 — Gutenberg #17508); Wells d. 1946-08-13 → UK/EU life+70 expired 2017-01-01; US PD
  by pre-1930 publication. ≈1,640 words (closest to the ~2,000 target).
- Candidate contradicted Tier-1 claims:
  1. "the evidence of the fossil *Paradoxides* … creatures of this kind may at least attain a length
     of six feet." — *Paradoxides*' largest specimen is 37 cm (≈15 in), and the largest complete
     trilobite ever found (*Isotelus rex*) is 72 cm — under 2.5 ft, not six. (It is also a trilobite,
     not "of this kind" [Crustacea].) Sources: https://en.wikipedia.org/wiki/Paradoxides (fetched) ·
     https://en.wikipedia.org/wiki/Isotelus (fetched) · Rudkin et al. 2003, *J. Paleontology*:
     https://www.cambridge.org/core/journals/journal-of-paleontology/article/abs/worlds-biggest-trilobiteisotelus-rex-new-species-from-the-upper-ordovician-of-northern-manitoba-canada/055501529DC4DFBB308024AD413A3B4E (fetch-gated; abstract confirmed via index)
  2. "he has swept away auk, bison, and dodo during the last two hundred years." — the American bison
     was NOT swept away: hunted to <1,000 but recovering; ~11,000 DOI-managed today, national mammal
     2016. Source: https://www.nps.gov/subjects/bison (fetched). (The dodo also fell ~1681 — outside
     his own 200-year window.)

## Alternate A: Edgar Allan Poe, "The Imp of the Perverse" (1845)

- PD basis: *Graham's Magazine*, July 1845; Poe d. 1849-10-07 → PD everywhere. Gutenberg #2148.
  ≈2,400 words.
- Candidate contradicted Tier-1 claims:
  1. Perverseness "is a radical, a primitive impulse—elementary," not resolvable "into ulterior
     elements." — Modern research resolves it: the "high place phenomenon"/call-of-the-void work
     attributes such urges to a *misinterpreted safety signal* (fear circuitry fires before the
     slower perceptual system). Source: Teismann et al. 2020, *BMC Psychiatry* (open access,
     fetched; quotes Hames et al. 2012 verbatim):
     https://link.springer.com/article/10.1186/s12888-020-02875-8 · Hames et al. 2012,
     *J. Affective Disorders*: https://doi.org/10.1016/j.jad.2011.10.035
  2. The essay's explanatory frame is phrenology — "organ[s]" of mind deduced a priori — which it
     treats as live science to be extended. Phrenology is discredited pseudoscience. Source:
     Encyclopedia of the History of Science (CMU), fetched:
     https://ethos.lps.library.cmu.edu/article/id/482/

## Alternate B: Charles Lamb, "A Dissertation Upon Roast Pig" (1822)

- PD basis: *London Magazine*, Sept 1822; *Essays of Elia* (1823); Lamb d. 1834-12-27 → PD
  everywhere. Gutenberg "Works of Charles and Mary Lamb vol. 2" (#10343) + standalone #43566.
  ≈2,700 words.
- Candidate contradicted Tier-1 claims:
  1. The entire premise is sourced to "a Chinese manuscript… their great Confucius in the second
     chapter of his *Mundane Mutations*." No such Confucian text exists; modern scholarship traces
     the germ to Porphyry's *De Abstinentia* — the manuscript frame is Lamb's fiction. Source:
     C. Murray, *China from the Ruins of Athens and Rome* (OUP 2020), ch. 4 — DOI resolved:
     https://doi.org/10.1093/oso/9780198767015.003.0004
  2. Mankind "for the first seventy thousand ages ate their meat raw" — cooking/fire evidence is far
     older (Gesher Benot Ya'aqov ~780 ka; Wonderwerk ~1 Ma) than any 70,000-unit reading. (Weak —
     "ages" is undefined; secondary candidate.) Meanwhile "as they do in Abyssinia to this day"
     (Ethiopian raw-meat custom — kitfo/tere siga) *verifies* — a nice contrast row.

## Flagged for length — pickable if the operator accepts ~3.4k words: Jonathan Swift, "A Modest Proposal" (1729)

- PD basis: Dublin 1729; Swift d. 1745-10-19 → PD everywhere. Gutenberg #1080. ≈3,431 words.
- Candidate contradicted Tier-1 claim: "The number of souls in this kingdom being usually reckoned
  one million and a half" — modern estimates put Ireland c. 1712–1731 at 2.0–2.9 million; even the
  official 1731 church count was 2,010,000. Swift's "usual reckoning" is ~half the record. Source:
  History Ireland (fetched): https://historyireland.com/taxing-enquiry-many-people-pre-census-ireland/

## Flagged for length + fetch-gated source — Mark Twain, "Fenimore Cooper's Literary Offenses" (1895)

- PD basis: *North American Review*, July 1895; Clemens d. 1910-04-21 → PD everywhere. Gutenberg
  #3172. ≈4,800 words (well over target).
- Candidate contradicted Tier-1 claim: "in the restricted space of two-thirds of a page, Cooper has
  scored 114 offences against literary art out of a possible 115." — Cooper scholars Schachterle &
  Ljungquist (1988, *Studies in the American Renaissance*) show Twain "carefully manipulat[ed]
  Cooper's texts, wilfully misread[]… and sometimes fabricat[ed] evidence" (Twain's excerpted text
  was a corrupted edition). Sources: https://en.wikipedia.org/wiki/Fenimore_Cooper%27s_Literary_Offenses
  (fetched) · https://jfcoopersociety.org/content/04-crit/articles/other/1988other-schachterle.htm
  (anti-robot fetch gate — publicly readable in a browser; re-fetch at seed time).

## Note for R6CNT.2

Whichever essay is picked, `assertShowcaseFixture` requires ≥1 contradicted Tier-1 claim carrying
its fetched URL — every candidate above has one pre-staged. Re-fetch each cited URL inside the
showcase build's own fetch tooling (the `fetched:` rows must be real review fetches); this run's
fetch status is recorded inline per source.
