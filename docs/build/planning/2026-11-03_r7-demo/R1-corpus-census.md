# R1 — Demo corpus census (round 7, rhema.tools/demo)

- **Row:** R1 (research), 2026-11-03. Read-only census; nothing in either repo was modified apart from this file.
- **Source root (`$P`):** `~/agent-discourse/agent-scratch/projects/`. The projects are `the-politics-of-visibility` (POV), `the-governable-mind` (GM), `structure-of-political-difference` (SPD), and `constitution-of-reason` (CoR).
- **Method:** I enumerated every file with `find` and classified each one by the operator rulings. Every allowlisted `.md` file was scanned line by line with a regex census. Scratch scripts: `/private/tmp/claude-501/-Users-stevenvitali-Rh-ma/74b2ccff-5dcf-4a6d-8b25-f7c0cd70a956/scratchpad/{census.py,deny.py,deny2.py}`. The results file `files.json` sits in the same directory.
- **Location note:** `personas/`, `notes/`, and `tmp/` live one level up, at `agent-scratch/`. They sit outside every project directory, so the per-project globs below never reach them. Only `.DS_Store` occurs inside a project.

## 1. Allowlist per project

The globs are relative to `$P/<project>/`. "KEEP" means allowlisted by the rulings. "AMBIG" means the operator should confirm (§8).

| Glob | POV | GM | SPD | CoR |
|---|---|---|---|---|
| `drafts/v[0-9]*.md` | 2 · 177,372 B | 3 · 370,100 | 4 · 212,211 | 3 · 226,031 (v2–v4; no v1 exists) |
| `drafts/figures/*.png` | — | — | 8 · 1,321,016 | — |
| `correspondence/**` | 9 · 238,408 | 19 · 988,992 | 8 · 152,856 | 8 · 186,116 |
| `agents/author/ledgers/*.md` | 1 · 21,122 | 2 · 145,512 | 1 · 18,760 | 1 · 18,124 |
| `agents/author/drafting/v1/*.md` | 7 · 165,111 | 18 · 414,361 | — (SPD v1 was hand-written) | — |
| `agents/*/research/index*.md` | 2 · 28,093 | 16 · 227,722 | 2 · 9,859 | 2 · 2,736 |
| `agents/*/research/sources/*.md` | 176 · 323,673 (author 124 / editor 52) | 622 · 926,296 (267 / 355) | 57 · 79,838 (17 / 40) | 15 · 19,280 (15 / 0) |
| `agents/author/voice-charter.md` (AMBIG, recommend KEEP) | 5,377 | 11,575 | 3,539 | 4,930 |
| **Total KEEP + charter** | **198 files · 959,156 B** | **681 · 3,084,558** | **81 · 1,798,079** | **30 · 457,217** |

**Excluded set, with reasons**

| File | Bytes | Reason |
|---|---|---|
| POV `agents/author/outline/1_article_sketch_and_outline.md` | 85,085 | Deep-research outline (ruling). Its citations carry `utm_source=chatgpt.com`. |
| GM `agents/author/outline/the-governable-mind-pass-iii-article-spec.md` | 76,350 | Same. |
| `manifest.md` ×4 | 4,683 / 8,112 / 4,888 / 2,524 | Round logs containing operator-edit notes (ruling). |
| GM `agents/editor/notes.md` | 29,763 | Editor's private notes (ruling). POV, SPD, and CoR have no `notes.md`. |
| SPD `.DS_Store`, `drafts/.DS_Store` | 12,296 | OS junk. |

**Ambiguous files (decide in §8)**

