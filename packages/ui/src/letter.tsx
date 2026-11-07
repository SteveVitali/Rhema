import type { ReactNode } from "react";
import type { TrustChip as TrustChipModel } from "@rhema/findings-core";
import { TrustChip } from "./chips.js";
import { MarkdownProse } from "./markdown-prose.js";

// The Editor's letter view (§5.7; REQ-IDE-31, REQ-PROD-2). Read-mode rendering with a sticky mini-TOC; every
// passage reference resolves to a finding link; the attestation section is REPLACED by the runtime trust chip.
// Text-agnostic — the letter prose + labels come in as props (editorial content, not product vocabulary).
//
// 243a_R7KIT.3e (REQ-PANE-5; C7/F1/F3): the letter IS the dossier's main column — the cream card
// chrome is gone (the `.paper` sheet owns the surface), the mini-TOC is a sticky IN-COLUMN outline
// shown only at ≥1440 (`.ui-letter-toc` + the uiCss media rule; attributes stay emitted at every
// width for SSR↔SPA parity), and the claim ledger renders INSIDE the column as `claims` — a
// section of the letter, not a parallel rail.

export interface LetterFindingRef {
  readonly findingId: string;
  readonly label: string;
}

export interface LetterSection {
  readonly id: string;
  readonly title: string;
  readonly paragraphs: readonly string[];
  /** passage references that resolve to finding cards (§5.7). */
  readonly findingRefs?: readonly LetterFindingRef[];
}

export interface LetterViewLabels {
  readonly tocHeading: string;
  /** the heading for the attestation section, which now carries the trust chip (REQ-IDE-31). */
  readonly attestationHeading: string;
  /** the id → anchor href for a finding card, defaults to `#finding-<id>`. */
  readonly findingHref?: (findingId: string) => string;
  /** the TOC entry for the claim-ledger section (only when `claims` renders — REQ-PANE-5). */
  readonly claimsTocLabel?: string;
}

export interface LetterViewProps {
  readonly title: string;
  readonly sections: readonly LetterSection[];
  /** `null` = the record carries no access report (the demo's replayed dossier — "not
   *  recorded"); the attestation heading stays and the chip simply does not render. */
  readonly trustChip: TrustChipModel | null;
  /**
   * REQ-PANE-5 — the claim ledger, rendered as a section of the letter column (the caller
   * passes the `<section id="claims">` block). Its TOC entry rides `claimsTocLabel`.
   */
  readonly claims?: ReactNode;
  readonly labels: LetterViewLabels;
}

/** The Editor's letter (§5.7): Read mode, sticky in-column outline at ≥1440, passage links,
 *  the runtime trust chip, and the claim-ledger section inside the column. */
export function LetterView({ title, sections, trustChip, claims, labels }: LetterViewProps): ReactNode {
  const href = labels.findingHref ?? ((id: string) => `#finding-${id}`);
  return (
    <article data-letter-view="true" className="ui-letter-grid">
      <div>
        <h2 className="ui-d-h ui-d-mb16">{title}</h2>
        {sections.map((s) => (
          <section key={s.id} id={`letter-${s.id}`} data-letter-section={s.id} className="ui-d-mb16" style={{ scrollMarginTop: "16px" }}>
            <h3 className="ui-d-cap ui-d-s ui-d-cm">{s.title}</h3>
            {s.paragraphs.map((p, i) => (
              <MarkdownProse key={i} text={p} className="ui-letter-p" />
            ))}
            {s.findingRefs && s.findingRefs.length > 0 ? (
              <p className="ui-d-acts" style={{ flexWrap: "wrap" }}>
                {s.findingRefs.map((r) => (
                  <a key={r.findingId} data-passage-link={r.findingId} href={href(r.findingId)} className="ui-vc-acc ui-d-fd">
                    {r.label}
                  </a>
                ))}
              </p>
            ) : null}
          </section>
        ))}

        <section id="letter-attestation" data-letter-section="attestation" className="ui-d-mb16" style={{ scrollMarginTop: "16px" }}>
          <h3 className="ui-d-cap ui-d-s ui-d-cm">{labels.attestationHeading}</h3>
          {trustChip != null ? <TrustChip chip={trustChip} /> : null}
        </section>

        {/* REQ-PANE-5 — the claim ledger is a section of the letter column. */}
        {claims}
      </div>

      <nav data-letter-toc="true" aria-label={labels.tocHeading} className="ui-letter-toc ui-d-fd">
        <h3 className="ui-d-cap ui-d-s ui-d-t">{labels.tocHeading}</h3>
        <ul className="ui-d-p0 ui-d-l0" style={{ listStyle: "none" }}>
          {sections.map((s) => (
            <li key={s.id} className="ui-d-p2">
              <a data-toc-link={s.id} href={`#letter-${s.id}`} className="ui-d-t">
                {s.title}
              </a>
            </li>
          ))}
          <li className="ui-d-p2">
            <a data-toc-link="attestation" href="#letter-attestation" className="ui-d-t">
              {labels.attestationHeading}
            </a>
          </li>
          {claims != null && labels.claimsTocLabel != null ? (
            <li className="ui-d-p2">
              <a data-toc-link="claims" href="#claims" className="ui-d-t">
                {labels.claimsTocLabel}
              </a>
            </li>
          ) : null}
        </ul>
      </nav>
    </article>
  );
}
