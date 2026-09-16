// Bundle the editor client (PRB.07): src/client/editor.ts + CodeMirror → public/editor.js (iife, minified).
// The web server serves it at /assets/editor.js. `pnpm build` runs this after `tsc -b`; the output is a
// generated artifact (gitignored — a fresh checkout rebuilds it; without it the editor page degrades to the
// no-JS read-only view).

import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

await mkdir(new URL("public", import.meta.url), { recursive: true });

await build({
  entryPoints: [`${root}src/client/editor.ts`],
  bundle: true,
  format: "iife",
  minify: true,
  sourcemap: true,
  target: "es2022",
  outfile: `${root}public/editor.js`,
  // The bundle ships to browsers — it must never carry protocol/eval text (REQ-ARCH-33). The client sources
  // import only CodeMirror + the local sync machine; the protocol-marker check scans this artifact too.
  logLevel: "warning",
});

console.log("[web] client bundle → public/editor.js");
