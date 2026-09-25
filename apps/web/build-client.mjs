// Bundle the browser clients: src/client/editor.ts + ide.ts (P1.01) + page.ts (P1.02) → public/*.js (iife,
// minified), served at /assets/*.js. Also copies the self-hosted variable fonts (the @fontsource-variable
// OFL packages — Literata / Inter / JetBrains Mono, latin woff2) to public/fonts/ so themeCss()'s
// @font-face /assets/fonts/ URLs resolve. `pnpm build` runs this after `tsc -b`; outputs are generated
// artifacts (gitignored — a fresh checkout rebuilds them; without them the pages degrade to the no-JS
// SSR forms and the font stacks fall back).

import { build } from "esbuild";
import { mkdir, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

await mkdir(new URL("public", import.meta.url), { recursive: true });

for (const entry of ["editor", "ide", "page", "outline", "landing"]) {
  await build({
    entryPoints: [`${root}src/client/${entry}.ts`],
    bundle: true,
    format: "iife",
    minify: true,
    sourcemap: true,
    target: "es2022",
    outfile: `${root}public/${entry}.js`,
    // The bundles ship to browsers — they must never carry protocol/eval text (REQ-ARCH-33). The client
    // sources import only CodeMirror + @rhema/ide's pure pane/theme math; the protocol-marker check scans
    // these artifacts too.
    logLevel: "warning",
  });
  console.log(`[web] client bundle → public/${entry}.js`);
}

// The §5.9 fonts (REQ-IDE-39): variable woff2, latin subset — the same files themeCss()'s @font-face
// blocks declare. Copied from the installed Fontsource packages (pnpm layout-agnostic resolution via
// require.resolve of the package's CSS path, then the files/ sibling).
const FONTS = [
  ["@fontsource-variable/literata/standard.css", "literata-latin-standard-normal.woff2"],
  ["@fontsource-variable/literata/standard-italic.css", "literata-latin-standard-italic.woff2"],
  ["@fontsource-variable/inter/wght.css", "inter-latin-wght-normal.woff2"],
  ["@fontsource-variable/jetbrains-mono/wght.css", "jetbrains-mono-latin-wght-normal.woff2"],
];

await mkdir(new URL("public/fonts", import.meta.url), { recursive: true });
for (const [cssEntry, file] of FONTS) {
  const pkgDir = fileURLToPath(new URL(".", import.meta.resolve(cssEntry)));
  await copyFile(new URL(`files/${file}`, `file://${pkgDir}`), new URL(`public/fonts/${file}`, import.meta.url));
}
console.log("[web] fonts → public/fonts/");
