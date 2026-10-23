import type { DossierClaim, DossierFinding } from "@rhema/ui";

// The read-only sample dossier for the public invite page (REQ-POS-3; §16.3 #21). Essay protocol;
// H.G. Wells's "The Extinction of Man" (1894/1897 — public domain, GD-SHOWCASE.R6 "Public-domain
// essay"), the same essay HUMAN-H11 picked for the Showcase (A4). Content approved verbatim under
// A3 ("I also approve A2, A3, and A4") — the proposal verbatim:
// `docs/build/reports/2026-10-21_R6CNT.1/sample-dossier-proposal.md`. Its claim ledger contains the
// CONTRADICTED Tier-1 claim shown with the deep sources the fact-check fetched — the "this is not
// chat" proof. Editorial CONTENT, not product vocabulary — see copy.ts for chrome.

export interface SampleDossier {
  readonly projectTitle: string;
  readonly projectSlug: string;
  readonly letter: readonly string[];
  readonly claims: readonly DossierClaim[];
  readonly findings: readonly DossierFinding[];
}

export const SAMPLE_DOSSIER: SampleDossier = {
  projectTitle: "The Extinction of Man",
  projectSlug: "the-extinction-of-man",
  letter: [
    "This is a real 1897 essay arguing a real thesis — that humanity's tenure is not guaranteed — and it earns the reader's attention. The argument is honest; its evidence is not. The load-bearing natural-history claims are a century stale, and one is wrong by a factor of two on the axis the essay builds the horror on.",
    "The piece also deserves credit where due: the central wager — dominant taxa fall without warning — survives contact with modern paleontology. The ledger below separates what survives from what does not, with the sources the review actually fetched.",
  ],
  claims: [
    {
      ordinal: 9,
      text: "The evidence of the fossil Paradoxides shows creatures of this kind may attain a length of six feet.",
      tier: 1,
      verdict: "contradicted",
      verdictLabel: "Contradicted",
      note: "Paradoxides' largest specimen is 37 cm (15 in); the largest complete trilobite ever found (Isotelus rex) is 72 cm — under 2.5 ft, not six. Paradoxides is also a trilobite, not a crustacean 'of this kind.' Wrong on the scale and the group.",
      fetched: [
        { url: "https://en.wikipedia.org/wiki/Paradoxides", host: "wikipedia.org" },
        { url: "https://en.wikipedia.org/wiki/Isotelus", host: "wikipedia.org" },
      ],
    },
    {
      ordinal: 12,
      text: "Man has swept away auk, bison, and dodo during the last two hundred years.",
      tier: 1,
      verdict: "misleading_in_context",
      verdictLabel: "Misleading in context",
      note: "The bison was hunted to under 1,000 but never extinguished — today ~11,000 DOI-managed in 19 herds, designated the US national mammal in 2016; the dodo fell ~1681, outside the essay's own 200-year window; only the great auk (1844) fits.",
      fetched: [{ url: "https://www.nps.gov/subjects/bison", host: "nps.gov" }],
    },
    {
      ordinal: 3,
      text: "In no case does the record of the fossils show a really dominant species succeeded by its own descendants.",
      tier: 1,
      verdict: "substantially_accurate",
      verdictLabel: "Substantially accurate",
      note: "The pattern holds in the mass-extinction literature — dominant clades are replaced by previously marginal competitors — though modern reviewers soften 'in no case' (post-extinction radiations do include survivor lineages).",
      fetched: [],
    },
    {
      ordinal: 31,
      text: "We may be unwittingly evolving some new and more terrible plague.",
      tier: 3,
      verdict: "unverifiable",
      verdictLabel: "Unverifiable",
      note: "Speculative thesis claim — argued, not checked.",
      fetched: [],
    },
  ],
  findings: [
    {
      title: "The six-foot crab is the essay's hinge — and it is wrong on the fossil record.",
      body: "The nightmare scenario that sells the thesis is scaled off Paradoxides. The real genus tops out at 37 cm, and no complete trilobite has ever exceeded 72 cm. The essay's scariest object shrinks by half — the correction must be visible, because the fear is built on the number.",
      severity: "blocking",
      kind: "claim",
    },
    {
      title: "The essay's own timeline contradicts one of its three extinctions.",
      body: "Within 'the last two hundred years' Wells lists auk, bison, and dodo as swept away. The bison survives (a conservation success, not an extinction) and the dodo predates the window. A second read, given only the draft, flags the same trio — the essay argues harder than its record.",
      severity: "major",
      kind: "claim",
    },
  ],
};
