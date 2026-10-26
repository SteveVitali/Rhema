// P1.17 (§15.4; REQ-POS-3) — the deterministic Showcase dossier seed. Every provisioned workspace gets
// ONE showcase project: an outline, a submitted v1, the full-board dossier (letter + claim ledger +
// findings + run card), the triage ledger, and a revised v2 with the author's response letter — all
// precomputed fixture content, never generated per user, at $0.
//
// CONTENT: R6CNT.2 landed the H5/A4 pick (HUMAN-H11, 2026-10-23 — "I also approve A2, A3, and A4"):
// H.G. Wells, "The Extinction of Man" (Pall Mall Budget 1894; Certain Personal Matters, Lawrence &
// Bullen 1897 — Project Gutenberg #17508, public domain US + UK/EU). The v1 text below is the essay
// verbatim (hard-wraps reflowed, `_x_`→`*x*`, `--`→`—`); the dossier is the approved
// `docs/build/reports/2026-10-21_R6CNT.1/sample-dossier-proposal.md` content extended to the
// full-board shape (letter + 6-claim ledger + 6 findings + rubric). Every cited URL was
// fetch-verified on 2026-10-23 (200 — Paradoxides/Isotelus/Army-ant/K–Pg Wikipedia, NPS bison,
// Gutenberg). REQ-POS-3 is enforced: `assertShowcaseFixture` throws if the claim ledger lacks a
// contradicted tier-1 claim backed by a fetched URL.

import { sha256Hex, assertShowcaseFixture, SHOWCASE_SLUG, SHOWCASE_TITLE } from "@rhema/contracts";
import type { MigrationDb } from "../migrate.js";

/** The byte sink a bound deploy supplies so the dossier's letter/draft markdown actually renders. */
export interface ShowcaseStore {
  put(workspaceId: string, sha256: string, bytes: Uint8Array): Promise<{ key: string }>;
}

const ENC = new TextEncoder();

// ---- the fixture essay — H.G. Wells, "The Extinction of Man" (1894/1897; public domain) ----

export const SHOWCASE_FIXTURE_OUTLINE_MD = `# Outline — The Extinction of Man

## The wager
- Extinction as the rule, not the exception
- Man's exemption is assumed, never argued

## The evidence geology gives
- Dominant taxa fall at their zenith
- No dominant species succeeded by its own descendants

## The menagerie
- The sea: crabs, then cephalopods
- The land: the migratory ants
- Everywhere: the new plague

## The close
- Ascendency as the eve of overthrow
- The reviewer's disbelief as the final beat
`;

export const SHOWCASE_FIXTURE_V1_MD = `# The Extinction of Man

It is part of the excessive egotism of the human animal that the bare idea of its extinction seems incredible to it. "A world without *us*!" it says, as a heady young Cephalaspis might have said it in the old Silurian sea. But since the Cephalaspis and the Coccostëus many a fine animal has increased and multiplied upon the earth, lorded it over land or sea without a rival, and passed at last into the night. Surely it is not so unreasonable to ask why man should be an exception to the rule. From the scientific standpoint at least any reason for such exception is hard to find.

No doubt man is undisputed master at the present time — at least of most of the land surface; but so it has been before with other animals. Let us consider what light geology has to throw upon this. The great land and sea reptiles of the Mesozoic period, for instance, seem to have been as secure as humanity is now in their pre-eminence. But they passed away and left no descendants when the new orders of the mammals emerged from their obscurity. So, too, the huge Titanotheria of the American continent, and all the powerful mammals of Pleistocene South America, the sabre-toothed lion, for instance, and the Machrauchenia suddenly came to a finish when they were still almost at the zenith of their rule. *And in no case does the record of the fossils show a really dominant species succeeded by its own descendants.* What has usually happened in the past appears to be the emergence of some type of animal hitherto rare and unimportant, and the extinction, not simply of the previously ruling species, but of most of the forms that are at all closely related to it. Sometimes, indeed, as in the case of the extinct giants of South America, they vanished without any considerable rivals, victims of pestilence, famine, or, it may be, of that cumulative inefficiency that comes of a too undisputed life. So that the analogy of geology, at anyrate, is against this too acceptable view of man's certain tenure of the earth for the next few million years or so.

And, after all, even now man is by no means such a master of the kingdoms of life as he is apt to imagine. The sea, that mysterious nursery of living things, is for all practical purposes beyond his control. The low-water mark is his limit. Beyond that he may do a little with seine and dredge, murder a few million herrings a year as they come in to spawn, butcher his fellow air-breather, the whale, or haul now and then an unlucky king-crab or strange sea-urchin out of the deep water, in the name of science; but the life of the sea as a whole knows him not, plays out its slow drama of change and development unheeding him, and may in the end, in mere idle sport, throw up some new terrestrial denizens, some new competitor for space to live in and food to live upon, that will sweep him and all his little contrivances out of existence, as certainly and inevitably as he has swept away auk, bison, and dodo during the last two hundred years.

For instance, there are the Crustacea. As a group the crabs and lobsters are confined below the high-water mark. But experiments in air-breathing are no doubt in progress in this group — we already have tropical land-crabs — and as far as we know there is no reason why in the future these creatures should not increase in size and terrestrial capacity. In the past we have the evidence of the fossil *Paradoxides* that creatures of this kind may at least attain a length of six feet, and, considering their intense pugnacity, a crab of such dimensions would be as formidable a creature as one could well imagine. And their amphibious capacity would give them an advantage against us such as at present is only to be found in the case of the alligator or crocodile. If we imagine a shark that could raid out upon the land, or a tiger that could take refuge in the sea, we should have a fair suggestion of what a terrible monster a large predatory crab might prove. And so far as zoological science goes we must, at least, admit that such a creature is an evolutionary possibility.

Then, again, the order of the Cephalopods, to which belong the cuttle-fish and the octopus (sacred to Victor Hugo), may be, for all we can say to the contrary, an order with a future. Their kindred, the Gastropods, have, in the case of the snail and slug, learnt the trick of air-breathing. And not improbably there are even now genera of this order that have escaped the naturalist, or even well-known genera whose possibilities in growth and dietary are still unknown. Suppose some day a specimen of a new species is caught off the coast of Kent. It excites remark at a Royal Society soirée, engenders a Science Note or so, "A Huge Octopus!" and in the next year or so three or four other specimens come to hand, and the thing becomes familiar. "Probably a new and larger variety of *Octopus* so-and-so, hitherto supposed to be tropical," says Professor Gargoyle, and thinks he has disposed of it. Then conceive some mysterious boating accidents and deaths while bathing. A large animal of this kind coming into a region of frequent wrecks might so easily acquire a preferential taste for human nutriment, just as the Colorado beetle acquired a new taste for the common potato and gave up its old food-plants some years ago. Then perhaps a school or pack or flock of *Octopus gigas* would be found busy picking the sailors off a stranded ship, and then in the course of a few score years it might begin to stroll up the beaches and batten on excursionists. Soon it would be a common feature of the watering-places — possibly at last commoner than excursionists. Suppose such a creature were to appear — and it is, we repeat, a possibility, if perhaps a remote one — how could it be fought against? Something might be done by torpedoes; but, so far as our past knowledge goes, man has no means of seriously diminishing the numbers of any animal of the most rudimentary intelligence that made its fastness in the sea.

Even on land it is possible to find creatures that with a little modification might become excessively dangerous to the human ascendency. Most people have read of the migratory ants of Central Africa, against which no man can stand. On the march they simply clear out whole villages, drive men and animals before them in headlong rout, and kill and eat every living creature they can capture. One wonders why they have not already spread the area of their devastations. But at present no doubt they have their natural checks, of ant-eating birds, or what not. In the near future it may be that the European immigrant, as he sets the balance of life swinging in his vigorous manner, may kill off these ant-eating animals, or otherwise unwittingly remove the checks that now keep these terrible little pests within limits. And once they begin to spread in real earnest, it is hard to see how their advance could be stopped. A world devoured by ants seems incredible now, simply because it is not within our experience; but a naturalist would have a dull imagination who could not see in the numerous species of ants, and in their already high intelligence, far more possibility of strange developments than we have in the solitary human animal. And no doubt the idea of the small and feeble organism of man, triumphant and omnipresent, would have seemed equally incredible to an intelligent mammoth or a palæolithic cave bear.

And, finally, there is always the prospect of a new disease. As yet science has scarcely touched more than the fringe of the probabilities associated with the minute fungi that constitute our zymotic diseases. But the bacilli have no more settled down into their final quiescence than have men; like ourselves, they are adapting themselves to new conditions and acquiring new powers. The plagues of the Middle Ages, for instance, seem to have been begotten of a strange bacillus engendered under conditions that sanitary science, in spite of its panacea of drainage, still admits are imperfectly understood, and for all we know even now we may be quite unwittingly evolving some new and more terrible plague — a plague that will not take ten or twenty or thirty per cent., as plagues have done in the past, but the entire hundred.

No; man's complacent assumption of the future is too confident. We think, because things have been easy for mankind as a whole for a generation or so, we are going on to perfect comfort and security in the future. We think that we shall always go to work at ten and leave off at four, and have dinner at seven for ever and ever. But these four suggestions, out of a host of others, must surely do a little against this complacency. Even now, for all we can tell, the coming terror may be crouching for its spring and the fall of humanity be at hand. In the case of every other predominant animal the world has ever seen, I repeat, the hour of its complete ascendency has been the eve of its entire overthrow. But if some poor story-writing man ventures to figure this sober probability in a tale, not a reviewer in London but will tell him his theme is the utterly impossible. And, when the thing happens, one may doubt if even then one will get the recognition one deserves.
`;

