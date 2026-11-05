// P1.17 — the honest-marketing lints for the public funnel copy (§15.1; REQ-POS-4/5/11/12/13,
// REQ-GROWTH-5, REQ-EVAL-19). These run over the same collected copy strings `lintCopy` consumes —
// a landing/hero/proof string that promises generation, waves at AI detection, shows a placeholder
// logo, claims a not-yet-built asset, or makes an unflagged comparative claim fails CI.
//
// Scope model: rules are keyed by copy-key PREFIX. `landing.hero.*` + `landing.proof.*` are the
// promise-scoped zones (REQ-POS-5/11); the whole `landing.*`/`pricing.*`/`signup.*` family carries
// the evasion/logo/asset/comparative bans.

/** REQ-POS-4 — the one locked hero headline (§15.1). Marketing never rewrites it. */
export const HERO_HEADLINE = "An editorial board for everything you write.";

/**
 * REQ-GROWTH-5 / REQ-EVAL-19 — the pre-registered-wave gate. Comparative/superiority claims are
 * lint errors until a criterion-meeting wave flips this to true in the SAME commit that lands the
 * approved copy. False today.
 */
export const COMPARATIVE_WAVE_MET = false;

export interface GrowthCopyViolation {
  readonly key: string;
  readonly rule:
    | "hero_headline"
    | "generation_promise"
    | "detection_evasion"
    | "placeholder_logo"
    | "unbuilt_asset_claim"
    | "comparative_claim";
  readonly text: string;
  readonly detail: string;
}

/** keys that may never promise generation/drafting-on-behalf (hero + proof zones).
 *  222 R7DEM.6a (REQ-DOPS-1) — the demo hero + CTA keys join the scope (R4 §3). */
const PROMISE_SCOPE = [
  /^landing\.hero\./,
  /^landing\.proof\./,
  /^landing\.cta\./,
  /^demo\.hub\./,
  /^demo\.tour\./,
];

/** patterns that read as "the product writes your text for you" (REQ-POS-5/11). */
const GENERATION_PATTERNS: readonly RegExp[] = [
  /\bgenerat(?:e|es|ed|ing|ion)\b/i,
  /\bghost-?writ/i,
  /\bauto-?writ/i,
  /\bwrites?\s+(?:it|your|the|you)\b/i,
  /\bdrafts?\s+(?:your|the\s+first|for\s+you)\b/i,
  /\bfinish(?:es|ing)?\s+your\s+(?:draft|essay|paper|chapter)/i,
  /\bwrite\s+for\s+you/i,
];

/** REQ-POS-13 — detection-evasion language is banned everywhere, any key. */
const EVASION_PATTERNS: readonly RegExp[] = [
  /\bai[-\s]?detect/i,
  /\bundetectable/i,
  /\b(?:evade|evades|evading|bypass|bypasses|bypassing|beat|beats|fool|fools|dodge|dodges)\b[^.]*\bdetect/i,
  /\bturnitin\b/i,
  /\bgptzero\b/i,
  /\bplatform[-\s]scanning/i,
  /\bhumaniz(?:e|es|ed|ing)\s+(?:your|the|ai|this|that|text|writing)/i,
];

/** REQ-POS-12 — placeholders for things that do not exist (press/logo walls). */
const PLACEHOLDER_PATTERNS: readonly RegExp[] = [
  /\blogos?\b/i,
  /\bas\s+(?:seen|featured)\s+in\b/i,
  /\btrusted\s+by\b/i,
];

/**
 * REQ-POS-12 — not-yet-built assets may be MENTIONED only with an explicit forward-looking marker
 * (waitlist / not yet / roadmap / post-1.x). Asserting they exist fails.
 */
const UNBUILT_ASSET_PATTERNS: readonly RegExp[] = [
  /\bmobile\s+app\b/i,
  /\bgoogle\s+docs\s+(?:export|integration|add-?on)\b/i,
  /\bword\s+(?:plugin|add-?in)\b/i,
  /\bbrowser\s+extension\b/i,
  /\bteam\s+workspaces?\b/i,
  /\bsso\b/i,
  /\bbring\s+your\s+own\s+(?:api\s+)?keys?\b/i,
  /\b(?:api\s+)?bring[-\s]your[-\s]own\b/i,
];
const FORWARD_LOOKING =
  /\b(?:not\s+yet|waitlist|coming|planned|roadmap|on\s+the\s+way|later|post[-\s]?1\.0|1\.\d|soon)\b/i;

