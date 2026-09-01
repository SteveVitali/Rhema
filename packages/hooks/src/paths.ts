// @rhema/hooks — path classification (§12.6 tool layer).
//
// Resolve every path (lexical `..` + realpath through symlinks; Bash argv tokens included), reject escapes
// out of the mount roots, classify against the seat's readable/writable globs, and detect recursive
// operations over the root. Pure and deterministic: the realpath resolver is injected.

import type { MountRule, Namespace, SeatPolicy } from "./types.js";
import type { RealpathResolver } from "./realpath.js";
import { lexicalRealpath } from "./realpath.js";

// ---------- glob matching (only two forms are used: an exact path, or a `prefix/**` subtree) ----------

function escapeRe(s: string): string {
  return s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
}

/** Compile a mount glob to an anchored regex. `prefix/**` matches the prefix dir and everything under it. */
export function globToRegExp(glob: string): RegExp {
  if (glob.endsWith("/**")) {
    return new RegExp("^" + escapeRe(glob.slice(0, -3)) + "(?:/.*)?$");
  }
  // Support a single-segment `*` defensively; escapeRe leaves `*` intact for the replace below.
  return new RegExp("^" + escapeRe(glob).replace(/\*/g, "[^/]*") + "$");
}

/** True if the root-relative path `rel` matches `glob`. */
export function matchGlob(rel: string, glob: string): boolean {
  return globToRegExp(glob).test(rel);
}

// ---------- posix path normalization ----------

/** Normalize a posix path (collapse `.`/`..`, dedupe slashes); preserves a leading `/`. */
export function normalizePosix(p: string): string {
  const absolute = p.startsWith("/");
  const out: string[] = [];
  for (const seg of p.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (out.length && out[out.length - 1] !== "..") out.pop();
      else if (!absolute) out.push("..");
      // above an absolute root, `..` is discarded (can't go higher than `/`)
    } else out.push(seg);
  }
  return (absolute ? "/" : "") + out.join("/");
}

/** Resolve `p` against `root` when relative; normalize either way. */
export function resolveAgainst(root: string, p: string): string {
  return p.startsWith("/") ? normalizePosix(p) : normalizePosix(root + "/" + p);
}

/** True if `child` is `root` itself or lives under it. */
function isWithin(root: string, child: string): boolean {
  return child === root || child.startsWith(root.endsWith("/") ? root : root + "/");
}

// ---------- classification ----------

export interface PathClassification {
  /** The resolved absolute path (after `..` collapse + realpath). */
  readonly resolved: string;
  /** The matched mount rule, if the path is inside a mount. */
  readonly rule?: MountRule;
  /** The namespace of the matched rule, or `null` for an out-of-namespace path or an escape. */
  readonly namespace: Namespace | null;
  /** True if the path escaped every mount root (a symlink or `..` out of the sandbox). */
  readonly escaped: boolean;
}

function rootsOf(policy: SeatPolicy): { base: string }[] {
  const roots = [{ base: policy.roots.project }];
  if (policy.roots.persona) roots.push({ base: policy.roots.persona });
  return roots;
}

/**
 * Classify one path against the seat policy. Relative paths resolve against the project root. A path whose
 * realpath lands outside every mount root is an escape (`escaped: true`), the AC2 symlink/`..` case.
 */
export function classifyPath(
  inputPath: string,
  policy: SeatPolicy,
  resolveRealpath: RealpathResolver = lexicalRealpath,
): PathClassification {
  // Resolve symlinks on the UNCOLLAPSED path: collapsing `..` first would erase a symlink component that a
  // following `..` consumes, so a symlink-parent + `..` could slip past the resolver (the wall). Hand the
  // raw joined path to the resolver (realpathSync handles symlinks + `..` together), then normalize.
  const raw = inputPath.startsWith("/") ? inputPath : policy.roots.project + "/" + inputPath;
  const resolved = normalizePosix(resolveRealpath(raw));

  const containing = rootsOf(policy).find((r) => isWithin(r.base, resolved));
  if (!containing) return { resolved, namespace: null, escaped: true };

  const rel = resolved === containing.base ? "" : resolved.slice(containing.base.length + 1);
  const matches = policy.mounts.filter((m) => m.base === containing.base && matchGlob(rel, m.glob));
  // Prefer a writable match over a read-only one when both apply (they do not overlap today; defensive).
  const rule = matches.find((m) => m.mode === "readwrite") ?? matches[0];
  return { resolved, rule, namespace: rule ? rule.namespace : null, escaped: false };
}

