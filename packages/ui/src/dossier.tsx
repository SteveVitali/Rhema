import type { CSSProperties, ReactNode } from "react";
import { Chip, FetchedUrlChip, severityColor } from "./primitives/chips.js";
import { claimOrdinalLabel } from "./claims.js";

// The read-only sample dossier (REQ-POS-3): an Editor's letter, a claim ledger, and the findings — rendered
// with NO triage/disposition controls (the public invite page is read-only). Its point is the 60-second proof
// that this is not chat: at least one contradicted Tier-1 claim, shown with the fetched URL the fact-check
// actually retrieved. The primitives are text-agnostic; all copy comes in as props.
//
// 243a_R7KIT.3e: migrated onto uiCss() classes (GUARD-1 on) + REQ-COPY-8 — claim ordinals render
// the source id or 1-based numbering (never `[0]`), and each verdict appears once.

export interface DossierSource {
  readonly url: string;
  readonly host: string;
}
export interface DossierClaim {
  readonly ordinal: number;
  /** REQ-COPY-8 — the claim's source id when the ledger carries one. */
  readonly sourceId?: string;
  readonly text: string;
  readonly tier: 1 | 2 | 3;
  /** Canonical ClaimVerdict machine value (e.g. "contradicted"). */
  readonly verdict: string;
  /** Display label for the verdict (canonical vocabulary; supplied by the app). */
  readonly verdictLabel: string;
  /** Sources the fact-check fetched for this claim (stance "contradicts"/"supports"). */
  readonly fetched: readonly DossierSource[];
  readonly note?: string;
}
export interface DossierFinding {
  readonly title: string;
  readonly body: string;
  readonly severity: string;
  readonly kind: string;
}
export interface DossierLabels {
  readonly letterHeading: string;
  readonly claimsHeading: string;
  readonly findingsHeading: string;
  readonly readOnlyNote: string;
  readonly fetchedLabel: string;
  /** e.g. (1) => "Tier 1". */
  readonly tierLabel: (tier: number) => string;
  /** The badge for a contradicted Tier-1 claim (the REQ-POS-3 proof).
   * @deprecated REQ-COPY-8 (243a): a verdict is shown once — kept for call-site compat,
   * no longer rendered as a duplicate badge. */
  readonly contradictedTierOneLabel: string;
}
export interface DossierViewProps {
  readonly title: string;
  readonly letter: readonly string[];
  readonly claims: readonly DossierClaim[];
  readonly findings: readonly DossierFinding[];
  readonly labels: DossierLabels;
}

function isContradictedTierOne(c: DossierClaim): boolean {
  return c.tier === 1 && c.verdict === "contradicted";
}

function ClaimRow({ claim, labels }: { claim: DossierClaim; labels: DossierLabels }): ReactNode {
  const contradicted = isContradictedTierOne(claim);
  return (
    <li
      data-verdict={claim.verdict}
      data-tier={claim.tier}
      data-contradicted-tier1={contradicted ? "true" : undefined}
      className={`ui-claim${contradicted ? " ui-claim--bad" : ""}`}
      style={{ borderBottom: "1px solid var(--paper-rule)", borderLeft: "3px solid transparent" }}
    >
      <div className="ui-d-acts ui-d-mb10" style={{ flexWrap: "wrap" }}>
        <span data-claim-ordinal={claim.sourceId ?? String(claim.ordinal + 1)} className="ui-d-s ui-d-cm" style={{ fontVariantNumeric: "tabular-nums" }}>
          {claimOrdinalLabel(claim)}
        </span>
        <Chip variant="static" label={labels.tierLabel(claim.tier)} />
        <span
          className={contradicted ? "ui-d-s ui-d-sc ui-d-b" : "ui-d-s ui-d-cm"}
          style={contradicted ? ({ "--d-sev": "var(--sev-blocking)" } as CSSProperties) : undefined}
        >
          {claim.verdictLabel}
        </span>
      </div>
      <div className="ui-d-fs14">{claim.text}</div>
      {claim.note ? (
        <div className="ui-d-s ui-d-cm ui-d-mt6">{claim.note}</div>
      ) : null}
      {claim.fetched.length > 0 ? (
        <div className="ui-d-acts ui-d-mt6" style={{ flexWrap: "wrap" }}>
          {claim.fetched.map((s) => (
            <FetchedUrlChip key={s.url} url={s.url} host={s.host} fetchedLabel={labels.fetchedLabel} />
          ))}
        </div>
      ) : null}
    </li>
  );
}

export function DossierView({ title, letter, claims, findings, labels }: DossierViewProps): ReactNode {
  return (
    <article
      data-dossier="true"
      data-readonly="true"
      className="ui-dsv"
      style={{ border: "1px solid var(--paper-rule)", boxShadow: "0 1px 0 var(--shell-border)" }}
    >
      <div role="note" className="ui-d-s ui-d-cm ui-d-mb16" style={{ borderBottom: "1px solid var(--paper-rule)" }}>
        {labels.readOnlyNote}
      </div>
      <h2 className="ui-d-h ui-d-mb16">{title}</h2>

      <section aria-label={labels.letterHeading}>
        <h3 className="ui-d-cap ui-d-s ui-d-cm">{labels.letterHeading}</h3>
        {letter.map((p, i) => (
          <p key={i} className="ui-letter-p">
            {p}
          </p>
        ))}
      </section>

      <section aria-label={labels.claimsHeading} className="ui-d-mt12">
        <h3 className="ui-d-cap ui-d-s ui-d-cm">{labels.claimsHeading}</h3>
        <ul className="ui-claim-list" style={{ border: "1px solid var(--paper-rule)", overflow: "hidden", listStyle: "none" }}>
          {claims.map((c) => (
            <ClaimRow key={c.ordinal} claim={c} labels={labels} />
          ))}
        </ul>
      </section>

      <section aria-label={labels.findingsHeading} className="ui-d-mt12">
        <h3 className="ui-d-cap ui-d-s ui-d-cm">{labels.findingsHeading}</h3>
        <ul className="ui-d-p0 ui-d-mt6" style={{ listStyle: "none" }}>
          {findings.map((f, i) => (
            <li key={i} className="ui-d-acts ui-d-row" style={{ alignItems: "flex-start" }}>
              <span aria-hidden="true" className="ui-fdot ui-d-mt6" style={{ "--d-sev": severityColor(f.severity), flexShrink: 0 } as CSSProperties} />
              <div>
                <div className="ui-d-fd ui-d-b">{f.title}</div>
                <div className="ui-d-fd ui-d-cm ui-d-mt6">{f.body}</div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}

/** Does this dossier honour REQ-POS-3 (≥1 contradicted Tier-1 claim carrying a fetched URL)? */
export function honorsContradictedTierOneRule(claims: readonly DossierClaim[]): boolean {
  return claims.some((c) => isContradictedTierOne(c) && c.fetched.length > 0);
}