export const SHOWCASE_FIXTURE_V2_MD = `# The Extinction of Man

It is part of the excessive egotism of the human animal that the bare idea of its extinction seems incredible to it. "A world without *us*!" it says, as a heady young Cephalaspis might have said it in the old Silurian sea. But since the Cephalaspis and the Coccostëus many a fine animal has increased and multiplied upon the earth, lorded it over land or sea without a rival, and passed at last into the night. Surely it is not so unreasonable to ask why man should be an exception to the rule. From the scientific standpoint at least any reason for such exception is hard to find.

No doubt man is undisputed master at the present time — at least of most of the land surface; but so it has been before with other animals. Let us consider what light geology has to throw upon this. The great land and sea reptiles of the Mesozoic period, for instance, seem to have been as secure as humanity is now in their pre-eminence. But they passed away and left no descendants when the new orders of the mammals emerged from their obscurity. So, too, the huge Titanotheria of the American continent, and all the powerful mammals of Pleistocene South America, the sabre-toothed lion, for instance, and the Machrauchenia suddenly came to a finish when they were still almost at the zenith of their rule. *And in no case does the record of the fossils show a really dominant species succeeded by its own descendants.* What has usually happened in the past appears to be the emergence of some type of animal hitherto rare and unimportant, and the extinction, not simply of the previously ruling species, but of most of the forms that are at all closely related to it. Sometimes, indeed, as in the case of the extinct giants of South America, they vanished without any considerable rivals, victims of pestilence, famine, or, it may be, of that cumulative inefficiency that comes of a too undisputed life. So that the analogy of geology, at anyrate, is against this too acceptable view of man's certain tenure of the earth for the next few million years or so.

And, after all, even now man is by no means such a master of the kingdoms of life as he is apt to imagine. The sea, that mysterious nursery of living things, is for all practical purposes beyond his control. The low-water mark is his limit. Beyond that he may do a little with seine and dredge, murder a few million herrings a year as they come in to spawn, butcher his fellow air-breather, the whale, or haul now and then an unlucky king-crab or strange sea-urchin out of the deep water, in the name of science; but the life of the sea as a whole knows him not, plays out its slow drama of change and development unheeding him, and may in the end, in mere idle sport, throw up some new terrestrial denizens, some new competitor for space to live in and food to live upon, that will sweep him and all his little contrivances out of existence, as certainly and inevitably as he has swept away auk and dodo — and very nearly the bison — during the last two hundred years.

For instance, there are the Crustacea. As a group the crabs and lobsters are confined below the high-water mark. But experiments in air-breathing are no doubt in progress in this group — we already have tropical land-crabs — and as far as we know there is no reason why in the future these creatures should not increase in size and terrestrial capacity.

And their amphibious capacity would give them an advantage against us such as at present is only to be found in the case of the alligator or crocodile. If we imagine a shark that could raid out upon the land, or a tiger that could take refuge in the sea, we should have a fair suggestion of what a terrible monster a large predatory crab might prove. And so far as zoological science goes we must, at least, admit that such a creature is an evolutionary possibility.

The earlier version of this essay claimed that the fossil *Paradoxides* showed creatures of this kind attaining a length of six feet. It does not — the largest *Paradoxides* specimen on record is about fifteen inches, and the largest complete trilobite ever found is under two and a half feet. The six-foot crab stays in the argument as a conjecture, not a specimen: the fear was built on the number, so the number has to be right.

Then, again, the order of the Cephalopods, to which belong the cuttle-fish and the octopus (sacred to Victor Hugo), may be, for all we can say to the contrary, an order with a future. Their kindred, the Gastropods, have, in the case of the snail and slug, learnt the trick of air-breathing. And not improbably there are even now genera of this order that have escaped the naturalist, or even well-known genera whose possibilities in growth and dietary are still unknown. Suppose some day a specimen of a new species is caught off the coast of Kent. It excites remark at a Royal Society soirée, engenders a Science Note or so, "A Huge Octopus!" and in the next year or so three or four other specimens come to hand, and the thing becomes familiar. "Probably a new and larger variety of *Octopus* so-and-so, hitherto supposed to be tropical," says Professor Gargoyle, and thinks he has disposed of it. Then conceive some mysterious boating accidents and deaths while bathing. A large animal of this kind coming into a region of frequent wrecks might so easily acquire a preferential taste for human nutriment, just as the Colorado beetle acquired a new taste for the common potato and gave up its old food-plants some years ago. Then perhaps a school or pack or flock of *Octopus gigas* would be found busy picking the sailors off a stranded ship, and then in the course of a few score years it might begin to stroll up the beaches and batten on excursionists. Soon it would be a common feature of the watering-places — possibly at last commoner than excursionists. Suppose such a creature were to appear — and it is, we repeat, a possibility, if perhaps a remote one — how could it be fought against? Something might be done by torpedoes; but, so far as our past knowledge goes, man has no means of seriously diminishing the numbers of any animal of the most rudimentary intelligence that made its fastness in the sea.

Even on land it is possible to find creatures that with a little modification might become excessively dangerous to the human ascendency. Most people have read of the migratory ants of Central Africa, against which no man can stand. On the march they simply clear out whole villages, drive men and animals before them in headlong rout, and kill and eat every living creature they can capture. One wonders why they have not already spread the area of their devastations. But at present no doubt they have their natural checks, of ant-eating birds, or what not. In the near future it may be that the European immigrant, as he sets the balance of life swinging in his vigorous manner, may kill off these ant-eating animals, or otherwise unwittingly remove the checks that now keep these terrible little pests within limits. And once they begin to spread in real earnest, it is hard to see how their advance could be stopped. A world devoured by ants seems incredible now, simply because it is not within our experience; but a naturalist would have a dull imagination who could not see in the numerous species of ants, and in their already high intelligence, far more possibility of strange developments than we have in the solitary human animal. And no doubt the idea of the small and feeble organism of man, triumphant and omnipresent, would have seemed equally incredible to an intelligent mammoth or a palæolithic cave bear.

And, finally, there is always the prospect of a new disease. As yet science has scarcely touched more than the fringe of the probabilities associated with the minute fungi that constitute our zymotic diseases. But the bacilli have no more settled down into their final quiescence than have men; like ourselves, they are adapting themselves to new conditions and acquiring new powers. The plagues of the Middle Ages, for instance, seem to have been begotten of a strange bacillus engendered under conditions that sanitary science, in spite of its panacea of drainage, still admits are imperfectly understood, and for all we know even now we may be quite unwittingly evolving some new and more terrible plague — a plague that will not take ten or twenty or thirty per cent., as plagues have done in the past, but the entire hundred.

No; man's complacent assumption of the future is too confident. We think, because things have been easy for mankind as a whole for a generation or so, we are going on to perfect comfort and security in the future. We think that we shall always go to work at ten and leave off at four, and have dinner at seven for ever and ever. But these four suggestions, out of a host of others, must surely do a little against this complacency. Even now, for all we can tell, the coming terror may be crouching for its spring and the fall of humanity be at hand. In the case of every other predominant animal the world has ever seen, I repeat, the hour of its complete ascendency has been the eve of its entire overthrow. But if some poor story-writing man ventures to figure this sober probability in a tale, not a reviewer in London but will tell him his theme is the utterly impossible. And, when the thing happens, one may doubt if even then one will get the recognition one deserves.
`;

