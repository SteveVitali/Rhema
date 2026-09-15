import type { DossierClaim, DossierFinding } from "@rhema/ui";

// The read-only sample dossier for the public invite page (REQ-POS-3; §16.3 #21). Essay protocol; drawn from
// one of the three real projects ("The Politics of Visibility"). Its claim ledger contains at least one
// CONTRADICTED Tier-1 claim shown with the source the fact-check fetched — the "this is not chat" proof.
//
// NOTE: the final content selection + the operator's REQ-POS-3 sign-off are HUMAN row H3 (deferred). This is a
// representative stand-in with the required shape; when H3 signs off, the prose/URLs are swapped here (and the
// dossier regenerated if a cited URL dies). Editorial CONTENT, not product vocabulary — see copy.ts for chrome.

export interface SampleDossier {
  readonly projectTitle: string;
  readonly projectSlug: string;
  readonly letter: readonly string[];
  readonly claims: readonly DossierClaim[];
  readonly findings: readonly DossierFinding[];
}

export const SAMPLE_DOSSIER: SampleDossier = {
  projectTitle: "The Politics of Visibility",
  projectSlug: "the-politics-of-visibility",
  letter: [
    "This is a real essay with a real argument, and the argument is strong enough to survive being tested. So I tested it. The center holds — the piece has a thesis worth the reader's time — but two things stand between it and the venue you're aiming at.",
    "The first is evidentiary: the injury the essay is built on is asserted more than it is shown, and the strongest published counterargument goes unanswered. The second is a matter of record: one of your load-bearing citations says the opposite of what you've claimed it says. The ledger below marks it, with the ruling I read.",
  ],
  claims: [
    {
      ordinal: 6,
      text: "Investigators showed a grand jury a diagram of the surveillance operation.",
      tier: 1,
      verdict: "substantially_accurate",
      verdictLabel: "Substantially accurate",
      note: "Supported by the local reporting; re-attribute the citation from the wire report to the original.",
      fetched: [{ url: "https://minnesotareformer.com/", host: "minnesotareformer.com" }],
    },
    {
      ordinal: 12,
      text: "The appellate court struck down the program as unconstitutional.",
      tier: 1,
      verdict: "contradicted",
      verdictLabel: "Contradicted",
      note: "The ruling you cite did the opposite: it UPHELD the program, narrowing it on other grounds. As written, the sentence misstates the record — fix before this reaches an editor who checks.",
      fetched: [{ url: "https://www.courtlistener.com/", host: "courtlistener.com" }],
    },
    {
      ordinal: 49,
      text: "The ruling likened the arrangement to leaving the fox in charge of the henhouse.",
      tier: 1,
      verdict: "verified",
      verdictLabel: "Verified",
      note: "Quotation is accurate; the draft truncates it — restore the full clause.",
      fetched: [{ url: "https://www.courtlistener.com/", host: "courtlistener.com" }],
    },
  ],
  findings: [
    {
      title: "The injury is the thesis, and it is the least-evidenced thing in the piece.",
      body: "The central injury claim (anticipatory chilling) is asserted more than shown, and the strongest published counterargument goes unanswered. An independent second read, given only the draft, reached the same verdict.",
      severity: "blocking",
      kind: "argument",
    },
    {
      title: "The essay doesn't name the conversation it is in.",
      body: "Its thesis and philosophical center each have famous predecessors it never names; at this venue that reads as rediscovery rather than synthesis. Name the lineage and answer it.",
      severity: "major",
      kind: "discourse",
    },
  ],
};
