import type { ReactNode } from "react";
import type { TrustChip as TrustChipModel } from "@rhema/findings-core";
import { TrustChip } from "./chips.js";

// The Editor's letter view (§5.7; REQ-IDE-31, REQ-PROD-2). Read-mode rendering with a sticky mini-TOC; every
// passage reference resolves to a finding link; the attestation section is REPLACED by the runtime trust chip.
// Text-agnostic — the letter prose + labels come in as props (editorial content, not product vocabulary).

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
}

export interface LetterViewProps {
  readonly title: string;
  readonly sections: readonly LetterSection[];
  /** `null` = the record carries no access report (the demo's replayed dossier — "not
   *  recorded"); the attestation heading stays and the chip simply does not render. */
  readonly trustChip: TrustChipModel | null;
  readonly labels: LetterViewLabels;
}

/** The Editor's letter (§5.7): Read mode, sticky mini-TOC, passage links, and the runtime trust chip. */
export function LetterView({ title, sections, trustChip, labels }: LetterViewProps): ReactNode {
  const href = labels.findingHref ?? ((id: string) => `#finding-${id}`);
  return (
    <article
      data-letter-view="true"
      style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 220px", gap: "24px", background: "var(--paper-bg)", color: "var(--paper-fg)", borderRadius: "12px", padding: "24px", border: "1px solid var(--paper-rule)" }}
    >
      <div>
        <h2 style={{ fontSize: "22px", fontWeight: 600, margin: "0 0 16px" }}>{title}</h2>
        {sections.map((s) => (
          <section key={s.id} id={`letter-${s.id}`} data-letter-section={s.id} style={{ marginBottom: "24px", scrollMarginTop: "16px" }}>
            <h3 style={{ fontSize: "13px", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--paper-fg-muted)" }}>{s.title}</h3>
            {s.paragraphs.map((p, i) => (
              <p key={i} style={{ fontSize: "16px", lineHeight: 1.55, margin: "0 0 12px", maxWidth: "68ch" }}>
                {p}
              </p>
            ))}
            {s.findingRefs && s.findingRefs.length > 0 ? (
              <p style={{ display: "flex", gap: "10px", flexWrap: "wrap", margin: "4px 0 0" }}>
                {s.findingRefs.map((r) => (
                  <a key={r.findingId} data-passage-link={r.findingId} href={href(r.findingId)} style={{ fontSize: "13px", color: "var(--accent)" }}>
                    {r.label}
                  </a>
                ))}
              </p>
            ) : null}
          </section>
        ))}

        <section id="letter-attestation" data-letter-section="attestation" style={{ marginTop: "16px" }}>
          <h3 style={{ fontSize: "13px", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--paper-fg-muted)" }}>{labels.attestationHeading}</h3>
          {trustChip != null ? <TrustChip chip={trustChip} /> : null}
        </section>
      </div>

      <nav data-letter-toc="true" aria-label={labels.tocHeading} style={{ position: "sticky", top: "16px", alignSelf: "start", fontSize: "13px" }}>
        <h3 style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--shell-fg-muted)" }}>{labels.tocHeading}</h3>
        <ul style={{ listStyle: "none", margin: "8px 0 0", padding: 0 }}>
          {sections.map((s) => (
            <li key={s.id} style={{ padding: "3px 0" }}>
              <a data-toc-link={s.id} href={`#letter-${s.id}`} style={{ color: "var(--shell-fg-muted)", textDecoration: "none" }}>
                {s.title}
              </a>
            </li>
          ))}
          <li style={{ padding: "3px 0" }}>
            <a data-toc-link="attestation" href="#letter-attestation" style={{ color: "var(--shell-fg-muted)", textDecoration: "none" }}>
              {labels.attestationHeading}
            </a>
          </li>
        </ul>
      </nav>
    </article>
  );
}