export const SHOWCASE_FIXTURE_LETTER_MD = `# Editor's letter — The Extinction of Man (v1)

## The verdict

A real argument with a real hole: the essay's hinge specimen is wrong on the fossil record by a factor of two, and one of its three extinctions never happened. The thesis — that humanity's tenure is not guaranteed — survives contact with modern paleontology; the evidence propping it does not. Revise before this goes anywhere. See finding 1.

## Major findings

Beyond the Paradoxides figure, the extinction roll — auk, bison, dodo — contains a survivor and a date outside the essay's own two-hundred-year window. And the speculative menagerie works only because the essay keeps labelling its conjectures as conjectures; the revision must preserve that honesty, not let the six-foot crab harden into a footnote.

## Strengths

The structure IS the argument: the sea twice, the land once, then everywhere. The geology analogy that opens the piece — dominant taxa fall without warning, and no dominant species is succeeded by its own descendants — is the load-bearing claim, and it holds. The close ("the hour of its complete ascendency has been the eve of its entire overthrow") is the sentence the essay exists for.

## Revision roadmap

Correct the Paradoxides figure and carry the correction in the open — an essay about unpreparedness can afford to show its own. Fix the extinction roll or drop the bison. Keep the conjecture labels on the menagerie; they are what separates this from prophecy.

## Considered and rejected

We considered recommending the Cephalopod section be cut for length; it does the essay's best imaginative work and stays. We also considered flagging the title as dated; it is the period's idiom, and the conceit depends on it.
`;

export const SHOWCASE_FIXTURE_RESPONSE_MD = `# Response — The Extinction of Man (v2)

Accounting for the revision, the way the response letter always works: the six-foot crab is corrected in the open — *Paradoxides* tops out near fifteen inches and no complete trilobite has ever exceeded two and a half feet, so the claim now reads as the conjecture it always was. The extinction roll drops the bison, which survives. The conjecture labels on the menagerie stay, as the letter asked. Everything else in the roadmap stands.
`;

// ---- the fixture's claim ledger (deterministic; the tier-1 row is REQ-POS-3's proof) ----
// The contradicted claim's sources are real public URLs the review "fetched" (fetch_log rows below
// carry the same normalized URLs — the cited⇒fetched chip is real data, not decoration). All five
// cited URLs returned 200 on 2026-10-23.

const PARADOXIDES_URL = "https://en.wikipedia.org/wiki/Paradoxides";
const ISOTELUS_URL = "https://en.wikipedia.org/wiki/Isotelus";
const BISON_URL = "https://www.nps.gov/subjects/bison";
const KPG_URL = "https://en.wikipedia.org/wiki/Cretaceous%E2%80%93Paleogene_extinction_event";
const ARMYANT_URL = "https://en.wikipedia.org/wiki/Army_ant";