- **SPD `drafts/short-v1.md` (4,510 B). Recommend EXCLUDE.** This is not a version of the essay. It is a different ~700-word text with the same title (Rawls, Sandel, "three answers that do not reconcile") and 3 references. No manifest entry or correspondence mentions it. It looks like a test fixture.
- **SPD `drafts/taxonomy_reference_sheet.md` (1,696 B). Recommend KEEP.** This is the "companion reference sheet" that v4 §VII cites (`drafts/v4.md:242`). It is listed as a companion artifact in `correspondence/v1-review/00-piece-brief.md:6`. Response-ledger F33 says it needed a public link at publication.
- **SPD `drafts/figures/values-table.png` and `values-table-sm.png` (217,894 B).** No draft references them. They are macOS screenshots (EXIF "Screenshot" plus XMP and capture xattrs) of the charitable-poles table, probably taken from the live post. Recommend KEEP only if the live post renders this table as an image; strip metadata either way.
- **SPD `drafts/figures/figure_2_ches_correlations.png`.** This is the v1 figure, superseded by `_v2.png`, which v2–v4 use. Keep it only for the v1 view.
- **GM working fragments, kept by the globs but duplicating merged files:**
  - `drafting/v1/draft-part{1..5}*.md` (88,753 B), the pieces of v1.
  - `drafting/v1/ledger-slice{A..F}.md` (78,853 B), the pieces of `03-claim-ledger.md`.
  - `research/index-slice{A..N}.md` (74,384 B), the pieces of `index.md`.
  - `correspondence/v2-review/01-claim-ledger-{A,B}.md` (118,321 B), the parts merged into `01-claim-ledger.md`.
  - Recommendation: ship them but hide them from navigation, or drop them (saves ~360 KB).
- **Voice charters ×4. Recommend KEEP.** They carry thesis commitments and "protected strengths", which are good demo material. Persona internals stay at the level of persona ids and file names (`voice-print.md`, `lexicon.md`, `exemplars.md`, `continuity.md`) and measured style targets. I found no biographical or identifying content: no hits for real-name, biography, or employer patterns. The token rewrites in §2 handle the persona references. The same holds for `drafting/v1/01-voice-brief.md` in POV and GM, which carry the heaviest persona internals (voice-print metric tables and "Persona positions … from `continuity.md`"). Those quote only published S. J. Sebastian essays.

## 2. Denylist census (allowlisted `.md` files only)

Counts are shown as occurrences/files, in the order POV · GM · SPD · CoR.

