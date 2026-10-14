import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { scanText } from "./check-no-cookies.mjs";

// SPA.8 / REQ-SAFE-3 + REQ-TST-4 (design/28 F3) — the never-cookies gate's rule set is pinned
// directly: the JSX brace-prop forms the old quote-only regex missed, the credential-prop shape,
// and the minified-bundle false positive (`password:!0` constant tables) that had to stay clean
// for the emitted-output targets to be scannable at all.

const hits = (text) => scanText(text).map((h) => h.what);

describe("credential constructs still fire (the gate's real job)", () => {
  it.each([
    // first-match wins: a credential WRITE's argument is a quoted credential literal, so these
    // fire under the header-literal rule — both labels denote the same violation.
    [`headers.set("cookie", "x=1")`, "credential-shaped header literal"],
    [`req.setHeader("x-api-key", k)`, "credential-shaped header literal"],
    [`const h = { "authorization": "Bearer x" }`, "credential-shaped header literal"],
    [`<input name="token" />`, "credential-shaped form-field name"],
    [`name="api_key"`, "credential-shaped form-field name"],
    [`{ apiKey: "k" }`, "credential-shaped field/property"],
    [`const c = { cookie: sessionVal }`, "credential-shaped field/property"],
  ])("%s → %s", (line, what) => {
    expect(hits(line)).toContain(what);
  });
});

describe("REQ-SAFE-3 — the JSX forms the old rules missed", () => {
  it("catches the brace-prop form name={\"token\"}", () => {
    expect(hits(`<input name={"token"} />`)).toContain("credential-shaped form-field name");
  });

  it("catches the template-literal form name={`token`}", () => {
    expect(hits(`<input name={\`token\`} />`)).toContain("credential-shaped form-field name");
  });

  it("catches a credential-named JSX prop inside a tag", () => {
    expect(hits(`<Connector password={pw} />`)).toContain("credential-named JSX prop");
    expect(hits(`<Connector apiKey="k" />`)).toContain("credential-named JSX prop");
    expect(hits(`<Connector secret="s" />`)).toContain("credential-named JSX prop");
  });

  it("catches a credential prop on a JSX continuation line (line-start anchor)", () => {
    expect(hits(`  access_token={tok}`)).toContain("credential-named JSX prop");
  });
});

describe("the documented non-violations stay clean", () => {
  it.each([
    `const secret = "the passphrase my notes carry";`, // assignment, not a prop
    `password:!0,range:!0,search:!0`, // react-dom's minified input-type table (emitted bundles)
    `credentials: "same-origin"`, // the viewer's own session — not a connector credential
    `// never-cookies: connectors accept no credential`,
    `name={fieldName}`, // genuinely dynamic — regex-blind by design (the BFF wire grammar is the layer)
    "name={`ov_${d.kind}`}", // the repo's dynamic-name idiom — values aren't literal
    `input[name="heldToken"]`, // a CSS selector for a non-credential name
  ])("clean: %s", (line) => {
    expect(hits(line)).toEqual([]);
  });
});

describe("the SPA.8 target extension is real (not vacuous)", () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  for (const rel of [
    "apps/web/src/spa",
    "apps/web/src/client",
    "packages/ui/src",
    "apps/web/src/client/landing.ts", // the pre-auth ingestion dropzone — unscanned before SPA.8
  ]) {
    it(`${rel} is present`, () => {
      expect(
        existsSync(join(root, rel)),
        `${rel} missing — a dropped target silently unscans a surface`,
      ).toBe(true);
    });
  }

  it("scans the real trees without a finding today (a regression lands as a hit, not a skipped dir)", () => {
    for (const rel of ["apps/web/src/spa", "apps/web/src/client", "packages/ui/src"]) {
      const files = readdirSync(join(root, rel), { recursive: true }).filter((f) =>
        /\.(ts|tsx|js|mjs|cjs)$/.test(String(f)),
      );
      expect(files.length, rel).toBeGreaterThan(0);
      for (const f of files) {
        const p = join(root, rel, String(f));
        const found = scanText(readFileSync(p, "utf8"));
        expect(found, `${p}: ${JSON.stringify(found)}`).toEqual([]);
      }
    }
  });
});
