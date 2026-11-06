import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// R7KIT.2 (REQ-KIT-2; spec §4.6) — the no-inline-literal guard for the kit: a `style={…}` prop
// under `primitives/` may set ONLY CSS custom properties (`"--…"` keys — e.g. Skeleton's
// `--ui-skeleton-w`, Chip's `--ui-chip-fg`). Any spacing/type/colour/radius literal prop
// (fontSize, padding, color, borderRadius, width, …) fails this test — the value belongs in
// `uiCss()`. The scan reads the real sources, so the leg fails the moment a planted literal lands.

const DIR = dirname(fileURLToPath(import.meta.url));

function* sources(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* sources(p);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) yield p;
  }
}

const BANNED_KEY =
  /(?:^|["'`{\s,])(?:fontSize|fontFamily|fontWeight|fontStyle|lineHeight|letterSpacing|padding|paddingTop|paddingRight|paddingBottom|paddingLeft|margin|marginTop|marginRight|marginBottom|marginLeft|gap|rowGap|columnGap|borderRadius|borderTopLeftRadius|borderTopRightRadius|borderBottomLeftRadius|borderBottomRightRadius|borderWidth|borderColor|color|background|backgroundColor|outlineColor|width|height|minWidth|maxWidth|minHeight|maxHeight|top|left|right|bottom|inset|translate|size|aspectRatio)\s*:/;

describe("no inline spacing/type/colour/radius literals under primitives/ (REQ-KIT-2)", () => {
  it("style={…} props carry only `--` custom-property keys", () => {
    const offenders: string[] = [];
    for (const file of sources(DIR)) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(/style=\{\{([^]*?)\}\}/g)) {
        const body = m[1];
        const keys = [...body.matchAll(/([a-zA-Z_$][\w$]*|"[^"]+"|'[^']+')\s*:/g)].map((k) =>
          k[1].replace(/^["']|["']$/g, ""),
        );
        for (const key of keys) {
          if (!key.startsWith("--")) {
            offenders.push(`${file}: style prop sets "${key}:"`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no banned spacing/type/colour/radius literal property appears in a style object anywhere", () => {
    const offenders: string[] = [];
    for (const file of sources(DIR)) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(/style=\{\{([^]*?)\}\}/g)) {
        if (BANNED_KEY.test(m[1])) {
          offenders.push(`${file}: ${m[0].slice(0, 120)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