| Pattern | Counts | Samples | Proposed rule | Changes meaning? |
|---|---|---|---|---|
| `Steven` (word) | 5/2 · 12/8 · 1/1 · 0 | POV `drafts/v2.md:214` "Steven Levitsky"; GM `drafts/v3.md:421` "Steven T. Piantadosi"; GM `…/sources/sep-spinoza-nadler.md:3` "Steven Nadler" | **No rule.** All 18 hits are cited third-party scholars. A bare `Steven` token rule would corrupt citations. Gate only on the full-name forms below. | Yes, if applied naively |
| `Vitali`, `stevenvitali`, `SteveVitali`, `Steve` (word) | 0 · 0 · 0 · 0 | — | Hard CI gate (fail on any hit). | — |
| `all-steven-vitali`, `steven-j-vitali*`, `academia.edu` | 0 · 0 · 0 · 0 | ("academia" appears only as content, e.g. GM `anthropic-position-open-weights.md:8` "startups and academia") | Hard gate on the slugs and on `academia.edu`. | — |
| `/Users/` | 0 everywhere | — | Hard gate. | — |
| `~/Desktop` | 0 · 0 · 2/2 · 0 | SPD `correspondence/v1-review/editors-letter.md:3`, `00-piece-brief.md:3`: "(from `~/Desktop/politics_has_five_questions_substack_package/`)" | Rewrite the parenthetical to "(from the author's Substack package)". | No |
| `Desktop` (bare) | 1/1 · 0 · 2/2 · 0 | POV `…/sources/penney-wikipedia-chilling-2016.md:3` "DHS 'Analyst's Desktop Binder'" | **Content.** Keep it; whitelist this line. | Yes, if applied naively |
| `utm_source=chatgpt.com` | 3/2 · 4/4 · 0 · 0 | POV `drafting/v1/00-commissioning-brief.md:5,172`, `correspondence/v1-drafting-note.md:71`; GM `00-commissioning-brief.md:6`, `03-claim-ledger.md:46`, `ledger-sliceC.md:3`, `v1-drafting-note.md:77` | No allowlisted URL carries it (`[?&]utm_` = 0). Every hit is a prose description of provenance discipline ("every citation carries `utm_source=chatgpt.com` and is therefore unverified"). Keep a regex that strips `[?&]utm_[^&)\s]*` from URLs as a guard. Replace the prose token with "a deep-research tracking parameter". | No. The zero-trust point survives. |
| `r.jina.ai` | 0 · 68/62 · 0 · 0 | GM `…/sources/openai-hugging-face-incident-road-ahead-2026-08-26.md:2` "(read via r.jina.ai proxy; direct fetch 403)"; `bublitz-2026-what-is-thought.md:2` "via https://r.jina.ai/ proxy" | No URL uses the `https://r.jina.ai/<url>` prefix form (0 hits). Keep the rewrite rule `https?://r\.jina\.ai/(https?://…)` → `$1` as a guard. Normalize the access annotations to "read via a reader proxy". | No |
| `@example.com` | 0 · 1/1 · 0 · 0 | GM `…/sources/workos-agent-audit-logs-2026-06-03.md:9` `alice@example.com`, quoted from WorkOS docs | Keep (RFC 2606 example domain); whitelist the line. | Yes, if deleted, because the note's point is that the log carries an email |
| `operator` | 10/6 · 78/32 · 12/7 · 0 | Workflow sense: POV `04-draft-ledger.md:55` 'by operator "approved, proceed."'; `v1-response.md:8` "operator-approved shape"; SPD `editors-letter.md:7` "Operator constraints for v2"; GM `v1-response-ledger.md:106` "the operator's outline". Content sense: SB 1119 "An operator shall…", SORM telecom operators, H.R. 9917 | **Targeted rewrite only.** About 21 workflow-sense hits in 13 files become "the author" (or "the author's" before "outline"/"title"). The ~80 statutory or telecom hits stay. A token replace would falsify quoted statute. | Yes, if applied as a token replace |
| `sjs-substack` | 10/8 · 19/13 · 0 · 0 | POV `correspondence/v1-review/editors-letter.md:4`; GM `ledgers/v1-response-ledger.md:5` | Replace with "the S. J. Sebastian corpus". | No |
| `personas/`, `agent-scratch` | 2/2, 2/2 · 6/6, 6/6 · 0 · 0, 2/2 | POV `01-voice-brief.md:5` `agent-scratch/personas/sjs-substack/PERSONA.md`; GM `voice-charter.md:3`; CoR `v2-review/editors-letter.md:3`, `00-piece-brief.md:3` `agent-scratch/constitution-of-reason-draft-2.md` (stale path; the manifest records this) | Paths become "the persona profile". The CoR stale path becomes `drafts/v2.md`. | No |
| Persona file names (`PERSONA.md`, `voice-print`, `lexicon.md`, `exemplars.md`, `continuity.md`, …) | 24/6 · 25/8 · 0 · 0 | POV `00-piece-brief.md:5` "editor loaded `structure-repertoire`… not `voice-print`" | Keep. They are generic skill vocabulary and show the editor/author boundary, which is a demo point. | — |
| Dangling refs to excluded files (`agents/author/outline/…`, `manifest.md`) | outline 4/4 · 3/3 · 0 · 0 | POV `v1-drafting-note.md:5`, `04-draft-ledger.md:3`; structure-plan cut list "outline l. 19–20, 1860–1943" | Render them as non-links labelled "(source outline — not published)". Do not delete them, because the cut list's reasoning depends on them. | No |
| `claude` (case-insensitive) | 1/1 · 231/56 · 0 · 4/2 | POV `…/sources/ap-mn-surveillance-2026-08-13.md:4` **"CWA President Claude Cummings Jr."** (a person); GM `drafts/v3.md:429,446` "Claude Fable 5", "Identity verification on Claude"; CoR `anthropic-multi-agent-figures.md:3` | **No rule.** Essay subject matter, plus one real person's name. | Yes |
| `Claude Code` | 0 everywhere | — | Nothing to do. The `rhema/no-banned-strings` lint (`eslint.config.js:61–64`) scans only string literals and template chunks in TS/JS. Ship the corpus as JSON or markdown data files, never as TS literals, so that essay content (GM names Anthropic and Claude about 600 times) never meets product-copy lint. If a future essay mentions the harness, treat it as quoted content, not copy. | — |
| `anthropic` | 0 · 626/117 · 0 · 46/12 | GM essay subject | No rule. | — |
| `devin` | 0 everywhere | — | — | — |

**Further normalizations to apply**

