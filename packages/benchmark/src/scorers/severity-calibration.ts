import { weightedKappa } from "../stats.js";
import { SEVERITY_LEVELS, type Finding, type GoldFinding, type MatchRecord } from "../types.js";

// Severity-calibration scorer (REQ-EVAL-11, deterministic): weighted κ between an arm's severity and the
// adjudicated gold severity, over the matched findings. Severity is ordinal (note<minor<major<blocking), so a
// quadratic-weighted κ penalizes a blocking↔note disagreement far more than blocking↔major — the right shape for
// "is this arm calibrated to how serious editors think each issue is." Chance-corrected (REQ-EVAL-9b).

export interface SeverityCalibration {
  /** matched arm↔gold pairs the κ is computed over. */
  readonly pairs: number;
  /** quadratic-weighted Cohen's κ on severity; null when there are no matched pairs. */
  readonly kappa: number | null;
}

/**
 * Compute severity calibration for one arm on one draft. `armFindings` and `goldFindings` are indexed by id;
 * `matches` are the human-adjudicated `matched` records tying an arm finding to a gold finding (REQ-EVAL-8).
 */
export function severityCalibration(
  armFindings: readonly Finding[],
  goldFindings: readonly GoldFinding[],
  matches: readonly MatchRecord[],
): SeverityCalibration {
  const armById = new Map(armFindings.map((f) => [f.id, f] as const));
  const goldById = new Map(goldFindings.map((g) => [g.finding.id, g] as const));
  const armSev: string[] = [];
  const goldSev: string[] = [];
  for (const m of matches) {
    if (m.verdict !== "matched" || !m.goldFindingId) continue;
    const arm = armById.get(m.armFindingId);
    const gold = goldById.get(m.goldFindingId);
    if (!arm || !gold) continue;
    armSev.push(arm.severity);
    goldSev.push(gold.finding.severity);
  }
  if (armSev.length === 0) return { pairs: 0, kappa: null };
  return { pairs: armSev.length, kappa: weightedKappa(armSev, goldSev, SEVERITY_LEVELS, "quadratic") };
}
