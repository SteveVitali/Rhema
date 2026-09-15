// A minimal robots.txt parser (REQ-INGEST-12 "robots respected"). Enough for the beta: pick the group for our
// user-agent (or `*`), collect its Disallow rules, and test a path against them (longest-match wins; an empty
// Disallow value means "allow all"). Allow directives override a Disallow of the same-or-shorter length.

export interface RobotsRules {
  readonly disallow: readonly string[];
  readonly allow: readonly string[];
}

/** Parse robots.txt and return the rules that apply to `userAgentToken` (falling back to `*`). */
export function parseRobots(txt: string, userAgentToken: string): RobotsRules {
  const uaLc = userAgentToken.toLowerCase();
  const groups: { agents: string[]; disallow: string[]; allow: string[] }[] = [];
  let current: { agents: string[]; disallow: string[]; allow: string[] } | null = null;
  let lastWasAgent = false;

  for (const rawLine of txt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (line === "") continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (field === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], disallow: [], allow: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if (current && field === "disallow") {
      current.disallow.push(value);
      lastWasAgent = false;
    } else if (current && field === "allow") {
      current.allow.push(value);
      lastWasAgent = false;
    } else {
      lastWasAgent = false;
    }
  }

  const pick = (pred: (a: string) => boolean) => groups.find((g) => g.agents.some(pred));
  const group = pick((a) => a === uaLc || (a !== "*" && uaLc.includes(a))) ?? pick((a) => a === "*");
  return group ? { disallow: group.disallow, allow: group.allow } : { disallow: [], allow: [] };
}

/** True if `path` is allowed by the rules. A `Disallow:` with an empty value allows everything. */
export function robotsAllows(rules: RobotsRules, path: string): boolean {
  const p = path || "/";
  const longest = (list: readonly string[]) =>
    list.filter((r) => r !== "" && p.startsWith(r)).reduce((m, r) => Math.max(m, r.length), -1);
  const disLen = longest(rules.disallow);
  if (disLen < 0) return true; // nothing disallows this path
  const allowLen = longest(rules.allow);
  return allowLen >= disLen; // an equal-or-longer Allow wins
}