// ---------- recursive-over-root ----------

/** True if a Glob/Grep search path targets a mount root itself (a recursive search over the root). */
export function searchTargetsRoot(searchPath: string | undefined, policy: SeatPolicy): boolean {
  const resolved = resolveAgainst(policy.roots.project, searchPath ?? ".");
  return rootsOf(policy).some((r) => resolved === r.base);
}

// ---------- Bash argv ----------

/** Tokenize a Bash command line, honoring single/double quotes; operators/redirections are dropped. */
export function tokenizeBash(command: string): string[] {
  const tokens: string[] = [];
  let cur = "";
  let quote: '"' | "'" | null = null;
  let has = false;
  const push = () => {
    if (has) tokens.push(cur);
    cur = "";
    has = false;
  };
  for (let i = 0; i < command.length; i++) {
    const c = command[i]!;
    if (quote) {
      if (c === quote) quote = null;
      else {
        cur += c;
        has = true;
      }
    } else if (c === '"' || c === "'") {
      quote = c;
      has = true; // an empty quoted string is still a token
    } else if (/\s/.test(c)) {
      push();
    } else if (c === "|" || c === "&" || c === ";" || c === "<" || c === ">" || c === "(" || c === ")") {
      push(); // a shell operator ends the current token and is itself dropped
    } else {
      cur += c;
      has = true;
    }
  }
  push();
  return tokens;
}

const RECURSIVE_CMDS = new Set(["find", "tree", "fd"]);

/**
 * Split a Bash command line into its sub-commands: the operator-separated segments (`;`, `|`, `&&`, `||`,
 * `&`) plus the bodies of command substitutions (`$(...)`, backticks). A recursive command hidden after a
 * pipe or inside a substitution (`echo hi; find /`) must be inspected too, not just the first word.
 */
export function splitBashCommands(command: string): string[] {
  const parts: string[] = [];
  const subst = /\$\(([^()]*)\)|`([^`]*)`/g;
  let m: RegExpExecArray | null;
  while ((m = subst.exec(command)) !== null) parts.push(m[1] ?? m[2] ?? "");
  const stripped = command.replace(subst, " ");
  for (const seg of stripped.split(/\|\||&&|[;|&\n]/)) {
    const s = seg.trim();
    if (s) parts.push(s);
  }
  return parts;
}

/** Path-like Bash tokens (contain a slash, or are a `.`/`~`/`..` reference); flags are excluded. */
export function bashPathTokens(command: string): string[] {
  return tokenizeBash(command).filter(
    (t) => !t.startsWith("-") && (t.includes("/") || t === "." || t === ".." || t.startsWith("~")),
  );
}

/** True if this single sub-command is a recursive search whose target is (or defaults to) a mount root. */
function oneCommandRecursiveOverRoot(cmdStr: string, policy: SeatPolicy): boolean {
  const tokens = tokenizeBash(cmdStr);
  if (tokens.length === 0) return false;
  const cmd = tokens[0]!;
  const flags = tokens.filter((t) => t.startsWith("-")).join("");
  const isRecursiveGrep = (cmd === "grep" || cmd === "rg" || cmd === "egrep") && /[rR]/.test(flags);
  const isRecursiveLs = cmd === "ls" && /R/.test(flags);
  const recursive = RECURSIVE_CMDS.has(cmd) || isRecursiveGrep || isRecursiveLs || cmd === "rg";
  if (!recursive) return false;
  const positional = tokens.slice(1).filter((t) => !t.startsWith("-"));
  // `grep`/`rg`/`egrep`: first positional is the pattern, the rest are search paths. `find`/`ls`/`tree`/`fd`:
  // every positional is a path. With no path, the search defaults to the cwd (a mount root).
  const searchPaths =
    cmd === "grep" || cmd === "rg" || cmd === "egrep" ? positional.slice(1) : positional;
  if (searchPaths.length === 0) return searchTargetsRoot(undefined, policy);
  return searchPaths.some((p) => searchTargetsRoot(p, policy));
}

/**
 * Detect a recursive Bash operation over a mount root in ANY sub-command: `find <root>`, `grep -r <root>`,
 * `ls -R`, `rg`, `tree`/`fd`, each also matched when hidden after an operator or in a substitution, and
 * each with no explicit path (defaults to the cwd root). Every positional search path is checked, not only
 * the last.
 */
export function bashRecursiveOverRoot(command: string, policy: SeatPolicy): boolean {
  return splitBashCommands(command).some((c) => oneCommandRecursiveOverRoot(c, policy));
}