export const SHOWCASE_FIXTURE_CLAIMS = [
  {
    text: "In the past we have the evidence of the fossil Paradoxides that creatures of this kind may at least attain a length of six feet.",
    tier: 1,
    verdict: "contradicted",
    kind: "factual",
    sourceCheck: "from_search",
    note: "Paradoxides' largest specimen is 37 cm (≈15 in); the largest complete trilobite ever found (Isotelus rex) is 72 cm — under 2.5 ft, not six. Paradoxides is also a trilobite, not a crustacean 'of this kind.' Wrong on the scale and the group.",
    sources: [
      { url: PARADOXIDES_URL, stance: "contradicts", note: "Largest specimen ≈37 cm." },
      { url: ISOTELUS_URL, stance: "contradicts", note: "Isotelus rex, 72 cm — the record complete trilobite." },
    ],
  },
  {
    text: "He has swept away auk, bison, and dodo during the last two hundred years.",
    tier: 1,
    verdict: "misleading_in_context",
    kind: "factual",
    note: "The bison was hunted to under 1,000 but never extinguished — ~11,000 DOI-managed in 19 herds today, designated the US national mammal in 2016; the dodo fell ~1681, outside the essay's own 200-year window; only the great auk (1844) fits.",
    sources: [{ url: BISON_URL, stance: "contradicts", note: "Bison survive — a conservation recovery, not an extinction." }],
  },
  {
    text: "In no case does the record of the fossils show a really dominant species succeeded by its own descendants.",
    tier: 1,
    verdict: "substantially_accurate",
    kind: "interpretive",
    note: "The pattern holds in the mass-extinction literature — dominant clades are replaced by previously marginal competitors — though modern reviewers soften 'in no case' (post-extinction radiations do include survivor lineages).",
  },
  {
    text: "The great land and sea reptiles of the Mesozoic period passed away and left no descendants when the new orders of the mammals emerged.",
    tier: 2,
    verdict: "substantially_accurate",
    kind: "factual",
    note: "True of the ruling Mesozoic reptile clades; the fossil nuance is that birds are theropod descendants — 'left no descendants' holds for the dominant forms the essay names.",
    sources: [{ url: KPG_URL, stance: "supports", note: "The K–Pg boundary's turnover pattern." }],
  },
  {
    text: "The migratory ants of Central Africa clear out whole villages and kill and eat every living creature they can capture.",
    tier: 2,
    verdict: "substantially_accurate",
    kind: "factual",
    note: "Driver-ant (Dorylus) columns do overrun prey en masse; 'no man can stand' is period travel-literature, but the column raids are real.",
    sources: [{ url: ARMYANT_URL, stance: "contextualizes", note: "The swarm-raid phenomenon; the superlative is period color." }],
  },
  {
    text: "For all we know even now we may be quite unwittingly evolving some new and more terrible plague.",
    tier: 3,
    verdict: "unverifiable",
    kind: "predictive",
    note: "Speculative thesis claim — argued, not checked.",
  },
] as const;

// ---- the fixture's findings (a full-board shape: claim + discourse + structure + a second-read row) ----

export const SHOWCASE_FIXTURE_FINDINGS = [
  {
    kind: "claim",
    severity: "blocking",
    origin: "editor",
    letterSection: "major",
    title: "The six-foot crab is the essay's hinge — and it is wrong on the fossil record",
    body: "The nightmare scenario that sells the thesis is scaled off *Paradoxides*. The real genus tops out near fifteen inches, and no complete trilobite has ever exceeded two and a half feet. The essay's scariest object shrinks by half — the correction must be visible, because the fear is built on the number.",
    // HOT.1 — canonical evidence shape (verdict + urls); `accessed` is stamped at insert with the
    // seed's `now`, the same stamp the claim rows' `accessed_at` gets.
    evidence: { verdict: "contradicted", urls: [{ url: PARADOXIDES_URL }] },
    // FIX.1 (REQ-FIX-T13F) — the canonical Apply substrate the api's route consumes verbatim:
    // `suggestion.replacement` is the literal text spliced into the working head, and `anchor`
    // resolves against the V2 head's block map (`b7` — the correction paragraph;
    // `splitMarkdownBlocks` pins the offsets — the fixture test resolves it end-to-end).
    suggestion: {
      replacement:
        "the largest *Paradoxides* specimen on record is about fifteen inches — the six-foot figure was a nineteenth-century overstatement, not a measurement",
    },
    anchor: {
      blockId: "b7",
      quote: "the largest *Paradoxides* specimen on record is about fifteen inches",
      startOffset: 148,
      endOffset: 216,
      confidence: 1,
    },
    rubricDims: ["evidence_accuracy", "intellectual_honesty"],
  },
  {
    kind: "claim",
    severity: "major",
    origin: "editor",
    letterSection: "major",
    title: "The essay's own timeline contradicts one of its three extinctions",
    body: "Within 'the last two hundred years' Wells lists auk, bison, and dodo as swept away. The bison survives (a conservation success, not an extinction) and the dodo fell a decade before the window opens. Of the three, only the great auk honestly belongs.",
    evidence: { verdict: "misleading_in_context", urls: [{ url: BISON_URL }] },
    rubricDims: ["evidence_accuracy"],
  },
  {
    kind: "discourse",
    severity: "minor",
    origin: "editor",
    letterSection: "roadmap",
    title: "The conjecture labels are what keep the menagerie honest",
    body: "The essay repeatedly marks its monsters as possibilities ('a possibility, if perhaps a remote one'). That labelling is the difference between argument and prophecy — the revision must keep it, especially now that the crab is explicitly a conjecture.",
    rubricDims: ["intellectual_honesty"],
  },
  {
    kind: "structure",
    severity: "minor",
    origin: "editor",
    letterSection: "strength",
    title: "The escalation from the sea to everywhere earns the close",
    body: "Crabs, cephalopods, ants, plague — the threats widen from imaginable to ubiquitous, which is exactly what the closing cadence needs behind it. Keep the order.",
    rubricDims: ["structure"],
  },
  {
    kind: "claim",
    severity: "major",
    origin: "second_read",
    letterSection: "major",
    title: "Second read: Paradoxides is misfiled as well as mis-sized",
    body: "Given only the draft: the 'of this kind' grouping places the specimen among the Crustacea, but Paradoxides is a trilobite — the essay's scariest object sits in the wrong phylum as well as the wrong size. Agrees with finding 1; the correction paragraph covers the size, and the 'creatures of this kind' phrasing survives as the essay's own.",
    rubricDims: ["evidence_accuracy"],
    reconciliation: "agrees",
  },
  {
    kind: "craft",
    severity: "note",
    origin: "both",
    letterSection: "strength",
    title: "'the eve of its entire overthrow' is the sentence to keep",
    body: "The closing cadence — ascendency as the eve of overthrow — is the essay's quotable core. Both passes flagged it as the keeper.",
    rubricDims: ["prose"],
    reconciliation: "agrees",
  },
] as const;