- Image links in SPD drafts point to `figure_1_five_questions.png` with no `figures/` prefix (v1:19 … v4:273). Rewrite them to `figures/…`.
- Strip the PNG metadata. The matplotlib `Software` tEXt is harmless. The EXIF and XMP on the values-table screenshots and the `com.apple.*` xattrs must go.
- Skill-internal paths stay as text: `references/provenance-rules.md`, `skills/editorial-review/references/verification-protocol.md` (CoR `01-claim-ledger.md:3`). They point to the open-source skills, not private material.

## 3. REQ-POS-3: Tier 1 claims with verdict Contradicted

`assertShowcaseFixture` (`packages/contracts/src/domain/showcase.ts:34–51`) requires `tier === 1 && verdict === "contradicted"` with at least one source URL.

**Correction to the brief.** `docs/round-7-demo-brief.md:75` says every claim ledger contains contradicted verdicts ("politics ≈ 3, structure ≈ 1"). Those numbers come from grep hits on the word, mostly summary lines such as "Contradicted: 0". The actual verdicts are below.

| Project / ledger | T1 Contradicted | Notes |
|---|---|---|
| POV `correspondence/v1-review/01-claim-ledger.md` | **0** | 56 claims: Verified 49, Substantially accurate 7. The editor's letter says "zero contradicted" against interest. |
| POV `agents/author/drafting/v1/03-claim-ledger.md` | **0** | "no Contradicted, no Unsupported" (line 9–10). |
| GM `correspondence/v1-review/01-claim-ledger.md` | **0** | 1 Misleading in context, C15, Tier 1 (the June 2026 Commerce directive). |
| GM `correspondence/v2-review/01-claim-ledger.md` | **3** | See the next table. |
| GM `agents/author/drafting/v1/03-claim-ledger.md` | 1 sub-element | C27 (T1). The outline's "Edward Hall, Political Studies 2023" DOI is actually Shklar's "Rights in the Liberal Tradition"; evidence `https://api.crossref.org/works/10.1177/00323217231171298`. This is a bibliography defect, not a claim, so it is weak for a tour. |
| SPD `correspondence/v1-review/01-claim-ledger.md` | **0** | Two Misleading in context, C23a (Trump "market-leaning") and C23d (Orbán), both escalated T2→T1. |
| CoR `correspondence/v2-review/01-claim-ledger.md` | **0** | 37 checked: Verified 35, Substantially accurate 2. |

The three GM v2-review entries (`correspondence/v2-review/01-claim-ledger.md`):

1. **III16** (lines 97–101): "the first known federal warrant to OpenAI identified a suspect … from the content of two prompts" (v2 l.84 and l.152). Agents identified him by other means; the warrant *searched* by prompt. Evidence: Forbes reprint PDF `https://cdn.lawreportgroup.com/…/AI%20Warrants%20Pt%201%20Forbes%20article.pdf`, `https://cybersecuritynews.com/dhs-warrant-openai/`, CRS `https://www.congress.gov/crs_external_products/LSB/PDF/LSB11429/LSB11429.1.pdf`, and Gizmodo and Stanford CIS links.
2. **VII3-scope** (103–107): "The first documented instance" is wrong. Las Vegas police (Jan. 2025) and a Roanoke jury (Oct. 2024) came earlier. Evidence: NBC `…/driver-las-vegas-cybertruck-explosion-used-chatgpt-plan-blast-authorit-rcna186704`, ABC, KMPH, Fox5, Roanoke Times.
3. **XII2** (175–180): H.R. 9917's order is not "reviewable in court within days". The bill gives a 48-hour petition to the Secretary with no stay, then the D.C. Circuit within 60 days. Evidence: the primary text `https://www.congress.gov/119/bills/hr9917/BILLS-119hr9917ih.pdf`.

**Tour pick.** POV cannot satisfy REQ-POS-3 as written. The closest POV item is **C49 · Tier 1 · Substantially accurate** (`01-claim-ledger.md:684–695`). The quote was truncated inside quotation marks: "the government's fox in charge of the henhouse" omits "**Washington Post's**". Evidence: `https://www.rcfp.org/natanson-post-search-ruling/`. It has a one-word v1→v2 diff: `drafts/v1.md:216` → `drafts/v2.md:210`. The runner-up is C51 (`:709–726`), where the claim was true but ref [46] linked the wrong case (*Mennonite*, PI denied), with evidence `https://www.ca4.uscourts.gov/opinions/251512.P.pdf`.

