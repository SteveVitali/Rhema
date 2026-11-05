import type { ReactNode } from "react";
import { FetchedUrlChip, severityColor } from "./primitives/chips.js";

// The read-only sample dossier (REQ-POS-3): an Editor's letter, a claim ledger, and the findings — rendered
// with NO triage/disposition controls (the public invite page is read-only). Its point is the 60-second proof
// that this is not chat: at least one contradicted Tier-1 claim, shown with the fetched URL the fact-check
// actually retrieved. The primitives are text-agnostic; all copy comes in as props.

export interface DossierSource {
  readonly url: string;
  readonly host: string;
}
export interface DossierClaim {
  readonly ordinal: number;
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
  /** The badge for a contradicted Tier-1 claim (the REQ-POS-3 proof). */
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
      style={{
        listStyle: "none",
        padding: "12px 14px",
        borderBottom: "1px solid var(--paper-rule)",
        borderLeft: contradicted ? "3px solid var(--sev-blocking)" : "3px solid transparent",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: "8px",
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: "4px",
        }}
      >
        <span
          style={{
            color: "var(--paper-fg-muted)",
            fontVariantNumeric: "tabular-nums",
            fontSize: "12px",
          }}
        >
          [{claim.ordinal}]
        </span>
        <span
          style={{
            fontSize: "11px",
            padding: "1px 6px",
            borderRadius: "4px",
            background: "var(--shell-raised)",
            color: "var(--shell-fg-muted)",
          }}
        >
          {labels.tierLabel(claim.tier)}
        </span>
        <span
          style={{
            fontSize: "12px",
            color:
              claim.verdict === "contradicted" ? "var(--sev-blocking)" : "var(--paper-fg-muted)",
            fontWeight: contradicted ? 600 : 400,
          }}
        >
          {claim.verdictLabel}
        </span>
        {contradicted ? (
          <span
            style={{
              fontSize: "11px",
              fontWeight: 600,
              padding: "1px 6px",
              borderRadius: "4px",
              background: "var(--sev-blocking)",
              color: "var(--shell-bg)",
            }}
          >
            {labels.contradictedTierOneLabel}
          </span>
        ) : null}
      </div>
      <div style={{ color: "var(--paper-fg)", fontSize: "14px", lineHeight: 1.5 }}>
        {claim.text}
      </div>
      {claim.note ? (
        <div style={{ color: "var(--paper-fg-muted)", fontSize: "12px", marginTop: "4px" }}>
          {claim.note}
        </div>
      ) : null}
      {claim.fetched.length > 0 ? (
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "8px" }}>
          {claim.fetched.map((s) => (
            <FetchedUrlChip
              key={s.url}
              url={s.url}
              host={s.host}
              fetchedLabel={labels.fetchedLabel}
            />
          ))}
        </div>
      ) : null}
    </li>
  );
}

export function DossierView({
  title,
  letter,
  claims,
  findings,
  labels,
}: DossierViewProps): ReactNode {
  return (
    <article
      data-dossier="true"
      data-readonly="true"
      style={{
        background: "var(--paper-bg)",
        color: "var(--paper-fg)",
        border: "1px solid var(--paper-rule)",
        borderRadius: "12px",
        padding: "24px",
        boxShadow: "0 1px 0 var(--shell-border)",
      }}
    >
      <div
        role="note"
        style={{
          fontSize: "12px",
          color: "var(--paper-fg-muted)",
          borderBottom: "1px solid var(--paper-rule)",
          paddingBottom: "12px",
          marginBottom: "16px",
        }}
      >
        {labels.readOnlyNote}
      </div>
      <h2 style={{ fontSize: "22px", fontWeight: 600, margin: "0 0 16px" }}>{title}</h2>

      <section aria-label={labels.letterHeading}>
        <h3
          style={{
            fontSize: "13px",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "var(--paper-fg-muted)",
          }}
        >
          {labels.letterHeading}
        </h3>
        {letter.map((p, i) => (
          <p
            key={i}
            style={{ fontSize: "16px", lineHeight: 1.55, margin: "0 0 12px", maxWidth: "68ch" }}
          >
            {p}
          </p>
        ))}
      </section>

      <section aria-label={labels.claimsHeading} style={{ marginTop: "24px" }}>
        <h3
          style={{
            fontSize: "13px",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "var(--paper-fg-muted)",
          }}
        >
          {labels.claimsHeading}
        </h3>
        <ul
          style={{
            margin: "8px 0 0",
            padding: 0,
            border: "1px solid var(--paper-rule)",
            borderRadius: "8px",
            overflow: "hidden",
          }}
        >
          {claims.map((c) => (
            <ClaimRow key={c.ordinal} claim={c} labels={labels} />
          ))}
        </ul>
      </section>

      <section aria-label={labels.findingsHeading} style={{ marginTop: "24px" }}>
        <h3
          style={{
            fontSize: "13px",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "var(--paper-fg-muted)",
          }}
        >
          {labels.findingsHeading}
        </h3>
        <ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none" }}>
          {findings.map((f, i) => (
            <li
              key={i}
              style={{
                display: "flex",
                gap: "10px",
                padding: "12px 0",
                borderBottom: "1px solid var(--paper-rule)",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  marginTop: "6px",
                  width: "8px",
                  height: "8px",
                  borderRadius: "999px",
                  background: severityColor(f.severity),
                  flexShrink: 0,
                }}
              />
              <div>
                <div style={{ fontWeight: 600, fontSize: "14px" }}>{f.title}</div>
                <div style={{ color: "var(--paper-fg-muted)", fontSize: "13px", marginTop: "2px" }}>
                  {f.body}
                </div>
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