export const SHOWCASE_FIXTURE_RUBRIC = {
  dimensions: [
    { dimension: "thesis_contribution", score: 4 },
    { dimension: "argument_rigor", score: 3 },
    { dimension: "evidence_accuracy", score: 2, cap: { dimension: "evidence_accuracy", score: 2, reason: "A contradicted tier-1 claim caps the dimension." } },
    { dimension: "originality_situatedness", score: 4 },
    { dimension: "structure", score: 4 },
    { dimension: "prose", score: 5 },
    { dimension: "voice_audience_fit", score: 4 },
    { dimension: "intellectual_honesty", score: 4 },
  ],
};

// ---------------- the seed ----------------

export interface ShowcaseSeedDeps {
  readonly workspaceId: string;
  readonly ownerId: string;
  readonly ids: () => string;
  readonly clock?: { now(): Date };
  /** bound in the live deploy so the dossier's markdown renders; absent in pure-fixture tests. */
  readonly store?: ShowcaseStore;
  /** the audit label stamped into `created_by`/`frozen_by`/`discharged_by` blobs
   *  (default `"showcase-seed"`; the writable journey seed names its own). */
  readonly seedLabel?: string;
}

export interface ShowcaseSeedResult {
  readonly projectId: string;
  readonly slug: string;
  readonly reviewRunId: string;
  readonly reviewCorrId: string;
  readonly firstFindingId: string;
}

interface ArtifactSpec {
  readonly kind: string;
  readonly namespace: string;
  readonly mirrorPath: string;
  readonly markdown: string;
  readonly ordinal?: number;
}

async function writeArtifact(
  db: MigrationDb,
  deps: ShowcaseSeedDeps,
  projectId: string,
  spec: ArtifactSpec,
): Promise<{ artifactId: string; versionId: string }> {
  const bytes = ENC.encode(spec.markdown);
  const sha = sha256Hex(bytes);
  const words = spec.markdown.split(/\s+/).filter(Boolean).length;
  let s3Key = `fixture/${sha}`;
  if (deps.store) {
    const put = await deps.store.put(deps.workspaceId, sha, bytes);
    s3Key = put.key;
  }
  const artifactId = deps.ids();
  const versionId = deps.ids();
  await db.query(
    `insert into artifacts (id, workspace_id, project_id, kind, namespace, mirror_path, head_version_id)
     values ($1,$2,$3,$4,$5,$6,$7)`,
    [artifactId, deps.workspaceId, projectId, spec.kind, spec.namespace, spec.mirrorPath, versionId],
  );
  await db.query(
    `insert into artifact_versions (id, artifact_id, ordinal, content_sha256, s3_key, bytes, word_count,
                                    media_type, created_by, immutable, parse_status)
     values ($1,$2,$3,$4,$5,$6,$7,'text/markdown',$8,true,'ok')`,
    [
      versionId, artifactId, spec.ordinal ?? 1, sha, s3Key, bytes.byteLength, words,
      JSON.stringify({ kind: "system", label: deps.seedLabel ?? "showcase-seed" }),
    ],
  );
  return { artifactId, versionId };
}

/** Which dossier shape a seed writes — the workspace's one read-only Showcase (provisioning's
 *  caller), or a normal WRITABLE project carrying the same fixture dossier (SPA.21's
 *  T12F/T13F seeded-mutation legs — the Showcase itself is `showcaseReadOnlyGuard`-frozen). */
export interface DossierSeedTarget {
  /** true ⇒ the read-only Showcase (`showcase=true`); false ⇒ a writable project the finding
   *  mutation routes accept. */
  readonly showcase: boolean;
  /** the workspace-unique slug base — deconflicted with `-2`, `-3`… like the Showcase's. */
  readonly slugBase: string;
  readonly title: string;
}