The best contradicted alternative in the corpus is **GM III16**. It has a one-sentence story ("the warrant searched for him; it did not find him"), primary PDFs, and a fix the essay adopted that makes the argument stronger.

## 4. Tour beat sheet: *The Politics of Visibility*

All paths are under `$P/the-politics-of-visibility/`.

- **Drafting dossier (`agents/author/drafting/v1/`)**
  - *Commissioning brief* (`00-…:13–31`): thesis in its strongest form ("Authoritarianism is not only a regime type but a capacity…"). Success looks like a reader who arrived at "America is totalitarian" or "this is alarmism" and leaves holding the regime/capacity distinction. Target ~10,000–10,500 words, with a ceiling of 10,400.
  - *Structure plan* (`02-…:9`): a spine where every step is a claim. The cut list (`:149–163`) includes "Second-person immersive scene … recast as documented miniature".
  - *Draft ledger, budget vs actual* (`04-…:18–38`): opening 600→770 (+170), §VI 700→830 (+130), §XI 600→490, total ≈ 9,650 against a 10,000–10,500 target. The run log records 48 claims, 0 contradicted, and zero `[unverified]` shipped.
  - *Fidelity audit* (`06-…`): iteration 1 (`:538`) was "deliverable after closing the majors": 34 findings, 2 majors (F1 normalization stage, F16 Rosenthal & Selod causal overclaim). Iteration 2 (`:775`) was "Deliverable as-is … nothing found in two iterations stands between this draft and delivery."
- **Editor's letter, "the one thing"** (`correspondence/v1-review/editors-letter.md:13`): "put the essay into its conversation by name" (Snowden's "turnkey tyranny", Balkin, coercive capacity, Solove, Pettit, Brandeis). The verdict is major revisions.
- **Top three majors** (`:33`, `:40`, `:47`):
  - (1) "The essay doesn't name the conversation it is in."
  - (2) "The injury is the thesis, and it is the least-evidenced thing in the piece — with the strongest published counterargument unanswered" (Posner on collection vs use).
  - (3) "The evidentiary tentpole is a contested defense filing eight days old."
- **Scorecard** (`:118–131`): Thesis 4, Rigor 3, Evidence 4, Originality 2 (lowest), Structure 3, Prose 4, Voice 4, Honesty 3. Evidence is held from 5 by "a wrong case link and a truncated quotation inside quotation marks" (`:166`).
- **Best second-read objection** (`05-second-read.md:29–31`, Objection 5): the falsification clause is self-immunizing. "Calibrated or understated: heads the essay wins, tails the essay was even more right." The second reader was blind to the project; the editor adopted the point as Major 5a.
- **Response ledger rows** (`agents/author/ledgers/v1-response-ledger.md`):
  - *accept*: F5 (`:31`), one-way falsification.
  - *adapt*: F-d2 (`:51`). Only the state-as-subscriber junction is claimed in text, because "the persona's register treats self-praise as a defect".
  - *rebut with evidence*: F-m5 (`:37`). Palmer "questionable" is verbatim in a Wayback capture of the centennial book PDF.
  - *decline*: F-d5 (`:150`), the Pretti context. "Reversible if the editor disagrees."
  - *escalate*: F-q1 (`:66`), §XIV and the appendix kept via the middle path, and F-q3 (`:68`), no self-citation of *SPD*.
  - POV has **no `defer` row**. Use GM (1 deferred in v1, 3 deferred or declined in v2) or CoR (C1 translation credit, Landemore) for that beat.
- **v1→v2 changes traceable to findings**
  - F5 / Objection 5. `drafts/v1.md:232`: "…if the thresholds hold over the coming years, the warning was calibrated; if they fall and nothing here has changed, it was understated." becomes `drafts/v2.md:228`: "…it runs in three directions. … And if they hold while the capabilities recede … then the warning was overblown … the reader is invited to hold it to all three."
  - F5c. `v1.md:148` "…is not a complication of this essay's thesis. It is the thesis." becomes `v2.md:140` "…is real, and it is not an equilibrium. Checks operate on episodes; capacity is a stock."
  - F-m2 / C49. `v1.md:216` "…fox in charge of the henhouse." becomes `v2.md:210` "…fox in charge of the Washington Post's henhouse."
  - Optional F4: `v2.md:198`, the new Pettit/Skinner paragraph. Optional F-d4: `v2.md:24` "Readers braced for the announcement that fascism has arrived can stand down…".
