// Scope refs (§7.2): @v3 · @v3 §II · @section:"The Harms Turn" · @selection · @outline · @review:v2 ·
// @finding:v2/17 · @claim:v2/41 · @figure:fig_x · @thread. `serializeScope` produces the canonical
// compact string that rides the sheet's `?scope=` query param and lands verbatim in `runs.scope`
// (jsonb — REQ-CHAT-23, ledger G22); `parseScopeRef` is its inverse (round-trip tested).

import type { ScopeRef } from "./types.js";

/** Parse one `@…` scope token (the leading `@` optional — the tokenizer strips it first). */
export function parseScopeToken(token: string): ScopeRef | null {
  const t = token.startsWith("@") ? token.slice(1) : token;
  if (!t) return null;

  // @v3 — a version ref; an attached §II lands as the section qualifier (@v3 §II is also two tokens).
  const v = /^v(\d+)$/i.exec(t);
  if (v) return { kind: "version", version: Number(v[1]) };
  const vSec = /^v(\d+)\s*§\s*(.+)$/i.exec(t);
  if (vSec) return { kind: "version", version: Number(vSec[1]), section: unquote(vSec[2]!.trim()) };

  if (t === "selection") return { kind: "selection" };
  if (t === "outline") return { kind: "outline" };
  if (t === "thread") return { kind: "thread" };
  const thread = /^thread:(.+)$/.exec(t);
  if (thread) return { kind: "thread", ref: unquote(thread[1]!.trim()) };

  const section = /^section:(.+)$/.exec(t) ?? /^sec:(.+)$/.exec(t);
  if (section) return { kind: "section", ref: unquote(section[1]!.trim()) };
  // a bare §II token inside the scope run is a section ref (the `@v3 §II` spelling).
  if (t.startsWith("§")) return { kind: "section", ref: unquote(t.slice(1).trim()) };

  const review = /^review:v(\d+)$/i.exec(t);
  if (review) return { kind: "review", version: Number(review[1]) };

  const finding = /^finding:(?:v(\d+)\/)?(\d+)$/i.exec(t);
  if (finding) {
    const ref: ScopeRef = { kind: "finding", ordinal: Number(finding[2]) };
    return finding[1] ? { ...ref, version: Number(finding[1]) } : ref;
  }
  const claim = /^claim:(?:v(\d+)\/)?(\d+)$/i.exec(t);
  if (claim) {
    const ref: ScopeRef = { kind: "claim", ordinal: Number(claim[2]) };
    return claim[1] ? { ...ref, version: Number(claim[1]) } : ref;
  }

  const figure = /^(?:figure|fig):(.+)$/.exec(t);
  if (figure) return { kind: "figure", ref: unquote(figure[1]!.trim()) };
  const asset = /^asset:(.+)$/.exec(t);
  if (asset) return { kind: "asset", ref: unquote(asset[1]!.trim()) };
  const words = /^words:(\d+)$/.exec(t);
  if (words) return { kind: "words", upto: Number(words[1]) };

  return null;
}

/** Canonical serialized form — the `?scope=` param value (comma-join for several refs). */
export function serializeScope(scope: ScopeRef): string {
  switch (scope.kind) {
    case "version":
      return scope.section ? `v${scope.version} §${scope.section}` : `v${scope.version}`;
    case "section":
      return `section:${quoteIfNeeded(scope.ref)}`;
    case "selection":
      return "selection";
    case "outline":
      return "outline";
    case "review":
      return `review:v${scope.version}`;
    case "finding":
      return `finding:${scope.version != null ? `v${scope.version}/` : ""}${scope.ordinal}`;
    case "claim":
      return `claim:${scope.version != null ? `v${scope.version}/` : ""}${scope.ordinal}`;
    case "figure":
      return `figure:${quoteIfNeeded(scope.ref)}`;
    case "asset":
      return `asset:${quoteIfNeeded(scope.ref)}`;
    case "thread":
      return scope.ref ? `thread:${quoteIfNeeded(scope.ref)}` : "thread";
    case "words":
      return `words:${scope.upto}`;
  }
}

/** Inverse of `serializeScope` — parses one serialized scope ref back (round-trip). */
export function parseScopeRef(serialized: string): ScopeRef | null {
  const s = serialized.trim();
  const vSec = /^v(\d+)\s*§\s*(.+)$/i.exec(s);
  if (vSec) return { kind: "version", version: Number(vSec[1]), section: unquote(vSec[2]!.trim()) };
  return parseScopeToken(s);
}

/** Serialize a scope list for transport (`?scope=a,b` / `runs.scope` display). */
export function serializeScopes(scopes: readonly ScopeRef[]): string {
  return scopes.map(serializeScope).join(",");
}

/** Parse a `?scope=` value (comma-separated serialized refs). */
export function parseScopes(serialized: string | undefined): ScopeRef[] {
  if (!serialized) return [];
  return splitScopes(serialized)
    .map(parseScopeRef)
    .filter((s): s is ScopeRef => s != null);
}

/** The scope pill's rendered text — NEVER the `@`-raw or `--` spelling. */
export function scopeChip(scope: ScopeRef): string {
  switch (scope.kind) {
    case "version":
      return scope.section ? `v${scope.version} §${scope.section}` : `v${scope.version}`;
    case "section":
      return /^[ivxlcdmIVXLCDM0-9]+$/.test(scope.ref) ? `§${scope.ref}` : `§ “${scope.ref}”`;
    case "selection":
      return "Selection";
    case "outline":
      return "Outline";
    case "review":
      return `Review of v${scope.version}`;
    case "finding":
      return `Finding ${scope.version != null ? `v${scope.version}/` : ""}${scope.ordinal}`;
    case "claim":
      return `Claim ${scope.version != null ? `v${scope.version}/` : ""}${scope.ordinal}`;
    case "figure":
      return `Figure ${scope.ref}`;
    case "asset":
      return `Asset ${scope.ref}`;
    case "thread":
      return scope.ref ? `Thread ${scope.ref}` : "Thread";
    case "words":
      return `First ${scope.upto.toLocaleString("en-US")} words`;
  }
}

/** Split a serialized scope list on top-level commas (a quoted section ref may contain one). */
function splitScopes(s: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (const ch of s) {
    if (ch === '"') quoted = !quoted;
    if (ch === "," && !quoted) {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function unquote(s: string): string {
  return s.startsWith('"') && s.endsWith('"') && s.length >= 2 ? s.slice(1, -1) : s;
}

function quoteIfNeeded(s: string): string {
  return /^[A-Za-z0-9_./-]+$/.test(s) ? s : `"${s.replace(/"/g, "'")}"`;
}