async function seedDossierProject(
  db: MigrationDb,
  deps: ShowcaseSeedDeps,
  target: DossierSeedTarget,
): Promise<ShowcaseSeedResult> {
  // Idempotent per target: the Showcase keys on `p.showcase`; a writable dossier keys on its slug
  // base (a workspace may carry BOTH — the read-only fixture and the seeded writable one).
  const existing = (
    await db.query(
      `select p.id, p.slug,
              (select ci.run_id from correspondence_items ci
                where ci.project_id = p.id and ci.kind = 'review' order by ci.ordinal limit 1) as review_run_id,
              (select f.id from findings f
                join correspondence_items ci on ci.id = f.correspondence_id
                where ci.project_id = p.id and ci.kind = 'review' order by f.ordinal limit 1) as first_finding_id,
              (select ci.id from correspondence_items ci
                where ci.project_id = p.id and ci.kind = 'review' order by ci.ordinal limit 1) as review_corr_id
         from projects p where p.workspace_id = $1 and p.showcase = $2
           and (p.slug = $3 or p.slug like $3 || '-%') and p.deleted_at is null
         order by p.slug limit 1`,
      [deps.workspaceId, target.showcase, target.slugBase],
    )
  ).rows[0] as
    | { id: string; slug: string; review_run_id: string | null; first_finding_id: string | null; review_corr_id: string | null }
    | undefined;
  if (existing && existing.review_run_id && existing.first_finding_id && existing.review_corr_id) {
    return {
      projectId: existing.id,
      slug: existing.slug,
      reviewRunId: existing.review_run_id,
      reviewCorrId: existing.review_corr_id,
      firstFindingId: existing.first_finding_id,
    };
  }

  // REQ-POS-3 + REQ-FIX-T13F — validate the fixture before any row lands (the contradicted
  // tier-1 claim AND the Apply substrate: a {replacement} suggestion + schema-valid anchor).
  assertShowcaseFixture(
    { claims: SHOWCASE_FIXTURE_CLAIMS, findings: SHOWCASE_FIXTURE_FINDINGS },
    "SHOWCASE_FIXTURE",
  );

  const now = deps.clock?.now() ?? new Date();
  const projectId = deps.ids();
  const runId = deps.ids();
  const v1Id = deps.ids();
  const v2Id = deps.ids();
  const corrId = deps.ids();
  const respId = deps.ids();

  // workspace-unique slug (the fixed base wins unless a user project already took it).
  const slugRes = await db.query(
    `select slug from projects where workspace_id = $1 and slug like $2`,
    [deps.workspaceId, `${target.slugBase}%`],
  );
  const taken = new Set((slugRes.rows as { slug: string }[]).map((r) => r.slug));
  let slug = target.slugBase;
  for (let i = 2; taken.has(slug); i++) slug = `${target.slugBase}-${i}`;

  await db.query(
    `insert into projects (id, workspace_id, owner_id, title, slug, protocol_id, showcase)
     values ($1,$2,$3,$4,$5,'essay',$6)`,
    [projectId, deps.workspaceId, deps.ownerId, target.title, slug, target.showcase],
  );
  await db.query(
    `insert into project_members (project_id, user_id, role) values ($1,$2,'admin') on conflict do nothing`,
    [projectId, deps.ownerId],
  );

  // artifacts: outline + the two draft versions + the letter + the response letter.
  const outline = await writeArtifact(db, deps, projectId, {
    kind: "outline", namespace: "agents/author",
    mirrorPath: "agents/author/outline/showcase.md", markdown: SHOWCASE_FIXTURE_OUTLINE_MD,
  });
  const v1 = await writeArtifact(db, deps, projectId, {
    kind: "draft", namespace: "drafts", mirrorPath: "drafts/v1.md", markdown: SHOWCASE_FIXTURE_V1_MD,
  });
  const v2 = await writeArtifact(db, deps, projectId, {
    kind: "draft", namespace: "drafts", mirrorPath: "drafts/v2.md", markdown: SHOWCASE_FIXTURE_V2_MD,
  });
  const letter = await writeArtifact(db, deps, projectId, {
    kind: "editors_letter", namespace: "correspondence",
    mirrorPath: "correspondence/review-1-letter.md", markdown: SHOWCASE_FIXTURE_LETTER_MD,
  });
  const response = await writeArtifact(db, deps, projectId, {
    kind: "response_letter", namespace: "correspondence",
    mirrorPath: "correspondence/response-1-letter.md", markdown: SHOWCASE_FIXTURE_RESPONSE_MD,
  });

  // drafts v1 (the reviewed import) + v2 (the revised head — 'working' so the project has a live head).
  await db.query(
    `insert into drafts (id, project_id, n, origin, state, promoted_version_id, frozen_at, frozen_by)
     values ($1,$2,1,'imported','frozen',$3,$4,$5)`,
    [v1Id, projectId, v1.versionId, now.toISOString(), JSON.stringify({ kind: "system", label: deps.seedLabel ?? "showcase-seed" })],
  );
  await db.query(
    `insert into drafts (id, project_id, n, origin, state, promoted_version_id, base_draft_id)
     values ($1,$2,2,'duplicate','working',$3,$4)`,
    [v2Id, projectId, v2.versionId, v1Id],
  );

  // the delivered full-board review run (fixture: precomputed, $0 — spent/estimate are the card's
  // derived figures so the dossier's run card shows a believable actual-vs-estimate).
  await db.query(
    `insert into runs (id, workspace_id, project_id, workflow, state, inputs, input_snapshot,
                       model_profile, model_tier, rigor, estimate_credits, cap_credits, spent_credits,
                       rate_table_version, requested_by, started_at, ended_at)
     values ($1,$2,$3,'review','completed',$4,$5,'full_board','frontier','full_board',3900,5850,3860,1,$6,$7,$8)`,
    [
      runId, deps.workspaceId, projectId,
      JSON.stringify({ draftId: v1Id }),
      JSON.stringify({ wordCount: 1651, claimCount: SHOWCASE_FIXTURE_CLAIMS.length }),
      deps.ownerId, now.toISOString(), now.toISOString(),
    ],
  );
  // all seven review phases committed (the dossier's run card derives its step row from these).
  const phases = ["intake", "craft", "verification", "discourse", "second_read", "argument", "letter"];
  for (let i = 0; i < phases.length; i++) {
    await db.query(
      `insert into steps (id, run_id, phase, ordinal, state, started_at, ended_at, credits)
       values ($1,$2,$3,$4,'done',$5,$6,$7)`,
      [deps.ids(), runId, phases[i], i + 1, now.toISOString(), now.toISOString(), [120, 310, 1720, 480, 390, 420, 320][i] ?? 0],
    );
  }
  // the cited⇒fetched audit: every fixture source URL reads as an allowed fetch.
  for (const url of [PARADOXIDES_URL, ISOTELUS_URL, BISON_URL, KPG_URL, ARMYANT_URL]) {
    await db.query(
      `insert into fetch_log (run_id, ts, agent_label, kind, url, normalized_url, status, bytes, decision)
       values ($1,$2,'editor','fetch',$3,$3,200,8192,'allow')`,
      [runId, now.toISOString(), url],
    );
  }
  await db.query(
    `insert into access_log (run_id, ts, agent_label, tool, path, namespace, decision)
     values ($1,$2,'editor','read','drafts/v1.md','author','allow'),
            ($1,$2,'editor','read','agents/author/outline/showcase.md','author','allow')`,
    [runId, now.toISOString()],
  );

  // the review correspondence (the dossier's anchor) + the author's response on v2.
  await db.query(
    `insert into correspondence_items (id, project_id, kind, draft_id, run_id, ordinal, delivered_at,
                                       artifact_ids, rubric, verdict, protocol_id, protocol_version)
     values ($1,$2,'review',$3,$4,1,$5,$6,$7,'revise','essay',1)`,
    [corrId, projectId, v1Id, runId, now.toISOString(), [letter.versionId],
     JSON.stringify(SHOWCASE_FIXTURE_RUBRIC)],
  );
  await db.query(
    `insert into correspondence_items (id, project_id, kind, draft_id, run_id, ordinal, delivered_at,
                                       artifact_ids, prior_review_id)
     values ($1,$2,'response',$3,$4,1,$5,$6,$7)`,
    [respId, projectId, v2Id, runId, now.toISOString(), [response.versionId], corrId],
  );

  // the claim ledger.
  let firstFindingId = "";
  for (let i = 0; i < SHOWCASE_FIXTURE_CLAIMS.length; i++) {
    const c = SHOWCASE_FIXTURE_CLAIMS[i]!;
    const claimId = deps.ids();
    const claimSources = "sources" in c ? c.sources : undefined;
    await db.query(
      `insert into claims (id, correspondence_id, draft_id, ordinal, text, tier, verdict, kind, note,
                           source_check, accessed_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        claimId, corrId, v1Id, i, c.text, c.tier, c.verdict, c.kind,
        "note" in c ? c.note : null,
        "sourceCheck" in c ? c.sourceCheck : null, now.toISOString(),
      ],
    );
    for (let j = 0; j < (claimSources?.length ?? 0); j++) {
      const s = claimSources![j]!;
      await db.query(
        `insert into claim_sources (claim_id, ordinal, url, normalized_url, accessed_at, stance, note)
         values ($1,$2,$3,$3,$4,$5,$6)`,
        [claimId, j, s.url, now.toISOString(), s.stance, "note" in s ? s.note : null],
      );
    }
  }

  // the findings (the dossier's cards; ordinal 0 is the contradicted tier-1 anchor).
  for (let i = 0; i < SHOWCASE_FIXTURE_FINDINGS.length; i++) {
    const f = SHOWCASE_FIXTURE_FINDINGS[i]!;
    const findingId = deps.ids();
    if (i === 0) firstFindingId = findingId;
    await db.query(
      `insert into findings (id, correspondence_id, draft_id, ordinal, kind, severity, origin,
                             reconciliation, title, body, evidence, suggestion, rubric_dims,
                             letter_section, anchor)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        findingId, corrId, v1Id, i, f.kind, f.severity, f.origin,
        "reconciliation" in f ? f.reconciliation : null,
        f.title, f.body,
        "evidence" in f
          ? JSON.stringify({
              ...f.evidence,
              urls: f.evidence.urls.map((u) => ({ url: u.url, accessed: now.toISOString() })),
            })
          : null,
        "suggestion" in f ? JSON.stringify(f.suggestion) : null,
        [...f.rubricDims], f.letterSection,
        "anchor" in f ? JSON.stringify(f.anchor) : null,
      ],
    );
    // the triage ledger: blocking/major findings open obligations (the two the response resolved are
    // marked discharged so the response letter's accounting is real).
    if (f.severity === "blocking" || f.severity === "major") {
      const discharged = i === 0 || i === 1; // v2 carries both corrections
      await db.query(
        `insert into revision_obligations (id, project_id, source, finding_id, severity, kind, title,
                                           state, state_since, opened_on_draft_id, created_by, closed_at, discharged_by)
         values ($1,$2,'finding',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          deps.ids(), projectId, findingId, f.severity, f.kind, f.title,
          discharged ? "discharged" : "open", now.toISOString(), v1Id,
          JSON.stringify({ kind: "system", label: deps.seedLabel ?? "showcase-seed" }),
          discharged ? now.toISOString() : null,
          discharged ? JSON.stringify({ kind: "disposition", at: now.toISOString(), via: "response" }) : null,
        ],
      );
    }
  }

  void outline; // the outline artifact exists for the Files pane + story completeness.

  return { projectId, slug, reviewRunId: runId, reviewCorrId: corrId, firstFindingId };
}

/**
 * Seed the workspace's one Showcase project (idempotent — an existing showcase row returns its ids
 * untouched). Everything here is fixture content copied in at provisioning: no inference, no spend.
 */
export function seedShowcaseProject(
  db: MigrationDb,
  deps: ShowcaseSeedDeps,
): Promise<ShowcaseSeedResult> {
  return seedDossierProject(db, deps, {
    showcase: true,
    slugBase: SHOWCASE_SLUG,
    title: SHOWCASE_TITLE,
  });
}

export interface WritableDossierSeedDeps extends ShowcaseSeedDeps {
  /** the workspace-unique slug base (the caller names it — journeys pass a `jrn-*` base). */
  readonly slugBase: string;
  readonly title: string;
}

/**
 * SPA.21 (REQ-VFY-10) — the SEEDED WRITABLE dossier the journeys' T12F/T13F free mutation legs need:
 * the same deterministic fixture the Showcase carries (letter, claim ledger, findings incl. the
 * suggestion-bearing anchor, rubric, triage ledger) on a NORMAL project (`showcase=false`), so the
 * finding mutation routes' `showcaseReadOnlyGuard` does not freeze it. Idempotent on the slug base.
 * Journeys bind `db` to the `JOURNEY_DATABASE_URL` pool inside the tenant-scoped transaction;
 * `store` stays unbound there (the letter's bytes never mint — the mutation legs assert findings,
 * not letter text).
 */
export function seedWritableDossier(
  db: MigrationDb,
  deps: WritableDossierSeedDeps,
): Promise<ShowcaseSeedResult> {
  return seedDossierProject(db, deps, {
    showcase: false,
    slugBase: deps.slugBase,
    title: deps.title,
  });
}

// ---- SPA.22 — the delivered RUN-REPORT fixture (R6F's free render leg, REQ-VFY-10) --------------

/** A deterministic proxy-metered row for the seeded run — `step:<phase>` is the pod-stamped join
 *  key `buildRunReportAdvanced` resolves (x-rhema-step), so no step ids leak into the fixture. */
const RUN_REPORT_SEED_USAGE: readonly {
  readonly phase: string;
  readonly seat: string;
  readonly model: string;
  readonly modelTier: string;
  readonly credits: number;
  readonly searches: number;
  readonly fetches: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
}[] = [
  // verification carries the metered majority → `fact_check_dominated` fires; two seats split
  // the spend; the second read rides `balanced` against the run's `frontier` default →
  // `second_read_model` fires (the flags + suggested-guidance arms exercise for real).
  { phase: "verification", seat: "verifier", model: "claude-sonnet-4-6", modelTier: "balanced", credits: 2200, searches: 40, fetches: 60, inputTokens: 38_000, outputTokens: 7_200 },
  { phase: "craft", seat: "editor", model: "claude-sonnet-4-6", modelTier: "balanced", credits: 800, searches: 2, fetches: 4, inputTokens: 14_000, outputTokens: 2_600 },
  { phase: "discourse", seat: "editor", model: "claude-sonnet-4-6", modelTier: "balanced", credits: 500, searches: 0, fetches: 0, inputTokens: 9_500, outputTokens: 1_800 },
  { phase: "second_read", seat: "editor", model: "claude-sonnet-4-6", modelTier: "balanced", credits: 410, searches: 0, fetches: 0, inputTokens: 8_100, outputTokens: 1_500 },
  { phase: "letter", seat: "editor", model: "claude-sonnet-4-6", modelTier: "balanced", credits: 200, searches: 0, fetches: 0, inputTokens: 4_200, outputTokens: 900 },
];

/** The seeded run's charge (the ledger debit — the report's "charged" figure is Σ debits, never
 *  `runs.spent_credits`) and the fixture's metered total (Σ proxy = 4,110 > 3,860, so the
 *  reconciliation's `committed` difference + the metered line render honestly — a seeded run IS
 *  a modelled charge, and "committed" is the truthful label for it). */
const RUN_REPORT_SEED_CHARGED = 3860;

/**
 * R5ECON.1 (REQ-ECON-6, B3-F3) — the spend-guard exclusion marker. Every `usage_records` row a
 * journey fixture seeds carries a `provider_request_id` under this prefix, and every spend-guard
 * query (the weekly ISO-week cap AND the funded-window cumulative) filters it out — seeded
 * fiction must never count as metered spend (a seed writes ≈$12.33 of plausible-looking
 * `list_cost_usd`). The rows keep `source='proxy'` on purpose: the delivered-report fixture needs
 * them to read as real metered rows so the metered-vs-charged reconciliation renders — the
 * marker, not the source, is the exclusion key.
 */
export const JOURNEY_SEED_USAGE_REQUEST_PREFIX = "req_jrn_";

/**
 * SPA.22 (REQ-VFY-10) — the delivered-run-report fixture: the same `seedDossierProject` payload
 * (a delivered completed review run on a NORMAL writable project — phases, claims, letter) PLUS
 * the two ledger facts `buildRunReport` reads that the dossier never needed at $0:
 *   • `credit_ledger` — a debit row for the run's charge AND a net-zero grant→hold→debit
 *     chain so the nightly `balances = Σ ledger` invariant survives a fixture charge on a
 *     test tenant (a bare grant+debit pair folds to held=−charge — R6FOR.1's
 *     `balance_divergence` defect);
 *   • `usage_records` — proxy rows keyed `step:<phase>` (the meter of record) so the seat
 *     split, the spend drivers, the flags, the metered-vs-charged reconciliation, and the
 *     `?advanced=1` Level-4 `data-usage-row`s all render real content.
 * Idempotent: the dossier seed keys on the slug base; the report facts key on the run's
 * `usage_records` count (a re-run lands rows only once).
 */
export async function seedDeliveredRunReport(
  db: MigrationDb,
  deps: WritableDossierSeedDeps,
): Promise<ShowcaseSeedResult> {
  const res = await seedDossierProject(db, deps, {
    showcase: false,
    slugBase: deps.slugBase,
    title: deps.title,
  });
  const existing = (
    await db.query(`select count(*)::int as n from usage_records where run_id = $1`, [res.reviewRunId])
  ).rows[0] as { n: number } | undefined;
  if (existing != null && existing.n > 0) return res;
  const billingAccountId = (
    (await db.query(`select billing_account_id from workspaces where id = $1`, [deps.workspaceId]))
      .rows[0] as { billing_account_id: string } | undefined
  )?.billing_account_id;
  if (billingAccountId == null) {
    throw new Error("seedDeliveredRunReport: the workspace row carries no billing_account_id");
  }
  const now = deps.clock?.now() ?? new Date();
  const label = deps.seedLabel ?? "journey-report-seed";
  // The grant→hold→debit chain — the real charge path the ledger fold recognizes. R6FOR.1:
  // a bare grant+debit pair does NOT net to zero — `debit` only consumes `held` (never
  // `available`), so the fold leaves avail=+charge/held=−charge while `credit_balances` sits
  // at 0/0 and the nightly Σ invariant reports `balance_divergence` (the six seeded accounts
  // prod carried, expectedHeld=−3860). The hold row is what a real funded charge writes.
  await db.query(
    `insert into credit_ledger (id, workspace_id, billing_account_id, kind, credits, bucket, source, reason, idempotency_key, at)
     values ($1,$2,$3,'grant',$4,'included','seed',$5,$6,$7)`,
    [deps.ids(), deps.workspaceId, billingAccountId, RUN_REPORT_SEED_CHARGED, label, `jrn-report-grant:${res.reviewRunId}`, now.toISOString()],
  );
  await db.query(
    `insert into credit_ledger (id, workspace_id, billing_account_id, kind, credits, bucket, run_id, source, reason, idempotency_key, at)
     values ($1,$2,$3,'hold',$4,'included',$5,'hold',$6,$7,$8)`,
    [deps.ids(), deps.workspaceId, billingAccountId, RUN_REPORT_SEED_CHARGED, res.reviewRunId, label, `jrn-report-hold:${res.reviewRunId}`, now.toISOString()],
  );
  await db.query(
    `insert into credit_ledger (id, workspace_id, billing_account_id, kind, credits, bucket, run_id, source, reason, idempotency_key, at)
     values ($1,$2,$3,'debit',$4,'included',$5,'run',$6,$7,$8)`,
    [deps.ids(), deps.workspaceId, billingAccountId, RUN_REPORT_SEED_CHARGED, res.reviewRunId, label, `jrn-report-debit:${res.reviewRunId}`, now.toISOString()],
  );
  for (const [i, u] of RUN_REPORT_SEED_USAGE.entries()) {
    await db.query(
      `insert into usage_records
         (id, ts, workspace_id, billing_account_id, user_id, project_id, run_id, attempt, step_id,
          role, provider, model, model_tier, rate_table_version, input_tokens, output_tokens,
          searches, fetches, list_cost_usd, credits, source, provider_request_id)
       values ($1,$2,$3,$4,$5,$6,$7,1,$8,$9,'anthropic',$10,$11,1,$12,$13,$14,$15,$16,$17,'proxy',$18)`,
      [
        deps.ids(), now.toISOString(), deps.workspaceId, billingAccountId, deps.ownerId,
        res.projectId, res.reviewRunId, `step:${u.phase}`, u.seat, u.model, u.modelTier,
        u.inputTokens, u.outputTokens, u.searches, u.fetches,
        // list_cost_usd is a display-free figure — a plausible rate-table scalar the spend
        // guards never sum: REQ-ECON-6's `req_jrn_` marker excludes the row from every guard SQL.
        (u.credits / 1000) * 3.0, u.credits, `${JOURNEY_SEED_USAGE_REQUEST_PREFIX}report_${i + 1}`,
      ],
    );
  }
  return res;
}

// ---- FIX.1 — the open-gate fixture (T15's `?gate=` deep-link leg, REQ-FIX-T15) -----------------

/**
 * Park a seeded review run at an unresolved `approve_triage` gate so the Inbox's group-1a query
 * (`g.resolved_at is null and g.held = false and r.state = 'waiting_gate'`, owner-scoped) emits the
 * row whose `/p/<slug>/review/<runId>?gate=<id>` deep link mounts `data-focused-gate`. The run keeps
 * its review correspondence — the deep link's dossier read resolves — and the approve_triage card
 * falls back to the project's latest review correspondence for its triage rows.
 * Idempotent: an already-parked unresolved gate returns as-is; a resolved/none seeds a fresh one.
 */
export async function seedOpenApprovalGate(
  db: MigrationDb,
  deps: Pick<ShowcaseSeedDeps, "ids" | "clock">,
  args: { runId: string; kind?: string },
): Promise<{ gateId: string }> {
  const kind = args.kind ?? "approve_triage";
  const existing = (
    await db.query(
      `select g.id from gates g join runs r on r.id = g.run_id
        where g.run_id = $1 and g.resolved_at is null and g.held = false and r.state = 'waiting_gate'
        order by g.opened_at limit 1`,
      [args.runId],
    )
  ).rows[0] as { id: string } | undefined;
  if (existing) return { gateId: existing.id };
  const now = deps.clock?.now() ?? new Date();
  // The park half — the run's state IS the gate's visibility predicate (the row only lists while
  // the run waits on it).
  await db.query(`update runs set state = 'waiting_gate', state_since = $2 where id = $1`, [
    args.runId,
    now.toISOString(),
  ]);
  const gateId = deps.ids();
  await db.query(
    `insert into gates (id, run_id, kind, opened_at, deadline_at, blocking, on_expiry, held)
     values ($1,$2,$3,$4,null,true,'wait',false)`,
    [gateId, args.runId, kind, now.toISOString()],
  );
  return { gateId };
}