- **Response letter:** `correspondence/v1-response.md` (17 KB). It lists 49 findings: 28 accepted, 12 adapted, 3 rebutted, 1 declined, 2 escalated (from the manifest).

## 5. "What to look at" cards for the other essays

**The Governable Mind** (two rounds; deepest record)

- Two complete review→response cycles (`correspondence/v1-review/`, `v2-review/`, `v1-response.md`, `v2-response.md`). Evidence & accuracy scored 2 in both rounds. Intellectual honesty fell from 4 to 3.
- The revision introduced new errors and the next review caught them. The v1 ledger had 0 contradicted; the v2 ledger has 3 Tier 1 Contradicted claims (§3).
- The author checked the reviewer's own claims. `v2-response.md:43` records that "the sentence you quote as GUARD's § 5(a) … is the struck introduced text". The manifest records that 15 of the review's claims failed the author's primary-source check.
- The disclosure escalation is still open: `v1-response.md:13` "Not knowable by this agent … Awaiting the author", and ledger F61, `v2-response-ledger.md:129`.
- Length is unresolved: about 18,840 body words against a ceiling of about 12,000. The response offers costed options, including splitting the essay (`v2-response.md`, flag 1).

**The Structure of Political Difference** (figures)

- Five matplotlib figures. Figure 2 was regenerated from declared composites after review: `figure_2_ches_correlations_v2.png`, ledger F2, F41.
- "The one thing" (`editors-letter.md:13`): claim the grammar, not the five axes, "four of which exist verbatim on a quiz site". Major 3 is "Essay and manual in a trench coat".
- Two Misleading-in-context profile claims about named leaders (C23a Trump, C23d Orbán). The roster was later rebuilt in v4.
- v3 and v4 are the author's own unreviewed edits: a retitle, a header pass, the seven-profile roster, and em-dash reduction. That gives a "what changed after the review" view.

**The Constitution of Reason** (escalations)

- Escalations E1 and E3 (`agents/author/ledgers/v2-response-ledger.md:60–63`).
  - E1: which reader owns the piece. This gates the ~6,600-word target; v3 is about 10,630 words.
  - E3: byline and first-person texture. "an agent cannot truthfully write 'I' anecdotes for this byline" (`v2-response.md:12`).
- "The one thing" (`editors-letter.md:12`): confront the deflationary compute objection by name.
- The craft notes' "machine-cadence discount" (`04-craft-notes.md:42`).
- Older dossier format. The review starts at v2 (there is no v1), the editor persisted no source notes, and the dossier has extra argument and craft files.

## 6. Published-version plan (live posts not fetched)

| Essay | Closest draft | Known differences and risk |
|---|---|---|
| POV, `/p/the-politics-of-visibility` | `drafts/v2.md` (14,142 words incl. refs; 19 H2) | The manifest defers "renumber-by-appearance" of refs [52]–[74] to pre-publication, so the live reference numbering probably differs. Medium risk. |
| GM, `/p/the-governable-mind` | `drafts/v3.md` (23,184 words incl. refs; 18 H2) | The length was escalated with a recommendation to split. The live post may be cut or split. **Highest risk.** |
| SPD, `/p/the-structure-of-political-difference` | `drafts/v4.md` (7,911 words; 16 H2) | The title matches. The draft subtitle "Toward a grammar of ideological disagreement beyond left and right" differs from the live "Toward a New Grammar of Ideological Disagreement". The first H2 repeats the subtitle and should be dropped. Low risk. |
| CoR, `/p/the-constitution-of-reason` | `drafts/v4.md` (2026-08-05; not in the manifest) | v4 is an unrecorded edit pass over v3, mostly dash→colon recasts. The draft subtitle is "The Logos, the Limits of the Individual Mind, and the Rise of Artificial Societies of Thought"; the live title is "The Constitution of Reason: Multi-Agent AI as Institutional Design". Medium risk. |

