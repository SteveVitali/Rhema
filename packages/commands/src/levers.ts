// Levers (§7.2): `--rigor quick|standard|full-board`, `--tier base|balanced|frontier` (Advanced),
// `--stage early|near-final`, `--protocol …`, `--no-discourse`, `--no-second-read`, `--no-factcheck`,
// `--wait`, `--auto`, plus the 1.x rows (`--variants`, `--strata`, `--target`, `--protect`, `--map`,
// `--until`, `--max`, `--budget`, `--tiers`, `--sources`, `--venue`). Typed flags parse into
// `CommandLevers`; surfaces render them as chips whose text NEVER contains `--` (review 12 #11).

import {
  MODEL_TIER_DISPLAY,
  RIGOR_DISPLAY,
  type ApprovalPolicy,
  type ModelTier,
  type Rigor,
} from "@rhema/contracts";
import type { CommandChip, CommandLevers, LeverKey } from "./types.js";

/** Canonical approval-policy display (Appendix D.2 reserved strings, verbatim). */
export const APPROVAL_DISPLAY: Record<ApprovalPolicy, string> = {
  named: "Named approvals",
  wait_each: "Wait for me at each",
  run_to_completion: "Run to completion",
};

interface LeverSpec {
  /** whether the flag takes a value token (`--rigor standard`) or is boolean (`--wait`). */
  readonly takesValue: boolean;
}

export const LEVER_SPECS: Readonly<Record<LeverKey, LeverSpec>> = {
  rigor: { takesValue: true },
  tier: { takesValue: true },
  stage: { takesValue: true },
  protocol: { takesValue: true },
  venue: { takesValue: true },
  variants: { takesValue: true },
  tiers: { takesValue: true },
  sources: { takesValue: true },
  strata: { takesValue: true },
  target: { takesValue: true },
  protect: { takesValue: true },
  until: { takesValue: true },
  max: { takesValue: true },
  budget: { takesValue: true },
  map: { takesValue: false },
  wait: { takesValue: false },
  auto: { takesValue: false },
  "no-discourse": { takesValue: false },
  "no-second-read": { takesValue: false },
  "no-factcheck": { takesValue: false },
};

const RIGOR_ALIASES: Readonly<Record<string, Rigor>> = {
  quick: "quick",
  standard: "standard",
  "full-board": "full_board",
  full_board: "full_board",
  fullboard: "full_board",
  full: "full_board",
};

const TIER_ALIASES: Readonly<Record<string, ModelTier>> = {
  base: "base",
  balanced: "balanced",
  frontier: "frontier",
};

/** The toggle a `--no-*` flag flips (Advanced phase toggles, §6.5). */
const NO_TOGGLES: Readonly<Record<string, string>> = {
  "no-discourse": "discourse",
  "no-second-read": "second_read",
  "no-factcheck": "fact_check",
};

export interface AppliedLever {
  readonly levers: CommandLevers;
  readonly chip: CommandChip;
  readonly error?: string;
}

/**
 * Apply one `--key [value]` pair to the accumulated lever set. `value` may be undefined for boolean
 * flags. Returns the updated levers + the display chip; an unknown value is an error (never guessed).
 */
export function applyLever(acc: CommandLevers, key: LeverKey, value: string | undefined): AppliedLever {
  const v = (value ?? "").trim();
  const low = v.toLowerCase();
  switch (key) {
    case "rigor": {
      const rigor = RIGOR_ALIASES[low];
      if (!rigor) return { levers: acc, chip: chip(`Rigor: ${v}`), error: `unknown rigor "${v}"` };
      return { levers: { ...acc, rigor }, chip: chip(RIGOR_DISPLAY[rigor]) };
    }
    case "tier": {
      const tier = TIER_ALIASES[low];
      if (!tier) return { levers: acc, chip: chip(`Tier: ${v}`), error: `unknown model tier "${v}"` };
      return { levers: { ...acc, modelTier: tier }, chip: chip(`Tier: ${MODEL_TIER_DISPLAY[tier]}`) };
    }
    case "stage":
      return { levers: { ...acc, stage: v }, chip: chip(`Stage: ${v}`) };
    case "protocol":
      return { levers: { ...acc, protocol: v }, chip: chip(`Protocol: ${capitalize(v)}`) };
    case "venue":
      return { levers: { ...acc, venue: v }, chip: chip(`Venue: ${v}`) };
    case "variants":
      return { levers: { ...acc, variants: v.split(",").map((s) => s.trim()).filter(Boolean) }, chip: chip("Variants") };
    case "tiers":
      return { levers: { ...acc, tiers: v }, chip: chip(`Claim tiers: ${v}`) };
    case "sources": {
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0) return { levers: acc, chip: chip(`Sources: ${v}`), error: `--sources needs a number` };
      return { levers: { ...acc, sources: n }, chip: chip(`Sources: ${n}`) };
    }
    case "strata":
      return { levers: { ...acc, strata: v }, chip: chip(`Sources: ${capitalize(v)}`) };
    case "target": {
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0) return { levers: acc, chip: chip(`Target: ${v}`), error: `--target needs a number` };
      return { levers: { ...acc, target: n }, chip: chip(`Target: ${n} words`) };
    }
    case "protect":
      return { levers: { ...acc, protect: [...(acc.protect ?? []), v.replace(/^@/, "")] }, chip: chip(`Protect ${v.replace(/^@/, "")}`) };
    case "map":
      return { levers: { ...acc, map: true }, chip: chip("Map the field") };
    case "wait":
      return { levers: { ...acc, approvals: "wait_each" }, chip: chip(`Approvals: ${APPROVAL_DISPLAY.wait_each}`) };
    case "auto":
      return { levers: { ...acc, approvals: "run_to_completion" }, chip: chip(`Approvals: ${APPROVAL_DISPLAY.run_to_completion}`) };
    case "until":
      return { levers: { ...acc, until: v }, chip: chip(`Until: ${v}`) };
    case "max": {
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0) return { levers: acc, chip: chip(`Max: ${v}`), error: `--max needs a number` };
      return { levers: { ...acc, max: n }, chip: chip(`Max: ${n} rounds`) };
    }
    case "budget": {
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0) return { levers: acc, chip: chip(`Budget: ${v}`), error: `--budget needs a number` };
      return { levers: { ...acc, budget: n }, chip: chip(`Budget: ${n} credits`) };
    }
    case "no-discourse":
    case "no-second-read":
    case "no-factcheck": {
      const toggle = NO_TOGGLES[key]!;
      const label = key === "no-discourse" ? "No discourse" : key === "no-second-read" ? "No second read" : "No fact-check";
      return { levers: { ...acc, toggles: { ...(acc.toggles ?? {}), [toggle]: false } }, chip: chip(label) };
    }
  }
}

/** The set of lever keys the grammar recognizes (for completion + validation). */
export function isLeverKey(raw: string): raw is LeverKey {
  return Object.prototype.hasOwnProperty.call(LEVER_SPECS, raw);
}

function chip(text: string): CommandChip {
  return { kind: "lever", text };
}

function capitalize(s: string): string {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s;
}
