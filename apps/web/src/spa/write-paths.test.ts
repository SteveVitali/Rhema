// R7RELOAD.1 (REQ-RELOAD-2/3/4) — the engineered-half source censuses: they read the tree and
// fail on reintroduced `*_WRITE` grammars, `/edit/` write redirects, in-tree `reloadDocument:true`,
// or a POST handler outside `mutationOutcome` without a named exemption.

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const WEB_SRC = fileURLToPath(new URL("..", import.meta.url)); // apps/web/src
const SERVER = readFileSync(join(WEB_SRC, "server.ts"), "utf8");

/** every source file under a dir, recursively. */
function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...sources(p));
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) out.push(p);
  }
  return out;
}

describe("REQ-RELOAD-2 — one shared write allowlist", () => {
  it("no surface declares its own *_WRITE grammar — the shared module is the only one", () => {
    for (const file of sources(WEB_SRC)) {
      const text = readFileSync(file, "utf8");
      if (file.endsWith("write-paths.tsx")) continue;
      expect(text, file).not.toMatch(/\b[A-Z][A-Z0-9_]*_WRITE\s*=/);
    }
  });
});

describe("REQ-RELOAD-3 — redirect targets", () => {
  it("no server write response redirects to /edit/ (the route census)", () => {
    // every mutationOutcome/c.redirect target literal in server.ts must never carry /edit/
    const redirectTargets = [
      ...SERVER.matchAll(/mutationOutcome\(c,\s*\{[^}]*redirect:\s*([^,}]+)/gs),
      ...SERVER.matchAll(/c\.redirect\(\s*([^)]+)\)/g),
    ];
    for (const m of redirectTargets) {
      expect(m[1], `redirect target ${m[1]}`).not.toMatch(/\/edit\//);
    }
  });

  it("no reloadDocument:true remains under routes/_authenticated except the named list", () => {
    const NAMED = new Set([
      "_authenticated.tsx", // the 401 → /login leg
      "app.usage.r.$runId.tsx", // server-owned API passthrough stub
      "p.$project.edit.$draftId.tsx", // the old-bookmark stub
      "p.$project.f.$fid.tsx", // binary passthrough stub
    ]);
    const dir = join(WEB_SRC, "spa/routes/_authenticated");
    const walk = (d: string): string[] =>
      readdirSync(d, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)],
      );
    for (const file of walk(dir)) {
      if (!file.endsWith(".tsx")) continue;
      const name = file.split("/_authenticated/")[1]!;
      const has = readFileSync(file, "utf8").includes("reloadDocument: true");
      expect(has, `${name} reloadDocument`).toBe(NAMED.has(name));
    }
  });
});

describe("REQ-RELOAD-4 — mutationOutcome census over server.ts POST handlers", () => {
  /**
   * The named exemption list (the ticket's owned decision): handlers that can never see a
   * form post, or whose response is not an envelope-shaped outcome.
   */
  const EXEMPT: Readonly<Record<string, string>> = {
    "/signup": "funnel form — re-renders the signup document with the inline error, never raw JSON",
    "/login": "funnel form — re-renders the login document with the inline error",
    "/ide/theme": "JSON-only island write (no form posts it)",
    "/p/:project/paper-theme": "JSON-only island write",
    "/p/:project/edit/:draftId/save": "autosave/beacon — JSON + text/plain, never a form",
    "/p/:project/gates/:gid/activity": "presence ping — 204/empty-status, never a form",
    "/p/:project/export": "binary download — the form post IS the document stream",
    "/a/dwell": "anonymous telemetry beacon — JSON only",
    "/a/landing": "anonymous telemetry beacon — JSON only",
    "/a/acq": "anonymous telemetry beacon — JSON only",
    "/a/demo": "REQ-TOUR-9 metrics insert — JSON only",
    "/bff/settings/account/confirm-email": "/bff JSON-only twin — bffRoute-enveloped",
    "/bff/p/:slug/estimate": "/bff JSON-only twin — bffRoute-enveloped",
    "/bff/p/:slug/handoff": "/bff JSON-only twin — bffRoute-enveloped",
  };
  /** handler factories whose bodies route through mutationOutcome (resolved by name). */
  const FACTORIES = [
    "bffRoute(",
    "confirmEmailHandler",
    "projectHandoffHandler",
    "chatReply",
    "chatInvalid",
    "dispositionHandler",
    "findingActionHandler",
    "steerHandler",
    "billingBase(c)", // the billingPost trampoline — each billingPost("…") body's own arm
  ];

  it("every app.post answers through mutationOutcome or a named exemption", () => {
    const lines = SERVER.split("\n");
    const registrations: { line: number; path: string; body: string }[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (!/app\.post\(/.test(lines[i]!)) continue;
      // the handler body runs to the next app.<verb>( registration
      let j = i + 1;
      while (j < lines.length && !/app\.(get|post|put|delete|patch)\(/.test(lines[j]!)) j++;
      const seg = lines.slice(i, j).join("\n");
      const pm = seg.match(/app\.post\(\s*[`'"]([^`'"]+)/) ?? seg.match(/app\.post\(\s*([^\s,`'"]+)/);
      registrations.push({ line: i + 1, path: pm?.[1] ?? "?", body: seg });
    }
    const misses = registrations.filter(
      (r) =>
        !r.body.includes("mutationOutcome(") &&
        !FACTORIES.some((f) => r.body.includes(f)) &&
        !(r.path.startsWith("/bff/") || r.path.startsWith("$")) &&
        !(r.path in EXEMPT),
    );
    expect(misses.map((m) => `${m.line}:${m.path}`)).toEqual([]);
  });

  it("the named handler factories really do answer through mutationOutcome", () => {
    for (const factory of ["dispositionHandler", "findingActionHandler", "steerHandler", "chatReply", "chatInvalid"]) {
      const ix = SERVER.indexOf(`const ${factory}`);
      expect(ix, factory).toBeGreaterThan(-1);
      const seg = SERVER.slice(ix, ix + 4000);
      expect(seg, factory).toContain("mutationOutcome(");
    }
  });

  it("chat validation errors are stable codes — the prose strings are gone", () => {
    // the retired chat prose literals (245's errorCopy maps the codes below to sentences)
    for (const prose of [
      "threadId + message required",
      "threadId + action required",
      "threadId + summary required",
      "threadId + text required",
      "threadId required",
      "name required",
      "text required",
      "ref + replacement required",
      "quarantineKey + filename + mediaType required",
    ]) {
      expect(SERVER, prose).not.toContain(`error: "${prose}"`);
    }
    // and the codes that replaced them exist
    for (const code of [
      "chat_turn_required",
      "chat_action_required",
      "chat_name_required",
      "chat_pin_required",
      "chat_thread_required",
      "chat_correction_required",
      "chat_suggestion_required",
      "chat_note_required",
      "chat_attachment_required",
    ]) {
      expect(SERVER, code).toContain(code);
    }
  });
});