**Plan.** In a later row, capture only the live title, subtitle, H2 list, first and last sentence, and reference count, and diff them against the candidate draft. Label the demo's final node "Published (link out)" and do not claim the draft is the published text unless they match.

## 7. Sizes and lazy loading

| | POV | GM | SPD | CoR |
|---|---|---|---|---|
| Markdown bytes (gzip) | 959 KB (360 KB) | 3.08 MB (1.10 MB) | 483 KB (172 KB) + 1.32 MB PNG | 457 KB (160 KB) |
| Source notes (median / max) | 176 (1.5 / 6.9 KB) | 622 (1.1 / 12.4 KB) | 57 (1.4 / 2.8 KB) | 15 (1.3 / 2.1 KB) |
| Largest files | v2 100 KB; v1 77 KB; review claim ledger 72 KB; drafting claim ledger 49 KB; fidelity audit 48 KB | v3 156 KB; v1-review claim ledger 136 KB; v2 125 KB; v2-review claim ledger 123 KB; v1 response ledger 99 KB | fig 4 274 KB; fig 2 202 KB; fig 3 191 KB; v4 58 KB | v3 77 KB; v4 77 KB; v2 72 KB; discourse report 44 KB |

Corpus total is about 6.3 MB raw (about 1.8 MB gzip text plus 1.3 MB of PNG). Per-artifact lazy loading is mandatory for GM. Source notes should load on demand from their index.

## Requirements emitted

- **REQ-DEMO-CORPUS-1.** The ingest is allowlist-only, using the §1 globs per project. Any file outside them, including `outline/**`, `manifest.md`, `agents/editor/notes.md`, and dotfiles, fails the build.
- **REQ-DEMO-CORPUS-2.** Hard-fail gate over the built demo data: `Vitali`, `stevenvitali`, `SteveVitali`, `\bSteve\b`, `steven-j-vitali`, `all-steven-vitali`, `academia.edu`, `/Users/`, `~/`, `[?&]utm_`, `https?://r\.jina\.ai/`, `agent-scratch`, `sjs-substack`, `personas/`. Bare `Steven`, `Desktop`, `claude`, `operator`, and `@example.com` must **not** be gated. The gate may whitelist specific lines, and each whitelist entry must name its file and line.
- **REQ-DEMO-CORPUS-3.** Redactions are rewrites recorded in a committed table (pattern → replacement, file, line, reason). There are no blind token replacements, and essay prose in `drafts/` changes only for the image-path fix.
- **REQ-DEMO-CORPUS-4.** References to excluded files render as non-links with the label "not published".
- **REQ-DEMO-CORPUS-5.** All images are re-encoded or stripped of EXIF, XMP, and tEXt beyond dimensions. SPD image links are rewritten to `figures/`.
- **REQ-DEMO-CORPUS-6.** Corpus text ships as data (JSON or markdown assets), never as TS string literals, so product-copy lint and `COPY` checks do not apply to essay content.
- **REQ-DEMO-CORPUS-7.** The demo's round timeline is authored fresh from the round-log facts. The excluded manifests are never rendered.
- **REQ-DEMO-CORPUS-8.** Each essay's "published" node links to its live Substack URL. The demo labels the closest draft per §6 and claims identity with the live text only when verified.
- **REQ-DEMO-CORPUS-9.** GM artifacts and all source notes lazy-load. No single demo payload exceeds the size of one artifact.
- **REQ-DEMO-CORPUS-10.** `assertShowcaseFixture` must be run against a dossier that actually holds a Tier 1 Contradicted claim (GM v2 review). The brief's claim that every ledger has one is retracted.

## Open questions for operator

1. **REQ-POS-3 on the hero tour.** POV has no Tier 1 Contradicted claim. Options:
   - (a) The POV tour shows C49 (Tier 1, corrected quote, live diff), then hops to GM III16 for "contradicted". **Recommended.**
   - (b) Move step 5 entirely to GM.
   - (c) Relax REQ-POS-3 for the demo.
2. **Author's unreviewed edits.** Should SPD v3/v4 and CoR v4 appear as labelled "author's edits (unreviewed)", or should the timeline end at the last reviewed or responded version?
3. **Ambiguous files.** Confirm the treatment of SPD `short-v1.md` (recommend exclude), the `values-table*.png` screenshots, and the GM fragment files (hide or drop).
