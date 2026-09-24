// The §7.2 parser: `/<verb> [@scope …] [--lever value …] [free text → guidance]` → a structured
// command `{verb, scopes[], levers{}, guidance}` + display chips. One parser for every surface
// (palette, popover, context menu, composer — REQ-CHAT-21). Unknown verbs are corrected against the
// table, never guessed; `--` input is accepted but never reaches a rendered chip.

import { correctVerb, verbSpec } from "./verbs.js";
import { parseScopeToken, scopeChip } from "./scopes.js";
import { applyLever, isLeverKey, LEVER_SPECS } from "./levers.js";
import type { CommandChip, CommandLevers, ParseResult, ParsedCommand, ScopeRef } from "./types.js";

interface Tok {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

/** Whitespace-split with `"…"` quoting honored; positions preserved so guidance keeps its raw text. */
function tokenize(input: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  const n = input.length;
  while (i < n) {
    while (i < n && /\s/.test(input[i]!)) i++;
    if (i >= n) break;
    const start = i;
    let cur = "";
    let quoted = false;
    while (i < n) {
      const ch = input[i]!;
      if (ch === '"') {
        quoted = !quoted;
        cur += ch;
        i++;
        continue;
      }
      if (!quoted && /\s/.test(ch)) break;
      cur += ch;
      i++;
    }
    out.push({ text: cur, start, end: i });
  }
  return out;
}

const MVP_VERBS = "draft · review · revise · factcheck · research · outline · visualize · update-voice · export · compare";

/**
 * Parse a command string (with or without the leading `/`). Pure + deterministic — the same input
 * produces the same ParsedCommand on every surface (REQ-CHAT-22).
 */
export function parseCommand(raw: string): ParseResult {
  const input = raw.trim();
  // Tokenize the RAW input (positions feed the guidance slice); the leading `/` lives on token 0.
  const toks = tokenize(input);
  if (toks.length === 0 || toks[0]!.text === "/") {
    return { ok: false, error: "Type a verb.", suggestions: MVP_VERBS.split(" · ") };
  }

  const verbTok = toks[0]!;
  const verbRaw = verbTok.text.replace(/^\/+/, "");
  const spec = verbSpec(verbRaw);
  if (!spec) {
    const suggestions = correctVerb(verbRaw);
    return {
      ok: false,
      error: `Unknown verb “${verbRaw}”.`,
      ...(suggestions.length > 0 ? { suggestions } : { suggestions: MVP_VERBS.split(" · ") }),
    };
  }

  const scopes: ScopeRef[] = [];
  const chips: CommandChip[] = [{ kind: "verb", text: spec.label }];
  let levers: CommandLevers = {};
  let guidance: string | undefined;

  for (let i = 1; i < toks.length; i++) {
    const tok = toks[i]!;
    const t = tok.text;

    if (t.startsWith("--")) {
      const eq = t.indexOf("=");
      const key = (eq > 0 ? t.slice(2, eq) : t.slice(2)).toLowerCase();
      if (!isLeverKey(key)) {
        return { ok: false, error: `Unknown option “${key}” on ${spec.label}.` };
      }
      if (!spec.levers.includes(key)) {
        return { ok: false, error: `${spec.label} doesn't take the “${key}” option.` };
      }
      let value: string | undefined = eq > 0 ? t.slice(eq + 1) : undefined;
      if (LEVER_SPECS[key].takesValue && value == null) {
        const next = toks[i + 1];
        if (!next || next.text.startsWith("--")) {
          return { ok: false, error: `“${key}” needs a value.` };
        }
        value = next.text;
        i++;
      }
      const applied = applyLever(levers, key, value);
      if (applied.error) return { ok: false, error: applied.error };
      levers = applied.levers;
      chips.push(applied.chip);
      continue;
    }

    if (t.startsWith("@") || t.startsWith("§")) {
      const scope = parseScopeToken(t);
      if (!scope) return { ok: false, error: `“${t}” isn't a scope.` };
      if (!spec.scopes.includes(scope.kind)) {
        return { ok: false, error: `${spec.label} doesn't take a ${scope.kind} scope.` };
      }
      scopes.push(scope);
      chips.push({ kind: "scope", text: scopeChip(scope) });
      continue;
    }

    // first non-flag, non-scope token: everything from here is guidance (raw, spacing preserved).
    guidance = input.slice(tok.start).trim() || undefined;
    break;
  }

  // §7.2: variants are refused by whole /draft and by /revise (the lever list already rejects
  // --variants on /revise; a whole-draft /draft has no section scope).
  if (spec.verb === "draft" && levers.variants && !scopes.some((s) => s.kind === "section")) {
    return { ok: false, error: "Variants need a section scope — whole drafts don't take variants." };
  }

  const command: ParsedCommand = {
    verb: spec.verb,
    scopes,
    levers,
    ...(guidance ? { guidance } : {}),
    chips,
  };
  return { ok: true, command };
}

/** Parse just the head — completion help ("…" after `/rev` offers candidate verbs). */
export function completeVerb(prefix: string): readonly string[] {
  const p = prefix.replace(/^\/+/, "").toLowerCase();
  if (!p) return [];
  return correctVerb(p);
}
