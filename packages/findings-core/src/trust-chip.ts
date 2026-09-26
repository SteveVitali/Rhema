// The runtime trust chip (§6.6, §12.6; REQ-IDE-31, REQ-PROD-2). The chip rests on facts the sandbox cannot
// touch — the server-generated hydration manifest and the proxy's request log (the `access_report`) — and NEVER
// on the skill's own attestation sentence or any agent-authored text. This module derives the chip's dynamic
// content (numbers, which clauses appear) PURELY from the access_report; the static vocabulary comes in as
// labels so the canonical-vocabulary lint (Appendix D.2) lives over the app's copy table, not here. AC6:
// "trust chip text derives from access_report fields only."

/** The subset of the orchestrator's `access_report` (mirror `AccessReport`) the chip needs. */
export interface AccessReportFacts {
  readonly seat: string;
  /** count of paths the hydration manifest mounted for the seat. */
  readonly mountedPathCount: number;
  readonly byTopLevel?: Record<string, number>;
  /** every URL that left the sandbox (the proxy log). */
  readonly fetches: number;
  /** denied attempts (proxy 403 + in-container hook denials) — the secondary "attempts" record. */
  readonly deniedAttempts: number;
  /** dropped write-back boundary violations from the delivering harvest (§12.2). */
  readonly violations: number;
  readonly subagents: readonly { readonly label: string; readonly inputsKind: "explicit_files" | "inherit"; readonly fileCount: number }[];
}

/** Structured facts, each a pure projection of an `access_report` field — the AC6 provenance guarantee. */
export interface TrustChipFacts {
  readonly seat: string;
  readonly fetches: number;
  readonly deniedAttempts: number;
  readonly violations: number;
  /** true iff an input-scoped subagent labelled "second read" received explicit files only (§12.6(e)). */
  readonly secondReadScoped: boolean;
}

const SECOND_READ = /second[ _-]?read/i;

/** Project the access_report to the chip's structured facts — no input other than the report (AC6). */
export function trustChipFacts(report: AccessReportFacts): TrustChipFacts {
  const secondReadScoped = report.subagents.some(
    (s) => SECOND_READ.test(s.label) && s.inputsKind === "explicit_files",
  );
  return {
    seat: report.seat,
    fetches: report.fetches,
    deniedAttempts: report.deniedAttempts,
    violations: report.violations,
    secondReadScoped,
  };
}

/**
 * Static vocabulary for the chip (supplied by the app's copy table so the vocab lint covers it). `{n}` in a
 * template is replaced by the corresponding access_report number; no other interpolation happens.
 */
export interface TrustChipLabels {
  /** the boundary sentence, e.g. "The Editor's sandbox never had the Drafter's notes mounted — verified by the hydration manifest and the proxy log". */
  readonly boundary: string;
  /** "{n} URLs fetched" — {n} := report.fetches. */
  readonly fetched: string;
  /** "second read received the draft only" — appended iff `secondReadScoped`. */
  readonly secondRead: string;
  /** "{n} blocked attempt" — used when deniedAttempts === 1. */
  readonly blockedOne: string;
  /** "{n} blocked attempts" — used when deniedAttempts > 1. */
  readonly blockedMany: string;
  /** clause separator; defaults to " · ". */
  readonly separator?: string;
}

export interface TrustChip {
  readonly text: string;
  readonly parts: readonly string[];
  readonly facts: TrustChipFacts;
}

function fill(template: string, n: number): string {
  return template.replace(/\{n\}/g, String(n));
}

/**
 * Build the trust chip. Every dynamic value (the fetch count, whether the "second read" clause appears, the
 * blocked-attempts clause + its count) is derived ONLY from the access_report via `trustChipFacts`; the labels
 * are static product vocabulary. No agent-authored text can reach the chip (REQ-PROD-2; §12.6).
 */
export function buildTrustChip(report: AccessReportFacts, labels: TrustChipLabels): TrustChip {
  const facts = trustChipFacts(report);
  const sep = labels.separator ?? " · ";
  const parts: string[] = [labels.boundary, fill(labels.fetched, facts.fetches)];
  if (facts.secondReadScoped) parts.push(labels.secondRead);
  if (facts.deniedAttempts > 0) {
    parts.push(fill(facts.deniedAttempts === 1 ? labels.blockedOne : labels.blockedMany, facts.deniedAttempts));
  }
  return { text: parts.join(sep), parts, facts };
}