/** REQ-GROWTH-5 — comparative/superiority claims (gated on the pre-registered wave). */
const COMPARATIVE_PATTERNS: readonly RegExp[] = [
  /\bbetter\s+than\b/i,
  /\bbest[-\s](?:in[-\s]class|of[-\s]breed)\b/i,
  /\b(?:outperform|outperforming|outperforms)\b/i,
  /\b(?:beats?|crushes?|dwarfs?)\s+(?:grammarly|chatgpt|claude|gemini|copilot)\b/i,
  /\bfaster\s+than\b/i,
  /\bmore\s+accurate\s+than\b/i,
  /\b#\s?1\b/i,
  /\bunmatched\b/i,
  /\bin\s+a\s+class\s+of\s+its\s+own\b/i,
];

// 222 R7DEM.6a (REQ-DOPS-1 FUNNEL_SCOPE half; REQ-TOUR-5) — demo copy joins the funnel lints.
const FUNNEL_SCOPE = [/^landing\./, /^pricing\./, /^signup\./, /^showcase\./, /^demo\./];

function inScope(key: string, scopes: readonly RegExp[]): boolean {
  return scopes.some((s) => s.test(key));
}

export interface LintGrowthCopyOptions {
  /** supply comparative-claim permission (defaults to COMPARATIVE_WAVE_MET). */
  readonly comparativeWaveMet?: boolean;
}

/**
 * Lint the funnel copy. `entries` is either the collected `{key,text}` list or a flat key→string
 * record (collectCopyStrings's output works — pass the same {key:text} shape lintCopy consumes).
 */
export function lintGrowthCopy(
  entries: readonly { key: string; text: string }[],
  opts: LintGrowthCopyOptions = {},
): GrowthCopyViolation[] {
  const allowComparative = opts.comparativeWaveMet ?? COMPARATIVE_WAVE_MET;
  const violations: GrowthCopyViolation[] = [];
  for (const { key, text } of entries) {
    // REQ-POS-4 — the hero headline is the locked string.
    if (key === "landing.hero.headline" && text !== HERO_HEADLINE) {
      violations.push({
        key, rule: "hero_headline", text,
        detail: `hero headline must be the locked §15.1 string: "${HERO_HEADLINE}"`,
      });
    }
    // REQ-POS-13 — detection-evasion anywhere.
    for (const re of EVASION_PATTERNS) {
      if (re.test(text)) {
        violations.push({ key, rule: "detection_evasion", text, detail: `matches ${re}` });
        break;
      }
    }
    if (!inScope(key, FUNNEL_SCOPE)) continue;
    // REQ-POS-5/11 — generation promises in the promise-scoped zones.
    if (inScope(key, PROMISE_SCOPE)) {
      for (const re of GENERATION_PATTERNS) {
        if (re.test(text)) {
          violations.push({ key, rule: "generation_promise", text, detail: `matches ${re}` });
          break;
        }
      }
    }
    for (const re of PLACEHOLDER_PATTERNS) {
      if (re.test(text)) {
        violations.push({ key, rule: "placeholder_logo", text, detail: `matches ${re}` });
        break;
      }
    }
    for (const re of UNBUILT_ASSET_PATTERNS) {
      if (re.test(text) && !FORWARD_LOOKING.test(text)) {
        violations.push({
          key, rule: "unbuilt_asset_claim", text,
          detail: `mentions a not-yet-built asset without a forward-looking marker (matches ${re})`,
        });
        break;
      }
    }
    if (!allowComparative) {
      for (const re of COMPARATIVE_PATTERNS) {
        if (re.test(text)) {
          violations.push({
            key, rule: "comparative_claim", text,
            detail: `comparative claim requires a criterion-meeting pre-registered wave (matches ${re})`,
          });
          break;
        }
      }
    }
  }
  return violations;
}
